import type { ConcretingStatus } from "@/integrations/supabase/types";

export const CONCRETING_STATUS_LABEL: Record<ConcretingStatus, string> = {
  in_progress: "Em andamento",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

export const CONCRETING_STATUS_VARIANT: Record<
  ConcretingStatus,
  "default" | "secondary" | "warning" | "success" | "destructive"
> = {
  in_progress: "secondary",
  pending_approval: "warning",
  approved: "success",
  rejected: "destructive",
};

/**
 * Id gerado no aparelho. Ja nasce em todo registro de campo para a
 * sincronizacao offline (`sync-offline-batch`) poder deduplicar depois.
 */
export function newClientLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
