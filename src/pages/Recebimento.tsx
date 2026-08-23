import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Clock,
  Loader2,
  ScanLine,
  Thermometer,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { CheckedField } from "@/components/CheckedField";
import { ErrorState, LoadingRows } from "@/components/states";
import { useConcreting } from "@/hooks/use-concreting";
import { useOnline } from "@/hooks/use-online";
import { supabase } from "@/integrations/supabase/client";
import { newClientLocalId } from "@/lib/concreting";
import { errorMessage, toTimestamp } from "@/lib/format";
import { enqueue } from "@/lib/offline-queue";
import { useAuth } from "@/providers/AuthProvider";
import { useSync } from "@/providers/SyncProvider";

const BUCKET = "invoice-photos";

export default function Recebimento() {
  const { concretingId = "" } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detail = useConcreting(concretingId);
  const online = useOnline();
  const { refreshQueue } = useSync();

  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [truckNumber, setTruckNumber] = React.useState("");
  const [fck, setFck] = React.useState("");
  const [volume, setVolume] = React.useState("");
  const [slump, setSlump] = React.useState("");
  // Conferencia: o tecnico marca cada campo depois de bater com a nota e com
  // o caminhao que chegou. Sem os quatro, o recebimento nao e registrado.
  const [checks, setChecks] = React.useState({
    invoice: false,
    truck: false,
    fck: false,
    volume: false,
  });
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  // Um id so para a tela: a foto sobe com ele antes do registro existir.
  const [clientLocalId] = React.useState(newClientLocalId);
  const [isSpecial, setIsSpecial] = React.useState(false);
  const [temperature, setTemperature] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [reading, setReading] = React.useState(false);
  // Horários da entrega (docs: emissão da NF = saída da central). O fim da
  // descarga não é digitado: o banco calcula pelo início do caminhão seguinte.
  const [issuedTime, setIssuedTime] = React.useState("");
  const [arrivalTime, setArrivalTime] = React.useState("");
  const [dischargeTime, setDischargeTime] = React.useState("");

  const siteId = detail.data?.site_id;

  // O fck exigido vem da peca estrutural da concretagem — nao ha mais
  // cadastro de tracos para escolher aqui.
  const element = detail.data?.structural_elements ?? null;
  const requiredFck = element?.fck_required ?? null;

  /** Numero da nota digitado com virgula ou ponto. */
  const parsed = (value: string) => Number(value.replace(",", "."));

  const pendingChecks =
    Number(!checks.invoice) +
    Number(!checks.truck) +
    Number(!checks.fck) +
    Number(!checks.volume);

  const fckBelowRequired =
    requiredFck !== null && fck !== "" && parsed(fck) < requiredFck;

  /**
   * Sobe a foto e le a nota ANTES de salvar, para o tecnico ja receber os
   * campos preenchidos e poder conferir cada um contra o caminhao que chegou.
   *
   * A leitura nunca sobrescreve o que a pessoa ja digitou.
   */
  async function readInvoice(file: File) {
    if (!siteId) return;
    if (!online) {
      // Sem internet a foto vai na fila junto com o registro; os campos ficam
      // para o tecnico preencher a mao, e a conferencia continua valendo.
      toast.info("Sem conexão: a foto sobe depois. Preencha os campos à mão.");
      return;
    }

    setReading(true);
    try {
      // Caminho SEMPRE começa pelo uuid da obra — as policies do bucket
      // decidem o acesso pela primeira pasta.
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${siteId}/${clientLocalId}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      setPhotoPath(path);

      const { data, error } = await supabase.functions.invoke(
        "extract-invoice-ocr",
        { body: { invoice_photo_path: path } },
      );
      if (error) throw error;

      const read = data as {
        invoice_number: string | null;
        truck_number: string | null;
        fck: number | null;
        volume_m3: number | null;
        /** "SAÍDA USINA" no impresso — o primeiro dos quatro horários. */
        saida_usina: string | null;
        confidence: number;
      };

      // Nomear os campos lidos deixa claro o que veio da IA e o que ainda
      // falta digitar. A contagem fica FORA de qualquer setState: a funcao
      // passada para o setState roda depois, e contar la dentro daria zero.
      const readFields: string[] = [];
      if (read.invoice_number && !invoiceNumber) {
        setInvoiceNumber(read.invoice_number);
        readFields.push("número");
      }
      if (read.truck_number && !truckNumber) {
        setTruckNumber(read.truck_number);
        readFields.push("caminhão");
      }
      if (read.fck !== null && !fck) {
        setFck(String(read.fck));
        readFields.push("fck");
      }
      if (read.volume_m3 !== null && !volume) {
        setVolume(String(read.volume_m3));
        readFields.push("volume");
      }
      // Saida da central e o horario que o impresso ja traz pronto; os outros
      // tres sao anotados na obra.
      if (read.saida_usina && !issuedTime) {
        setIssuedTime(read.saida_usina);
        readFields.push("saída da usina");
      }

      // Toda leitura recomeca a conferencia: o que a IA preencheu ainda
      // precisa ser batido com o caminhao.
      setChecks({ invoice: false, truck: false, fck: false, volume: false });

      if (readFields.length === 0) {
        toast.warning(
          "Não consegui ler a nota. Preencha os campos à mão e confira cada um.",
        );
      } else {
        const last = readFields.pop()!;
        const list = readFields.length
          ? `${readFields.join(", ")} e ${last}`
          : last;
        toast.success(`Nota de remessa lida: ${list}. Confira cada um.`);
      }
    } catch (cause) {
      toast.error(
        errorMessage(cause, "Falha ao ler a nota. Preencha os campos à mão."),
      );
    } finally {
      setReading(false);
    }
  }

  /**
   * Grava o recebimento ja conferido.
   */
  const save = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error("Concretagem sem obra.");

      const isLocalConcreting = detail.data?.is_local ?? false;

      const concretingDate =
        detail.data?.concreting_date ?? new Date().toISOString().slice(0, 10);

      const times = {
        invoice_issued_at: toTimestamp(concretingDate, issuedTime),
        site_arrival_at: toTimestamp(concretingDate, arrivalTime),
        discharge_start_at: toTimestamp(concretingDate, dischargeTime),
      };

      const payload = {
        client_local_id: clientLocalId,
        ...(isLocalConcreting
          ? { concreting_local_id: concretingId }
          : { concreting_id: concretingId }),
        invoice_number: invoiceNumber.trim(),
        truck_number: truckNumber.trim(),
        fck_required: parsed(fck),
        volume_m3: volume ? parsed(volume) : null,
        slump_value: parsed(slump),
        is_special_piece: isSpecial,
        temperature: isSpecial && temperature ? parsed(temperature) : null,
        // A conferencia foi feita em campo; ela sobe junto com o registro.
        checked_invoice_number: checks.invoice,
        checked_truck_number: checks.truck,
        checked_fck: checks.fck,
        checked_volume: checks.volume,
        ...times,
      };

      // Sem internet (ou concretagem que ainda não subiu) o registro fica no
      // aparelho e sobe depois — a frente de obra não pode parar por isso.
      if (!online || isLocalConcreting) {
        await enqueue({
          client_local_id: clientLocalId,
          entity: "truck_receipts",
          site_id: siteId,
          payload,
          photos: photo
            ? [{ blob: photo, name: photo.name, type: photo.type }]
            : [],
          label: `Recebimento NF ${invoiceNumber.trim() || "sem número"} · caminhão ${truckNumber.trim()}`,
        });
        await refreshQueue();
        return { id: clientLocalId, ocr: false, queued: true };
      }

      const { data: receipt, error } = await supabase
        .from("truck_receipts")
        .insert({
          concreting_id: concretingId,
          invoice_number: invoiceNumber.trim(),
          truck_number: truckNumber.trim(),
          fck_required: parsed(fck),
          volume_m3: volume ? parsed(volume) : null,
          slump_value: parsed(slump),
          is_special_piece: isSpecial,
          temperature: isSpecial && temperature ? parsed(temperature) : null,
          checked_invoice_number: checks.invoice,
          checked_truck_number: checks.truck,
          checked_fck: checks.fck,
          checked_volume: checks.volume,
          // A leitura ja foi conferida na tela antes de salvar.
          invoice_photo_path: photoPath,
          ocr_status: "done",
          ...times,
          received_by: profile!.id,
          client_local_id: clientLocalId,
        })
        .select("id")
        .single();

      if (error) throw error;
      // A foto ja subiu e ja foi lida antes de salvar: aqui o registro nasce
      // com os dados conferidos, sem uma segunda ida ao servidor.
      return { id: receipt.id, queued: false };
    },
    onSuccess: (result) => {
      if (result.queued) {
        toast.success(
          "Recebimento salvo no aparelho. Ele sobe sozinho quando a conexão voltar.",
        );
      } else {
        toast.success("Recebimento conferido e registrado.");
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
            Fotografe a nota de remessa: a leitura automática preenche os campos e
            você confere cada um.
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
              <Label htmlFor="foto-nf">Foto da nota de remessa</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="foto-nf"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
                  onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPhoto(file);
                  if (file) void readInvoice(file);
                }}
                disabled={reading}
                />
                <Camera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-xs text-muted-foreground">
                A leitura automática preenche os campos abaixo. Confira cada um
                antes de salvar.
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Conferência da nota</p>
              <p className="text-xs text-muted-foreground">
                Marque cada item depois de conferir com a nota e com o caminhão
                que chegou.
              </p>

              <CheckedField
                id="nf"
                label="Número da nota de remessa"
                value={invoiceNumber}
                onValueChange={setInvoiceNumber}
                checked={checks.invoice}
                onCheckedChange={(value) =>
                  setChecks((current) => ({ ...current, invoice: value }))
                }
                inputMode="numeric"
                placeholder="15542"
              />

              <CheckedField
                id="caminhao"
                label="Número do caminhão betoneira"
                hint="Confira a placa do caminhão que chegou com a da nota."
                value={truckNumber}
                onValueChange={setTruckNumber}
                checked={checks.truck}
                onCheckedChange={(value) =>
                  setChecks((current) => ({ ...current, truck: value }))
                }
                placeholder="SAH3H15"
              />

              <CheckedField
                id="fck"
                label="fck (MPa)"
                hint={
                  requiredFck === null
                    ? "Cadastre o fck na peça estrutural para o site comparar."
                    : `Exigido pela peça${
                        element?.name ? ` ${element.name}` : ""
                      }: ${requiredFck} MPa.`
                }
                value={fck}
                onValueChange={setFck}
                checked={checks.fck}
                onCheckedChange={(value) =>
                  setChecks((current) => ({ ...current, fck: value }))
                }
                type="number"
                inputMode="decimal"
                step="0.5"
                min="1"
                placeholder="30"
              />
              {fckBelowRequired ? (
                <p className="text-sm font-medium text-destructive">
                  Atenção: o fck da nota é menor que o exigido para esta peça.
                </p>
              ) : null}

              <CheckedField
                id="volume"
                label="Volume (m³)"
                value={volume}
                onValueChange={setVolume}
                checked={checks.volume}
                onCheckedChange={(value) =>
                  setChecks((current) => ({ ...current, volume: value }))
                }
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="8"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slump">Slump teste (cm)</Label>
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
              <p className="text-xs text-muted-foreground">
                O único valor medido em campo.
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Horários da entrega</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Estes horários vêm do portal da concreteira. O fim da descarga é
                calculado sozinho: é o início da descarga do caminhão seguinte.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emissao">Emissão da NF (saída da central)</Label>
                  <Input
                    id="emissao"
                    type="time"
                    value={issuedTime}
                    onChange={(event) => setIssuedTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chegada">Chegada na obra</Label>
                  <Input
                    id="chegada"
                    type="time"
                    value={arrivalTime}
                    onChange={(event) => setArrivalTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inicio-descarga">Início da descarga</Label>
                  <Input
                    id="inicio-descarga"
                    type="time"
                    value={dischargeTime}
                    onChange={(event) => setDischargeTime(event.target.value)}
                  />
                </div>
              </div>
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
                <AlertTitle>Lendo a nota de remessa</AlertTitle>
                <AlertDescription>
                  A IA está extraindo o número da NF da foto.
                </AlertDescription>
              </Alert>
            ) : null}

            <p className="text-sm text-muted-foreground">
              {pendingChecks === 0
                ? "Tudo conferido."
                : pendingChecks === 1
                  ? "Falta 1 conferência."
                  : `Faltam ${pendingChecks} conferências.`}
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={save.isPending || reading || pendingChecks > 0}
            >
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
