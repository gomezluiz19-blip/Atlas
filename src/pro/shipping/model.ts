// A freight desk's working model: customers, the ships carrying their cargo,
// and each shipment from booking to delivery. Everything that matters is
// worked out from the sea route: where the ship should be now, when it really
// arrives (with the wait at the port), whether it's late against what was
// promised, when free time at the port runs out, the carbon it emits and what
// the EU charges for it, and the risks on the way (security warning areas,
// sanctioned countries, a ship gone quiet, rough seas).
import { along, CHOKEPOINTS, densify, gcKm, NM, progressKm, seaDays, seaRoute, type LonLat, type SeaRoute } from "./sea";

export type VesselType = "container" | "bulk" | "tanker" | "general" | "roro" | "reefer";
export const VESSEL_TYPES: Record<VesselType, { label: string; emoji: string; knots: number; unit: "TEU" | "t"; gPer: number }> = {
  // gPer: grams of CO2 per TEU-km (container ships) or per tonne-km (the rest): typical well-to-wake defaults.
  container: { label: "Container ship", emoji: "🚢", knots: 16, unit: "TEU", gPer: 55 },
  reefer: { label: "Reefer", emoji: "🧊", knots: 18, unit: "t", gPer: 30 },
  bulk: { label: "Bulk carrier", emoji: "⛴️", knots: 12.5, unit: "t", gPer: 4.5 },
  tanker: { label: "Tanker", emoji: "🛢️", knots: 13, unit: "t", gPer: 5.5 },
  general: { label: "General cargo", emoji: "📦", knots: 13, unit: "t", gPer: 15 },
  roro: { label: "Ro-ro / car carrier", emoji: "🚗", knots: 17, unit: "t", gPer: 45 },
};

export interface Port { name: string; lon: number; lat: number; country: string; code?: string }
export interface Position { lon: number; lat: number; t: number; knots: number; status?: string; source: string }
export interface Vessel {
  id: string; name: string; type: VesselType; imo?: string; mmsi?: string; flag?: string; operator?: string;
  /** Size, for Panama's limits and the emissions factor. */
  teu?: number; dwt?: number;
  /** The speed it's sailing at (knots). */
  knots: number;
  last?: Position;
}
export type Stage = "booked" | "loaded" | "sailing" | "arrived" | "delivered";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "booked", label: "Booked" }, { id: "loaded", label: "Loaded at origin" }, { id: "sailing", label: "At sea" }, { id: "arrived", label: "Arrived, at the port" }, { id: "delivered", label: "Delivered" },
];
export interface Milestone { at: string; text: string }
export interface Shipment {
  id: string; ref: string; customer: string; cargo: string;
  origin: Port; dest: Port; via?: Port;
  vessel?: string; stage: Stage;
  /** Planned departure and the arrival promised to the customer. */
  etd: string; eta: string;
  /** Actual departure and arrival, once they happen. */
  atd?: string; ata?: string;
  teu?: number; tonnes?: number; containers?: number; value?: number;
  incoterm?: string; hs?: string;
  /** Days at the destination before demurrage starts, and the charge per container per day. */
  freeDays?: number; demurrage?: number;
  docs: { text: string; done: boolean }[];
  log: Milestone[];
  notes?: string;
}
export interface Customer { id: string; name: string; country?: string; contact?: string; email?: string }
export interface Desk {
  id: string; name: string; demo?: boolean; created: number;
  customers: Customer[]; vessels: Vessel[]; shipments: Shipment[];
  /** Days ships are waiting to berth, by port name (your agents' reports, or live). */
  waits: Record<string, { days: number; source: string; asOf: string }>;
  /** Chokepoints treated as closed in plans. */
  closed: string[];
  /** EU carbon allowance price (€ a tonne). */
  euaPrice?: number;
}

export const DOCS = ["Commercial invoice", "Packing list", "Bill of lading", "Certificate of origin", "Customs declaration", "Insurance certificate"];

const DAY = 86_400_000;
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (iso: string) => Date.parse(iso + "T12:00:00Z");
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);

/** Neopanamax locks take ships up to about 366 m and roughly 14,000–15,000 TEU; bigger ones can't use Panama. */
export const PANAMA_MAX_TEU = 15_000;
export const tooBigForPanama = (v?: Vessel) => !!v && (v.teu ?? 0) > PANAMA_MAX_TEU;

// ---- The voyage --------------------------------------------------------------------------------------

