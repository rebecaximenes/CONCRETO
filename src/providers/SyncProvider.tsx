import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/format";
import {
  listQueue,
  markQueueError,
  removeFromQueue,
  type OutboxItem,
} from "@/lib/offline-queue";
import { useAuth } from "./AuthProvider";

interface SyncContextValue {
  /** Quantos registros ainda estao só no aparelho. */
  pendingCount: number;
  pending: OutboxItem[];
  isSyncing: boolean;
  lastSyncAt: string | null;
  /** Recarrega a fila (chamado depois de gravar algo offline). */
  refreshQueue: () => Promise<void>;
  /** Envia a fila agora; devolve quantos registros subiram. */
  syncNow: (options?: { silent?: boolean }) => Promise<number>;
}

const SyncContext = React.createContext<SyncContextValue | undefined>(undefined);

interface SyncResponse {
  synced: Record<string, number>;
  id_map: Record<string, string>;
  conflicts: { client_local_id: string; reason: string }[];
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<OutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null);
  const syncingRef = React.useRef(false);

  const refreshQueue = React.useCallback(async () => {
    setPending(await listQueue());
  }, []);

  React.useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const syncNow = React.useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (syncingRef.current || !session || !navigator.onLine) return 0;

      const items = await listQueue();
      if (items.length === 0) return 0;

      syncingRef.current = true;
      setIsSyncing(true);

      try {
        const byEntity = {
          concretings: items.filter((item) => item.entity === "concretings"),
          truck_receipts: items.filter(
            (item) => item.entity === "truck_receipts",
          ),
          placement_records: items.filter(
            (item) => item.entity === "placement_records",
          ),
        };

        const { data, error } = await supabase.functions.invoke<SyncResponse>(
          "sync-offline-batch",
          {
            body: {
              concretings: byEntity.concretings.map((item) => item.payload),
              truck_receipts: byEntity.truck_receipts.map((item) => item.payload),
              placement_records: byEntity.placement_records.map(
                (item) => item.payload,
              ),
            },
          },
        );

        if (error || !data) throw error ?? new Error("Sincronização sem resposta.");

        const conflicts = new Map(
          data.conflicts.map((conflict) => [conflict.client_local_id, conflict.reason]),
        );

        let uploaded = 0;

        for (const item of items) {
          const conflict = conflicts.get(item.client_local_id);
          if (conflict) {
            await markQueueError(item.client_local_id, conflict);
            continue;
          }

          const serverId = data.id_map[item.client_local_id];
          if (!serverId) continue;

          // Fotos so podem subir agora: o caminho no bucket usa o id do
          // servidor, que só existe depois do upsert.
          if (item.photos.length > 0) {
            await uploadPhotos(item, serverId);
          }

          await removeFromQueue(item.client_local_id);
          uploaded += 1;
        }

        setLastSyncAt(new Date().toISOString());
        await refreshQueue();
        await queryClient.invalidateQueries();

        if (!silent && uploaded > 0) {
          toast.success(
            `${uploaded} registro(s) sincronizado(s) com o servidor.`,
          );
        }
        if (conflicts.size > 0) {
          toast.error(
            `${conflicts.size} registro(s) não puderam ser sincronizados. Veja as pendências.`,
          );
        }

        return uploaded;
      } catch (cause) {
        if (!silent) {
          toast.error(errorMessage(cause, "Não foi possível sincronizar agora."));
        }
        return 0;
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [session, queryClient, refreshQueue],
  );

  // Sincroniza ao recuperar a conexao e logo que o app abre logado.
  React.useEffect(() => {
    if (!session) return;

    const handleOnline = () => void syncNow({ silent: true });
    window.addEventListener("online", handleOnline);
    if (navigator.onLine) void syncNow({ silent: true });

    return () => window.removeEventListener("online", handleOnline);
  }, [session, syncNow]);

  const value = React.useMemo<SyncContextValue>(
    () => ({
      pendingCount: pending.length,
      pending,
      isSyncing,
      lastSyncAt,
      refreshQueue,
      syncNow,
    }),
    [pending, isSyncing, lastSyncAt, refreshQueue, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

async function uploadPhotos(item: OutboxItem, serverId: string) {
  if (item.entity === "truck_receipts") {
    const photo = item.photos[0];
    const extension = photo.name.split(".").pop() ?? "jpg";
    const path = `${item.site_id}/${serverId}.${extension}`;

    const { error } = await supabase.storage
      .from("invoice-photos")
      .upload(path, photo.blob, { upsert: true, contentType: photo.type });
    if (error) throw error;

    await supabase
      .from("truck_receipts")
      .update({ invoice_photo_path: path, ocr_status: "pending" })
      .eq("id", serverId);

    // Foto so chegou agora: a leitura da NF roda neste momento.
    await supabase.functions.invoke("extract-invoice-ocr", {
      body: { truck_receipt_id: serverId, invoice_photo_path: path },
    });
    return;
  }

  if (item.entity === "placement_records") {
    const rows: { placement_record_id: string; storage_path: string }[] = [];

    for (const [index, photo] of item.photos.entries()) {
      const extension = photo.name.split(".").pop() ?? "jpg";
      const path = `${item.site_id}/${serverId}/${index + 1}.${extension}`;
      const { error } = await supabase.storage
        .from("placement-photos")
        .upload(path, photo.blob, { upsert: true, contentType: photo.type });
      if (error) throw error;
      rows.push({ placement_record_id: serverId, storage_path: path });
    }

    if (rows.length > 0) {
      await supabase.from("placement_photos").insert(rows);
    }
  }
}

export function useSync() {
  const context = React.useContext(SyncContext);
  if (!context) {
    throw new Error("useSync precisa estar dentro de <SyncProvider>.");
  }
  return context;
}
