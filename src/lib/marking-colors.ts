/**
 * Paleta da marcacao da planta — uma cor por entrega.
 *
 * A cor nao se escolhe a mao: cada ENTREGA recebe a proxima cor livre da
 * planta, na ordem da descarga. Assim ninguem repete cor por engano e a
 * legenda nunca sai errada, que e o erro que a planta pintada a mao permite.
 *
 * A cor e da entrega (da nota), nao do caminhao: a legenda impressa da obra
 * lista uma linha por NOTA FISCAL, e o mesmo caminhao volta em outro dia com
 * outra nota — e outra cor. E o escopo e a PLANTA inteira, nao o dia: a
 * planta acumula meses de concretagem e duas notas nela nunca podem
 * compartilhar cor.
 *
 * Criterios da paleta, nesta ordem:
 *
 *  1. Distinguivel sobre PAPEL BRANCO com desenho tecnico preto por baixo —
 *     a planta e impressa e levada para a obra. Contraste minimo de 2,3:1 com
 *     o branco e 2,6:1 com o preto, medido em todas as 16.
 *  2. Nenhum par parecido: a menor distancia RGB entre duas cores da paleta e
 *     67 (de 441 possiveis). A primeira versao que escrevi a mao tinha um par
 *     a distancia 14 — duas entregas ganhariam a mesma cor na pratica.
 *  3. As cores foram escolhidas por busca, nao a olho: pega-se sempre a mais
 *     distante das ja escolhidas, entre as que passam no contraste.
 *
 * 16 cores cobrem com folga o que fica visivel de uma vez: o maior dia da
 * planilha da obra teve 6 caminhoes. Numa planta que acumula meses, a paleta
 * acaba dando a volta — e aceitavel, porque a legenda tras data e nota
 * fiscal junto da cor.
 */
export const MARKING_COLORS = [
  "#c0392b", // vermelho tijolo
  "#11b4d4", // ciano
  "#ee2bee", // magenta
  "#1aa50d", // verde
  "#5e34b2", // roxo
  "#92b234", // verde limao
  "#288a72", // verde-agua escuro
  "#c3228e", // rosa escuro
  "#ee8c2b", // laranja
  "#1152d4", // azul
  "#9d2bee", // violeta
  "#4d82cb", // azul claro
  "#8a6a28", // ocre
  "#22c34b", // verde claro
  "#981b59", // vinho
  "#ee2b5b", // vermelho rosado
] as const;

/**
 * Proxima cor livre da planta.
 *
 * `usedColors` sao as cores ja gastas NESTA planta, de todas as entregas.
 * Passando de 16, a paleta recomeca: e melhor repetir uma cor antiga, de uma
 * concretagem de meses atras, do que deixar a estaca sem marcar.
 */
export function nextMarkingColor(usedColors: string[]): string {
  const free = MARKING_COLORS.find((color) => !usedColors.includes(color));
  return free ?? MARKING_COLORS[usedColors.length % MARKING_COLORS.length];
}
