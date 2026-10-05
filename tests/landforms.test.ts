import { describe, expect, it } from "vitest";
import { FEATURES } from "../src/content/features";
import { LANDFORMS } from "../src/content/landforms";
import { FEATURE_COLOR } from "../src/content/kindColor";
import { SITES } from "../src/content/sites";

describe("the Earth's great shapes", () => {
  it("are all in the feature set, well formed", () => {
    for (const f of LANDFORMS) {
      expect(FEATURES).toContain(f);
      expect(Math.abs(f.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(f.lon)).toBeLessThanOrEqual(180);
      expect(f.facts.length).toBeGreaterThan(0);
      for (const [k, v] of f.facts) { expect(k).not.toBe(""); expect(v).not.toBe(""); }
      expect(f.blurb).toMatch(/[.!]$/);
      expect(FEATURE_COLOR[f.kind]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("covers every new kind, with no name told twice", () => {
    const kinds = new Set(LANDFORMS.map((f) => f.kind));
    for (const k of ["glacier", "island", "reef", "cave", "range", "plateau", "wetland", "rift"]) expect(kinds).toContain(k);
    const names = FEATURES.map((f) => `${f.kind}:${f.name}`);
    expect(new Set(names).size).toBe(names.length);
  });
  it("puts a few anchors where they belong", () => {
    const at = (n: string) => FEATURES.find((f) => f.name === n)!;
    expect(at("Great Barrier Reef").lat).toBeLessThan(-10);
    expect(at("Þingvellir").lat).toBeCloseTo(64.26, 1);
    expect(at("Mammoth Cave").lon).toBeCloseTo(-86.1, 1);
    expect(at("Antarctic Plateau").lat).toBeLessThan(-80);
  });
  it("gives each new kind its own collection of places to start from", () => {
    const titles = Object.values(SITES).flat().map((c) => c.title);
    for (const t of ["Mountain ranges", "Where the plates meet", "Caves", "Islands", "Ice", "Coral reefs", "Wetlands and deltas"]) expect(titles).toContain(t);
  });
});
