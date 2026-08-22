// extract-invoice-ocr — le a foto da nota fiscal e preenche o numero da NF.
// Elimina a digitacao manual que hoje consome o tempo da planilha.
// Contrato em docs/FUNCTIONS.md.
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  HttpError,
  downloadAsBase64,
  isServiceRoleRequest,
  requireSiteMember,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";
import { extractFromDocument } from "../_shared/gemini.ts";

const BUCKET = "invoice-photos";

interface InvoiceExtraction {
  invoice_number: string | null;
  confidence: number;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const service = serviceClient();
  let receiptId: string | null = null;
  // So volta o status para 'failed' se a leitura chegou a comecar: uma
  // chamada sem permissao nao pode sujar o recebimento de outra pessoa.
  let ocrStarted = false;

  try {
    const body = await req.json();
    receiptId = body.truck_receipt_id ?? null;
    const photoPath: string | undefined = body.invoice_photo_path;

    if (!receiptId) throw new HttpError("truck_receipt_id é obrigatório.");

    // A foto que chega pela fila offline e processada por `sync-offline-batch`,
    // que chama esta funcao com a service role — ali nao ha sessao de usuario
    // para validar, e o vinculo com a obra ja foi conferido antes.
    const internalCall = isServiceRoleRequest(req);
    const asUser = internalCall ? null : (await requireUser(req)).client;

    const { data: receipt, error: receiptError } = await service
      .from("truck_receipts")
      .select(
        "id, invoice_number, invoice_photo_path, ocr_status, concreting_id, concretings!inner(site_id)",
      )
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      throw new HttpError("Recebimento não encontrado.", 404);
    }

    if (asUser) {
      const siteId = (receipt.concretings as unknown as { site_id: string })
        .site_id;
      await requireSiteMember(asUser, siteId);
    }

    // Numero digitado pelo tecnico manda: a IA nunca sobrescreve.
    const existing = (receipt.invoice_number ?? "").trim();
    if (existing !== "") {
      await service
        .from("truck_receipts")
        .update({ ocr_status: "done" })
        .eq("id", receiptId);

      return jsonResponse({
        truck_receipt_id: receiptId,
        invoice_number: existing,
        ocr_status: "done",
        confidence: 1,
        manual_override: true,
      });
    }

    const path = photoPath ?? receipt.invoice_photo_path;
    if (!path) throw new HttpError("Recebimento sem foto da nota fiscal.");

    ocrStarted = true;
    await service
      .from("truck_receipts")
      .update({ ocr_status: "processing" })
      .eq("id", receiptId);

    const { base64, mimeType } = await downloadAsBase64(service, BUCKET, path);

    const extraction = await extractFromDocument<InvoiceExtraction>({
      base64,
      mimeType,
      prompt:
        "Esta é a foto de uma nota fiscal de concreto usinado entregue em obra no Brasil. " +
        "Extraia o NÚMERO DA NOTA FISCAL (apenas os dígitos, sem a série, sem pontos e sem zeros à esquerda). " +
        "Se a imagem estiver ilegível ou o número não aparecer com clareza, devolva invoice_number nulo. " +
        "Em confidence, informe de 0 a 1 o quanto você confia na leitura.",
      schema: {
        type: "object",
        properties: {
          invoice_number: { type: "string", nullable: true },
          confidence: { type: "number" },
        },
        required: ["invoice_number", "confidence"],
      },
    });

    const number = (extraction.invoice_number ?? "").trim();
    const confident = number !== "" && extraction.confidence >= 0.6;

    if (!confident) {
      // Sem leitura confiavel, o campo fica para o tecnico preencher a mao.
      await service
        .from("truck_receipts")
        .update({ ocr_status: "failed" })
        .eq("id", receiptId);

      return jsonResponse({
        truck_receipt_id: receiptId,
        invoice_number: null,
        ocr_status: "failed",
        confidence: extraction.confidence ?? 0,
      });
    }

    await service
      .from("truck_receipts")
      .update({ invoice_number: number, ocr_status: "done" })
      .eq("id", receiptId);

    return jsonResponse({
      truck_receipt_id: receiptId,
      invoice_number: number,
      ocr_status: "done",
      confidence: extraction.confidence,
    });
  } catch (cause) {
    if (receiptId && ocrStarted) {
      await service
        .from("truck_receipts")
        .update({ ocr_status: "failed" })
        .eq("id", receiptId);
    }
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao ler a nota fiscal.",
      status,
    );
  }
});
