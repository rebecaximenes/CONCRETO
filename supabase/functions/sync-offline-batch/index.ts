// sync-offline-batch — recebe o lote criado offline no aparelho e grava de
// forma idempotente. A internet na frente de obra cai o tempo todo: reenviar o
// mesmo lote nao pode duplicar concretagem, recebimento nem lancamento.
// Contrato em docs/FUNCTIONS.md.
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  HttpError,
  requireSiteMember,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";

interface OfflineConcreting {
  client_local_id: string;
  site_id: string;
  title?: string | null;
  concreting_date?: string;
}

interface OfflineReceipt {
  client_local_id: string;
  /** Concretagem ja no servidor... */
  concreting_id?: string;
  /** ...ou ainda so no aparelho, criada no mesmo lote. */
  concreting_local_id?: string;
  invoice_number?: string;
  truck_number: string;
  concrete_mix_id?: string | null;
  fck_required: number;
  slump_value: number;
  temperature?: number | null;
  is_special_piece?: boolean;
  invoice_photo_path?: string | null;
}

interface OfflinePlacement {
  client_local_id: string;
  concreting_id?: string;
  concreting_local_id?: string;
  truck_receipt_id?: string | null;
  truck_receipt_local_id?: string | null;
  responsible_tech_id: string;
  placed_at?: string;
  notes?: string | null;
}

interface Conflict {
  client_local_id: string;
  entity: "concretings" | "truck_receipts" | "placement_records";
  reason: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { user, client: asUser } = await requireUser(req);
    const service = serviceClient();
    const body = await req.json();

    const concretings: OfflineConcreting[] = body.concretings ?? [];
    const receipts: OfflineReceipt[] = body.truck_receipts ?? [];
    const placements: OfflinePlacement[] = body.placement_records ?? [];

    const idMap: Record<string, string> = {};
    const conflicts: Conflict[] = [];
    const synced = { concretings: 0, truck_receipts: 0, placement_records: 0 };
    const now = new Date().toISOString();

    // Cache de obras ja validadas: um lote costuma ser todo da mesma obra.
    const checkedSites = new Map<string, boolean>();
    async function canAccess(siteId: string): Promise<boolean> {
      if (checkedSites.has(siteId)) return checkedSites.get(siteId)!;
      let allowed = true;
      try {
        await requireSiteMember(asUser, siteId);
      } catch {
        allowed = false;
      }
      checkedSites.set(siteId, allowed);
      return allowed;
    }

    // ---------- concretagens ----------
    for (const item of concretings) {
      if (!(await canAccess(item.site_id))) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "concretings",
          reason: "Usuário não é membro desta obra.",
        });
        continue;
      }

      const { data, error } = await service
        .from("concretings")
        .upsert(
          {
            site_id: item.site_id,
            title: item.title ?? null,
            concreting_date: item.concreting_date,
            created_by: user.id,
            client_local_id: item.client_local_id,
            synced_at: now,
          },
          { onConflict: "created_by,client_local_id" },
        )
        .select("id")
        .single();

      if (error) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "concretings",
          reason: error.message,
        });
        continue;
      }

      idMap[item.client_local_id] = data.id;
      synced.concretings += 1;
    }

    /** Resolve o pai: id do servidor ou id local mapeado agora. */
    function resolveConcreting(
      serverId: string | undefined,
      localId: string | undefined,
    ): string | null {
      if (serverId) return serverId;
      if (localId && idMap[localId]) return idMap[localId];
      return null;
    }

    // ---------- recebimentos ----------
    for (const item of receipts) {
      const concretingId = resolveConcreting(
        item.concreting_id,
        item.concreting_local_id,
      );

      if (!concretingId) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "truck_receipts",
          reason: "Concretagem de origem não encontrada no lote nem no servidor.",
        });
        continue;
      }

      const { data: parent } = await service
        .from("concretings")
        .select("site_id")
        .eq("id", concretingId)
        .single();

      if (!parent || !(await canAccess(parent.site_id))) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "truck_receipts",
          reason: "Usuário não é membro da obra desta concretagem.",
        });
        continue;
      }

      const { data, error } = await service
        .from("truck_receipts")
        .upsert(
          {
            concreting_id: concretingId,
            // O sync nao cobra completude: NF em branco fica para o OCR ou
            // para o técnico completar; a trava é na aprovação.
            invoice_number: item.invoice_number ?? "",
            truck_number: item.truck_number,
            concrete_mix_id: item.concrete_mix_id ?? null,
            fck_required: item.fck_required,
            slump_value: item.slump_value,
            temperature: item.temperature ?? null,
            is_special_piece: item.is_special_piece ?? false,
            invoice_photo_path: item.invoice_photo_path ?? null,
            received_by: user.id,
            client_local_id: item.client_local_id,
            synced_at: now,
          },
          { onConflict: "received_by,client_local_id" },
        )
        .select("id, invoice_photo_path, ocr_status")
        .single();

      if (error) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "truck_receipts",
          reason: error.message,
        });
        continue;
      }

      idMap[item.client_local_id] = data.id;
      synced.truck_receipts += 1;

      // Foto que subiu junto com o lote ainda precisa ser lida pela IA.
      if (data.invoice_photo_path && data.ocr_status === "pending") {
        await service.functions.invoke("extract-invoice-ocr", {
          body: {
            truck_receipt_id: data.id,
            invoice_photo_path: data.invoice_photo_path,
          },
        });
      }
    }

    // ---------- lancamentos ----------
    for (const item of placements) {
      const concretingId = resolveConcreting(
        item.concreting_id,
        item.concreting_local_id,
      );

      if (!concretingId) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "placement_records",
          reason: "Concretagem de origem não encontrada no lote nem no servidor.",
        });
        continue;
      }

      const { data: parent } = await service
        .from("concretings")
        .select("site_id")
        .eq("id", concretingId)
        .single();

      if (!parent || !(await canAccess(parent.site_id))) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "placement_records",
          reason: "Usuário não é membro da obra desta concretagem.",
        });
        continue;
      }

      const receiptId =
        item.truck_receipt_id ??
        (item.truck_receipt_local_id
          ? (idMap[item.truck_receipt_local_id] ?? null)
          : null);

      const { data, error } = await service
        .from("placement_records")
        .upsert(
          {
            concreting_id: concretingId,
            truck_receipt_id: receiptId,
            responsible_tech_id: item.responsible_tech_id,
            placed_at: item.placed_at,
            notes: item.notes ?? null,
            recorded_by: user.id,
            client_local_id: item.client_local_id,
            synced_at: now,
          },
          { onConflict: "recorded_by,client_local_id" },
        )
        .select("id")
        .single();

      if (error) {
        conflicts.push({
          client_local_id: item.client_local_id,
          entity: "placement_records",
          reason: error.message,
        });
        continue;
      }

      idMap[item.client_local_id] = data.id;
      synced.placement_records += 1;
    }

    return jsonResponse({ synced, id_map: idMap, conflicts });
  } catch (cause) {
    const status = cause instanceof HttpError ? cause.status : 500;
    return errorResponse(
      cause instanceof Error ? cause.message : "Erro ao sincronizar o lote.",
      status,
    );
  }
});
