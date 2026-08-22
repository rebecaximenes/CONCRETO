import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Cliente com service role: ignora RLS. Use SOMENTE depois de validar o
 * vinculo do usuario com a obra (docs/FUNCTIONS.md).
 */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente no contexto do usuario que chamou: RLS continua valendo. */
export function userClient(req: Request): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Chamada interna: outra Edge Function (ou o cron) autenticando com a service
 * role. Nesses casos nao existe sessao de usuario para validar — quem chamou ja
 * validou o vinculo com a obra antes.
 */
export function isServiceRoleRequest(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token !== "" && token === SERVICE_ROLE_KEY;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Identifica o usuario da requisicao ou falha com 401. */
export async function requireUser(req: Request) {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new HttpError("Sessão inválida ou expirada.", 401);
  }
  return { user: data.user, client };
}

/** Falha se o usuario nao for membro da obra. */
export async function requireSiteMember(
  client: SupabaseClient,
  siteId: string,
) {
  const { data, error } = await client.rpc("is_site_member", {
    p_site_id: siteId,
  });
  if (error) throw new HttpError(error.message, 500);
  if (!data) throw new HttpError("Você não é membro desta obra.", 403);
}

/** Falha se o usuario nao for gestor de producao da obra. */
export async function requireProductionManager(
  client: SupabaseClient,
  siteId: string,
) {
  const { data, error } = await client.rpc("is_production_manager", {
    p_site_id: siteId,
  });
  if (error) throw new HttpError(error.message, 500);
  if (!data) {
    throw new HttpError(
      "Apenas o gestor de produção da obra pode executar esta ação.",
      403,
    );
  }
}

/** Remove o prefixo do bucket quando o caminho vem com ele. */
export function stripBucketPrefix(path: string, bucket: string) {
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
}

/** Baixa um objeto do bucket privado e devolve em base64 para a IA. */
export async function downloadAsBase64(
  client: SupabaseClient,
  bucket: string,
  path: string,
): Promise<{ base64: string; mimeType: string }> {
  const { data, error } = await client.storage
    .from(bucket)
    .download(stripBucketPrefix(path, bucket));

  if (error || !data) {
    throw new HttpError(
      `Não foi possível ler o arquivo ${path}: ${error?.message ?? "não encontrado"}`,
      404,
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return { base64: btoa(binary), mimeType: data.type || "application/octet-stream" };
}
