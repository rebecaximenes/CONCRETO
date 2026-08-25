import {
  CircleAlert,
  CircleCheck,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * Situacao de uma peca no previsto x realizado.
 *
 * Os limites sao os mesmos da planilha: o previsto e o alvo, o maximo e o
 * previsto mais a perda que a obra ja aceitou. Passar do maximo nao e detalhe
 * — e concreto pago que ninguem orcou.
 */
export type EstadoAvanco = "nao_iniciado" | "dentro" | "na_perda" | "acima";

export const ESTADO_AVANCO: Record<
  EstadoAvanco,
  { rotulo: string; cor: string; Icone: LucideIcon }
> = {
  nao_iniciado: {
    rotulo: "Não iniciado",
    cor: "var(--viz-tinta-3)",
    Icone: Minus,
  },
  dentro: {
    rotulo: "Dentro do previsto",
    cor: "var(--viz-ok)",
    Icone: CircleCheck,
  },
  na_perda: {
    rotulo: "Consumindo a perda prevista",
    cor: "var(--viz-atencao)",
    Icone: TriangleAlert,
  },
  acima: {
    rotulo: "Acima do máximo",
    cor: "var(--viz-acima)",
    Icone: CircleAlert,
  },
};

export function estadoDoAvanco(
  realizado: number,
  previsto: number,
  maximo: number,
): EstadoAvanco {
  if (realizado <= 0) return "nao_iniciado";
  if (realizado > maximo) return "acima";
  if (realizado > previsto) return "na_perda";
  return "dentro";
}
