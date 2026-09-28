// Bundled world-scale data (built by scripts/build-geodata.mjs).
import type { PlaceKind } from "../analysis/placeKinds";

export interface WorldLabel {
  name: string;
  lon: number;
  lat: number;
  kind: PlaceKind;
  /** Web-map zoom level at which the label should appear. */
  minZoom: number;
  rank: number;
  detail: string;
}

export interface RiverLine {
  name: string;
  minZoom: number;
  rank: number;
  /** Flat [lon, lat, lon, lat, …]. */
  pts: number[];
}

export interface Plates {
  plates: Record<string, string>;
  boundaries: [string, string, number[][]][];
}

const base = () => new URL("./data/", document.baseURI).href;
const cache = new Map<string, Promise<unknown>>();
function load<T>(file: string): Promise<T> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(base() + file).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${file}`);
      return r.json();
    });
    cache.set(file, p);
  }
  return p as Promise<T>;
}

export async function worldLabels(): Promise<WorldLabel[]> {
  const rows = await load<[string, number, number, PlaceKind, number, number, string][]>("world-labels.json");
  return rows.map(([name, lon, lat, kind, minZoom, rank, detail]) => ({ name, lon, lat, kind, minZoom, rank, detail }));
}

export async function riverLines(): Promise<RiverLine[]> {
  const rows = await load<[string, number, number, number[]][]>("rivers.json");
  return rows.map(([name, minZoom, rank, pts]) => ({ name, minZoom, rank, pts }));
}

/** Towns, lakes, reservoirs and parks for closer zooms (about 7,800 more names). */
export async function detailLabels(): Promise<WorldLabel[]> {
  const rows = await load<[string, number, number, PlaceKind, number, number, string][]>("detail-labels.json");
  return rows.map(([name, lon, lat, kind, minZoom, rank, detail]) => ({ name, lon, lat, kind, minZoom, rank, detail }));
}

const RIVER_CELL = 15;
let riverIndex: Promise<Set<string>> | null = null;
const riverCells = new Map<string, Promise<RiverLine[]>>();
/** Detailed river lines (Natural Earth 10 m with the Europe and North America supplements) in a box. */
export async function riversIn(w: number, s: number, e: number, n: number, maxCells = 12): Promise<RiverLine[]> {
  riverIndex ??= load<string[]>("rivers/index.json").then((k) => new Set(k)).catch(() => new Set<string>());
  const have = await riverIndex;
  const keys: string[] = [];
  const c0 = Math.max(0, Math.floor((w + 180) / RIVER_CELL)), c1 = Math.min(23, Math.floor((e + 180) / RIVER_CELL));
  const r0 = Math.max(0, Math.floor((s + 90) / RIVER_CELL)), r1 = Math.min(11, Math.floor((n + 90) / RIVER_CELL));
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (have.has(`${c}_${r}`)) keys.push(`${c}_${r}`);
  if (keys.length > maxCells) return [];
  const parts = await Promise.all(keys.map((k) => {
    let p = riverCells.get(k);
    if (!p) {
      p = load<[string, number, number, number[]][]>(`rivers/${k}.json`).then((rows) => rows.map(([name, minZoom, rank, pts]) => ({ name, minZoom, rank, pts })));
      p.catch(() => riverCells.delete(k));
      riverCells.set(k, p);
    }
    return p.catch(() => [] as RiverLine[]);
  }));
  // A line crossing cells is stored in each; keep one copy.
  const seen = new Set<string>();
  return parts.flat().filter((l) => { const k = `${l.name}|${l.pts[0]}|${l.pts[1]}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function plates(): Promise<Plates> {
  return load<Plates>("plates.json");
}

/** "NA-PA" → "North America and Pacific plates". */
export function boundaryName(code: string, names: Record<string, string>): string {
  const [a, b] = code.split(/[-\\/]/);
  const n = (c: string) => names[c] ?? c;
  return b ? `${n(a)} and ${n(b)} plates` : `${n(a)} plate`;
}
