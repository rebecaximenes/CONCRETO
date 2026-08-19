import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
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
