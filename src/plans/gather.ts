// Everything you've planned, from every part of Atlas, as dated places: trip
// stops and journeys, events and field trips, building phases, and from the
// Pro tools, office events, fixtures, permits, commitments, deliveries and
// deals. Read straight from what's saved in this browser, so it always
// matches. Plus the one colour scale they share: darker is sooner.
import { dateOf, timeline, type Journey } from "../work/journeyModel";
import type { Plan } from "../work/planModel";
import type { FieldTrip } from "../work/tripModel";
import { eta as shipEta, type Desk } from "../pro/shipping/model";
import { itemOf } from "../pro/relief/model";

export interface Planned {
  id: string; title: string; sub: string; date: string; lon: number; lat: number;
  source: string;
  /** Plans that are one journey share a group, drawn joined in order. */
  group?: string;
}

const read = <T>(key: string): T[] => { try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const centre = (pts: [number, number][]) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] as [number, number];

/** From saved journeys: each move's arrival and each stay, dated (pure). */
export function fromJourney(j: Journey, source = "Journey"): Planned[] {
  if (!j.start) return [];
  const out: Planned[] = [];
  const tl = timeline(j);
  tl.rows.forEach((r, i) => {
    if (r.step.kind === "move") out.push({ id: `${j.id}:${i}`, title: `${r.step.to.name}`, sub: `${j.name} · arrive`, date: dateOf(r.end), lon: r.step.to.lon, lat: r.step.to.lat, source, group: j.id });
    else out.push({ id: `${j.id}:${i}`, title: r.step.label ?? r.step.place.name, sub: `${j.name} · ${r.step.nights ? `${r.step.nights} night${r.step.nights === 1 ? "" : "s"}` : "stop"}`, date: dateOf(r.start), lon: r.step.place.lon, lat: r.step.place.lat, source, group: j.id });
  });
  return out;
}

/** From plans: dated trip stops, and an event's day at its venue (pure). */
export function fromPlan(p: Plan): Planned[] {
  const out: Planned[] = [];
  for (const it of p.items) if (it.date && it.pts.length) { const [lon, lat] = it.kind === "point" ? it.pts[0] : centre(it.pts); out.push({ id: `${p.id}:${it.id}`, title: it.name, sub: p.name, date: it.date, lon, lat, source: p.type === "trip" ? "Trip" : "Plan", group: p.id }); }
  if (p.program) out.push(...fromJourney(p.program, "Event"));
  return out;
}

