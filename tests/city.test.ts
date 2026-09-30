import { describe, expect, it } from "vitest";
import { busyAt, busyness, localHour, readCity, roadUse, scatterTrees } from "../src/city/data";

describe("living city", () => {
  it("knows who uses each road", () => {
    expect(roadUse({ highway: "primary", maxspeed: "50" })).toMatchObject({ car: true, foot: true, oneway: false });
    expect(roadUse({ highway: "primary", maxspeed: "50" })!.speed).toBeCloseTo(50 / 3.6 * 0.8, 1);
    expect(roadUse({ highway: "footway" })).toMatchObject({ car: false, foot: true, speed: 1.4 });
    expect(roadUse({ highway: "motorway" })).toMatchObject({ car: true, foot: false, oneway: true });
    expect(roadUse({ highway: "residential", oneway: "yes" })?.oneway).toBe(true);
    expect(roadUse({ building: "yes" })).toBeNull();
  });

  it("builds a road graph with junctions, buildings and trees", () => {
    const g = (pts: [number, number][]) => pts.map(([lon, lat]) => ({ lon, lat }));
    const c = readCity([
      { type: "way", id: 1, tags: { highway: "residential" }, nodes: [10, 11, 12], geometry: g([[0, 0], [0.001, 0], [0.002, 0]]) },
      { type: "way", id: 2, tags: { highway: "footway" }, nodes: [11, 20], geometry: g([[0.001, 0], [0.001, 0.001]]) },
      { type: "way", id: 3, tags: { building: "apartments", "building:levels": "5" }, geometry: g([[0, 0.0005], [0.0003, 0.0005], [0.0003, 0.0008], [0, 0.0008], [0, 0.0005]]) },
      { type: "way", id: 4, tags: { leisure: "park" }, geometry: g([[0.003, 0.003], [0.004, 0.003], [0.004, 0.004], [0.003, 0.004], [0.003, 0.003]]) },
      { type: "node", id: 5, lon: 0.001, lat: 0.0002, tags: { shop: "bakery" } },
      { type: "node", id: 6, lon: 0.0005, lat: 0.0001, tags: { natural: "tree" } },
    ], [0.001, 0.001]);
    expect(c.roads).toHaveLength(2);
    expect(c.roads[0].len).toBeCloseTo(222.6, 0);
    expect(c.junctions.get(11)).toEqual([{ road: 0, i: 1 }, { road: 1, i: 0 }]);
    expect(c.junctions.has(10)).toBe(false);
    expect(c.buildings[0]).toMatchObject({ kind: "apartments", height: 15.5 });
    expect(c.trees.length).toBeGreaterThan(5);
    expect(c.hotspots).toEqual([[0.001, 0.0002]]);
    expect(c.roads[0].busy).toBe(2);
  });

  it("follows the day: busy at rush hour, quiet at night", () => {
    expect(busyAt(8, "car")).toBe(1);
    expect(busyAt(3, "car")).toBeLessThan(0.2);
    expect(busyAt(12, "person")).toBe(1);
    expect(busyAt(2, "person")).toBeLessThan(0.1);
    expect(localHour(15, Date.UTC(2026, 0, 1, 11))).toBeCloseTo(12, 5);
    expect(busyness([[0, 0]], [[0, 0.0005], [1, 1]])).toBe(2);
    expect(scatterTrees([[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]], 20, 500).length).toBeGreaterThan(20);
  });
});
