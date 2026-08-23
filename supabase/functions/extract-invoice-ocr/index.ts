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
  /** Saida da usina no impresso = emissao da NF, o primeiro dos horarios. */
  saida_usina: string | null;
  confidence: number;
}

// O documento que a obra recebe nao e uma nota fiscal comum: e o
// "COMPROVANTE DE SERVICO DE CONCRETAGEM" da concreteira, um formulario
// impresso com rotulos proprios. O prompt cita os rotulos reais porque a
// leitura generica confundia a placa com o nome do motorista.
const PROMPT =
  "Esta é a foto de um COMPROVANTE DE SERVIÇO DE CONCRETAGEM de concreto usinado " +
  "entregue em obra no Brasil (pode vir da concreteira LE MIX). É um formulário " +
  "impresso com campos rotulados. Extraia:\n" +
  "- invoice_number: o número do documento, no campo rotulado \"Nº\" no canto " +
  "superior direito (e repetido no rodapé). Vem no formato \"015.545\" — devolva " +
  "apenas os dígitos, sem o ponto e sem os zeros à esquerda: \"15545\".\n" +
  "- truck_number: a PLACA do caminhão, no bloco \"DADOS DE TRANSPORTE\", campo " +
  "rotulado \"PLACA\". Vem como \"RGS-8D94\" — devolva sem hífen e sem espaços: " +
  "\"RGS8D94\". Se a PLACA não aparecer, use o campo \"BETONEIRA\". Nunca use o " +
  "campo \"REMOTORISTA\" nem o nome do motorista.\n" +
  "- fck: a resistência em MPa, no campo \"FCK\" da linha \"Materiais adquiridos " +
  "para preparo e aplicação de\". Aparece como \"FCK 30,0 MPA\" — devolva 30. " +
  "Também pode aparecer na descrição do serviço como \"FCK 30,0 B0 ST 240\".\n" +
  "- volume_m3: o volume em metros cúbicos, no campo \"QUANT.\" do bloco \"DADOS DO " +
  "SERVIÇO\" (unidade \"M3\"), ou na mesma linha \"Materiais adquiridos para preparo " +
  "e aplicação de 8,0 M3\". Vem com vírgula decimal: \"8,0\" — devolva 8.\n" +
  "- saida_usina: o horário de saída da usina, no campo \"SAÍDA USINA\" do bloco " +
  "\"DADOS DE TRANSPORTE\", ou no campo \"HORA DA SAÍDA\" do cabeçalho. " +
  "Formato \"HH:MM\", ex.: \"11:00\".\n" +
  "ATENÇÃO aos campos que costumam vir EM BRANCO no impresso porque são " +
  "preenchidos à mão na obra: \"CHEGADA OBRA\", \"INÍCIO DESCARGA\", \"FIM " +
  "DESCARGA\", \"SAÍDA OBRA\", \"CHEGADA USINA\". Se estiverem vazios, devolva " +
  "nulo — não invente.\n" +
  "Devolva nulo em qualquer campo que não apareça ou esteja ilegível. " +
  "Em confidence, informe de 0 a 1 o quanto você confia na leitura como um todo.";

const SCHEMA = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true },
    truck_number: { type: "string", nullable: true },
    fck: { type: "number", nullable: true },
    volume_m3: { type: "number", nullable: true },
    saida_usina: { type: "string", nullable: true },
    confidence: { type: "number" },
  },
  required: ["invoice_number", "confidence"],
};

/** Texto vazio conta como ausente. */
function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** "9:00" vira "09:00"; qualquer coisa fora de HH:MM vira nulo. */
function clockTime(value: string | null | undefined): string | null {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
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
        saida_usina: clockTime(extraction.saida_usina),
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
      saida_usina: clockTime(extraction.saida_usina),
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