const P = (p: Port): LonLat => [p.lon, p.lat];
const routeCache = new Map<string, SeaRoute | null>();
/** The sea route for a shipment (via a transhipment port if it has one), honouring closures and the ship's size (pure, memoised). */
export function voyage(s: Shipment, closed: string[] = [], v?: Vessel): SeaRoute | null {
  const shut = [...closed, ...(tooBigForPanama(v) ? ["panama"] : [])].sort();
  const k = `${s.origin.lon},${s.origin.lat}|${s.via ? `${s.via.lon},${s.via.lat}|` : ""}${s.dest.lon},${s.dest.lat}|${shut.join(",")}`;
  if (routeCache.has(k)) return routeCache.get(k)!;
  let r: SeaRoute | null;
  if (s.via) {
    const a = seaRoute(P(s.origin), P(s.via), shut), b = seaRoute(P(s.via), P(s.dest), shut);
    r = a && b ? { km: a.km + b.km, pts: [...a.pts, ...b.pts.slice(1)], via: [...a.via, s.via.name, ...b.via], chokepoints: [...new Set([...a.chokepoints, ...b.chokepoints])] } : null;
  } else r = seaRoute(P(s.origin), P(s.dest), shut);
  routeCache.set(k, r);
  return r;
}

export const TRANSHIP_DAYS = 3;

export interface Eta {
  route: SeaRoute | null;
  /** Where it is (or would be) now, and how far along. */
  at: LonLat; doneKm: number; leftKm: number;
  /** Best estimate of arrival, and days late (+) or early (−) against the promise. */
  eta: string; late: number;
  wait: number;
  basis: "live" | "estimated" | "planned" | "arrived";
  /** Hours since the last position report, when there is one. */
  quietHours?: number;
}

/** Where a shipment is and when it really arrives, from the route, the ship's speed, a live position if there is one, and the wait at the port (pure). */
export function eta(d: Desk, s: Shipment, now = Date.now(), closed = d.closed): Eta {
  const v = d.vessels.find((x) => x.id === s.vessel);
  const route = voyage(s, closed, v);
  const knots = v?.knots ?? VESSEL_TYPES[v?.type ?? "container"].knots;
  const wait = d.waits[s.dest.name]?.days ?? 0;
  const total = route?.km ?? gcKm(P(s.origin), P(s.dest)) * 1.25;
  const pts = route?.pts ?? [P(s.origin), P(s.dest)];
  const extra = s.via ? TRANSHIP_DAYS : 0;
  if (s.ata || s.stage === "arrived" || s.stage === "delivered") {
    const a = s.ata ?? s.eta;
    return { route, at: P(s.dest), doneKm: total, leftKm: 0, eta: a, late: daysBetween(s.eta, a), wait: 0, basis: "arrived" };
  }
  if (!s.atd && s.stage !== "sailing") {
    const start = Math.max(ms(s.etd), now);
    const e = isoDay(start + (seaDays(total, knots) + wait + extra) * DAY);
    return { route, at: P(s.origin), doneKm: 0, leftKm: total, eta: e, late: daysBetween(s.eta, e), wait, basis: "planned" };
  }
  const fresh = v?.last && now - v.last.t < 3 * DAY ? v.last : undefined;
  let done: number, basis: Eta["basis"];
  if (fresh) {
    done = progressKm(pts, [fresh.lon, fresh.lat]);
    // Carry it on from the report at its speed.
    done += ((now - fresh.t) / DAY) * (fresh.knots > 1 ? fresh.knots : knots) * NM * 24;
    basis = "live";
  } else {
    done = ((now - ms(s.atd ?? s.etd)) / DAY) * knots * NM * 24;
    basis = "estimated";
  }
  done = Math.min(total, Math.max(0, done));
  const left = total - done;
  const e = isoDay(now + (seaDays(left, knots) + wait + (s.via && done < total / 2 ? extra : 0)) * DAY);
  const quietHours = v?.last ? Math.round((now - v.last.t) / 3_600_000) : undefined;
  return { route, at: along(pts, done).p, doneKm: done, leftKm: left, eta: e, late: daysBetween(s.eta, e), wait, basis, quietHours };
}

/** Free time at the port and what's accruing after it (pure). */
export function demurrage(s: Shipment, today: string): { endsOn?: string; daysOver: number; cost: number } {
  if (!s.ata || s.stage === "delivered") return { daysOver: 0, cost: 0 };
  const free = s.freeDays ?? 5;
  const endsOn = isoDay(ms(s.ata) + free * DAY);
  const over = Math.max(0, daysBetween(endsOn, today));
  return { endsOn, daysOver: over, cost: over * (s.demurrage ?? 150) * Math.max(1, s.containers ?? Math.ceil((s.teu ?? 1) / 2)) };
}

// ---- Carbon ------------------------------------------------------------------------------------------

