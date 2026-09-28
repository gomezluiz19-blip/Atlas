// Construction projects: a building's massing, its phases on a schedule, how
// far along it is (planned vs actual), rough quantities and cost, and which
// days the weather stops work.
import type { SiteDay } from "../data/openmeteo";
import type { LonLat } from "./geo";

export type Use = "house" | "apartments" | "office" | "retail" | "warehouse" | "school" | "hospital" | "hotel";

/** Typical storey heights (m) and a rough build cost (US$ per m² of floor, mid-range, 2024) for a first estimate. */
export const USES: Record<Use, { label: string; storey: number; cost: number; color: string }> = {
  house: { label: "House", storey: 3.0, cost: 1900, color: "#ffd9a0" },
  apartments: { label: "Apartments", storey: 3.1, cost: 2400, color: "#f4c7a1" },
  office: { label: "Offices", storey: 3.8, cost: 3000, color: "#bcd4f0" },
  retail: { label: "Shops", storey: 4.5, cost: 2200, color: "#f0c0d0" },
  warehouse: { label: "Warehouse", storey: 9, cost: 1100, color: "#d8d8d0" },
  school: { label: "School", storey: 3.8, cost: 3200, color: "#c8e6b0" },
  hospital: { label: "Hospital", storey: 4.2, cost: 5200, color: "#e6f0f8" },
  hotel: { label: "Hotel", storey: 3.2, cost: 3400, color: "#e8d4f0" },
};

export type PhaseId = "site" | "foundations" | "structure" | "envelope" | "services" | "interiors" | "handover";

export const PHASES: { id: PhaseId; label: string; color: string; about: string }[] = [
  { id: "site", label: "Site preparation", color: "#a2845e", about: "Clearing, fencing, levelling, temporary services" },
  { id: "foundations", label: "Foundations", color: "#8e8e93", about: "Excavation, piles or footings, ground slab" },
  { id: "structure", label: "Structure", color: "#ff9f0a", about: "Frame and floors, storey by storey" },
  { id: "envelope", label: "Envelope", color: "#64d2ff", about: "Walls, windows and roof: weathertight" },
  { id: "services", label: "Services (MEP)", color: "#bf5af2", about: "Electrical, plumbing, heating and ventilation" },
  { id: "interiors", label: "Interiors", color: "#ff375f", about: "Partitions, finishes, fittings" },
  { id: "handover", label: "Handover", color: "#30d158", about: "Testing, snagging, inspections, keys" },
];

export interface Phase { id: PhaseId; start: string; end: string; /** Actual % complete, 0–100. */ done: number }

export interface BuildProject {
  id: string;
  name: string;
  use: Use;
  floors: number;
  storey: number;
  ring: LonLat[];
  /** Ground height (m), sampled when the footprint is drawn. */
  ground?: number;
  costRate: number;
  created: number;
  phases: Phase[];
  // Worksite (Pro)
  log: { date: string; text: string; photo?: string; crew?: number }[];
  issues: { id: string; pt: LonLat; text: string; open: boolean; date: string }[];
  deliveries: { date: string; text: string }[];
}

const DAY = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + Math.round(n) * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** A typical schedule: durations grow with floors and floor area; phases overlap a little. */
export function defaultSchedule(start: string, floors: number, gfa: number): Phase[] {
  const size = Math.max(1, Math.sqrt(gfa / 500));
  const d: Record<PhaseId, number> = {
    site: 10 + 4 * size, foundations: 18 + 8 * size, structure: floors * (8 + 2 * size), envelope: 20 + floors * 5 + 3 * size,
    services: 25 + floors * 6 + 5 * size, interiors: 30 + floors * 7 + 6 * size, handover: 14 + 2 * size,
  };
  const out: Phase[] = [];
  let t = start;
  for (const p of PHASES) {
    const len = Math.round(d[p.id]);
    // Envelope starts when the structure is half up; services and interiors overlap the phase before.
    const overlap = p.id === "envelope" ? Math.round(d.structure * 0.5) : p.id === "services" || p.id === "interiors" ? Math.round(len * 0.35) : 0;
    const s = out.length ? addDays(t, -overlap) : t;
    const e = addDays(s, len);
    out.push({ id: p.id, start: s, end: e, done: 0 });
    t = e;
  }
  return out;
}

/** Share of the project's effort in each phase (for overall %). */
const WEIGHT: Record<PhaseId, number> = { site: 0.04, foundations: 0.1, structure: 0.28, envelope: 0.16, services: 0.17, interiors: 0.2, handover: 0.05 };

/** Planned % complete of a phase on a date. */
export function plannedPct(p: Phase, date: string): number {
  if (date <= p.start) return 0;
  if (date >= p.end) return 100;
  return (100 * daysBetween(p.start, date)) / Math.max(1, daysBetween(p.start, p.end));
}

export function overall(phases: Phase[], pct: (p: Phase) => number): number {
  return phases.reduce((s, p) => s + WEIGHT[p.id] * pct(p), 0);
}

export interface Status { planned: number; actual: number; /** Positive: days behind plan. */ behindDays: number; finish: string; current: PhaseId | null }

/** Where the project stands today against its plan, and the finish date that implies. */
export function status(phases: Phase[], today: string): Status {
  const planned = overall(phases, (p) => plannedPct(p, today));
  const actual = overall(phases, (p) => p.done);
  const start = phases[0]?.start ?? today, end = phases[phases.length - 1]?.end ?? today;
  // The planned date at which the actual progress should have been reached.
  let lo = start, hi = end;
  for (let i = 0; i < 30 && lo < hi; i++) {
    const mid = addDays(lo, daysBetween(lo, hi) / 2);
    if (mid === lo) break;
    if (overall(phases, (p) => plannedPct(p, mid)) < actual) lo = mid;
    else hi = mid;
  }
  const behindDays = actual >= 99.9 ? 0 : Math.max(-daysBetween(start, end), daysBetween(hi, today));
  const current = phases.find((p) => p.done < 100)?.id ?? null;
  return { planned, actual, behindDays, finish: actual >= 99.9 ? today : addDays(end, Math.max(0, behindDays)), current };
}

/** What the building looks like at a given state: floors framed and closed in, and whether it's finished. */
export function massing(floors: number, pct: (id: PhaseId) => number) {
  return {
    siteWorks: pct("site") > 0,
    slab: pct("foundations") >= 100 ? 1 : pct("foundations") / 100,
    framed: (floors * pct("structure")) / 100,
    closed: Math.floor((floors * pct("envelope")) / 100),
    complete: pct("handover") >= 100,
    crane: pct("structure") > 0 && pct("envelope") < 100,
  };
}

/** Days the weather gets in the way: rain (no pours or roofing), wind (cranes stand down), frost (concrete). */
export function weatherRisks(days: SiteDay[]) {
  return days.map((d) => {
    const why: string[] = [];
    if (d.rain >= 5) why.push(`rain ${d.rain.toFixed(0)} mm`);
    if (d.gustMax >= 60 || d.windMax >= 40) why.push(`gusts ${d.gustMax.toFixed(0)} km/h`);
    if (d.tmin <= 2) why.push(`frost risk ${d.tmin.toFixed(0)} °C`);
    if (d.tmax >= 35) why.push(`heat ${d.tmax.toFixed(0)} °C`);
    return { date: d.date, ok: !why.length, why, crane: d.gustMax < 60 && d.windMax < 40, pour: d.rain < 5 && d.tmin > 2 };
  });
}
