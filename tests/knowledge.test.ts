import { describe, expect, it } from "vitest";
import { BREEDS, CARE, findBreed } from "../src/work/breeds";
import { SPECIES } from "../src/work/flockModel";
import { CROP_GROUPS, CROPS } from "../src/work/growModel";

describe("breed library", () => {
  it("covers the farm and pet species with sensible weights", () => {
    for (const id of ["cattle", "sheep", "goat", "pig", "horse", "chicken", "dog", "cat", "rabbit"]) expect(BREEDS[id].length).toBeGreaterThan(5);
    for (const [sp, list] of Object.entries(BREEDS)) {
      expect(SPECIES.some((s) => s.id === sp)).toBe(true);
      for (const b of list) { expect(b.kg).toBeGreaterThan(0.3); expect(b.kg).toBeLessThan(1000); }
      expect(new Set(list.map((b) => b.name)).size).toBe(list.length);
    }
    expect(findBreed("sheep", " suffolk ")?.use).toBe("meat");
  });
  it("offers routine care with intervals", () => {
    for (const list of Object.values(CARE)) for (const c of list) expect(c.every).toBeGreaterThanOrEqual(7);
  });
});

describe("crop library", () => {
  it("gives every crop a group, valid stages and coefficients", () => {
    expect(CROPS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CROPS.map((c) => c.id)).size).toBe(CROPS.length);
    for (const c of CROPS) {
      expect(CROP_GROUPS).toContain(c.group);
      expect([5, 6]).toContain(c.stages.length);
      for (const k of c.kc) { expect(k).toBeGreaterThan(0.1); expect(k).toBeLessThan(1.4); }
      if (c.gdd) expect(c.gdd[0]).toBeLessThanOrEqual(c.gdd[1]);
      if (c.base === null) expect(c.gdd).toBeUndefined();
    }
  });
});

import { FEATURES, featureFor } from "../src/content/features";

describe("feature facts", () => {
  it("finds features by name, alias and place", () => {
    expect(featureFor({ name: "Mount Everest", lon: 86.9, lat: 27.9 })?.kind).toBe("peak");
    expect(featureFor({ name: "Sagarmatha", lon: 86.9, lat: 27.9 })?.name).toBe("Mount Everest");
    expect(featureFor({ name: "Barringer Crater", lon: -111.02, lat: 35.03 })?.kind).toBe("crater");
    expect(featureFor({ name: "River Thames", lon: -0.12, lat: 51.5, kinds: ["river"] })?.name).toBe("Thames");
    // Same name, wrong place: no match.
    expect(featureFor({ name: "Etna", lon: -95, lat: 40 })).toBeUndefined();
    // Nearest within a distance.
    expect(featureFor({ lon: 142, lat: 12, kinds: ["deep"], withinKm: 400 })?.name).toBe("Mariana Trench");
    expect(featureFor({ lon: 0, lat: 0, kinds: ["deep"], withinKm: 400 })).toBeUndefined();
  });
  it("has sane coordinates and no duplicate names within a kind", () => {
    for (const x of FEATURES) { expect(Math.abs(x.lat)).toBeLessThanOrEqual(90); expect(Math.abs(x.lon)).toBeLessThanOrEqual(180); expect(x.facts.length).toBeGreaterThan(0); }
    const keys = FEATURES.map((x) => `${x.kind}:${x.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

import { WATCH, phaseOf, watchFor } from "../src/work/cropWatch";
describe("crop watch list", () => {
  it("covers real crops and splits the season", () => {
    for (const id of Object.keys(WATCH)) expect(CROPS.some((c) => c.id === id), id).toBe(true);
    expect(phaseOf(0, 6)).toBe("early");
    expect(phaseOf(3, 6)).toBe("mid");
    expect(phaseOf(5, 6)).toBe("late");
    expect(watchFor("potato", 3, 6).now.map((x) => x.name)).toContain("Late blight");
    expect(watchFor("potato", 5, 6).next).toEqual([]);
  });
});
