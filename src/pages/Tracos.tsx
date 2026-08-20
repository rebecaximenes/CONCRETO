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
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { errorMessage, formatFck } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";

type Mix = Tables<"concrete_mixes">;

type MixForm = {
  id?: string;
  name: string;
  fck_required: string;
  supplier: string;
  notes: string;
};

const EMPTY_FORM: MixForm = {
  name: "",
  fck_required: "",
  supplier: "",
  notes: "",
};

export default function Tracos() {
  const { siteId = "" } = useParams();
  const { memberships } = useSite();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<MixForm | null>(null);

  const membership = memberships.find((item) => item.siteId === siteId);
  const canManage = isProductionManager(membership?.siteRole);

  const mixesQuery = useQuery({
    queryKey: ["concrete_mixes", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<Mix[]> => {
      const { data, error } = await supabase
        .from("concrete_mixes")
        .select("*")
        .eq("site_id", siteId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveMix = useMutation({
    mutationFn: async (values: MixForm) => {
      const payload = {
        site_id: siteId,
        name: values.name.trim(),
        fck_required: Number(values.fck_required),
        supplier: values.supplier.trim() || null,
        notes: values.notes.trim() || null,
      };

      if (values.id) {
        const { error } = await supabase
          .from("concrete_mixes")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("concrete_mixes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Traço salvo.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["concrete_mixes", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível salvar o traço.")),
  });

  const deleteMix = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("concrete_mixes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Traço excluído.");
      void queryClient.invalidateQueries({ queryKey: ["concrete_mixes", siteId] });
    },
    onError: (cause) =>
      toast.error(
        errorMessage(
          cause,
          "Não foi possível excluir. Traços já usados em recebimentos não podem ser removidos.",
        ),
      ),
  });

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/obras">
          <ArrowLeft />
          Obras
        </Link>
      </Button>

      <PageHeader
        title="Traços"
        description={`Dosagens de concreto de ${membership?.site.name ?? "a obra"} e o fck de projeto de cada uma.`}
        action={
          canManage ? (
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus />
              Novo traço
            </Button>
          ) : null
        }
      />

      {mixesQuery.isLoading ? (
        <LoadingRows />
      ) : mixesQuery.isError ? (
        <ErrorState
          message={errorMessage(mixesQuery.error, "Falha ao carregar os traços.")}
          onRetry={() => void mixesQuery.refetch()}
        />
      ) : (mixesQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum traço cadastrado"
          description="O traço define o fck que o técnico confere no recebimento do caminhão."
          action={
            canManage ? (
              <Button onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus />
                Novo traço
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {(mixesQuery.data ?? []).map((mix) => (
            <Card key={mix.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{mix.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFck(mix.fck_required)}
                    {mix.supplier ? ` · ${mix.supplier}` : ""}
                  </p>
                  {mix.notes ? (
                    <p className="mt-1 text-sm text-muted-foreground">{mix.notes}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          id: mix.id,
                          name: mix.name,
                          fck_required: String(mix.fck_required),
                          supplier: mix.supplier ?? "",
                          notes: mix.notes ?? "",
                        })
                      }
                    >
                      <Pencil />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(`Excluir o traço "${mix.name}"?`)
                        ) {
                          deleteMix.mutate(mix.id);
                        }
                      }}
                    >
                      <Trash2 />
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar traço" : "Novo traço"}</DialogTitle>
            <DialogDescription>
              O fck exigido é copiado para o recebimento como referência do lote.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveMix.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="mix-name">Identificação do traço</Label>
                <Input
                  id="mix-name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="C30 bombeável"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mix-fck">fck exigido (MPa)</Label>
                <Input
                  id="mix-fck"
                  required
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
                <Label htmlFor="mix-supplier">Central de concreto</Label>
                <Input
                  id="mix-supplier"
                  value={form.supplier}
                  onChange={(event) =>
                    setForm({ ...form, supplier: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mix-notes">Observações</Label>
                <Textarea
                  id="mix-notes"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMix.isPending}>
                  {saveMix.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