/** EU and EEA countries (the EU Emissions Trading System covers shipping to, from and within them). */
export const EU_ETS = new Set(["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "Iceland", "Norway"]);
/** The share of emissions ships surrender allowances for, by year (phased in from 2024). */
export const ETS_PHASE: Record<number, number> = { 2024: 0.4, 2025: 0.7 };
export const etsPhase = (year: number) => (year < 2024 ? 0 : ETS_PHASE[year] ?? 1);

/**
 * Tonnes of CO2 for a shipment (pure): distance × cargo × a typical factor
 * for the ship type, scaled by the square of speed against the type's usual
 * speed (fuel per mile rises about with the square of speed).
 */
export function co2(s: Shipment, km: number, v?: Vessel, knots?: number): number {
  const type = VESSEL_TYPES[v?.type ?? "container"];
  const amount = type.unit === "TEU" ? s.teu ?? (s.containers ?? 1) * 2 : s.tonnes ?? 0;
  const k = knots ?? v?.knots ?? type.knots;
  return (km * amount * type.gPer * (k / type.knots) ** 2) / 1e6;
}

/** What the EU ETS charges for a shipment's emissions (pure): all of an intra-EU voyage, half of one to or from outside. */
export function etsCost(s: Shipment, tonnes: number, price: number, year: number): { share: number; tonnes: number; eur: number } {
  const a = EU_ETS.has(s.origin.country), b = EU_ETS.has(s.dest.country);
  const scope = a && b ? 1 : a || b ? 0.5 : 0;
  const share = scope * etsPhase(year), t = tonnes * share;
  return { share, tonnes: t, eur: t * price };
}

/** Slowing down: CO2 saved and days added for the rest of a voyage at a lower speed (pure). */
export function slowSteam(leftKm: number, tonnesAtSpeed: number, from: number, to: number): { saved: number; addDays: number } {
  return { saved: tonnesAtSpeed * (1 - (to / from) ** 2), addDays: seaDays(leftKm, to) - seaDays(leftKm, from) };
}

// ---- Risk --------------------------------------------------------------------------------------------

/** Areas with standing security warnings for merchant ships (rough boxes: [w, s, e, n]). */
export const WARNING_AREAS: { id: string; label: string; box: [number, number, number, number]; why: string }[] = [
  { id: "redsea", label: "Southern Red Sea and Gulf of Aden", box: [38, 10, 52, 20], why: "Missile and drone attacks on merchant ships since late 2023; war-risk cover costs more." },
  { id: "somalia", label: "Somali Basin", box: [44, -5, 62, 12], why: "Piracy returned in 2023–24 after years of quiet." },
  { id: "guinea", label: "Gulf of Guinea", box: [-5, -3, 10, 7], why: "Kidnap-for-ransom piracy off Nigeria and nearby." },
  { id: "hormuz", label: "Strait of Hormuz and the Gulf", box: [50, 23.5, 58, 28.5], why: "Ship seizures and harassment." },
  { id: "blacksea", label: "Black Sea", box: [27.5, 40.8, 42, 47.5], why: "War zone: mines and strikes on ports." },
  { id: "singapore", label: "Singapore Strait", box: [103.3, 0.9, 104.6, 1.5], why: "Frequent petty theft from passing ships (usually no injuries)." },
];
/** Countries under broad sanctions programmes (US, EU or UK): a prompt to screen, not legal advice. */
export const SANCTIONED = ["Iran", "North Korea", "Cuba", "Syria", "Russia", "Belarus", "Venezuela"];

export interface Flag { level: 1 | 2 | 3; text: string }
/** What to watch on a shipment (pure). */
export function risks(d: Desk, s: Shipment, e: Eta, today: string): Flag[] {
  const out: Flag[] = [];
  if (e.route) {
    const pts = densify(e.route.pts, 100);
    for (const a of WARNING_AREAS) if (pts.some(([x, y]) => x >= a.box[0] && x <= a.box[2] && y >= a.box[1] && y <= a.box[3])) out.push({ level: a.id === "singapore" ? 1 : 2, text: `Passes the ${a.label}: ${a.why}` });
    for (const c of e.route.chokepoints) if (d.closed.includes(c)) out.push({ level: 3, text: `${CHOKEPOINTS[c].label} is marked closed but this route still uses it.` });
  } else out.push({ level: 3, text: "No sea route with the chokepoints you've closed." });
  for (const p of [s.origin, s.via, s.dest]) if (p && SANCTIONED.includes(p.country)) out.push({ level: 3, text: `${p.name} is in ${p.country}: screen the parties, cargo and ship against current sanctions lists.` });
  if (e.basis === "live" && (e.quietHours ?? 0) > 24) out.push({ level: 2, text: `No position from the ship for ${e.quietHours} hours. Ships can go quiet out of receiver range, or switch off; check with the carrier.` });
  if (e.late >= 3) out.push({ level: e.late >= 7 ? 3 : 2, text: `Running ${e.late} days late against the promised ${s.eta}.` });
  const dm = demurrage(s, today);
  if (dm.daysOver > 0) out.push({ level: 3, text: `Demurrage: ${dm.daysOver} days past free time (about $${Math.round(dm.cost).toLocaleString()}).` });
  else if (dm.endsOn && daysBetween(today, dm.endsOn) <= 2) out.push({ level: 2, text: `Free time at ${s.dest.name} ends ${dm.endsOn}.` });
  const missing = s.docs.filter((x) => !x.done).length;
  if (missing && s.stage !== "booked" && s.stage !== "delivered") out.push({ level: daysBetween(today, e.eta) <= 5 ? 2 : 1, text: `${missing} document${missing === 1 ? "" : "s"} still to do before arrival.` });
  return out.sort((a, b) => b.level - a.level);
}

/** Shipments that need a look, the worst first (pure). */
export function attention(d: Desk, now = Date.now()) {
  const t = isoDay(now);
  return d.shipments.filter((s) => s.stage !== "delivered").map((s) => { const e = eta(d, s, now); const f = risks(d, s, e, t); return { s, e, f, score: f.reduce((n, x) => n + x.level ** 2, 0) }; }).sort((a, b) => b.score - a.score || a.e.eta.localeCompare(b.e.eta));
}

/** What closing a chokepoint does to the open shipments: extra distance, days and CO2 for each one it affects (pure). */
export function whatIf(d: Desk, chokepoint: string, now = Date.now()) {
  const out: { s: Shipment; addKm: number; addDays: number; addCo2: number; stuck: boolean }[] = [];
  for (const s of d.shipments.filter((x) => x.stage !== "delivered" && x.stage !== "arrived")) {
    const v = d.vessels.find((x) => x.id === s.vessel);
    const a = voyage(s, d.closed, v);
    if (!a || !a.chokepoints.includes(chokepoint)) continue;
    const b = voyage(s, [...d.closed, chokepoint], v);
    const knots = v?.knots ?? VESSEL_TYPES[v?.type ?? "container"].knots;
    if (!b) { out.push({ s, addKm: 0, addDays: 0, addCo2: 0, stuck: true }); continue; }
    const e = eta(d, s, now);
    const frac = a.km ? e.leftKm / a.km : 1;
    const addKm = (b.km - a.km) * frac;
    out.push({ s, addKm, addDays: seaDays(addKm, knots), addCo2: co2(s, addKm, v), stuck: false });
  }
  return out.sort((x, y) => y.addDays - x.addDays);
}

/** Arrivals by port over the coming weeks (pure). */
export function arrivalsByPort(d: Desk, now = Date.now(), within = 21) {
  const t = isoDay(now), m = new Map<string, { port: Port; items: { s: Shipment; eta: string }[] }>();
  for (const s of d.shipments.filter((x) => x.stage !== "delivered")) {
    const e = eta(d, s, now);
    if (daysBetween(t, e.eta) > within) continue;
    const g = m.get(s.dest.name) ?? { port: s.dest, items: [] };
    g.items.push({ s, eta: e.eta });
    m.set(s.dest.name, g);
  }
  return [...m.values()].sort((a, b) => b.items.length - a.items.length);
}

/** Ships waiting at anchor near a port, from live positions (pure): a direct read of congestion. */
export function anchoredNear(tracks: { lon: number; lat: number; status?: string; speed: number }[], port: { lon: number; lat: number }, km = 40) {
  return tracks.filter((t) => gcKm([t.lon, t.lat], [port.lon, port.lat]) <= km && (t.status === "At anchor" || t.speed < 0.5)).length;
}

/** A short, plain update to send a customer (pure). */
export function customerUpdate(d: Desk, s: Shipment, e: Eta): string {
  const v = d.vessels.find((x) => x.id === s.vessel);
  const where = e.basis === "arrived" ? `has arrived at ${s.dest.name}` : e.basis === "planned" ? `is booked to leave ${s.origin.name} on ${s.etd}` : `is at sea on ${v?.name ?? "the vessel"}, about ${Math.round(e.doneKm / NM).toLocaleString()} of ${Math.round((e.doneKm + e.leftKm) / NM).toLocaleString()} nautical miles along`;
  const when = e.basis === "arrived" ? "" : ` We expect it at ${s.dest.name} on ${e.eta}${e.late > 0 ? `, ${e.late} day${e.late === 1 ? "" : "s"} later than planned${e.wait ? ` (ships are waiting about ${e.wait} days to berth there)` : ""}` : e.late < 0 ? `, ${-e.late} day${e.late === -1 ? "" : "s"} early` : ", on schedule"}.`;
  return `Shipment ${s.ref} (${s.cargo}) ${where}.${when}`;
}
