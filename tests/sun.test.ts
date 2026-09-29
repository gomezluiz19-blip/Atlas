import { describe, expect, it } from "vitest";
import { clock, sunDay, sunDayStart, sunPosition, sunlight } from "../src/delight/sun";

describe("the sun", () => {
  it("stands overhead at the subsolar point", () => {
    // June solstice noon at Greenwich: the sun is near the Tropic of Cancer.
    const p = sunPosition(Date.UTC(2026, 5, 21, 12, 2), 23.44, 0);
    expect(p.alt).toBeGreaterThan(89);
    expect(p.dec).toBeCloseTo(23.44, 0);
  });
  it("rises in the east and sets in the west", () => {
    const t = Date.UTC(2026, 2, 20, 0, 0);
    expect(sunPosition(t + 6.2 * 3_600_000, 0, 0).az).toBeGreaterThan(80);
    expect(sunPosition(t + 6.2 * 3_600_000, 0, 0).az).toBeLessThan(100);
    expect(sunPosition(t + 17.8 * 3_600_000, 0, 0).az).toBeGreaterThan(260);
  });
  it("knows day length, polar day and polar night", () => {
    const eq = sunDay(sunDayStart(Date.UTC(2026, 2, 20, 12), 0), 0, 0);
    expect(eq.kind).toBe("normal");
    expect(eq.length).toBeGreaterThan(11.9);
    expect(eq.length).toBeLessThan(12.3);
    expect(eq.sunrise).toBeGreaterThan(5.8 * 60);
    expect(eq.sunrise).toBeLessThan(6.3 * 60);
    // London in midsummer: about 16.5 hours.
    const lon = sunDay(sunDayStart(Date.UTC(2026, 5, 21, 12), 0), 51.5, 0);
    expect(lon.length).toBeGreaterThan(16.3);
    expect(lon.length).toBeLessThan(16.9);
    expect(sunDay(sunDayStart(Date.UTC(2026, 5, 21, 12), 20), 78, 20).kind).toBe("polar-day");
    expect(sunDay(sunDayStart(Date.UTC(2026, 11, 21, 12), 20), 78, 20).kind).toBe("polar-night");
    expect(clock(6 * 60 + 5)).toBe("6:05");
  });
});

describe("light on the ground", () => {
  // A ridge running north–south in the middle of flat ground.
  const n = 21, z = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = i === 10 ? 500 : 0;
  const dem = { z, n, cell: 100 };
  it("shadows the ground behind a ridge from a low sun", () => {
    const morning = sunlight(dem, 10, 90); // sun low in the east
    expect(morning[10 * n + 4]).toBe(0); // west of the ridge: in its shadow
    expect(morning[10 * n + 9]).toBe(0);
    expect(morning[10 * n + 15]).toBeGreaterThan(0.1); // east of it: lit
    const evening = sunlight(dem, 10, 270); // and the other way round at dusk
    expect(evening[10 * n + 15]).toBe(0);
    expect(evening[10 * n + 4]).toBeGreaterThan(0.1);
  });
  it("lights everything under a high sun, and nothing at night", () => {
    const noon = sunlight(dem, 80, 180);
    expect(noon[10 * n + 3]).toBeGreaterThan(0.9);
    expect(sunlight(dem, -5, 180).every((v) => v === 0)).toBe(true);
  });
});
