import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Eye } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type { AlertStatus } from "@/integrations/supabase/types";
import { errorMessage, formatDateTime, formatFck } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";

const STATUS_LABEL: Record<AlertStatus, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  resolved: "Resolvido",
};

const STATUS_VARIANT: Record<AlertStatus, "destructive" | "warning" | "success"> = {
  open: "destructive",
  acknowledged: "warning",
  resolved: "success",
};

interface AlertRow {
  id: string;
  age_days: number;
  measured_fck: number;
  required_fck: number;
  status: AlertStatus;
  created_at: string;
  truck_receipts: {
    invoice_number: string;
    truck_number: string;
    concretings: {
      structural_elements: { name: string } | null;
    } | null;
  } | null;
}

export default function Alertas() {
  const { profile } = useAuth();
  const { activeSite, activeRole } = useSite();
  const queryClient = useQueryClient();

  const siteId = activeSite?.siteId ?? null;
  const canManage = isProductionManager(activeRole);

  const alertsQuery = useQuery({
    queryKey: ["alertas", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<AlertRow[]> => {
      const { data, error } = await supabase
        .from("nonconformity_alerts")
        .select(
          `id, age_days, measured_fck, required_fck, status, created_at,
           truck_receipts(
             invoice_number, truck_number,
             concretings(structural_elements(name))
           )`,
        )
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AlertRow[];
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (input: { id: string; status: AlertStatus }) => {
      const { error } = await supabase
        .from("nonconformity_alerts")
        .update({ status: input.status, acknowledged_by: profile!.id })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["alertas", siteId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível atualizar o alerta.")),
  });

  const rows = alertsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alertas de não conformidade"
        description="Abertos automaticamente quando o fck medido fica abaixo do exigido pela peça — aos 7 ou aos 28 dias."
      />

      {alertsQuery.isLoading ? (
        <LoadingRows />
      ) : alertsQuery.isError ? (
        <ErrorState
          message={errorMessage(alertsQuery.error, "Falha ao carregar os alertas.")}
          onRetry={() => void alertsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum alerta nesta obra"
          description="Todos os resultados recebidos até aqui atenderam o fck exigido."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle
                      className="size-4 text-destructive"
                      aria-hidden
                    />
                    {alert.truck_receipts?.concretings?.structural_elements?.name ??
                      "Peça não identificada"}
                    <Badge variant="outline">{alert.age_days} dias</Badge>
                  </div>
                  <p className="text-sm">
                    Medido{" "}
                    <strong className="text-destructive">
                      {formatFck(alert.measured_fck)}
                    </strong>{" "}
                    · exigido <strong>{formatFck(alert.required_fck)}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alert.truck_receipts
                      ? `NF ${alert.truck_receipts.invoice_number} · caminhão ${alert.truck_receipts.truck_number} · `
                      : ""}
                    {formatDateTime(alert.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[alert.status]}>
                    {STATUS_LABEL[alert.status]}
                  </Badge>
                  {canManage && alert.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changeStatus.isPending}
                      onClick={() =>
                        changeStatus.mutate({
                          id: alert.id,
                          status: "acknowledged",
                        })
                      }
                    >
                      <Eye />
                      Reconhecer
                    </Button>
                  ) : null}
                  {canManage && alert.status !== "resolved" ? (
                    <Button
                      size="sm"
                      disabled={changeStatus.isPending}
                      onClick={() =>
                        changeStatus.mutate({ id: alert.id, status: "resolved" })
                      }
                    >
                      <Check />
                      Resolver
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
