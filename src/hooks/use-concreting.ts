import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ConcretingStatus, OcrStatus } from "@/integrations/supabase/types";
import { listQueue } from "@/lib/offline-queue";

export interface ConcretingReceipt {
  id: string;
  invoice_number: string;
  truck_number: string;
  fck_required: number;
  slump_value: number;
  temperature: number | null;
  is_special_piece: boolean;
  invoice_photo_path: string | null;
  ocr_status: OcrStatus;
  received_by: string;
  created_at: string;
  invoice_issued_at: string | null;
  site_arrival_at: string | null;
  discharge_start_at: string | null;
  discharge_end_at: string | null;
  supplier_delivery_code: string | null;
  profiles: { full_name: string } | null;
  /** true enquanto o registro só existe no aparelho. */
  is_pending?: boolean;
}

export interface ConcretingPlacement {
  id: string;
  placed_at: string;
  notes: string | null;
  recorded_by: string;
  pieces: { name: string; fck_required: number; is_special: boolean } | null;
  truck_receipts: { invoice_number: string; truck_number: string } | null;
  profiles: { full_name: string } | null;
  placement_photos: { id: string; storage_path: string; caption: string | null }[];
  is_pending?: boolean;
}

export interface ConcretingDetail {
  id: string;
  site_id: string;
  title: string | null;
  concreting_date: string;
  status: ConcretingStatus;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
  truck_receipts: ConcretingReceipt[];
  placement_records: ConcretingPlacement[];
  /** true quando a própria concretagem ainda não subiu para o servidor. */
  is_local: boolean;
}

/**
 * Detalhe da concretagem juntando servidor e fila offline: o que foi
 * registrado sem internet aparece na tela marcado como pendente, em vez de
 * sumir até a sincronização.
 */
export function useConcreting(concretingId: string | undefined) {
  return useQuery({
    queryKey: ["concreting", concretingId],
    enabled: Boolean(concretingId),
    queryFn: async (): Promise<ConcretingDetail> => {
      const queue = await listQueue();
      const localConcreting = queue.find(
        (item) =>
          item.entity === "concretings" && item.client_local_id === concretingId,
      );

      const pendingReceipts = queue
        .filter(
          (item) =>
            item.entity === "truck_receipts" &&
            (item.payload.concreting_id === concretingId ||
              item.payload.concreting_local_id === concretingId),
        )
        .map((item): ConcretingReceipt => {
          const payload = item.payload as Record<string, never>;
          return {
            id: item.client_local_id,
            invoice_number: String(payload.invoice_number ?? ""),
            truck_number: String(payload.truck_number ?? ""),
            fck_required: Number(payload.fck_required ?? 0),
            slump_value: Number(payload.slump_value ?? 0),
            temperature:
              payload.temperature === null || payload.temperature === undefined
                ? null
                : Number(payload.temperature),
            is_special_piece: Boolean(payload.is_special_piece),
            invoice_photo_path: null,
            ocr_status: "pending",
            received_by: "",
            created_at: item.created_at,
            invoice_issued_at: (payload.invoice_issued_at as string) ?? null,
            site_arrival_at: (payload.site_arrival_at as string) ?? null,
            discharge_start_at: (payload.discharge_start_at as string) ?? null,
            discharge_end_at: null,
            supplier_delivery_code:
              (payload.supplier_delivery_code as string) ?? null,
            profiles: null,
            is_pending: true,
          };
        });

      const pendingPlacements = queue
        .filter(
          (item) =>
            item.entity === "placement_records" &&
            (item.payload.concreting_id === concretingId ||
              item.payload.concreting_local_id === concretingId),
        )
        .map((item): ConcretingPlacement => {
          const payload = item.payload as Record<string, never>;
          return {
            id: item.client_local_id,
            placed_at: String(payload.placed_at ?? item.created_at),
            notes: (payload.notes as string | null) ?? null,
            recorded_by: "",
            pieces: null,
            truck_receipts: null,
            profiles: null,
            placement_photos: [],
            is_pending: true,
          };
        });

      // Concretagem que ainda não subiu: monta o detalhe direto da fila.
      if (localConcreting) {
        const payload = localConcreting.payload as Record<string, never>;
        return {
          id: localConcreting.client_local_id,
          site_id: localConcreting.site_id,
          title: (payload.title as string | null) ?? null,
          concreting_date: String(payload.concreting_date ?? ""),
          status: "in_progress",
          created_by: "",
          approved_at: null,
          approved_by: null,
          truck_receipts: pendingReceipts,
          placement_records: pendingPlacements,
          is_local: true,
        };
      }

      const { data, error } = await supabase
        .from("concretings")
        .select(
          `id, site_id, title, concreting_date, status, created_by, approved_at, approved_by,
           truck_receipts(
             id, invoice_number, truck_number, fck_required, slump_value, temperature,
             is_special_piece, invoice_photo_path, ocr_status, received_by, created_at,
             invoice_issued_at, site_arrival_at, discharge_start_at, discharge_end_at,
             supplier_delivery_code,
             profiles:received_by(full_name)
           ),
           placement_records(
             id, placed_at, notes, recorded_by,
             pieces(name, fck_required, is_special),
             truck_receipts(invoice_number, truck_number),
             profiles:responsible_tech_id(full_name),
             placement_photos(id, storage_path, caption)
           )`,
        )
        .eq("id", concretingId!)
        .single();

      if (error) throw error;

      const detail = data as unknown as ConcretingDetail;
      return {
        ...detail,
        is_local: false,
        truck_receipts: [...detail.truck_receipts, ...pendingReceipts],
        placement_records: [...detail.placement_records, ...pendingPlacements],
      };
    },
  });
}
