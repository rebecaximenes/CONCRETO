import { Building2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/providers/SiteProvider";

/** Seletor de obra ativa — toda a tela passa a ser lida no escopo dela. */
export function SiteSwitcher() {
  const { memberships, activeSite, setActiveSiteId, isLoading } = useSite();

  if (isLoading) return <Skeleton className="h-11 w-48" />;

  if (memberships.length === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="size-4" aria-hidden />
        Nenhuma obra
      </span>
    );
  }

  if (memberships.length === 1) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        {activeSite?.site.name}
      </span>
    );
  }

  return (
    <Select
      value={activeSite?.siteId}
      onValueChange={(value) => setActiveSiteId(value)}
    >
      <SelectTrigger className="w-full sm:w-64" aria-label="Obra ativa">
        <SelectValue placeholder="Selecione a obra" />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((membership) => (
          <SelectItem key={membership.siteId} value={membership.siteId}>
            {membership.site.name}
            {membership.site.code ? ` (${membership.site.code})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
