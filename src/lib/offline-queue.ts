import { dbDelete, dbGetAll, dbPut } from "./offline-db";

export type OutboxEntity =
  | "concretings"
  | "truck_receipts"
  | "placement_records";

export interface OutboxPhoto {
  blob: Blob;
  name: string;
  type: string;
}

export interface OutboxItem {
  client_local_id: string;
  entity: OutboxEntity;
  site_id: string;
  /** Corpo que vai para a Edge Function `sync-offline-batch`. */
  payload: Record<string, unknown>;
  /** Fotos guardadas no aparelho, enviadas ao Storage depois do sync. */
  photos: OutboxPhoto[];
  created_at: string;
  /** Rotulo curto mostrado no painel de pendencias. */
  label: string;
  /** Ultimo erro de sincronizacao, quando o servidor recusou o item. */
  last_error?: string;
}

export async function enqueue(
  item: Omit<OutboxItem, "created_at">,
): Promise<void> {
  await dbPut<OutboxItem>({ ...item, created_at: new Date().toISOString() });
}

export async function listQueue(): Promise<OutboxItem[]> {
  const items = await dbGetAll<OutboxItem>();
  return items.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function removeFromQueue(clientLocalId: string): Promise<void> {
  await dbDelete(clientLocalId);
}

export async function markQueueError(
  clientLocalId: string,
  message: string,
): Promise<void> {
  const items = await listQueue();
  const item = items.find((entry) => entry.client_local_id === clientLocalId);
  if (item) await dbPut<OutboxItem>({ ...item, last_error: message });
}

/** Concretagens ainda so no aparelho, para a lista e o detalhe mostrarem. */
export async function listPendingConcretings(
  siteId: string | null,
): Promise<OutboxItem[]> {
  const items = await listQueue();
  return items.filter(
    (item) =>
      item.entity === "concretings" && (!siteId || item.site_id === siteId),
  );
}
