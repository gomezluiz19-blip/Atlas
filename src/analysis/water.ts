// High-level water analyses on real terrain: downstream flow paths and watersheds.
import { elevation, type ElevationGrid } from "../data/elevation";
import { haversine, lonLatToPixel, pixelToLonLat } from "../data/mercator";
import { buildFlowModelAsync, rowCellSizes } from "./flowClient";
import { snapToStream, touchesEdge, traceDownstream, watershedMask, type FlowModel } from "./hydrology";

const WINDOW = 768; // analysis window edge, cells

export interface FlowPoint {
  lon: number;
  lat: number;
  /** DEM elevation, metres. */
  elevation: number;
  /** True where the path crosses a filled depression (a lake, a closed basin or a DEM artefact). */
  ponded: boolean;
}

export type FlowEnd = "sea" | "limit" | "flat";

export interface FlowTrace {
  points: FlowPoint[];
  /** Cumulative distance along the path, metres. */
  distance: number[];
  end: FlowEnd;
  zoom: number;
  cellSize: number;
}

/** Elevation-data zoom level suited to the current camera height. */
export function analysisZoom(cameraHeight: number, min = 9): number {
  if (cameraHeight < 8_000) return 13;
  if (cameraHeight < 60_000) return 12;
  if (cameraHeight < 400_000) return 11;
  return Math.max(min, 10);
}

async function windowAround(px: number, py: number, z: number, size = WINDOW) {
  const grid = await elevation.grid(z, px - size / 2, py - size / 2, size, size);
  const model = await buildFlowModelAsync(grid);
  return { grid, model };
}

// Metres of fill before a cell counts as "ponded". Elevation data along river
// channels is noisy at the metre scale, so shallower hollows are ignored.
const PONDING_DEPTH = 2;

/**
 * Follows water downhill from a point, stitching analysis windows together
 * until it reaches the sea or a length limit.
 */
export async function traceFlow(
  lon: number,
  lat: number,
  z: number,
  onProgress?: (partial: FlowTrace) => void,
  maxWindows = 40,
): Promise<FlowTrace> {
  const points: FlowPoint[] = [];
  const distance: number[] = [];
  const visited = new Set<number>(); // global cell ids, to catch loops between windows
  let [px, py] = lonLatToPixel(lon, lat, z);
  let end: FlowEnd = "limit";
  let cellSize = 0;

  outer: for (let w = 0; w < maxWindows; w++) {
    const { grid, model } = await windowAround(px, py, z);
    cellSize = rowCellSizes(grid)[grid.height >> 1];
    const lx = Math.floor(px) - grid.px0, ly = Math.floor(py) - grid.py0;
    const path = traceDownstream(model, ly * grid.width + lx);
    for (const cell of path) {
      const cx = cell % grid.width, cy = (cell - cx) / grid.width;
      const gx = grid.px0 + cx, gy = grid.py0 + cy;
      const gid = gy * 2 ** (z + 8) + gx;
      if (visited.has(gid)) {
        if (cell === path[0]) continue; // window seam: the start cell repeats the previous end
        end = "flat";
        break outer;
      }
      visited.add(gid);
      const [plon, plat] = pixelToLonLat(gx + 0.5, gy + 0.5, z);
      const h = grid.data[cell];
      const prev = points[points.length - 1];
      distance.push(prev ? distance[distance.length - 1] + haversine(prev.lon, prev.lat, plon, plat) : 0);
      points.push({ lon: plon, lat: plat, elevation: h, ponded: model.filled[cell] - h > PONDING_DEPTH });
      if (h <= 0 && points.length > 1) {
        end = "sea";
        break outer;
      }
      px = gx + 0.5;
      py = gy + 0.5;
    }
    onProgress?.({ points: points.slice(), distance: distance.slice(), end: "limit", zoom: z, cellSize });
  }
  return { points, distance, end, zoom: z, cellSize };
}

