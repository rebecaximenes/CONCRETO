import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  size?: "sm" | "lg";
  /** Em fundo escuro (record-hero) o texto fica claro. */
  tone?: "light" | "dark";
}

/**
 * Marca do RastreConcreto no padrao da Construtora Record: barra vinho,
 * nome do produto em destaque e a assinatura da construtora ao lado.
 */
export function BrandMark({
  className,
  size = "sm",
  tone = "dark",
}: BrandMarkProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "brand-bar rounded-sm",
          size === "lg" ? "h-10 w-1.5" : "h-6 w-1",
        )}
      />
      <span
        className={cn(
          "leading-tight tracking-tight",
          size === "lg" ? "text-2xl" : "text-base",
          tone === "light" ? "text-primary-foreground" : "text-foreground",
        )}
      >
        <span className="font-bold">RastreConcreto</span>
        <span
          className={cn(
            "mx-2 font-light",
            tone === "light" ? "opacity-60" : "text-muted-foreground",
          )}
        >
          |
        </span>
        <span
          className={cn(
            "font-light",
            tone === "light" ? "opacity-90" : "text-muted-foreground",
          )}
        >
          Construtora Record
        </span>
      </span>
    </span>
  );
}
