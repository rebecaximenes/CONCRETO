import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type {
  ElementVolumeProgress,
  StructuralElement,
} from "@/integrations/supabase/types";
import { errorMessage, formatFck, formatNumber } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";

/**
 * Cadastro das pecas estruturais da obra — a aba PROJETO da planilha.
 *
 * O fck e de cada peca (estacas, blocos, laje...), nao de um traco avulso:
 * e o projeto que define o fck de cada uma. O recebimento do caminhao
 * confere a nota de remessa contra o fck da peca da concretagem.
 *
 * Perda prevista (m³) e maximo a ser utilizado sao calculados pelo banco.
 * A tela mostra a mesma conta ao vivo para o usuario conferir antes de
 * salvar, mas nunca envia esses dois valores.
 */

type ElementForm = {
  id?: string;
  name: string;
  location: string;
  floor_level: string;
  fck_required: string;
  slump_target: string;
  supplier: string;
  placement_method: "bombeado" | "convencional";
  planned_volume_m3: string;
  waste_percent: string;
  drawing_sheet: string;
  drawing_revision: string;
  status: "nao_iniciado" | "andamento" | "concluido";
  notes: string;
};

const EMPTY_FORM: ElementForm = {
  name: "",
  location: "",
  floor_level: "",
  fck_required: "",
  slump_target: "",
  supplier: "",
  placement_method: "bombeado",
  planned_volume_m3: "",
  waste_percent: "30",
  drawing_sheet: "",
  drawing_revision: "",
  status: "nao_iniciado",
  notes: "",
};

const STATUS_LABEL: Record<ElementForm["status"], string> = {
  nao_iniciado: "Não iniciado",
  andamento: "Em andamento",
  concluido: "Ciclo finalizado",
};

/** Numero digitado com virgula ou ponto. */
function parseDecimal(value: string): number {
  return Number(value.replace(",", "."));
}

/** As mesmas contas das colunas H e I da planilha. */
function previewVolumes(volume: string, waste: string) {
  const planned = parseDecimal(volume);
  const percent = parseDecimal(waste);
  if (!Number.isFinite(planned) || !Number.isFinite(percent)) return null;
  // Multiplicar por 10 e dividir, e nao dividir por 0.1: o segundo devolve
  // 393.20000000000005 no lugar de 393,2.
  const wasteM3 = Math.round(((planned * percent) / 100) * 10) / 10;
  return { wasteM3, max: planned + wasteM3 };
}

