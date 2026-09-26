import { describe, expect, it } from "vitest";
import { TAXON_ICONS, taxonIcon } from "../src/ui/taxonIcons";

describe("taxonIcon", () => {
  it("prefers the most specific known ancestor", () => {
    expect(taxonIcon({ id: 1, ancestor_ids: [48460, 1, 2, 355675, 3, 19350] })).toBe("owl");
    expect(taxonIcon({ id: 1, ancestor_ids: [48460, 1, 3, 7251] })).toBe("bird");
    expect(taxonIcon({ id: 1, ancestry: "48460/1/47120/372739/47158/184884/47157" })).toBe("butterfly");
    expect(taxonIcon({ id: 136329 })).toBe("conifer");
  });
  it("falls back to common-name keywords, then the iconic group", () => {
    expect(taxonIcon({ preferred_common_name: "Red-tailed Hawk", iconic_taxon_name: "Aves" })).toBe("raptor");
    expect(taxonIcon({ preferred_common_name: "Western Rattlesnake", iconic_taxon_name: "Reptilia" })).toBe("snake");
    expect(taxonIcon({ preferred_common_name: "Ponderosa Pine", iconic_taxon_name: "Plantae" })).toBe("conifer");
    expect(taxonIcon({ preferred_common_name: "Two-needle Pinyon", iconic_taxon_name: "Plantae" })).toBe("conifer");
    expect(taxonIcon({ preferred_common_name: "Saguaro", iconic_taxon_name: "Plantae" })).toBe("cactus");
    expect(taxonIcon({ preferred_common_name: "Bighorn Sheep", iconic_taxon_name: "Mammalia" })).toBe("deer");
    expect(taxonIcon({ preferred_common_name: "Something obscure", iconic_taxon_name: "Amphibia" })).toBe("frog");
    expect(taxonIcon({})).toBe("plant");
  });
  it("has well-formed SVG for every icon", () => {
    for (const [k, v] of Object.entries(TAXON_ICONS)) {
      expect(v.startsWith("<svg"), k).toBe(true);
      expect(v.endsWith("</svg>"), k).toBe(true);
      expect(v.includes("NaN"), k).toBe(false);
    }
    expect(Object.keys(TAXON_ICONS).length).toBeGreaterThanOrEqual(40);
  });
});
