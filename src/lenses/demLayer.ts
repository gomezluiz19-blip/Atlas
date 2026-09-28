// A map layer painted from elevation, pixel by pixel, with any rule: sea
// level, seafloor zones, mountain life zones. Tiles come from the shared
// elevation cache, so repainting with a new rule is quick.
import { ImageryLayer, Rectangle, UrlTemplateImageryProvider } from "cesium";
import { MAX_ELEVATION_ZOOM, elevation } from "../data/elevation";
import { TILE_SIZE, pixelToLonLat } from "../data/mercator";

/** Returns [r, g, b, a] (0–255) for an elevation at a latitude, or null for clear. */
export type DemPaint = (h: number, lat: number) => [number, number, number, number] | null;

class DemProvider extends UrlTemplateImageryProvider {
  constructor(private paint: DemPaint, maxLevel: number, rectangle?: Rectangle) {
    super({ url: "about:blank?{z}/{x}/{y}", maximumLevel: maxLevel, enablePickFeatures: false, rectangle, credit: "Analysis: Atlas, from Terrain Tiles on AWS" });
  }
  override requestImage(x: number, y: number, level: number) {
    return elevation.tile(level, x, y).then((tile) => {
      const c = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const g = c.getContext("2d")!;
      const img = g.createImageData(TILE_SIZE, TILE_SIZE);
      for (let j = 0; j < TILE_SIZE; j++) {
        const [, lat] = pixelToLonLat(x * TILE_SIZE, y * TILE_SIZE + j + 0.5, level);
        for (let i = 0; i < TILE_SIZE; i++) {
          const col = this.paint(tile[j * TILE_SIZE + i], lat);
          if (col) img.data.set(col, (j * TILE_SIZE + i) * 4);
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    });
  }
}

/** A layer painted from elevation, optionally limited to [west, south, east, north] degrees. */
export function demLayer(paint: DemPaint, opts: { alpha?: number; bbox?: [number, number, number, number]; maxLevel?: number } = {}): ImageryLayer {
  const rect = opts.bbox ? Rectangle.fromDegrees(...opts.bbox) : undefined;
  return new ImageryLayer(new DemProvider(paint, opts.maxLevel ?? MAX_ELEVATION_ZOOM, rect), { alpha: opts.alpha ?? 1, rectangle: rect });
}
