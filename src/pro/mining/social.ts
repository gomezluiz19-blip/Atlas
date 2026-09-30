// A mine's social performance, the way the standards ask for it: a grievance
// mechanism with stages and response times (IFC Performance Standard 1, the
// ICMM mining principles), a register of commitments made to communities,
// stakeholders going unheard, and the tailings dam's consequence under the
// Global Industry Standard on Tailings Management (GISTM): who is downstream
// along the path water would take. Pure functions.
import { days, kmBetween, type Issue, type Log, type Party } from "../kit/ops";

export const CATEGORIES = ["Environment", "Water", "Dust and noise", "Land and compensation", "Employment and procurement", "Health and safety", "Traffic", "Cultural heritage", "Human rights", "Other"] as const;
export const CHANNELS = ["In person", "Phone", "SMS or WhatsApp", "Letter", "Community meeting", "Grievance box", "Third party"] as const;
export type Stage = "received" | "acknowledged" | "investigating" | "responded" | "closed" | "appealed";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "received", label: "Received" }, { id: "acknowledged", label: "Acknowledged" }, { id: "investigating", label: "Investigating" },
  { id: "responded", label: "Response given" }, { id: "closed", label: "Closed" }, { id: "appealed", label: "Appealed" },
];
/** Days to acknowledge and to respond, as most mechanisms commit to. */
export const ACK_DAYS = 7, RESPOND_DAYS = 30;

export interface Grievance extends Issue {
  category?: string; channel?: string; stage?: Stage; anonymous?: boolean;
  acknowledged?: string; responded?: string; closed?: string;
  /** Was the person satisfied with the outcome (asked at closing)? */
  satisfied?: boolean;
  history?: Log[];
}

export const stageOf = (g: Grievance): Stage => g.stage ?? (g.status === "closed" ? "closed" : g.responded ? "responded" : g.acknowledged ? "acknowledged" : "received");

/** Moves a grievance to a stage, stamping the dates the standards count from (pure: returns the new grievance). */
export function advance(g: Grievance, to: Stage, on: string, note?: string): Grievance {
  const x: Grievance = { ...g, stage: to, updated: on, history: [...(g.history ?? []), { at: on, text: `${STAGES.find((s) => s.id === to)!.label}${note ? `: ${note}` : ""}` }] };
  if (to !== "received" && !x.acknowledged) x.acknowledged = on;
  if ((to === "responded" || to === "closed") && !x.responded) x.responded = on;
  if (to === "closed") { x.closed = on; x.status = "closed"; } else x.status = to === "responded" ? "waiting" : "open";
  if (to === "appealed") { x.closed = undefined; x.status = "open"; }
  return x;
}

/** Where a grievance stands against the response times (pure). */
export function sla(g: Grievance, on: string) {
  const age = days(g.opened, on), st = stageOf(g);
  return {
    age,
    lateAck: !g.acknowledged && st === "received" && age > ACK_DAYS,
    lateResponse: !g.responded && st !== "closed" && age > RESPOND_DAYS,
  };
}

const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** The grievance mechanism's performance, for the site team and the board (pure). */
export function grievanceKpis(gs: Grievance[], on: string) {
  const acked = gs.filter((g) => g.acknowledged), responded = gs.filter((g) => g.responded), closed = gs.filter((g) => g.closed);
  const rated = closed.filter((g) => g.satisfied !== undefined);
  const open = gs.filter((g) => stageOf(g) !== "closed");
  const year = gs.filter((g) => days(g.opened, on) <= 365);
  const byCategory = [...year.reduce((m, g) => m.set(g.category ?? "Other", (m.get(g.category ?? "Other") ?? 0) + 1), new Map<string, number>())].map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
  const byParty = [...year.filter((g) => g.party).reduce((m, g) => m.set(g.party!, (m.get(g.party!) ?? 0) + 1), new Map<string, number>())].map(([party, n]) => ({ party, n })).sort((a, b) => b.n - a.n);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.parse(on + "T12:00:00Z")); d.setUTCMonth(d.getUTCMonth() - (11 - i));
    const key = d.toISOString().slice(0, 7);
    return { month: key, n: gs.filter((g) => g.opened.slice(0, 7) === key).length };
  });
  return {
    total: gs.length, open: open.length,
    ackOnTime: acked.length ? acked.filter((g) => days(g.opened, g.acknowledged!) <= ACK_DAYS).length / acked.length : null,
    respondOnTime: responded.length ? responded.filter((g) => days(g.opened, g.responded!) <= RESPOND_DAYS).length / responded.length : null,
    medianDaysToClose: median(closed.map((g) => days(g.opened, g.closed!))),
    satisfaction: rated.length ? rated.filter((g) => g.satisfied).length / rated.length : null,
    lateAck: open.filter((g) => sla(g, on).lateAck).length,
    lateResponse: open.filter((g) => sla(g, on).lateResponse).length,
    appealed: gs.filter((g) => stageOf(g) === "appealed").length,
    byCategory, months,
    /** Groups raising three or more in a year: a pattern, not a one-off. */
    repeat: byParty.filter((x) => x.n >= 3),
  };
}

