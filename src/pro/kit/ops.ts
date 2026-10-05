// The shared working parts of the Pro tools (Sports, Mining, Field Ops): places
// on the map, what moves between them, the people and groups an operation
// deals with (with a log and a mood), and dated things (fixtures, permits,
// deliveries) with what's due. Pure functions; each tool adds its own.
import { kmBetween, MODES, type Mode, type Per } from "../network/model";

export type { Mode, Per };
export { kmBetween, MODES };

export interface Site { id: string; name: string; kind: string; lon: number; lat: number; notes?: string; people?: number }
export interface Move { id: string; from: string; to: string; what: string; kind: "goods" | "people" | "money" | "data"; amount: number; unit: string; per: Per; mode: Mode }
export interface Log { at: string; text: string }
export type Mood = "ally" | "positive" | "neutral" | "concerned" | "opposed";
export const MOODS: { id: Mood; label: string; color: string }[] = [
  { id: "ally", label: "Ally", color: "#1f9d55" },
  { id: "positive", label: "Positive", color: "#7bd88f" },
  { id: "neutral", label: "Neutral", color: "#b8b8c0" },
  { id: "concerned", label: "Concerned", color: "#f5a742" },
  { id: "opposed", label: "Opposed", color: "#d64545" },
];
export const moodOf = (m?: Mood) => MOODS.find((x) => x.id === m) ?? MOODS[2];
export interface Party { id: string; name: string; kind: string; lon?: number; lat?: number; mood: Mood; notes?: string; log: Log[] }
/** Something raised that needs an answer: a grievance, an incident, a request. */
export interface Issue { id: string; title: string; party?: string; site?: string; opened: string; updated: string; status: "open" | "waiting" | "closed"; severity: 1 | 2 | 3 }
/** Something with a date: a permit's expiry, a delivery, an inspection. */
export interface Dated { id: string; title: string; date: string; kind: string; site?: string; notes?: string }

export const FLOW_COLORS = { goods: "#d19a2e", people: "#3563d6", money: "#5b9467", data: "#8b5fa8" } as const;
const PER_YEAR: Record<Per, number> = { day: 365, week: 52, month: 12, year: 1 };

export const today = () => new Date().toISOString().slice(0, 10);
export const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** One move's distance on the way, hours door to door, yearly amount and carbon (tonnes CO2 a year; pure). */
export function moveFacts(m: Move, a: Site, b: Site) {
  const mode = MODES[m.mode];
  const km = kmBetween(a, b) * mode.detour;
  const hours = m.mode === "digital" ? 0 : km / mode.kmh + mode.handling;
  const perYear = m.amount * PER_YEAR[m.per];
  const unit = m.unit.toLowerCase();
  const tonnes = /^(t|tonnes?|tons?|wmt|dmt)$/.test(unit) ? perYear : /^kt$/.test(unit) ? perYear * 1000 : /^kg$/.test(unit) ? perYear / 1000 : undefined;
  const co2t = m.kind === "goods" && tonnes !== undefined ? (tonnes * km * mode.goodsCO2) / 1000 : m.kind === "people" ? (perYear * km * mode.peopleCO2) / 1000 : 0;
  return { km, hours, perYear, tonnes, co2t };
}

/** Open issues, most urgent first (severity, then how long they've waited), each flagged if two weeks without an update (pure). */
export function issueQueue(issues: Issue[], on: string) {
  return issues.filter((i) => i.status !== "closed")
    .map((i) => ({ ...i, age: days(i.opened, on), stale: days(i.updated, on) > 14 }))
    .sort((a, b) => b.severity - a.severity || b.age - a.age);
}

/** Dated things in the next `within` days (and any already past), soonest first (pure). */
export function dueSoon(items: Dated[], on: string, within = 90) {
  return items.map((d) => ({ ...d, left: days(on, d.date) })).filter((d) => d.left <= within).sort((a, b) => a.left - b.left);
}

/** How the people and groups feel, as counts per mood (pure). */
export function moodCounts(parties: Party[]) {
  return MOODS.map((m) => ({ ...m, n: parties.filter((p) => p.mood === m.id).length }));
}

/** A spot `km` away from a point on a bearing (degrees), for drawing rings and placing demo points (pure). */
export function offsetKm(lon: number, lat: number, bearing: number, km: number): [number, number] {
  const r = Math.PI / 180, d = km / 6371, b = bearing * r, p1 = lat * r, l1 = lon * r;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((l2 / r + 540) % 360) - 180, p2 / r];
}

/** A circle on the ground, for catchments and buffers (pure). */
export const ring = (lon: number, lat: number, km: number, n = 72) => Array.from({ length: n }, (_, i) => offsetKm(lon, lat, (i * 360) / n, km));

export const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });
export const kmText = (km: number) => (km >= 100 ? `${fmt(km)} km` : `${fmt(km, 1)} km`);
