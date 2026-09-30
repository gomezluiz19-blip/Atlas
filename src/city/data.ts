// What a living city is built from, read once from OpenStreetMap for the area
// in view: buildings (with their height), the road network (joined into a
// graph so cars and people can turn at junctions), trees (mapped ones, and
// more scattered through parks), and the places people gather (shops,
// cafés, stations), so crowds form where they would.
import { overpass } from "../data/overpass";
import { buildingHeight } from "../myplaces/scene";

export type Mover = "car" | "person";

export interface Road {
  id: number;
  pts: [number, number][];
  nodes: number[];
  /** Metres from the start to each point. */
  cum: number[];
  len: number;
  car: boolean;
  foot: boolean;
  oneway: boolean;
  /** Speed limit-ish, metres a second. */
  speed: number;
  /** How busy with walkers (near shops and stations). */
  busy: number;
}

export interface CityData {
  centre: [number, number];
  buildings: { ring: [number, number][]; height: number; kind: string }[];
  roads: Road[];
  trees: [number, number][];
  hotspots: [number, number][];
  /** Node id → where it is on which roads (for turning). */
  junctions: Map<number, { road: number; i: number }[]>;
}

const CAR: Record<string, number> = {
  motorway: 27, trunk: 22, primary: 15, secondary: 13, tertiary: 11, unclassified: 9, residential: 8, living_street: 4, service: 5,
  motorway_link: 16, trunk_link: 14, primary_link: 12, secondary_link: 11, tertiary_link: 10,
};
const FOOT_ONLY = new Set(["pedestrian", "footway", "path", "steps"]);
const WALKABLE = new Set(["pedestrian", "footway", "path", "steps", "residential", "living_street", "tertiary", "secondary", "primary", "unclassified", "service"]);

export const M_LAT = 110_540;
export const mLon = (lat: number) => 111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
export const dist = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * mLon((a[1] + b[1]) / 2), (b[1] - a[1]) * M_LAT);

/** How each road is used: cars, people, or both (pure). */
export function roadUse(t: Record<string, string>): { car: boolean; foot: boolean; speed: number; oneway: boolean } | null {
  const hw = t.highway;
  if (!hw) return null;
  const car = hw in CAR && t.access !== "no" && t.motor_vehicle !== "no";
  const foot = WALKABLE.has(hw) && t.foot !== "no" && hw !== "motorway" && hw !== "trunk";
  if (!car && !foot) return null;
  const limit = parseFloat(t.maxspeed ?? "");
  const speed = FOOT_ONLY.has(hw) ? 1.4 : Number.isFinite(limit) && limit > 0 ? Math.min(CAR[hw] ?? 10, (limit / 3.6) * 0.8) : CAR[hw] ?? 8;
  return { car, foot, speed, oneway: t.oneway === "yes" || t.oneway === "1" || hw === "motorway" || t.junction === "roundabout" };
}

/** How busy a street is with walkers: more near shops, cafés and stations (pure). */
export function busyness(pts: [number, number][], hotspots: [number, number][]): number {
  // Every point and every segment's middle (a shop halfway along a street counts).
  const probes: [number, number][] = [];
  for (let i = 0; i < pts.length && probes.length < 200; i++) {
    probes.push(pts[i]);
    if (i + 1 < pts.length) probes.push([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]);
  }
  let n = 0;
  for (const h of hotspots) if (probes.some((p) => dist(p, h) < 90)) n++;
  return 1 + Math.min(12, n);
}

/** Scatters trees through parks and green spaces, about one per `spacing` metres, within a cap (pure, seeded). */
export function scatterTrees(ring: [number, number][], spacing = 16, cap = 60, seed = 1): [number, number][] {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const out: [number, number][] = [];
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const stepX = spacing / mLon((s + n) / 2), stepY = spacing / M_LAT;
  for (let y = s; y < n && out.length < cap; y += stepY)
    for (let x = w; x < e && out.length < cap; x += stepX) {
      const px = x + (rand() - 0.5) * stepX, py = y + (rand() - 0.5) * stepY;
      if (inRing(ring, px, py)) out.push([px, py]);
    }
  return out;
}

