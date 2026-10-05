// Relief Pipeline: a humanitarian supply chain on the map. Relief goods come
// in at a port, move through hubs and field warehouses to the points where
// they're handed out, along roads, rivers and air links that the rainy
// season, fighting or a washed-out bridge can cut. The question that matters
// is when each place runs out of each thing, and whether anything sent now
// gets there first. Pure functions; the screens are in ui.ts.

export type HubKind = "port" | "hub" | "field" | "point";
export const HUB_KINDS: Record<HubKind, { label: string; emoji: string; color: string }> = {
  port: { label: "Port of entry", emoji: "⚓", color: "#5160c2" },
  hub: { label: "Main hub", emoji: "🏭", color: "#3563d6" },
  field: { label: "Field warehouse", emoji: "📦", color: "#30b0c7" },
  point: { label: "Distribution point", emoji: "🌾", color: "#5b9467" },
};

export type Mode = "road" | "river" | "air";
export const MODES: Record<Mode, { label: string; emoji: string; detour: number; kmh: number; hoursPerDay: number; handlingDays: number; usdPerTkm: number; gCo2PerTkm: number }> = {
  // Typical figures for planning; set your own rates on each route.
  road: { label: "Road", emoji: "🚚", detour: 1.35, kmh: 35, hoursPerDay: 10, handlingDays: 1, usdPerTkm: 0.2, gCo2PerTkm: 90 },
  river: { label: "River barge", emoji: "🛶", detour: 1.3, kmh: 8, hoursPerDay: 20, handlingDays: 2, usdPerTkm: 0.1, gCo2PerTkm: 35 },
  air: { label: "Air", emoji: "✈️", detour: 1.05, kmh: 350, hoursPerDay: 8, handlingDays: 1, usdPerTkm: 2.5, gCo2PerTkm: 1100 },
};

export interface Item { id: string; name: string; unit: string; /** Tonnes per unit. */ t: number; /** Per person per day, in units (0 for one-off items). */ perPersonDay: number; /** Days a one-off item lasts a household of five. */ lastsDays?: number }
export const ITEMS: Item[] = [
  { id: "cereal", name: "Cereals", unit: "t", t: 1, perPersonDay: 0.0004 },
  { id: "pulses", name: "Pulses", unit: "t", t: 1, perPersonDay: 0.00006 },
  { id: "oil", name: "Vegetable oil", unit: "t", t: 1, perPersonDay: 0.000025 },
  { id: "rutf", name: "RUTF (therapeutic food)", unit: "carton", t: 0.015, perPersonDay: 0 },
  { id: "hygiene", name: "Hygiene kits", unit: "kit", t: 0.012, perPersonDay: 0, lastsDays: 90 },
  { id: "shelter", name: "Shelter kits", unit: "kit", t: 0.03, perPersonDay: 0 },
  { id: "medkit", name: "Emergency health kits", unit: "kit", t: 1, perPersonDay: 0 },
];
export const itemOf = (id: string) => ITEMS.find((i) => i.id === id);

export interface Hub {
  id: string; name: string; kind: HubKind; lon: number; lat: number;
  /** Storage, tonnes. */
  capacity?: number;
  /** People served from here (distribution points). */
  people?: number;
  /** Stock on hand, units by item id. */
  stock: Record<string, number>;
  /** Units handed out per day, by item, where it isn't the ration (RUTF cartons for the children in treatment, say). */
  use?: Record<string, number>;
  /** Months (0–11) when roads here are wet enough to slow or stop trucks. */
  wet?: number[];
}
export interface Leg {
  id: string; from: string; to: string; mode: Mode;
  /** Straight-line km (worked out when the leg is made). */
  km: number;
  status: "open" | "slow" | "cut";
  /** Checkpoints, border and clearance delay, days. */
  delayDays?: number;
  /** Trucks, barges or flights a day, and tonnes each. */
  perDay?: number; tonnesEach?: number;
  /** Your rate, $ a tonne-km, over the default. */
  usdPerTkm?: number;
  /** Road legs: impassable in the wet months, not just slower. */
  dryOnly?: boolean;
  note?: string;
}
export interface Consignment { id: string; item: string; qty: number; from: string; to: string; path: string[]; left: string; arrives: string; status: "moving" | "delayed" | "delivered" }
export interface Incident { id: string; date: string; text: string; lon: number; lat: number; severity: 1 | 2 | 3 }
export interface Network {
  id: string; name: string; demo?: boolean; created: number;
  hubs: Hub[]; legs: Leg[]; moves: Consignment[]; incidents: Incident[];
}

