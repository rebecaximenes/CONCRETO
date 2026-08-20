import { AlertCircle, Inbox, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Estados de tela exigidos em toda pagina: vazio, carregando e erro. */

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Carregando</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-dashed shadow-none", className)}>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Inbox className="size-6 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  message = "Não foi possível carregar as informações.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Algo deu errado</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
