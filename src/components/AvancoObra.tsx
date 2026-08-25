import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Table2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurvaAcumulada, type PontoDia } from "@/components/charts/CurvaAcumulada";
import { MedidorPeca } from "@/components/charts/MedidorPeca";
import { ErrorState, LoadingRows } from "@/components/states";
import { supabase } from "@/integrations/supabase/client";
import type { ElementDailyVolume, ElementVolumeProgress } from "@/integrations/supabase/types";
import { ESTADO_AVANCO, estadoDoAvanco } from "@/lib/avanco";
import { errorMessage, formatDate, formatNumber } from "@/lib/format";

type Props = {
  elements: ElementVolumeProgress[];
};

function soma(valores: (number | null | undefined)[]): number {
  return valores.reduce<number>((total, valor) => total + Number(valor ?? 0), 0);
}

/** Uma casa decimal, sem o 393.20000000000005 da divisao por 0.1. */
function umaCasa(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Previsto x realizado da obra.
 *
 * E a aba ACOMPANHAMENTO da planilha, com a diferenca que muda a decisao: a
 * planilha so mostra o total de hoje, e aqui da para ver a curva subindo em
 * direcao ao maximo enquanto ainda ha o que fazer. Os numeros nao sao
 * digitados em lugar nenhum — saem dos caminhoes conferidos no recebimento.
 */
export function AvancoObra({ elements }: Props) {
  const [pecaId, setPecaId] = React.useState("");
  const [verTabela, setVerTabela] = React.useState(false);

  const iniciadas = elements.filter((item) => Number(item.realized_volume_m3) > 0);

  // A curva abre na peca com mais volume aplicado: e a que esta em jogo.
  const pecaPadrao = React.useMemo(() => {
    const ordenadas = [...iniciadas].sort(
      (a, b) => Number(b.realized_volume_m3) - Number(a.realized_volume_m3),
    );
    return ordenadas[0]?.structural_element_id ?? "";
  }, [iniciadas]);

  const pecaAtiva = pecaId || pecaPadrao;
  const peca = elements.find((item) => item.structural_element_id === pecaAtiva) ?? null;

  const diasQuery = useQuery({
    queryKey: ["element_daily_volume", pecaAtiva],
    enabled: Boolean(pecaAtiva),
    // Trocar de peca nao pode piscar esqueleto e pular o layout: segura a
    // curva anterior, esmaecida, ate a nova chegar.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ElementDailyVolume[]> => {
      const { data, error } = await supabase
        .from("element_daily_volume")
        .select("*")
        .eq("structural_element_id", pecaAtiva)
        .order("concreting_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const previstoTotal = soma(elements.map((item) => item.planned_volume_m3));
  const maximoTotal = soma(elements.map((item) => item.max_volume_m3));
  const aplicadoTotal = soma(elements.map((item) => item.realized_volume_m3));
  const tendenciaTotal = soma(elements.map((item) => item.trend_volume_m3));
  const caminhoes = soma(elements.map((item) => item.trucks_count));

  // A "PERDA REAL (%)" do RESUMO da planilha: tendencia sobre previsto.
  const perdaTendencia =
    previstoTotal > 0
      ? ((tendenciaTotal - previstoTotal) / previstoTotal) * 100
      : null;
  // Nao existe "perda realizada" de peca em andamento: uma peca pela metade
  // tem sempre menos concreto do que o previsto, e o numero sairia negativo,
  // parecendo economia onde so ha servico por fazer. O que cabe ao lado do
  // numero grande e quantas pecas ja passaram do maximo — isso e acionavel.
  const acimaDoMaximo = elements.filter(
    (item) =>
      estadoDoAvanco(
        Number(item.realized_volume_m3),
        Number(item.planned_volume_m3),
        Number(item.max_volume_m3),
      ) === "acima",
  ).length;

  const pontos: PontoDia[] = (diasQuery.data ?? []).map((dia) => ({
    data: dia.concreting_date,
    volume: Number(dia.volume_m3),
    caminhoes: Number(dia.trucks_count),
  }));

  if (elements.length === 0) return null;

  return (
    <Card className="viz-root">
      <CardContent className="space-y-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Previsto × realizado</p>
            <p className="text-xs text-muted-foreground">
              Sai dos caminhões conferidos no recebimento — ninguém digita
              volume duas vezes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVerTabela((atual) => !atual)}
          >
            <Table2 />
            {verTabela ? "Ver gráficos" : "Ver em tabela"}
          </Button>
        </div>

        {/* O numero pelo qual a planilha inteira existe. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Perda em tendência da obra
            </p>
            <p className="text-5xl font-semibold leading-none">
              {perdaTendencia === null
                ? "—"
                : `${umaCasa(perdaTendencia).toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}%`}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" aria-hidden />
              {iniciadas.length === 0
                ? "Nenhuma peça iniciada"
                : acimaDoMaximo === 0
                  ? `${iniciadas.length} ${
                      iniciadas.length === 1 ? "peça" : "peças"
                    } em andamento, nenhuma acima do máximo`
                  : `${acimaDoMaximo} de ${elements.length} ${
                      elements.length === 1 ? "peça" : "peças"
                    } acima do máximo previsto`}
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm tabular-nums">
            {[
              { rotulo: "Previsto", valor: formatNumber(previstoTotal, " m³") },
              { rotulo: "Máximo", valor: formatNumber(maximoTotal, " m³") },
              { rotulo: "Aplicado", valor: formatNumber(aplicadoTotal, " m³") },
              { rotulo: "Caminhões", valor: String(caminhoes) },
            ].map((item) => (
              <div key={item.rotulo}>
                <dt className="text-xs text-muted-foreground">{item.rotulo}</dt>
                <dd className="font-medium">{item.valor}</dd>
              </div>
            ))}
          </dl>
        </div>

        {verTabela ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Peça</th>
                  <th className="py-2 pr-3 font-medium">Previsto</th>
                  <th className="py-2 pr-3 font-medium">Máximo</th>
                  <th className="py-2 pr-3 font-medium">Aplicado</th>
                  {/* Tendencia, e nao perda realizada: enquanto a peca nao
                      termina, "realizada" sai negativa e parece economia. */}
                  <th className="py-2 pr-3 font-medium">Perda em tendência</th>
                  <th className="py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {elements.map((item) => {
                  const estado = estadoDoAvanco(
                    Number(item.realized_volume_m3),
                    Number(item.planned_volume_m3),
                    Number(item.max_volume_m3),
                  );
                  return (
                    <tr key={item.structural_element_id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{item.name}</td>
                      <td className="py-2 pr-3">
                        {formatNumber(item.planned_volume_m3)}
                      </td>
                      <td className="py-2 pr-3">{formatNumber(item.max_volume_m3)}</td>
                      <td className="py-2 pr-3">
                        {formatNumber(item.realized_volume_m3)}
                      </td>
                      <td className="py-2 pr-3">
                        {item.trend_waste_percent === null
                          ? "—"
                          : `${formatNumber(item.trend_waste_percent)}%`}
                      </td>
                      <td className="py-2">{ESTADO_AVANCO[estado].rotulo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {elements.map((item) => (
                <MedidorPeca
                  key={item.structural_element_id}
                  nome={item.name}
                  detalhe={[item.location, item.floor_level].filter(Boolean).join(" · ")}
                  previsto={Number(item.planned_volume_m3)}
                  maximo={Number(item.max_volume_m3)}
                  realizado={Number(item.realized_volume_m3)}
                />
              ))}
            </ul>

            {iniciadas.length > 0 ? (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Volume acumulado no tempo</p>
                    <p className="text-xs text-muted-foreground">
                      {peca?.last_concreting_date
                        ? `Última concretagem em ${formatDate(peca.last_concreting_date)}`
                        : "Sem concretagem registrada"}
                    </p>
                  </div>
                  <Select value={pecaAtiva} onValueChange={setPecaId}>
                    <SelectTrigger className="w-full max-w-xs" aria-label="Peça da curva">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iniciadas.map((item) => (
                        <SelectItem
                          key={item.structural_element_id}
                          value={item.structural_element_id}
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {diasQuery.isLoading ? (
                  <LoadingRows rows={2} />
                ) : diasQuery.isError ? (
                  <ErrorState
                    message={errorMessage(
                      diasQuery.error,
                      "Falha ao carregar o volume por dia.",
                    )}
                    onRetry={() => void diasQuery.refetch()}
                  />
                ) : peca ? (
                  <div
                    className={
                      diasQuery.isFetching ? "opacity-60 transition-opacity" : ""
                    }
                  >
                  <CurvaAcumulada
                    pontos={pontos}
                    previsto={Number(peca.planned_volume_m3)}
                    maximo={Number(peca.max_volume_m3)}
                    titulo={`Volume acumulado em ${peca.name}`}
                  />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
