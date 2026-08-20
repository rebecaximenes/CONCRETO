import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

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
import { EmptyState } from "@/components/states";
import { useOnline } from "@/hooks/use-online";
import { supabase } from "@/integrations/supabase/client";
import { newClientLocalId } from "@/lib/concreting";
import { errorMessage, todayIso } from "@/lib/format";
import { enqueue } from "@/lib/offline-queue";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";
import { useSync } from "@/providers/SyncProvider";

export default function ConcretagemNova() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeSite } = useSite();
  const online = useOnline();
  const { refreshQueue } = useSync();

  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(todayIso());

  const create = useMutation({
    mutationFn: async () => {
      const clientLocalId = newClientLocalId();

      // Offline a concretagem já abre no aparelho: os recebimentos do dia
      // penduram nela pelo `client_local_id` e sobem juntos depois.
      if (!online) {
        await enqueue({
          client_local_id: clientLocalId,
          entity: "concretings",
          site_id: activeSite!.siteId,
          payload: {
            client_local_id: clientLocalId,
            site_id: activeSite!.siteId,
            title: title.trim() || null,
            concreting_date: date,
          },
          photos: [],
          label: `Concretagem ${title.trim() || "sem título"}`,
        });
        await refreshQueue();
        return clientLocalId;
      }

      const { data, error } = await supabase
        .from("concretings")
        .insert({
          site_id: activeSite!.siteId,
          title: title.trim() || null,
          concreting_date: date,
          created_by: profile!.id,
          // Nasce com o id do aparelho: e por ele que a sincronizacao
          // offline evita duplicar o registro depois.
          client_local_id: clientLocalId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(
        online
          ? "Concretagem iniciada."
          : "Concretagem aberta no aparelho. Ela sobe assim que a conexão voltar.",
      );
      navigate(`/concretagens/${id}`);
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível iniciar a concretagem.")),
  });

  if (!activeSite) {
    return (
      <EmptyState
        title="Selecione uma obra"
        description="A concretagem pertence a uma obra — escolha a obra ativa no cabeçalho."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/concretagens">
          <ArrowLeft />
          Concretagens
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova concretagem</CardTitle>
          <CardDescription>
            Abra a concretagem do dia em {activeSite.site.name} e depois registre os
            recebimentos de caminhão e os lançamentos na laje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Laje 3º pavimento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data da concretagem</Label>
              <Input
                id="data"
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                É essa data que conta os prazos dos ensaios de 7 e 28 dias.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Iniciar concretagem"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
