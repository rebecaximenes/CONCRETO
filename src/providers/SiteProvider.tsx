import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ProfileRole, Site } from "@/integrations/supabase/types";
import { useAuth } from "./AuthProvider";

const ACTIVE_SITE_STORAGE_KEY = "rastreconcreto.active-site";

export interface MembershipSite {
  siteId: string;
  /** Papel efetivo do usuario NAQUELA obra (site_members.site_role). */
  siteRole: ProfileRole;
  site: Pick<Site, "id" | "name" | "code" | "address" | "is_active">;
}

interface SiteContextValue {
  memberships: MembershipSite[];
  activeSite: MembershipSite | null;
  /** Papel efetivo na obra ativa — base de toda decisao de permissao na UI. */
  activeRole: ProfileRole | null;
  setActiveSiteId: (siteId: string) => void;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const SiteContext = React.createContext<SiteContextValue | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;

  const [activeSiteId, setActiveSiteIdState] = React.useState<string | null>(
    () => localStorage.getItem(ACTIVE_SITE_STORAGE_KEY),
  );

  const membershipsQuery = useQuery({
    queryKey: ["site-memberships", profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<MembershipSite[]> => {
      const { data, error } = await supabase
        .from("site_members")
        .select(
          "site_id, site_role, sites!inner(id, name, code, address, is_active)",
        )
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const site = row.sites as unknown as MembershipSite["site"];
          return {
            siteId: row.site_id,
            siteRole: row.site_role as ProfileRole,
            site,
          };
        })
        .filter((membership) => membership.site?.is_active);
    },
  });

  const memberships = React.useMemo(
    () => membershipsQuery.data ?? [],
    [membershipsQuery.data],
  );

  const activeSite = React.useMemo(() => {
    if (memberships.length === 0) return null;
    return (
      memberships.find((item) => item.siteId === activeSiteId) ?? memberships[0]
    );
  }, [memberships, activeSiteId]);

  // Mantem a obra ativa valida: se a lista mudou (perdeu acesso, obra
  // desativada), cai para a primeira obra disponivel.
  React.useEffect(() => {
    if (activeSite && activeSite.siteId !== activeSiteId) {
      setActiveSiteIdState(activeSite.siteId);
      localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, activeSite.siteId);
    }
  }, [activeSite, activeSiteId]);

  const setActiveSiteId = React.useCallback((siteId: string) => {
    setActiveSiteIdState(siteId);
    localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
  }, []);

  const value = React.useMemo<SiteContextValue>(
    () => ({
      memberships,
      activeSite,
      activeRole: activeSite?.siteRole ?? null,
      setActiveSiteId,
      isLoading: membershipsQuery.isLoading,
      isError: membershipsQuery.isError,
      refetch: () => {
        void membershipsQuery.refetch();
      },
    }),
    [memberships, activeSite, setActiveSiteId, membershipsQuery],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = React.useContext(SiteContext);
  if (!context) {
    throw new Error("useSite precisa estar dentro de <SiteProvider>.");
  }
  return context;
}
