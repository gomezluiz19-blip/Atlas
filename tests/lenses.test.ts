import { describe, expect, it } from "vitest";
import { kindFromHint, kindFromTerrain, summarise } from "../src/lenses/identify";
import { dominantBearing, offset } from "../src/lenses/slice";
import { ZONES, craterShape, reliefStats, seaZone, snowline, treeline, zoneAt } from "../src/lenses/landforms";
import { chain } from "../src/lenses/trace";
import { compare, moveRings } from "../src/lenses/places";
import { joinRings } from "../src/lenses/osm";
import { perYear } from "../src/lenses/rewind";
import { haversine } from "../src/data/mercator";
import { areaM2 } from "../src/work/geo";

const N = 21;
const gridOf = (f: (x: number, y: number) => number) => {
  const g: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g.push(f(i - 10, j - 10));
  return g;
};
const probe = (f: (x: number, y: number) => number) => summarise(gridOf(f), N, (i, j) => [i, j]);

describe("what did you tap?", () => {
  it("reads label kinds and names", () => {
    expect(kindFromHint("peak", "Mount Etna volcano")).toBe("volcano");
    expect(kindFromHint("peak", "Matterhorn")).toBe("peak");
    expect(kindFromHint("sea", "")).toBe("sea");
    expect(kindFromHint("nature", "Grand Canyon")).toBe("canyon");
    expect(kindFromHint("water", "Lake Geneva")).toBe("lake");
    expect(kindFromHint(undefined, "River Thames")).toBe("river");
    expect(kindFromHint("capital", "Paris")).toBe("city");
    expect(kindFromHint(undefined, "Somewhere")).toBeNull();
  });
  it("reads the shape of the ground", () => {
    expect(kindFromTerrain(probe((x, y) => 2000 - 40 * Math.hypot(x, y)))).toBe("peak");
    expect(kindFromTerrain(probe((x, y) => { const r = Math.hypot(x, y); return 500 + (r < 7 ? r * r * 4 : 196 - (r - 7) * 10); }))).toBe("crater");
    expect(kindFromTerrain(probe((x, y) => -3000 + x * 5 + y))).toBe("sea");
    expect(kindFromTerrain(probe((x, y) => (Math.hypot(x, y) < 8 ? 372 : 372 + Math.hypot(x, y) * 3)))).toBe("lake");
    expect(kindFromTerrain(probe((x) => 100 + x))).toBe("land");
  });
});

describe("slice", () => {
  it("cuts across a ridge, not along it", () => {
    // A ridge running north–south: the ground falls away east and west.
    const ns = gridOf((x) => 1000 - 50 * Math.abs(x));
    expect(Math.round(dominantBearing(ns, N)) % 180).toBe(90);
    // A ridge running east–west: cut north–south.
    const ew = gridOf((_x, y) => 1000 - 50 * Math.abs(y));
    expect(Math.round(dominantBearing(ew, N)) % 180).toBe(0);
  });
  it("walks a distance on a bearing", () => {
    const [lon, lat] = offset(0, 0, 90, 111_195);
    expect(lon).toBeCloseTo(1, 2);
    expect(lat).toBeCloseTo(0, 5);
  });
});

describe("landforms", () => {
  it("moves life zones with latitude", () => {
    expect(treeline(0)).toBeGreaterThan(treeline(45));
    expect(treeline(-45)).toBe(treeline(45));
    expect(snowline(60)).toBeLessThan(snowline(10));
    expect(zoneAt(5000, 45, 1000)).toBe("snow");
    expect(zoneAt(2400, 45, 1000)).toBe("alpine");
    expect(zoneAt(1500, 45, 1000)).toBe("forest");
    expect(zoneAt(1500, 0, 1000)).toBe("forest");
    expect(zoneAt(1080, 45, 1000)).toBe("valley");
    expect(Object.keys(ZONES)).toHaveLength(5);
  });
  it("zones the seafloor", () => {
    expect(seaZone(10)).toBeNull();
    expect(seaZone(-100)).toBe("shelf");
    expect(seaZone(-1500)).toBe("slope");
    expect(seaZone(-4500)).toBe("abyss");
    expect(seaZone(-9000)).toBe("trench");
  });
  it("measures a cone", () => {
    const g = gridOf((x, y) => 3000 - 100 * Math.hypot(x, y));
    const st = reliefStats(g, N, 100, 45);
    expect(st.summit).toBe(3000);
    expect(st.relief).toBeCloseTo(100 * Math.hypot(10, 10), 0);
    expect(st.meanSlope).toBeCloseTo(45, 0); // 100 m up per 100 m
    // A cone faces every way about equally.
    for (const a of st.aspects) expect(a).toBeGreaterThan(0.08);
    expect(st.hypsometry[0]).toBe(1);
    expect(st.hypsometry[10]).toBeLessThan(0.01);
  });
  it("sizes up a crater", () => {
    const prof = (k: number) => Array.from({ length: 40 }, (_, i) => (i <= 20 ? 1000 + (i / 20) ** 2 * 400 + k : 1400 - (i - 20) * 5 + k));
    const cr = craterShape([0, 1, 2, 3].map(prof), 50);
    expect(cr.diameter).toBe(2000);
    expect(cr.depth).toBeCloseTo(400, -1);
    expect(cr.type).toBe("simple");
  });
});

describe("trace, size, OSM", () => {
  it("joins river pieces in order", () => {
    const pieces: [number, number][][] = [[[2, 0], [3, 0]], [[0, 0], [1, 0]], [[2, 0], [1, 0]]];
    expect(chain(pieces, 1)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });
  it("moves a shape without changing its size", () => {
    const sq: [number, number][] = [[0, 60], [1, 60], [1, 61], [0, 61]];
    const [moved] = moveRings([sq], [0, 0]);
    expect(areaM2(moved) / areaM2(sq)).toBeCloseTo(1, 1);
    expect(haversine(moved[0][0], moved[0][1], moved[1][0], moved[1][1]) / haversine(0, 60, 1, 60)).toBeCloseTo(1, 1);
    expect(compare(59.1e6 * 3)).toBe("about 3.0 Manhattans");
    expect(compare(10_000)).toBe("about 1.4 football pitches");
  });
  it("joins multipolygon pieces into rings", () => {
    const rings = joinRings([[[0, 0], [1, 0], [1, 1]], [[1, 1], [0, 1], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]]);
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
  });
  it("keeps one archive image per year", () => {
    const r = (d: string) => ({ id: 1, date: d, url: "" });
    expect(perYear([r("2014-02-20"), r("2014-06-11"), r("2015-01-01"), r("2016-03-03"), r("2016-09-09")]).map((x) => x.date)).toEqual(["2014-02-20", "2015-01-01", "2016-03-03"]);
  });
});
