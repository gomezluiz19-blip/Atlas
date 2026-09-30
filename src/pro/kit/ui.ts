// Screens and map drawing the Pro tools share: a layer of points, lines and
// areas plus living streams for what moves, KPI tiles, list rows, and small
// editors for places, moves, people and issues. Each tool composes these with
// its own screens.
import type { App } from "../../app";
import { FlowOverlay, type FlowLine } from "../../globe/flow";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { arc } from "../../work/journey";
import { WorkLayer, type WorkFeature } from "../../work/layer";
import { newId } from "../../work/store";
import {
  FLOW_COLORS, fmt, kmBetween, kmText, MODES, moodOf, MOODS, moveFacts, today,
  type Issue, type Mode, type Mood, type Move, type Party, type Per, type Site,
} from "./ops";

export type Catalog = Record<string, { label: string; emoji: string }>;

/** A tool's own layer on the globe and its streams. */
export class OpsMap {
  private layer: WorkLayer | null = null;
  private streams: FlowOverlay | null = null;
  constructor(private app: App, private id: string, private color: string) {}
  draw(label: string, features: WorkFeature[], lines: FlowLine[] = []) {
    this.layer ??= new WorkLayer(this.app, this.id, label, this.color);
    this.streams ??= new FlowOverlay(this.app.globe.viewer, { maxHeight: Number.POSITIVE_INFINITY, maxDrops: 2600 });
    this.layer.set(features, label);
    this.streams.set(lines);
    this.streams.show(lines.length > 0);
  }
  clear() { this.layer?.clear(); this.streams?.set([]); }
}

/** An arc between two points with drops travelling along it; `weight` 0–1 makes it busier (pure-ish). */
export function arcFlow(id: string, a: { lon: number; lat: number }, b: { lon: number; lat: number }, color: string, weight: number, dashed = false): { line: WorkFeature; flow: FlowLine } {
  const pts = arc([a.lon, a.lat], [b.lon, b.lat], 64).flat() as [number, number][];
  const km = Math.max(1, kmBetween(a, b));
  const w = 0.4 + Math.log10(1 + Math.max(0, Math.min(1, weight)) * 9);
  return {
    line: { id, kind: "line", pts, color, dashed },
    flow: { pts, color, speed: Math.max(20, (km * 1000) / 6), density: Math.max(4, (40 * w) / Math.max(1, km / 20)), size: 1.6 + w * 1.4, arc: Math.min(400_000, km * 40) },
  };
}

/** A move drawn as an arc with drops travelling along it; bigger moves are busier. */
export const stream = (a: Site, b: Site, m: Move, biggest: number) => arcFlow(m.id, a, b, FLOW_COLORS[m.kind], m.amount / Math.max(1, biggest), m.mode === "digital");

