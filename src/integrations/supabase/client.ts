import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Sinaliza se as credenciais do Supabase foram configuradas (.env). Sem elas o
 * app sobe, mas nao autentica — a UI mostra o aviso de configuracao em vez de
 * quebrar em branco.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient<Database>(
  supabaseUrl ?? "http://localhost:54321",
  supabaseAnonKey ?? "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "rastreconcreto.auth",
    },
  },
);
