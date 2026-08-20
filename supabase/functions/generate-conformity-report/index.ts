// generate-conformity-report — relatorio de conformidade e tendencia em
// linguagem natural a partir do historico de ensaios da obra.
// Contrato em docs/FUNCTIONS.md.
import Anthropic from "npm:@anthropic-ai/sdk";

import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  HttpError,
  requireProductionManager,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";

// Modelos definidos em docs/ESTRUTURA.md: Haiku para o relatorio do dia a dia,
// Sonnet quando o gestor pede a analise mais profunda.
const MODEL_STANDARD = "claude-haiku-4-5";
const MODEL_DEEP = "claude-sonnet-4-6";

interface ResultRow {
  age_days: number;
  measured_fck: number;
  required_fck: number;
  is_conforming: boolean;
  test_date: string | null;
}

/** Tendencia comparando a folga media (medido - exigido) entre as metades. */
function computeTrend(results: ResultRow[]): "melhorando" | "estável" | "piorando" {
  const dated = results
    .filter((item) => item.test_date)
    .sort((a, b) => (a.test_date! < b.test_date! ? -1 : 1));

  if (dated.length < 4) return "estável";

  const half = Math.floor(dated.length / 2);
  const margin = (rows: ResultRow[]) =>
    rows.reduce((sum, row) => sum + (row.measured_fck - row.required_fck), 0) /
    rows.length;

  const delta = margin(dated.slice(half)) - margin(dated.slice(0, half));
  if (delta > 1) return "melhorando";
  if (delta < -1) return "piorando";
  return "estável";
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { site_id, period_start, period_end, depth } = await req.json();
    if (!site_id) throw new HttpError("site_id é obrigatório.");

    const { client: asUser } = await requireUser(req);
    await requireProductionManager(asUser, site_id);

    const service = serviceClient();

    let concretingsQuery = service
      .from("concretings")
      .select("id, title, concreting_date, status")
      .eq("site_id", site_id);
    if (period_start) concretingsQuery = concretingsQuery.gte("concreting_date", period_start);
    if (period_end) concretingsQuery = concretingsQuery.lte("concreting_date", period_end);

    const [{ data: concretings, error: concretingsError }, site, results, alerts] =
      await Promise.all([
        concretingsQuery,
        service.from("sites").select("name").eq("id", site_id).single(),
        service
          .from("strength_results")
          .select(
            "age_days, measured_fck, required_fck, is_conforming, test_date, test_reports!inner(site_id), pieces(name)",
          )
          .eq("test_reports.site_id", site_id),
        service
          .from("nonconformity_alerts")
          .select("age_days, measured_fck, required_fck, status")
          .eq("site_id", site_id),
      ]);

    if (concretingsError) throw new HttpError(concretingsError.message, 500);

    const resultRows = (results.data ?? []) as unknown as ResultRow[];
    const conforming = resultRows.filter((row) => row.is_conforming).length;
    const conformityRate =
      resultRows.length === 0 ? 1 : conforming / resultRows.length;

    const metrics = {
      total_concretings: (concretings ?? []).length,
      conformity_rate: Number(conformityRate.toFixed(4)),
      nonconformities: (alerts.data ?? []).length,
      trend: computeTrend(resultRows),
      total_results: resultRows.length,
      results_7d: resultRows.filter((row) => row.age_days === 7).length,
      results_28d: resultRows.filter((row) => row.age_days === 28).length,
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new HttpError(
        "ANTHROPIC_API_KEY não configurada nos secrets do Supabase.",
        500,
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const model = depth === "deep" ? MODEL_DEEP : MODEL_STANDARD;

    const message = await anthropic.messages.create({
      model,
      // Relatorio curto de propósito: é o resumo que o gestor lê na tela.
      max_tokens: depth === "deep" ? 4000 : 2000,
      system:
        "Você é engenheiro de controle tecnológico do concreto e escreve para o gestor de produção " +
        "de uma construtora brasileira. Escreva em português do Brasil, direto e sem jargão de IA. " +
        "Trabalhe apenas com os números fornecidos — nunca invente dados. Quando houver não " +
        "conformidade, diga com clareza o que ela significa para a obra e o que conferir a seguir.",
      messages: [
        {
          role: "user",
          content:
            `Escreva o relatório de conformidade da obra "${site?.data?.name ?? "obra"}"` +
            `${period_start ? ` no período de ${period_start} a ${period_end ?? "hoje"}` : ""}.\n\n` +
            `Dados apurados:\n${JSON.stringify(metrics, null, 2)}\n\n` +
            `Resultados de ensaio (fck medido x exigido, em MPa):\n` +
            `${JSON.stringify(resultRows.slice(0, 200), null, 2)}\n\n` +
            "Estruture em: (1) panorama do período; (2) conformidade dos ensaios de 7 e 28 dias; " +
            "(3) não conformidades e o que elas indicam; (4) tendência da resistência; " +
            "(5) recomendações objetivas. Use no máximo 400 palavras.",
        },
      ],
    });

    const reportText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n");

    return jsonResponse({ report_text: reportText, metrics, model });
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao gerar o relatório.",
      status,
    );
  }
});
