import { Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/use-online";
import { useSync } from "@/providers/SyncProvider";

/**
 * Estado da sincronizacao no cabecalho: conexao, quantos registros ainda estao
 * no aparelho e o botao de enviar agora.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const online = useOnline();
  const { pendingCount, isSyncing, syncNow } = useSync();

  const label = isSyncing
    ? "Sincronizando..."
    : pendingCount > 0
      ? `${pendingCount} pendente${pendingCount > 1 ? "s" : ""}`
      : online
        ? "Sincronizado"
        : "Offline";

  const tone = isSyncing
    ? "bg-primary-foreground/15 text-primary-foreground"
    : pendingCount > 0
      ? "bg-warning/20 text-warning-foreground"
      : online
        ? "bg-success/15 text-success-foreground"
        : "bg-primary-foreground/15 text-primary-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone,
        className,
      )}
      title={
        pendingCount > 0
          ? "Registros salvos no aparelho, aguardando conexão para subir."
          : online
            ? "Tudo enviado ao servidor."
            : "Sem conexão — os registros ficam no aparelho e sincronizam depois."
      }
    >
      {isSyncing ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : online ? (
        <Cloud className="size-3.5" aria-hidden />
      ) : (
        <CloudOff className="size-3.5" aria-hidden />
      )}
      {label}
      {pendingCount > 0 && online && !isSyncing ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-1 h-5 gap-1 px-1.5 text-xs hover:bg-primary-foreground/20"
          onClick={() => void syncNow()}
        >
          <RefreshCw className="size-3" />
          Enviar
        </Button>
      ) : null}
    </span>
  );
}
