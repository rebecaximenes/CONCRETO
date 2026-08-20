// export-spreadsheet — exporta o ciclo rastreavel das concretagens em planilha,
// substituindo o Excel alimentado a mao. Contrato em docs/FUNCTIONS.md.
//
// A planilha volta como binario em base64 (a alternativa prevista no contrato)
// em vez de URL assinada: os tres buckets do projeto sao de foto de NF, foto de
// lancamento e laudo — nenhum guarda exportacao, e inventar bucket sairia dos
// nomes canonicos de db/schemas.sql.
import * as XLSX from "npm:xlsx@0.18.5";

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  HttpError,
  requireProductionManager,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";

interface ExportRow {
  Concretagem: string;
  Data: string;
  Status: string;
  "Nota fiscal": string;
  Caminhão: string;
  "fck do traço (MPa)": number | string;
  "Slump (cm)": number | string;
  "Temperatura (°C)": number | string;
  "Peça especial": string;
  "Saída da central": string;
  "Chegada na obra": string;
  "Início da descarga": string;
  "Fim da descarga": string;
  Remessa: string;
  Peça: string;
  "fck da peça (MPa)": number | string;
  "Responsável técnico": string;
  "fck 7 dias (MPa)": number | string;
  "fck 28 dias (MPa)": number | string;
  Conformidade: string;
}

/** Horario no formato que a obra le, no fuso de Brasilia. */
function hourOf(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: "Em andamento",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { site_id, concreting_ids, period_start, period_end, format } =
      await req.json();
    if (!site_id) throw new HttpError("site_id é obrigatório.");

    const { client: asUser } = await requireUser(req);
    await requireProductionManager(asUser, site_id);

    const service = serviceClient();

    let query = service
      .from("concretings")
      .select(
        `id, title, concreting_date, status,
         truck_receipts(
           id, invoice_number, truck_number, fck_required, slump_value,
           temperature, is_special_piece, supplier_delivery_code,
           invoice_issued_at, site_arrival_at, discharge_start_at, discharge_end_at
         ),
         placement_records(
           truck_receipt_id,
           pieces(name, fck_required),
           profiles:responsible_tech_id(full_name)
         )`,
      )
      .eq("site_id", site_id)
      .order("concreting_date", { ascending: true });

    if (Array.isArray(concreting_ids) && concreting_ids.length > 0) {
      query = query.in("id", concreting_ids);
    } else {
      if (period_start) query = query.gte("concreting_date", period_start);
      if (period_end) query = query.lte("concreting_date", period_end);
    }

    const { data: concretings, error } = await query;
    if (error) throw new HttpError(error.message, 500);

    // Resultados de ensaio por recebimento, para casar 7 e 28 dias na linha.
    const { data: results } = await service
      .from("strength_results")
      .select(
        "truck_receipt_id, age_days, measured_fck, is_conforming, test_reports!inner(site_id)",
      )
      .eq("test_reports.site_id", site_id);

    const resultsByReceipt = new Map<
      string,
      { age_days: number; measured_fck: number; is_conforming: boolean }[]
    >();
    for (const result of results ?? []) {
      const key = result.truck_receipt_id;
      if (!key) continue;
      const list = resultsByReceipt.get(key) ?? [];
      list.push(result);
      resultsByReceipt.set(key, list);
    }

    const rows: ExportRow[] = [];

    for (const concreting of concretings ?? []) {
      const receipts = (concreting.truck_receipts ?? []) as unknown as {
        id: string;
        invoice_number: string;
        truck_number: string;
        fck_required: number;
        slump_value: number;
        temperature: number | null;
        is_special_piece: boolean;
        supplier_delivery_code: string | null;
        invoice_issued_at: string | null;
        site_arrival_at: string | null;
        discharge_start_at: string | null;
        discharge_end_at: string | null;
      }[];

      const placements = (concreting.placement_records ?? []) as unknown as {
        truck_receipt_id: string | null;
        pieces: { name: string; fck_required: number } | null;
        profiles: { full_name: string } | null;
      }[];

      if (receipts.length === 0) continue;

      for (const receipt of receipts) {
        const receiptResults = resultsByReceipt.get(receipt.id) ?? [];
        const at7 = receiptResults.find((item) => item.age_days === 7);
        const at28 = receiptResults.find((item) => item.age_days === 28);
        const linked = placements.filter(
          (placement) => placement.truck_receipt_id === receipt.id,
        );
        // Caminhao sem lancamento vinculado ainda vira linha: a planilha tem
        // que mostrar o recebimento mesmo antes da laje ser registrada.
        const targets = linked.length > 0 ? linked : [null];

        for (const placement of targets) {
          const conformity =
            receiptResults.length === 0
              ? "Aguardando ensaio"
              : receiptResults.every((item) => item.is_conforming)
                ? "Conforme"
                : "NÃO CONFORME";

          rows.push({
            Concretagem: concreting.title ?? "Sem título",
            Data: concreting.concreting_date,
            Status: STATUS_LABEL[concreting.status] ?? concreting.status,
            "Nota fiscal": receipt.invoice_number || "—",
            Caminhão: receipt.truck_number,
            "fck do traço (MPa)": receipt.fck_required,
            "Slump (cm)": receipt.slump_value,
            "Temperatura (°C)": receipt.temperature ?? "—",
            "Peça especial": receipt.is_special_piece ? "Sim" : "Não",
            "Saída da central": hourOf(receipt.invoice_issued_at),
            "Chegada na obra": hourOf(receipt.site_arrival_at),
            "Início da descarga": hourOf(receipt.discharge_start_at),
            "Fim da descarga": hourOf(receipt.discharge_end_at),
            Remessa: receipt.supplier_delivery_code ?? "—",
            Peça: placement?.pieces?.name ?? "—",
            "fck da peça (MPa)": placement?.pieces?.fck_required ?? "—",
            "Responsável técnico": placement?.profiles?.full_name ?? "—",
            "fck 7 dias (MPa)": at7?.measured_fck ?? "—",
            "fck 28 dias (MPa)": at28?.measured_fck ?? "—",
            Conformidade: conformity,
          });
        }
      }
    }

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Concretagens");

    const wantsCsv = format === "csv";
    const filename = `rastreconcreto-${new Date().toISOString().slice(0, 10)}.${
      wantsCsv ? "csv" : "xlsx"
    }`;

    if (wantsCsv) {
      return jsonResponse({
        filename,
        content_type: "text/csv;charset=utf-8",
        rows: rows.length,
        // BOM para o Excel abrir os acentos certos.
        file_base64: btoa(
          unescape(encodeURIComponent("﻿" + XLSX.utils.sheet_to_csv(sheet))),
        ),
      });
    }

    const buffer = XLSX.write(book, { type: "base64", bookType: "xlsx" });

    return jsonResponse({
      filename,
      content_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      rows: rows.length,
      file_base64: buffer,
    });
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao exportar a planilha.",
      status,
    );
  }
});
