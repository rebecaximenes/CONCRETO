import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { supabase } from "@/integrations/supabase/client";
import type { ConcretingStatus } from "@/integrations/supabase/types";
import {
  CONCRETING_STATUS_LABEL,
  CONCRETING_STATUS_VARIANT,
} from "@/lib/concreting";
import { errorMessage, formatDate } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";
import { useSync } from "@/providers/SyncProvider";

interface ConcretingRow {
  id: string;
  title: string | null;
  concreting_date: string;
  status: ConcretingStatus;
  truck_receipts: { count: number }[];
  placement_records: { count: number }[];
}

export default function Concretagens() {
  const { activeSite } = useSite();
  const { pending } = useSync();
  const [status, setStatus] = React.useState<ConcretingStatus | "all">("all");
  const [date, setDate] = React.useState("");

  const siteId = activeSite?.siteId ?? null;

  const listQuery = useQuery({
    queryKey: ["concretings", siteId, status, date],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<ConcretingRow[]> => {
      let query = supabase
        .from("concretings")
        .select(
          "id, title, concreting_date, status, truck_receipts(count), placement_records(count)",
        )
        .eq("site_id", siteId!)
        .order("concreting_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (status !== "all") query = query.eq("status", status);
      if (date) query = query.eq("concreting_date", date);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ConcretingRow[];
    },
  });

  const rows = listQuery.data ?? [];

  // Concretagens abertas offline aparecem no topo, marcadas: o técnico precisa
  // enxergar o que ainda não subiu.
  const pendingConcretings = pending.filter(
    (item) =>
      item.entity === "concretings" &&
      (!activeSite || item.site_id === activeSite.siteId),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Concretagens"
        description="Cada concretagem junta os recebimentos de caminhão e os lançamentos na laje do dia."
        action={
          <Button asChild>
            <Link to="/concretagens/nova">
              <Plus />
              Nova concretagem
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="filtro-status">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ConcretingStatus | "all")}
            >
              <SelectTrigger id="filtro-status" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="pending_approval">Aguardando aprovação</SelectItem>
                <SelectItem value="approved">Aprovada</SelectItem>
                <SelectItem value="rejected">Rejeitada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filtro-data">Data</Label>
            <Input
              id="filtro-data"
              type="date"
              className="w-48"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {date || status !== "all" ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDate("");
                setStatus("all");
              }}
            >
              Limpar filtros
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {pendingConcretings.length > 0 ? (
        <div className="space-y-2">
          {pendingConcretings.map((item) => (
            <Card key={item.client_local_id} className="border-warning/50">
              <CardContent className="p-0">
                <Link
                  to={`/concretagens/${item.client_local_id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <ClipboardList
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      {String(item.payload.title ?? "Concretagem sem título")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(String(item.payload.concreting_date ?? ""))} ·
                      salva no aparelho
                    </p>
                  </div>
                  <Badge variant="warning">Aguardando sincronização</Badge>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <LoadingRows />
      ) : listQuery.isError ? (
        <ErrorState
          message={errorMessage(listQuery.error, "Falha ao carregar as concretagens.")}
          onRetry={() => void listQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma concretagem encontrada"
          description={
            date || status !== "all"
              ? "Nenhum registro com esses filtros."
              : "Comece registrando a concretagem do dia."
          }
          action={
            <Button asChild>
              <Link to="/concretagens/nova">
                <Plus />
                Iniciar concretagem
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id} className="transition-colors hover:border-primary/40">
              <CardContent className="p-0">
                <Link
                  to={`/concretagens/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <ClipboardList
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      {row.title ?? "Concretagem sem título"}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(row.concreting_date)} ·{" "}
                      {row.truck_receipts?.[0]?.count ?? 0} recebimento(s) ·{" "}
                      {row.placement_records?.[0]?.count ?? 0} lançamento(s)
                    </p>
                  </div>
                  <Badge variant={CONCRETING_STATUS_VARIANT[row.status]}>
                    {CONCRETING_STATUS_LABEL[row.status]}
                  </Badge>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
