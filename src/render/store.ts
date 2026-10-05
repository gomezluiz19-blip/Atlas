// Captures and models you've brought in, kept on this device (IndexedDB), so a studio session survives a reload.
// Files can be tens of megabytes, far past what localStorage holds; every failure just means "not kept".
import type { Capture } from "./splat/globe";

const DB = "atlas-studio", STORE = "captures";
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, go: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = go(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const listCaptures = async () => ((await run<Capture[]>("readonly", (s) => s.getAll())) ?? []).sort((a, b) => a.name.localeCompare(b.name));
export const saveCapture = (c: Capture) => run("readwrite", (s) => s.put(c)).then((r) => r !== undefined);
export const deleteCapture = (id: string) => run("readwrite", (s) => s.delete(id));
