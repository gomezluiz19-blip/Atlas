// Where people gather: the restaurants, cafés, shops, markets, parks and halls around a place, how busy
// each kind of place usually is at a given hour, and the centres of life they cluster into. Busyness is an
// estimate from typical daily patterns and each place's opening hours, not a live count. Pure: no DOM, no network.
import { openNow } from "../place/around";

type Spot = { lon: number; lat: number };

export type GatherKind = "food" | "cafe" | "drink" | "grocery" | "shop" | "market" | "park" | "culture" | "community";

export const KINDS: Record<GatherKind, { label: string; color: string; group: GatherGroup }> = {
  food: { label: "Restaurants", color: "#e0457b", group: "eat" },
  cafe: { label: "Cafés", color: "#c9783c", group: "eat" },
  drink: { label: "Bars", color: "#8f2ba6", group: "eat" },
  grocery: { label: "Groceries", color: "#2f8f5b", group: "shop" },
  shop: { label: "Shops", color: "#3563d6", group: "shop" },
  market: { label: "Markets", color: "#d19a2e", group: "shop" },
  park: { label: "Parks", color: "#5b9467", group: "outdoors" },
  culture: { label: "Culture", color: "#6a5acd", group: "together" },
  community: { label: "Community", color: "#2a9d8f", group: "together" },
};

export type GatherGroup = "eat" | "shop" | "outdoors" | "together";
export const GROUPS: { id: GatherGroup | "all"; label: string }[] = [
  { id: "all", label: "Everything" }, { id: "eat", label: "Eat & drink" }, { id: "shop", label: "Shops" },
  { id: "outdoors", label: "Parks" }, { id: "together", label: "Culture & community" },
];

const AMENITY: Record<string, GatherKind> = {
  restaurant: "food", fast_food: "food", food_court: "food", ice_cream: "cafe", cafe: "cafe", bar: "drink", pub: "drink", biergarten: "drink", nightclub: "drink",
  marketplace: "market", library: "community", community_centre: "community", social_centre: "community", townhall: "community", place_of_worship: "community",
  theatre: "culture", cinema: "culture", arts_centre: "culture",
};
const LEISURE: Record<string, GatherKind> = { park: "park", playground: "park", garden: "park", dog_park: "park", sports_centre: "park", pitch: "park", swimming_pool: "park", fitness_centre: "park" };

/** What kind of gathering place a map feature is, if it is one (pure). */
export function kindOf(t: Record<string, string>): GatherKind | null {
  if (t.amenity && AMENITY[t.amenity]) return AMENITY[t.amenity];
  if (t.tourism === "museum" || t.tourism === "gallery") return "culture";
  if (t.leisure && LEISURE[t.leisure]) return LEISURE[t.leisure];
  if (t.shop) return /^(supermarket|convenience|greengrocer|bakery|butcher|deli)$/.test(t.shop) ? "grocery" : t.shop === "mall" ? "market" : "shop";
  return null;
}

// ---- How busy, hour by hour --------------------------------------------------------------------------

// A typical day for each kind of place, 0–1 by hour (00:00 … 23:00): weekdays, then weekends.
const D = (s: string) => s.split(" ").map((x) => Number(x) / 10);
const CURVES: Record<GatherKind, [number[], number[]]> = {
  food: [D("1 0 0 0 0 0 0 1 2 2 2 5 9 8 4 3 3 5 9 10 8 5 3 2"), D("1 1 0 0 0 0 0 1 2 3 5 7 9 9 6 4 4 6 9 10 9 6 4 2")],
  cafe: [D("0 0 0 0 0 0 2 6 9 8 6 6 7 6 5 5 4 3 2 1 1 0 0 0"), D("0 0 0 0 0 0 1 3 6 9 10 9 8 7 6 5 4 3 2 1 1 0 0 0")],
  drink: [D("5 3 1 0 0 0 0 0 0 0 0 1 2 2 2 2 3 6 8 8 8 9 9 7"), D("8 6 3 1 0 0 0 0 0 0 1 2 3 3 3 4 5 6 8 9 10 10 10 9")],
  grocery: [D("0 0 0 0 0 0 1 3 4 4 4 5 6 5 4 5 7 9 8 6 4 2 1 0"), D("0 0 0 0 0 0 1 2 4 6 8 9 9 9 8 7 6 6 5 4 3 2 1 0")],
  shop: [D("0 0 0 0 0 0 0 1 2 3 4 5 6 6 5 5 5 6 5 4 2 1 0 0"), D("0 0 0 0 0 0 0 1 2 4 6 8 9 10 10 9 8 6 4 3 2 1 0 0")],
  market: [D("0 0 0 0 0 0 1 3 5 6 6 7 7 6 5 5 5 5 4 3 2 1 0 0"), D("0 0 0 0 0 0 1 3 6 8 10 10 9 8 7 6 5 4 3 2 1 0 0 0")],
  park: [D("0 0 0 0 0 0 2 3 3 2 2 3 4 4 4 5 7 8 7 5 3 1 0 0"), D("0 0 0 0 0 0 1 2 3 5 7 8 9 10 10 10 9 8 6 4 2 1 0 0")],
  culture: [D("0 0 0 0 0 0 0 0 0 1 2 3 3 3 3 3 3 4 6 8 8 6 3 1"), D("0 0 0 0 0 0 0 0 0 1 3 5 6 6 6 6 6 6 7 9 9 7 4 1")],
  community: [D("0 0 0 0 0 0 0 1 2 3 4 4 4 4 4 5 6 6 5 4 2 1 0 0"), D("0 0 0 0 0 0 0 1 3 6 7 7 6 5 4 4 3 3 2 2 1 0 0 0")],
};

