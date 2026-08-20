import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Plus,
  Timer,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/use-dashboard";
import { useOnline } from "@/hooks/use-online";
import type { ConcretingStatus } from "@/integrations/supabase/types";
import { isProductionManager } from "@/config/roles";
import { useSite } from "@/providers/SiteProvider";
import { useSync } from "@/providers/SyncProvider";

const STATUS_LABEL: Record<ConcretingStatus, string> = {
  in_progress: "Em andamento",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

const STATUS_VARIANT: Record<
  ConcretingStatus,
  "default" | "secondary" | "warning" | "success" | "destructive"
> = {
  in_progress: "secondary",
  pending_approval: "warning",
  approved: "success",
  rejected: "destructive",
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof ClipboardList;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { activeSite, activeRole, memberships, isLoading: sitesLoading } =
    useSite();
  const online = useOnline();
  const { pending, isSyncing, syncNow } = useSync();
  const dashboard = useDashboard(activeSite?.siteId ?? null);

  if (sitesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  // Estado vazio da fundacao: usuario autenticado sem vinculo em site_members.
  if (memberships.length === 0) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <Building2 className="size-6 text-muted-foreground" aria-hidden />
          <CardTitle>Você ainda não participa de nenhuma obra</CardTitle>
          <CardDescription>
            O gestor de produção precisa incluir você como membro da obra para
            que os registros de campo apareçam aqui.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data = dashboard.data;
  const loading = dashboard.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {activeSite?.site.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão do dia — concretagens, ensaios pendentes e não conformidades.
          </p>
        </div>
        <Button disabled title="Disponível na fase 2">
          <Plus />
          Nova concretagem
        </Button>
      </div>

      {!online ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Exibindo dados offline</AlertTitle>
          <AlertDescription>
            Sem conexão no momento. Os números podem estar desatualizados até a
            próxima sincronização.
          </AlertDescription>
        </Alert>
      ) : null}

      {dashboard.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Não foi possível carregar o painel</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Verifique a conexão e tente novamente.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void dashboard.refetch()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Concretagens hoje"
          value={data?.todayConcretings.length ?? 0}
          icon={ClipboardList}
          loading={loading}
        />
        <SummaryCard
          label="Aguardando aprovação"
          value={data?.pendingApprovalCount ?? 0}
          icon={ClipboardCheck}
          loading={loading}
        />
        <SummaryCard
          label="Ensaios pendentes (7/28 dias)"
          value={data?.pendingTestsCount ?? 0}
          icon={Timer}
          loading={loading}
        />
        <SummaryCard
          label="Alertas abertos"
          value={data?.openAlertsCount ?? 0}
          icon={AlertTriangle}
          loading={loading}
        />
      </div>

      {pending.length > 0 ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Aguardando sincronização</CardTitle>
            <CardDescription>
              {pending.length} registro(s) salvos no aparelho. Eles sobem sozinhos
              quando a conexão voltar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y text-sm">
              {pending.map((item) => (
                <li key={item.client_local_id} className="py-2">
                  <p className="font-medium">{item.label}</p>
                  {item.last_error ? (
                    <p className="text-xs text-destructive">{item.last_error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              disabled={!online || isSyncing}
              onClick={() => void syncNow()}
            >
              {isSyncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Concretagens de hoje</CardTitle>
          <CardDescription>
            Cada concretagem reúne os recebimentos de caminhão e os lançamentos
            na laje do dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : data && data.todayConcretings.length > 0 ? (
            <ul className="divide-y">
              {data.todayConcretings.map((concreting) => (
                <li
                  key={concreting.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="font-medium">
                    {concreting.title ?? "Concretagem sem título"}
                  </span>
                  <Badge variant={STATUS_VARIANT[concreting.status]}>
                    {STATUS_LABEL[concreting.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                Nenhuma concretagem hoje.
              </p>
              <Button variant="outline" disabled title="Disponível na fase 2">
                <Plus />
                Iniciar concretagem
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas de não conformidade</CardTitle>
          <CardDescription>
            Abertos quando o fck medido no laudo fica abaixo do fck exigido pela
            peça.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-14" />
          ) : data && data.openAlerts.length > 0 ? (
            <ul className="divide-y">
              {data.openAlerts.map((alert) => (
                <li key={alert.id} className="flex flex-wrap gap-2 py-3 text-sm">
                  <Badge variant="destructive">{alert.age_days} dias</Badge>
                  <span>
                    medido <strong>{alert.measured_fck} MPa</strong> — exigido{" "}
                    <strong>{alert.required_fck} MPa</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhum alerta aberto nesta obra.
            </p>
          )}
        </CardContent>
      </Card>

      {isProductionManager(activeRole) ? (
        <p className="text-xs text-muted-foreground">
          Aprovações, laudos e relatórios do gestor entram nas fases 2 e 3 do
          plano.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          As telas de recebimento do caminhão e de lançamento na laje entram na
          fase 2 do plano.{" "}
          <Link to="/" className="underline">
            Atualizar painel
          </Link>
        </p>
      )}
    </div>
  );
}
