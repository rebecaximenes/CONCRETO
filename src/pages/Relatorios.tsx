import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, ShieldCheck, Sparkles } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, todayIso } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";

interface ReportResponse {
  report_text: string;
  metrics: {
    total_concretings: number;
    conformity_rate: number;
    nonconformities: number;
    trend: string;
    total_results: number;
    results_7d: number;
    results_28d: number;
  };
  model: string;
}

interface ExportResponse {
  filename: string;
  content_type: string;
  rows: number;
  file_base64: string;
}

/** Converte o base64 devolvido pela Edge Function em download no navegador. */
function downloadBase64(base64: string, filename: string, type: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Relatorios() {
  const { activeSite, activeRole } = useSite();
  const siteId = activeSite?.siteId ?? null;
  const canView = isProductionManager(activeRole);

  const firstDayOfYear = `${new Date().getFullYear()}-01-01`;
  const [start, setStart] = React.useState(firstDayOfYear);
  const [end, setEnd] = React.useState(todayIso());
  const [depth, setDepth] = React.useState<"standard" | "deep">("standard");
  const [report, setReport] = React.useState<ReportResponse | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<ReportResponse>(
        "generate-conformity-report",
        {
          body: {
            site_id: siteId,
            period_start: start,
            period_end: end,
            depth,
          },
        },
      );
      if (error || !data) throw error ?? new Error("Relatório sem resposta.");
      return data;
    },
    onSuccess: (data) => setReport(data),
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível gerar o relatório.")),
  });

  const exportSheet = useMutation({
    mutationFn: async (format: "xlsx" | "csv") => {
      const { data, error } = await supabase.functions.invoke<ExportResponse>(
        "export-spreadsheet",
        {
          body: {
            site_id: siteId,
            period_start: start,
            period_end: end,
            format,
          },
        },
      );
      if (error || !data) throw error ?? new Error("Exportação sem resposta.");
      return data;
    },
    onSuccess: (data) => {
      downloadBase64(data.file_base64, data.filename, data.content_type);
      toast.success(`Planilha gerada com ${data.rows} linha(s).`);
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível exportar a planilha.")),
  });

  if (!canView) {
    return (
      <Alert variant="warning">
        <ShieldCheck />
        <AlertTitle>Área do gestor de produção</AlertTitle>
        <AlertDescription>
          Os relatórios de conformidade são exclusivos do gestor de produção da
          obra.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description="Conformidade, tendência de resistência e a planilha que substitui o Excel."
      />

      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
          <CardDescription>
            Vale para o relatório e para a exportação.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inicio">Início</Label>
            <Input
              id="inicio"
              type="date"
              className="w-44"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fim">Fim</Label>
            <Input
              id="fim"
              type="date"
              className="w-44"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profundidade">Profundidade</Label>
            <Select
              value={depth}
              onValueChange={(value) => setDepth(value as "standard" | "deep")}
            >
              <SelectTrigger id="profundidade" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Resumo do período</SelectItem>
                <SelectItem value="deep">Análise aprofundada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles />
                Gerar relatório
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => exportSheet.mutate("xlsx")}
            disabled={exportSheet.isPending}
          >
            {exportSheet.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileSpreadsheet />
            )}
            Exportar planilha
          </Button>
          <Button
            variant="ghost"
            onClick={() => exportSheet.mutate("csv")}
            disabled={exportSheet.isPending}
          >
            <Download />
            CSV
          </Button>
        </CardContent>
      </Card>

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Concretagens no período</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {report.metrics.total_concretings}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Conformidade dos ensaios</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {(report.metrics.conformity_rate * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.metrics.results_7d} de 7 dias ·{" "}
                  {report.metrics.results_28d} de 28 dias
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Não conformidades</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {report.metrics.nonconformities}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tendência</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={
                    report.metrics.trend === "piorando"
                      ? "destructive"
                      : report.metrics.trend === "melhorando"
                        ? "success"
                        : "secondary"
                  }
                >
                  {report.metrics.trend}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Análise do período</CardTitle>
              <CardDescription>
                Texto gerado por IA a partir dos ensaios registrados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {report.report_text}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed shadow-none">
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Escolha o período e gere o relatório de conformidade da obra.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
