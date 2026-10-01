// How far you can get from a place, on foot, by bike and by car. The real
// shapes come from Valhalla, an open-source router over OpenStreetMap's roads
// and paths: an isochrone is everywhere reachable within so many minutes, and a
// matrix is the time from one place to many. When the router can't be reached
// the shapes are estimated as circles from typical speeds, and say so.
// Pure functions; the screen is reachUi.ts.
import { areaM2, metres, type LonLat } from "../work/geo";

export type ReachMode = "walk" | "bike" | "drive";

export const REACH_MODES: Record<ReachMode, { label: string; emoji: string; color: string; costing: string; kmh: number; detour: number }> = {
  walk: { label: "Walk", emoji: "🚶", color: "#30d158", costing: "pedestrian", kmh: 4.8, detour: 1.25 },
  bike: { label: "Bike", emoji: "🚲", color: "#ffd60a", costing: "bicycle", kmh: 16, detour: 1.3 },
  drive: { label: "Drive", emoji: "🚗", color: "#0a84ff", costing: "auto", kmh: 38, detour: 1.35 },
};
export const REACH_IDS = Object.keys(REACH_MODES) as ReachMode[];

/** The public Valhalla server run by FOSSGIS (fair use; self-host for production, see docs/data-licensing.md). */
export const VALHALLA = "https://valhalla1.openstreetmap.de";

export interface Ring { minutes: number; ring: LonLat[]; estimated?: boolean }

/** The isochrone request for a point, a mode and up to four times (pure). */
export function isochroneUrl(c: { lon: number; lat: number }, mode: ReachMode, minutes: number[], base = VALHALLA): string {
  const body = { locations: [{ lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6) }], costing: REACH_MODES[mode].costing, contours: minutes.slice(0, 4).map((time) => ({ time })), polygons: true, denoise: 0.4, generalize: 40 };
  return `${base}/isochrone?json=${encodeURIComponent(JSON.stringify(body))}`;
}

type Geo = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
export interface IsoResponse { features?: { properties?: { contour?: number }; geometry?: Geo }[] }

/** The outer ring of each contour, the largest piece when it comes in several, smallest time first (pure). */
export function parseIsochrone(r: IsoResponse): Ring[] {
  const out: Ring[] = [];
  for (const f of r.features ?? []) {
    const g = f.geometry, t = f.properties?.contour;
    if (!g || t === undefined) continue;
    const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    const best = rings.filter((x) => x && x.length > 3).map((x) => x.map(([lon, lat]) => [lon, lat] as LonLat)).sort((a, b) => areaM2(b) - areaM2(a))[0];
    if (best) out.push({ minutes: t, ring: best });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}

/** Straight-line reach in so many minutes, from typical speed and how much roads wind (km, pure). */
export const estimateKm = (mode: ReachMode, minutes: number) => (REACH_MODES[mode].kmh * minutes) / 60 / REACH_MODES[mode].detour;

/** Circles from typical speeds, for when the router can't be reached (pure). */
export function estimateRings(c: { lon: number; lat: number }, mode: ReachMode, minutes: number[], n = 48): Ring[] {
  return minutes.map((m) => {
    const km = estimateKm(mode, m), k = Math.cos((c.lat * Math.PI) / 180);
    const ring: LonLat[] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [c.lon + (Math.sin(a) * km) / (111.32 * Math.max(0.05, k)), c.lat + (Math.cos(a) * km) / 110.57];
    });
    return { minutes: m, ring, estimated: true };
  });
}

/** How far the shape reaches in each of `n` compass directions from the centre, in km (pure). */
export function reachRose(ring: LonLat[], c: { lon: number; lat: number }, n = 36): number[] {
  const k = Math.cos((c.lat * Math.PI) / 180);
  const xy = ring.map(([lon, lat]) => [(lon - c.lon) * 111.32 * k, (lat - c.lat) * 110.57]);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, dx = Math.sin(a), dy = Math.cos(a);
    let far = 0;
    for (let j = 0; j < xy.length; j++) {
      const [x1, y1] = xy[j], [x2, y2] = xy[(j + 1) % xy.length];
      const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) far = Math.max(far, t);
    }
    return far;
  });
}

export const areaKm2 = (ring: LonLat[]) => areaM2(ring) / 1e6;

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** The compass word for direction `i` of `n` (pure). */
export const dirWord = (i: number, n: number) => DIRS[Math.round((i / n) * 8) % 8];

/** One line comparing the ground each mode covers (pure). */
export function compareLine(areas: Partial<Record<ReachMode, number>>, minutes: number): string {
  const w = areas.walk, b = areas.bike, d = areas.drive;
  const parts: string[] = [];
  if (w && b) parts.push(`a bike covers ${Math.max(1, Math.round(b / w))}× the ground you can walk`);
  if (b && d) parts.push(`a car ${Math.max(1, Math.round(d / b))}× what you can bike`);
  return parts.length ? `In ${minutes} minutes ${parts.join(", and ")}.` : "";
}

// ---- Times to many places at once ---------------------------------------------------------------

