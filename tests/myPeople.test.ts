import { describe, expect, it } from "vitest";
import { colorOf, farText, grouped, initials, newPerson, partOfDay, timeThere, type Person } from "../src/people/mine";
import { busyAt, busyWord, centres, gatherFrom, gatherQuery, heatColor, heatGrid, kindOf, peakHour, typicalBusy } from "../src/people/gather";
import { convert, homeCurrency } from "../src/topics/rates";

const person = (id: string, circle: Person["circle"], lon: number, lat: number, added = 0): Person => ({ id, name: id, circle, lon, lat, where: "", added });

describe("my people", () => {
  it("makes initials", () => {
    expect(initials("Ana María López")).toBe("AL");
    expect(initials("mom")).toBe("M");
    expect(initials("  ")).toBe("?");
  });
  it("colours family warm and others cool, steadily", () => {
    expect(colorOf({ id: "x1", circle: "family" })).toBe(colorOf({ id: "x1", circle: "family" }));
    expect(["#d1495b", "#e07a3f", "#c98a12", "#b85c8f", "#a2543a"]).toContain(colorOf({ id: "a", circle: "family" }));
    expect(["#3563d6", "#2a9d8f", "#6a5acd", "#2f8f5b", "#4f86c6"]).toContain(colorOf({ id: "a", circle: "others" }));
  });
  it("groups family first, nearest first", () => {
    const home = { lon: -73.9, lat: 41.2 };
    const g = grouped([person("far", "family", 2.35, 48.85), person("near", "family", -73.95, 41.25), person("friend", "others", -74, 40.7)], home);
    expect(g.family.map((p) => p.id)).toEqual(["near", "far"]);
    expect(g.others.map((p) => p.id)).toEqual(["friend"]);
  });
  it("gives their time and whether they're likely up", () => {
    const t = timeThere("Asia/Tokyo", new Date(Date.UTC(2026, 9, 9, 12, 0)));
    expect(t?.clock).toBe("21:00");
    expect(partOfDay(3).awake).toBe(false);
    expect(partOfDay(21).word).toBe("Late evening");
    expect(timeThere("Not/AZone", new Date())).toBeNull();
  });
  it("says distances plainly and cleans a new person", () => {
    expect(farText(0.1)).toBe("Here");
    expect(farText(3.24)).toBe("3.2 km");
    expect(farText(5800.4)).toBe("5,800 km");
    const p = newPerson({ name: "  Grandma Rose ", circle: "family", relation: " ", lon: 1, lat: 2, where: " Lisbon " }, 1000);
    expect(p).toMatchObject({ name: "Grandma Rose", relation: undefined, where: "Lisbon", added: 1000 });
  });
});

describe("where people gather", () => {
  it("knows gathering places by kind", () => {
    expect(kindOf({ amenity: "cafe" })).toBe("cafe");
    expect(kindOf({ shop: "supermarket" })).toBe("grocery");
    expect(kindOf({ shop: "clothes" })).toBe("shop");
    expect(kindOf({ leisure: "park" })).toBe("park");
    expect(kindOf({ amenity: "bank" })).toBeNull();
  });
  it("follows each kind's day, and a closed place is empty", () => {
    const tueLunch = new Date(2026, 9, 6, 12, 30), tueLate = new Date(2026, 9, 6, 23, 0), satNoon = new Date(2026, 9, 10, 13, 0);
    expect(typicalBusy("food", tueLunch)).toBeGreaterThan(0.7);
    expect(typicalBusy("cafe", tueLate)).toBeLessThan(0.1);
    expect(typicalBusy("park", satNoon)).toBeGreaterThan(typicalBusy("park", new Date(2026, 9, 6, 13, 0)));
    expect(busyAt({ kind: "food", hours: "Mo-Fr 17:00-22:00" }, tueLunch)).toBe(0);
    expect(busyWord(0.9)).toBe("Very busy");
    expect(busyWord(0)).toBe("Closed or empty");
    expect(peakHour(["food", "food", "drink"], false)).toBe(19);
  });
  it("reads places and names from the map, and finds centres of life", () => {
    const els = [
      ...Array.from({ length: 8 }, (_, i) => ({ type: "node" as const, id: i, lat: 41.26 + i * 0.0003, lon: -73.94, tags: { amenity: i % 2 ? "restaurant" : "cafe", name: `Spot ${i}` } })),
      ...Array.from({ length: 5 }, (_, i) => ({ type: "node" as const, id: 100 + i, lat: 41.30 + i * 0.0003, lon: -73.90, tags: { shop: "clothes", name: `Shop ${i}` } })),
      { type: "node" as const, id: 900, lat: 41.261, lon: -73.941, tags: { place: "village", name: "Verplanck" } },
      { type: "node" as const, id: 901, lat: 41.301, lon: -73.901, tags: { place: "town", name: "Croton" } },
      { type: "node" as const, id: 902, lat: 41.2, lon: -73.9, tags: { amenity: "bank", name: "Bank" } },
    ];
    const { spots, names } = gatherFrom(els);
    expect(spots).toHaveLength(13);
    expect(names.map((n) => n.name)).toEqual(["Verplanck", "Croton"]);
    const cs = centres(spots, names);
    expect(cs.map((c) => c.name)).toEqual(["Verplanck", "Croton"]);
    expect(cs[0].count).toBe(8);
    expect(cs[0].mix.map(([k]) => k).sort()).toEqual(["cafe", "food"]);
  });
  it("builds a query and a heat grid", () => {
    expect(gatherQuery({ lon: -73.94, lat: 41.26 }, 1500)).toContain('nwr(around:1500,41.26000,-73.94000)["shop"]["name"]');
    const box = { west: -1, east: 1, south: -1, north: 1 };
    const g = heatGrid([{ lon: 0, lat: 0, kind: "food", osm: "N1", key: "amenity", value: "restaurant" }], box, 20, 20, new Date(2026, 9, 6, 19, 0), 4);
    expect(g[10 * 20 + 10]).toBe(1);
    expect(g[0]).toBe(0);
    expect(heatColor(0)[3]).toBe(0);
    expect(heatColor(1)).toEqual([255, 230, 109, 240]);
  });
});

describe("money", () => {
  const perUsd = { USD: 1, EUR: 0.9, JPY: 150 };
  it("converts through the dollar", () => {
    expect(convert(100, "EUR", "JPY", perUsd)).toBeCloseTo(16666.67, 1);
    expect(convert(1, "USD", "XXX", perUsd)).toBeNull();
  });
  it("guesses the visitor's currency from their region", () => {
    expect(homeCurrency("en-GB")).toBe("GBP");
    expect(homeCurrency("de-DE")).toBe("EUR");
    expect(homeCurrency("en")).toBe("USD");
  });
});
