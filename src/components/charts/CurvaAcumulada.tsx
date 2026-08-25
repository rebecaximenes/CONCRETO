import * as React from "react";

import { formatDate, formatNumber } from "@/lib/format";

export type PontoDia = {
  /** "2026-03-02" */
  data: string;
  volume: number;
  caminhoes: number;
};

type Props = {
  pontos: PontoDia[];
  previsto: number;
  maximo: number;
  /** Descreve a curva para quem usa leitor de tela. */
  titulo: string;
};

type PontoPlotado = PontoDia & { acumulado: number; x: number; y: number };

const ALTURA = 240;

/**
 * As margens mudam com a largura. Numa tela de celular a coluna de 92px para
 * os rotulos "Previsto" e "Maximo" comia quase um terco do desenho; abaixo de
 * 480px os rotulos entram para dentro do grafico, logo acima de cada linha.
 */
function margens(largura: number) {
  const estreito = largura < 480;
  return {
    topo: estreito ? 20 : 14,
    direita: estreito ? 10 : 92,
    baixo: 26,
    esquerda: estreito ? 40 : 52,
    rotuloDentro: estreito,
  };
}

/** Escala de tempo em dias — o intervalo entre concretagens nao e regular. */
function emDias(data: string): number {
  return Date.parse(`${data}T12:00:00Z`) / 86_400_000;
}

/** Ticks redondos: 0, 250, 500... conforme a ordem de grandeza do topo. */
function ticksY(topo: number): number[] {
  const bruto = topo / 4;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * ordem).find((v) => v >= bruto) ?? ordem;
  const ticks: number[] = [];
  for (let valor = 0; valor <= topo; valor += passo) ticks.push(valor);
  return ticks;
}

/**
 * Volume acumulado no tempo, com o previsto e o maximo como linhas de
 * referencia.
 *
 * A planilha da obra so sabe dizer o total de hoje: responde "estourou?" mas
 * nunca "quando comecou a estourar?". Aqui da para ver a curva encostando no
 * maximo com dias de antecedencia — que e o unico momento em que ainda da
 * para fazer alguma coisa a respeito.
 */
