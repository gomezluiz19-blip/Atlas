import { describe, expect, it } from "vitest";
import { bands, bearingDeg, inSeason, mainDirection, SOURCES, sourcesQuery, toSources } from "../src/work/sourcing";

const site = { lon: 0, lat: 50 };
const el = (id: number, lon: number, lat: number, tags: Record<string, string>) => ({ type: "node", id, lon, lat, tags });

describe("made and grown nearby", () => {
  it("queries each set's kinds within its radius", () => {
    const q = sourcesQuery(SOURCES.food, 0, 50);
    expect(q).toContain('nwr["landuse"~"^(orchard)$"](around:50000,50.00000,0.00000);');
    expect(q).toContain('nwr["craft"~"^(cheese_maker|dairy)$"]');
  });
  it("sorts sources by distance with their bearing, dropping what's beyond reach", () => {
    const src = toSources([el(1, 0, 50.1, { landuse: "orchard" }), el(2, 0.2, 50, { craft: "winery", name: "Clos" }), el(3, 0, 51, { shop: "farm" }), el(4, 0, 50.05, { amenity: "bench" })], SOURCES.food, site);
    expect(src.map((s) => s.id)).toEqual(["node1", "node2"]);
    expect(Math.round(src[0].bearing)).toBe(0);
    expect(Math.round(src[1].bearing)).toBe(90);
    expect(src[1].name).toBe("Clos");
    expect(bands(src).find((b) => b.kind === "orchard")!.within).toEqual([0, 1, 1]);
    expect(Math.round(bearingDeg(site, { lon: 0, lat: 49 }))).toBe(180);
  });
  it("says which way most of it lies", () => {
    const west = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, name: "", lon: -0.3, lat: 50, kind: "farm", tags: {}, km: 20 + i, bearing: 270 }));
    expect(mainDirection(west)).toBe("west");
    expect(mainDirection(west.slice(0, 3))).toBeNull();
  });
  it("tells what's in season from the local climate", () => {
    const london = [5, 5.5, 7.5, 10, 13, 16.5, 19, 18.5, 15.5, 12, 8, 5.5];
    const names = (m: number) => inSeason(london, m).map((p) => p.id);
    expect(names(6)).toContain("tomatoes");
    expect(names(4)).toContain("asparagus");
    expect(names(9)).toContain("apples");
    expect(names(0)).toContain("roots");
    expect(names(6)).not.toContain("mango");
    const tropics = [26, 27, 28, 29, 29, 28, 27, 27, 27, 27, 26, 26];
    expect(inSeason(tropics, 4).map((p) => p.id)).toContain("mango");
  });
});
