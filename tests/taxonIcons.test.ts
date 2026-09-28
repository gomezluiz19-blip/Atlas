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
  it("reads names before broad groups, in the right kingdom", () => {
    const mammal = [48460, 1, 2, 355675, 40151];
    expect(taxonIcon({ preferred_common_name: "African Bush Elephant", ancestor_ids: mammal })).toBe("elephant");
    expect(taxonIcon({ preferred_common_name: "California Sea Lion", ancestor_ids: mammal })).toBe("seal");
    expect(taxonIcon({ preferred_common_name: "Northern Elephant Seal", iconic_taxon_name: "Mammalia" })).toBe("seal");
    expect(taxonIcon({ preferred_common_name: "Eastern Grey Kangaroo", iconic_taxon_name: "Mammalia" })).toBe("kangaroo");
    expect(taxonIcon({ preferred_common_name: "Plains Zebra", iconic_taxon_name: "Mammalia" })).toBe("horse");
    expect(taxonIcon({ preferred_common_name: "Horse-chestnut", iconic_taxon_name: "Plantae" })).toBe("tree");
    expect(taxonIcon({ preferred_common_name: "Lion's Mane Jellyfish", iconic_taxon_name: "Animalia" })).toBe("jellyfish");
    expect(taxonIcon({ preferred_common_name: "Ochre Sea Star", iconic_taxon_name: "Animalia" })).toBe("starfish");
    expect(taxonIcon({ preferred_common_name: "Giant Green Anemone", iconic_taxon_name: "Animalia" })).toBe("coral");
    expect(taxonIcon({ preferred_common_name: "Wood Anemone", iconic_taxon_name: "Plantae" })).toBe("plant");
    expect(taxonIcon({ preferred_common_name: "Elephant Ear", iconic_taxon_name: "Plantae" })).toBe("plant");
    expect(taxonIcon({ preferred_common_name: "Giant Kelp", iconic_taxon_name: "Chromista" })).toBe("kelp");
    expect(taxonIcon({ preferred_common_name: "Something", iconic_taxon_name: "Chromista" })).toBe("kelp");
    expect(taxonIcon({ preferred_common_name: "Emperor Penguin", ancestor_ids: [48460, 1, 2, 355675, 3] })).toBe("penguin");
    expect(taxonIcon({ preferred_common_name: "Herring Gull", iconic_taxon_name: "Aves" })).toBe("gull");
    expect(taxonIcon({ preferred_common_name: "American Alligator", iconic_taxon_name: "Reptilia" })).toBe("crocodile");
    expect(taxonIcon({ preferred_common_name: "Tiger Lily", iconic_taxon_name: "Plantae" })).toBe("lily");
    expect(taxonIcon({ preferred_common_name: "Riverbank Grape", iconic_taxon_name: "Plantae" })).toBe("vine");
    expect(taxonIcon({ preferred_common_name: "Wolf Spider", ancestor_ids: [48460, 1, 47120, 245097, 47119, 47118] })).toBe("spider");
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
