// match-report-to-concreting — expoe o casamento por nota fiscal como Edge
// Function. Contrato em docs/FUNCTIONS.md.
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { HttpError } from "../_shared/supabase.ts";
import { matchReport } from "../_shared/match.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { test_report_id, invoice_number, site_id } = await req.json();
    if (!test_report_id || !invoice_number || !site_id) {
      throw new HttpError(
        "test_report_id, invoice_number e site_id são obrigatórios.",
      );
    }

    return jsonResponse(
      await matchReport(test_report_id, invoice_number, site_id),
    );
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao casar o laudo.",
      status,
    );
  }
});