/** How busy a kind of place usually is at a time, 0–1, interpolated between hours (pure). */
export function typicalBusy(kind: GatherKind, at: Date): number {
  const curve = CURVES[kind][at.getDay() === 0 || at.getDay() === 6 ? 1 : 0];
  const hr = at.getHours() + at.getMinutes() / 60, i = Math.floor(hr) % 24, f = hr - Math.floor(hr);
  return curve[i] * (1 - f) + curve[(i + 1) % 24] * f;
}

/** How busy one place likely is: its kind's pattern, and zero when its posted hours say it's shut (pure). */
export function busyAt(spot: { kind: GatherKind; hours?: string }, at: Date): number {
  const base = typicalBusy(spot.kind, at);
  if (!spot.hours) return base;
  const st = openNow(spot.hours, at);
  return st && !st.open ? 0 : base;
}

/** "Quiet" … "Very busy" (pure). */
export function busyWord(x: number): string {
  return x >= 0.8 ? "Very busy" : x >= 0.55 ? "Busy" : x >= 0.3 ? "Steady" : x > 0.05 ? "Quiet" : "Closed or empty";
}

/** The busiest hour of a typical day for a set of places, weekday or weekend (pure). */
export function peakHour(kinds: GatherKind[], weekend: boolean): number {
  let best = 0, at = 12;
  for (let hr = 6; hr < 24; hr++) {
    const sum = kinds.reduce((s, k) => s + CURVES[k][weekend ? 1 : 0][hr], 0);
    if (sum > best) { best = sum; at = hr; }
  }
  return at;
}

// ---- From the map ------------------------------------------------------------------------------------

