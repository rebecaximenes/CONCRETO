import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/states";
import { PlantaMarcada, type Marca, type Ponto } from "@/components/PlantaMarcada";
import { useConcreting } from "@/hooks/use-concreting";
import { supabase } from "@/integrations/supabase/client";
import type { DrawingLegend, SiteDrawing } from "@/integrations/supabase/types";
import { errorMessage, formatDate, formatNumber } from "@/lib/format";
import { nextMarkingColor } from "@/lib/marking-colors";
import { useAuth } from "@/providers/AuthProvider";

const BUCKET = "element-drawings";

/**
 * Mapa de rastreabilidade: onde cada caminhao foi aplicado.
 *
 * Substitui a planta impressa e pintada a mao. A diferenca que importa e que
 * aqui a legenda NAO e digitada: ela sai do proprio recebimento, entao a cor
 * na planta e a nota fiscal nunca podem discordar.
 */
export default function Mapa() {
  const { concretingId = "" } = useParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detail = useConcreting(concretingId);

  const [drawingId, setDrawingId] = React.useState("");
  const [receiptId, setReceiptId] = React.useState("");
  const [label, setLabel] = React.useState("");

  const siteId = detail.data?.site_id;

  const drawingsQuery = useQuery({
    queryKey: ["site_drawings", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<SiteDrawing[]> => {
      const { data, error } = await supabase
        .from("site_drawings")
        .select("*")
        .eq("site_id", siteId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const drawings = drawingsQuery.data ?? [];
  const drawing = drawings.find((item) => item.id === drawingId) ?? null;

  // O arquivo fica num bucket privado: precisa de link assinado para abrir.
  const fileQuery = useQuery({
    queryKey: ["drawing-file", drawing?.file_path],
    enabled: Boolean(drawing),
    // Uma hora cobre uma concretagem inteira sem renovar no meio da marcacao.
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(drawing!.file_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  /**
   * A legenda traz TODAS as marcacoes da planta, de qualquer dia e de
   * qualquer concretagem — reabrir a planta mostra o acumulado.
   */
  const legendQuery = useQuery({
    queryKey: ["drawing_legend", drawingId],
    enabled: Boolean(drawingId),
    queryFn: async (): Promise<DrawingLegend[]> => {
      const { data, error } = await supabase
        .from("drawing_legend")
        .select("*")
        .eq("drawing_id", drawingId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const legend = React.useMemo(
    () =>
      [...(legendQuery.data ?? [])].sort((a, b) =>
        `${a.marked_date ?? ""}${a.invoice_number ?? ""}`.localeCompare(
          `${b.marked_date ?? ""}${b.invoice_number ?? ""}`,
        ),
      ),
    [legendQuery.data],
  );

  const marks: Marca[] = React.useMemo(
    () =>
      legend.map((row) => ({
        id: row.mark_id,
        shape: row.shape,
        points: (row.points as unknown as Ponto[]) ?? [],
        radius: Number(row.radius),
        color: row.color,
        label: row.label,
      })),
    [legend],
  );

  /** Cor ja usada por esta entrega nesta planta, ou a proxima livre. */
  const colorFor = React.useCallback(
    (receipt: string) => {
      const existente = legend.find((row) => row.truck_receipt_id === receipt);
      if (existente) return existente.color;
      return nextMarkingColor(legend.map((row) => row.color));
    },
    [legend],
  );

  const receipts = detail.data?.truck_receipts ?? [];
  const receipt = receipts.find((item) => item.id === receiptId) ?? null;
  const pickingColor = receiptId ? colorFor(receiptId) : undefined;

  const marcar = useMutation({
    mutationFn: async (ponto: Ponto) => {
      if (!drawingId) throw new Error("Escolha a planta.");
      if (!receiptId) throw new Error("Escolha o caminhão.");
      const { error } = await supabase.from("drawing_marks").insert({
        drawing_id: drawingId,
        truck_receipt_id: receiptId,
        shape: "ponto",
        // O tipo Json do Postgrest nao aceita uma interface direto.
        points: [{ x: ponto.x, y: ponto.y }],
        color: colorFor(receiptId),
        label: label.trim() || null,
        created_by: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // O rotulo do trecho muda a cada estaca; o caminhao continua o mesmo.
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["drawing_legend", drawingId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível marcar a planta.")),
  });

  const desmarcar = useMutation({
    mutationFn: async (markId: string) => {
      const { error } = await supabase
        .from("drawing_marks")
        .delete()
        .eq("id", markId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcação removida.");
      void queryClient.invalidateQueries({ queryKey: ["drawing_legend", drawingId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível remover a marcação.")),
  });

  if (detail.isLoading) return <LoadingRows rows={3} />;
  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        message={errorMessage(detail.error, "Concretagem não encontrada.")}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/concretagens/${concretingId}`}>
          <ArrowLeft />
          Concretagem
        </Link>
      </Button>

      <PageHeader
        title="Mapa de rastreabilidade"
        description={`${detail.data.title ?? "Concretagem"} · ${formatDate(
          detail.data.concreting_date,
        )}${
          detail.data.structural_elements?.name
            ? ` · ${detail.data.structural_elements.name}`
            : ""
        }`}
      />

      {drawingsQuery.isLoading ? (
        <LoadingRows rows={2} />
      ) : drawings.length === 0 ? (
        <EmptyState
          title="Nenhuma planta cadastrada nesta obra"
          description="Cadastre a prancha do projeto para marcar onde cada caminhão foi aplicado."
          action={
            siteId ? (
              <Button asChild>
                <Link to={`/obras/${siteId}/plantas`}>Cadastrar planta</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="planta">Planta</Label>
                <Select value={drawingId} onValueChange={setDrawingId}>
                  <SelectTrigger id="planta">
                    <SelectValue placeholder="Escolha a planta" />
                  </SelectTrigger>
                  <SelectContent>
                    {drawings.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.revision ? ` (rev. ${item.revision})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="caminhao">Caminhão sendo aplicado</Label>
                <Select value={receiptId} onValueChange={setReceiptId}>
                  <SelectTrigger id="caminhao">
                    <SelectValue placeholder="Escolha o caminhão" />
                  </SelectTrigger>
                  <SelectContent>
                    {receipts.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        NF {item.invoice_number || "—"} · {item.truck_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {receipt ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: pickingColor }}
                      aria-hidden
                    />
                    Cor desta entrega na planta
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="trecho">Trecho (opcional)</Label>
                <Input
                  id="trecho"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="E346"
                />
                <p className="text-xs text-muted-foreground">
                  Como a obra escreve na legenda.
                </p>
              </div>
            </CardContent>
          </Card>

          {!drawingId ? (
            <EmptyState
              title="Escolha a planta"
              description="Ela abre com tudo que já foi marcado, de todas as concretagens."
            />
          ) : fileQuery.isLoading ? (
            <LoadingRows rows={4} />
          ) : fileQuery.isError ? (
            <ErrorState
              message={errorMessage(fileQuery.error, "Falha ao abrir a planta.")}
              onRetry={() => void fileQuery.refetch()}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <PlantaMarcada
                fileUrl={fileQuery.data!}
                marks={marks}
                pickingColor={pickingColor}
                onPick={
                  receiptId
                    ? (ponto) => marcar.mutate(ponto)
                    : undefined
                }
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Legenda da planta</p>
                {!receiptId ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Escolha o caminhão acima para poder marcar.
                  </p>
                ) : null}

                {legend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma marcação nesta planta ainda.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {legend.map((row) => (
                      <li
                        key={row.mark_id}
                        className="flex items-center justify-between gap-2 p-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="inline-block size-4 shrink-0 rounded-full border"
                            style={{ backgroundColor: row.color }}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="truncate">
                              {formatDate(row.marked_date)} · NF{" "}
                              {row.invoice_number ?? "—"}
                              {row.label ? ` · ${row.label}` : ""}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.truck_number ?? "—"}
                              {row.volume_m3
                                ? ` · ${formatNumber(row.volume_m3, " m³")}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover marcação"
                          disabled={desmarcar.isPending}
                          onClick={() => desmarcar.mutate(row.mark_id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
