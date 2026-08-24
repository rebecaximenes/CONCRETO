import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, MapPin, Plus, Trash2 } from "lucide-react";
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
import type { SiteDrawing } from "@/integrations/supabase/types";
import { errorMessage, formatDate } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";

const BUCKET = "element-drawings";

/**
 * Plantas de indicacao da obra.
 *
 * A planta e um documento da OBRA, com a nomenclatura da prancha, e nao um
 * anexo de uma peca: a mesma prancha atende varios dias e varias
 * concretagens. Cadastrada aqui uma vez, ela e escolhida no mapa de cada
 * concretagem e reabre sempre com tudo que ja foi marcado nela.
 */
export default function Plantas() {
  const { siteId = "" } = useParams();
  const { memberships } = useSite();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [sheetCode, setSheetCode] = React.useState("");
  const [revision, setRevision] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const membership = memberships.find((item) => item.siteId === siteId);
  const canManage = isProductionManager(membership?.siteRole);

  const drawingsQuery = useQuery({
    queryKey: ["site_drawings", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<(SiteDrawing & { marks: number })[]> => {
      const { data, error } = await supabase
        .from("site_drawings")
        .select("*, drawing_marks(count)")
        .eq("site_id", siteId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { drawing_marks, ...drawing } = row as unknown as SiteDrawing & {
          drawing_marks: { count: number }[] | null;
        };
        return { ...drawing, marks: drawing_marks?.[0]?.count ?? 0 };
      });
    },
  });

  function limpar() {
    setFile(null);
    setName("");
    setSheetCode("");
    setRevision("");
    setNotes("");
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Escolha o arquivo da planta.");
      // Caminho SEMPRE comeca pelo uuid da obra: e a primeira pasta que as
      // policies do bucket usam para decidir quem le.
      const extensao = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${siteId}/${crypto.randomUUID()}.${extensao}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/pdf" });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("site_drawings").insert({
        site_id: siteId,
        name: name.trim(),
        sheet_code: sheetCode.trim() || null,
        revision: revision.trim() || null,
        file_path: path,
        notes: notes.trim() || null,
        created_by: profile!.id,
      });
      if (error) {
        // O arquivo ja subiu; sem isto ele ficaria orfao no Storage.
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Planta cadastrada.");
      setOpen(false);
      limpar();
      void queryClient.invalidateQueries({ queryKey: ["site_drawings", siteId] });
    },
    onError: (cause) =>
      toast.error(
        errorMessage(
          cause,
          "Não foi possível cadastrar a planta. Já existe uma com esse nome nesta obra?",
        ),
      ),
  });

  const excluir = useMutation({
    mutationFn: async (drawing: SiteDrawing) => {
      const { error } = await supabase
        .from("site_drawings")
        .delete()
        .eq("id", drawing.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([drawing.file_path]);
    },
    onSuccess: () => {
      toast.success("Planta excluída.");
      void queryClient.invalidateQueries({ queryKey: ["site_drawings", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível excluir a planta.")),
  });

  const drawings = drawingsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/obras">
          <ArrowLeft />
          Obras
        </Link>
      </Button>

      <PageHeader
        title="Plantas de indicação"
        description={`Pranchas de ${
          membership?.site.name ?? "a obra"
        } usadas para marcar onde cada caminhão foi aplicado.`}
        action={
          canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Nova planta
            </Button>
          ) : null
        }
      />

      {drawingsQuery.isLoading ? (
        <LoadingRows />
      ) : drawingsQuery.isError ? (
        <ErrorState
          message={errorMessage(drawingsQuery.error, "Falha ao carregar as plantas.")}
          onRetry={() => void drawingsQuery.refetch()}
        />
      ) : drawings.length === 0 ? (
        <EmptyState
          title="Nenhuma planta cadastrada"
          description="Cadastre as pranchas do projeto. No mapa da concretagem você escolhe qual abrir para marcar."
          action={
            canManage ? (
              <Button onClick={() => setOpen(true)}>
                <Plus />
                Nova planta
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {drawings.map((drawing) => (
            <Card key={drawing.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{drawing.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {drawing.sheet_code ?? "sem folha"}
                      {drawing.revision ? ` · rev. ${drawing.revision}` : ""}
                      {" · "}
                      cadastrada em {formatDate(drawing.created_at)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {drawing.marks === 0
                        ? "Nenhuma marcação ainda"
                        : `${drawing.marks} ${
                            drawing.marks === 1 ? "marcação" : "marcações"
                          }`}
                    </p>
                  </div>
                </div>

                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={excluir.isPending}
                    onClick={() => {
                      const aviso =
                        drawing.marks > 0
                          ? `Excluir a planta "${drawing.name}"? As ${drawing.marks} marcações feitas nela também serão apagadas.`
                          : `Excluir a planta "${drawing.name}"?`;
                      if (window.confirm(aviso)) excluir.mutate(drawing);
                    }}
                  >
                    <Trash2 />
                    Excluir
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) limpar();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova planta de indicação</DialogTitle>
            <DialogDescription>
              Use a nomenclatura da prancha: é por ela que a equipe escolhe a
              planta na hora de marcar.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              salvar.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="planta-arquivo">Arquivo da planta (PDF)</Label>
              <Input
                id="planta-arquivo"
                type="file"
                accept="application/pdf"
                required
                className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
                onChange={(event) => {
                  const escolhido = event.target.files?.[0] ?? null;
                  setFile(escolhido);
                  // O nome do arquivo costuma ser a propria nomenclatura.
                  if (escolhido && !name) {
                    setName(escolhido.name.replace(/\.pdf$/i, ""));
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="planta-nome">Nomenclatura</Label>
              <Input
                id="planta-nome"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ESTACAS DE FUNDAÇÃO φ 60cm TRECHO 1"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="planta-folha">Nº da folha</Label>
                <Input
                  id="planta-folha"
                  value={sheetCode}
                  onChange={(event) => setSheetCode(event.target.value)}
                  placeholder="SAL FUN LOC 002"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planta-revisao">Revisão</Label>
                <Input
                  id="planta-revisao"
                  value={revision}
                  onChange={(event) => setRevision(event.target.value)}
                  placeholder="R06"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="planta-obs">Observações</Label>
              <Textarea
                id="planta-obs"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Enviando..." : "Cadastrar planta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
