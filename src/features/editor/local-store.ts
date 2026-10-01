import type { Patch } from "./pdf-browser";
export interface LocalDraft {
  name: string;
  bytes: Uint8Array;
  patches: Patch[];
  page: number;
}
export async function openLocalStore(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open("pdf-patch-local", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("draft");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(new Error("No se pudo abrir el almacenamiento local."));
  request.onblocked = () =>
    reject(
      new Error(
        "Cierra otras pestañas del editor para abrir el almacenamiento local.",
      ),
    );
  return promise;
}
export async function readDraft(): Promise<LocalDraft | undefined> {
  const db = await openLocalStore();
  const { promise, resolve, reject } = Promise.withResolvers<
    LocalDraft | undefined
  >();
  const transaction = db.transaction("draft", "readonly");
  const request = transaction.objectStore("draft").get("current");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(new Error("No se pudo recuperar el documento local."));
  transaction.oncomplete = () => db.close();
  transaction.onabort = () => {
    db.close();
    reject(new Error("La lectura local se interrumpió."));
  };
  return promise;
}
export async function saveDraft(draft: LocalDraft | null): Promise<void> {
  const db = await openLocalStore();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const transaction = db.transaction("draft", "readwrite");
  const store = transaction.objectStore("draft");
  if (draft) store.put(draft, "current");
  else store.delete("current");
  transaction.oncomplete = () => {
    db.close();
    resolve();
  };
  transaction.onabort = () => {
    db.close();
    reject(
      new Error(
        "No se pudo guardar: espacio local insuficiente o almacenamiento bloqueado.",
      ),
    );
  };
  return promise;
}
