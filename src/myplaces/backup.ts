// Everything Atlas keeps in this browser (places, animals, fields, projects,
// plans, decks, quizzes…) as one file to back up or move to another device.
// The Atlas AI settings are left out: they can hold an API key.
import { h } from "../ui/dom";

const SKIP = new Set(["atlas.ai.v1"]);
const keys = () => {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith("atlas.") && !SKIP.has(k)) out.push(k); } } catch { /* storage blocked */ }
  return out.sort();
};

export interface Backup { app: "atlas"; version: 1; saved: string; data: Record<string, string> }

export function makeBackup(): Backup {
  const data: Record<string, string> = {};
  for (const k of keys()) data[k] = localStorage.getItem(k) ?? "";
  return { app: "atlas", version: 1, saved: new Date().toISOString(), data };
}

/** Checks a backup file and returns what it holds. */
export function readBackup(text: string): Backup {
  const b = JSON.parse(text) as Backup;
  if (!b || b.app !== "atlas" || typeof b.data !== "object") throw new Error("That file isn't an Atlas backup.");
  for (const [k, v] of Object.entries(b.data)) if (!k.startsWith("atlas.") || SKIP.has(k) || typeof v !== "string") throw new Error("That backup has unexpected contents.");
  return b;
}

export function restoreBackup(b: Backup) {
  for (const [k, v] of Object.entries(b.data)) localStorage.setItem(k, v);
}

/** Asks the browser not to clear Atlas's storage when space runs low. */
export function keepStorage() {
  void navigator.storage?.persist?.().catch(() => false);
}

/** The "Your data" row for the bottom of My Place. */
export function backupRow(toast: (m: string) => void): HTMLElement {
  const n = keys().filter((k) => k !== "atlas.welcomed" && k !== "atlas.recent-searches").length;
  const input = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const b = readBackup(await f.text());
      if (!confirm(`Restore the backup from ${new Date(b.saved).toLocaleString()}? It replaces the matching records in this browser.`)) return;
      restoreBackup(b);
      toast("Restored. Reloading…");
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast((e as Error).message);
    }
  } }) as HTMLInputElement;
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeBackup())], { type: "application/json" }));
    const a = h("a", { href: url, download: `atlas-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Backup saved. Keep it somewhere safe, or open it on another device with Restore.");
  };
  return h("section", { class: "backup-row" },
    h("div", {}, h("strong", {}, "Your data"), h("span", { class: "muted small" }, n ? `Places, animals, fields and projects are saved in this browser only. Back them up now and then.` : "Everything you add is saved in this browser only.")),
    h("div", { class: "backup-actions" },
      h("button", { class: "pill-btn", disabled: !n, onclick: save }, "Back up everything"),
      h("button", { class: "link-btn", onclick: () => input.click() }, "Restore…"), input));
}
