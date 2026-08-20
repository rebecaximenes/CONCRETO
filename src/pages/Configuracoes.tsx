import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCog, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingRows, PageHeader } from "@/components/states";
import { ALL_ROLES, ROLE_LABEL, isProductionManager } from "@/config/roles";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileRole } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";

interface MemberRow {
  id: string;
  profile_id: string;
  site_role: ProfileRole;
  profiles: { full_name: string; email: string; is_active: boolean } | null;
}

export default function Configuracoes() {
  const { profile, reloadProfile } = useAuth();
  const { activeSite, activeRole, refetch } = useSite();
  const queryClient = useQueryClient();

  const siteId = activeSite?.siteId ?? null;
  const canManage = isProductionManager(activeRole);

  const [fullName, setFullName] = React.useState(profile?.full_name ?? "");
  const [phone, setPhone] = React.useState(profile?.phone ?? "");

  React.useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  const membersQuery = useQuery({
    queryKey: ["site-members", siteId],
    enabled: Boolean(siteId),
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("site_members")
        .select("id, profile_id, site_role, profiles!inner(full_name, email, is_active)")
        .eq("site_id", siteId!);
      if (error) throw error;
      return (data ?? []) as unknown as MemberRow[];
    },
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Perfil atualizado.");
      await reloadProfile();
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível salvar o perfil.")),
  });

  const changeRole = useMutation({
    mutationFn: async (input: { id: string; role: ProfileRole }) => {
      const { error } = await supabase
        .from("site_members")
        .update({ site_role: input.role })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel atualizado nesta obra.");
      void queryClient.invalidateQueries({ queryKey: ["site-members", siteId] });
      refetch();
    },
    onError: (cause) =>
      toast.error(errorMessage(cause, "Não foi possível alterar o papel.")),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configurações"
        description="Seu perfil e a equipe da obra ativa."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="size-4 text-muted-foreground" aria-hidden />
            Meu perfil
          </CardTitle>
          <CardDescription>{profile?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveProfile.mutate();
            }}
          >
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="min-w-44 space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Equipe de {activeSite?.site.name ?? "obra"}
          </CardTitle>
          <CardDescription>
            O papel vale por obra: a mesma pessoa pode ser gestor aqui e técnico
            em outra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersQuery.isLoading ? (
            <LoadingRows rows={2} />
          ) : membersQuery.isError ? (
            <ErrorState
              message={errorMessage(membersQuery.error, "Falha ao carregar a equipe.")}
              onRetry={() => void membersQuery.refetch()}
            />
          ) : (
            <ul className="divide-y">
              {(membersQuery.data ?? []).map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {member.profiles?.full_name ?? "Sem nome"}
                      {member.profile_id === profile?.id ? " (você)" : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.profiles?.email}
                      {member.profiles?.is_active === false ? " · inativo" : ""}
                    </p>
                  </div>

                  {canManage ? (
                    <Select
                      value={member.site_role}
                      onValueChange={(value) =>
                        changeRole.mutate({
                          id: member.id,
                          role: value as ProfileRole,
                        })
                      }
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">
                      {ROLE_LABEL[member.site_role]}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Para incluir alguém novo, cadastre a pessoa no Supabase Auth e
              adicione o vínculo em <code>site_members</code>. O convite pelo app
              entra em uma próxima etapa.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
