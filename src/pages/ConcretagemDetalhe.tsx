import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Layers,
  Send,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/states";
import { useConcreting } from "@/hooks/use-concreting";
import { supabase } from "@/integrations/supabase/client";
import {
  CONCRETING_STATUS_LABEL,
  CONCRETING_STATUS_VARIANT,
} from "@/lib/concreting";
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFck,
  formatNumber,
  formatTime,
} from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

const OCR_LABEL: Record<string, string> = {
  pending: "NF aguardando leitura",
  processing: "Lendo a NF...",
  done: "NF lida",
  failed: "Leitura da NF falhou",
};

export default function ConcretagemDetalhe() {
  const { id = "" } = useParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detail = useConcreting(id);

  const sendToApproval = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("concretings")
        .update({ status: "pending_approval" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Concretagem enviada para aprovação do gestor.");
      void queryClient.invalidateQueries({ queryKey: ["concreting", id] });
      void queryClient.invalidateQueries({ queryKey: ["concretings"] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível enviar para aprovação.")),
  });

  if (detail.isLoading) return <LoadingRows rows={4} />;

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        message={errorMessage(detail.error, "Concretagem não encontrada.")}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const concreting = detail.data;
  const isLocked = concreting.status === "approved";
  const isOwner = concreting.created_by === profile?.id;
  const canSubmit = isOwner && concreting.status === "in_progress";

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/concretagens">
          <ArrowLeft />
          Concretagens
        </Link>
      </Button>

      <PageHeader
        title={concreting.title ?? "Concretagem sem título"}
        description={`${formatDate(concreting.concreting_date)} · ${
          concreting.truck_receipts.length
        } recebimento(s) · ${concreting.placement_records.length} lançamento(s)`}
        action={
          <Badge variant={CONCRETING_STATUS_VARIANT[concreting.status]}>
            {CONCRETING_STATUS_LABEL[concreting.status]}
          </Badge>
        }
      />

      {isLocked ? (
        <Alert variant="info">
          <CheckCircle2 />
          <AlertTitle>Concretagem aprovada</AlertTitle>
          <AlertDescription>
            Aprovada em {formatDateTime(concreting.approved_at)}. Recebimentos e
            lançamentos não aceitam mais edição.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild disabled={isLocked}>
          <Link to={`/recebimento/${concreting.id}`}>
            <Truck />
            Registrar recebimento
          </Link>
        </Button>
        <Button asChild variant="outline" disabled={isLocked}>
          <Link to={`/lancamento/${concreting.id}`}>
            <Layers />
            Registrar lançamento
          </Link>
        </Button>
        {canSubmit ? (
          <Button
            variant="secondary"
            onClick={() => sendToApproval.mutate()}
            disabled={
              sendToApproval.isPending || concreting.truck_receipts.length === 0
            }
            title={
              concreting.truck_receipts.length === 0
                ? "Registre ao menos um recebimento antes de enviar"
                : undefined
            }
          >
            <Send />
            Enviar para aprovação
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-4 text-muted-foreground" aria-hidden />
            Recebimentos de caminhão
          </CardTitle>
          <CardDescription>
            Nota fiscal, caminhão, slump e fck conferidos na chegada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {concreting.truck_receipts.length === 0 ? (
            <EmptyState
              title="Nenhum caminhão recebido ainda"
              description="O técnico de recebimento registra a NF, o caminhão e o slump na chegada."
              className="border-none shadow-none"
            />
          ) : (
            <ul className="divide-y">
              {concreting.truck_receipts.map((receipt) => (
                <li key={receipt.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      NF {receipt.invoice_number || "—"}
                    </span>
                    <Badge variant="outline">Caminhão {receipt.truck_number}</Badge>
                    {receipt.is_special_piece ? (
                      <Badge variant="warning">Peça especial</Badge>
                    ) : null}
                    <Badge
                      variant={
                        receipt.ocr_status === "done"
                          ? "success"
                          : receipt.ocr_status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {OCR_LABEL[receipt.ocr_status] ?? receipt.ocr_status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    fck {formatFck(receipt.fck_required)} · slump{" "}
                    {formatNumber(receipt.slump_value, " cm")}
                    {receipt.is_special_piece
                      ? ` · temperatura ${formatNumber(receipt.temperature, " °C")}`
                      : ""}
                  </p>
                  {receipt.invoice_issued_at ||
                  receipt.site_arrival_at ||
                  receipt.discharge_start_at ? (
                    <p className="text-sm text-muted-foreground">
                      Saída da central {formatTime(receipt.invoice_issued_at)} ·
                      chegada {formatTime(receipt.site_arrival_at)} · descarga{" "}
                      {formatTime(receipt.discharge_start_at)}
                      {receipt.discharge_end_at
                        ? ` até ${formatTime(receipt.discharge_end_at)} (${formatDuration(
                            receipt.discharge_start_at,
                            receipt.discharge_end_at,
                          )})`
                        : " · descarregando"}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {receipt.profiles?.full_name ?? "—"} ·{" "}
                    {formatDateTime(receipt.created_at)}
                    {receipt.supplier_delivery_code
                      ? ` · remessa ${receipt.supplier_delivery_code}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            Lançamentos na laje
          </CardTitle>
          <CardDescription>
            Em que peça cada caminhão foi lançado e quem foi o responsável técnico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {concreting.placement_records.length === 0 ? (
            <EmptyState
              title="Nenhum lançamento registrado"
              description="O técnico na laje registra a peça conforme o concreto avança."
              className="border-none shadow-none"
            />
          ) : (
            <ul className="divide-y">
              {concreting.placement_records.map((placement) => (
                <li key={placement.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {placement.pieces?.name ?? "Peça removida"}
                    </span>
                    {placement.pieces ? (
                      <Badge variant="outline">
                        exige {formatFck(placement.pieces.fck_required)}
                      </Badge>
                    ) : null}
                    {placement.truck_receipts ? (
                      <Badge variant="secondary">
                        NF {placement.truck_receipts.invoice_number}
                      </Badge>
                    ) : null}
                    {placement.placement_photos.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ImageIcon className="size-3" aria-hidden />
                        {placement.placement_photos.length} foto(s)
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Responsável técnico: {placement.profiles?.full_name ?? "—"}
                  </p>
                  {placement.notes ? (
                    <p className="text-sm text-muted-foreground">{placement.notes}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(placement.placed_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
