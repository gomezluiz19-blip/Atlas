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

const base = new URL("./data/", document.baseURI).href;
const cache = new Map<string, Promise<unknown>>();
function load<T>(file: string): Promise<T> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(base + file).then((r) => {
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

export function plates(): Promise<Plates> {
  return load<Plates>("plates.json");
}

/** "NA-PA" → "North America and Pacific plates". */
export function boundaryName(code: string, names: Record<string, string>): string {
  const [a, b] = code.split(/[-\\/]/);
  const n = (c: string) => names[c] ?? c;
  return b ? `${n(a)} and ${n(b)} plates` : `${n(a)} plate`;
}
