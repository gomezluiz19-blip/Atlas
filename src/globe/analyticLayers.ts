// Analytical map layers rendered in the browser straight from elevation data:
// relief shading, hypsometric tint, slope and contour lines.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import { MAX_ELEVATION_ZOOM, elevation } from "../data/elevation";
import { TILE_SIZE, metersPerPixel, pixelToLonLat } from "../data/mercator";

export type AnalyticKind = "hillshade" | "elevation" | "slope" | "contours";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** A colour ramp with evenly spaced stops between `min` and `max`. */
export interface Ramp {
  min: number;
  max: number;
  stops: string[];
}

// Land: Crameri "batlow" (perceptually uniform, colour-blind friendly). Sea: dark to light blue.
export const LAND_RAMP: Ramp = {
  min: 0,
  max: 6000,
  stops: ["#1a3a5e", "#1d5a61", "#3c6e57", "#687b44", "#978735", "#c6924a", "#ec9f78", "#f9bfb6", "#fde4ef"],
};
export const SEA_RAMP: Ramp = { min: -7000, max: 0, stops: ["#081a3a", "#123a6b", "#2f6aa3", "#7fb2d9"] };
export const SLOPE_RAMP: Ramp = {
  min: 0,
  max: 60,
  stops: ["#fff7c2", "#fed976", "#fd8d3c", "#e31a1c", "#800026", "#35000f"],
};

function rampLookup(ramp: Ramp): (v: number) => RGB {
  const stops = ramp.stops.map(hex);
  return (v) => {
    const t = Math.max(0, Math.min(1, (v - ramp.min) / (ramp.max - ramp.min))) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const f = t - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}
const landColor = rampLookup(LAND_RAMP);
const seaColor = rampLookup(SEA_RAMP);
const slopeColor = rampLookup(SLOPE_RAMP);

/**
 * Contour interval in metres for a zoom level: roughly four pixels of ground
 * per interval, so even steep canyon walls stay legible.
 */
export function contourInterval(z: number): number {
  if (z <= 7) return 1000;
  if (z <= 9) return 500;
  if (z <= 10) return 200;
  if (z <= 11) return 100;
  if (z <= 12) return 50;
  if (z <= 13) return 25;
  if (z <= 14) return 20;
  return 10;
}

/** Relief is visually flat at small scales, so exaggerate it there (standard web practice). */
function reliefExaggeration(z: number): number {
  return 1.5 ** Math.max(0, 11 - z);
}

function render(kind: AnalyticKind, tile: Float32Array, x: number, y: number, z: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  const px = img.data;
  const at = (i: number, j: number) =>
    tile[Math.max(0, Math.min(TILE_SIZE - 1, j)) * TILE_SIZE + Math.max(0, Math.min(TILE_SIZE - 1, i))];
  const zf = reliefExaggeration(z);
  // Sun from the north-west (azimuth 315), 45 degrees above the horizon, in
  // the math-angle convention of the standard (Esri / Burrough) formula.
  const zenith = Math.PI / 4, azimuth = ((360 - 315 + 90) * Math.PI) / 180;
  const flatShade = Math.cos(zenith);
  const interval = contourInterval(z);

  for (let j = 0; j < TILE_SIZE; j++) {
    const [, lat] = pixelToLonLat(x * TILE_SIZE, y * TILE_SIZE + j + 0.5, z);
    const cell = metersPerPixel(lat, z);
    for (let i = 0; i < TILE_SIZE; i++) {
      const o = (j * TILE_SIZE + i) * 4;
      const h = at(i, j);
      if (kind === "elevation") {
        const c = h >= 0 ? landColor(h) : seaColor(h);
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
        continue;
      }
      if (kind === "contours") {
        const band = Math.floor(h / interval);
        const edge =
          band !== Math.floor(at(i + 1, j) / interval) || band !== Math.floor(at(i, j + 1) / interval);
        if (edge && h > 0) {
          const index = Math.floor(Math.max(h, at(i + 1, j), at(i, j + 1)) / interval) % 5 === 0;
          px[o] = 255; px[o + 1] = 245; px[o + 2] = 225; px[o + 3] = index ? 235 : 120;
        }
        continue;
      }
      // Horn (1981) finite-difference gradient.
      const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1);
      const d = at(i - 1, j), f = at(i + 1, j);
      const g = at(i - 1, j + 1), hh = at(i, j + 1), k = at(i + 1, j + 1);
      const dzdx = (c + 2 * f + k - (a + 2 * d + g)) / (8 * cell);
      const dzdy = (g + 2 * hh + k - (a + 2 * b + c)) / (8 * cell);
      if (kind === "slope") {
        const deg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
        const col = slopeColor(deg);
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
        px[o + 3] = h > 0 || deg > 1 ? 215 : 0;
        continue;
      }
      const slope = Math.atan(zf * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const shade =
        Math.cos(zenith) * Math.cos(slope) +
        Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect);
      if (shade < flatShade) {
        px[o + 3] = Math.min(235, ((flatShade - shade) / flatShade) * 300);
      } else {
        px[o] = px[o + 1] = px[o + 2] = 255;
        px[o + 3] = ((shade - flatShade) / (1 - flatShade)) * 90;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

class AnalyticImageryProvider extends UrlTemplateImageryProvider {
  constructor(private kind: AnalyticKind) {
    super({
      url: "about:blank?{z}/{x}/{y}",
      maximumLevel: MAX_ELEVATION_ZOOM,
      enablePickFeatures: false,
      credit: "Analysis: Atlas, from Terrain Tiles on AWS",
    });
  }
  override requestImage(x: number, y: number, level: number) {
    return elevation.tile(level, x, y).then((tile) => render(this.kind, tile, x, y, level));
  }
}

export function createAnalyticLayer(kind: AnalyticKind): ImageryLayer {
  return new ImageryLayer(new AnalyticImageryProvider(kind));
}
