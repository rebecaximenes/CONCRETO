import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, formatDate, todayIso } from "@/lib/format";
import { useSite } from "@/providers/SiteProvider";

interface PendingRow {
  id: string;
  age_days: number;
  due_date: string;
  is_received: boolean;
  truck_receipts: {
    invoice_number: string;
    truck_number: string;
    concretings: { id: string; title: string | null; concreting_date: string } | null;
  } | null;
}

export default function Pendencias() {
  const { activeSite } = useSite();
  const siteId = activeSite?.siteId ?? null;

  const pendingQuery = useQuery({
    queryKey: ["pendencias", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<PendingRow[]> => {
      const { data, error } = await supabase
        .from("pending_tests")
        .select(
          `id, age_days, due_date, is_received,
           truck_receipts!inner(
             invoice_number, truck_number,
             concretings!inner(id, title, concreting_date, site_id)
           )`,
        )
        .eq("is_received", false)
        .eq("truck_receipts.concretings.site_id", siteId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingRow[];
    },
  });

  const rows = pendingQuery.data ?? [];
  const today = todayIso();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pendências de ensaio"
        description="Ensaios de 7 e 28 dias ainda sem resultado recebido, por caminhão."
      />

      {pendingQuery.isLoading ? (
        <LoadingRows />
      ) : pendingQuery.isError ? (
        <ErrorState
          message={errorMessage(pendingQuery.error, "Falha ao carregar as pendências.")}
          onRetry={() => void pendingQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum ensaio pendente"
          description="Todos os corpos de prova desta obra já tiveram o resultado recebido."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const overdue = row.due_date < today;
            return (
              <Card key={row.id} className={overdue ? "border-destructive/40" : ""}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <CalendarClock
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      {row.truck_receipts?.concretings?.title ??
                        "Concretagem sem título"}
                      <Badge variant="outline">{row.age_days} dias</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      NF {row.truck_receipts?.invoice_number ?? "—"} · caminhão{" "}
                      {row.truck_receipts?.truck_number ?? "—"} · concretagem de{" "}
                      {formatDate(row.truck_receipts?.concretings?.concreting_date)}
                    </p>
                  </div>
                  <Badge variant={overdue ? "destructive" : "secondary"}>
                    {overdue ? "Vencido em " : "Vence em "}
                    {formatDate(row.due_date)}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
