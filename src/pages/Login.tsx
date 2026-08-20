import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, Loader2, MailCheck, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOnline } from "@/hooks/use-online";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

type Mode = "password" | "magic-link";

export default function Login() {
  const { session, loading, signInWithPassword, signInWithMagicLink, sendPasswordReset } =
    useAuth();
  const location = useLocation();
  const online = useOnline();

  const [mode, setMode] = React.useState<Mode>("password");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const disabled = submitting || !online || !isSupabaseConfigured;

  async function run(action: () => Promise<void>, onSuccess?: () => void) {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      onSuccess?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível entrar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="record-hero flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="lg" tone="light" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary-foreground/70">
            Qualidade · Inovação · Sustentabilidade
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <Alert variant="warning">
            <AlertCircle />
            <AlertTitle>Supabase não configurado</AlertTitle>
            <AlertDescription>
              Preencha <code>VITE_SUPABASE_URL</code> e{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code>.
            </AlertDescription>
          </Alert>
        ) : null}

        {!online ? (
          <Alert variant="warning">
            <WifiOff />
            <AlertTitle>Sem conexão</AlertTitle>
            <AlertDescription>
              O login precisa de internet. Os registros de campo continuam
              funcionando offline depois que você entrar.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Use suas credenciais da Record para acessar a rastreabilidade do
              concreto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as Mode);
                setError(null);
                setMagicLinkSent(false);
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password">E-mail e senha</TabsTrigger>
                <TabsTrigger value="magic-link">Link mágico</TabsTrigger>
              </TabsList>

              <TabsContent value="password">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => signInWithPassword(email, password));
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      disabled={disabled}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="nome@construtorarecord.com.br"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      disabled={disabled}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={disabled}>
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    disabled={disabled}
                    onClick={() => {
                      if (!email) {
                        setError(
                          "Informe seu e-mail para receber o link de redefinição.",
                        );
                        return;
                      }
                      void run(
                        () => sendPasswordReset(email),
                        () =>
                          toast.success(
                            "Enviamos um link de redefinição para o seu e-mail.",
                          ),
                      );
                    }}
                  >
                    Esqueci minha senha
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="magic-link">
                {magicLinkSent ? (
                  <Alert variant="info">
                    <MailCheck />
                    <AlertTitle>Link enviado</AlertTitle>
                    <AlertDescription>
                      Abra o e-mail enviado para <strong>{email}</strong> e
                      clique no link para entrar.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () => signInWithMagicLink(email),
                        () => setMagicLinkSent(true),
                      );
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="magic-email">E-mail</Label>
                      <Input
                        id="magic-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        disabled={disabled}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="nome@construtorarecord.com.br"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={disabled}>
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        "Entrar com link mágico"
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>

            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle />
                <AlertTitle>Não foi possível entrar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-primary-foreground/60">
          Construtora Record — RastreConcreto · v0.1
        </p>
      </div>
    </div>
  );
}
