/**
 * IndexedDB cru, sem dependencia externa. Guarda a fila de registros feitos
 * offline — inclusive as fotos, como Blob — ate a conexao voltar.
 */

const DB_NAME = "rastreconcreto";
const DB_VERSION = 1;
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_local_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function dbPut<T>(value: T): Promise<IDBValidKey> {
  return run("readwrite", (store) => store.put(value));
}

export function dbGetAll<T>(): Promise<T[]> {
  return run<T[]>("readonly", (store) => store.getAll());
}

export function dbDelete(key: string): Promise<undefined> {
  return run("readwrite", (store) => store.delete(key));
}
