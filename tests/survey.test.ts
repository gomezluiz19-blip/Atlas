import { describe, expect, it } from "vitest";
import { estimateBuilding, newOnes, rectangle, ringKey, surveyLines, tracedBuilding } from "../src/myplaces/survey";
import { contains, footprintM2 } from "../src/myplaces/scene";

describe("hologram survey", () => {
  it("estimates a house-sized building right on the spot", () => {
    const b = estimateBuilding(-77.1, 38.9, "home");
    expect(contains(b.ring, -77.1, 38.9)).toBe(true);
    expect(footprintM2(b)).toBeGreaterThan(100);
    expect(footprintM2(b)).toBeLessThan(140);
    expect(footprintM2(estimateBuilding(-77.1, 38.9, "school"))).toBeGreaterThan(700);
  });
  it("turns a rectangle without changing its size", () => {
    const a = rectangle(0, 50, 20, 10), b = rectangle(0, 50, 20, 10, 30);
    expect(footprintM2({ ring: b } as never)).toBeCloseTo(footprintM2({ ring: a } as never), 0);
  });
  it("makes a traced outline a building of the storeys given", () => {
    const t = tracedBuilding([[0, 0], [0.0001, 0], [0.0001, 0.0001]], 2);
    expect(t.height).toBe(7);
    expect(t.tags.building).toBe("traced");
  });
  it("skips buildings it already has", () => {
    const have = new Set<string>();
    const a = { ring: [[1, 1], [1, 2], [2, 2], [1, 1]], height: 6, heightSource: "guess", tags: {} } as never;
    expect(newOnes(have, [a]).length).toBe(1);
    expect(newOnes(have, [a]).length).toBe(0);
    expect(have.has(ringKey((a as { ring: [number, number][] }).ring))).toBe(true);
  });
  it("says what it has read", () => {
    expect(surveyLines({ ground: "wait", yours: "wait", around: "wait", radiusM: 260 })).toEqual(["◌ Reading the ground…", "◌ Finding your building…", "◌ Surveying 260 m around…"]);
    expect(surveyLines({ ground: "ok", yours: "estimated", around: 0, radiusM: 260 })[1]).toMatch(/isn't mapped yet: estimated/);
    expect(surveyLines({ ground: "flat", yours: "none", around: "failed", radiusM: 260 })).toHaveLength(2);
  });
});

import { sanitize } from "../src/myplaces/store";
describe("saved places keep what you traced", () => {
  it("keeps the outline, storeys, pools and trees through a reload, and drops junk", () => {
    const [p] = sanitize([{ id: "h", name: "Home", kind: "home", lon: -77.2, lat: 38.85, devices: [], footprint: [[-77.2, 38.85], [-77.1999, 38.85], [-77.1999, 38.8501], ["x", 1]], storeys: 2.4, land: { pools: [[[0, 0], [1, 0], [1, 1]], [[0, 0]]], trees: [[1, 2], [500, 2]] } }]);
    expect(p.footprint).toHaveLength(3);
    expect(p.storeys).toBe(2);
    expect(p.land?.pools).toHaveLength(1);
    expect(p.land?.trees).toEqual([[1, 2]]);
    expect(sanitize([{ lon: 0, lat: 0, footprint: [[0, 0]] }])[0].footprint).toBeUndefined();
  });
});
