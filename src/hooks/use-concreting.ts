import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ConcretingStatus, OcrStatus } from "@/integrations/supabase/types";

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
  profiles: { full_name: string } | null;
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
}

/** Detalhe completo da concretagem: recebimentos, lancamentos e fotos. */
export function useConcreting(concretingId: string | undefined) {
  return useQuery({
    queryKey: ["concreting", concretingId],
    enabled: Boolean(concretingId),
    queryFn: async (): Promise<ConcretingDetail> => {
      const { data, error } = await supabase
        .from("concretings")
        .select(
          `id, site_id, title, concreting_date, status, created_by, approved_at, approved_by,
           truck_receipts(
             id, invoice_number, truck_number, fck_required, slump_value, temperature,
             is_special_piece, invoice_photo_path, ocr_status, received_by, created_at,
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
      return data as unknown as ConcretingDetail;
    },
  });
}
