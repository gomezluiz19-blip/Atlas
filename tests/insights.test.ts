import { describe, expect, it } from "vitest";
import { auroraZone, daylightHours, magneticLatitude, nearestOnLines, skyState, sunAltitude } from "../src/analysis/insights";
import { classifyTypes } from "../src/analysis/placeKinds";

describe("aurora", () => {
  it("puts northern Scandinavia and Alaska under the oval, not London or Miami", () => {
    expect(auroraZone(magneticLatitude(69.65, 18.96))).toBe("oval"); // Tromsø
    expect(auroraZone(magneticLatitude(64.84, -147.72))).toBe("oval"); // Fairbanks
    expect(auroraZone(magneticLatitude(51.5, -0.12))).toBe("rare"); // London
    expect(auroraZone(magneticLatitude(25.76, -80.19))).toBe("none"); // Miami
    expect(auroraZone(magneticLatitude(-77.85, 166.67))).not.toBe("none"); // McMurdo
  });
});

describe("sun", () => {
  it("knows midnight sun, polar night and the equinox", () => {
    expect(daylightHours(78.2, new Date(Date.UTC(2025, 5, 21)))).toBe(24); // Svalbard, June
    expect(daylightHours(78.2, new Date(Date.UTC(2025, 11, 21)))).toBe(0); // Svalbard, December
    expect(daylightHours(0, new Date(Date.UTC(2025, 2, 20)))).toBeCloseTo(12.1, 0);
    expect(daylightHours(51.5, new Date(Date.UTC(2025, 5, 21)))).toBeCloseTo(16.6, 0);
  });
  it("finds the sun high at noon and down at midnight", () => {
    expect(skyState(sunAltitude(0, 0, new Date(Date.UTC(2025, 2, 20, 12))))).toBe("day");
    expect(skyState(sunAltitude(0, 0, new Date(Date.UTC(2025, 2, 20, 0))))).toBe("dark");
    expect(sunAltitude(0, 0, new Date(Date.UTC(2025, 2, 20, 12)))).toBeGreaterThan(85);
  });
});

describe("geometry", () => {
  it("measures distance to the nearest line", () => {
    const lines = [[0, 0, 0, 10], [5, 0, 5, 10]];
    const r = nearestOnLines(1, 5, lines);
    expect(r.line).toBe(0);
    expect(r.km).toBeCloseTo(110.7, 0);
  });
});

describe("place kinds", () => {
  it("classifies landmarks by their Wikidata types", () => {
    expect(classifyTypes(["skyscraper", "office building"])).toBe("landmark");
    expect(classifyTypes(["association football venue", "stadium"])).toBe("sports");
    expect(classifyTypes(["river"])).toBe("water");
    expect(classifyTypes(["urban park"])).toBe("park");
    expect(classifyTypes(["museum", "art museum"])).toBe("culture");
    expect(classifyTypes(["neighborhood of New York City"])).toBe("district");
    expect(classifyTypes(["clock tower"])).toBe("landmark");
    expect(classifyTypes(["capital city", "city"])).toBe("capital");
  });
});
