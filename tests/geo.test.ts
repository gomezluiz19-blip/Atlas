import { describe, expect, it } from "vitest";
import { kmAt, kmBetween, kmPair } from "../src/util/geo";

describe("distances on the Earth", () => {
  it("agrees in all three shapes, and matches known distances", () => {
    const london = { lon: -0.1276, lat: 51.5072 }, paris = { lon: 2.3522, lat: 48.8566 };
    const d = kmBetween(london, paris);
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(346);
    expect(kmAt(london.lon, london.lat, paris.lon, paris.lat)).toBe(d);
    expect(kmPair([london.lon, london.lat], [paris.lon, paris.lat])).toBe(d);
  });
  it("is zero at the same spot and half the world at the antipode", () => {
    expect(kmAt(10, 10, 10, 10)).toBe(0);
    expect(kmAt(0, 0, 180, 0)).toBeCloseTo(Math.PI * 6371, 3);
  });
});
