import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type { ExtractionStatus } from "@/integrations/supabase/types";
import { errorMessage, formatDate, formatDateTime, formatFck } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";

const BUCKET = "test-reports";

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "Na fila",
  processing: "Lendo o laudo...",
  done: "Lido e vinculado",
  needs_review: "Precisa de revisão",
  failed: "Falhou",
};

const STATUS_VARIANT: Record<
  ExtractionStatus,
  "default" | "secondary" | "warning" | "success" | "destructive"
> = {
  pending: "secondary",
  processing: "secondary",
  done: "success",
  needs_review: "warning",
  failed: "destructive",
};

interface ReportRow {
  id: string;
  storage_path: string;
  invoice_number: string | null;
  extraction_status: ExtractionStatus;
  created_at: string;
  strength_results: {
    id: string;
    age_days: number;
    measured_fck: number;
    required_fck: number;
    is_conforming: boolean;
    test_date: string | null;
  }[];
}

export default function Laudos() {
  const { profile } = useAuth();
  const { activeSite, activeRole } = useSite();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);

  const siteId = activeSite?.siteId ?? null;
  const canUpload = isProductionManager(activeRole);

  const reportsQuery = useQuery({
    queryKey: ["laudos", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("test_reports")
        .select(
          "id, storage_path, invoice_number, extraction_status, created_at, strength_results(id, age_days, measured_fck, required_fck, is_conforming, test_date)",
        )
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportRow[];
    },
  });

  /** Sobe o PDF e dispara a leitura por IA (extract-test-report). */
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !siteId) throw new Error("Selecione o PDF do laudo.");

      const path = `${siteId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/pdf" });
      if (uploadError) throw uploadError;

      const { data: report, error } = await supabase
        .from("test_reports")
        .insert({
          site_id: siteId,
          storage_path: path,
          uploaded_by: profile!.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: extractError } = await supabase.functions.invoke(
        "extract-test-report",
        { body: { test_report_id: report.id, storage_path: path } },
      );

      return { extracted: !extractError };
    },
    onSuccess: (result) => {
      setFile(null);
      if (result.extracted) {
        toast.success("Laudo lido: resultados de 7/28 dias preenchidos.");
      } else {
        toast.warning(
          "Laudo enviado, mas a leitura automática falhou. Confira o status na lista.",
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["laudos", siteId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", siteId] });
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível enviar o laudo.")),
  });

  async function openReport(path: string) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o PDF.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const rows = reportsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Laudos de ensaio"
        description="Envie o PDF: a IA lê o laudo, casa pela nota fiscal e preenche as resistências."
      />

      {canUpload ? (
        <Card>
          <CardHeader>
            <CardTitle>Enviar laudo</CardTitle>
            <CardDescription>
              O vínculo com a concretagem é feito pelo número da nota fiscal citado
              no laudo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                upload.mutate();
              }}
            >
              <div className="min-w-64 flex-1 space-y-2">
                <Label htmlFor="laudo">PDF do laudo</Label>
                <Input
                  id="laudo"
                  type="file"
                  accept="application/pdf"
                  required
                  className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={upload.isPending || !file}>
                {upload.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Lendo...
                  </>
                ) : (
                  <>
                    <Upload />
                    Enviar e ler
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="info">
          <ShieldCheck />
          <AlertTitle>Envio restrito ao gestor</AlertTitle>
          <AlertDescription>
            Você acompanha os resultados, mas só o gestor de produção envia laudos.
          </AlertDescription>
        </Alert>
      )}

      {reportsQuery.isLoading ? (
        <LoadingRows />
      ) : reportsQuery.isError ? (
        <ErrorState
          message={errorMessage(reportsQuery.error, "Falha ao carregar os laudos.")}
          onRetry={() => void reportsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum laudo enviado"
          description="Assim que o laboratório mandar o PDF de 7 ou 28 dias, envie aqui."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((report) => (
            <Card key={report.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void openReport(report.storage_path)}
                    className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                  >
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                    {report.invoice_number
                      ? `NF ${report.invoice_number}`
                      : "Laudo sem NF identificada"}
                  </button>
                  <Badge variant={STATUS_VARIANT[report.extraction_status]}>
                    {STATUS_LABEL[report.extraction_status]}
                  </Badge>
                </div>

                {report.extraction_status === "needs_review" ? (
                  <Alert variant="warning">
                    <AlertDescription>
                      A IA não encontrou um recebimento único com essa nota fiscal.
                      Confira o número da NF no laudo e no recebimento.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {report.strength_results.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {report.strength_results
                      .sort((a, b) => a.age_days - b.age_days)
                      .map((result) => (
                        <li key={result.id}>
                          <Badge
                            variant={result.is_conforming ? "success" : "destructive"}
                          >
                            {result.age_days} dias · {formatFck(result.measured_fck)}
                            {result.is_conforming
                              ? ""
                              : ` (exigido ${formatFck(result.required_fck)})`}
                            {result.test_date
                              ? ` · ${formatDate(result.test_date)}`
                              : ""}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Enviado em {formatDateTime(report.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
