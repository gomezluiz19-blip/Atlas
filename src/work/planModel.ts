// Plans: anything you're planning, as things placed on the map: a trip, an event,
// where to open, a route or build, areas on a map, or anything else (places,
// routes and areas with a checklist), each with the numbers that matter for it.
import { along, areaM2, inside, metres, pathLength, type LonLat } from "./geo";

export type PlanType = "trip" | "event" | "business" | "policy" | "infrastructure" | "general";
export type TravelMode = "walk" | "bike" | "drive" | "transit" | "fly";

export interface PlanItem {
  id: string;
  kind: "point" | "line" | "area";
  pts: LonLat[];
  name: string;
  note?: string;
  /** Trips: the day of this stop (YYYY-MM-DD). */
  date?: string;
}

export interface Plan {
  id: string;
  type: PlanType;
  name: string;
  created: number;
  items: PlanItem[];
  checklist: { text: string; done: boolean }[];
  mode?: TravelMode;
  attendees?: number;
  notes?: string;
  /** Events: the day, step by step (a journey starting at the venue). */
  program?: import("./journeyModel").Journey;
}

/** Each kind of plan in plain words, in the order they're offered. */
export const PLAN_TYPES: Record<PlanType, { label: string; color: string; about: string; add: { kind: PlanItem["kind"]; label: string; name: string }[] }> = {
  trip: { label: "A trip", color: "#3563d6", about: "Where you'll go and stay, and how you'll get between them, day by day", add: [{ kind: "point", label: "Add a stop", name: "Stop" }] },
  event: { label: "An event", color: "#b8496a", about: "A party, a wedding, a meetup: the venue, the running order, how people get there", add: [{ kind: "point", label: "Place the venue", name: "Venue" }, { kind: "point", label: "Add a meeting point or parking", name: "Meeting point" }] },
  business: { label: "Where to open", color: "#5b9467", about: "Compare spots for a shop, an office or a warehouse: transport, power and what's near", add: [{ kind: "point", label: "Add a spot", name: "Site" }] },
  infrastructure: { label: "A route or a build", color: "#d19a2e", about: "A path, a road, a pipe or a line: how long it is, the ground and what it crosses", add: [{ kind: "line", label: "Draw the route", name: "Route" }, { kind: "point", label: "Place a building", name: "Facility" }] },
  policy: { label: "Areas on a map", color: "#8b5fa8", about: "Draw areas (a delivery zone, a catchment, a district) and see what's inside each", add: [{ kind: "area", label: "Draw an area", name: "Area" }] },
  general: { label: "Anything else", color: "#9c4a32", about: "Drop places, draw routes and areas, keep a checklist, all on one map", add: [{ kind: "point", label: "Add a place", name: "Place" }, { kind: "line", label: "Draw a route", name: "Route" }, { kind: "area", label: "Draw an area", name: "Area" }] },
};

const KIND_WORDS: [RegExp, PlanType][] = [
  [/\b(trip|travel|holiday|vacation|getaway|road ?trip|tour|honeymoon|visit|weekend (in|away)|flight|itinerary|backpack)/i, "trip"],
  [/\b(party|wedding|birthday|\d+(st|nd|rd|th)\b|meet ?up|reunion|conference|festival|gig|concert|launch|event|dinner|picnic|ceremony|fundraiser|marathon|race)/i, "event"],
  [/\b(open(ing)?|new (shop|store|office|restaurant|café|cafe|warehouse|clinic|branch|location)|where to (open|put|put up|locate)|site for|premises|lease|franchise)/i, "business"],
  [/\b(road|path|pipe(line)?|cable|rail(way)?|bike lane|cycle ?lane|trail|bridge|power line|sewer|fence|build(ing)?|construct)/i, "infrastructure"],
  [/\b(zone|area|district|catchment|ward|boundary|territory|delivery area|patch|neighbou?rhood|region|coverage)/i, "policy"],
];

/** What kind of plan someone means, from how they'd say it ("Ana's 30th", "a new bike lane"); anything else otherwise (pure). */
export function planKindFor(text: string): PlanType {
  return KIND_WORDS.find(([re]) => re.test(text))?.[1] ?? "general";
}

/** A plan's name from how it was described: the words, tidied, first letter up (pure). */
export const planNameFrom = (text: string) => { const t = text.trim().replace(/\s+/g, " ").replace(/^(i'?m |we'?re )?(planning |plan )(a |an |my |our )?/i, "").slice(0, 60); return t ? t[0].toUpperCase() + t.slice(1) : ""; };

