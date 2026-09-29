// Everything Atlas can measure at one place, read with the same layer readers
// as Ask the map (so a place page and an answer always agree), with the
// ground read exactly at the spot rather than averaged over a cell.
import type { Criterion, Needs } from "../answers/criteria";
import { MEASURES } from "../answers/criteria";
import { floodProxy, kmBetween, makeGrid } from "../answers/engine";
import { gather } from "../answers/layers";
import { elevation } from "../data/elevation";

export interface Measured {
  v: Record<string, number>;
  /** Layers that couldn't be read just now. */
  missing: Needs[];
  sea: boolean;
}

const ALL: Needs[] = ["terrain", "climate", "places", "infra", "water", "hazards", "country"];
const cache = new Map<string, Promise<Measured>>();

/** Layers read so far for a place being measured, and who's watching. */
const progress = new Map<string, { done: Map<Needs, boolean>; fns: Set<(n: Needs, ok: boolean) => void> }>();

/** Everything measured at a place; `onStep` hears each layer as it's read (replayed if already read). */
export function measureAt(lon: number, lat: number, onStep?: (n: Needs, ok: boolean) => void): Promise<Measured> {
  const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  let prog = progress.get(key);
  if (!prog) { prog = { done: new Map(), fns: new Set() }; progress.set(key, prog); if (progress.size > 40) progress.delete(progress.keys().next().value!); }
  if (onStep) { prog.fns.add(onStep); for (const [n, ok] of prog.done) onStep(n, ok); }
  let p = cache.get(key);
  if (!p) {
    const pr = prog;
    p = read(lon, lat, (n, ok) => { pr.done.set(n, ok); pr.fns.forEach((f) => f(n, ok)); });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return p;
}

async function read(lon: number, lat: number, onStep: (n: Needs, ok: boolean) => void): Promise<Measured> {
  // About 90 km across: wide enough to find the coast, fine enough for the ground.
  const dLat = 0.4, dLon = 0.4 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const area = makeGrid({ w: lon - dLon, e: lon + dLon, s: lat - dLat, n: lat + dLat }, 8);
  const [, exact] = await Promise.all([gather(area, new Set(ALL), onStep), groundAt(lon, lat).catch(() => null)]);
  const cell = [...area.cells].sort((a, b) => kmBetween(lon, lat, a.lon, a.lat) - kmBetween(lon, lat, b.lon, b.lat))[0];
  const v = { ...cell.v };
  if (exact) {
    v.elev = Math.max(0, exact.elev);
    v.slope = exact.slope;
    v.aspect = exact.aspect;
  }
  v.flood = floodProxy(v);
  return { v, missing: area.missing, sea: exact ? exact.elev <= 0 && cell.sea : cell.sea };
}

/** Height, slope and facing at a spot (about 30 m detail). */
async function groundAt(lon: number, lat: number) {
  const z = 13, m = ((156_543 * Math.cos((lat * Math.PI) / 180)) / 2 ** z) * 1.5;
  const dLat = m / 111_000, dLon = m / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const [z0, zN, zS, zE, zW] = await elevation.sample([[lon, lat], [lon, lat + dLat], [lon, lat - dLat], [lon + dLon, lat], [lon - dLon, lat]], z);
  const dx = (zE - zW) / (2 * m), dy = (zN - zS) / (2 * m);
  const slope = Math.atan(Math.hypot(dx, dy)) * (180 / Math.PI);
  return { elev: z0, slope, aspect: Math.hypot(dx, dy) < 0.01 ? NaN : ((Math.atan2(-dx, -dy) * 180) / Math.PI + 360) % 360 };
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Conditions that describe a place, for "places like this": similar height,
 * ground, climate and closeness to the sea and to people. Only what's known
 * here is used; each is a band around this place's own value.
 */
export function likeThis(v: Record<string, number>): Criterion[] {
  const out: Criterion[] = [];
  const ok = (k: string) => Number.isFinite(v[k]);
  const band = (key: string, lo: number, hi: number) => {
    const m = MEASURES[key];
    const clamp = (x: number) => Math.max(m.min, Math.min(m.max, round(x, m.step)));
    if (lo > m.min) out.push({ key, op: "gt", value: clamp(lo) });
    if (hi < m.max) out.push({ key, op: "lt", value: clamp(hi) });
  };
  if (ok("elev")) { const e = v.elev, w = Math.max(200, e * 0.35); band("elev", e - w, e + w); }
  // Ground only when it defines the place: flat plains or real mountainsides (a spot's slope is finer than a region's).
  if (ok("slope") && v.slope < 3) out.push({ key: "slope", op: "lt", value: 4 });
  else if (ok("slope") && v.slope > 15) out.push({ key: "slope", op: "gt", value: 8 });
  if (ok("temp")) band("temp", v.temp - 2.5, v.temp + 2.5);
  if (ok("rain")) band("rain", v.rain * 0.7, v.rain * 1.4);
  if (ok("coast")) out.push(v.coast < 15 ? { key: "coast", op: "lt", value: 20 } : v.coast > 60 ? { key: "coast", op: "gt", value: 40 } : { key: "coast", op: "lt", value: round(v.coast * 2, 5) });
  // A city is like other places with a city close by; the countryside like other quiet places.
  if (ok("crowd")) out.push(v.crowd >= 150_000 ? { key: "city", op: "lt", value: 30 } : { key: "crowd", op: "lt", value: 100_000 });
  return out;
}