/** Flies to show every point. */
export function frame(app: App, name: string, pts: { lon: number; lat: number }[], min = 3000) {
  if (!pts.length) return;
  let w = 180, e = -180, s = 90, n = -90;
  for (const p of pts) { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  const r = Math.max(min, Math.min(7_000_000, Math.hypot((e - w) * 111_000 * Math.cos(((s + n) / 2) * Math.PI / 180), (n - s) * 111_000) / 2));
  void flyToPlace(app.globe, { name, lon: (w + e) / 2, lat: (s + n) / 2, radius: r });
}

export const kpis = (...items: ([string, string] | [string, string, boolean] | [string, string, boolean, () => void])[]) =>
  h("div", { class: "po-kpis" }, ...items.map(([v, l, alert, go]) => h(go ? "button" : "div", { class: "po-kpi" + (alert ? " alert" : ""), ...(go ? { onclick: go } : {}) }, h("strong", {}, v), h("span", {}, l))));

export const title = (t: string) => h("h2", { class: "group-title" }, t);
export const lines = (...items: (string | false | null | undefined)[]) => {
  const l = items.filter(Boolean) as string[];
  return l.length ? h("div", { class: "now-here" }, h("ul", { class: "now-lines" }, ...l.map((t) => h("li", {}, t)))) : "";
};
export const empty = (t: string) => h("p", { class: "muted small" }, t);

/** A tappable row: an emoji or a coloured dot, a title, a line under it, and an optional badge on the right. */
export function row(lead: string | { color: string }, head: string, sub: string, onclick?: () => void, badge?: HTMLElement) {
  return h("button", { class: "list-row", onclick: onclick ?? (() => {}) },
    typeof lead === "string" ? h("span", { class: "story-mini-emoji" }, lead) : h("span", { class: "dot", style: `background:${lead.color}` }),
    h("span", { class: "list-text" }, h("span", { class: "list-title" }, head), h("span", { class: "list-sub" }, sub)),
    badge ?? h("span", { class: "chev", html: "&rsaquo;" }));
}
export const list = (...rows: HTMLElement[]) => h("div", { class: "list" }, ...rows);

/** "12 days" style badge: how long, red when stale. */
export const ageBadge = (n: number, unit: string, alert = false) => h("span", { class: "po-days" + (alert ? " stale" : "") }, h("strong", {}, String(n)), h("small", {}, unit));

export function field(label: string, input: HTMLElement) { return h("label", { class: "po-field" }, h("span", {}, label), input); }
export function select<T extends string>(value: T, options: [T, string][], set: (v: T) => void) {
  return h("select", { onchange: (e: Event) => set((e.target as HTMLSelectElement).value as T) }, ...options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
}
export function input(value: string | number, set: (v: string) => void, attrs: Record<string, unknown> = {}) {
  return h("input", { value: String(value), onchange: (e: Event) => set((e.target as HTMLInputElement).value.trim()), ...attrs });
}

/** Add a place by address or name, with its kind. */
export function siteAdder(ctx: WorkCtx, kinds: Catalog, add: (s: Site) => void, placeholder = "Add a place: an address, town or port") {
  const box = h("input", { class: "pro-url", placeholder }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...Object.entries(kinds).map(([k, v]) => h("option", { value: k }, `${v.emoji} ${v.label}`))) as HTMLSelectElement;
  const go = async () => {
    const q = box.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (!r) { ctx.app.toast("Couldn't find that place. Try adding the town or country.", 4000); return; }
    add({ id: newId(), name: q, kind: kind.value, lon: r.lon, lat: r.lat });
  };
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") void go(); });
  return h("div", { class: "po-add" }, box, kind, h("button", { class: "pill-btn", onclick: () => void go() }, "Add"));
}

/** Edit (or add) something that moves between two places. */
export function moveScreen(ctx: WorkCtx, sites: Site[], kinds: Catalog, m: Move | null, save: (m: Move, fresh: boolean) => void, remove: (m: Move) => void, back: () => void, hint = "Ore, concentrate, crew, supplies…") {
  const fresh = !m;
  const x: Move = m ?? { id: newId(), from: sites[0]?.id ?? "", to: sites[1]?.id ?? "", what: "", kind: "goods", amount: 1, unit: "t", per: "month", mode: "truck" };
  const opts = sites.map((s) => [s.id, `${kinds[s.kind]?.emoji ?? "•"} ${s.name}`] as [string, string]);
  const facts = h("p", { class: "muted small" });
  const update = () => {
    const a = sites.find((s) => s.id === x.from), b = sites.find((s) => s.id === x.to);
    if (!a || !b) return;
    const r = moveFacts(x, a, b);
    facts.textContent = x.mode === "digital" ? "Moves instantly." : `${kmText(r.km)} on the way, about ${hoursText(r.hours)} door to door${r.co2t ? `; ${fmt(r.co2t, 1)} t CO₂ a year` : ""}.`;
  };
  update();
  ctx.show(fresh ? "Something that moves" : x.what, back,
    field("What", input(x.what, (v) => (x.what = v), { placeholder: hint })),
    field("Kind", select(x.kind, [["goods", "Goods"], ["people", "People"], ["money", "Money"], ["data", "Data"]], (v) => { x.kind = v; x.unit = v === "people" ? "people" : v === "money" ? "USD" : v === "data" ? "reports" : "t"; update(); })),
    field("From", select(x.from, opts, (v) => { x.from = v; update(); })),
    field("To", select(x.to, opts, (v) => { x.to = v; update(); })),
    h("label", { class: "po-field" }, h("span", {}, "How much"), input(x.amount, (v) => { x.amount = Number(v) || 0; update(); }, { type: "number", min: 0, step: "any" }),
      input(x.unit, (v) => { x.unit = v || x.unit; update(); }, { class: "po-unit" })),
    field("Every", select(x.per, (["day", "week", "month", "year"] as Per[]).map((p) => [p, p]), (v) => { x.per = v; update(); })),
    field("By", select(x.mode, (Object.keys(MODES) as Mode[]).map((k) => [k, MODES[k].label]), (v) => { x.mode = v; update(); })),
    facts,
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => { if (!x.what || !x.from || !x.to || x.from === x.to) { ctx.app.toast("Name it, and pick two different places.", 3500); return; } save(x, fresh); } }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => remove(x) }, "Remove") : ""));
}

