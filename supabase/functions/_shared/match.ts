// Casamento laudo <-> recebimento pelo numero da nota fiscal, a chave de
// vinculo do processo (docs/PROCESSO.md). Fica no _shared porque a Edge
// Function match-report-to-concreting e a extract-test-report usam o mesmo
// codigo — cada function so pode ter um Deno.serve.
import { HttpError, serviceClient } from "./supabase.ts";

export interface MatchResult {
  matched_truck_receipt_id: string | null;
  matched_piece_id: string | null;
  match_type: "unique" | "none" | "ambiguous";
}

/** Normaliza a NF para comparar: so digitos, sem zeros a esquerda. */
export function normalizeInvoice(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  return digits === "" ? value.trim().toLowerCase() : digits;
}

export async function matchReport(
  testReportId: string,
  invoiceNumber: string,
  siteId: string,
): Promise<MatchResult> {
  const service = serviceClient();
  const target = normalizeInvoice(invoiceNumber);

  const { data: receipts, error } = await service
    .from("truck_receipts")
    .select("id, invoice_number, concreting_id, concretings!inner(site_id)")
    .eq("concretings.site_id", siteId);

  if (error) throw new HttpError(error.message, 500);

  const candidates = (receipts ?? []).filter(
    (receipt) => normalizeInvoice(receipt.invoice_number ?? "") === target,
  );

  // Sem match ou com mais de um: o gestor resolve a mao em /laudos.
  if (candidates.length !== 1) {
    await service
      .from("test_reports")
      .update({
        invoice_number: invoiceNumber,
        extraction_status: "needs_review",
        matched_truck_receipt_id: null,
      })
      .eq("id", testReportId);

    return {
      matched_truck_receipt_id: null,
      matched_piece_id: null,
      match_type: candidates.length === 0 ? "none" : "ambiguous",
    };
  }

  const receipt = candidates[0];

  // A peca vem do lancamento na laje daquele caminhao; quando ha mais de uma,
  // nao da para escolher sozinho — o resultado fica sem peca.
  const { data: placements } = await service
    .from("placement_records")
    .select("piece_id")
    .eq("truck_receipt_id", receipt.id);

  const pieceIds = [...new Set((placements ?? []).map((row) => row.piece_id))];
  const matchedPieceId = pieceIds.length === 1 ? pieceIds[0] : null;

  await service
    .from("test_reports")
    .update({
      invoice_number: invoiceNumber,
      matched_truck_receipt_id: receipt.id,
    })
    .eq("id", testReportId);

  return {
    matched_truck_receipt_id: receipt.id,
    matched_piece_id: matchedPieceId,
    match_type: "unique",
  };
}
