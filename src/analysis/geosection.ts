// A simple, explainable subsurface model for a geologic cross-section.
//
// The stratigraphic column at the section gives the order and thickness of
// the rock layers. We assume the layers are planar ("layer-cake"): each
// boundary is a straight line in the section, all sharing one apparent dip.
// Where the bedrock map tells us which unit crops out at the surface, each of
// those observations constrains where the stack must sit, so we fit the
// stack's elevation and dip to them by least squares.

import { unitThickness, type StratUnit } from "../data/macrostrat";

export interface StackLayer {
  unit: StratUnit;
  /** Depth of the layer's top and bottom below the top of the stack, metres. */
  depthTop: number;
  depthBottom: number;
}

/** Where the bedrock map puts a known unit at the surface along the section. */
export interface SurfaceObservation {
  /** Distance along the section, metres. */
  x: number;
  /** Ground elevation there, metres. */
  z: number;
  /** Macrostrat unit ids the map polygon is linked to. */
  unitIds: number[];
}

export interface Structure {
  /** Elevation of the top of the stack at x = 0, metres. */
  top: number;
  /** Apparent dip along the section as a slope (rise over run, positive = rising toward B). */
  slope: number;
}

export interface StructureFit {
  structure: Structure;
  /** How the structure was obtained. */
  method: "fit" | "anchor" | "default";
  /** Number of surface observations used. */
  used: number;
}

const FALLBACK_THICKNESS = 30;
const MAX_SLOPE = Math.tan((30 * Math.PI) / 180);

export function buildStack(units: StratUnit[]): StackLayer[] {
  const seen = new Set<number>();
  const stack: StackLayer[] = [];
  let depth = 0;
  for (const unit of units) {
    if (seen.has(unit.unit_id)) continue;
    seen.add(unit.unit_id);
    const t = unitThickness(unit) || FALLBACK_THICKNESS;
    stack.push({ unit, depthTop: depth, depthBottom: depth + t });
    depth += t;
  }
  return stack;
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function leastSquares(pts: { x: number; y: number }[]): { a: number; b: number } {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const den = n * sxx - sx * sx;
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  return { a: (sy - b * sx) / n, b };
}

/**
 * Fits the stack's top elevation and apparent dip to the mapped surface geology.
 * @param length section length, metres
 * @param maxElevation highest ground on the section (fallback anchor), metres
 */
export function fitStructure(stack: StackLayer[], obs: SurfaceObservation[], length: number, maxElevation: number): StructureFit {
  const byId = new Map(stack.map((l) => [l.unit.unit_id, l]));
  // Each observation says top + slope * x - depthMid = z, i.e. z + depthMid = top + slope * x.
  let pts: { x: number; y: number; id: number }[] = [];
  for (const o of obs) {
    const layer = o.unitIds.map((id) => byId.get(id)).find(Boolean);
    if (!layer) continue;
    pts.push({ x: o.x, y: o.z + (layer.depthTop + layer.depthBottom) / 2, id: layer.unit.unit_id });
  }
  if (pts.length === 0) return { structure: { top: maxElevation, slope: 0 }, method: "default", used: 0 };

  const xs = pts.map((p) => p.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  const distinct = new Set(pts.map((p) => p.id)).size;
  if (pts.length >= 4 && distinct >= 2 && spread >= 0.25 * length) {
    let { a, b } = leastSquares(pts);
    // One pass of outlier rejection (mis-mapped or mis-linked units).
    const resid = pts.map((p) => Math.abs(p.y - (a + b * p.x)));
    const mad = median(resid) || 1;
    const kept = pts.filter((_, i) => resid[i] <= 3 * mad);
    if (kept.length >= 3) ({ a, b } = leastSquares(kept));
    pts = kept.length >= 3 ? kept : pts;
    return { structure: { top: a, slope: Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, b)) }, method: "fit", used: pts.length };
  }
  return { structure: { top: median(pts.map((p) => p.y)), slope: 0 }, method: "anchor", used: pts.length };
}

/** Elevation of a depth-below-stack-top surface at distance x. */
export function horizonElevation(s: Structure, depth: number, x: number): number {
  return s.top + s.slope * x - depth;
}

/** Index of the layer containing (x, elevation); -1 above the stack, stack.length below it. */
export function layerIndexAt(stack: StackLayer[], s: Structure, x: number, elevation: number): number {
  const depth = s.top + s.slope * x - elevation;
  if (depth < 0) return -1;
  let lo = 0, hi = stack.length - 1;
  if (stack.length === 0 || depth >= stack[hi].depthBottom) return stack.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stack[mid].depthBottom <= depth) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * For the deposition animation: how much of each layer exists at time `ma`
 * (millions of years ago). Layers deposit from the bottom up: 0 before the
 * unit's base age, 1 after its top age, linear in between.
 */
export function depositedFraction(unit: StratUnit, ma: number): number {
  if (ma >= unit.b_age) return 0;
  if (ma <= unit.t_age) return 1;
  return (unit.b_age - ma) / (unit.b_age - unit.t_age);
}
