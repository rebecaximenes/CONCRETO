import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Alertas from "@/pages/Alertas";
import Aprovacoes from "@/pages/Aprovacoes";
import ConcretagemDetalhe from "@/pages/ConcretagemDetalhe";
import ConcretagemNova from "@/pages/ConcretagemNova";
import Concretagens from "@/pages/Concretagens";
import Dashboard from "@/pages/Dashboard";
import Lancamento from "@/pages/Lancamento";
import Laudos from "@/pages/Laudos";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Obras from "@/pages/Obras";
import Pecas from "@/pages/Pecas";
import Pendencias from "@/pages/Pendencias";
import Recebimento from "@/pages/Recebimento";
import Tracos from "@/pages/Tracos";
import { AuthProvider } from "@/providers/AuthProvider";
import { SiteProvider } from "@/providers/SiteProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Obra tem internet instavel: nao refaz a consulta a cada foco e
      // mantem o ultimo dado em tela enquanto revalida.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SiteProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/obras" element={<Obras />} />
                <Route path="/obras/:siteId/tracos" element={<Tracos />} />
                <Route path="/obras/:siteId/pecas" element={<Pecas />} />
                <Route path="/concretagens" element={<Concretagens />} />
                <Route path="/concretagens/nova" element={<ConcretagemNova />} />
                <Route path="/concretagens/:id" element={<ConcretagemDetalhe />} />
                <Route
                  path="/recebimento/:concretingId"
                  element={<Recebimento />}
                />
                <Route path="/lancamento/:concretingId" element={<Lancamento />} />
                <Route path="/aprovacoes" element={<Aprovacoes />} />
                <Route path="/laudos" element={<Laudos />} />
                <Route path="/alertas" element={<Alertas />} />
                <Route path="/pendencias" element={<Pendencias />} />
                <Route path="/404" element={<NotFound />} />
              </Route>
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </SiteProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
