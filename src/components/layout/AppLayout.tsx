import * as React from "react";
import { Outlet } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ROLE_SHORT_LABEL } from "@/config/roles";
import { useAuth } from "@/providers/AuthProvider";
import { useSite } from "@/providers/SiteProvider";
import { RoleNav } from "./RoleNav";
import { SiteSwitcher } from "./SiteSwitcher";
import { SyncIndicator } from "./SyncIndicator";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { activeRole } = useSite();
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">
              Rastre<span className="text-muted-foreground">Concreto</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <SyncIndicator className="hidden sm:inline-flex" />
            <div className="hidden items-center gap-2 sm:flex">
              <Avatar>
                <AvatarFallback>
                  {initials(profile?.full_name ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <p className="text-sm font-medium">{profile?.full_name}</p>
                {activeRole ? (
                  <p className="text-xs text-muted-foreground">
                    {ROLE_SHORT_LABEL[activeRole]}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair"
              onClick={() => void signOut()}
            >
              <LogOut />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2">
          <SiteSwitcher />
          {activeRole ? (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {ROLE_SHORT_LABEL[activeRole]}
            </Badge>
          ) : null}
          <SyncIndicator className="ml-auto sm:hidden" />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r bg-background p-3 lg:block">
          <RoleNav />
        </aside>

        {menuOpen ? (
          <div className="fixed inset-0 top-[105px] z-30 bg-background p-3 lg:hidden">
            <RoleNav onNavigate={() => setMenuOpen(false)} />
            <Separator className="my-3" />
            <p className="px-3 text-xs text-muted-foreground">
              {profile?.full_name}
            </p>
          </div>
        ) : null}

        <main className="flex-1 px-4 py-5 pb-16 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
