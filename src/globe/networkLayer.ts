// Draws world networks (rail, roads, shipping lanes, cables) and point sets
// (ports, airports, power plants, mines) into map tiles on the fly, so they
// drape over the 3D terrain at any zoom without a tile server.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import { TILE_SIZE, lonLatToPixel } from "../data/mercator";
import type { NetLine } from "../data/infra";

const SIZE = 512;
const K = SIZE / TILE_SIZE;

export interface TileView {
  level: number;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Canvas pixel for a lon/lat. */
  project(lon: number, lat: number): [number, number];
  /** True if a bbox (padded by `padPx` canvas pixels) touches this tile. */
  touches(bbox: [number, number, number, number], padPx?: number): boolean;
}

export type TileDraw = (ctx: CanvasRenderingContext2D, t: TileView) => void;

class CanvasTileProvider extends UrlTemplateImageryProvider {
  constructor(private draw: TileDraw, maximumLevel: number, credit?: string) {
    // Declared as 256-pixel tiles (so Cesium picks the level a normal map would)
    // but drawn at 512 for crisp lines on high-density screens.
    super({ url: "about:blank?{z}/{x}/{y}", maximumLevel, enablePickFeatures: false, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, credit });
  }

  override requestImage(x: number, y: number, level: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    const n = 2 ** level;
    const west = (x / n) * 360 - 180, east = ((x + 1) / n) * 360 - 180;
    const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
    const north = lat(y), south = lat(y + 1);
    const ox = x * TILE_SIZE, oy = y * TILE_SIZE;
    const degPerPx = (east - west) / SIZE;
    const view: TileView = {
      level, west, east, south, north,
      project(lon, la) {
        const [px, py] = lonLatToPixel(lon, la, level);
        return [(px - ox) * K, (py - oy) * K];
      },
      touches([w, s, e, nn], padPx = 8) {
        const p = padPx * degPerPx;
        return !(e < west - p || w > east + p || nn < south - p || s > north + p);
      },
    };
    ctx.lineJoin = ctx.lineCap = "round";
    this.draw(ctx, view);
    return Promise.resolve(canvas);
  }
}

export function canvasLayer(draw: TileDraw, opts: { maximumLevel?: number; credit?: string; alpha?: number } = {}): ImageryLayer {
  return new ImageryLayer(new CanvasTileProvider(draw, opts.maximumLevel ?? 12, opts.credit), { alpha: opts.alpha ?? 1 });
}

/** Adds a line's path to the context, breaking at the antimeridian. */
export function tracePath(ctx: CanvasRenderingContext2D, t: TileView, xy: Float32Array) {
  let prev = NaN;
  for (let i = 0; i < xy.length; i += 2) {
    const lon = xy[i];
    const [X, Y] = t.project(lon, xy[i + 1]);
    if (i === 0 || Math.abs(lon - prev) > 180) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
    prev = lon;
  }
}

export interface LineStyle { color: string; width: number; dash?: number[]; casing?: string }

/**
 * Strokes lines grouped by style. `style` returns null to skip a line at this
 * zoom. Lines are batched per style so each style is one path.
 */
export function drawLines(ctx: CanvasRenderingContext2D, t: TileView, lines: NetLine[], style: (l: NetLine, level: number) => LineStyle | null) {
  const groups = new Map<string, { s: LineStyle; lines: NetLine[] }>();
  for (const l of lines) {
    if (!t.touches(l.bbox)) continue;
    const s = style(l, t.level);
    if (!s) continue;
    const key = `${s.color}|${s.width}|${s.dash?.join(",") ?? ""}|${s.casing ?? ""}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { s, lines: [] }));
    g.lines.push(l);
  }
  // Wider (more important) styles last so they sit on top.
  const ordered = [...groups.values()].sort((a, b) => a.s.width - b.s.width);
  for (const { s, lines: ls } of ordered) {
    ctx.beginPath();
    for (const l of ls) tracePath(ctx, t, l.xy);
    if (s.casing) {
      ctx.setLineDash([]);
      ctx.strokeStyle = s.casing;
      ctx.lineWidth = (s.width + 2) * K;
      ctx.stroke();
    }
    ctx.setLineDash(s.dash ? s.dash.map((d) => d * K) : []);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * K;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export interface DotStyle { color: string; radius: number; stroke?: string; glyph?: "anchor" | "plane" | "pick" | "bolt" | "cable" }

/** Draws round markers, largest first so small ones stay visible on top. */
export function drawDots<T extends { lon: number; lat: number }>(ctx: CanvasRenderingContext2D, t: TileView, items: T[], style: (it: T, level: number) => DotStyle | null) {
  const list: [number, number, DotStyle][] = [];
  for (const it of items) {
    const s = style(it, t.level);
    if (!s) continue;
    const pad = (s.radius + 2) * K;
    if (!t.touches([it.lon, it.lat, it.lon, it.lat], pad)) continue;
    const [X, Y] = t.project(it.lon, it.lat);
    list.push([X, Y, s]);
  }
  list.sort((a, b) => b[2].radius - a[2].radius);
  for (const [X, Y, s] of list) {
    const r = s.radius * K;
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.lineWidth = 1.2 * K;
    ctx.strokeStyle = s.stroke ?? "rgba(255,255,255,0.9)";
    ctx.stroke();
    if (s.glyph && r >= 5 * K) drawGlyph(ctx, s.glyph, X, Y, r);
  }
}

/** Tiny white pictograms inside larger dots. */
function drawGlyph(ctx: CanvasRenderingContext2D, g: NonNullable<DotStyle["glyph"]>, x: number, y: number, r: number) {
  const u = r / 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = ctx.fillStyle = "#fff";
  ctx.lineWidth = Math.max(1, u * 0.9);
  ctx.beginPath();
  if (g === "anchor") {
    ctx.moveTo(0, -3 * u); ctx.lineTo(0, 3 * u);
    ctx.moveTo(-2 * u, -1.5 * u); ctx.lineTo(2 * u, -1.5 * u);
    ctx.moveTo(-2.8 * u, 1 * u); ctx.quadraticCurveTo(-2 * u, 3.2 * u, 0, 3 * u); ctx.quadraticCurveTo(2 * u, 3.2 * u, 2.8 * u, 1 * u);
    ctx.stroke();
  } else if (g === "plane") {
    ctx.moveTo(0, -3.2 * u); ctx.lineTo(0, 3 * u);
    ctx.moveTo(-3 * u, 0.5 * u); ctx.lineTo(0, -1 * u); ctx.lineTo(3 * u, 0.5 * u);
    ctx.moveTo(-1.3 * u, 2.8 * u); ctx.lineTo(0, 2 * u); ctx.lineTo(1.3 * u, 2.8 * u);
    ctx.stroke();
  } else if (g === "bolt") {
    ctx.moveTo(0.8 * u, -3.2 * u); ctx.lineTo(-1.6 * u, 0.4 * u); ctx.lineTo(0.4 * u, 0.4 * u); ctx.lineTo(-0.8 * u, 3.2 * u); ctx.lineTo(1.6 * u, -0.4 * u); ctx.lineTo(-0.4 * u, -0.4 * u); ctx.closePath();
    ctx.fill();
  } else if (g === "pick") {
    ctx.moveTo(-2.6 * u, -1.2 * u); ctx.quadraticCurveTo(0, -3.4 * u, 2.6 * u, -1.2 * u);
    ctx.moveTo(0, -2.3 * u); ctx.lineTo(0, 3 * u);
    ctx.stroke();
  } else if (g === "cable") {
    ctx.arc(0, 0, 1.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
