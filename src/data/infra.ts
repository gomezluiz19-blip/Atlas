// World infrastructure bundled in public/data (built by scripts/build-infra.mjs):
// railways, roads, shipping lanes, ports, airports and power plants. Undersea
// cables load live from TeleGeography's Submarine Cable Map.
import { getJson } from "./http";

export interface NetLine {
  /** Leading attributes, as stored (e.g. [scalerank, electric]). */
  attrs: (string | number)[];
  /** Flat [lon, lat, lon, lat, …]. */
  xy: Float32Array;
  bbox: [number, number, number, number];
}

export interface Port { name: string; lon: number; lat: number; rank: number }
export interface Airport { name: string; iata: string; lon: number; lat: number; type: string; rank: number }
export interface PowerPlant { name: string; lon: number; lat: number; fuel: string; mw: number; country: string; year: number }
export interface Cable { id: string; name: string; color: string; lines: NetLine[] }
export interface LandingPoint { id: string; name: string; lon: number; lat: number }

/** Decodes [attrs…, x0, y0, dx, dy, …] (thousandths of a degree) into a line. */
export function decodeLine(row: (string | number)[], nAttrs: number): NetLine {
  const n = (row.length - nAttrs) / 2;
  const xy = new Float32Array(n * 2);
  let x = 0, y = 0, w = 180, s = 90, e = -180, no = -90;
  for (let i = 0; i < n; i++) {
    x += row[nAttrs + i * 2] as number;
    y += row[nAttrs + i * 2 + 1] as number;
    const lon = x / 1000, lat = y / 1000;
    xy[i * 2] = lon;
    xy[i * 2 + 1] = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > no) no = lat;
  }
  return { attrs: row.slice(0, nAttrs), xy, bbox: [w, s, e, no] };
}

const base = () => new URL("./data/", document.baseURI).href;
const cache = new Map<string, Promise<unknown>>();
function load<R, T>(file: string, parse: (raw: R) => T): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetch(base() + file)
      .then((r) => {
        if (!r.ok) throw new Error(`couldn't load ${file}`);
        return r.json();
      })
      .then((raw: R) => parse(raw));
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

export const railways = () => load("rail.json", (rows: (string | number)[][]) => rows.map((r) => decodeLine(r, 2)));
export const roads = () => load("roads.json", (rows: (string | number)[][]) => rows.map((r) => decodeLine(r, 2)));
export const shippingLanes = () => load("shipping.json", (rows: (string | number)[][]) => rows.map((r) => decodeLine(r, 1)));
export const ports = () => load("ports.json", (rows: [string, number, number, number][]) => rows.map(([name, lon, lat, rank]) => ({ name, lon, lat, rank }) as Port));
export const airports = () =>
  load("airports.json", (rows: [string, string, number, number, string, number][]) =>
    rows.map(([name, iata, lon, lat, type, rank]) => ({ name, iata, lon, lat, type, rank }) as Airport));
const power = () =>
  load("power.json", (raw: { countries: Record<string, string>; plants: [string, number, number, string, number, string, number][] }) => ({
    countries: raw.countries,
    plants: raw.plants.map(([name, lon, lat, fuel, mw, country, year]) => ({ name, lon, lat, fuel, mw, country, year }) as PowerPlant),
  }));
/** Power plants, largest first. */
export const powerPlants = () => power().then((p) => p.plants);
/** Country names by ISO3 code, as used by the power plant data. */
export const powerCountries = () => power().then((p) => p.countries);

const CABLE_API = "https://www.submarinecablemap.com/api/v3";

interface GeoFeature { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

export async function cables(): Promise<Cable[]> {
  const fc = await getJson<{ features: GeoFeature[] }>("Submarine Cable Map", `${CABLE_API}/cable/cable-geo.json`);
  const byId = new Map<string, Cable>();
  for (const f of fc.features) {
    const p = f.properties;
    const id = String(p.id ?? p.feature_id ?? p.name);
    const lines = (f.geometry.type === "LineString" ? [f.geometry.coordinates] : (f.geometry.coordinates as number[][][])) as number[][][];
    const cable = byId.get(id) ?? { id, name: String(p.name ?? "Cable"), color: String(p.color ?? "#4c9ac9"), lines: [] };
    for (const l of lines) {
      const xy = new Float32Array(l.flat());
      let w = 180, s = 90, e = -180, n = -90;
      for (const [x, y] of l) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      cable.lines.push({ attrs: [], xy, bbox: [w, s, e, n] });
    }
    byId.set(id, cable);
  }
  return [...byId.values()];
}

export async function landingPoints(): Promise<LandingPoint[]> {
  const fc = await getJson<{ features: GeoFeature[] }>("Submarine Cable Map", `${CABLE_API}/landing-point/landing-point-geo.json`);
  return fc.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    return { id: String(f.properties.id), name: String(f.properties.name), lon, lat };
  });
}

