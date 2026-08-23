// evaluate-conformity — compara o fck medido com o exigido, abre o alerta de
// nao conformidade e baixa a pendencia do ensaio. Vale para 7 E 28 dias
// (docs/PROCESSO.md). Chamada com service role.
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { strength_result_id } = await req.json();
    if (!strength_result_id) {
      throw new HttpError("strength_result_id é obrigatório.");
    }

    const service = serviceClient();

    const { data: result, error } = await service
      .from("strength_results")
      .select(
        "id, test_report_id, truck_receipt_id, age_days, measured_fck, required_fck, is_conforming, test_reports!inner(site_id)",
      )
      .eq("id", strength_result_id)
      .single();

    if (error || !result) throw new HttpError("Resultado não encontrado.", 404);

    const siteId = (result.test_reports as unknown as { site_id: string }).site_id;
    const isConforming = result.measured_fck >= result.required_fck;

    // Baixa a pendencia do marco correspondente.
    if (result.truck_receipt_id) {
      await service
        .from("pending_tests")
        .update({ is_received: true, received_at: new Date().toISOString() })
        .eq("truck_receipt_id", result.truck_receipt_id)
        .eq("age_days", result.age_days)
        .eq("is_received", false);
    }

    if (isConforming) {
      return jsonResponse({
        strength_result_id,
        is_conforming: true,
        alert_created: false,
        nonconformity_alert_id: null,
      });
    }

    // O trigger do banco ja pode ter aberto o alerta: nao duplica.
    const { data: existing } = await service
      .from("nonconformity_alerts")
      .select("id")
      .eq("strength_result_id", result.id)
      .maybeSingle();

    let alertId = existing?.id ?? null;
    let created = false;

    if (!alertId) {
      const { data: alert, error: alertError } = await service
        .from("nonconformity_alerts")
        .insert({
          site_id: siteId,
          strength_result_id: result.id,
          truck_receipt_id: result.truck_receipt_id,
          age_days: result.age_days,
          measured_fck: result.measured_fck,
          required_fck: result.required_fck,
          severity: "high",
          status: "open",
        })
        .select("id")
        .single();

      if (alertError) throw new HttpError(alertError.message, 500);
      alertId = alert.id;
      created = true;

      await service.from("audit_log").insert({
        entity: "strength_results",
        entity_id: result.id,
        action: "alert",
        details: {
          nonconformity_alert_id: alertId,
          age_days: result.age_days,
          measured_fck: result.measured_fck,
          required_fck: result.required_fck,
        },
      });
    }

    await service.functions.invoke("notify-manager", {
      body: {
        event_type: "nonconformity",
        site_id: siteId,
        nonconformity_alert_id: alertId,
        truck_receipt_id: result.truck_receipt_id,
      },
    });

    return jsonResponse({
      strength_result_id,
      is_conforming: false,
      alert_created: created,
      nonconformity_alert_id: alertId,
    });
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao avaliar conformidade.",
      status,
    );
  }
});
