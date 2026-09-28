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
