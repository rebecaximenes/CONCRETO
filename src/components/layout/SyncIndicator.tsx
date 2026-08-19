import { Cloud, CloudOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/use-online";

/**
 * Indicador de sincronizacao do cabecalho. Na Fase 1 reporta apenas o estado
 * da conexao; a contagem de registros na fila entra junto com a fila offline
 * (`sync-offline-batch`, Fase 3).
 */
export function SyncIndicator({ className }: { className?: string }) {
  const online = useOnline();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        online
          ? "bg-success/10 text-success"
          : "bg-warning/15 text-warning-foreground",
        className,
      )}
      title={
        online
          ? "Conectado — os registros são enviados na hora"
          : "Sem conexão — os registros ficam no aparelho e sincronizam depois"
      }
    >
      {online ? (
        <Cloud className="size-3.5" aria-hidden />
      ) : (
        <CloudOff className="size-3.5" aria-hidden />
      )}
      {online ? "Sincronizado" : "Offline"}
    </span>
  );
}
