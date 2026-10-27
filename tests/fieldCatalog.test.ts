import { describe, expect, it } from "vitest";
import { categoryQuery, FIELDS, layerNames, overpassFilters, searchLink } from "../src/work/fields/catalog";
import { LINES } from "../src/work/workLines";

describe("every field, three layers", () => {
  it("covers every field in Work, each with something to see, a pro desk, and a full set of services", () => {
    for (const l of LINES) {
      const f = FIELDS[l.id];
      expect(f, l.id).toBeTruthy();
      expect(f.everyday.cats.length, l.id).toBeGreaterThanOrEqual(3);
      expect(f.services.cats.length, l.id).toBeGreaterThanOrEqual(8);
      expect(new Set(f.services.cats.map((c) => c.label)).size, `${l.id} has duplicate services`).toBe(f.services.cats.length);
    }
    // Food services is everything, not one niche.
    const food = FIELDS.food.services.cats.map((c) => c.label).join(" | ");
    for (const w of ["distributors", "Refrigeration", "Pest control", "Linen", "Packaging", "payments", "Delivery", "Staffing", "Food safety", "Insurance", "Lawyers", "Waste"]) expect(food).toContain(w);
  });
  it("names the layers the way people say them", () => {
    expect(layerNames("Food")).toEqual({ everyday: "Food", pro: "Food Pro", services: "Food services" });
    expect(layerNames("Freight & trade")).toEqual({ everyday: "Freight & trade", pro: "Freight Pro", services: "Freight services" });
  });
});

describe("finding them on the map", () => {
  it("turns the short tag form into Overpass filters", () => {
    expect(overpassFilters("amenity=restaurant")).toEqual(['["amenity"="restaurant"]']);
    expect(overpassFilters("shop=bakery|deli; craft=brewery")).toEqual(['["shop"~"^(bakery|deli)$"]', '["craft"="brewery"]']);
    expect(overpassFilters("power=generator,generator:source=wind")).toEqual(['["power"="generator"]["generator:source"="wind"]']);
    expect(overpassFilters("club")).toEqual(['["club"]']);
  });
  it("builds a query around a point, and a search where OpenStreetMap has no tag", () => {
    expect(categoryQuery("amenity=cafe", { lon: -0.1, lat: 51.5 }, 2000)).toBe('[out:json][timeout:25];(nwr["amenity"="cafe"](around:2000,51.5000,-0.1000););out center tags 150;');
    expect(searchLink({ label: "Pest control" }, { lon: -0.1, lat: 51.5 })).toBe("https://www.google.com/maps/search/Pest%20control/@51.50000,-0.10000,13z");
  });
  it("writes every tag so Overpass can read it", () => {
    for (const f of Object.values(FIELDS)) for (const c of [...f.everyday.cats, ...f.services.cats]) if (c.tags) for (const g of overpassFilters(c.tags)) expect(g, c.label).toMatch(/^(\["[a-z:_]+"(=|~)?("[^"]+")?\])+$/);
  });
});
