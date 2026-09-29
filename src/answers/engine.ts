// Answers across layers, the engine: lays a grid over what's on screen, reads
// every layer a question needs at each cell (terrain, climate, towns, roads,
// rivers, faults, country figures), scores each cell against the conditions,
// and picks the best places, spread apart so they aren't all one hillside.
import { MEASURES, combine, satisfy, type Criterion, type Needs } from "./criteria";

export interface Bbox { w: number; s: number; e: number; n: number }

export interface Cell {
  lon: number;
  lat: number;
  /** Not land (sea, or a big lake below sea level): never an answer. */
  sea: boolean;
  /** Each measure's value here (NaN: unknown). */
  v: Record<string, number>;
  /** Overall match, 0 to 1 (−1 for sea). */
  score: number;
  /** Match per condition, in the order asked. */
  parts: number[];
  /** How comfortably it clears the limits (breaks ties between full matches). */
  comfort: number;
}

export interface Area {
  box: Bbox;
  nx: number;
  ny: number;
  /** Row-major from the north-west corner. */
  cells: Cell[];
  /** Layers read, and any that couldn't be (the question still answers without them). */
  read: Set<Needs>;
  missing: Needs[];
  /** Roughly how wide a cell is. */
  cellKm: number;
}

const rad = Math.PI / 180;
export const kmBetween = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** A grid over the box, about `target` cells across its longer side, square-ish on the ground. */
export function makeGrid(box: Bbox, target = 28): Area {
  const midLat = (box.s + box.n) / 2;
  const wKm = (box.e - box.w) * 111 * Math.max(0.1, Math.cos(midLat * rad)), hKm = (box.n - box.s) * 111;
  const nx = Math.max(6, Math.round(wKm >= hKm ? target : (target * wKm) / hKm));
  const ny = Math.max(6, Math.round(hKm >= wKm ? target : (target * hKm) / wKm));
  const cells: Cell[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    cells.push({ lon: box.w + ((i + 0.5) / nx) * (box.e - box.w), lat: box.n - ((j + 0.5) / ny) * (box.n - box.s), sea: false, v: {}, score: 0, parts: [], comfort: 0 });
  return { box, nx, ny, cells, read: new Set(), missing: [], cellKm: Math.max(wKm / nx, hKm / ny) };
}

/** Scores every land cell against the conditions. */
export function scoreArea(area: Area, criteria: Criterion[]) {
  for (const c of area.cells) {
    if (c.sea) { c.score = -1; c.parts = []; continue; }
    c.parts = criteria.map((k) => satisfy(k, c.v[k.key] ?? NaN));
    c.score = criteria.length ? combine(c.parts) : 0;
    c.comfort = criteria.reduce((sum, k) => sum + margin(k, c.v[k.key] ?? NaN), 0);
  }
}

/** How far inside a limit a value sits, in units of the limit's soft edge (capped). */
function margin(k: Criterion, v: number): number {
  if (!Number.isFinite(v)) return 0;
  const soft = MEASURES[k.key].soft;
  if (k.op === "dir") return Math.max(-2, Math.min(2, (45 - Math.abs((((v - k.value) % 360) + 540) % 360 - 180)) / soft));
  return Math.max(-2, Math.min(2, (k.op === "lt" ? k.value - v : v - k.value) / soft));
}

/** The best cells, at least `apartKm` from each other, good enough to mention. */
export function pickBest(area: Area, n = 5, apartKm = Math.max(area.cellKm * 3, 2), floor = 0.3): Cell[] {
  const out: Cell[] = [];
  for (const c of [...area.cells].filter((x) => x.score >= floor).sort((a, b) => b.score - a.score || b.comfort - a.comfort)) {
    if (out.some((o) => kmBetween(o.lon, o.lat, c.lon, c.lat) < apartKm)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** Bilinear interpolation over a coarse grid of values (row-major from the north-west). */
export function bilinear(values: number[], gx: number, gy: number, box: Bbox, lon: number, lat: number): number {
  const fx = Math.max(0, Math.min(gx - 1, ((lon - box.w) / (box.e - box.w)) * gx - 0.5));
  const fy = Math.max(0, Math.min(gy - 1, ((box.n - lat) / (box.n - box.s)) * gy - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gx - 1, x0 + 1), y1 = Math.min(gy - 1, y0 + 1);
  const u = fx - x0, t = fy - y0;
  const at = (x: number, y: number) => values[y * gx + x];
  const corners: [number, number][] = [[at(x0, y0), (1 - u) * (1 - t)], [at(x1, y0), u * (1 - t)], [at(x0, y1), (1 - u) * t], [at(x1, y1), u * t]];
  // A missing corner shouldn't blank its neighbours: weight what's there.
  let sum = 0, wsum = 0;
  for (const [v, w] of corners) if (Number.isFinite(v)) { sum += v * w; wsum += w; }
  return wsum > 1e-9 ? sum / wsum : NaN;
}

/** Distance from each land cell to the nearest sea cell (grid-based; a lower bound past the edge). */
export function coastDistances(area: Area, seaPoints: [number, number][], edgeKm: number) {
  for (const c of area.cells) {
    if (c.sea) { c.v.coast = 0; continue; }
    let best = edgeKm;
    for (const [x, y] of seaPoints) {
      if (Math.abs(y - c.lat) * 111 > best) continue;
      const d = kmBetween(c.lon, c.lat, x, y);
      if (d < best) best = d;
    }
    c.v.coast = best;
  }
}

/** Distance (km) from a point to the nearest of some polylines (flat [lon, lat, …]). */
export function nearestPolyline(lines: ArrayLike<number>[], lon: number, lat: number, maxKm: number): number {
  const kx = 111 * Math.cos(lat * rad), ky = 111;
  let best = maxKm;
  for (const xy of lines) {
    for (let i = 0; i + 3 < xy.length; i += 2) {
      const ax = (xy[i] - lon) * kx, ay = (xy[i + 1] - lat) * ky;
      const bx = (xy[i + 2] - lon) * kx, by = (xy[i + 3] - lat) * ky;
      if (Math.min(Math.abs(ax), Math.abs(bx)) > best && Math.sign(ax) === Math.sign(bx)) continue;
      if (Math.min(Math.abs(ay), Math.abs(by)) > best && Math.sign(ay) === Math.sign(by)) continue;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/**
 * A rough flood proxy, 0 to 1: flat ground near a river, or low ground near the
 * sea. Not a flood map; it says where one is worth checking.
 */
export function floodProxy(v: { river?: number; coast?: number; slope?: number; elev?: number }): number {
  const flat = 1 - smooth((v.slope ?? 5) / 4);
  const byRiver = Number.isFinite(v.river) ? (1 - smooth((v.river as number) / 3)) * flat : 0;
  const bySea = Number.isFinite(v.coast) ? (1 - smooth((v.coast as number) / 6)) * (1 - smooth((v.elev ?? 50) / 12)) : 0;
  return Math.max(byRiver, bySea);
}

/** Which layer groups a set of conditions needs (terrain always: it tells land from sea). */
export function needsOf(criteria: Criterion[]): Set<Needs> {
  const s = new Set<Needs>(["terrain"]);
  for (const c of criteria) {
    const m = MEASURES[c.key];
    s.add(m.needs);
    if (c.key === "flood") s.add("terrain");
  }
  return s;
}
