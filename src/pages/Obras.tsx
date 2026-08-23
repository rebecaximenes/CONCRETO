import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Layers, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/states";
import { isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type { Site } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";

type SiteForm = {
  id?: string;
  name: string;
  code: string;
  address: string;
  is_active: boolean;
};

const EMPTY_FORM: SiteForm = {
  name: "",
  code: "",
  address: "",
  is_active: true,
};

export default function Obras() {
  const { profile } = useAuth();
  const { memberships, activeRole, refetch: refetchSites } = useSite();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<SiteForm | null>(null);

  const canManage = isProductionManager(activeRole) ||
    profile?.role === "production_manager";

  const sitesQuery = useQuery({
    queryKey: ["sites", memberships.map((item) => item.siteId).join(",")],
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveSite = useMutation({
    mutationFn: async (values: SiteForm) => {
      const payload = {
        name: values.name.trim(),
        code: values.code.trim() || null,
        address: values.address.trim() || null,
        is_active: values.is_active,
      };

      if (values.id) {
        const { error } = await supabase
          .from("sites")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
        return values.id;
      }

      const { data, error } = await supabase
        .from("sites")
        .insert({ ...payload, created_by: profile!.id })
        .select("id")
        .single();
      if (error) throw error;

      // Quem cria a obra entra automaticamente como gestor dela, senao
      // ninguem enxerga a obra recem-criada (RLS por site_members).
      const { error: memberError } = await supabase
        .from("site_members")
        .insert({
          site_id: data.id,
          profile_id: profile!.id,
          site_role: "production_manager",
        });
      if (memberError) throw memberError;

      return data.id;
    },
    onSuccess: (_id, values) => {
      toast.success(values.id ? "Obra atualizada." : "Obra cadastrada.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
      refetchSites();
    },
    onError: (cause) => {
      toast.error(errorMessage(cause, "Não foi possível salvar a obra."));
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Obras"
        description="Cada obra tem suas próprias peças estruturais e equipe."
        action={
          canManage ? (
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus />
              Nova obra
            </Button>
          ) : null
        }
      />

      {sitesQuery.isLoading ? (
        <LoadingRows />
      ) : sitesQuery.isError ? (
        <ErrorState
          message={errorMessage(sitesQuery.error, "Falha ao carregar as obras.")}
          onRetry={() => void sitesQuery.refetch()}
        />
      ) : (sitesQuery.data ?? []).length === 0 ? (
        <EmptyState
          title={
            canManage
              ? "Cadastre a primeira obra"
              : "Você ainda não participa de nenhuma obra"
          }
          description={
            canManage
              ? "A obra é o escopo de tudo: concretagens, peças estruturais e permissões."
              : "Peça ao gestor de produção para incluir você na obra."
          }
          action={
            canManage ? (
              <Button onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus />
                Nova obra
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(sitesQuery.data ?? []).map((site) => (
            <Card key={site.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" aria-hidden />
                    {site.name}
                  </CardTitle>
                  <Badge variant={site.is_active ? "success" : "secondary"}>
                    {site.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {site.code ? `${site.code} · ` : ""}
                  {site.address ?? "Sem endereço cadastrado"}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/obras/${site.id}/pecas-estruturais`}>
                    <Layers />
                    Peças estruturais
                  </Link>
                </Button>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: site.id,
                        name: site.name,
                        code: site.code ?? "",
                        address: site.address ?? "",
                        is_active: site.is_active,
                      })
                    }
                  >
                    <Pencil />
                    Editar
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar obra" : "Nova obra"}</DialogTitle>
            <DialogDescription>
              O nome aparece no seletor de obra do cabeçalho.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveSite.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="site-name">Nome da obra</Label>
                <Input
                  id="site-name"
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Residencial Aurora"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-code">Código interno</Label>
                <Input
                  id="site-code"
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                  placeholder="AUR-01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-address">Endereço</Label>
                <Input
                  id="site-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="site-active">Obra ativa</Label>
                  <p className="text-xs text-muted-foreground">
                    Obras inativas somem do seletor, sem perder o histórico.
                  </p>
                </div>
                <Switch
                  id="site-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked })
                  }
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveSite.isPending}>
                  {saveSite.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
