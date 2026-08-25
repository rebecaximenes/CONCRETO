import { ESTADO_AVANCO, estadoDoAvanco } from "@/lib/avanco";
import { formatNumber } from "@/lib/format";

type Props = {
  nome: string;
  detalhe?: string | null;
  previsto: number;
  maximo: number;
  realizado: number;
};

/**
 * Uma peca no previsto x realizado.
 *
 * Le-se da esquerda para a direita como a barra de um tanque: o trilho e o
 * MAXIMO que a obra se autorizou a gastar (previsto + perda prevista), o
 * preenchimento e o que ja desceu do caminhao. Os dois tracos verticais sao o
 * previsto e o maximo — e o pedaco que passa do maximo sai em vermelho, com
 * 2px de respiro para nao virar uma barra so.
 *
 * Feito em divs, e nao em SVG com viewBox: barra que estica junto com a tela
 * dentro de um viewBox deforma a ponta arredondada. Aqui o arredondamento e
 * sempre 4px de verdade, em qualquer largura.
 */
export function MedidorPeca({ nome, detalhe, previsto, maximo, realizado }: Props) {
  const estado = estadoDoAvanco(realizado, previsto, maximo);
  const { rotulo, cor, Icone } = ESTADO_AVANCO[estado];

  // O topo da escala precisa caber o estouro, senao o vermelho nao aparece.
  const topo = Math.max(maximo, realizado, 1);
  const pct = (valor: number) => `${Math.min(100, (valor / topo) * 100)}%`;

  const dentroDoMaximo = Math.min(realizado, maximo);
  const excedente = Math.max(0, realizado - maximo);

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate font-medium">{nome}</p>
          {detalhe ? (
            <p className="truncate text-xs text-muted-foreground">{detalhe}</p>
          ) : null}
        </div>
        <p
          className="flex shrink-0 items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--viz-tinta-2)" }}
        >
          <Icone className="size-3.5" style={{ color: cor }} aria-hidden />
          {rotulo}
        </p>
      </div>

      <div
        className="relative h-5 w-full rounded-sm"
        style={{ backgroundColor: "var(--viz-serie-1-wash)" }}
        role="img"
        aria-label={`${nome}: ${formatNumber(realizado, " m³")} aplicados de ${formatNumber(
          maximo,
          " m³",
        )} no máximo. ${rotulo}.`}
      >
        {/* aplicado, ate o maximo */}
        <div
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{
            width: pct(dentroDoMaximo),
            backgroundColor: "var(--viz-serie-1)",
          }}
        />
        {/* o que passou do maximo, separado por 2px da cor do fundo */}
        {excedente > 0 ? (
          <div
            className="absolute inset-y-0 rounded-r-[4px]"
            style={{
              left: `calc(${pct(maximo)} + 2px)`,
              right: 0,
              backgroundColor: "var(--viz-acima)",
            }}
          />
        ) : null}

        {/* tracos do previsto e do maximo */}
        {[previsto, maximo].map((marca, indice) => (
          <span
            key={indice}
            className="absolute inset-y-0 w-px"
            style={{
              left: pct(marca),
              backgroundColor: "var(--viz-surface)",
              opacity: marca > realizado ? 0 : 0.9,
            }}
            aria-hidden
          />
        ))}
        {[previsto, maximo].map((marca, indice) => (
          <span
            key={`t${indice}`}
            className="absolute w-px"
            style={{
              left: pct(marca),
              top: -3,
              bottom: -3,
              backgroundColor: "var(--viz-eixo)",
            }}
            aria-hidden
          />
        ))}
      </div>

      <p
        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums"
        style={{ color: "var(--viz-tinta-2)" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{
              backgroundColor:
                excedente > 0 ? "var(--viz-acima)" : "var(--viz-serie-1)",
            }}
            aria-hidden
          />
          Aplicado {formatNumber(realizado, " m³")}
        </span>
        <span>Previsto {formatNumber(previsto, " m³")}</span>
        <span>Máximo {formatNumber(maximo, " m³")}</span>
        {excedente > 0 ? (
          <span style={{ color: "var(--viz-acima)" }}>
            Passou {formatNumber(excedente, " m³")}
          </span>
        ) : null}
      </p>
    </li>
  );
}