/** The Overpass query for gathering places and the names of towns and neighbourhoods around a spot (pure). */
export function gatherQuery(c: Spot, radiusM: number): string {
  const a = `around:${Math.round(radiusM)},${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
  return `[out:json][timeout:25];(` +
    `nwr(${a})["amenity"~"^(${Object.keys(AMENITY).join("|")})$"];` +
    `nwr(${a})["shop"]["name"];` +
    `nwr(${a})["leisure"~"^(${Object.keys(LEISURE).join("|")})$"];` +
    `nwr(${a})["tourism"~"^(museum|gallery)$"];` +
    `node(around:${Math.round(radiusM * 2)},${c.lat.toFixed(5)},${c.lon.toFixed(5)})["place"~"^(city|town|village|suburb|quarter|neighbourhood|hamlet)$"]["name"];` +
    `);out center tags 2500;`;
}

export interface GatherSpot extends Spot { kind: GatherKind; name?: string; hours?: string; osm: string; key: string; value: string }
export interface PlaceName extends Spot { name: string; rank: number }

interface El { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const RANK: Record<string, number> = { city: 6, town: 5, suburb: 4, quarter: 3, village: 4, neighbourhood: 2, hamlet: 1 };

/** Gathering places and place names from an Overpass answer (pure). */
export function gatherFrom(els: El[]): { spots: GatherSpot[]; names: PlaceName[] } {
  const spots: GatherSpot[] = [], names: PlaceName[] = [];
  for (const e of els) {
    const t = e.tags ?? {}, p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!p) continue;
    if (t.place && t.name && RANK[t.place]) { names.push({ ...p, name: t.name, rank: RANK[t.place] }); continue; }
    const kind = kindOf(t);
    if (!kind) continue;
    const key = ["amenity", "shop", "leisure", "tourism"].find((k) => t[k])!;
    spots.push({ lon: p.lon, lat: p.lat, kind, name: t.name, hours: t.opening_hours, osm: `${e.type[0].toUpperCase()}${e.id}`, key, value: t[key] });
  }
  return { spots, names };
}

const kmBetween = (a: Spot, b: Spot) => {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
};

export interface Centre extends Spot { name: string; count: number; mix: [GatherKind, number][]; peak: { weekday: number; weekend: number } }

/**
 * The centres of life: the densest clusters of gathering places (about 400 m across), at least a
 * kilometre apart, each named after the nearest town or neighbourhood (pure).
 */
export function centres(spots: GatherSpot[], names: PlaceName[], max = 3, cellKm = 0.4): Centre[] {
  if (!spots.length) return [];
  const lat0 = spots[0].lat, dLat = cellKm / 111, dLon = cellKm / (111 * Math.cos((lat0 * Math.PI) / 180));
  const cells = new Map<string, GatherSpot[]>();
  for (const s of spots) {
    const k = `${Math.floor(s.lon / dLon)},${Math.floor(s.lat / dLat)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(s);
  }
  // Each cell's count with its neighbours, so a centre on a cell edge isn't split in two.
  const scored = [...cells.entries()].map(([k, own]) => {
    const [x, y] = k.split(",").map(Number);
    let all: GatherSpot[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) all = all.concat(cells.get(`${x + dx},${y + dy}`) ?? []);
    return { own, all };
  }).sort((a, b) => b.all.length - a.all.length);
  const out: Centre[] = [];
  for (const c of scored) {
    if (out.length >= max || c.all.length < 4) break;
    const at = { lon: c.all.reduce((s, x) => s + x.lon, 0) / c.all.length, lat: c.all.reduce((s, x) => s + x.lat, 0) / c.all.length };
    if (out.some((o) => kmBetween(o, at) < 1)) continue;
    const near = names.map((n) => ({ n, d: kmBetween(n, at) - n.rank * 0.15 })).sort((a, b) => a.d - b.d)[0]?.n;
    const tally = new Map<GatherKind, number>();
    for (const s of c.all) tally.set(s.kind, (tally.get(s.kind) ?? 0) + 1);
    const kinds = c.all.map((s) => s.kind);
    out.push({ ...at, name: near?.name ?? "Busy corner", count: c.all.length, mix: [...tally.entries()].sort((a, b) => b[1] - a[1]), peak: { weekday: peakHour(kinds, false), weekend: peakHour(kinds, true) } });
  }
  return out;
}

/**
 * A density grid of where people likely are at a time: each place adds a soft blob weighted by how busy
 * it is, over a box of `w`×`h` cells. Values are normalised to 0–1 (pure).
 */
export function heatGrid(spots: GatherSpot[], box: { west: number; south: number; east: number; north: number }, w: number, h: number, at: Date, radius = 9): Float32Array {
  const g = new Float32Array(w * h);
  const r2 = radius * radius;
  for (const s of spots) {
    const weight = 0.15 + busyAt(s, at);
    if (weight <= 0.15 && s.hours) continue;
    const cx = ((s.lon - box.west) / (box.east - box.west)) * w, cy = ((box.north - s.lat) / (box.north - box.south)) * h;
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 < r2) g[y * w + x] += weight * Math.exp(-d2 / (r2 / 3));
    }
  }
  let max = 0;
  for (const v of g) if (v > max) max = v;
  // A soft ceiling so one dense block doesn't wash out the rest.
  const top = max * 0.7 || 1;
  for (let i = 0; i < g.length; i++) g[i] = Math.min(1, g[i] / top);
  return g;
}

/** The colours of the heat: clear, then indigo, violet, rose, orange, gold (pure). */
export const HEAT_STOPS: [number, [number, number, number, number]][] = [
  [0, [40, 20, 110, 0]], [0.12, [59, 28, 140, 90]], [0.35, [143, 43, 166, 160]], [0.6, [224, 69, 123, 200]], [0.82, [255, 154, 60, 225]], [1, [255, 230, 109, 240]],
];

/** One heat value as RGBA (pure). */
export function heatColor(v: number): [number, number, number, number] {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [b, cb] = HEAT_STOPS[i], [a, ca] = HEAT_STOPS[i - 1];
    if (v <= b) { const f = (v - a) / (b - a); return [0, 1, 2, 3].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * f)) as [number, number, number, number]; }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}
