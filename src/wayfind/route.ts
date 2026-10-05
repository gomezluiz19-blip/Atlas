// Turn-by-turn for the guide: a route from Valhalla (the open router over OpenStreetMap that Reach already
// uses), its shape, and the next thing to do from where you are. Pure apart from `fetchRoute`.
import { getJson } from "../data/http";
import { VALHALLA } from "../travel/reach";
import { km, type LL, type Pace } from "./model";

export interface Step { text: string; km: number; at: number /* index into shape where it begins */ }
export interface Route { shape: LL[]; km: number; minutes: number; steps: Step[] }

/** Valhalla's costing for a pace. */
export const costingFor = (p: Pace) => (p === "walk" || p === "run" || p === "still" ? "pedestrian" : p === "cycle" ? "bicycle" : "auto");

/** The route request URL (pure). */
export function routeUrl(from: LL, to: LL, costing: string, base = VALHALLA): string {
  const json = { locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }], costing, units: "kilometers", directions_options: { units: "kilometers" } };
  return `${base}/route?json=${encodeURIComponent(JSON.stringify(json))}`;
}

/** Decodes an encoded polyline at 6 digits (Valhalla's precision) (pure). */
export function decode6(s: string): LL[] {
  const out: LL[] = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => { let r = 0, shift = 0, b: number; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length) { lat += next(); lon += next(); out.push({ lat: lat / 1e6, lon: lon / 1e6 }); }
  return out;
}

interface VResp { trip?: { summary?: { length: number; time: number }; legs?: { shape: string; maneuvers?: { instruction: string; length: number; begin_shape_index: number }[] }[] } }
/** A route from a Valhalla response (pure). */
export function parseRoute(r: VResp): Route | null {
  const leg = r.trip?.legs?.[0];
  if (!leg?.shape) return null;
  return {
    shape: decode6(leg.shape), km: r.trip?.summary?.length ?? 0, minutes: (r.trip?.summary?.time ?? 0) / 60,
    steps: (leg.maneuvers ?? []).map((m) => ({ text: m.instruction, km: m.length, at: m.begin_shape_index })),
  };
}

export async function fetchRoute(from: LL, to: LL, pace: Pace): Promise<Route | null> {
  try { return parseRoute(await getJson<VResp>("Routing", routeUrl(from, to, costingFor(pace)), undefined, 15_000)); } catch { return null; }
}

/** Where you are along a route: the nearest shape point, how far off it you are, and what's next (pure). */
export function progress(route: Route, at: LL): { index: number; offKm: number; next: Step | null; toNextKm: number; leftKm: number } {
  let index = 0, offKm = Infinity;
  for (let i = 0; i < route.shape.length; i++) { const d = km(at, route.shape[i]); if (d < offKm) { offKm = d; index = i; } }
  const next = route.steps.find((s) => s.at > index) ?? null;
  let toNextKm = 0, leftKm = 0;
  for (let i = index; i < route.shape.length - 1; i++) {
    const d = km(route.shape[i], route.shape[i + 1]);
    leftKm += d;
    if (next && i < next.at) toNextKm += d;
  }
  return { index, offKm, next, toNextKm, leftKm };
}
