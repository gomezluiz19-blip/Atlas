// Field Network: the working model of a company that sells to and services
// many customer sites (built first for mining equipment, technology and
// services companies). Its customers' sites (accounts), the machines and
// systems installed there, its technicians and depots, service jobs, and the
// sales pipeline, with the geography that decides its costs: how long it
// really takes to reach a remote site (drive, or fly then drive, slower in the
// wet season), who to send, which sites are beyond the response time promised,
// and where one more depot helps most. Pure functions; the screens in ui.ts.
import { days, kmBetween } from "../kit/ops";

export type Vertical = "mining";

export interface Account {
  id: string; name: string; site: string; lon: number; lat: number;
  country?: string; commodity?: string; method?: string; owner?: string;
  stage?: "production" | "development" | "exploration" | "care and maintenance";
  /** Hours within which a breakdown must be answered on site, by contract. */
  slaHours?: number;
  contacts?: { name: string; role?: string; email?: string; phone?: string }[];
  notes?: string;
}
export type AssetStatus = "running" | "down" | "standby";
export interface Asset {
  id: string; account: string; type: string; model: string; serial: string;
  installed: string;
  /** Engine or run hours, as of `asOf`, and the usual hours a day. */
  hours: number; asOf: string; perDay: number;
  /** Service every so many hours; hours at the last service. */
  serviceEvery: number; lastService: number;
  /** Design life in hours (for replacement planning). */
  lifeHours?: number;
  warrantyUntil?: string;
  status: AssetStatus;
  power?: "diesel" | "electric" | "battery-electric" | "trolley" | "hybrid";
}
export interface Tech { id: string; name: string; base: string; lon: number; lat: number; skills: string[]; available: boolean }
export interface Depot { id: string; name: string; lon: number; lat: number; kind: "parts depot" | "service centre" | "office" | "factory" | "port"; stock?: { part: string; qty: number; perMonth: number }[] }
export type JobKind = "breakdown" | "scheduled service" | "commissioning" | "inspection" | "training" | "upgrade";
export interface Job { id: string; account: string; asset?: string; kind: JobKind; priority: 1 | 2 | 3; opened: string; status: "open" | "assigned" | "on site" | "done"; tech?: string; part?: string; notes?: string; closed?: string }
export type OppStage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
export interface Opportunity { id: string; account?: string; prospect?: { name: string; lon: number; lat: number; country?: string; commodity?: string }; product: string; value: number; stage: OppStage; close: string }

export interface Company {
  id: string; name: string; vertical: Vertical;
  /** What the company offers, used to judge which prospects fit. */
  offer: { types: string[]; methods: string[]; commodities: string[] };
  accounts: Account[]; assets: Asset[]; techs: Tech[]; depots: Depot[]; jobs: Job[]; opps: Opportunity[];
  /** Default contract response time, hours. */
  slaHours: number;
  created: number; demo?: boolean;
}

export const STAGE_ODDS: Record<OppStage, number> = { lead: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.75, won: 1, lost: 0 };

// ---- The installed base ----------------------------------------------------------------------------

/** Hours on the meter today, projected from the last reading (pure). */
export const hoursNow = (a: Asset, on: string) => a.hours + Math.max(0, days(a.asOf, on)) * (a.status === "down" ? 0 : a.perDay);

/** When the next service falls due: hours left, and days at the usual rate (negative when overdue; pure). */
export function serviceDue(a: Asset, on: string) {
  const left = a.lastService + a.serviceEvery - hoursNow(a, on);
  return { hoursLeft: left, daysLeft: a.perDay > 0 ? left / a.perDay : Infinity, overdue: left < 0 };
}

/** Life used and years to replacement at the usual rate (pure). */
export function lifeLeft(a: Asset, on: string) {
  if (!a.lifeHours) return null;
  const used = hoursNow(a, on) / a.lifeHours;
  return { used, years: a.perDay > 0 ? (a.lifeHours - hoursNow(a, on)) / a.perDay / 365 : Infinity };
}

