// Works out what was tapped: from the label or map feature when there is one,
// and from the shape of the ground (a summit, a bowl, the seafloor, a flat lake).
import { elevation } from "../data/elevation";
import type { Place } from "../app";
import type { Subject, SubjectKind } from "./types";

const HINTS: [RegExp, SubjectKind][] = [
  [/volcano|caldera|stratovolcano/, "volcano"],
  [/crater|impact/, "crater"],
  [/glacier|ice ?field|ice cap/, "glacier"],
  [/canyon|gorge/, "canyon"],
  [/\b(range|mountains|massif|highlands|sierra|cordillera|alps|andes|himalaya)\b/, "range"],
  [/\b(peak|mount|mountain|summit|hill|mt\.?)\b/, "peak"],
  [/\b(sea|ocean|gulf|bay|strait|channel|sound)\b/, "sea"],
  [/\b(river|creek|stream|brook|rio|río|fleuve)\b/, "river"],
  [/\b(lake|lago|loch|reservoir|pond|lagoon)\b/, "lake"],
  [/\b(forest|wood|woods|rainforest|taiga|jungle)\b/, "forest"],
  [/\b(desert|dunes|erg)\b/, "desert"],
  [/\b(island|isle|atoll)\b/, "island"],
  [/\b(city|capital|town|district|borough|metropolis)\b/, "city"],
  [/\b(coast|beach|cape|peninsula)\b/, "coast"],
];

/** Kind from a label's kind and text, if it says. */
export function kindFromHint(kind?: string, text = ""): SubjectKind | null {
  const k = (kind ?? "").toLowerCase();
  if (k === "peak") return /volcan/i.test(text) ? "volcano" : "peak";
  if (k === "volcano") return "volcano";
  if (k === "range") return "range";
  if (k === "sea") return "sea";
  if (k === "desert") return "desert";
  if (k === "glacier") return "glacier";
  if (k === "island") return "island";
  if (k === "city" || k === "capital" || k === "district") return "city";
  const t = `${k} ${text}`.toLowerCase();
  for (const [re, kind2] of HINTS) if (re.test(t)) return kind2;
  if (k === "water") return "lake";
  return null;
}

export interface Probe { centre: number; max: number; min: number; ring: number; ringStd: number; flat: number; maxAt: [number, number]; minAt: [number, number] }

/** Summarises a square grid of elevations (row-major, odd size) around a point. */
export function summarise(grid: Float32Array | number[], size: number, lonLat: (i: number, j: number) => [number, number]): Probe {
  const c = size >> 1;
  let max = -Infinity, min = Infinity, maxAt: [number, number] = [0, 0], minAt: [number, number] = [0, 0];
  const ringVals: number[] = [];
  let same = 0;
  const centre = grid[c * size + c];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const v = grid[j * size + i];
    if (v > max) { max = v; maxAt = lonLat(i, j); }
    if (v < min) { min = v; minAt = lonLat(i, j); }
    const r = Math.hypot(i - c, j - c);
    if (r > c * 0.55 && r <= c * 0.8) ringVals.push(v);
    if (Math.abs(v - centre) < 0.5) same++;
  }
  const ring = ringVals.reduce((s, v) => s + v, 0) / ringVals.length;
  const ringStd = Math.sqrt(ringVals.reduce((s, v) => s + (v - ring) ** 2, 0) / ringVals.length);
  return { centre, max, min, ring, ringStd, flat: same / (size * size), maxAt, minAt };
}

/** Kind from the shape of the ground. */
export function kindFromTerrain(p: Probe): SubjectKind {
  const relief = p.max - p.min;
  if (p.centre < -15 && p.flat < 0.5) return "sea";
  if (p.flat > 0.35 && relief > 5) return "lake";
  // A bowl: the ring stands well above the middle, all the way round.
  if (p.ring - p.centre > Math.max(40, relief * 0.25) && p.ringStd < (p.ring - p.centre) * 0.8) return "crater";
  if (relief > 250 && p.centre > p.max - relief * 0.12) return "peak";
  if (relief > 900) return "range";
  if (p.centre < 3 && p.max > 3) return "coast";
  return "land";
}

const SIZE = 21;

/** Identifies the subject at a place: a label hint first, then a look at the terrain. */
export async function identify(place: Place, radiusHint?: number): Promise<Subject> {
  const f = (place.feature ?? {}) as { kind?: string; name?: string };
  const name = place.name?.title ?? f.name ?? "This place";
  const text = `${place.name?.title ?? ""} ${place.name?.context ?? ""}`;
  const hinted = kindFromHint(f.kind, text);
  // Probe at two scales: ~6 km for summits and bowls, ~40 km for ranges and seas.
  const probeAt = async (radiusM: number) => {
    const dLat = radiusM / 110_540, dLon = radiusM / (111_320 * Math.cos((place.lat * Math.PI) / 180));
    const pts: [number, number][] = [];
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++)
      pts.push([place.lon + (i / (SIZE - 1) * 2 - 1) * dLon, place.lat - (j / (SIZE - 1) * 2 - 1) * dLat]);
    const z = radiusM > 20_000 ? 9 : 12;
    const v = await elevation.sample(pts, z);
    return summarise(v, SIZE, (i, j) => pts[j * SIZE + i]);
  };
  let near: Probe | null = null, wide: Probe | null = null;
  try { [near, wide] = await Promise.all([probeAt(radiusHint ?? 3000), probeAt(40_000)]); } catch { /* offline: use the hint */ }
  let kind: SubjectKind = hinted ?? "land";
  if (!hinted && near && wide) {
    kind = kindFromTerrain(near);
    if (kind === "land" && wide.max - wide.min > 1500) kind = "range";
    if (kind === "land" && wide.centre < -50) kind = "sea";
  }
  const p = near ?? { centre: 0, max: 0, min: 0, maxAt: [place.lon, place.lat] as [number, number], minAt: [place.lon, place.lat] as [number, number] } as Probe;
  const radius = radiusHint ?? ({ peak: 5000, volcano: 8000, crater: 4000, range: 60_000, sea: 300_000, river: 8000, lake: 6000, canyon: 15_000, glacier: 8000, forest: 6000, desert: 150_000, island: 20_000, city: 12_000, coast: 8000, land: 5000 } as Record<SubjectKind, number>)[kind];
  return {
    kind, name, lon: place.lon, lat: place.lat, radius, elevation: p.centre, relief: p.max - p.min, hint: f.kind,
    centre: kind === "peak" || kind === "volcano" ? p.maxAt : kind === "crater" ? p.minAt : undefined,
  };
}