export interface Watershed {
  outlet: { lon: number; lat: number; elevation: number };
  grid: ElevationGrid;
  model: FlowModel;
  mask: Uint8Array;
  /** Bounding box of the mask in grid cells. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  areaM2: number;
  minElevation: number;
  maxElevation: number;
  meanElevation: number;
  meanSlopeDeg: number;
  /** (mean - min) / (max - min); youthful basins > 0.6, old ones < 0.35 (Strahler 1952). */
  hypsometricIntegral: number;
  /** Hypsometric curve: fraction of area above each elevation. */
  hypsometry: { areaFraction: number[]; elevation: number[] };
  /** True if the basin still reached the edge of the largest window tried. */
  truncated: boolean;
  zoom: number;
  cellSize: number;
}

/** Delineates the area draining to a point, zooming out until the basin fits. */
export async function delineateWatershed(
  lon: number,
  lat: number,
  startZoom: number,
  onProgress?: (message: string) => void,
  minZoom = 7,
): Promise<Watershed> {
  for (let z = startZoom; ; z--) {
    onProgress?.(`Analysing terrain at ${zoomLabel(z)}…`);
    const [px, py] = lonLatToPixel(lon, lat, z);
    const { grid, model } = await windowAround(px, py, z);
    const sizes = rowCellSizes(grid);
    const cellSize = sizes[grid.height >> 1];
    const cell = (Math.floor(py) - grid.py0) * grid.width + (Math.floor(px) - grid.px0);
    const snapRadius = Math.max(2, Math.round(150 / cellSize));
    const outletCell = snapToStream(model, cell, snapRadius);
    const mask = watershedMask(model, outletCell);
    const truncated = touchesEdge(mask, grid.width, grid.height);
    if (truncated && z > minZoom) continue;
    return summarise(grid, model, mask, outletCell, sizes, truncated, z, cellSize);
  }
}

export function zoomLabel(z: number): string {
  const m = 40075016.686 / (256 * 2 ** z);
  return m >= 1000 ? `~${(m / 1000).toFixed(1)} km cells` : `~${Math.round(m)} m cells`;
}

function summarise(
  grid: ElevationGrid,
  model: FlowModel,
  mask: Uint8Array,
  outletCell: number,
  sizes: Float64Array,
  truncated: boolean,
  zoom: number,
  cellSize: number,
): Watershed {
  const { width: w, height: h, data } = grid;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  let area = 0, min = Infinity, max = -Infinity, sum = 0, slopeSum = 0;
  const elevations: number[] = [];
  const areas: number[] = [];
  for (let y = 0; y < h; y++) {
    const cs = sizes[y];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const a = cs * cs;
      const z = data[i];
      area += a;
      sum += z * a;
      if (z < min) min = z;
      if (z > max) max = z;
      elevations.push(z);
      areas.push(a);
      const xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1);
      const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
      const gx = (data[y * w + xr] - data[y * w + xl]) / ((xr - xl) * cs);
      const gy = (data[yd * w + x] - data[yu * w + x]) / ((yd - yu) * cs);
      slopeSum += Math.atan(Math.hypot(gx, gy)) * a;
    }
  }
  const mean = sum / area;

  // Hypsometric curve: sort cells high to low and accumulate area.
  const order = elevations.map((_, i) => i).sort((a, b) => elevations[b] - elevations[a]);
  const curveA: number[] = [], curveZ: number[] = [];
  const step = Math.max(1, Math.floor(order.length / 400));
  let acc = 0;
  order.forEach((i, k) => {
    acc += areas[i];
    if (k % step === 0 || k === order.length - 1) {
      curveA.push(acc / area);
      curveZ.push(elevations[i]);
    }
  });

  const ox = outletCell % w, oy = (outletCell - ox) / w;
  const [olon, olat] = pixelToLonLat(grid.px0 + ox + 0.5, grid.py0 + oy + 0.5, grid.z);
  return {
    outlet: { lon: olon, lat: olat, elevation: data[outletCell] },
    grid,
    model,
    mask,
    bbox: { x0, y0, x1, y1 },
    areaM2: area,
    minElevation: min,
    maxElevation: max,
    meanElevation: mean,
    meanSlopeDeg: ((slopeSum / area) * 180) / Math.PI,
    hypsometricIntegral: max > min ? (mean - min) / (max - min) : 0,
    hypsometry: { areaFraction: curveA, elevation: curveZ },
    truncated,
    zoom,
    cellSize,
  };
}