export function CurvaAcumulada({ pontos, previsto, maximo, titulo }: Props) {
  // Comeca em 0 de proposito: so desenha depois de medir, para nunca existir
  // um quadro com o svg mais largo que a tela.
  const [largura, setLargura] = React.useState(0);
  const [ativo, setAtivo] = React.useState<number | null>(null);
  const observador = React.useRef<ResizeObserver | null>(null);

  /**
   * Ref de callback, e nao useEffect com ref: no primeiro render a curva
   * ainda esta vazia (a consulta nao voltou) e o elemento medido nem existe.
   * Um efeito com deps [] rodaria com a ref nula, sairia sem observar nada, e
   * nunca mais rodaria — a largura ficava congelada na do desktop e o grafico
   * estourava 600px para fora da tela do celular.
   */
  const medir = React.useCallback((alvo: HTMLDivElement | null) => {
    observador.current?.disconnect();
    if (!alvo) {
      observador.current = null;
      return;
    }
    // Medir em pixels de verdade: SVG que estica dentro de um viewBox
    // deforma ponta arredondada e circulo (ja mordi essa isca na planta).
    const atualizar = (valor: number) => setLargura(Math.floor(valor));
    observador.current = new ResizeObserver(([entrada]) => {
      atualizar(entrada.contentRect.width);
    });
    observador.current.observe(alvo);
    atualizar(alvo.getBoundingClientRect().width);
  }, []);

  React.useEffect(() => () => observador.current?.disconnect(), []);

  const ordenados = React.useMemo(
    () => [...pontos].sort((a, b) => a.data.localeCompare(b.data)),
    [pontos],
  );

  const MARGEM = margens(largura);
  const larguraPlot = Math.max(1, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.baixo;

  const { plotados, topo, ticks } = React.useMemo(() => {
    let somado = 0;
    const acumulados = ordenados.map((ponto) => {
      somado += ponto.volume;
      return { ...ponto, acumulado: somado };
    });

    const topoBruto = Math.max(maximo, somado, 1) * 1.06;
    const ticksCalculados = ticksY(topoBruto);
    const topoFinal = Math.max(topoBruto, ticksCalculados[ticksCalculados.length - 1] ?? topoBruto);

    const primeiro = acumulados.length ? emDias(acumulados[0].data) : 0;
    const ultimo = acumulados.length
      ? emDias(acumulados[acumulados.length - 1].data)
      : 1;
    const intervalo = Math.max(1, ultimo - primeiro);

    const y = (valor: number) => MARGEM.topo + alturaPlot * (1 - valor / topoFinal);

    return {
      topo: topoFinal,
      ticks: ticksCalculados,
      plotados: acumulados.map((ponto) => ({
        ...ponto,
        x:
          MARGEM.esquerda +
          (larguraPlot * (emDias(ponto.data) - primeiro)) / intervalo,
        y: y(ponto.acumulado),
      })) as PontoPlotado[],
    };
  }, [ordenados, maximo, larguraPlot, alturaPlot, MARGEM.esquerda, MARGEM.topo]);

  const paraY = React.useCallback(
    (valor: number) => MARGEM.topo + alturaPlot * (1 - valor / topo),
    [alturaPlot, topo, MARGEM.topo],
  );

  if (ordenados.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Nenhum caminhão lançado nesta peça ainda. A curva aparece a partir da
        primeira concretagem.
      </p>
    );
  }

  const caminho = plotados
    .map((ponto, indice) => `${indice === 0 ? "M" : "L"}${ponto.x},${ponto.y}`)
    .join(" ");
  const base = MARGEM.topo + alturaPlot;
  const area = `${caminho} L${plotados[plotados.length - 1].x},${base} L${plotados[0].x},${base} Z`;
  const fim = plotados[plotados.length - 1];
  const destacado = ativo === null ? null : plotados[ativo];

  function aoMover(evento: React.PointerEvent<SVGSVGElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    let melhor = 0;
    for (let i = 1; i < plotados.length; i += 1) {
      if (Math.abs(plotados[i].x - x) < Math.abs(plotados[melhor].x - x)) melhor = i;
    }
    setAtivo(melhor);
  }

  return (
    // O svg fica em posicao absoluta, e nao no fluxo. Sem isso ele participa
    // do calculo de largura: um svg de 720px inflava o <main> (que e
    // flex-1, com min-width automatica), o container media ja inflado, e a
    // conta nunca encolhia — no celular sobrava 600px de rolagem lateral.
    // Fora do fluxo, a largura vem so da tela, e a medicao converge.
    <div
      ref={medir}
      className="viz-root relative w-full overflow-hidden"
      style={{ height: ALTURA }}
    >
      {largura === 0 ? null : (
      <svg
        data-grafico="curva-acumulada"
        width={largura}
        height={ALTURA}
        role="img"
        className="absolute left-0 top-0 touch-pan-y"
        aria-label={`${titulo}. ${formatNumber(
          fim.acumulado,
          " m³",
        )} acumulados em ${plotados.length} dias de concretagem. Máximo previsto ${formatNumber(
          maximo,
          " m³",
        )}.`}
        onPointerMove={aoMover}
        onPointerLeave={() => setAtivo(null)}
      >
        {/* grade recessiva, hairline e solida */}
        {ticks.map((valor) => (
          <g key={valor}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={paraY(valor)}
              y2={paraY(valor)}
              stroke="var(--viz-grade)"
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 8}
              y={paraY(valor) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--viz-tinta-3)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}

        {/* referencias: previsto (cinza) e maximo (vermelho — cruza-lo e o
            evento que interessa). Rotuladas, nunca so pela cor. */}
        {[
          { valor: previsto, rotulo: "Previsto", cor: "var(--viz-tinta-2)" },
          { valor: maximo, rotulo: "Máximo", cor: "var(--viz-acima)" },
        ].map((referencia) => (
          <g key={referencia.rotulo}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={paraY(referencia.valor)}
              y2={paraY(referencia.valor)}
              stroke={referencia.cor}
              strokeWidth={1.5}
            />
            <text
              x={
                MARGEM.rotuloDentro
                  ? MARGEM.esquerda + 4
                  : largura - MARGEM.direita + 8
              }
              y={
                MARGEM.rotuloDentro
                  ? paraY(referencia.valor) - 4
                  : paraY(referencia.valor) + 4
              }
              fontSize={11}
              fill="var(--viz-tinta-2)"
              // Contorno na cor do fundo: o rotulo entra por cima da area
              // pintada e precisa continuar legivel.
              stroke={MARGEM.rotuloDentro ? "var(--viz-surface)" : undefined}
              strokeWidth={MARGEM.rotuloDentro ? 3 : undefined}
              paintOrder="stroke"
            >
              {referencia.rotulo}
            </text>
          </g>
        ))}

        <path d={area} fill="var(--viz-serie-1)" fillOpacity={0.1} />
        <path
          d={caminho}
          fill="none"
          stroke="var(--viz-serie-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ponta da curva: anel de 2px na cor do fundo para nao sumir na linha */}
        <circle
          cx={fim.x}
          cy={fim.y}
          r={4}
          fill={fim.acumulado > maximo ? "var(--viz-acima)" : "var(--viz-serie-1)"}
          stroke="var(--viz-surface)"
          strokeWidth={2}
        />

        {destacado ? (
          <g>
            <line
              x1={destacado.x}
              x2={destacado.x}
              y1={MARGEM.topo}
              y2={base}
              stroke="var(--viz-eixo)"
              strokeWidth={1}
            />
            <circle
              cx={destacado.x}
              cy={destacado.y}
              r={4}
              fill="var(--viz-serie-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          </g>
        ) : null}

        <line
          x1={MARGEM.esquerda}
          x2={largura - MARGEM.direita}
          y1={base}
          y2={base}
          stroke="var(--viz-eixo)"
          strokeWidth={1}
        />
        <text
          x={MARGEM.esquerda}
          y={ALTURA - 8}
          fontSize={11}
          fill="var(--viz-tinta-3)"
        >
          {formatDate(plotados[0].data)}
        </text>
        <text
          x={largura - MARGEM.direita}
          y={ALTURA - 8}
          textAnchor="end"
          fontSize={11}
          fill="var(--viz-tinta-3)"
        >
          {formatDate(fim.data)}
        </text>
      </svg>
      )}

      {destacado ? (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-md border bg-card p-2 text-xs shadow-md"
          style={{
            left: Math.min(
              Math.max(8, destacado.x - 80),
              Math.max(8, largura - 176),
            ),
            top: Math.max(4, destacado.y - 78),
          }}
        >
          <p className="font-medium">{formatDate(destacado.data)}</p>
          <p className="mt-1 tabular-nums" style={{ color: "var(--viz-tinta-2)" }}>
            No dia: {formatNumber(destacado.volume, " m³")} ·{" "}
            {destacado.caminhoes}{" "}
            {destacado.caminhoes === 1 ? "caminhão" : "caminhões"}
          </p>
          <p className="tabular-nums" style={{ color: "var(--viz-tinta-2)" }}>
            Acumulado: {formatNumber(destacado.acumulado, " m³")}
          </p>
          <p className="tabular-nums" style={{ color: "var(--viz-tinta-3)" }}>
            {maximo > 0
              ? `${Math.round((destacado.acumulado / maximo) * 100)}% do máximo`
              : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
