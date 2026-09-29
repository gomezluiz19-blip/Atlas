// Watch a place: any lens that gives a verdict ("good time for birding",
// "surf's up", "aurora reaching here") can keep an eye on a place for you.
// Atlas checks while it's open (and when you come back), and tells you when
// the verdict turns good: a notification if you've allowed them, and a note
// in the Watching list either way. With Atlas's servers, watches follow you
// between devices (and, once the scheduled job is on, alerts arrive with
// Atlas closed; see docs/backend.md).
import type { App } from "../app";
import { deletePrivate, pullPrivate, pushPrivate } from "../cloud/sync";
import { judgeLens, lensJudges, type Judgement } from "../lenses/custom";
import { findLens } from "../lenses/library";
import type { Subject } from "../lenses/types";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";

export interface Watch {
  id: string;
  lens: string;
  subject: Subject;
  created: number;
  last?: Judgement;
  /** When we last told them it was good (so a good spell alerts once). */
  told?: number;
}

const KEY = "atlas.watches.v1";
const read = (): Watch[] => { try { return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Watch[]).filter((w) => w && w.lens && w.subject); } catch { return []; } };
const write = (w: Watch[]) => { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* full */ } };

export const watches = read;
const GOOD = 0.75;
const EVERY = 30 * 60_000;

export function createWatch(app: App, deps: { openLens(id: string, s: Subject): void; onChange(): void }) {
  const listeners = new Set<() => void>();
  const changed = () => { deps.onChange(); for (const f of listeners) f(); };

  async function notify(w: Watch, j: Judgement) {
    const d = findLens(w.lens);
    const title = `${d?.icon ?? "🔔"} ${d?.name ?? "Watch"}: ${j.label.toLowerCase()} at ${w.subject.name}`;
    const body = j.why.join(" · ");
    app.toast(`${title}. ${body}`, 7000);
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await reg.showNotification(title, { body, tag: `watch-${w.id}`, icon: "./icon.svg", data: { url: `${location.pathname}#/w/${w.id}` } });
      else new Notification(title, { body, tag: `watch-${w.id}` });
    } catch { /* notifications blocked */ }
  }

  let checking = false;
  /** Checks every watch (or one), in turn; tells when one turns good. */
  async function check(only?: string) {
    if (checking) return;
    checking = true;
    try {
      for (const w of read().filter((x) => !only || x.id === only)) {
        const d = findLens(w.lens);
        if (!d) continue;
        const j = await judgeLens(app, w.subject, d).catch(() => null);
        if (!j) continue;
        const all = read(), i = all.findIndex((x) => x.id === w.id);
        if (i < 0) continue;
        const was = all[i].last?.score ?? 0;
        all[i].last = j;
        // Good now, and not good last time (or we haven't said so for 12 hours).
        if (j.score >= GOOD && (was < GOOD || !all[i].told || Date.now() - all[i].told! > 12 * 3_600_000)) {
          all[i].told = Date.now();
          void notify(all[i], j);
        }
        write(all);
        pushPrivate("watch", w.id, all[i]);
        changed();
      }
    } finally { checking = false; }
  }

  function add(lensId: string, s: Subject) {
    const d = findLens(lensId);
    if (!d) return;
    if (!lensJudges(d)) { app.toast("This lens doesn't say when it's a good time, so there's nothing to watch.", 4000); return; }
    const all = read();
    if (all.some((w) => w.lens === lensId && Math.abs(w.subject.lon - s.lon) < 1e-4 && Math.abs(w.subject.lat - s.lat) < 1e-4)) { app.toast(`Already watching ${s.name} for ${d.name.toLowerCase()}.`, 3000); return; }
    const w: Watch = { id: Math.random().toString(36).slice(2, 10), lens: lensId, subject: { ...s }, created: Date.now() };
    write([w, ...all]);
    pushPrivate("watch", w.id, w);
    changed();
    app.toast(`🔔 Watching ${s.name} for ${d.name.toLowerCase()}. Atlas will tell you when it's a good time.`, 5000);
    // Ask for notifications once, right after the first watch: the moment it makes sense.
    if (typeof Notification !== "undefined" && Notification.permission === "default") setTimeout(() => void Notification.requestPermission().catch(() => {}), 900);
    void check(w.id);
  }

  function remove(id: string) {
    write(read().filter((w) => w.id !== id));
    deletePrivate("watch", id);
    changed();
  }

  // ---- The Watching panel ----
  const panel = h("section", { class: "popover watch-panel", hidden: true, role: "dialog", "aria-label": "Watching" });
  (document.getElementById("ui") ?? document.body).append(panel);
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function render() {
    const all = read();
    panel.replaceChildren(
      h("div", { class: "about-head" }, h("h2", { class: "group-title" }, "Watching"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (panel.hidden = true) })),
      all.length ? h("div", { class: "wt-list" }, ...all.map((w) => {
        const d = findLens(w.lens);
        const j = w.last;
        return h("div", { class: `wt-row ${j ? (j.score >= GOOD ? "good" : j.score >= 0.45 ? "fair" : "poor") : ""}` },
          h("button", { class: "wt-main", onclick: () => { panel.hidden = true; void flyToPlace(app.globe, { name: w.subject.name, lon: w.subject.lon, lat: w.subject.lat, radius: Math.max(1500, w.subject.radius) }); deps.openLens(w.lens, w.subject); } },
            h("span", { class: "wt-icon" }, d?.icon ?? "🔔"),
            h("span", {}, h("strong", {}, `${d?.name ?? "A lens"} · ${w.subject.name}`), h("small", {}, j ? `${j.face} ${j.label} · ${j.why[0] ?? ""} · checked ${ago(j.at)}` : "Checking…"))),
          h("button", { class: "icon-btn", "aria-label": "Stop watching", html: icons.close, onclick: () => { remove(w.id); render(); } }));
      })) : h("p", { class: "muted small" }, "Open a lens that gives a verdict (Birdwatching, Surf check, Stargazing, Aurora watch…) on any place and tap “Tell me when”. Atlas checks for you."),
      all.length ? h("div", { class: "wt-foot" },
        h("button", { class: "pill-btn", onclick: () => void check().then(render) }, "Check now"),
        typeof Notification !== "undefined" && Notification.permission !== "granted"
          ? h("button", { class: "link-btn", onclick: () => void Notification.requestPermission().then(render) }, Notification.permission === "denied" ? "Notifications are blocked in this browser" : "Allow notifications") : "") : "",
      h("p", { class: "fineprint" }, "Atlas checks every half hour while it's open, and when you come back."));
  }
  listeners.add(() => { if (!panel.hidden) render(); });

  // Pull watches made on other devices, then check: now (a moment after opening) and every half hour.
  void pullPrivate("watch").then((rows) => {
    if (!rows.length) return;
    const have = new Map(read().map((w) => [w.id, w]));
    for (const r of rows) if (!have.has(r.id)) have.set(r.id, r.body as Watch);
    write([...have.values()]);
    changed();
  }).catch(() => {});
  setTimeout(() => void check(), 20_000);
  setInterval(() => { if (document.visibilityState === "visible") void check(); }, EVERY);
  document.addEventListener("visibilitychange", () => {
    const stale = read().some((w) => !w.last || Date.now() - w.last.at > EVERY);
    if (document.visibilityState === "visible" && stale) void check();
  });

  return {
    add, remove, check, panel,
    open() { render(); panel.hidden = false; },
    count: () => read().length,
    good: () => read().filter((w) => (w.last?.score ?? 0) >= GOOD).length,
  };
}