export function inRing(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface El { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[] }

/** Builds the city from OpenStreetMap elements (pure). */
export function readCity(els: El[], centre: [number, number]): CityData {
  const hotspots: [number, number][] = [];
  const trees: [number, number][] = [];
  const buildings: CityData["buildings"] = [];
  const raw: { el: El; use: NonNullable<ReturnType<typeof roadUse>> }[] = [];
  let seed = 7;
  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type === "node" && el.lon !== undefined && el.lat !== undefined) {
      if (t.natural === "tree") trees.push([el.lon, el.lat]);
      else hotspots.push([el.lon, el.lat]);
      continue;
    }
    const g = el.geometry;
    if (!g || g.length < 2) continue;
    const pts = g.map((p) => [p.lon, p.lat] as [number, number]);
    if (t.building && pts.length >= 4) { buildings.push({ ring: pts, height: buildingHeight(t).height, kind: t.building }); continue; }
    if (t.leisure === "park" || t.landuse === "grass" || t.landuse === "forest" || t.landuse === "recreation_ground") { trees.push(...scatterTrees(pts, t.landuse === "forest" ? 11 : 18, t.landuse === "forest" ? 90 : 50, seed++)); continue; }
    const use = roadUse(t);
    if (use && el.nodes?.length === pts.length) raw.push({ el, use });
  }
  const roads: Road[] = raw.map(({ el, use }, id) => {
    const pts = el.geometry!.map((p) => [p.lon, p.lat] as [number, number]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    return { id, pts, nodes: el.nodes!, cum, len: cum[cum.length - 1], ...use, busy: use.foot ? busyness(pts, hotspots) : 0 };
  }).filter((r) => r.len > 4);
  roads.forEach((r, k) => (r.id = k));
  const junctions = new Map<number, { road: number; i: number }[]>();
  for (const r of roads) r.nodes.forEach((n, i) => { const l = junctions.get(n); if (l) l.push({ road: r.id, i }); else junctions.set(n, [{ road: r.id, i }]); });
  for (const [n, l] of junctions) if (l.length < 2) junctions.delete(n);
  return { centre, buildings, roads, trees: trees.slice(0, 700), hotspots, junctions };
}

const HIGHWAYS = [...Object.keys(CAR), ...FOOT_ONLY].join("|");

/** Everything for the city around a point (radius in metres). */
export async function fetchCity(lon: number, lat: number, radius = 650): Promise<CityData> {
  const a = `(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const els = await overpass(`[out:json][timeout:40];
(
  way${a}["building"];
  way${a}["highway"~"^(${HIGHWAYS})$"];
  way${a}["leisure"="park"];
  way${a}["landuse"~"^(grass|forest|recreation_ground)$"];
  node${a}["natural"="tree"];
  node${a}["shop"];
  node${a}["amenity"~"^(cafe|restaurant|bar|pub|fast_food|school|bank|pharmacy|marketplace|cinema|theatre|place_of_worship)$"];
  node${a}["public_transport"="station"];
  node${a}["railway"~"^(station|subway_entrance|tram_stop)$"];
);
out body geom 9000;`);
  return readCity(els as El[], [lon, lat]);
}

/** How many are out at this local hour, 0–1 (typical weekday curves; pure). */
export function busyAt(hour: number, who: Mover): number {
  const car: [number, number][] = [[0, 0.15], [5, 0.1], [7, 0.75], [8, 1], [10, 0.6], [13, 0.7], [17, 1], [18.5, 0.9], [20, 0.5], [22, 0.3], [24, 0.15]];
  const walk: [number, number][] = [[0, 0.06], [6, 0.1], [8, 0.6], [12, 1], [14, 0.85], [18, 1], [20, 0.7], [22, 0.3], [24, 0.06]];
  const c = who === "car" ? car : walk;
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < c.length; i++) if (h <= c[i][0]) { const [a, va] = c[i - 1], [b, vb] = c[i]; return va + ((vb - va) * (h - a)) / (b - a); }
  return c[0][1];
}

/** Local solar hour at a longitude. */
export const localHour = (lon: number, now = Date.now()) => ((now / 3_600_000 + lon / 15) % 24 + 24) % 24;
