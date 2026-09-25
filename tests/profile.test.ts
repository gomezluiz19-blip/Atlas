import { describe, expect, it } from "vitest";
import { profileStats } from "../src/analysis/profile";
import { decodeTerrarium, ElevationSource } from "../src/data/elevation";
import { greatCirclePoints, haversine, lonLatToPixel, pixelToLonLat } from "../src/data/mercator";

describe("profileStats", () => {
  it("measures a V-shaped gorge", () => {
    const d = [0, 100, 200, 300, 400];
    const z = [1000, 800, 400, 700, 900];
    const s = profileStats(d, z);
    expect(s.length).toBe(400);
    expect(s.relief).toBe(600);
    expect(s.lowestIndex).toBe(2);
    // Lower rim is the right one at 900 m: incision = 900 - 400.
    expect(s.incision?.depth).toBe(500);
    expect(s.incision?.rimWidth).toBe(400);
    expect(s.totalDescent).toBe(600);
    expect(s.totalAscent).toBe(500);
  });

  it("reports no incision when the low point is at an end", () => {
    const s = profileStats([0, 1, 2], [3, 2, 1]);
    expect(s.incision).toBeNull();
  });
});

describe("mercator", () => {
  it("round-trips lon/lat through pixel space", () => {
    const [px, py] = lonLatToPixel(-112.1, 36.1, 12);
    const [lon, lat] = pixelToLonLat(px, py, 12);
    expect(lon).toBeCloseTo(-112.1, 9);
    expect(lat).toBeCloseTo(36.1, 9);
  });

  it("interpolates great circles", () => {
    const pts = greatCirclePoints(0, 0, 90, 0, 3);
    expect(pts[1][0]).toBeCloseTo(45, 9);
    expect(haversine(0, 0, 0, 1)).toBeCloseTo(111195, -1);
  });
});

describe("elevation", () => {
  it("decodes terrarium RGB", () => {
    // 128*256 + 0 + 0 - 32768 = 0 m; 129*256 + 1 + 128/256 - 32768 = 257.5 m
    const out = decodeTerrarium(new Uint8Array([128, 0, 0, 255, 129, 1, 128, 255]));
    expect(Array.from(out)).toEqual([0, 257.5]);
  });

  it("stitches grids across tile boundaries and samples bilinearly", async () => {
    // Each tile's cells hold their global pixel x coordinate.
    const src = new ElevationSource(async (_z, x) => {
      const t = new Float32Array(256 * 256);
      for (let i = 0; i < t.length; i++) t[i] = x * 256 + (i % 256);
      return t;
    });
    const g = await src.grid(2, 250, 10, 12, 2);
    expect(Array.from(g.data.slice(0, 12))).toEqual([250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261]);
    // A point exactly between pixel centres 255 and 256 (global x = 256.0).
    const [lon, lat] = pixelToLonLat(256, 100.5, 2);
    const [z] = await src.sample([[lon, lat]], 2);
    expect(z).toBeCloseTo(255.5, 3);
  });
});
