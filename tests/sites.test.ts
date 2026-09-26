import { describe, expect, it } from "vitest";
import { SITES, sitesFor } from "../src/content/sites";

const THEMES = ["explore", "land", "water", "climate", "plants", "animals", "built", "countries"];

describe("curated sites", () => {
  it("covers every theme with at least ten places", () => {
    for (const id of THEMES) {
      const n = sitesFor(id).flatMap((c) => c.sites).length;
      expect(n, id).toBeGreaterThanOrEqual(10);
    }
  });

  it("has valid coordinates, radii and text", () => {
    for (const [id, cols] of Object.entries(SITES))
      for (const c of cols)
        for (const s of c.sites) {
          const at = `${id}/${s.name}`;
          expect(Math.abs(s.lat), at).toBeLessThanOrEqual(90);
          expect(Math.abs(s.lon), at).toBeLessThanOrEqual(180);
          expect(s.radius, at).toBeGreaterThan(100);
          expect(s.why.length, at).toBeGreaterThan(10);
          expect(s.why.length, at).toBeLessThan(80);
        }
  });

  it("has no duplicate names within a theme", () => {
    for (const [id, cols] of Object.entries(SITES)) {
      const names = cols.flatMap((c) => c.sites.map((s) => s.name));
      expect(new Set(names).size, id).toBe(names.length);
    }
  });
});
