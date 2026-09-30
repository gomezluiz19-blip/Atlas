import { describe, expect, it } from "vitest";
import { composeLens } from "../src/lenses/compose";
import { darkness, lensFromJson, moon } from "../src/lenses/custom";
import { DEMO_LENSES } from "../src/lenses/library";
import { DEMO_PROFILES } from "../src/social/demo";
import { countriesOf, profileFromJson, slugHandle, topSpots } from "../src/social/model";

describe("the lens designer (no AI)", () => {
  it("knows the common passions", () => {
    const birds = composeLens("birdwatching near the estuary")!;
    expect(birds.name).toBe("Birdwatching");
    expect(birds.blocks.map((b) => b.type)).toEqual(expect.arrayContaining(["species", "places", "weather"]));
    expect(composeLens("is it a surf day?")!.blocks.some((b) => b.type === "marine")).toBe(true);
    expect(composeLens("stargazing tonight")!.blocks[0].type).toBe("sky");
  });
  it("builds from kinds of place, and doesn't mistake words inside words", () => {
    const kids = composeLens("where to take the kids: playgrounds, ice cream and toilets")!;
    const tags = kids.blocks.flatMap((b) => (b.type === "places" ? b.tags : []));
    expect(tags).toEqual(expect.arrayContaining(["leisure=playground", "amenity=ice_cream", "amenity=toilets"]));
    // "start" isn't stars, "every" isn't EV charging, "rocket" isn't rocks.
    const x = composeLens("start every morning with coffee near the rocket museum")!;
    expect(x.blocks.some((b) => b.type === "sky")).toBe(false);
    expect(x.blocks.some((b) => b.type === "places" && b.tags.includes("amenity=charging_station"))).toBe(false);
    expect(x.name).toBe("Coffee crawl");
    expect(x.blocks.some((b) => b.type === "places" && b.tags.includes("tourism=museum"))).toBe(true);
    expect(x.blurb).toMatch(/museums/i);
  });
  it("says so when it can't make one", () => {
    expect(composeLens("qwerty zxcv")).toBeNull();
  });
});

describe("lens recipes from outside", () => {
  it("drops what doesn't belong and clamps the rest", () => {
    const d = lensFromJson({ name: "X", radiusKm: 999, blocks: [{ type: "places", tags: ["amenity=cafe", "bad tag\"];out;"] }, { type: "nope" }, { type: "species", group: "dragons", days: 9999 }] })!;
    expect(d.radiusKm).toBe(30);
    expect(d.blocks).toHaveLength(2);
    expect(d.blocks[0]).toMatchObject({ type: "places", tags: ["amenity=cafe"] });
    expect(d.blocks[1]).toMatchObject({ type: "species", group: "all", days: 365 });
    expect(lensFromJson({ name: "Empty", blocks: [] })).toBeNull();
  });
  it("ships example lenses that pass their own checks", () => {
    for (const d of DEMO_LENSES) expect(lensFromJson(d)?.blocks.length).toBe(d.blocks.length);
  });
});

describe("the sky", () => {
  it("knows the moon", () => {
    expect(moon(Date.UTC(2000, 0, 6, 18, 14)).name).toBe("New moon");
    expect(moon(Date.UTC(2024, 0, 25, 17, 54)).lit).toBeGreaterThan(0.97); // full moon, 25 Jan 2024
  });
  it("finds real darkness, or none at midsummer in the far north", () => {
    expect(darkness(Date.UTC(2026, 11, 1, 12), 51.5, 0)).not.toBeNull();
    expect(darkness(Date.UTC(2026, 5, 21, 12), 64, -21)).toBeNull(); // Reykjavík in June
  });
});

describe("profiles", () => {
  it("makes handles from anything", () => {
    expect(slugHandle("@Zoë O'Brien!")).toBe("zoeobrien");
    expect(slugHandle("..maya..")).toBe("maya");
  });
  it("keeps the example people valid", () => {
    for (const p of DEMO_PROFILES) {
      const back = profileFromJson(p)!;
      expect(back.spots).toHaveLength(p.spots.length);
      expect(topSpots(back).length).toBe(p.top.length);
      expect(p.top.length).toBeLessThanOrEqual(8);
    }
    expect(countriesOf(DEMO_PROFILES.find((p) => p.handle === "kenjiskies")!)).toBe(7);
  });
  it("rejects a damaged page from a link", () => {
    expect(profileFromJson({ name: "No handle" })).toBeNull();
    const p = profileFromJson({ handle: "a1", name: "A", spots: [{ id: "x", name: "Bad", lon: 500, lat: 0 }], top: ["x", "missing"] })!;
    expect(p.spots).toHaveLength(0);
    expect(p.top).toHaveLength(0);
  });
});
