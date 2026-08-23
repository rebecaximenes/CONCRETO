import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, formatDate, formatFck, formatNumber } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";

interface PendingConcreting {
  id: string;
  title: string | null;
  concreting_date: string;
  truck_receipts: {
    id: string;
    invoice_number: string;
    truck_number: string;
    fck_required: number;
    slump_value: number;
    temperature: number | null;
    is_special_piece: boolean;
  }[];
  placement_records: { id: string }[];
  structural_elements: { name: string } | null;
}

export default function Aprovacoes() {
  const { activeSite, activeRole } = useSite();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = React.useState<PendingConcreting | null>(null);
  const [reason, setReason] = React.useState("");

  const siteId = activeSite?.siteId ?? null;
  const canApprove = isProductionManager(activeRole);

  const queueQuery = useQuery({
    queryKey: ["aprovacoes", siteId],
    enabled: Boolean(siteId) && canApprove,
    queryFn: async (): Promise<PendingConcreting[]> => {
      const { data, error } = await supabase
        .from("concretings")
        .select(
          `id, title, concreting_date,
           truck_receipts(id, invoice_number, truck_number, fck_required, slump_value, temperature, is_special_piece),
           placement_records(id),
           structural_elements(name)`,
        )
        .eq("site_id", siteId!)
        .eq("status", "pending_approval")
        .order("concreting_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingConcreting[];
    },
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      approve: boolean;
      reason?: string;
    }) => {
      // O RPC valida a completude do recebimento e grava a auditoria.
      const { error } = await supabase.rpc("approve_concreting", {
        concreting_id: input.id,
        p_approve: input.approve,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      toast.success(
        input.approve ? "Concretagem aprovada." : "Concretagem rejeitada.",
      );
      setRejecting(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["aprovacoes", siteId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível concluir a aprovação.")),
  });

  if (!canApprove) {
    return (
      <Alert variant="warning">
        <ShieldCheck />
        <AlertTitle>Área do gestor de produção</AlertTitle>
        <AlertDescription>
          Só o gestor de produção da obra aprova concretagem.
        </AlertDescription>
      </Alert>
    );
  }

  const rows = queueQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aprovações"
        description="Revise os dados conferidos em campo antes de aprovar a concretagem."
      />

      {queueQuery.isLoading ? (
        <LoadingRows />
      ) : queueQuery.isError ? (
        <ErrorState
          message={errorMessage(queueQuery.error, "Falha ao carregar a fila.")}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma concretagem aguardando aprovação"
          description="As concretagens aparecem aqui quando a equipe de campo envia para revisão."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const incomplete = row.truck_receipts.filter(
              (receipt) =>
                !receipt.invoice_number?.trim() ||
                !receipt.truck_number?.trim() ||
                receipt.slump_value === null ||
                receipt.fck_required === null ||
                (receipt.is_special_piece && receipt.temperature === null),
            );

            return (
              <Card key={row.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link
                        to={`/concretagens/${row.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.title ?? "Concretagem sem título"}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(row.concreting_date)} ·{" "}
                        {row.truck_receipts.length} recebimento(s) ·{" "}
                        {row.placement_records.length} lançamento(s)
                      </p>
                    </div>
                    <Badge variant="warning">Aguardando aprovação</Badge>
                  </div>

                  <ul className="space-y-1 text-sm">
                    {row.truck_receipts.map((receipt) => (
                      <li key={receipt.id} className="text-muted-foreground">
                        NF {receipt.invoice_number || "—"} · caminhão{" "}
                        {receipt.truck_number} · fck {formatFck(receipt.fck_required)}{" "}
                        · slump {formatNumber(receipt.slump_value, " cm")}
                        {receipt.is_special_piece
                          ? ` · temperatura ${formatNumber(receipt.temperature, " °C")}`
                          : ""}
                      </li>
                    ))}
                  </ul>

                  {incomplete.length > 0 ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        {incomplete.length} recebimento(s) incompleto(s). A aprovação
                        vai ser recusada até os campos obrigatórios serem preenchidos.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => decide.mutate({ id: row.id, approve: true })}
                      disabled={decide.isPending}
                    >
                      <Check />
                      Aprovar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRejecting(row)}
                      disabled={decide.isPending}
                    >
                      <X />
                      Rejeitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar concretagem</DialogTitle>
            <DialogDescription>
              O motivo fica registrado na auditoria para a equipe de campo corrigir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Input
              id="motivo"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Slump fora do especificado"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={decide.isPending}
              onClick={() =>
                rejecting &&
                decide.mutate({
                  id: rejecting.id,
                  approve: false,
                  reason: reason.trim() || undefined,
                })
              }
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
