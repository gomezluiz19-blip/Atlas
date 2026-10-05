// The wayfinder's arithmetic: which way you're going, how fast, what you're passing, what's ahead and where
// you're probably headed. One model for every way of moving over the Earth in Terreno: your phone's GPS on
// foot or in a car, the camera gliding over the globe on the web, the TV flying between places. Pure, so it
// is tested on its own (tests/wayfind.test.ts) and runs the same on every screen.

export interface LL { lon: number; lat: number }
/** A position at a moment (ms), optionally with a height above the ground (m). */
export interface Fix extends LL { t: number; alt?: number }

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance, km. */
export function km(a: LL, b: LL): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Initial bearing from a to b, degrees clockwise from north, 0–360. */
export function bearing(a: LL, b: LL): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** b − a, folded into −180…180 (positive: b is to the right of a). */
export const turnFrom = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
/** The point `distKm` from p along `bearingDeg`. */
export function offset(p: LL, bearingDeg: number, distKm: number): LL {
  const d = distKm / R, b = rad(bearingDeg), la = rad(p.lat), lo = rad(p.lon);
  const lat = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat));
  return { lat: deg(lat), lon: ((deg(lon) + 540) % 360) - 180 };
}
/** The eight-point name of a bearing. */
export const compassPoint = (b: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((b % 360) + 360) % 360) / 45) % 8];

export interface Motion {
  /** Degrees clockwise from north. */
  heading: number;
  speedKmh: number;
  /** How straight the recent path is, 0 (wandering) to 1 (a straight line). */
  steady: number;
}
/**
 * How you're moving, from the fixes in the last `windowMs`: the heading is the overall displacement (so GPS
 * jitter and a wobbly drag cancel out), the speed is path length over time, and steadiness is how much of the
 * path went somewhere. Null when there's too little to go on or you've hardly moved.
 */
export function motionOf(fixes: Fix[], windowMs = 20_000, minKm = 0.015): Motion | null {
  if (fixes.length < 2) return null;
  const end = fixes[fixes.length - 1].t;
  const w = fixes.filter((f) => end - f.t <= windowMs);
  if (w.length < 2) return null;
  const a = w[0], b = w[w.length - 1];
  const disp = km(a, b);
  if (disp < minKm) return null;
  let path = 0;
  for (let i = 1; i < w.length; i++) path += km(w[i - 1], w[i]);
  const hours = (b.t - a.t) / 3_600_000;
  if (hours <= 0) return null;
  return { heading: bearing(a, b), speedKmh: path / hours, steady: path > 0 ? Math.min(1, disp / path) : 0 };
}

export type Pace = "still" | "walk" | "run" | "cycle" | "drive" | "rail" | "fly";
/** What a ground speed suggests you're doing. */
export function paceOf(kmh: number): Pace {
  return kmh < 1.2 ? "still" : kmh < 7 ? "walk" : kmh < 13 ? "run" : kmh < 28 ? "cycle" : kmh < 140 ? "drive" : kmh < 320 ? "rail" : "fly";
}
/** How far someone moving at that pace is plausibly headed, km. */
export const PACE_REACH: Record<Pace, number> = { still: 2, walk: 6, run: 15, cycle: 35, drive: 450, rail: 900, fly: 16_000 };

/** Something worth telling you about. `weight`: 3 a landmark the world knows, 2 notable, 1 local. */
export interface Poi extends LL { id: string; name: string; kind: string; line: string; weight: number; where?: string }
export interface Sighting { poi: Poi; km: number; /** Relative bearing: 0 dead ahead, −90 on your left, +90 on your right. */ rel: number; /** Minutes away at your pace. */ eta: number | null }

const look = (pos: LL, heading: number, p: Poi, speedKmh?: number): Sighting => {
  const d = km(pos, p);
  return { poi: p, km: d, rel: turnFrom(heading, bearing(pos, p)), eta: speedKmh && speedKmh > 1 ? (d / speedKmh) * 60 : null };
};