const DAY = 86_400_000;
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (iso: string) => Date.parse(iso + "T12:00:00Z");
export const addDays = (iso: string, n: number) => isoDay(ms(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);

export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---- Moving goods ------------------------------------------------------------------------------------

const incidentKm = 15;
/** Incidents in the last 14 days within reach of a leg's line (pure). */
export function legIncidents(n: Network, leg: Leg, today: string) {
  const a = n.hubs.find((h) => h.id === leg.from), b = n.hubs.find((h) => h.id === leg.to);
  if (!a || !b || leg.mode === "air") return [];
  return n.incidents.filter((i) => daysBetween(i.date, today) <= 14 && daysBetween(i.date, today) >= 0 && distToSegment(i, a, b) <= incidentKm);
}
function distToSegment(p: { lon: number; lat: number }, a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  // Flat enough at these scales: project onto the line in a local frame.
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / Math.max(1e-12, (bx - ax) ** 2 + (by - ay) ** 2)));
  return kmBetween(p, { lon: (ax + t * (bx - ax)) / k, lat: ay + t * (by - ay) });
}

/** Is it the wet season at either end of a leg in this month (pure). */
export const legWet = (n: Network, leg: Leg, month: number) => [leg.from, leg.to].some((id) => n.hubs.find((h) => h.id === id)?.wet?.includes(month));

/**
 * Days to move goods along a leg in a month (pure): distance by the mode's
 * detour and speed, handling at each end, checkpoints, and for roads the wet
 * season (half speed, or closed if the road is dry-season only). Infinity if
 * the leg is cut.
 */
export function legDays(n: Network, leg: Leg, month: number): number {
  if (leg.status === "cut") return Infinity;
  const m = MODES[leg.mode], wet = leg.mode === "road" && legWet(n, leg, month);
  if (wet && leg.dryOnly) return Infinity;
  const speed = m.kmh * (wet ? 0.5 : 1) * (leg.status === "slow" ? 0.6 : 1);
  return (leg.km * m.detour) / (speed * m.hoursPerDay) + m.handlingDays + (leg.delayDays ?? 0);
}
export const legUsdPerT = (leg: Leg) => leg.km * MODES[leg.mode].detour * (leg.usdPerTkm ?? MODES[leg.mode].usdPerTkm);
export const legCo2PerT = (leg: Leg) => (leg.km * MODES[leg.mode].detour * MODES[leg.mode].gCo2PerTkm) / 1e6;

export interface Path { legs: Leg[]; hubs: string[]; days: number; usdPerT: number; co2PerT: number; modes: Mode[] }

/** The quickest way between two hubs in a month, optionally without air (pure). Null if there's none. */
export function bestPath(n: Network, from: string, to: string, month: number, opts: { noAir?: boolean; cheapest?: boolean } = {}): Path | null {
  if (from === to) return { legs: [], hubs: [from], days: 0, usdPerT: 0, co2PerT: 0, modes: [] };
  const cost = (l: Leg) => { const d = legDays(n, l, month); return opts.cheapest ? (Number.isFinite(d) ? legUsdPerT(l) : Infinity) : d; };
  const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, Leg>(), done = new Set<string>();
  for (;;) {
    let u: string | null = null, best = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < best) { best = v; u = k; }
    if (!u) return null;
    if (u === to) break;
    done.add(u);
    for (const l of n.legs) {
      if (opts.noAir && l.mode === "air") continue;
      const next = l.from === u ? l.to : l.to === u ? l.from : null;
      if (!next || done.has(next)) continue;
      const c = cost(l);
      if (!Number.isFinite(c)) continue;
      if (best + c < (dist.get(next) ?? Infinity)) { dist.set(next, best + c); prev.set(next, l); }
    }
  }
  const legs: Leg[] = [], hubs = [to];
  for (let at = to; at !== from;) { const l = prev.get(at)!; legs.unshift(l); at = l.from === at ? l.to : l.from; hubs.unshift(at); }
  return { legs, hubs, days: legs.reduce((s, l) => s + legDays(n, l, month), 0), usdPerT: legs.reduce((s, l) => s + legUsdPerT(l), 0), co2PerT: legs.reduce((s, l) => s + legCo2PerT(l), 0), modes: legs.map((l) => l.mode) };
}

