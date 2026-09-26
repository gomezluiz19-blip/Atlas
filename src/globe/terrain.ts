// Keyless 3D terrain for Cesium built from the Terrarium elevation tiles.
import { CustomHeightmapTerrainProvider, WebMercatorTilingScheme } from "cesium";
import { MAX_ELEVATION_ZOOM, elevation } from "../data/elevation";
import { TILE_SIZE } from "../data/mercator";

const SAMPLES = 65; // heightmap posts per tile edge (Cesium tiles share edge posts)

export const terrainOptions = {
  /** When false, seafloor is flattened to sea level so coastlines read cleanly. */
  showBathymetry: false,
};

export function createTerrariumTerrain(): CustomHeightmapTerrainProvider {
  return new CustomHeightmapTerrainProvider({
    width: SAMPLES,
    height: SAMPLES,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: "Elevation: Terrain Tiles on AWS (Mapzen/Tilezen: SRTM, 3DEP, ETOPO1, GMTED and others)",
    callback: async (x, y, level) => {
      // Past the deepest published zoom, upsample a sub-window of the parent tile.
      // If a tile can't be fetched, fall back to coarser ancestors so the
      // globe never shows a hole (ancestors are usually cached already).
      let src = Math.min(level, MAX_ELEVATION_ZOOM);
      let tile: Float32Array | null = null;
      for (; src >= 0 && !tile; src--) tile = await elevation.tile(src, x >> (level - src), y >> (level - src)).catch(() => null);
      src++;
      if (!tile) return new Float32Array(SAMPLES * SAMPLES);
      const shift = level - src;
      const span = TILE_SIZE / 2 ** shift;
      const ox = (x - ((x >> shift) << shift)) * span;
      const oy = (y - ((y >> shift) << shift)) * span;
      const out = new Float32Array(SAMPLES * SAMPLES);
      const clampToSea = !terrainOptions.showBathymetry;
      for (let j = 0; j < SAMPLES; j++) {
        const py = Math.min(TILE_SIZE - 1, Math.max(0, oy + (j / (SAMPLES - 1)) * span - 0.5));
        const y0 = Math.floor(py), y1 = Math.min(TILE_SIZE - 1, y0 + 1), v = py - y0;
        for (let i = 0; i < SAMPLES; i++) {
          const px = Math.min(TILE_SIZE - 1, Math.max(0, ox + (i / (SAMPLES - 1)) * span - 0.5));
          const x0 = Math.floor(px), x1 = Math.min(TILE_SIZE - 1, x0 + 1), u = px - x0;
          let h =
            tile[y0 * TILE_SIZE + x0] * (1 - u) * (1 - v) +
            tile[y0 * TILE_SIZE + x1] * u * (1 - v) +
            tile[y1 * TILE_SIZE + x0] * (1 - u) * v +
            tile[y1 * TILE_SIZE + x1] * u * v;
          if (clampToSea && h < 0) h = 0;
          out[j * SAMPLES + i] = h;
        }
      }
      return out;
    },
  });
}
