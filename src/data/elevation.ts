// Worldwide elevation from the open "Terrarium" tiles hosted on AWS
// (Mapzen / Tilezen joint terrain: SRTM, 3DEP, ETOPO, GMTED and others).
// Each 256x256 PNG encodes height as (R * 256 + G + B / 256) - 32768 metres.
// https://registry.opendata.aws/terrain-tiles/

import { TILE_SIZE, lonLatToPixel, worldSize } from "./mercator";

export const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/** Deepest zoom level the tile set publishes. */
export const MAX_ELEVATION_ZOOM = 15;

export type TileLoader = (z: number, x: number, y: number) => Promise<Float32Array>;

/** A rectangular block of elevations in Web Mercator pixel space. */
export interface ElevationGrid {
  z: number;
  /** Global pixel coordinate of the grid's top-left cell. */
  px0: number;
  py0: number;
  width: number;
  height: number;
  /** Row-major elevations in metres. */
  data: Float32Array;
}

export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256 - 32768;
  }
  return out;
}

export async function fetchTerrariumTile(z: number, x: number, y: number): Promise<Float32Array> {
  const url = TERRARIUM_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation tile ${z}/${x}/${y} failed: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
}

export class ElevationSource {
  private cache = new Map<string, Promise<Float32Array>>();

  constructor(
    private loader: TileLoader = fetchTerrariumTile,
    private cacheSize = 384,
  ) {}

  /** A decoded tile. x wraps around the antimeridian; y is clamped. */
  tile(z: number, x: number, y: number): Promise<Float32Array> {
    const n = 2 ** z;
    const tx = ((x % n) + n) % n;
    const ty = Math.max(0, Math.min(n - 1, y));
    const key = `${z}/${tx}/${ty}`;
    let p = this.cache.get(key);
    if (p) {
      // Refresh recency for LRU eviction.
      this.cache.delete(key);
      this.cache.set(key, p);
      return p;
    }
    p = this.loader(z, tx, ty);
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    if (this.cache.size > this.cacheSize) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  /** Loads a width x height block of cells whose top-left is at global pixel (px0, py0). */
  async grid(z: number, px0: number, py0: number, width: number, height: number): Promise<ElevationGrid> {
    px0 = Math.floor(px0);
    py0 = Math.floor(py0);
    const size = worldSize(z);
    py0 = Math.max(0, Math.min(size - height, py0));
    const tx0 = Math.floor(px0 / TILE_SIZE);
    const ty0 = Math.floor(py0 / TILE_SIZE);
    const tx1 = Math.floor((px0 + width - 1) / TILE_SIZE);
    const ty1 = Math.floor((py0 + height - 1) / TILE_SIZE);
    const jobs: Promise<void>[] = [];
    const data = new Float32Array(width * height);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        jobs.push(
          this.tile(z, tx, ty).then((tile) => {
            const gx0 = tx * TILE_SIZE, gy0 = ty * TILE_SIZE;
            const x0 = Math.max(px0, gx0), x1 = Math.min(px0 + width, gx0 + TILE_SIZE);
            const y0 = Math.max(py0, gy0), y1 = Math.min(py0 + height, gy0 + TILE_SIZE);
            for (let gy = y0; gy < y1; gy++) {
              const src = (gy - gy0) * TILE_SIZE - gx0;
              const dst = (gy - py0) * width - px0;
              for (let gx = x0; gx < x1; gx++) data[dst + gx] = tile[src + gx];
            }
          }),
        );
      }
    }
    await Promise.all(jobs);
    return { z, px0, py0, width, height, data };
  }

  /** Bilinearly interpolated elevations for a list of [lon, lat] points. */
  async sample(points: [number, number][], z: number): Promise<Float32Array> {
    const pix = points.map(([lon, lat]) => lonLatToPixel(lon, lat, z));
    const needed = new Map<string, [number, number]>();
    for (const [px, py] of pix) {
      const fx = Math.floor(px - 0.5), fy = Math.floor(py - 0.5);
      for (const [cx, cy] of [[fx, fy], [fx + 1, fy], [fx, fy + 1], [fx + 1, fy + 1]]) {
        const t: [number, number] = [Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE)];
        needed.set(t.join("/"), t);
      }
    }
    const tiles = new Map<string, Float32Array>();
    await Promise.all(
      [...needed].map(async ([key, [tx, ty]]) => tiles.set(key, await this.tile(z, tx, ty))),
    );
    const size = worldSize(z);
    const at = (gx: number, gy: number) => {
      gy = Math.max(0, Math.min(size - 1, gy));
      const tx = Math.floor(gx / TILE_SIZE), ty = Math.floor(gy / TILE_SIZE);
      const tile = tiles.get(`${tx}/${ty}`)!;
      return tile[(gy - ty * TILE_SIZE) * TILE_SIZE + (gx - tx * TILE_SIZE)];
    };
    const out = new Float32Array(points.length);
    pix.forEach(([px, py], i) => {
      const x = px - 0.5, y = py - 0.5;
      const fx = Math.floor(x), fy = Math.floor(y);
      const u = x - fx, v = y - fy;
      out[i] =
        at(fx, fy) * (1 - u) * (1 - v) +
        at(fx + 1, fy) * u * (1 - v) +
        at(fx, fy + 1) * (1 - u) * v +
        at(fx + 1, fy + 1) * u * v;
    });
    return out;
  }
}

/** The shared app-wide elevation source (one tile cache for rendering and analysis). */
export const elevation = new ElevationSource();