export interface CableDetail { name: string; length?: string; rfs?: string; owners?: string; landing_points?: { id: string; name: string; country?: string }[]; url?: string }
export const cableDetail = (id: string) => getJson<CableDetail>("Submarine Cable Map", `${CABLE_API}/cable/${encodeURIComponent(id)}.json`);
export interface LandingDetail { name: string; cables?: { id: string; name: string }[] }
export const landingDetail = (id: string) => getJson<LandingDetail>("Submarine Cable Map", `${CABLE_API}/landing-point/${encodeURIComponent(id)}.json`);

// ---- Geometry helpers ------------------------------------------------------

const R = 6371;
const rad = Math.PI / 180;

/** Great-circle distance in km. */
export function km(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Items sorted by distance from a point, within `maxKm`. */
export function nearby<T extends { lon: number; lat: number }>(items: T[], lon: number, lat: number, maxKm: number, limit = Infinity): (T & { km: number })[] {
  const dLat = maxKm / 111, dLon = maxKm / (111 * Math.max(0.05, Math.cos(lat * rad)));
  const out: (T & { km: number })[] = [];
  for (const it of items) {
    if (Math.abs(it.lat - lat) > dLat) continue;
    let dl = Math.abs(it.lon - lon);
    if (dl > 180) dl = 360 - dl;
    if (dl > dLon) continue;
    const d = km(lon, lat, it.lon, it.lat);
    if (d <= maxKm) out.push({ ...it, km: d });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}

/** Distance (km) from a point to the nearest line, searching within `maxKm`. */
export function nearestLine(lines: NetLine[], lon: number, lat: number, maxKm: number, filter?: (l: NetLine) => boolean): { km: number; line: NetLine; lon: number; lat: number } | null {
  const pad = maxKm / 111, padLon = pad / Math.max(0.05, Math.cos(lat * rad));
  const kx = 111 * Math.cos(lat * rad), ky = 111;
  let best: { km: number; line: NetLine; lon: number; lat: number } | null = null;
  for (const l of lines) {
    const [w, s, e, n] = l.bbox;
    if (lon < w - padLon || lon > e + padLon || lat < s - pad || lat > n + pad) continue;
    if (filter && !filter(l)) continue;
    const xy = l.xy;
    for (let i = 0; i + 3 < xy.length; i += 2) {
      // Local flat projection is accurate enough at these distances.
      const ax = (xy[i] - lon) * kx, ay = (xy[i + 1] - lat) * ky;
      const bx = (xy[i + 2] - lon) * kx, by = (xy[i + 3] - lat) * ky;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
      if (d <= maxKm && (!best || d < best.km)) best = { km: d, line: l, lon: lon + px / kx, lat: lat + py / ky };
    }
  }
  return best;
}

// ---- Power -----------------------------------------------------------------

export const FUELS: { id: string; label: string; color: string; low: boolean }[] = [
  { id: "Coal", label: "Coal", color: "#8c8f87", low: false },
  { id: "Gas", label: "Gas", color: "#d19a2e", low: false },
  { id: "Oil", label: "Oil", color: "#9a7552", low: false },
  { id: "Nuclear", label: "Nuclear", color: "#8b5fa8", low: true },
  { id: "Hydro", label: "Hydro", color: "#3563d6", low: true },
  { id: "Wind", label: "Wind", color: "#4c9ac9", low: true },
  { id: "Solar", label: "Solar", color: "#e1b843", low: true },
  { id: "Geothermal", label: "Geothermal", color: "#b8496a", low: true },
  { id: "Biomass", label: "Biomass & waste", color: "#5b9467", low: true },
  { id: "Other", label: "Other", color: "#d1d1d6", low: false },
];
const FUEL_ALIAS: Record<string, string> = { Waste: "Biomass", Petcoke: "Oil", Cogeneration: "Other", Storage: "Other", "Wave and Tidal": "Other" };
export const fuelOf = (f: string) => FUELS.find((x) => x.id === (FUEL_ALIAS[f] ?? f)) ?? FUELS[FUELS.length - 1];

/** Installed capacity by fuel (MW) over a set of plants, largest first. */
export function fuelMix(plants: PowerPlant[]): { fuel: (typeof FUELS)[number]; mw: number }[] {
  const m = new Map<string, number>();
  for (const p of plants) {
    const f = fuelOf(p.fuel).id;
    m.set(f, (m.get(f) ?? 0) + p.mw);
  }
  return [...m.entries()].map(([id, mw]) => ({ fuel: FUELS.find((f) => f.id === id)!, mw })).sort((a, b) => b.mw - a.mw);
}

export function formatMw(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(mw >= 10000 ? 0 : 1)} GW` : `${Math.round(mw)} MW`;
}