/** The matrix request: one origin to many targets (pure; up to 50 targets). */
export function matrixUrl(from: { lon: number; lat: number }, to: { lon: number; lat: number }[], mode: ReachMode, base = VALHALLA): string {
  const p = (x: { lon: number; lat: number }) => ({ lat: +x.lat.toFixed(6), lon: +x.lon.toFixed(6) });
  return `${base}/sources_to_targets?json=${encodeURIComponent(JSON.stringify({ sources: [p(from)], targets: to.slice(0, 50).map(p), costing: REACH_MODES[mode].costing }))}`;
}

export interface MatrixResponse { sources_to_targets?: ({ time?: number | null; distance?: number | null } | null)[][] }

/** Minutes to each target, null where there's no way through (pure). */
export const parseMatrix = (r: MatrixResponse, n: number): (number | null)[] =>
  Array.from({ length: n }, (_, i) => { const t = r.sources_to_targets?.[0]?.[i]?.time; return typeof t === "number" ? t / 60 : null; });

/** A rough time from straight-line distance and typical speed (pure). */
export const estimateMinutes = (from: { lon: number; lat: number }, to: { lon: number; lat: number }, mode: ReachMode) =>
  ((metres([from.lon, from.lat], [to.lon, to.lat]) / 1000) * REACH_MODES[mode].detour / REACH_MODES[mode].kmh) * 60;

/** Which way wins a trip: the fastest, but walking or biking when it's within a few minutes of driving (pure). */
export function bestMode(t: Partial<Record<ReachMode, number | null>>): ReachMode | null {
  const ok = REACH_IDS.filter((m) => typeof t[m] === "number");
  if (!ok.length) return null;
  const fast = ok.reduce((a, b) => ((t[a] as number) <= (t[b] as number) ? a : b));
  // Parking, traffic lights and the walk from the car park: a short ride or walk beats a car that's barely faster.
  for (const m of ["walk", "bike"] as const) if (typeof t[m] === "number" && (t[m] as number) <= (t[fast] as number) + (m === "walk" ? 4 : 6)) return m;
  return fast;
}

export const fmtMin = (m: number | null | undefined) => (m === null || m === undefined ? "—" : m < 1 ? "<1 min" : m < 90 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`);

// ---- The 15-minute check: daily life within a short walk -------------------------------------------

export interface Need { id: string; label: string; emoji: string; match: [string, string[]][] }

export const NEEDS: Need[] = [
  { id: "food", label: "Groceries", emoji: "🛒", match: [["shop", ["supermarket", "greengrocer", "convenience", "bakery", "butcher", "grocery"]], ["amenity", ["marketplace"]]] },
  { id: "school", label: "Schools", emoji: "🏫", match: [["amenity", ["school", "kindergarten", "childcare"]]] },
  { id: "health", label: "Health", emoji: "💊", match: [["amenity", ["pharmacy", "doctors", "clinic", "hospital", "dentist"]]] },
  { id: "park", label: "Parks", emoji: "🌳", match: [["leisure", ["park", "playground", "garden", "nature_reserve"]]] },
  { id: "eat", label: "Cafés and food", emoji: "☕", match: [["amenity", ["cafe", "restaurant", "fast_food", "pub", "bar"]]] },
  { id: "transit", label: "Transit", emoji: "🚏", match: [["highway", ["bus_stop"]], ["railway", ["station", "tram_stop", "halt", "subway_entrance"]]] },
  { id: "culture", label: "Library and culture", emoji: "📚", match: [["amenity", ["library", "community_centre", "theatre", "cinema", "arts_centre"]]] },
  { id: "sport", label: "Sport", emoji: "🏃", match: [["leisure", ["sports_centre", "fitness_centre", "pitch", "swimming_pool", "track"]]] },
];

/** Thins a ring to at most `max` points, for a short query (pure). */
export function thin(ring: LonLat[], max = 60): LonLat[] {
  if (ring.length <= max) return ring;
  const step = ring.length / max;
  return Array.from({ length: max }, (_, i) => ring[Math.floor(i * step)]);
}

/** One Overpass query for every need inside the shape (pure). */
export function needsQuery(ring: LonLat[]): string {
  const poly = thin(ring).map(([lon, lat]) => `${lat.toFixed(5)} ${lon.toFixed(5)}`).join(" ");
  const parts = NEEDS.flatMap((n) => n.match.map(([k, v]) => `nwr["${k}"~"^(${v.join("|")})$"](poly:"${poly}");`));
  return `[out:json][timeout:25];(${parts.join("")});out center 1500;`;
}

/** Counts of each need from the query's answer (pure). */
export function countNeeds(els: { tags?: Record<string, string> }[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(NEEDS.map((n) => [n.id, 0]));
  for (const e of els) {
    const n = NEEDS.find((x) => x.match.some(([k, v]) => e.tags?.[k] && v.includes(e.tags[k])));
    if (n) out[n.id]++;
  }
  return out;
}

/** How many of the needs are met, and a word for it (pure). */
export function needsScore(counts: Record<string, number>): { met: number; of: number; word: string } {
  const met = NEEDS.filter((n) => (counts[n.id] ?? 0) > 0).length, of = NEEDS.length;
  return { met, of, word: met >= 7 ? "Everything on foot" : met >= 5 ? "Most of daily life on foot" : met >= 3 ? "Some of it on foot" : "Car country" };
}
