import { describe, expect, it } from "vitest";
import { combine, describe as say, parseQuery, satisfy, looksLikeSearch } from "../src/answers/criteria";

describe("reading a request", () => {
  it("turns a sentence into conditions", () => {
    const p = parseQuery("sunny south-facing land under 800 m, within 40 km of an airport, no flood risk, far from volcanoes, fast internet");
    const byKey = Object.fromEntries(p.criteria.map((c) => [c.key, c]));
    expect(byKey.sun).toMatchObject({ op: "gt" });
    expect(byKey.aspect).toMatchObject({ op: "dir", value: 180 });
    expect(byKey.elev).toMatchObject({ op: "lt", value: 800 });
    expect(byKey.airport).toMatchObject({ op: "lt", value: 40 });
    expect(byKey.flood).toMatchObject({ op: "lt" });
    expect(byKey.volcano).toMatchObject({ op: "gt" });
    expect(byKey.online).toMatchObject({ op: "gt" });
    expect(byKey.city).toBeUndefined();
  });
  it("converts feet and miles, and says what it can't do yet", () => {
    const p = parseQuery("land above 3000 ft within 20 miles of a city under €200k near good schools");
    expect(p.criteria.find((c) => c.key === "elev")!.value).toBeCloseTo(914, 0);
    expect(p.criteria.find((c) => c.key === "city")!.value).toBeCloseTo(32.2, 1);
    expect(p.notYet.length).toBe(2);
  });
  it("reads north-west facing and quiet countryside", () => {
    const p = parseQuery("quiet north-west facing slopes");
    expect(p.criteria.find((c) => c.key === "aspect")!.value).toBe(315);
    expect(p.criteria.find((c) => c.key === "crowd")).toBeTruthy();
  });
  it("knows a search from a place name", () => {
    expect(looksLikeSearch("find flat land near a river with mild winters")).toBe(true);
    expect(looksLikeSearch("Alexandria, VA")).toBe(false);
  });
});

describe("scoring", () => {
  it("is soft at the edges and exact inside", () => {
    expect(satisfy({ key: "elev", op: "lt", value: 800 }, 500)).toBe(1);
    expect(satisfy({ key: "elev", op: "lt", value: 800 }, 900)).toBeGreaterThan(0.2);
    expect(satisfy({ key: "elev", op: "lt", value: 800 }, 1200)).toBe(0);
    expect(satisfy({ key: "aspect", op: "dir", value: 180 }, 200)).toBe(1);
    expect(satisfy({ key: "aspect", op: "dir", value: 180 }, 0)).toBe(0);
    expect(satisfy({ key: "airport", op: "lt", value: 40 }, NaN)).toBe(0.5);
  });
  it("sinks a place that badly misses any one condition", () => {
    expect(combine([1, 1, 1])).toBe(1);
    expect(combine([1, 1, 0])).toBe(0);
    expect(combine([1, 0.5])).toBeGreaterThan(0.5);
  });
  it("says conditions in words", () => {
    expect(say({ key: "aspect", op: "dir", value: 180 })).toBe("Faces south");
    expect(say({ key: "airport", op: "lt", value: 40 })).toBe("Nearest airport under 40 km");
  });
});

import { bilinear, coastDistances, floodProxy, makeGrid, nearestPolyline, needsOf, pickBest, scoreArea } from "../src/answers/engine";

describe("answers engine", () => {
  it("lays a square-ish grid over the view", () => {
    const a = makeGrid({ w: 0, s: 40, e: 4, n: 42 }, 20);
    expect(a.nx).toBe(20);
    expect(a.ny).toBeGreaterThan(10);
    expect(a.ny).toBeLessThan(20);
    expect(a.cells[0].lon).toBeCloseTo(0.1, 5);
    expect(a.cells[0].lat).toBeLessThan(42);
  });

  it("scores cells, skips the sea and picks spread-out winners", () => {
    const a = makeGrid({ w: 0, s: 0, e: 1, n: 1 }, 10);
    a.cells.forEach((c, i) => { c.v.elev = (i % 10) * 100; c.sea = i % 10 === 9; });
    scoreArea(a, [{ key: "elev", op: "lt", value: 300 }]);
    expect(a.cells[0].score).toBeCloseTo(1);
    expect(a.cells[9].score).toBe(-1);
    expect(a.cells[8].score).toBeLessThan(0.1);
    const best = pickBest(a, 3, 20);
    expect(best.length).toBeGreaterThan(1);
    for (const b of best) expect(b.v.elev).toBeLessThanOrEqual(300);
  });

  it("interpolates a coarse field, ignoring missing corners", () => {
    const box = { w: 0, s: 0, e: 2, n: 2 };
    expect(bilinear([0, 10, 0, 10], 2, 2, box, 1, 1)).toBeCloseTo(5);
    expect(bilinear([0, NaN, 0, 10], 2, 2, box, 1, 1)).toBeCloseTo(10 / 3);
  });

  it("measures to lines and to the sea", () => {
    expect(nearestPolyline([[0, 0, 0, 1]], 0.1, 0.5, 100)).toBeCloseTo(11.1, 0);
    const a = makeGrid({ w: 0, s: 0, e: 1, n: 1 }, 6);
    a.cells.forEach((c) => (c.sea = c.lon < 0.2));
    coastDistances(a, a.cells.filter((c) => c.sea).map((c) => [c.lon, c.lat]), 500);
    const far = a.cells.filter((c) => !c.sea).sort((x, y) => y.lon - x.lon)[0];
    expect(far.v.coast).toBeGreaterThan(80);
  });

  it("reads flood risk from flat ground by water", () => {
    expect(floodProxy({ river: 0.5, slope: 0.5, coast: 100, elev: 200 })).toBeGreaterThan(0.8);
    expect(floodProxy({ river: 20, slope: 10, coast: 100, elev: 200 })).toBeLessThan(0.05);
    expect([...needsOf([{ key: "flood", op: "lt", value: 0.2 }, { key: "temp", op: "gt", value: 15 }])].sort()).toEqual(["climate", "terrain", "water"]);
  });
});