export function hoursText(hours: number): string {
  if (hours <= 0) return "no time";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 36) return `${Math.round(hours)} h`;
  const d = hours / 24;
  return d < 14 ? `${d.toFixed(d < 3 ? 1 : 0)} days` : `${Math.round(d / 7)} weeks`;
}

/** A person or group: their mood, notes, and a dated log of every contact. */
export function partyScreen(ctx: WorkCtx, p: Party, kinds: Catalog, save: () => void, remove: () => void, back: () => void) {
  const entry = h("textarea", { class: "pro-url", rows: 2, placeholder: "What happened: a meeting, a call, a promise made…" }) as HTMLTextAreaElement;
  const moodSel = h("select", { class: "po-stance", style: `--c:${moodOf(p.mood).color}`, onchange: (e: Event) => { p.mood = (e.target as HTMLSelectElement).value as Mood; (e.target as HTMLElement).style.setProperty("--c", moodOf(p.mood).color); save(); } },
    ...MOODS.map((m) => h("option", { value: m.id, selected: m.id === p.mood }, m.label)));
  ctx.show(p.name, back,
    h("p", { class: "muted small" }, `${kinds[p.kind]?.emoji ?? ""} ${kinds[p.kind]?.label ?? p.kind}`),
    field("Mood", moodSel),
    field("Notes", input(p.notes ?? "", (v) => { p.notes = v || undefined; save(); }, { placeholder: "What matters to them" })),
    p.lon !== undefined ? h("button", { class: "link-btn", onclick: () => void flyToPlace(ctx.app.globe, { name: p.name, lon: p.lon!, lat: p.lat!, radius: 3000 }) }, "Show on the map") : "",
    title("Log"),
    entry,
    h("button", { class: "pill-btn", onclick: () => { const t = entry.value.trim(); if (!t) return; p.log.unshift({ at: today(), text: t }); save(); partyScreen(ctx, p, kinds, save, remove, back); } }, "Add to the log"),
    h("div", { class: "po-log" }, ...p.log.map((l) => h("p", {}, h("small", {}, l.at), " ", l.text))),
    h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${p.name}?`)) remove(); } }, "Remove"));
}

/** An issue (a grievance, an incident): its status, and an update that resets its clock. */
export function issueScreen(ctx: WorkCtx, i: Issue | null, parties: Party[], sites: Site[], save: (i: Issue, fresh: boolean) => void, back: () => void, noun = "issue") {
  const fresh = !i;
  const x: Issue = i ?? { id: newId(), title: "", opened: today(), updated: today(), status: "open", severity: 2 };
  ctx.show(fresh ? `A new ${noun}` : x.title, back,
    field("What", input(x.title, (v) => (x.title = v), { placeholder: noun === "grievance" ? "Dust over the school, a blocked path…" : "What happened" })),
    field("Raised by", select(x.party ?? "", [["", "—"], ...parties.map((p) => [p.id, p.name] as [string, string])], (v) => (x.party = v || undefined))),
    field("Where", select(x.site ?? "", [["", "—"], ...sites.map((s) => [s.id, s.name] as [string, string])], (v) => (x.site = v || undefined))),
    field("How serious", select(String(x.severity) as "1" | "2" | "3", [["1", "Low"], ["2", "Medium"], ["3", "High"]], (v) => (x.severity = Number(v) as 1 | 2 | 3))),
    field("Status", select(x.status, [["open", "Open"], ["waiting", "Waiting on someone"], ["closed", "Closed"]], (v) => (x.status = v))),
    h("button", { class: "primary-btn", onclick: () => { if (!x.title) { ctx.app.toast(`Say what the ${noun} is.`, 3000); return; } x.updated = today(); save(x, fresh); } }, fresh ? "Log it" : "Save and mark updated today"));
}
