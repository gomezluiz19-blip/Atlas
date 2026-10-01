import { describe, expect, it } from "vitest";
import { bestMode, compareLine, countNeeds, estimateKm, estimateMinutes, estimateRings, fmtMin, isochroneUrl, matrixUrl, needsQuery, needsScore, parseIsochrone, parseMatrix, reachRose, areaKm2, thin } from "../src/travel/reach";

const c = { lon: -73.98, lat: 40.75 };

describe("reach", () => {
  it("asks the router for the right mode and times", () => {
    const u = decodeURIComponent(isochroneUrl(c, "bike", [5, 10, 15, 20, 30]));
    expect(u).toContain('"costing":"bicycle"');
    expect(u).toContain('"contours":[{"time":5},{"time":10},{"time":15},{"time":20}]');
    expect(decodeURIComponent(matrixUrl(c, [{ lon: 0, lat: 0 }], "walk"))).toContain('"costing":"pedestrian"');
  });
  it("reads isochrones: the largest piece, smallest time first", () => {
    const sq = (r: number) => [[c.lon - r, c.lat - r], [c.lon + r, c.lat - r], [c.lon + r, c.lat + r], [c.lon - r, c.lat + r], [c.lon - r, c.lat - r]];
    const r = parseIsochrone({ features: [
      { properties: { contour: 20 }, geometry: { type: "MultiPolygon", coordinates: [[sq(0.001)], [sq(0.05)]] } },
      { properties: { contour: 10 }, geometry: { type: "Polygon", coordinates: [sq(0.02)] } },
    ] });
    expect(r.map((x) => x.minutes)).toEqual([10, 20]);
    expect(areaKm2(r[1].ring)).toBeGreaterThan(areaKm2(r[0].ring));
  });
  it("estimates circles from typical speeds when the router is away", () => {
    const [ring] = estimateRings(c, "walk", [15]);
    expect(ring.estimated).toBe(true);
    const rose = reachRose(ring.ring, c, 8);
    for (const km of rose) expect(km).toBeCloseTo(estimateKm("walk", 15), 1);
    expect(estimateKm("drive", 15)).toBeGreaterThan(estimateKm("bike", 15));
  });
  it("traces how far a shape reaches in each direction", () => {
    // A box 2 km east, 1 km elsewhere.
    const k = Math.cos((c.lat * Math.PI) / 180);
    const e = 2 / (111.32 * k), w = 1 / (111.32 * k), n = 1 / 110.57;
    const rose = reachRose([[c.lon - w, c.lat - n], [c.lon + e, c.lat - n], [c.lon + e, c.lat + n], [c.lon - w, c.lat + n]], c, 4);
    expect(rose[0]).toBeCloseTo(1, 2); // north
    expect(rose[1]).toBeCloseTo(2, 2); // east
    expect(rose[3]).toBeCloseTo(1, 2); // west
  });
  it("crowns walking or biking when the car is barely faster", () => {
    expect(bestMode({ walk: 12, bike: 6, drive: 4 })).toBe("bike");
    expect(bestMode({ walk: 7, bike: 4, drive: 4 })).toBe("walk");
    expect(bestMode({ walk: 90, bike: 30, drive: 12 })).toBe("drive");
    expect(bestMode({ walk: null, bike: null, drive: null })).toBe(null);
  });
  it("reads a matrix, keeping gaps", () => {
    expect(parseMatrix({ sources_to_targets: [[{ time: 600 }, { time: null }]] }, 2)).toEqual([10, null]);
    expect(estimateMinutes(c, { lon: c.lon, lat: c.lat + 0.05 }, "walk")).toBeGreaterThan(80);
  });
  it("words the comparison and the times", () => {
    expect(compareLine({ walk: 2, bike: 30, drive: 300 }, 15)).toBe("In 15 minutes a bike covers 15× the ground you can walk, and a car 10× what you can bike.");
    expect(fmtMin(0.5)).toBe("<1 min");
    expect(fmtMin(125)).toBe("2 h 05");
  });
  it("runs the 15-minute check", () => {
    const ring = estimateRings(c, "walk", [15], 200)[0].ring;
    expect(thin(ring).length).toBe(60);
    expect(needsQuery(ring)).toContain('poly:"');
    const counts = countNeeds([{ tags: { shop: "supermarket" } }, { tags: { amenity: "school" } }, { tags: { leisure: "park" } }, { tags: { amenity: "cafe" } }, { tags: { highway: "bus_stop" } }, { tags: { foo: "bar" } }]);
    expect(counts.food).toBe(1);
    expect(needsScore(counts)).toEqual({ met: 5, of: 8, word: "Most of daily life on foot" });
  });
});
