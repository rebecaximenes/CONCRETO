import { HttpError } from "./supabase.ts";

/**
 * Modelo de visao usado na leitura da NF e do laudo.
 *
 * O `gemini-2.5-pro` dos documentos originais saiu de linha: chaves novas
 * recebem 404 ("no longer available to new users"). Os modelos `pro` da linha
 * 3.x tambem nao servem por padrao — no nivel gratuito a cota deles e ZERO
 * (429 na primeira chamada); exigem faturamento ativo.
 *
 * `gemini-3.5-flash` foi verificado contra nota de remessa e laudo reais em PDF:
 * acerta o numero da NF ate em foto torta e desfocada, e calcula a media por
 * idade no laudo. Trocavel pelo secret GEMINI_MODEL, sem novo deploy.
 */
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface ExtractOptions {
  base64: string;
  mimeType: string;
  prompt: string;
  /** JSON Schema do retorno esperado (responseSchema do Gemini). */
  schema: Record<string, unknown>;
}

/**
 * Extracao estruturada de documento (foto de NF ou PDF de laudo) com o
 * Gemini 2.5 Pro. Roda SEMPRE aqui no servidor: a chave nunca vai ao
 * frontend (docs/FUNCTIONS.md).
 */
export async function extractFromDocument<T>({
  base64,
  mimeType,
  prompt,
  schema,
}: ExtractOptions): Promise<T> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new HttpError(
      "GEMINI_API_KEY não configurada nos secrets do Supabase.",
      500,
    );
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(
      `Falha na leitura por IA (${response.status}): ${detail.slice(0, 500)}`,
      502,
    );
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new HttpError("A IA não retornou conteúdo legível do documento.", 502);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError("A IA retornou um JSON inválido.", 502);
  }
}