/** Tonnes a path can carry a day: its narrowest leg (pure). */
export const pathThroughput = (p: Path) => Math.min(...p.legs.map((l) => (l.perDay ?? (l.mode === "air" ? 1 : 10)) * (l.tonnesEach ?? (l.mode === "air" ? 12 : l.mode === "river" ? 300 : 20))));

// ---- Running out -------------------------------------------------------------------------------------

/** Units of an item a place uses a day (pure). */
export function dailyUse(h: Hub, item: Item): number {
  if (h.use?.[item.id] !== undefined) return h.use[item.id];
  if (!h.people) return 0;
  if (item.perPersonDay) return (h.people * item.perPersonDay) / item.t;
  if (item.lastsDays) return h.people / 5 / item.lastsDays;
  return 0;
}

/** Units on the way to a place that arrive by a date (pure). */
export const inbound = (n: Network, hub: string, item: string, by?: string) => n.moves.filter((m) => m.to === hub && m.item === item && m.status !== "delivered" && (!by || m.arrives <= by)).reduce((s, m) => s + m.qty, 0);

export interface Break {
  hub: Hub; item: Item; perDay: number; stock: number; coming: number;
  /** Days until it runs out, counting what's on the way. */
  cover: number; runsOut: string;
  /** Where to send from, how long it takes, and the last day to send. */
  source?: Hub; path?: Path | null; sendBy?: string;
  /** When nothing gets through now: the first day a way opens (the rains ending, say). */
  opens?: string;
  level: 1 | 2 | 3;
}

/**
 * When each distribution point runs out of each thing it uses, and the last
 * day to send more from the nearest hub that has it (pure). Level 3: sending
 * now won't make it; 2: send within a week; 1: fine for now.
 */
export function breaks(n: Network, today: string, month = new Date(ms(today)).getUTCMonth()): Break[] {
  const out: Break[] = [];
  for (const h of n.hubs.filter((x) => x.kind === "point" || (x.use && Object.keys(x.use).length))) {
    for (const item of ITEMS) {
      const perDay = dailyUse(h, item);
      if (perDay <= 0) continue;
      const stock = h.stock[item.id] ?? 0, coming = inbound(n, h.id, item.id);
      const cover = (stock + coming) / perDay, runsOut = addDays(today, Math.floor(cover));
      // Nearest source by travel time that holds at least two weeks' worth.
      let source: Hub | undefined, path: Path | null = null;
      for (const s of n.hubs.filter((x) => x.id !== h.id && (x.stock[item.id] ?? 0) >= perDay * 14)) {
        const p = bestPath(n, s.id, h.id, month);
        if (p && (!path || p.days < path.days)) { source = s; path = p; }
      }
      let sendBy = path ? addDays(runsOut, -Math.ceil(path.days)) : undefined, opens: string | undefined;
      if (!path) {
        // Nothing gets through now: when does a way open (the rains ending), and is that soon enough?
        for (let k = 1; k <= 6 && !path; k++) {
          const first = new Date(ms(today)); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() + k);
          for (const s of n.hubs.filter((x) => x.id !== h.id && (x.stock[item.id] ?? 0) >= perDay * 14)) {
            const p = bestPath(n, s.id, h.id, (month + k) % 12);
            if (p && (!path || p.days < path.days)) { source = s; path = p; }
          }
          if (path) { opens = isoDay(first.getTime()); const last = addDays(runsOut, -Math.ceil(path.days)); sendBy = last >= opens ? last : undefined; }
        }
      }
      const slack = sendBy ? daysBetween(today, sendBy) : -1;
      out.push({ hub: h, item, perDay, stock, coming, cover, runsOut, source, path, sendBy, opens, level: slack < 0 ? 3 : slack <= 7 ? 2 : 1 });
    }
  }
  return out.sort((a, b) => b.level - a.level || a.cover - b.cover);
}

