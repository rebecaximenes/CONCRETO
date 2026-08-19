import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  Concreting,
  NonconformityAlert,
} from "@/integrations/supabase/types";

export interface DashboardData {
  /** Concretagens com `concreting_date` = hoje na obra ativa. */
  todayConcretings: Pick<
    Concreting,
    "id" | "title" | "status" | "concreting_date" | "created_at"
  >[];
  pendingApprovalCount: number;
  /** Ensaios de 7/28 dias ainda nao recebidos na obra ativa. */
  pendingTestsCount: number;
  openAlerts: Pick<
    NonconformityAlert,
    | "id"
    | "age_days"
    | "measured_fck"
    | "required_fck"
    | "status"
    | "created_at"
  >[];
  openAlertsCount: number;
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function useDashboard(siteId: string | null) {
  return useQuery({
    queryKey: ["dashboard", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<DashboardData> => {
      const site = siteId!;

      const [concretings, pendingApproval, pendingTests, alerts] =
        await Promise.all([
          supabase
            .from("concretings")
            .select("id, title, status, concreting_date, created_at")
            .eq("site_id", site)
            .eq("concreting_date", today())
            .order("created_at", { ascending: false }),
          supabase
            .from("concretings")
            .select("id", { count: "exact", head: true })
            .eq("site_id", site)
            .eq("status", "pending_approval"),
          supabase
            .from("pending_tests")
            .select(
              "id, truck_receipts!inner(id, concretings!inner(site_id))",
              { count: "exact", head: true },
            )
            .eq("is_received", false)
            .eq("truck_receipts.concretings.site_id", site),
          supabase
            .from("nonconformity_alerts")
            .select(
              "id, age_days, measured_fck, required_fck, status, created_at",
              { count: "exact" },
            )
            .eq("site_id", site)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      const failure =
        concretings.error ??
        pendingApproval.error ??
        pendingTests.error ??
        alerts.error;
      if (failure) throw failure;

      return {
        todayConcretings: concretings.data ?? [],
        pendingApprovalCount: pendingApproval.count ?? 0,
        pendingTestsCount: pendingTests.count ?? 0,
        openAlerts: alerts.data ?? [],
        openAlertsCount: alerts.count ?? 0,
      };
    },
  });
}
