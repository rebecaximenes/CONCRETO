import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo preenchido pela leitura automatica com a marca de "conferido" ao lado.
 *
 * A conferencia e o motivo da tela existir: quem recebe o caminhao precisa
 * bater a placa que chegou com a que esta na nota. Por isso o valor continua
 * editavel (a leitura erra) e a marca fica sempre visivel, nunca escondida
 * atras de um botao.
 */
export function CheckedField({
  id,
  label,
  hint,
  value,
  onValueChange,
  checked,
  onCheckedChange,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onValueChange: (value: string) => void;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(checked && "border-primary")}
          {...inputProps}
        />
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm"
          htmlFor={`${id}-conferido`}
        >
          {/* Checkbox nativo: alvo de toque grande e sem dependencia nova. */}
          <input
            id={`${id}-conferido`}
            type="checkbox"
            className="size-5 accent-[oklch(var(--primary))]"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
          />
          <span
            className={cn(
              "flex items-center gap-1",
              checked ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {checked ? <Check className="size-3.5" aria-hidden /> : null}
            Conferido
          </span>
        </label>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
