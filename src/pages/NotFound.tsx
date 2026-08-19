import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        O endereço acessado não existe no RastreConcreto.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao painel</Link>
      </Button>
    </div>
  );
}