/** The fleet's health: down, service overdue or due within two weeks, warranties ending, replacements coming (pure). */
export function fleetHealth(c: Company, on: string) {
  const rows = c.assets.map((a) => ({ a, due: serviceDue(a, on), life: lifeLeft(a, on) }));
  return {
    total: c.assets.length,
    down: rows.filter((r) => r.a.status === "down"),
    overdue: rows.filter((r) => r.due.overdue && r.a.status !== "down"),
    dueSoon: rows.filter((r) => !r.due.overdue && r.due.daysLeft <= 7),
    warrantyEnding: rows.filter((r) => r.a.warrantyUntil && days(on, r.a.warrantyUntil) >= 0 && days(on, r.a.warrantyUntil) <= 90),
    replaceSoon: rows.filter((r) => r.life && r.life.years <= 2).sort((a, b) => a.life!.years - b.life!.years),
    availability: c.assets.length ? 1 - c.assets.filter((a) => a.status === "down").length / c.assets.length : 1,
  };
}

// ---- Getting there ---------------------------------------------------------------------------------

export interface Airport { name: string; iata: string; lon: number; lat: number; type: string; rank: number }
export interface Trip { hours: number; km: number; how: string; via?: [Airport, Airport] }

const ROAD = 1.35, DRIVE_KMH = 65, FLY_KMH = 650;

/** The airport nearest a point (scheduled airports, bigger first among ties; pure). */
export function nearestAirport(airports: Airport[], p: { lon: number; lat: number }) {
  let best: Airport | null = null, bestKm = Infinity;
  for (const a of airports) { const d = kmBetween(a, p); if (d < bestKm) { bestKm = d; best = a; } }
  return best ? { a: best, km: bestKm } : null;
}

/**
 * How long a technician takes from a base to a site: the faster of driving
 * (road 1.35× the straight line at 65 km/h) or flying between the airports
 * nearest each end (2 hours to check in, 650 km/h, an extra 4 hours for a
 * connection or charter when either airport is small) and driving the ends.
 * In the wet season remote roads are slow: driving legs take half as long
 * again (pure).
 */
export function travel(from: { lon: number; lat: number }, to: { lon: number; lat: number }, airports: Airport[], wet = false): Trip {
  const wetK = wet ? 1.5 : 1;
  const straight = kmBetween(from, to);
  const drive: Trip = { hours: ((straight * ROAD) / DRIVE_KMH) * wetK, km: straight * ROAD, how: "drive" };
  if (straight < 300 || !airports.length) return drive;
  const a = nearestAirport(airports, from), b = nearestAirport(airports, to);
  if (!a || !b || a.a === b.a) return drive;
  const hop = kmBetween(a.a, b.a);
  const small = a.a.type === "small" || b.a.type === "small";
  const hours = ((a.km * ROAD) / DRIVE_KMH) * wetK + 2 + hop / FLY_KMH + 1 + (small ? 4 : 0) + ((b.km * ROAD) / DRIVE_KMH) * wetK;
  const fly: Trip = { hours, km: a.km * ROAD + hop + b.km * ROAD, how: `fly ${a.a.iata}→${b.a.iata}, then ${Math.round(b.km * ROAD)} km by road`, via: [a.a, b.a] };
  return fly.hours < drive.hours ? fly : drive;
}

/** Who to send to a job: technicians with the skill, available first, then by how soon they can be there (pure). */
export function dispatch(c: Company, job: Job, airports: Airport[], wet = false) {
  const acc = c.accounts.find((x) => x.id === job.account);
  const asset = c.assets.find((x) => x.id === job.asset);
  if (!acc) return [];
  return c.techs
    .map((t) => ({ t, trip: travel(t, acc, airports, wet), skilled: !asset || !t.skills.length || t.skills.some((s) => s.toLowerCase() === asset.type.toLowerCase()) }))
    .filter((x) => x.skilled)
    .sort((a, b) => Number(b.t.available) - Number(a.t.available) || a.trip.hours - b.trip.hours);
}

/** The nearest depot holding a part, and how long it takes to get it to the site (pure). */
export function partSource(c: Company, part: string, site: { lon: number; lat: number }, airports: Airport[]) {
  return c.depots.filter((d) => d.stock?.some((s) => s.part.toLowerCase() === part.toLowerCase() && s.qty > 0))
    .map((d) => ({ d, trip: travel(d, site, airports) })).sort((a, b) => a.trip.hours - b.trip.hours)[0] ?? null;
}

