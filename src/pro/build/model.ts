// Build Pro: a builder's or contractor's sites on the map. Each project has a
// schedule of tasks with their dependencies (worked out with the critical
// path method, on working days), the weather each task can't work in
// (concrete pours, crane lifts, roofing, exterior paint, earthworks) checked
// against the forecast, the money (earned value: are we ahead, behind, over,
// under), deliveries and their suppliers, the neighbours who'll hear it, and
// permits and inspections. Pure functions; the screens are in ui.ts.

export type Weather = "none" | "pour" | "crane" | "roof" | "paint" | "earth";
export const WEATHER: Record<Weather, { label: string; emoji: string; rule: string }> = {
  none: { label: "Any weather", emoji: "🏗", rule: "" },
  pour: { label: "Concrete pour", emoji: "🧱", rule: "no more than 2 mm of rain, 5–32 °C" },
  crane: { label: "Crane lifts", emoji: "🏗️", rule: "gusts under 60 km/h, wind under 40 km/h" },
  roof: { label: "Roofing", emoji: "🏠", rule: "no more than 1 mm of rain, gusts under 50 km/h" },
  paint: { label: "Exterior finishes", emoji: "🎨", rule: "dry, at least 10 °C" },
  earth: { label: "Earthworks", emoji: "🚜", rule: "under 10 mm of rain" },
};

export interface Day { date: string; rain: number; windMax: number; gustMax: number; tmin: number; tmax: number }

/** Can this kind of work go ahead in this day's weather, and if not, why (pure)? */
export function workable(kind: Weather, d: Day): { ok: boolean; why?: string } {
  switch (kind) {
    case "pour": return d.rain > 2 ? { ok: false, why: `${fmt1(d.rain)} mm rain` } : d.tmin < 5 ? { ok: false, why: `${Math.round(d.tmin)} °C low` } : d.tmax > 32 ? { ok: false, why: `${Math.round(d.tmax)} °C high` } : { ok: true };
    case "crane": return d.gustMax >= 60 ? { ok: false, why: `gusts ${Math.round(d.gustMax)} km/h` } : d.windMax >= 40 ? { ok: false, why: `wind ${Math.round(d.windMax)} km/h` } : { ok: true };
    case "roof": return d.rain > 1 ? { ok: false, why: `${fmt1(d.rain)} mm rain` } : d.gustMax >= 50 ? { ok: false, why: `gusts ${Math.round(d.gustMax)} km/h` } : { ok: true };
    case "paint": return d.rain > 0.5 ? { ok: false, why: `${fmt1(d.rain)} mm rain` } : d.tmin < 10 ? { ok: false, why: `${Math.round(d.tmin)} °C low` } : { ok: true };
    case "earth": return d.rain >= 10 ? { ok: false, why: `${fmt1(d.rain)} mm rain` } : { ok: true };
    default: return { ok: true };
  }
}
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

export interface Task {
  id: string; name: string; trade: string;
  /** Working days it takes. */
  days: number;
  /** Tasks that must finish first. */
  after: string[];
  weather: Weather;
  /** 0–1 done. */
  progress: number;
  /** Budget for the task. */
  budget: number;
  /** People on it while it runs. */
  crew?: number;
  /** Don't start before (a working day). */
  notBefore?: string;
}
export interface Delivery { id: string; what: string; supplier: string; lon?: number; lat?: number; date: string; window?: string; trucks: number; crane?: boolean; status: "booked" | "confirmed" | "delivered" }
export interface Permit { id: string; title: string; kind: "permit" | "inspection"; date: string; status: "pending" | "passed" | "failed" | "issued" }
export interface Rfi { id: string; title: string; opened: string; status: "open" | "answered"; cost?: number; days?: number }
export interface Project {
  id: string; name: string; client: string; kind: "residential" | "commercial" | "civil" | "industrial" | "education";
  lon: number; lat: number; address?: string;
  /** Contract value and the dates promised. */
  value: number; start: string; finish: string;
  /** Spent so far. */
  cost: number;
  tasks: Task[]; deliveries: Delivery[]; permits: Permit[]; rfis: Rfi[];
  log: { at: string; text: string }[];
  /** Working hours allowed on site. */
  hours?: string;
}
export interface Firm { id: string; name: string; demo?: boolean; created: number; projects: Project[] }

