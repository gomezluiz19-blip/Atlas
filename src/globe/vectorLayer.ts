// Draws polygon outlines (and optional fills) into map tiles on the fly, so
// vector data such as country borders drapes cleanly over the 3D terrain.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import { TILE_SIZE, lonLatToPixel } from "../data/mercator";

const SIZE = 512;

export interface VectorShape {
  /** Polygons as rings of [lon, lat]; the first ring of each is the outline. */
  polygons: [number, number][][][];
  bbox: [number, number, number, number];
}

export interface VectorStyle {
  stroke: string;
  width: number;
  fill?: string;
  /** Scale line width with zoom (thinner when zoomed out). */
  scaleWithZoom?: boolean;
}

class VectorImageryProvider extends UrlTemplateImageryProvider {
  constructor(private shapes: VectorShape[], private style: VectorStyle) {
    super({ url: "about:blank?{z}/{x}/{y}", maximumLevel: 11, enablePickFeatures: false, tileWidth: SIZE, tileHeight: SIZE });
  }

  override requestImage(x: number, y: number, level: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    const n = 2 ** level;
    // Tile bounds in degrees, padded slightly so strokes at the edges aren't cut.
    const west = (x / n) * 360 - 180, east = ((x + 1) / n) * 360 - 180;
    const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
    const north = lat(y), south = lat(y + 1);
    const padLon = (east - west) * 0.05, padLat = (north - south) * 0.05;
    // Draw at 2x so lines stay crisp when Cesium stretches coarse tiles.
    const k = SIZE / TILE_SIZE;
    const ox = x * TILE_SIZE, oy = y * TILE_SIZE;
    const { stroke, width, fill, scaleWithZoom } = this.style;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = k * (scaleWithZoom ? Math.max(0.5, Math.min(width, width * (0.25 + level * 0.12))) : width);
    for (const shape of this.shapes) {
      const [w, s, e, nn] = shape.bbox;
      if (e < west - padLon || w > east + padLon || nn < south - padLat || s > north + padLat) continue;
      ctx.beginPath();
      for (const poly of shape.polygons) {
        const ring = poly[0];
        let prevLon: number | null = null;
        ring.forEach(([lo, la], i) => {
          const [px, py] = lonLatToPixel(lo, la, level);
          const X = (px - ox) * k, Y = (py - oy) * k;
          // Don't draw across the antimeridian.
          if (i === 0 || (prevLon !== null && Math.abs(lo - prevLon) > 180)) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
          prevLon = lo;
        });
        if (fill) ctx.closePath();
      }
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill("evenodd");
      }
      ctx.stroke();
    }
    return Promise.resolve(canvas);
  }
}

export function vectorLayer(shapes: VectorShape[], style: VectorStyle): ImageryLayer {
  return new ImageryLayer(new VectorImageryProvider(shapes, style));
}