export default function PecasEstruturais() {
  const { siteId = "" } = useParams();
  const { memberships } = useSite();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<ElementForm | null>(null);

  const membership = memberships.find((item) => item.siteId === siteId);
  const canManage = isProductionManager(membership?.siteRole);

  const elementsQuery = useQuery({
    queryKey: ["structural_elements", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<ElementVolumeProgress[]> => {
      const { data, error } = await supabase
        .from("element_volume_progress")
        .select("*")
        .eq("site_id", siteId)
        .order("location", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // A view traz os numeros calculados, mas nao as colunas de cadastro
  // (fornecedor, folha, revisao, observacoes). Sem elas o formulario de
  // edicao apagaria esses campos ao salvar.
  const rowsQuery = useQuery({
    queryKey: ["structural_elements", siteId, "rows"],
    enabled: Boolean(siteId) && canManage,
    queryFn: async (): Promise<StructuralElement[]> => {
      const { data, error } = await supabase
        .from("structural_elements")
        .select("*")
        .eq("site_id", siteId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveElement = useMutation({
    mutationFn: async (values: ElementForm) => {
      // planned_waste_m3 e max_volume_m3 sao colunas geradas: o banco recusa
      // qualquer valor enviado para elas.
      const payload = {
        site_id: siteId,
        name: values.name.trim(),
        location: values.location.trim(),
        floor_level: values.floor_level.trim() || null,
        fck_required: values.fck_required
          ? parseDecimal(values.fck_required)
          : null,
        slump_target: values.slump_target
          ? parseDecimal(values.slump_target)
          : null,
        supplier: values.supplier.trim() || null,
        placement_method: values.placement_method,
        planned_volume_m3: parseDecimal(values.planned_volume_m3),
        waste_percent: parseDecimal(values.waste_percent),
        drawing_sheet: values.drawing_sheet.trim() || null,
        drawing_revision: values.drawing_revision.trim() || null,
        status: values.status,
        notes: values.notes.trim() || null,
      };

      if (values.id) {
        const { error } = await supabase
          .from("structural_elements")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("structural_elements")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peça estrutural salva.");
      setForm(null);
      void queryClient.invalidateQueries({
        queryKey: ["structural_elements", siteId],
      });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível salvar a peça.")),
  });

  const deleteElement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("structural_elements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peça excluída.");
      void queryClient.invalidateQueries({
        queryKey: ["structural_elements", siteId],
      });
    },
    onError: (cause) =>
      toast.error(
        errorMessage(
          cause,
          // O banco recusa apagar peca com concretagem: seria perder o
          // historico de previsto x realizado dela.
          "Não foi possível excluir. Peças com concretagens registradas não podem ser removidas.",
        ),
      ),
  });

  const preview = form
    ? previewVolumes(form.planned_volume_m3, form.waste_percent)
    : null;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/obras">
          <ArrowLeft />
          Obras
        </Link>
      </Button>

      <PageHeader
        title="Peças estruturais"
        description={`Volume previsto, perda e fck de projeto de cada peça de ${
          membership?.site.name ?? "a obra"
        }.`}
        action={
          canManage ? (
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus />
              Nova peça
            </Button>
          ) : null
        }
      />

      {elementsQuery.isLoading ? (
        <LoadingRows />
      ) : elementsQuery.isError ? (
        <ErrorState
          message={errorMessage(
            elementsQuery.error,
            "Falha ao carregar as peças estruturais.",
          )}
          onRetry={() => void elementsQuery.refetch()}
        />
      ) : (elementsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma peça cadastrada"
          description="Cadastre as peças do projeto com o volume previsto para o site comparar previsto e realizado."
          action={
            canManage ? (
              <Button onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus />
                Nova peça
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {(elementsQuery.data ?? []).map((element) => (
            <Card key={element.structural_element_id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{element.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {element.location}
                      {element.floor_level ? ` · ${element.floor_level}` : ""}
                      {" · "}
                      {STATUS_LABEL[element.status]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatFck(element.fck_required)}
                      {element.slump_target
                        ? ` · slump ${formatNumber(element.slump_target, " cm")}`
                        : ""}
                      {" · "}
                      {element.placement_method === "bombeado"
                        ? "Bombeado"
                        : "Convencional"}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={rowsQuery.isLoading}
                        onClick={() => {
                          const row = (rowsQuery.data ?? []).find(
                            (item) => item.id === element.structural_element_id,
                          );
                          if (!row) {
                            toast.error(
                              "Não foi possível carregar o cadastro desta peça.",
                            );
                            return;
                          }
                          setForm({
                            id: row.id,
                            name: row.name,
                            location: row.location,
                            floor_level: row.floor_level ?? "",
                            fck_required:
                              row.fck_required === null
                                ? ""
                                : String(row.fck_required),
                            slump_target:
                              row.slump_target === null
                                ? ""
                                : String(row.slump_target),
                            supplier: row.supplier ?? "",
                            placement_method: row.placement_method,
                            planned_volume_m3: String(row.planned_volume_m3),
                            waste_percent: String(row.waste_percent),
                            drawing_sheet: row.drawing_sheet ?? "",
                            drawing_revision: row.drawing_revision ?? "",
                            status: row.status,
                            notes: row.notes ?? "",
                          });
                        }}
                      >
                        <Pencil />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Excluir a peça "${element.name}"?`)) {
                            deleteElement.mutate(element.structural_element_id);
                          }
                        }}
                      >
                        <Trash2 />
                        Excluir
                      </Button>
                    </div>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Previsto</dt>
                    <dd className="font-medium">
                      {formatNumber(element.planned_volume_m3, " m³")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Perda {formatNumber(element.waste_percent, "%")}
                    </dt>
                    <dd className="font-medium">
                      {formatNumber(element.planned_waste_m3, " m³")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Máximo</dt>
                    <dd className="font-medium">
                      {formatNumber(element.max_volume_m3, " m³")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Aplicado</dt>
                    <dd className="font-medium">
                      {formatNumber(element.realized_volume_m3, " m³")}
                    </dd>
                  </div>
                </dl>

                <div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      Math.min(element.progress_ratio ?? 0, 1) * 100,
                    )}
                    aria-label={`Avanço de ${element.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(
                          Math.max(element.progress_ratio ?? 0, 0),
                          1,
                        ) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {element.trucks_count} caminhões em{" "}
                    {element.concretings_count} concretagens · perda real{" "}
                    {formatNumber(element.trend_waste_percent, "%")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Editar peça estrutural" : "Nova peça estrutural"}
            </DialogTitle>
            <DialogDescription>
              O fck da peça é comparado com a nota de remessa no recebimento da
              betoneira.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveElement.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="element-name">Peça estrutural</Label>
                <Input
                  id="element-name"
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Estacas de fundação"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="element-location">Local</Label>
                  <Input
                    id="element-location"
                    required
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    placeholder="Fundação"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="element-floor">Pavimento</Label>
                  <Input
                    id="element-floor"
                    value={form.floor_level}
                    onChange={(event) =>
                      setForm({ ...form, floor_level: event.target.value })
                    }
                    placeholder="Subsolo"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="element-fck">fck exigido (MPa)</Label>
                  <Input
                    id="element-fck"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="1"
                    value={form.fck_required}
                    onChange={(event) =>
                      setForm({ ...form, fck_required: event.target.value })
                    }
                    placeholder="30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="element-slump">Slump de projeto (cm)</Label>
                  <Input
                    id="element-slump"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="1"
                    value={form.slump_target}
                    onChange={(event) =>
                      setForm({ ...form, slump_target: event.target.value })
                    }
                    placeholder="24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="element-method">Aplicação</Label>
                <Select
                  value={form.placement_method}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      placement_method: value as ElementForm["placement_method"],
                    })
                  }
                >
                  <SelectTrigger id="element-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bombeado">Bombeado</SelectItem>
                    <SelectItem value="convencional">Convencional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="element-volume">Volume previsto (m³)</Label>
                  <Input
                    id="element-volume"
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    value={form.planned_volume_m3}
                    onChange={(event) =>
                      setForm({ ...form, planned_volume_m3: event.target.value })
                    }
                    placeholder="1310,6410"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="element-waste">Perda prevista (%)</Label>
                  <Input
                    id="element-waste"
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={form.waste_percent}
                    onChange={(event) =>
                      setForm({ ...form, waste_percent: event.target.value })
                    }
                    placeholder="30"
                  />
                </div>
              </div>

              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {preview
                  ? `O sistema calcula: perda prevista ${formatNumber(
                      preview.wasteM3,
                      " m³",
                    )} · máximo a ser utilizado ${formatNumber(
                      preview.max,
                      " m³",
                    )}.`
                  : "Preencha o volume previsto e a perda para ver a perda em m³ e o máximo a ser utilizado."}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="element-sheet">Nº da folha</Label>
                  <Input
                    id="element-sheet"
                    value={form.drawing_sheet}
                    onChange={(event) =>
                      setForm({ ...form, drawing_sheet: event.target.value })
                    }
                    placeholder="SAL FUN LOC 002"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="element-revision">Revisão</Label>
                  <Input
                    id="element-revision"
                    value={form.drawing_revision}
                    onChange={(event) =>
                      setForm({ ...form, drawing_revision: event.target.value })
                    }
                    placeholder="6"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="element-supplier">Central de concreto</Label>
                <Input
                  id="element-supplier"
                  value={form.supplier}
                  onChange={(event) =>
                    setForm({ ...form, supplier: event.target.value })
                  }
                  placeholder="Lemix Concreto"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="element-status">Situação</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({ ...form, status: value as ElementForm["status"] })
                  }
                >
                  <SelectTrigger id="element-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_iniciado">Não iniciado</SelectItem>
                    <SelectItem value="andamento">Em andamento</SelectItem>
                    <SelectItem value="concluido">Ciclo finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="element-notes">Observações</Label>
                <Textarea
                  id="element-notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveElement.isPending}>
                  {saveElement.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
