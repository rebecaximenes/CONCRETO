// extract-invoice-ocr — le a foto da nota fiscal do concreto usinado.
//
// Dois modos:
//
//   1. PREVIA (body sem `truck_receipt_id`): le a foto e DEVOLVE os campos sem
//      gravar nada. E o modo que a tela de recebimento usa — o tecnico confere
//      cada campo na tela antes de registrar, e a conferencia da placa so faz
//      sentido se ele ja tiver o dado em maos.
//
//   2. GRAVACAO (body com `truck_receipt_id`): le e preenche o recebimento.
//      E o caminho da fila offline, que sobe a foto junto com o registro.
//
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InvoiceExtraction {
  invoice_number: string | null;
  truck_number: string | null;
  fck: number | null;
  volume_m3: number | null;
  confidence: number;
}

const PROMPT =
  "Esta é a foto de uma nota fiscal de concreto usinado entregue em obra no Brasil. " +
  "Extraia, quando aparecerem com clareza:\n" +
  "- invoice_number: o NÚMERO DA NOTA FISCAL (apenas dígitos, sem a série, sem pontos, sem zeros à esquerda).\n" +
  "- truck_number: a identificação do caminhão betoneira — a placa (formato ABC1D23 ou ABC-1234) " +
  "ou o número do equipamento/betoneira impresso na nota. Devolva sem espaços e sem hífen.\n" +
  "- fck: a resistência característica do concreto em MPa, apenas o número " +
  "(de textos como 'FCK 30', 'C30', '30 MPa').\n" +
  "- volume_m3: o volume entregue em metros cúbicos, apenas o número " +
  "(de textos como '8,00 M3', 'VOLUME 8 m³').\n" +
  "Devolva nulo em qualquer campo que não apareça ou esteja ilegível — nunca invente um valor. " +
  "Em confidence, informe de 0 a 1 o quanto você confia na leitura como um todo.";

const SCHEMA = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true },
    truck_number: { type: "string", nullable: true },
    fck: { type: "number", nullable: true },
    volume_m3: { type: "number", nullable: true },
    confidence: { type: "number" },
  },
  required: ["invoice_number", "confidence"],
};

/** Texto vazio conta como ausente. */
function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Numero so vale se for finito e positivo — a IA as vezes devolve 0. */
function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
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

    // A foto que chega pela fila offline e processada por `sync-offline-batch`,
    // que chama esta funcao com a service role — ali nao ha sessao de usuario
    // para validar, e o vinculo com a obra ja foi conferido antes.
    const internalCall = isServiceRoleRequest(req);
    const asUser = internalCall ? null : (await requireUser(req)).client;

    // ----- Modo previa: le a foto e devolve, sem gravar -----
    if (!receiptId) {
      if (!photoPath) {
        throw new HttpError(
          "Informe invoice_photo_path para ler a nota fiscal.",
        );
      }

      // O caminho no bucket sempre comeca pelo uuid da obra. E dele que sai a
      // permissao: sem isso qualquer usuario logado leria a foto de outra obra.
      const siteId = photoPath.split("/")[0];
      if (!UUID_RE.test(siteId)) {
        throw new HttpError("Caminho da foto fora do padrão da obra.", 400);
      }
      if (asUser) await requireSiteMember(asUser, siteId);

      const { base64, mimeType } = await downloadAsBase64(
        service,
        BUCKET,
        photoPath,
      );
      const extraction = await extractFromDocument<InvoiceExtraction>({
        base64,
        mimeType,
        prompt: PROMPT,
        schema: SCHEMA,
      });

      return jsonResponse({
        invoice_number: text(extraction.invoice_number),
        truck_number: text(extraction.truck_number),
        fck: positive(extraction.fck),
        volume_m3: positive(extraction.volume_m3),
        confidence: extraction.confidence ?? 0,
        invoice_photo_path: photoPath,
      });
    }

    // ----- Modo gravacao: preenche o recebimento existente -----
    const { data: receipt, error: receiptError } = await service
      .from("truck_receipts")
      .select(
        "id, invoice_number, truck_number, volume_m3, invoice_photo_path, ocr_status, concreting_id, concretings!inner(site_id)",
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
      prompt: PROMPT,
      schema: SCHEMA,
    });

    const number = text(extraction.invoice_number);
    const confident = number !== null && extraction.confidence >= 0.6;

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

    // O que o tecnico ja preencheu tem prioridade sobre a leitura.
    const volume = positive(extraction.volume_m3);
    const truck = text(extraction.truck_number);
    const update: Record<string, unknown> = {
      invoice_number: number,
      ocr_status: "done",
    };
    if (receipt.volume_m3 === null && volume !== null) {
      update.volume_m3 = volume;
    }
    if (!(receipt.truck_number ?? "").trim() && truck !== null) {
      update.truck_number = truck;
    }

    await service.from("truck_receipts").update(update).eq("id", receiptId);

    return jsonResponse({
      truck_receipt_id: receiptId,
      invoice_number: number,
      truck_number: truck,
      fck: positive(extraction.fck),
      volume_m3: volume,
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
