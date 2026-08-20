import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Timer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type { ProfileRole } from "@/integrations/supabase/types";
import { ALL_ROLES } from "./roles";

export interface NavItem {
  /** Rota exatamente como em docs/PAGINAS.md. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Papeis (site_members.site_role) que enxergam o item. */
  roles: ProfileRole[];
  /** false enquanto a pagina ainda nao foi construida (fases 2 e 3). */
  ready: boolean;
  /** Fase do docs/PLANO.md em que a pagina entra. */
  phase: 1 | 2 | 3;
}

const MANAGER_ONLY: ProfileRole[] = ["production_manager"];

/**
 * Menu do app. A ordem segue o fluxo de obra do docs/PROCESSO.md:
 * painel -> concretagens -> aprovacao -> laudos -> alertas -> pendencias.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Painel",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
    ready: true,
    phase: 1,
  },
  {
    to: "/concretagens",
    label: "Concretagens",
    icon: ClipboardList,
    roles: ALL_ROLES,
    ready: true,
    phase: 2,
  },
  {
    to: "/obras",
    label: "Obras",
    icon: Building2,
    roles: ALL_ROLES,
    ready: true,
    phase: 2,
  },
  {
    to: "/aprovacoes",
    label: "Aprovações",
    icon: ClipboardCheck,
    roles: MANAGER_ONLY,
    ready: true,
    phase: 2,
  },
  {
    to: "/laudos",
    label: "Laudos",
    icon: FileText,
    roles: MANAGER_ONLY,
    ready: true,
    phase: 2,
  },
  {
    to: "/alertas",
    label: "Alertas",
    icon: AlertTriangle,
    roles: ALL_ROLES,
    ready: true,
    phase: 2,
  },
  {
    to: "/pendencias",
    label: "Pendências",
    icon: Timer,
    roles: ALL_ROLES,
    ready: true,
    phase: 2,
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: TrendingUp,
    roles: MANAGER_ONLY,
    ready: true,
    phase: 3,
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ALL_ROLES,
    ready: true,
    phase: 3,
  },
];

export function navItemsForRole(role: ProfileRole | null): NavItem[] {
  if (!role) return NAV_ITEMS.filter((item) => item.to === "/");
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
