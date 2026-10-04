// Saving to this browser's storage, without failing silently. Browsers cap a site's storage (about 5 MB
// for localStorage); past that a save throws. The work in memory carries on, but losing it on the next
// reload without a word would be the worst outcome for someone running a district or a city on it, so a
// failed save raises an "atlas:storage-full" event that the app turns into a clear warning.

export const STORAGE_FULL = "atlas:storage-full";

/** Saves a value as JSON. False (and a warning raised) if the browser refused it. */
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    const full = e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
    if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent(STORAGE_FULL, { detail: { key, full } }));
    return false;
  }
}

/** Reads a JSON value, or `fallback` if it's missing, unreadable or fails `ok`. */
export function loadJson<T>(key: string, fallback: T, ok: (v: unknown) => boolean = () => true): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw);
    return ok(v) ? (v as T) : fallback;
  } catch { return fallback; }
}

/** About how many bytes Atlas keeps in this browser (strings are stored as UTF-16). */
export function storageUsed(prefix = "atlas."): number {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(prefix)) n += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2; } } catch { /* blocked */ }
  return n;
}