// ---- Working days ------------------------------------------------------------------------------------

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso + "T12:00:00Z");
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(ms(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
export const isWorkday = (iso: string) => { const d = new Date(ms(iso)).getUTCDay(); return d !== 0 && d !== 6; };
/** The same day if it's a working day, else the next one (pure). */
export const onWorkday = (iso: string) => { let d = iso; while (!isWorkday(d)) d = addDays(d, 1); return d; };
/** `n` working days after a working day (pure); 0 returns the day itself. */
export function addWorkdays(iso: string, n: number): string {
  let d = onWorkday(iso), left = Math.round(n);
  const step = left < 0 ? -1 : 1;
  while (left !== 0) { d = addDays(d, step); if (isWorkday(d)) left -= step; }
  return d;
}
/** Working days from a to b (pure): b's count minus a's. */
export function workdaysBetween(a: string, b: string): number {
  let n = 0;
  const step = b >= a ? 1 : -1;
  for (let d = a; d !== b; d = addDays(d, step)) if (isWorkday(addDays(d, step))) n += step;
  return n;
}

// ---- The schedule (critical path) --------------------------------------------------------------------

export interface Slot { task: Task; es: number; ef: number; ls: number; lf: number; float: number; critical: boolean; start: string; end: string }
export interface Schedule { slots: Slot[]; days: number; finish: string; cycle: boolean }

/**
 * The critical path method on working days from the project start (pure).
 * Early start and finish from a forward pass, late ones from a backward
 * pass; float is how long a task can slip without moving the finish, and the
 * critical ones have none. Remaining work only: progress shortens a task.
 */
export function schedule(p: Project, from = p.start): Schedule {
  const byId = new Map(p.tasks.map((t) => [t.id, t]));
  // Topological order (Kahn); a cycle is reported and its tasks placed at the end.
  const indeg = new Map(p.tasks.map((t) => [t.id, t.after.filter((x) => byId.has(x)).length]));
  const order: Task[] = [], queue = p.tasks.filter((t) => indeg.get(t.id) === 0);
  while (queue.length) {
    const t = queue.shift()!;
    order.push(t);
    for (const u of p.tasks) if (u.after.includes(t.id)) { indeg.set(u.id, indeg.get(u.id)! - 1); if (indeg.get(u.id) === 0) queue.push(u); }
  }
  const cycle = order.length < p.tasks.length;
  for (const t of p.tasks) if (!order.includes(t)) order.push(t);
  const dur = (t: Task) => Math.max(0, Math.ceil(t.days * (1 - Math.min(1, Math.max(0, t.progress)))));
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const t of order) {
    let s = t.notBefore ? Math.max(0, workdaysBetween(onWorkday(from), onWorkday(t.notBefore))) : 0;
    for (const a of t.after) if (ef.has(a)) s = Math.max(s, ef.get(a)!);
    es.set(t.id, s); ef.set(t.id, s + dur(t));
  }
  const days = Math.max(0, ...[...ef.values()]);
  const ls = new Map<string, number>(), lf = new Map<string, number>();
  for (const t of [...order].reverse()) {
    let f = days;
    for (const u of p.tasks) if (u.after.includes(t.id) && ls.has(u.id)) f = Math.min(f, ls.get(u.id)!);
    lf.set(t.id, f); ls.set(t.id, f - dur(t));
  }
  const day0 = onWorkday(from);
  const slots = order.map((t) => {
    const e = es.get(t.id)!, f = ef.get(t.id)!, l = ls.get(t.id)!, float = l - e;
    return { task: t, es: e, ef: f, ls: l, lf: lf.get(t.id)!, float, critical: float === 0 && dur(t) > 0, start: addWorkdays(day0, e), end: addWorkdays(day0, Math.max(e, f - 1)) };
  });
  return { slots, days, finish: addWorkdays(day0, Math.max(0, days - 1)), cycle };
}

// ---- Weather against the plan ------------------------------------------------------------------------

export interface Clash { slot: Slot; date: string; why: string; next?: string }
/** Weather-sensitive work planned on days the forecast rules out, with the next good day (pure). */
export function weatherClashes(p: Project, forecast: Day[], from: string): Clash[] {
  const s = schedule(p, from), out: Clash[] = [];
  const byDate = new Map(forecast.map((d) => [d.date, d]));
  for (const slot of s.slots) {
    if (slot.task.weather === "none" || slot.task.progress >= 1) continue;
    for (let d = slot.start; d <= slot.end; d = addWorkdays(d, 1)) {
      const day = byDate.get(d);
      if (!day) break;
      const w = workable(slot.task.weather, day);
      if (!w.ok) {
        const next = forecast.find((x) => x.date > d && isWorkday(x.date) && workable(slot.task.weather, x).ok)?.date;
        out.push({ slot, date: d, why: w.why!, next });
        break;
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** For each kind of weather-sensitive work, which forecast days are good (pure). */
export function windows(forecast: Day[]): Record<Exclude<Weather, "none">, { date: string; ok: boolean; why?: string }[]> {
  const kinds = ["pour", "crane", "roof", "paint", "earth"] as const;
  return Object.fromEntries(kinds.map((k) => [k, forecast.map((d) => ({ date: d.date, ...workable(k, d) }))])) as ReturnType<typeof windows>;
}

/**
 * Working days a month the weather will likely stop a kind of work, from
 * past years (pure): the share of days that fail the rule in each calendar
 * month, times the working days in it.
 */
export function lostDaysByMonth(kind: Weather, history: { date: string; tmin: number | null; tmax: number | null; rain: number | null }[]): number[] {
  const bad = Array(12).fill(0), all = Array(12).fill(0);
  for (const h of history) {
    if (h.rain === null || h.tmin === null || h.tmax === null) continue;
    const m = Number(h.date.slice(5, 7)) - 1;
    all[m]++;
    // History has no wind: cranes and roofs are judged on rain alone.
    if (!workable(kind, { date: h.date, rain: h.rain, tmin: h.tmin, tmax: h.tmax, windMax: 0, gustMax: 0 }).ok) bad[m]++;
  }
  return all.map((n, m) => (n ? Math.round((bad[m] / n) * 21.7 * 10) / 10 : 0));
}

// ---- Money: earned value -----------------------------------------------------------------------------

/**
 * Earned value against the plan as it was set (pure). Planned value is the
 * budget of work that should be done by today on the baseline (the schedule
 * from the project start with no progress); earned value is the budget of
 * work actually done; actual cost is what's been spent. CPI under 1 is over
 * budget, SPI under 1 is behind.
 */
export function earnedValue(p: Project, today: string) {
  const base = schedule({ ...p, tasks: p.tasks.map((t) => ({ ...t, progress: 0 })) }, p.start);
  const t0 = onWorkday(p.start);
  const elapsed = today < t0 ? 0 : workdaysBetween(t0, today) + 1;
  const bac = p.tasks.reduce((s, t) => s + t.budget, 0);
  let pv = 0;
  for (const s of base.slots) {
    const d = Math.max(1, s.ef - s.es);
    pv += s.task.budget * Math.min(1, Math.max(0, (elapsed - s.es) / d));
  }
  const ev = p.tasks.reduce((s, t) => s + t.budget * Math.min(1, t.progress), 0);
  const ac = p.cost;
  const cpi = ac > 0 ? ev / ac : 1, spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? ac + (bac - ev) / cpi : bac;
  return { bac, pv, ev, ac, cpi, spi, eac, overrun: eac - bac, done: bac ? ev / bac : 0, planned: bac ? pv / bac : 0 };
}

/** When it will really finish: the remaining schedule from today, against the contract date (pure). */
export function forecastFinish(p: Project, today: string) {
  const s = schedule(p, today > p.start ? today : p.start);
  const late = workdaysBetween(onWorkday(p.finish), s.finish);
  return { finish: s.finish, late, critical: s.slots.filter((x) => x.critical && x.task.progress < 1).map((x) => x.task.name) };
}

// ---- The site ----------------------------------------------------------------------------------------

/** People on site each working day over the next `n` (pure). */
export function headcount(p: Project, today: string, n = 20): { date: string; people: number; trades: string[] }[] {
  const s = schedule(p, today > p.start ? today : p.start);
  const out = [];
  for (let i = 0, d = onWorkday(today); i < n; i++, d = addWorkdays(d, 1)) {
    const on = s.slots.filter((x) => x.task.progress < 1 && x.start <= d && x.end >= d);
    out.push({ date: d, people: on.reduce((k, x) => k + (x.task.crew ?? 0), 0), trades: [...new Set(on.map((x) => x.task.trade))] });
  }
  return out;
}

/** Deliveries that land on the same day and window, or need the crane on a day it can't lift (pure). */
export function deliveryClashes(p: Project, forecast: Day[] = []) {
  const out: { a: Delivery; b?: Delivery; why: string }[] = [];
  const open = p.deliveries.filter((d) => d.status !== "delivered");
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = open[i], b = open[j];
    if (a.date === b.date && (a.window ?? "") === (b.window ?? "") && a.window) out.push({ a, b, why: `both booked ${a.date} ${a.window}` });
  }
  for (const d of open) {
    if (!d.crane) continue;
    const f = forecast.find((x) => x.date === d.date);
    if (f && !workable("crane", f).ok) out.push({ a: d, why: `needs the crane on ${d.date}: ${workable("crane", f).why}` });
  }
  return out;
}

/** Road time from a supplier, estimated: 1.35× the straight line at 50 km/h (pure). */
export function haulHours(p: { lon: number; lat: number }, s: { lon: number; lat: number }) {
  return (kmBetween(p, s) * 1.35) / 50;
}

export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface Receptor { name: string; kind: "school" | "hospital" | "care" | "worship" | "homes"; lon: number; lat: number; m: number }
/** How loud work reaches a neighbour: a rough drop of 6 dB per doubling of distance from 85 dB at 10 m (pure). */
export const noiseAt = (m: number, source = 85) => Math.round(source - 20 * Math.log10(Math.max(10, m) / 10));

/** Permits and inspections due or overdue in the next `within` days (pure). */
export const permitsDue = (p: Project, today: string, within = 14) => p.permits.filter((x) => x.status === "pending" && daysBetween(today, x.date) <= within).sort((a, b) => a.date.localeCompare(b.date));

/** Everything worth a look on a project, the worst first (pure). */
export function projectFlags(p: Project, today: string, forecast: Day[] = []) {
  const f: { level: 1 | 2 | 3; text: string }[] = [];
  const ff = forecastFinish(p, today), ev = earnedValue(p, today);
  if (ff.late > 0) f.push({ level: ff.late > 10 ? 3 : 2, text: `Finishing ${ff.finish}, ${ff.late} working days after the contract date` });
  if (ev.cpi < 0.95 && ev.ac > 0) f.push({ level: ev.cpi < 0.85 ? 3 : 2, text: `Over budget: CPI ${ev.cpi.toFixed(2)}, heading for ${Math.round(ev.overrun).toLocaleString()} over` });
  if (ev.spi < 0.9 && ev.pv > 0) f.push({ level: 2, text: `Behind the baseline: SPI ${ev.spi.toFixed(2)}` });
  for (const c of weatherClashes(p, forecast, today)) f.push({ level: c.slot.critical ? 3 : 2, text: `${c.slot.task.name} on ${c.date}: ${c.why}${c.next ? `; next good day ${c.next}` : ""}${c.slot.critical ? " (critical path)" : ` (${c.slot.float} days float)`}` });
  for (const x of permitsDue(p, today)) f.push({ level: x.date < today ? 3 : 2, text: `${x.title} ${x.date < today ? "overdue since" : "due"} ${x.date}` });
  for (const c of deliveryClashes(p, forecast)) f.push({ level: 2, text: `Delivery: ${c.a.what}${c.b ? ` and ${c.b.what}` : ""} ${c.why}` });
  const rfis = p.rfis.filter((r) => r.status === "open" && daysBetween(r.opened, today) > 7);
  if (rfis.length) f.push({ level: 2, text: `${rfis.length} question${rfis.length === 1 ? "" : "s"} to the designer open over a week` });
  return f.sort((a, b) => b.level - a.level);
}
