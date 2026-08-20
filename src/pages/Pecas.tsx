import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Thermometer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
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

type Piece = Tables<"pieces">;

type PieceForm = {
  id?: string;
  name: string;
  fck_required: string;
  is_special: boolean;
  location_description: string;
};

const EMPTY_FORM: PieceForm = {
  name: "",
  fck_required: "",
  is_special: false,
  location_description: "",
};

export default function Pecas() {
  const { siteId = "" } = useParams();
  const { memberships } = useSite();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<PieceForm | null>(null);

  const membership = memberships.find((item) => item.siteId === siteId);
  const canManage = isProductionManager(membership?.siteRole);

  const piecesQuery = useQuery({
    queryKey: ["pieces", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<Piece[]> => {
      const { data, error } = await supabase
        .from("pieces")
        .select("*")
        .eq("site_id", siteId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const savePiece = useMutation({
    mutationFn: async (values: PieceForm) => {
      const payload = {
        site_id: siteId,
        name: values.name.trim(),
        fck_required: Number(values.fck_required),
        is_special: values.is_special,
        location_description: values.location_description.trim() || null,
      };

      if (values.id) {
        const { error } = await supabase
          .from("pieces")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("pieces").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peça salva.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["pieces", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível salvar a peça.")),
  });

  const deletePiece = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pieces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peça excluída.");
      void queryClient.invalidateQueries({ queryKey: ["pieces", siteId] });
    },
    onError: (cause) =>
      toast.error(
        errorMessage(
          cause,
          "Não foi possível excluir. Peças já usadas em lançamentos não podem ser removidas.",
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
        title="Peças"
        description={`Locais que podem ser concretados em ${membership?.site.name ?? "a obra"}.`}
        action={
          canManage ? (
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus />
              Nova peça
            </Button>
          ) : null
        }
      />

      <Alert variant="info">
        <Thermometer />
        <AlertDescription>
          O fck da peça é a referência do alerta de não conformidade quando o
          laudo chegar. Peça marcada como <strong>especial</strong> passa a exigir
          a temperatura do concreto no recebimento do caminhão.
        </AlertDescription>
      </Alert>

      {piecesQuery.isLoading ? (
        <LoadingRows />
      ) : piecesQuery.isError ? (
        <ErrorState
          message={errorMessage(piecesQuery.error, "Falha ao carregar as peças.")}
          onRetry={() => void piecesQuery.refetch()}
        />
      ) : (piecesQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma peça cadastrada"
          description="O técnico na laje escolhe a peça ao registrar cada lançamento."
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
          {(piecesQuery.data ?? []).map((piece) => (
            <Card key={piece.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {piece.name}
                    {piece.is_special ? (
                      <Badge variant="warning">Peça especial</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatFck(piece.fck_required)}
                    {piece.location_description
                      ? ` · ${piece.location_description}`
                      : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          id: piece.id,
                          name: piece.name,
                          fck_required: String(piece.fck_required),
                          is_special: piece.is_special,
                          location_description: piece.location_description ?? "",
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
                        if (window.confirm(`Excluir a peça "${piece.name}"?`)) {
                          deletePiece.mutate(piece.id);
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
            <DialogTitle>{form?.id ? "Editar peça" : "Nova peça"}</DialogTitle>
            <DialogDescription>
              Ex.: "Pilar P12", "Laje L3 — 3º pavimento".
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                savePiece.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="piece-name">Nome da peça</Label>
                <Input
                  id="piece-name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piece-fck">fck exigido (MPa)</Label>
                <Input
                  id="piece-fck"
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="1"
                  value={form.fck_required}
                  onChange={(event) =>
                    setForm({ ...form, fck_required: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piece-location">Localização</Label>
                <Input
                  id="piece-location"
                  value={form.location_description}
                  onChange={(event) =>
                    setForm({ ...form, location_description: event.target.value })
                  }
                  placeholder="3º pavimento, ala leste"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="piece-special">Peça especial</Label>
                  <p className="text-xs text-muted-foreground">
                    Exige registro de temperatura no recebimento.
                  </p>
                </div>
                <Switch
                  id="piece-special"
                  checked={form.is_special}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_special: checked })
                  }
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={savePiece.isPending}>
                  {savePiece.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
