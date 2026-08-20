/** Formatacoes em pt-BR usadas nas telas de obra. */

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data de hoje no fuso local, no formato aceito por colunas `date`. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function formatFck(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} MPa`;
}

export function formatNumber(
  value: number | null | undefined,
  suffix = "",
): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}${suffix}`;
}

/** Mensagem de erro legivel para o time de obra. */
export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "object" && cause && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return fallback;
}
