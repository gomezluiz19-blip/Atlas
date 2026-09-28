// Countries: borders from Natural Earth (via world-atlas, bundled), facts from
// REST Countries, and development indicators from the World Bank.
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { getJson, mapLimit } from "./http";

export interface CountryShape {
  /** ISO 3166-1 numeric code, e.g. "840". */
  id: string;
  name: string;
  /** Outer and inner rings as [lon, lat] arrays, grouped by polygon. */
  polygons: [number, number][][][];
  bbox: [number, number, number, number];
}

let shapes: Promise<CountryShape[]> | null = null;

/** Country borders (Natural Earth 1:50m), loaded on first use. */
export function countryShapes(): Promise<CountryShape[]> {
  shapes ??= (async () => {
    const [{ feature }, topo] = await Promise.all([import("topojson-client"), import("world-atlas/countries-50m.json")]);
    const t = (topo as { default?: unknown }).default ?? topo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(t as any, (t as any).objects.countries) as unknown as { features: Feature<Polygon | MultiPolygon, { name: string }>[] };
    return fc.features
      .filter((f) => f.geometry)
      .map((f) => {
        const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as [number, number][][][];
        let w = 180, s = 90, e = -180, n = -90;
        for (const poly of polys) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
        return { id: String(f.id ?? ""), name: f.properties?.name ?? "", polygons: polys, bbox: [w, s, e, n] as [number, number, number, number] };
      });
  })();
  return shapes;
}

function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function containsPoint(c: Pick<CountryShape, "polygons" | "bbox">, lon: number, lat: number): boolean {
  const [w, s, e, n] = c.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return false;
  return c.polygons.some((poly) => inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole)));
}

export async function countryAt(lon: number, lat: number): Promise<CountryShape | null> {
  return (await countryShapes()).find((c) => containsPoint(c, lon, lat)) ?? null;
}

export interface CountryFacts {
  name: { common: string; official: string };
  cca2: string;
  cca3: string;
  capital?: string[];
  region?: string;
  subregion?: string;
  population?: number;
  area?: number;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol?: string }>;
  flags?: { svg?: string; png?: string; alt?: string };
  borders?: string[];
  landlocked?: boolean;
  timezones?: string[];
  car?: { side?: string };
  independent?: boolean;
  unMember?: boolean;
  demonyms?: { eng?: { m?: string } };
  latlng?: [number, number];
  capitalInfo?: { latlng?: [number, number] };
}

export async function countryFacts(isoNumeric: string): Promise<CountryFacts> {
  const rows = await getJson<CountryFacts[] | CountryFacts>("REST Countries", `https://restcountries.com/v3.1/alpha/${isoNumeric.padStart(3, "0")}`);
  return Array.isArray(rows) ? rows[0] : rows;
}

/** World Bank indicators shown in the Countries theme. */
export const INDICATORS = {
  population: "SP.POP.TOTL",
  gdp: "NY.GDP.MKTP.CD",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  lifeExpectancy: "SP.DYN.LE00.IN",
  urban: "SP.URB.TOTL.IN.ZS",
  electricity: "EG.ELC.ACCS.ZS",
  forest: "AG.LND.FRST.ZS",
  renewables: "EG.FEC.RNEW.ZS",
  co2PerCapita: "EN.GHG.CO2.PC.CE.AR5",
  protectedLand: "ER.LND.PTLD.ZS",
  gini: "SI.POV.GINI",
  fertility: "SP.DYN.TFRT.IN",
} as const;
export type IndicatorKey = keyof typeof INDICATORS;

export interface Series {
  points: { year: number; value: number }[];
  latest: { year: number; value: number } | null;
}

export async function indicator(cca3: string, code: string): Promise<Series> {
  const body = await getJson<[unknown, { date: string; value: number | null }[] | null]>(
    "World Bank",
    `https://api.worldbank.org/v2/country/${cca3}/indicator/${code}?format=json&per_page=100&date=1960:2030`,
  );
  const rows = (Array.isArray(body) ? body[1] : null) ?? [];
  const points = rows
    .filter((r) => r.value !== null)
    .map((r) => ({ year: Number(r.date), value: r.value as number }))
    .sort((a, b) => a.year - b.year);
  return { points, latest: points[points.length - 1] ?? null };
}

export async function indicators<K extends IndicatorKey>(cca3: string, keys: K[]): Promise<Record<K, Series>> {
  const results = await mapLimit(keys, 4, (k) => indicator(cca3, INDICATORS[k]).catch(() => ({ points: [], latest: null })));
  return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as Record<K, Series>;
}

/**
 * Prepares a ring for drawing: drops points near the poles (where the
 * Antarctic outline runs along the map edge and breaks line geometry),
 * removes repeated points, and keeps at most `max` vertices.
 */
export function cleanRing(ring: [number, number][], max = Infinity): [number, number][] {
  const step = ring.length > max ? Math.ceil(ring.length / max) : 1;
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) {
    const [lon, lat] = ring[i];
    if (Math.abs(lat) > 85) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - lon) < 1e-6 && Math.abs(prev[1] - lat) < 1e-6) continue;
    out.push([lon, lat]);
  }
  // A closing point equal to the first would make a zero-length segment when looped.
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  return out.length >= 3 ? out : [];
}
