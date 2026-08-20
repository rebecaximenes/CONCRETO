import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, ScanLine, Thermometer } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { ErrorState, LoadingRows } from "@/components/states";
import { useConcreting } from "@/hooks/use-concreting";
import { supabase } from "@/integrations/supabase/client";
import { newClientLocalId } from "@/lib/concreting";
import { errorMessage } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

const BUCKET = "invoice-photos";

export default function Recebimento() {
  const { concretingId = "" } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detail = useConcreting(concretingId);

  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [truckNumber, setTruckNumber] = React.useState("");
  const [mixId, setMixId] = React.useState<string>("");
  const [fck, setFck] = React.useState("");
  const [slump, setSlump] = React.useState("");
  const [isSpecial, setIsSpecial] = React.useState(false);
  const [temperature, setTemperature] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [reading, setReading] = React.useState(false);

  const siteId = detail.data?.site_id;

  const mixesQuery = useQuery({
    queryKey: ["concrete_mixes", siteId],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concrete_mixes")
        .select("id, name, fck_required, supplier")
        .eq("site_id", siteId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Grava o recebimento e, quando ha foto da NF, sobe a imagem e chama a
   * `extract-invoice-ocr` para preencher o numero da nota sozinha.
   */
  const save = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error("Concretagem sem obra.");

      const { data: receipt, error } = await supabase
        .from("truck_receipts")
        .insert({
          concreting_id: concretingId,
          invoice_number: invoiceNumber.trim(),
          truck_number: truckNumber.trim(),
          concrete_mix_id: mixId || null,
          fck_required: Number(fck),
          slump_value: Number(slump),
          is_special_piece: isSpecial,
          temperature: isSpecial && temperature ? Number(temperature) : null,
          received_by: profile!.id,
          client_local_id: newClientLocalId(),
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!photo) return { id: receipt.id, ocr: false };

      // Caminho SEMPRE começa pelo uuid da obra — as policies do bucket
      // decidem o acesso pela primeira pasta.
      const extension = photo.name.split(".").pop() ?? "jpg";
      const path = `${siteId}/${receipt.id}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, photo, { upsert: true, contentType: photo.type });
      if (uploadError) throw uploadError;

      const { error: pathError } = await supabase
        .from("truck_receipts")
        .update({ invoice_photo_path: path })
        .eq("id", receipt.id);
      if (pathError) throw pathError;

      setReading(true);
      const { error: ocrError } = await supabase.functions.invoke(
        "extract-invoice-ocr",
        { body: { truck_receipt_id: receipt.id, invoice_photo_path: path } },
      );
      setReading(false);

      return { id: receipt.id, ocr: !ocrError, ocrError };
    },
    onSuccess: (result) => {
      if (result.ocr) {
        toast.success("Recebimento salvo e nota fiscal lida pela IA.");
      } else if (photo) {
        toast.warning(
          "Recebimento salvo. A leitura automática da NF falhou — confira o número na tela da concretagem.",
        );
      } else {
        toast.success("Recebimento salvo.");
      }
      void queryClient.invalidateQueries({ queryKey: ["concreting", concretingId] });
      navigate(`/concretagens/${concretingId}`);
    },
    onError: (cause) => {
      setReading(false);
      toast.error(errorMessage(cause, "Não foi possível salvar o recebimento."));
    },
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
      <ErrorState message="Esta concretagem já foi aprovada e não aceita novos recebimentos." />
    );
  }

  const missingTemperature = isSpecial && temperature.trim() === "";

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
          <CardTitle>Recebimento do caminhão</CardTitle>
          <CardDescription>
            Fotografe a nota fiscal: a IA lê o número e preenche para você.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (missingTemperature) {
                toast.error("Peça especial exige a temperatura do concreto.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="foto-nf">Foto da nota fiscal</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="foto-nf"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
                  onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                />
                <Camera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe o número da NF em branco para a leitura automática preencher.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nf">Número da nota fiscal</Label>
              <Input
                id="nf"
                inputMode="numeric"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder={photo ? "A IA preenche pela foto" : "45231"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caminhao">Número do caminhão betoneira</Label>
              <Input
                id="caminhao"
                required
                value={truckNumber}
                onChange={(event) => setTruckNumber(event.target.value)}
                placeholder="BT-1042"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="traco">Traço recebido</Label>
              <Select
                value={mixId}
                onValueChange={(value) => {
                  setMixId(value);
                  const mix = (mixesQuery.data ?? []).find(
                    (item) => item.id === value,
                  );
                  if (mix) setFck(String(mix.fck_required));
                }}
              >
                <SelectTrigger id="traco">
                  <SelectValue placeholder="Selecione o traço" />
                </SelectTrigger>
                <SelectContent>
                  {(mixesQuery.data ?? []).map((mix) => (
                    <SelectItem key={mix.id} value={mix.id}>
                      {mix.name} — {mix.fck_required} MPa
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fck">fck do traço (MPa)</Label>
              <Input
                id="fck"
                required
                type="number"
                inputMode="decimal"
                step="0.5"
                min="1"
                value={fck}
                onChange={(event) => setFck(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slump">Slump test (cm)</Label>
              <Input
                id="slump"
                required
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={slump}
                onChange={(event) => setSlump(event.target.value)}
                placeholder="9.5"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="especial">Concreto de peça especial</Label>
                <p className="text-xs text-muted-foreground">
                  Só nesse caso a temperatura é obrigatória.
                </p>
              </div>
              <Switch
                id="especial"
                checked={isSpecial}
                onCheckedChange={setIsSpecial}
              />
            </div>

            {isSpecial ? (
              <div className="space-y-2">
                <Label htmlFor="temperatura" className="flex items-center gap-2">
                  <Thermometer className="size-4" aria-hidden />
                  Temperatura do concreto (°C)
                </Label>
                <Input
                  id="temperatura"
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  placeholder="27.5"
                />
              </div>
            ) : null}

            {reading ? (
              <Alert variant="info">
                <ScanLine />
                <AlertTitle>Lendo a nota fiscal</AlertTitle>
                <AlertDescription>
                  A IA está extraindo o número da NF da foto.
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Confirmar recebimento"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