/** Each account's fastest response from any technician's base, against its promised hours (pure). */
export function coverage(c: Company, airports: Airport[], wet: (a: Account) => boolean = () => false, onlyFree = false) {
  const bases = [...c.techs.filter((t) => !onlyFree || t.available).map((t) => ({ name: t.base, lon: t.lon, lat: t.lat })), ...(onlyFree ? [] : c.depots.filter((d) => d.kind === "service centre").map((d) => ({ name: d.name, lon: d.lon, lat: d.lat })))];
  return c.accounts.map((a) => {
    let best: { name: string; trip: Trip } | null = null;
    for (const b of bases) { const trip = travel(b, a, airports, wet(a)); if (!best || trip.hours < best.trip.hours) best = { name: b.name, trip }; }
    const sla = a.slaHours ?? c.slaHours;
    const machines = c.assets.filter((x) => x.account === a.id).length;
    return { a, from: best?.name, trip: best?.trip, sla, within: !!best && best.trip.hours <= sla, machines };
  });
}

/**
 * Where one more service base helps most (pure): each candidate (the sites
 * themselves and the airports near them) is scored by the machines it would
 * bring within their promised response time that are outside it now.
 */
export function bestBase(c: Company, airports: Airport[]) {
  const now = coverage(c, airports).filter((r) => !r.within && r.machines > 0);
  if (!now.length) return null;
  const cands = [...c.accounts.map((a) => ({ name: a.site, lon: a.lon, lat: a.lat })),
    ...now.flatMap((r) => { const n = nearestAirport(airports, r.a); return n ? [{ name: `${n.a.name} (${n.a.iata})`, lon: n.a.lon, lat: n.a.lat }] : []; })];
  let best: { at: { name: string; lon: number; lat: number }; machines: number; accounts: Account[] } | null = null;
  for (const cand of cands) {
    const fixed = now.filter((r) => travel(cand, r.a, airports).hours <= r.sla);
    const machines = fixed.reduce((s, r) => s + r.machines, 0);
    if (!best || machines > best.machines) best = { at: cand, machines, accounts: fixed.map((r) => r.a) };
  }
  return best && best.machines ? best : null;
}

// ---- Jobs, pipeline, exposure ---------------------------------------------------------------------

/** Open jobs, most urgent first, with how long each has waited (pure). */
export function jobQueue(c: Company, on: string) {
  return c.jobs.filter((j) => j.status !== "done").map((j) => ({ j, age: days(j.opened, on) })).sort((a, b) => a.j.priority - b.j.priority || b.age - a.age);
}

/** The sales pipeline by stage: count, value, and value weighted by the odds of each stage (pure). */
export function pipeline(opps: Opportunity[]) {
  const stages = (Object.keys(STAGE_ODDS) as OppStage[]).map((s) => { const xs = opps.filter((o) => o.stage === s); return { stage: s, n: xs.length, value: xs.reduce((t, o) => t + o.value, 0) }; });
  const open = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const closed = opps.filter((o) => o.stage === "won" || o.stage === "lost");
  return { stages, open: open.length, value: open.reduce((t, o) => t + o.value, 0), weighted: open.reduce((t, o) => t + o.value * STAGE_ODDS[o.stage], 0), winRate: closed.length ? opps.filter((o) => o.stage === "won").length / closed.length : null };
}

/** How concentrated the installed base is, by commodity and by country (share of machines; pure). */
export function exposure(c: Company) {
  const acc = new Map(c.accounts.map((a) => [a.id, a]));
  const tally = (key: (a: Account) => string | undefined) => {
    const m = new Map<string, number>();
    for (const x of c.assets) { const k = key(acc.get(x.account)!) ?? "Unknown"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].map(([k, n]) => ({ k, n, share: n / Math.max(1, c.assets.length) })).sort((a, b) => b.n - a.n);
  };
  return { commodity: tally((a) => a?.commodity), country: tally((a) => a?.country) };
}
