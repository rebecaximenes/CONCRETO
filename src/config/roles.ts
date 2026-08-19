import type { ProfileRole } from "@/integrations/supabase/types";

/**
 * Papeis do dominio (docs/PROCESSO.md). O papel efetivo e SEMPRE o
 * `site_members.site_role` da obra ativa — `profiles.role` e apenas o papel
 * padrao com que o profissional foi cadastrado.
 */
export const ROLE_LABEL: Record<ProfileRole, string> = {
  receiving_tech: "Técnico de recebimento",
  slab_tech: "Técnico de rastreabilidade na laje",
  field_tech: "Técnico de campo",
  production_manager: "Gestor de produção",
};

export const ROLE_SHORT_LABEL: Record<ProfileRole, string> = {
  receiving_tech: "Recebimento",
  slab_tech: "Laje",
  field_tech: "Campo",
  production_manager: "Gestor",
};

export const ALL_ROLES: ProfileRole[] = [
  "receiving_tech",
  "slab_tech",
  "field_tech",
  "production_manager",
];

export function isProductionManager(role: ProfileRole | null | undefined) {
  return role === "production_manager";
}