// ---- Commitments ----------------------------------------------------------------------------------

export interface Commitment { id: string; text: string; to?: string; made: string; due: string; owner?: string; status: "open" | "done" | "dropped"; done?: string }

/** Commitments by where they stand (pure). */
export function commitmentStatus(cs: Commitment[], on: string) {
  const open = cs.filter((c) => c.status === "open").map((c) => ({ ...c, left: days(on, c.due) })).sort((a, b) => a.left - b.left);
  const finished = cs.filter((c) => c.status === "done");
  return {
    open, overdue: open.filter((c) => c.left < 0), soon: open.filter((c) => c.left >= 0 && c.left <= 30),
    kept: finished.length, keptOnTime: finished.filter((c) => c.done && c.done <= c.due).length,
  };
}

/** People and groups nobody has spoken to in `within` days, longest first (pure). */
export function goingCold(parties: Party[], on: string, within = 90) {
  return parties.map((p) => ({ p, last: p.log.map((l) => l.at).sort().pop() })).map((x) => ({ ...x, since: x.last ? days(x.last, on) : Infinity }))
    .filter((x) => x.since > within).sort((a, b) => b.since - a.since);
}

// ---- Tailings: the path water would take ---------------------------------------------------------

/**
 * The steepest way down from a cell of a height grid (row-major, north row
 * first), cell by cell, until it runs off the edge or has crossed `maxFlat`
 * cells without dropping (a lake or a flat); pure. Returns [col, row] cells.
 */
export function flowPath(heights: ArrayLike<number>, n: number, start: [number, number], maxFlat = 25): [number, number][] {
  const at = (i: number, j: number) => heights[j * n + i];
  const path: [number, number][] = [start];
  const seen = new Set([start[1] * n + start[0]]);
  let [i, j] = start, flat = 0;
  for (let step = 0; step < n * 4; step++) {
    let best: [number, number] | null = null, bestDrop = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || seen.has(b * n + a)) continue;
      const drop = (at(i, j) - at(a, b)) / (di && dj ? Math.SQRT2 : 1);
      if (drop > bestDrop) { bestDrop = drop; best = [a, b]; }
    }
    if (!best) break;
    flat = bestDrop > 0 ? 0 : flat + 1;
    if (flat > maxFlat) break;
    [i, j] = best;
    seen.add(j * n + i);
    path.push(best);
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) break;
  }
  return path;
}

/** Distance (km) from a point to a path, and how far along the path the nearest spot is (pure). */
export function toPath(p: { lon: number; lat: number }, path: [number, number][]) {
  let best = Infinity, along = 0, run = 0;
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180), ky = 110.54;
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [bx, by] = path[k];
    const ux = (bx - ax) * kx, uy = (by - ay) * ky, len = Math.hypot(ux, uy) || 1e-9;
    const t = Math.max(0, Math.min(1, (((p.lon - ax) * kx) * ux + ((p.lat - ay) * ky) * uy) / (len * len)));
    const d = Math.hypot((p.lon - ax) * kx - t * ux, (p.lat - ay) * ky - t * uy);
    if (d < best) { best = d; along = run + t * len; }
    run += len;
  }
  return { km: best, along };
}

/**
 * The GISTM consequence class by population at risk (Table 1 of the
 * standard's Annex 2): none is Low; 1–10 Significant; 10–100 High;
 * 100–1,000 Very high; over 1,000 Extreme. Other factors (environment,
 * infrastructure) can raise it; this reads population only (pure).
 */
export function gistmClass(par: number): { label: "Low" | "Significant" | "High" | "Very high" | "Extreme"; color: string } {
  if (par <= 0) return { label: "Low", color: "#30d158" };
  if (par <= 10) return { label: "Significant", color: "#ffd60a" };
  if (par <= 100) return { label: "High", color: "#ff9f0a" };
  if (par <= 1000) return { label: "Very high", color: "#ff453a" };
  return { label: "Extreme", color: "#bf1f2f" };
}

/** Places within `bufferKm` of the path, nearest the dam first (pure). */
export function downstream<T extends { lon: number; lat: number }>(places: T[], path: [number, number][], bufferKm = 2) {
  if (path.length < 2) return [];
  return places.map((p) => ({ p, ...toPath(p, path) })).filter((x) => x.km <= bufferKm).sort((a, b) => a.along - b.along);
}

export const pathKm = (path: [number, number][]) => path.slice(1).reduce((s, p, k) => s + kmBetween({ lon: path[k][0], lat: path[k][1] }, { lon: p[0], lat: p[1] }), 0);