/**
 * Before the rains: what a place needs in stock by the first wet month to
 * last the whole wet season without a road (pure). Null if its roads don't
 * close or the rains aren't coming in the next six months.
 */
export function preposition(n: Network, h: Hub, today: string): { starts: string; months: number; need: { item: Item; units: number; short: number }[] } | null {
  const month = new Date(ms(today)).getUTCMonth();
  const wet = h.wet ?? [];
  if (!wet.length) return null;
  // Does a dry-season-only road serve it?
  const roadCut = n.legs.some((l) => (l.from === h.id || l.to === h.id) && l.mode === "road" && l.dryOnly);
  if (!roadCut) return null;
  let ahead = -1;
  for (let k = 0; k < 6; k++) if (wet.includes((month + k) % 12)) { ahead = k; break; }
  if (ahead < 0) return null;
  let run = 0;
  for (let k = ahead; k < ahead + 12 && wet.includes((month + k) % 12); k++) run++;
  const d = new Date(ms(today)); d.setUTCMonth(month + ahead, 1);
  const starts = isoDay(ahead === 0 ? ms(today) : d.getTime());
  const days = run * 30.4;
  const need = ITEMS.map((item) => { const units = dailyUse(h, item) * days; return { item, units, short: Math.max(0, units - (h.stock[item.id] ?? 0) - inbound(n, h.id, item.id, starts)) }; }).filter((x) => x.units > 0);
  return { starts, months: run, need };
}

/** Warehouse fill, tonnes and share of capacity (pure). */
export function fill(h: Hub) {
  const t = Object.entries(h.stock).reduce((s, [id, q]) => s + q * (itemOf(id)?.t ?? 0), 0);
  return { tonnes: t, share: h.capacity ? t / h.capacity : 0 };
}

/** Plan moving an amount from one hub to another: the path, when it arrives, trucks or flights, cost and carbon (pure). */
export function planMove(n: Network, item: Item, qty: number, from: string, to: string, today: string, opts: { noAir?: boolean; cheapest?: boolean } = {}) {
  const p = bestPath(n, from, to, new Date(ms(today)).getUTCMonth(), opts);
  if (!p) return null;
  const tonnes = qty * item.t;
  const per = pathThroughput(p);
  const loadDays = Math.max(0, Math.ceil(tonnes / Math.max(1, per)) - 1);
  return { path: p, tonnes, arrives: addDays(today, Math.ceil(p.days) + loadDays), usd: tonnes * p.usdPerT, co2: tonnes * p.co2PerT, trips: p.legs.map((l) => Math.ceil(tonnes / (l.tonnesEach ?? (l.mode === "air" ? 12 : l.mode === "river" ? 300 : 20)))) };
}

/** Consignments past their arrival date (pure). */
export const overdue = (n: Network, today: string) => n.moves.filter((m) => m.status !== "delivered" && m.arrives < today);

/** Reachability right now: which places can't be reached by road or river at all this month (pure). */
export function cutOff(n: Network, month: number) {
  const hubs = n.hubs.filter((h) => h.kind === "hub" || h.kind === "port");
  return n.hubs.filter((h) => h.kind === "point" || h.kind === "field").map((h) => ({ h, ground: hubs.some((s) => bestPath(n, s.id, h.id, month, { noAir: true })), any: hubs.some((s) => bestPath(n, s.id, h.id, month)) })).filter((x) => !x.ground);
}
