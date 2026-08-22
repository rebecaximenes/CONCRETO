/**
 * Cache das listas de apoio (peças estruturais, peças, equipe) no proprio aparelho.
 * Sem isso a tela de campo fica inutilizavel offline: o tecnico nao teria a
 * peca para selecionar no lancamento.
 */

const PREFIX = "rastreconcreto.cache.";

export function cacheWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(
      `${PREFIX}${key}`,
      JSON.stringify({ at: Date.now(), value }),
    );
  } catch {
    // Sem espaco no aparelho: seguir sem cache é melhor que quebrar a tela.
  }
}

export function cacheRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return (JSON.parse(raw) as { value: T }).value;
  } catch {
    return null;
  }
}
