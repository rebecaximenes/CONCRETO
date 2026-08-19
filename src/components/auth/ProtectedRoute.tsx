import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Porta de entrada das telas autenticadas. Sem sessao vai para /login; com
 * sessao mas sem profile ativo mostra o erro em vez de deixar a tela vazia
 * (RS-01).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileError, reloadProfile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Não foi possível abrir seu acesso</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {profileError ??
                "Seu perfil ainda não foi criado. Fale com o gestor de produção."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reloadProfile()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
