import { describe, expect, it } from "vitest";
import { decodeLine, fuelMix, fuelOf, km, nearby, nearestLine, type PowerPlant } from "../src/data/infra";

describe("infrastructure data", () => {
  it("decodes delta-encoded lines", () => {
    const l = decodeLine([7, 1, 10000, 50000, 1000, -500, 500, 0], 2);
    expect(l.attrs).toEqual([7, 1]);
    expect(Array.from(l.xy)).toEqual([10, 50, 11, 49.5, 11.5, 49.5]);
    expect(l.bbox).toEqual([10, 49.5, 11.5, 50]);
  });

  it("finds nearby points and the nearest line", () => {
    const pts = [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 5, lat: 5 }];
    const near = nearby(pts, 0.1, 0, 200);
    expect(near.map((p) => p.lon)).toEqual([0, 1]);
    expect(near[0].km).toBeCloseTo(11.1, 0);
    const line = decodeLine([0, 1000, 1000, 0], 0); // from (0,1) to (1,1)
    const hit = nearestLine([line], 0.5, 0, 500)!;
    expect(hit.km).toBeCloseTo(km(0.5, 0, 0.5, 1), 0);
    expect(nearestLine([line], 0.5, 0, 50)).toBeNull();
  });

  it("groups fuels into a mix", () => {
    const p = (fuel: string, mw: number) => ({ name: "", lon: 0, lat: 0, fuel, mw, country: "X", year: 0 }) as PowerPlant;
    const mix = fuelMix([p("Coal", 100), p("Hydro", 300), p("Waste", 50), p("Biomass", 25)]);
    expect(mix.map((m) => [m.fuel.id, m.mw])).toEqual([["Hydro", 300], ["Coal", 100], ["Biomass", 75]]);
    expect(fuelOf("Wave and Tidal").id).toBe("Other");
  });
});
