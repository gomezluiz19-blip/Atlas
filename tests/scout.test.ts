import { describe, expect, it } from "vitest";
import { classify, DRAWS, industry, INDUSTRIES, kindsOf, metres, nearestFirst, query, scoreSite, selectors, toPois, type Poi } from "../src/work/scoutModel";

const food = industry("food")!;
const at = { lon: -0.08, lat: 51.51 };
/** A place `m` metres east of `at`. */
const east = (id: string, kind: string, m: number): Poi => ({ id, name: id, kind, lat: at.lat, lon: at.lon + m / (111_320 * Math.cos((at.lat * Math.PI) / 180)), tags: {} });

describe("industries", () => {
  it("each has finds, weights for every kind it weighs, and a consumer, pro and (mostly) services step", () => {
    for (const ind of INDUSTRIES) {
      expect(ind.explore.finds.length).toBeGreaterThanOrEqual(5);
      const ids = new Set(kindsOf(ind).map((f) => f.id));
      for (const k of Object.keys(ind.scout.weights)) expect(ids.has(k), `${ind.id}: ${k}`).toBe(true);
    }
    expect(INDUSTRIES.filter((i) => i.sector).length).toBe(8);
  });
  it("classifies OSM tags to the first kind that matches", () => {
    const kinds = kindsOf(food);
    expect(classify({ amenity: "restaurant", cuisine: "thai" }, kinds)?.id).toBe("restaurant");
    expect(classify({ shop: "bakery" }, kinds)?.id).toBe("market");
    expect(classify({ railway: "station" }, kinds)?.id).toBe("transit");
    expect(classify({ office: "lawyer" }, kinds)?.id).toBe("offices");
    expect(classify({ amenity: "bench" }, kinds)).toBeNull();
  });
  it("builds Overpass queries for a view box or a walk around a point", () => {
    expect(selectors(DRAWS.slice(1, 2))).toEqual(['nwr["office"]']);
    const q = query(kindsOf(food), { lon: -0.08, lat: 51.51, m: 650 });
    expect(q).toContain('nwr["amenity"~"^(restaurant)$"](around:650,51.51000,-0.08000);');
    expect(query(food.explore.finds, { bbox: "51,0,52,1" })).toContain('nwr["amenity"~"^(cafe)$"](51,0,52,1);');
  });
  it("turns elements into places, using centres for ways and the kind's name when unnamed", () => {
    const p = toPois([{ type: "way", id: 1, center: { lat: 1, lon: 2 }, tags: { amenity: "cafe" } }, { type: "node", id: 2, lat: 1, lon: 2, tags: { amenity: "bench" } }], kindsOf(food));
    expect(p).toEqual([{ id: "way1", name: "Café", lon: 2, lat: 1, kind: "cafe", tags: { amenity: "cafe" } }]);
  });
});

describe("site scoring", () => {
  it("measures metres in a city", () => {
    expect(Math.round(metres(at, east("x", "cafe", 300)))).toBe(300);
    expect(nearestFirst([east("b", "cafe", 500), east("a", "cafe", 100)], at).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("counts only what's within a walk, rewards draws and marks down rivals", () => {
    const busy = [east("s1", "transit", 100), east("s2", "transit", 300), east("h", "visitors", 200), east("o", "offices", 250), east("far", "transit", 2000)];
    const rivals = [east("r1", "restaurant", 80), east("r2", "restaurant", 150), east("r3", "restaurant", 400), east("r4", "restaurant", 450), east("r5", "restaurant", 500), east("r6", "restaurant", 550)];
    const a = scoreSite(food, at, busy, "restaurant"), b = scoreSite(food, at, [...busy, ...rivals], "restaurant"), c = scoreSite(food, at, [], "restaurant");
    expect(a.counts.transit).toBe(2);
    expect(a.score).toBeGreaterThan(c.score);
    expect(b.score).toBeLessThan(a.score);
    expect(b.rivals).toBe(6);
    expect(Math.round(b.nearest!)).toBe(80);
    expect(b.lines[0]).toMatch(/crowded/);
    expect(c.lines).toContain("No station or stop within a walk.");
    expect(c.score).toBe(50);
  });
  it("counts like-for-like in your favour where industries cluster", () => {
    const fashion = industry("fashion")!;
    const street = [east("b1", "clothes", 50), east("b2", "clothes", 120), east("b3", "clothes", 200)];
    expect(scoreSite(fashion, at, street, "clothes").score).toBeGreaterThan(scoreSite(fashion, at, [], "clothes").score);
    expect(scoreSite(fashion, at, street, "clothes").lines[0]).toMatch(/scene/);
  });
  it("stays between 0 and 100", () => {
    const lots = Array.from({ length: 400 }, (_, i) => east(`t${i}`, "transit", i % 500));
    const s = scoreSite(food, at, lots, "restaurant").score;
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThan(80);
  });
});
