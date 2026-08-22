import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { Toaster } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Alertas from "@/pages/Alertas";
import Aprovacoes from "@/pages/Aprovacoes";
import ConcretagemDetalhe from "@/pages/ConcretagemDetalhe";
import ConcretagemNova from "@/pages/ConcretagemNova";
import Concretagens from "@/pages/Concretagens";
import Configuracoes from "@/pages/Configuracoes";
import Dashboard from "@/pages/Dashboard";
import Lancamento from "@/pages/Lancamento";
import Laudos from "@/pages/Laudos";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Obras from "@/pages/Obras";
import Pecas from "@/pages/Pecas";
import Pendencias from "@/pages/Pendencias";
import Recebimento from "@/pages/Recebimento";
import Relatorios from "@/pages/Relatorios";
import PecasEstruturais from "@/pages/PecasEstruturais";
import { AuthProvider } from "@/providers/AuthProvider";
import { SiteProvider } from "@/providers/SiteProvider";
import { SyncProvider } from "@/providers/SyncProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Obra tem internet instavel: nao refaz a consulta a cada foco e
      // mantem o ultimo dado em tela enquanto revalida.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      // `offlineFirst` deixa a consulta rodar mesmo sem conexao — as telas de
      // campo leem tambem a fila local, entao nao podem ficar pausadas.
      networkMode: "offlineFirst",
    },
    mutations: {
      // CRITICO: no padrao `online` o React Query PAUSA a mutation enquanto o
      // aparelho esta sem rede — o registro de campo nunca chegaria a ser
      // gravado na fila local, que e justamente o ponto do modo offline.
      networkMode: "always",
    },
  },
});

/** Quem tiver o link antigo de /tracos cai no cadastro que o substituiu. */
function RedirectToPecasEstruturais() {
  const { siteId = "" } = useParams();
  return <Navigate to={`/obras/${siteId}/pecas-estruturais`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SiteProvider>
            <SyncProvider>
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
                  <Route
                    path="/obras/:siteId/pecas-estruturais"
                    element={<PecasEstruturais />}
                  />
                  {/* O cadastro de tracos virou o de pecas estruturais. */}
                  <Route
                    path="/obras/:siteId/tracos"
                    element={<RedirectToPecasEstruturais />}
                  />
                  <Route path="/obras/:siteId/pecas" element={<Pecas />} />
                  <Route path="/concretagens" element={<Concretagens />} />
                  <Route
                    path="/concretagens/nova"
                    element={<ConcretagemNova />}
                  />
                  <Route
                    path="/concretagens/:id"
                    element={<ConcretagemDetalhe />}
                  />
                  <Route
                    path="/recebimento/:concretingId"
                    element={<Recebimento />}
                  />
                  <Route
                    path="/lancamento/:concretingId"
                    element={<Lancamento />}
                  />
                  <Route path="/aprovacoes" element={<Aprovacoes />} />
                  <Route path="/laudos" element={<Laudos />} />
                  <Route path="/alertas" element={<Alertas />} />
                  <Route path="/pendencias" element={<Pendencias />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                  <Route path="/404" element={<NotFound />} />
                </Route>
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </SyncProvider>
          </SiteProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
