import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true enquanto a sessao inicial e o profile ainda estao sendo resolvidos. */
  loading: boolean;
  /** Erro de carregamento do profile (a tela mostra "tentar novamente"). */
  profileError: string | null;
  reloadProfile: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

/** Mensagens do Supabase Auth traduzidas para a equipe de obra. */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  }
  if (normalized.includes("expired")) {
    return "O link expirou. Peça um novo link mágico.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  if (normalized.includes("failed to fetch")) {
    return "Sem conexão — o login precisa de internet.";
  }
  return message;
}

export class AuthError extends Error {}

function raise(message: string): never {
  throw new AuthError(translateAuthError(message));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const userId = session?.user.id ?? null;

  const loadProfile = React.useCallback(async (id: string) => {
    setProfileError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError("Não foi possível carregar seu perfil.");
      return;
    }

    // RS-01: sessao sem profile ativo nao acessa o sistema.
    if (data && !data.is_active) {
      setProfile(null);
      setProfileError(
        "Seu acesso está desativado. Fale com o gestor de produção.",
      );
      await supabase.auth.signOut();
      return;
    }

    setProfile(data);
  }, []);

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // O listener e registrado antes do getSession para nao perder eventos
    // disparados durante a resolucao da sessao inicial (magic link, refresh).
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (!nextSession) setProfile(null);
      },
    );

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));

    return () => subscription.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    loadProfile(userId).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, loadProfile]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileError,
      reloadProfile: async () => {
        if (userId) await loadProfile(userId);
      },
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) raise(error.message);
      },
      signInWithMagicLink: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) raise(error.message);
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/login` },
        );
        if (error) raise(error.message);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading, profileError, userId, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  }
  return context;
}
