// notify-manager — avisa o gestor de producao por email (Resend): concretagem
// aguardando aprovacao, nao conformidade de fck e ensaio em atraso.
// Contrato em docs/FUNCTIONS.md. Service role.
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";

type EventType = "pending_approval" | "nonconformity" | "overdue_test";

interface NotifyBody {
  event_type: EventType;
  site_id: string;
  concreting_id?: string;
  nonconformity_alert_id?: string;
  truck_receipt_id?: string;
  test_report_id?: string;
  pending_test_id?: string;
}

const APP_URL = Deno.env.get("APP_URL") ?? "";
const FROM = Deno.env.get("RESEND_FROM") ?? "RastreConcreto <onboarding@resend.dev>";

function subjectFor(event: EventType, siteName: string) {
  switch (event) {
    case "pending_approval":
      return `[RastreConcreto] Concretagem aguardando aprovação — ${siteName}`;
    case "nonconformity":
      return `[RastreConcreto] Não conformidade de fck — ${siteName}`;
    case "overdue_test":
      return `[RastreConcreto] Ensaio em atraso — ${siteName}`;
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const body = (await req.json()) as NotifyBody;
    if (!body.event_type || !body.site_id) {
      throw new HttpError("event_type e site_id são obrigatórios.");
    }

    const service = serviceClient();

    const { data: site } = await service
      .from("sites")
      .select("name")
      .eq("id", body.site_id)
      .single();

    // Gestores daquela obra, apenas os ativos.
    const { data: managers, error } = await service
      .from("site_members")
      .select("profile_id, profiles!inner(email, full_name, is_active)")
      .eq("site_id", body.site_id)
      .eq("site_role", "production_manager");

    if (error) throw new HttpError(error.message, 500);

    const recipients = (managers ?? [])
      .map((row) => row.profiles as unknown as {
        email: string;
        full_name: string;
        is_active: boolean;
      })
      .filter((profile) => profile?.is_active && profile.email)
      .map((profile) => profile.email);

    if (recipients.length === 0) {
      return jsonResponse({ sent: false, reason: "Nenhum gestor ativo na obra." });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      throw new HttpError(
        "RESEND_API_KEY não configurada nos secrets do Supabase.",
        500,
      );
    }

    const siteName = site?.name ?? "obra";
    const details = await buildDetails(service, body);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: recipients,
        subject: subjectFor(body.event_type, siteName),
        html: details.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new HttpError(`Falha no envio do email: ${detail.slice(0, 300)}`, 502);
    }

    return jsonResponse({ sent: true, recipients, event_type: body.event_type });
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao notificar o gestor.",
      status,
    );
  }
});

async function buildDetails(
  service: ReturnType<typeof serviceClient>,
  body: NotifyBody,
): Promise<{ html: string }> {
  const link = (path: string) => (APP_URL ? `${APP_URL}${path}` : "");

  if (body.event_type === "nonconformity" && body.nonconformity_alert_id) {
    const { data: alert } = await service
      .from("nonconformity_alerts")
      .select("age_days, measured_fck, required_fck")
      .eq("id", body.nonconformity_alert_id)
      .single();

    return {
      html: paragraph(
        "Não conformidade de resistência",
        `O ensaio de <strong>${alert?.age_days ?? "?"} dias</strong> registrou
         <strong>${alert?.measured_fck ?? "?"} MPa</strong>, abaixo dos
         <strong>${alert?.required_fck ?? "?"} MPa</strong> exigidos pela peça.`,
        link("/alertas"),
        "Ver alertas",
      ),
    };
  }

  if (body.event_type === "pending_approval" && body.concreting_id) {
    const { data: concreting } = await service
      .from("concretings")
      .select("title, concreting_date")
      .eq("id", body.concreting_id)
      .single();

    return {
      html: paragraph(
        "Concretagem aguardando aprovação",
        `A concretagem <strong>${concreting?.title ?? "sem título"}</strong> de
         ${concreting?.concreting_date ?? ""} está pronta para sua revisão.`,
        link("/aprovacoes"),
        "Revisar concretagem",
      ),
    };
  }

  return {
    html: paragraph(
      "Ensaio em atraso",
      "Há ensaios de 7 ou 28 dias vencidos sem resultado recebido.",
      link("/pendencias"),
      "Ver pendências",
    ),
  };
}

function paragraph(title: string, text: string, url: string, cta: string) {
  const button = url
    ? `<p style="margin:24px 0"><a href="${url}"
         style="background:#732230;color:#fff;padding:12px 20px;border-radius:6px;
         text-decoration:none;font-weight:600">${cta}</a></p>`
    : "";

  return `<div style="font-family:Archivo,Arial,sans-serif;color:#1a1a1a;max-width:520px">
    <h2 style="color:#732230;margin:0 0 12px">${title}</h2>
    <p style="line-height:1.6;margin:0">${text}</p>
    ${button}
    <p style="color:#6b6b6b;font-size:12px;margin-top:24px">
      RastreConcreto — Construtora Record
    </p>
  </div>`;
}
