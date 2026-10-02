import { describe, expect, it } from "vitest";
import { circle, clipConvex, distanceTo, inRing, joinRings, landLine, landQuery, scatter, toLand, withYours } from "../src/myplaces/land";

describe("land around a place", () => {
  it("asks for water, pools and trees", () => {
    const q = landQuery(-77.2, 38.85, 130);
    for (const k of ["natural", "swimming_pool", "waterway", "coastline", '"tree"', "out geom"]) expect(q).toContain(k);
  });
  it("joins a lake drawn as several ways into a ring", () => {
    const r = joinRings([[[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 1]], [[0, 1], [0, 0]]]);
    expect(r).toHaveLength(1);
    expect(r[0][0]).toEqual(r[0][r[0].length - 1]);
    expect(r[0]).toHaveLength(5);
  });
  it("sorts the answer into water, streams, pools, woods and trees", () => {
    const g = (pts: number[][]) => pts.map(([lon, lat]) => ({ lon, lat }));
    const land = toLand([
      { type: "relation", tags: { natural: "water", water: "lake", name: "Lake Barcroft" }, members: [{ type: "way", role: "outer", geometry: g([[0, 0], [1, 0], [1, 1]]) }, { type: "way", role: "outer", geometry: g([[1, 1], [0, 1], [0, 0]]) }, { type: "way", role: "inner", geometry: g([[0.4, 0.4], [0.5, 0.4], [0.5, 0.5], [0.4, 0.4]]) }] },
      { type: "way", tags: { waterway: "stream", name: "Holmes Run" }, geometry: g([[0, 0], [2, 2]]) },
      { type: "way", tags: { leisure: "swimming_pool" }, geometry: g([[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]]) },
      { type: "way", tags: { natural: "wood" }, geometry: g([[0, 0], [1, 0], [1, 1], [0, 0]]) },
      { type: "node", lat: 1, lon: 2, tags: { natural: "tree" } },
      { type: "way", tags: { highway: "residential" }, geometry: g([[0, 0], [1, 1]]) },
    ]);
    expect(land.water).toHaveLength(1);
    expect(land.water[0]).toMatchObject({ name: "Lake Barcroft", kind: "lake" });
    expect(land.streams[0].name).toBe("Holmes Run");
    expect(land.pools).toHaveLength(1);
    expect(land.woods).toHaveLength(1);
    expect(land.trees).toEqual([[2, 1]]);
    const mine = withYours(land, { pools: [[[5, 5], [6, 5], [6, 6]]], trees: [[3, 3], [4, 4]] });
    expect(mine.pools).toHaveLength(2);
    expect(mine.trees).toHaveLength(3);
  });
  it("clips shapes to the hologram's disc", () => {
    const big: [number, number][] = [[-500, -500], [500, -500], [500, 500], [-500, 500]];
    const c = clipConvex(big, circle(100, 32));
    expect(c.length).toBeGreaterThanOrEqual(32);
    for (const [x, y] of c) expect(Math.hypot(x, y)).toBeLessThanOrEqual(100.01);
    expect(clipConvex([[200, 200], [300, 200], [300, 300]], circle(100))).toEqual([]);
  });
  it("fills a wood with trees about every 9 m, the same each time", () => {
    const sq: [number, number][] = [[0, 0], [90, 0], [90, 90], [0, 90]];
    const a = scatter(sq, 9), b = scatter(sq, 9);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(80);
    expect(a.every((p) => inRing(sq, p))).toBe(true);
  });
  it("measures how far the building is from the water and says it", () => {
    const lake: [number, number][] = [[30, -50], [100, -50], [100, 50], [30, 50]];
    const house: [number, number][] = [[-6, -5], [6, -5], [6, 5], [-6, 5]];
    expect(distanceTo(house, [lake])).toBeCloseTo(24);
    expect(distanceTo([[50, 0]], [lake])).toBe(0);
    expect(distanceTo(house, [], [[[0, 20], [10, 20]]])).toBeCloseTo(15);
    expect(landLine({ trees: 120, pools: 1, water: { name: "Lake Barcroft", kind: "lake", m: 24 } })).toBe("✓ Waterfront on Lake Barcroft, 24 m to the water · 120 trees · 1 pool");
    expect(landLine({ trees: 0, pools: 0 })).toMatch(/add yours/);
  });
});
