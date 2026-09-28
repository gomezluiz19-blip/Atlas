// A small persistent cache (IndexedDB) for slow, rarely-changing answers such
// as OpenStreetMap queries, so revisiting a place is instant and works through
// a flaky connection. Entries expire; every failure falls back to the network.

const DB = "atlas-cache", STORE = "responses";
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = run(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));
}

/** A short, stable key for a long request (FNV-1a). */
export function cacheKey(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
}

/** Returns the cached value, or computes, stores and returns it. */
export async function cached<T>(key: string, maxAgeMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = await tx<{ at: number; v: T }>("readonly", (s) => s.get(key));
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.v;
  try {
    const v = await compute();
    void tx("readwrite", (s) => s.put({ at: Date.now(), v }, key));
    return v;
  } catch (err) {
    // Offline or the service is down: an old answer beats none.
    if (hit) return hit.v;
    throw err;
  }
}