/** Everything saved in this browser that has a date and a place (reads localStorage). */
export function gatherAll(): Planned[] {
  const out: Planned[] = [];
  for (const p of read<Plan>("atlas.work.plans.v1")) out.push(...fromPlan(p));
  for (const j of read<Journey>("atlas.work.journeys.v1")) out.push(...fromJourney(j, "Trip"));
  for (const f of read<FieldTrip>("atlas.work.trips.v1")) if (f.date && f.dest) out.push({ id: f.id, title: f.title || f.dest.name, sub: `Field trip · ${f.students} students`, date: f.date, lon: f.dest.lon, lat: f.dest.lat, source: "Field trip" });
  for (const b of read<{ id: string; name: string; ring: [number, number][]; phases: { id: string; start: string }[] }>("atlas.work.build.v1")) {
    if (!b.ring?.length) continue;
    const [lon, lat] = centre(b.ring);
    for (const ph of b.phases ?? []) out.push({ id: `${b.id}:${ph.id}`, title: `${b.name}: ${ph.id} starts`, sub: "Build", date: ph.start, lon, lat, source: "Build" });
  }
  for (const o of read<{ id: string; name: string; events: { id: string; title: string; date: string; place?: { name: string; lon: number; lat: number } }[] }>("atlas.pro.offices.v1"))
    for (const e of o.events ?? []) if (e.place) out.push({ id: e.id, title: e.title, sub: `${o.name} · ${e.place.name}`, date: e.date, lon: e.place.lon, lat: e.place.lat, source: "Office" });
  for (const c of read<{ id: string; name: string; ground: { lon: number; lat: number }; fixtures: { id: string; date: string; opponent: string; home: boolean; venue: { name: string; lon: number; lat: number } }[] }>("atlas.pro.clubs.v1"))
    for (const f of c.fixtures ?? []) out.push({ id: f.id, title: `${f.home ? "Home" : "Away"} vs ${f.opponent}`, sub: `${c.name} · ${f.venue.name}`, date: f.date, lon: f.venue.lon, lat: f.venue.lat, source: "Fixture" });
  for (const m of read<{ id: string; name: string; sites: { id: string; name: string; lon: number; lat: number }[]; parties: { id: string; name: string; lon?: number; lat?: number }[]; permits: { id: string; title: string; date: string; site?: string }[]; commitments?: { id: string; text: string; due: string; to?: string; status: string }[] }>("atlas.pro.mines.v1")) {
    const main = m.sites[0];
    for (const p of m.permits ?? []) { const s = m.sites.find((x) => x.id === p.site) ?? main; if (s) out.push({ id: p.id, title: `${p.title} expires`, sub: m.name, date: p.date, lon: s.lon, lat: s.lat, source: "Permit" }); }
    for (const c of (m.commitments ?? []).filter((x) => x.status === "open")) { const p = m.parties.find((x) => x.id === c.to); const at = p?.lon !== undefined ? { lon: p.lon, lat: p.lat! } : main; if (at) out.push({ id: c.id, title: c.text, sub: `${m.name}${p ? ` · to ${p.name}` : ""}`, date: c.due, lon: at.lon, lat: at.lat, source: "Commitment" }); }
  }
  for (const p of read<{ id: string; name: string; sites: { id: string; name: string; lon: number; lat: number }[]; deliveries: { id: string; title: string; date: string; site?: string }[] }>("atlas.pro.field.v1"))
    for (const d of p.deliveries ?? []) { const s = p.sites.find((x) => x.id === d.site) ?? p.sites[0]; if (s) out.push({ id: d.id, title: d.title, sub: `${p.name} · ${s.name}`, date: d.date, lon: s.lon, lat: s.lat, source: "Delivery" }); }
  for (const c of read<{ id: string; name: string; accounts: { id: string; site: string; lon: number; lat: number }[]; opps: { id: string; product: string; close: string; stage: string; account?: string; prospect?: { name: string; lon: number; lat: number } }[] }>("atlas.pro.services.v1"))
    for (const o of (c.opps ?? []).filter((x) => x.stage !== "won" && x.stage !== "lost")) { const a = c.accounts.find((x) => x.id === o.account); const at = a ?? o.prospect; if (at) out.push({ id: o.id, title: `${o.product} closes`, sub: `${c.name} · ${a?.site ?? o.prospect?.name}`, date: o.close, lon: at.lon, lat: at.lat, source: "Deal" }); }
  for (const d of read<Desk>("atlas.pro.shipping.v1"))
    for (const sh of (d.shipments ?? []).filter((x) => x.stage !== "delivered")) {
      let when = sh.eta;
      try { when = shipEta(d, sh).eta; } catch { /* keep the promised date */ }
      out.push({ id: sh.id, title: `${sh.ref} arrives`, sub: `${d.name} · ${sh.cargo} · ${sh.dest.name}`, date: when, lon: sh.dest.lon, lat: sh.dest.lat, source: "Shipment" });
    }
  for (const r of read<{ id: string; name: string; hubs: { id: string; name: string; lon: number; lat: number }[]; moves: { id: string; item: string; qty: number; to: string; arrives: string; status: string }[] }>("atlas.pro.relief.v1"))
    for (const m of (r.moves ?? []).filter((x) => x.status !== "delivered")) { const to = r.hubs.find((x) => x.id === m.to); if (to) out.push({ id: m.id, title: `${itemOf(m.item)?.name ?? m.item} reaches ${to.name}`, sub: `${r.name} · ${m.qty} ${itemOf(m.item)?.unit ?? ""}`, date: m.arrives, lon: to.lon, lat: to.lat, source: "Relief" }); }
  return out.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(x.lon) && Number.isFinite(x.lat)).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- One colour, darker is sooner --------------------------------------------------------------------

export const HUE = 214;
const dayMs = 86_400_000;
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / dayMs);

/**
 * The shade for something `d` days away (pure): today is the darkest blue,
 * the far end of the horizon the palest; past plans turn grey.
 */
export function shade(d: number, horizon = 90): string {
  if (d < 0) return "hsl(220, 6%, 62%)";
  // Square root, so the next few weeks spread across more of the scale.
  const t = Math.sqrt(Math.min(1, d / horizon));
  const light = 26 + t * 54, sat = 90 - t * 25;
  return `hsl(${HUE}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
}

/** Groups for the list: overdue or past, today, this week, this month, later (pure). */
export function bucket(d: number): "Past" | "Today" | "This week" | "This month" | "Later" {
  return d < 0 ? "Past" : d === 0 ? "Today" : d <= 7 ? "This week" : d <= 31 ? "This month" : "Later";
}

/** hsl() to #rrggbb (the map layer wants hex; pure). */
export function toHex(hsl: string): string {
  const m = /hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/.exec(hsl);
  if (!m) return hsl;
  const hh = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => { const k = (n + hh * 12) % 12, a = s * Math.min(l, 1 - l); const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
