import { describe, expect, it } from "vitest";
import { along, areaM2, crossings, inside, metres, pathLength } from "../src/work/geo";
import { circle, countInside, legs, lengthInside, profileStats, type PlanItem } from "../src/work/planModel";

const stop = (id: string, lon: number, lat: number): PlanItem => ({ id, kind: "point", pts: [[lon, lat]], name: id });

describe("work geometry", () => {
  it("measures distances, paths and areas", () => {
    expect(metres([0, 0], [0, 1]) / 1000).toBeCloseTo(111.2, 0);
    expect(pathLength([[0, 0], [0, 1], [1, 1]]) / 1000).toBeCloseTo(222.4, 0);
    // A 0.01° square at the equator is about 1.236 km².
    expect(areaM2([[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]]) / 1e6).toBeCloseTo(1.236, 2);
    expect(inside([[0, 0], [1, 0], [1, 1], [0, 1]], [0.5, 0.5])).toBe(true);
    expect(along([[0, 0], [0, 2]], 3)).toEqual([[0, 0], [0, 1], [0, 2]]);
  });

  it("counts crossings", () => {
    const line = { xy: [0.5, -1, 0.5, 1], bbox: [0.5, -1, 0.5, 1] as [number, number, number, number] };
    expect(crossings([[0, 0], [1, 0]], [line])).toBe(1);
    expect(crossings([[0, 0], [0.2, 0]], [line])).toBe(0);
  });
});

describe("plans", () => {
  it("works out trip legs by mode", () => {
    const l = legs([stop("A", 0, 0), stop("B", 0, 1)], "drive");
    expect(l[0].straight / 1000).toBeCloseTo(111.2, 0);
    expect(l[0].route / l[0].straight).toBeCloseTo(1.3);
    expect(l[0].hours).toBeCloseTo((111.2 * 1.3) / 60, 1);
    expect(legs([stop("A", 0, 0), stop("B", 10, 0)], "fly")[0].hours).toBeGreaterThan(2.5);
  });

  it("measures what's inside a zone", () => {
    const zone: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(countInside(zone, [{ lon: 1, lat: 1, mw: 100 }, { lon: 3, lat: 1, mw: 50 }, { lon: 0.5, lat: 1.5, mw: 20 }], (p) => p.mw)).toEqual({ count: 2, total: 120 });
    const rail = { xy: [-1, 1, 3, 1], bbox: [-1, 1, 3, 1] as [number, number, number, number] };
    expect(lengthInside(zone, [rail]) / 1000).toBeCloseTo(metres([0, 1], [2, 1]) / 1000, 0); // only the part inside
    const r = circle([0, 0], 1000);
    expect(r).toHaveLength(64);
    expect(metres([0, 0], r[16])).toBeCloseTo(1000, -1);
  });

  it("summarises an elevation profile", () => {
    const p = profileStats([[0, 0], [0, 0.009]], [100, 150, 120]);
    expect(p.min).toBe(100);
    expect(p.max).toBe(150);
    expect(p.climb).toBe(50);
    expect(p.descent).toBe(30);
    expect(p.steepest).toBeCloseTo((50 / 500) * 100, 0);
  });
});