/** Typical door-to-door speeds (km/h) and how much longer real routes are than a straight line. */
export const MODES: Record<TravelMode, { label: string; kmh: number; detour: number; overheadH: number }> = {
  walk: { label: "Walking", kmh: 4.8, detour: 1.3, overheadH: 0 },
  bike: { label: "Cycling", kmh: 15, detour: 1.3, overheadH: 0 },
  drive: { label: "Driving", kmh: 60, detour: 1.3, overheadH: 0 },
  transit: { label: "Bus or train", kmh: 35, detour: 1.35, overheadH: 0.25 },
  fly: { label: "Flying", kmh: 750, detour: 1.05, overheadH: 2.5 },
};

export interface Leg { from: PlanItem; to: PlanItem; straight: number; route: number; hours: number }

/** Legs between consecutive stops, with estimated route length and travel time. */
export function legs(stops: PlanItem[], mode: TravelMode): Leg[] {
  const m = MODES[mode];
  const out: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const straight = metres(stops[i - 1].pts[0], stops[i].pts[0]);
    const route = straight * m.detour;
    out.push({ from: stops[i - 1], to: stops[i], straight, route, hours: route / 1000 / m.kmh + (straight > 0 ? m.overheadH : 0) });
  }
  return out;
}

/** A circle as a ring of points (for reach rings around a venue). */
export function circle(centre: LonLat, radiusM: number, steps = 64): LonLat[] {
  const kx = 111_320 * Math.cos((centre[1] * Math.PI) / 180), ky = 110_540;
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [centre[0] + (Math.sin(a) * radiusM) / kx, centre[1] + (Math.cos(a) * radiusM) / ky] as LonLat;
  });
}

interface ZoneCount { count: number; total?: number }

/** Counts points inside a zone, optionally summing a value (e.g. MW). */
export function countInside<T extends { lon: number; lat: number }>(ring: LonLat[], items: T[], value?: (t: T) => number): ZoneCount {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  let count = 0, total = 0;
  for (const it of items) {
    if (it.lon < w || it.lon > e || it.lat < s || it.lat > n || !inside(ring, [it.lon, it.lat])) continue;
    count++;
    if (value) total += value(it);
  }
  return value ? { count, total } : { count };
}

/** Length of lines inside a zone, approximated segment by segment (m). */
export function lengthInside(ring: LonLat[], lines: { xy: ArrayLike<number>; bbox: [number, number, number, number] }[]): number {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  // Long segments are split into pieces about 1/100 of the zone's size, so only the part inside counts.
  const step = Math.max(1e-5, Math.max(e - w, n - s) / 100);
  let m = 0;
  for (const l of lines) {
    if (l.bbox[2] < w || l.bbox[0] > e || l.bbox[3] < s || l.bbox[1] > n) continue;
    for (let i = 0; i + 3 < l.xy.length; i += 2) {
      const a: LonLat = [l.xy[i], l.xy[i + 1]], b: LonLat = [l.xy[i + 2], l.xy[i + 3]];
      const k = Math.min(500, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
      const piece = metres(a, b) / k;
      for (let j = 0; j < k; j++) {
        const t = (j + 0.5) / k;
        if (inside(ring, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) m += piece;
      }
    }
  }
  return m;
}

export interface Profile { dist: number[]; elev: number[]; min: number; max: number; climb: number; descent: number; steepest: number }

/** Summary of an elevation profile along a route: range, total climb and the steepest grade (%). */
export function profileStats(pts: LonLat[], elev: number[]): Profile {
  const samples = along(pts, elev.length);
  const dist: number[] = [0];
  for (let i = 1; i < samples.length; i++) dist.push(dist[i - 1] + metres(samples[i - 1], samples[i]));
  let climb = 0, descent = 0, steepest = 0;
  for (let i = 1; i < elev.length; i++) {
    const dz = elev[i] - elev[i - 1], dx = dist[i] - dist[i - 1];
    if (dz > 0) climb += dz;
    else descent -= dz;
    if (dx > 1) steepest = Math.max(steepest, Math.abs(dz / dx) * 100);
  }
  return { dist, elev, min: Math.min(...elev), max: Math.max(...elev), climb, descent, steepest };
}

export { areaM2, pathLength };