/** What's ahead within range and a cone either side of your heading, the most worth it first. */
export function aheadOf(pos: LL, heading: number, pois: Poi[], o: { rangeKm: number; coneDeg?: number; minWeight?: number; speedKmh?: number; limit?: number }): Sighting[] {
  const cone = o.coneDeg ?? 40, min = o.minWeight ?? 1;
  const out: { s: Sighting; score: number }[] = [];
  for (const p of pois) {
    if (p.weight < min) continue;
    const s = look(pos, heading, p, o.speedKmh);
    if (s.km > o.rangeKm || s.km < 1e-3 || Math.abs(s.rel) > cone) continue;
    out.push({ s, score: p.weight * (1.15 - s.km / o.rangeKm) * Math.cos(rad(s.rel)) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.limit ?? 6).map((x) => x.s);
}

/**
 * The thing you're passing right now, if any: within `reachKm`, not yet told, and as close as it's going to
 * get (beside you, or so near that ahead or behind hardly matters). Landmarks beat local curiosities; nearer
 * beats farther.
 */
export function passingNow(pos: LL, heading: number | null, pois: Poi[], reachKm: number, told: ReadonlySet<string>, minWeight = 1): Sighting | null {
  let best: Sighting | null = null, bestScore = -1;
  for (const p of pois) {
    if (p.weight < minWeight || told.has(p.id)) continue;
    const s = look(pos, heading ?? 0, p);
    if (s.km > reachKm) continue;
    // Beside you, or so close it hardly matters; not once it's fallen behind.
    const abeam = heading === null || (s.km < reachKm * 0.35 && Math.abs(s.rel) <= 150) || (Math.abs(s.rel) >= 50 && Math.abs(s.rel) <= 125);
    if (!abeam) continue;
    const score = p.weight * 2 + (1 - s.km / reachKm);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

/** A place you might be going: home, a saved place, a recent search, a trip you planned. */
export interface Candidate extends LL { id: string; name: string; why: "home" | "saved" | "recent" | "plan" | "poi"; weight: number }
export interface Guess { c: Candidate; km: number; rel: number; eta: number | null; confidence: number }

/**
 * Where you're probably headed: the candidate most nearly ahead and within reach of your pace, weighted by how
 * much it means to you (home counts double from late afternoon). Only a guess worth showing comes back: one
 * that clearly beats the rest, on a path that's been going somewhere.
 */
export function guessDestination(pos: LL, m: Motion, cands: Candidate[], o: { reachKm?: number; hour?: number; minKm?: number; threshold?: number } = {}): Guess | null {
  const reach = o.reachKm ?? PACE_REACH[paceOf(m.speedKmh)], hour = o.hour ?? 12, min = o.minKm ?? 0.15;
  if (m.steady < 0.55) return null;
  const scored: { g: Guess; score: number }[] = [];
  for (const c of cands) {
    const d = km(pos, c);
    if (d < min || d > reach) continue;
    const rel = turnFrom(m.heading, bearing(pos, c));
    if (Math.abs(rel) > 55) continue;
    const align = Math.cos(rad(rel)) ** 4;
    const near = 0.35 + 0.65 * (1 - d / reach);
    const when = c.why === "home" && (hour >= 16 || hour < 3) ? 2 : 1;
    scored.push({ g: { c, km: d, rel, eta: m.speedKmh > 1.5 ? (d / m.speedKmh) * 60 * 1.25 : null, confidence: 0 }, score: c.weight * when * align * near * m.steady });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const total = scored.reduce((s, x) => s + x.score, 0), top = scored[0];
  top.g.confidence = (top.score / total) * Math.min(1, m.steady * 1.15);
  return top.g.confidence >= (o.threshold ?? 0.56) ? top.g : null;
}

/** How wide to look from a height above the ground (m): what counts as passing, how far ahead, how notable. */
export function scaleFor(altM: number): { reachKm: number; rangeKm: number; minWeight: number } {
  const a = Math.max(0, altM) / 1000;
  return {
    reachKm: Math.min(450, Math.max(0.6, a * 0.45)),
    rangeKm: Math.min(3500, Math.max(8, a * 3)),
    minWeight: a > 900 ? 3 : a > 40 ? 2 : 1,
  };
}

/** Where a sighting sits on a compass ribbon `fovDeg` wide, 0–1 across (null when it's off the ribbon). */
export function ribbonX(rel: number, fovDeg = 160): number | null {
  const x = 0.5 + rel / fovDeg;
  return x < 0 || x > 1 ? null : x;
}

/** A distance said the way a person would. */
export function distanceText(k: number): string {
  if (k < 1) return `${Math.max(10, Math.round((k * 1000) / 10) * 10)} m`;
  if (k < 10) return `${k.toFixed(1)} km`;
  return `${Math.round(k).toLocaleString("en")} km`;
}
/** Minutes said the way a person would. */
export function etaText(min: number | null): string {
  if (min === null || !isFinite(min)) return "";
  if (min < 1) return "under a minute";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** Where something is relative to you, in words: "ahead", "on your left", "behind you, right". */
export function sideText(rel: number): string {
  const a = Math.abs(rel);
  if (a <= 20) return "ahead";
  if (a <= 65) return rel < 0 ? "ahead on the left" : "ahead on the right";
  if (a <= 115) return rel < 0 ? "on your left" : "on your right";
  return "just behind you";
}
