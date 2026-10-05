import { describe, expect, it } from "vitest";
import { FAR, farAlpha, LIGHT_FADE, lightsAlpha, subsolar } from "../src/globe/finish";

describe("the Earth's finish", () => {
  it("puts the sun overhead where it really is", () => {
    const june = subsolar(new Date(Date.UTC(2026, 5, 21, 12, 0)));
    expect(june.lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(june.lon)).toBeLessThan(2);
    const march = subsolar(new Date(Date.UTC(2026, 2, 20, 18, 0)));
    expect(Math.abs(march.lat)).toBeLessThan(1);
    expect(march.lon).toBeCloseTo(-90, -1);
    const dec = subsolar(new Date(Date.UTC(2026, 11, 21, 6, 0)));
    expect(dec.lat).toBeCloseTo(-23.4, 0);
    expect(dec.lon).toBeCloseTo(90, -1);
  });
  it("hands orbit to Blue Marble and the ground to the satellite, smoothly", () => {
    expect(farAlpha(FAR.full)).toBe(1);
    expect(farAlpha(20_000_000)).toBe(1);
    expect(farAlpha(FAR.gone)).toBe(0);
    expect(farAlpha(500_000)).toBe(0);
    const mid = farAlpha((FAR.full + FAR.gone) / 2);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(farAlpha(FAR.gone + 100_000)).toBeLessThan(0.05);
  });
  it("keeps the city lights for orbit and lets them go by street level", () => {
    expect(lightsAlpha(LIGHT_FADE.from)).toBe(1);
    expect(lightsAlpha(30_000_000)).toBe(1);
    expect(lightsAlpha(LIGHT_FADE.to)).toBe(0);
    expect(lightsAlpha(2_000)).toBe(0);
    expect(lightsAlpha((LIGHT_FADE.from + LIGHT_FADE.to) / 2)).toBeCloseTo(0.5, 5);
  });
});
