import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ErrorState, LoadingRows } from "@/components/states";
import { useConcreting } from "@/hooks/use-concreting";
import { supabase } from "@/integrations/supabase/client";
import { newClientLocalId } from "@/lib/concreting";
import { errorMessage } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

const BUCKET = "placement-photos";

export default function Lancamento() {
  const { concretingId = "" } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detail = useConcreting(concretingId);

  const [pieceId, setPieceId] = React.useState("");
  const [receiptId, setReceiptId] = React.useState("");
  const [responsibleId, setResponsibleId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photos, setPhotos] = React.useState<File[]>([]);

  const siteId = detail.data?.site_id;

  React.useEffect(() => {
    // Por padrao o proprio tecnico responde pelo lancamento.
    if (profile && !responsibleId) setResponsibleId(profile.id);
  }, [profile, responsibleId]);

  const piecesQuery = useQuery({
    queryKey: ["pieces", siteId],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pieces")
        .select("id, name, fck_required, is_special")
        .eq("site_id", siteId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const teamQuery = useQuery({
    queryKey: ["site-team", siteId],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_members")
        .select("profile_id, site_role, profiles!inner(id, full_name, is_active)")
        .eq("site_id", siteId!);
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.profiles as unknown as {
          id: string;
          full_name: string;
          is_active: boolean;
        })
        .filter((item) => item?.is_active);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: placement, error } = await supabase
        .from("placement_records")
        .insert({
          concreting_id: concretingId,
          piece_id: pieceId,
          truck_receipt_id: receiptId || null,
          responsible_tech_id: responsibleId,
          notes: notes.trim() || null,
          recorded_by: profile!.id,
          client_local_id: newClientLocalId(),
        })
        .select("id")
        .single();

      if (error) throw error;
      if (photos.length === 0) return placement.id;

      // Mesmo padrao do bucket de NF: <site_id>/<registro>/<arquivo>.
      const uploaded: { placement_record_id: string; storage_path: string }[] = [];
      for (const [index, file] of photos.entries()) {
        const extension = file.name.split(".").pop() ?? "jpg";
        const path = `${siteId}/${placement.id}/${index + 1}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;
        uploaded.push({ placement_record_id: placement.id, storage_path: path });
      }

      const { error: photoError } = await supabase
        .from("placement_photos")
        .insert(uploaded);
      if (photoError) throw photoError;

      return placement.id;
    },
    onSuccess: () => {
      toast.success("Lançamento registrado.");
      void queryClient.invalidateQueries({ queryKey: ["concreting", concretingId] });
      navigate(`/concretagens/${concretingId}`);
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível registrar o lançamento.")),
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

  if (detail.data.status === "approved") {
    return (
      <ErrorState message="Esta concretagem já foi aprovada e não aceita novos lançamentos." />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/concretagens/${concretingId}`}>
          <ArrowLeft />
          Concretagem
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Lançamento na laje</CardTitle>
          <CardDescription>
            Registre em que peça o concreto está sendo lançado e quem é o
            responsável técnico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pieceId) {
                toast.error("Selecione a peça concretada.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="peca">Peça concretada</Label>
              <Select value={pieceId} onValueChange={setPieceId}>
                <SelectTrigger id="peca">
                  <SelectValue placeholder="Selecione a peça" />
                </SelectTrigger>
                <SelectContent>
                  {(piecesQuery.data ?? []).map((piece) => (
                    <SelectItem key={piece.id} value={piece.id}>
                      {piece.name} — {piece.fck_required} MPa
                      {piece.is_special ? " (especial)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(piecesQuery.data ?? []).length === 0 && !piecesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma peça cadastrada nesta obra — peça ao gestor para cadastrar.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="caminhao-origem">Caminhão de origem</Label>
              <Select value={receiptId} onValueChange={setReceiptId}>
                <SelectTrigger id="caminhao-origem">
                  <SelectValue placeholder="Opcional — de qual caminhão veio" />
                </SelectTrigger>
                <SelectContent>
                  {detail.data.truck_receipts.map((receipt) => (
                    <SelectItem key={receipt.id} value={receipt.id}>
                      NF {receipt.invoice_number || "—"} · {receipt.truck_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                É esse vínculo que leva o resultado do laudo até a peça certa.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável técnico</Label>
              <Select value={responsibleId} onValueChange={setResponsibleId}>
                <SelectTrigger id="responsavel">
                  <SelectValue placeholder="Selecione o responsável" />
                </SelectTrigger>
                <SelectContent>
                  {(teamQuery.data ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fotos">Fotos do lançamento</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fotos"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
                  onChange={(event) =>
                    setPhotos(Array.from(event.target.files ?? []))
                  }
                />
                <Camera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              {photos.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {photos.length} foto(s) selecionada(s).
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex.: lançamento concluído às 14h, vibração conforme."
              />
            </div>

            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Registrar lançamento"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
