// extract-test-report — le o PDF do laudo de ensaio, extrai NF, idade (7/28
// dias) e fck medido, e preenche a "planilha" sozinho. E o coracao da ideia:
// o gestor so envia o PDF (docs/PROCESSO.md).
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  HttpError,
  downloadAsBase64,
  requireProductionManager,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";
import { extractFromDocument } from "../_shared/gemini.ts";
import { matchReport } from "../_shared/match.ts";

const BUCKET = "test-reports";

interface ReportExtraction {
  invoice_number: string | null;
  results: {
    age_days: number;
    measured_fck: number;
    test_date: string | null;
  }[];
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const service = serviceClient();
  let reportId: string | null = null;
  // Idem extract-invoice-ocr: chamada sem permissao nao marca o laudo
  // como falho.
  let extractionStarted = false;

  try {
    const body = await req.json();
    reportId = body.test_report_id ?? null;
    const storagePath: string | undefined = body.storage_path;

    if (!reportId) throw new HttpError("test_report_id é obrigatório.");

    const { client: asUser } = await requireUser(req);

    const { data: report, error: reportError } = await service
      .from("test_reports")
      .select("id, site_id, storage_path, extraction_status")
      .eq("id", reportId)
      .single();

    if (reportError || !report) throw new HttpError("Laudo não encontrado.", 404);

    // So o gestor envia laudo (docs/PROCESSO.md).
    await requireProductionManager(asUser, report.site_id);

    extractionStarted = true;
    await service
      .from("test_reports")
      .update({ extraction_status: "processing" })
      .eq("id", reportId);

    const { base64, mimeType } = await downloadAsBase64(
      service,
      BUCKET,
      storagePath ?? report.storage_path,
    );

    const extraction = await extractFromDocument<ReportExtraction>({
      base64,
      mimeType: mimeType === "application/octet-stream" ? "application/pdf" : mimeType,
      prompt:
        "Este é um laudo/relatório de ensaio de resistência à compressão de corpos de prova de concreto, emitido por laboratório no Brasil. " +
        "Extraia: (1) o NÚMERO DA NOTA FISCAL do concreto citado no laudo (apenas dígitos, sem série nem zeros à esquerda); " +
        "(2) a lista de resultados de resistência, cada um com a idade do ensaio em dias, a resistência medida em MPa e a data do ensaio (AAAA-MM-DD). " +
        "Considere APENAS os marcos de 7 e 28 dias — ignore outras idades. " +
        "Quando houver mais de um corpo de prova na mesma idade, informe a média em MPa daquela idade, um único resultado por idade. " +
        "Se algum dado não aparecer no documento, devolva nulo no campo correspondente.",
      schema: {
        type: "object",
        properties: {
          invoice_number: { type: "string", nullable: true },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                age_days: { type: "integer" },
                measured_fck: { type: "number" },
                test_date: { type: "string", nullable: true },
              },
              required: ["age_days", "measured_fck"],
            },
          },
        },
        required: ["invoice_number", "results"],
      },
    });

    await service
      .from("test_reports")
      .update({ raw_extraction: extraction })
      .eq("id", reportId);

    const invoiceNumber = (extraction.invoice_number ?? "").trim();
    const results = (extraction.results ?? []).filter(
      (result) =>
        (result.age_days === 7 || result.age_days === 28) &&
        typeof result.measured_fck === "number" &&
        result.measured_fck > 0,
    );

    // Sem NF nao ha como vincular a concretagem: vai para revisao do gestor.
    if (invoiceNumber === "") {
      await service
        .from("test_reports")
        .update({ extraction_status: "needs_review" })
        .eq("id", reportId);

      return jsonResponse({
        test_report_id: reportId,
        invoice_number: null,
        extraction_status: "needs_review",
        results,
      });
    }

    const match = await matchReport(reportId, invoiceNumber, report.site_id);

    // O fck exigido e o da PEÇA concretada; sem peca resolvida, cai para o
    // fck do traco recebido (snapshot em truck_receipts.fck_required).
    let requiredFck: number | null = null;
    if (match.matched_piece_id) {
      const { data: piece } = await service
        .from("pieces")
        .select("fck_required")
        .eq("id", match.matched_piece_id)
        .single();
      requiredFck = piece?.fck_required ?? null;
    }
    if (requiredFck === null && match.matched_truck_receipt_id) {
      const { data: receipt } = await service
        .from("truck_receipts")
        .select("fck_required")
        .eq("id", match.matched_truck_receipt_id)
        .single();
      requiredFck = receipt?.fck_required ?? null;
    }

    if (results.length === 0 || requiredFck === null) {
      await service
        .from("test_reports")
        .update({ extraction_status: "needs_review" })
        .eq("id", reportId);

      return jsonResponse({
        test_report_id: reportId,
        invoice_number: invoiceNumber,
        extraction_status: "needs_review",
        results,
        match_type: match.match_type,
      });
    }

    // Reprocessar o mesmo laudo nao pode duplicar resultado.
    await service.from("strength_results").delete().eq("test_report_id", reportId);

    const { error: insertError } = await service.from("strength_results").insert(
      results.map((result) => ({
        test_report_id: reportId,
        truck_receipt_id: match.matched_truck_receipt_id,
        piece_id: match.matched_piece_id,
        age_days: result.age_days,
        measured_fck: result.measured_fck,
        required_fck: requiredFck,
        // O trigger set_conformity_flag recalcula este campo no banco.
        is_conforming: result.measured_fck >= requiredFck,
        test_date: result.test_date,
      })),
    );

    if (insertError) throw new HttpError(insertError.message, 500);

    const status = match.match_type === "unique" ? "done" : "needs_review";
    await service
      .from("test_reports")
      .update({ extraction_status: status })
      .eq("id", reportId);

    // O alerta de nao conformidade e a baixa da pendencia sao feitos pelo
    // trigger do banco; aqui so avisamos o gestor quando algo reprovou.
    const failing = results.filter((result) => result.measured_fck < requiredFck!);
    if (failing.length > 0) {
      await service.functions.invoke("notify-manager", {
        body: {
          event_type: "nonconformity",
          site_id: report.site_id,
          test_report_id: reportId,
          truck_receipt_id: match.matched_truck_receipt_id,
        },
      });
    }

    return jsonResponse({
      test_report_id: reportId,
      invoice_number: invoiceNumber,
      extraction_status: status,
      results,
      match_type: match.match_type,
    });
  } catch (cause) {
    if (reportId && extractionStarted) {
      await service
        .from("test_reports")
        .update({ extraction_status: "failed" })
        .eq("id", reportId);
    }
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao ler o laudo.",
      status,
    );
  }
});
