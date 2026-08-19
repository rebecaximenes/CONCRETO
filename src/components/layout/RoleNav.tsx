import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { navItemsForRole } from "@/config/nav";
import { useSite } from "@/providers/SiteProvider";

interface RoleNavProps {
  orientation?: "horizontal" | "vertical";
  onNavigate?: () => void;
}

/**
 * Menu montado a partir do papel efetivo na obra ativa
 * (`site_members.site_role`), nunca do papel global do profile.
 * Itens de fases seguintes aparecem desabilitados, como mapa do que vem.
 */
export function RoleNav({ orientation = "vertical", onNavigate }: RoleNavProps) {
  const { activeRole } = useSite();
  const items = navItemsForRole(activeRole);

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "gap-1",
        orientation === "vertical" ? "flex flex-col" : "flex flex-row flex-wrap",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;

        if (!item.ready) {
          return (
            <span
              key={item.to}
              aria-disabled
              title={`Disponível na fase ${item.phase}`}
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground/60"
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <span className="text-[10px] uppercase tracking-wide">
                em breve
              </span>
            </span>
          );
        }

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
