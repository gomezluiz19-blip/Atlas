import { describe, expect, it } from "vitest";
import { categoryOf, isLinear, lengthMeters, plantMegawatts, plantSource } from "../src/analysis/infrastructure";

describe("infrastructure", () => {
  it("categorises OSM tags", () => {
    expect(categoryOf({ highway: "primary" })).toBe("roads");
    expect(categoryOf({ highway: "residential" })).toBeNull();
    expect(categoryOf({ railway: "rail" })).toBe("rail");
    expect(categoryOf({ railway: "station" })).toBe("transport");
    expect(categoryOf({ power: "plant" })).toBe("power");
    expect(categoryOf({ waterway: "dam" })).toBe("water");
    expect(categoryOf({ man_made: "pipeline", substance: "gas" })).toBe("pipelines");
    expect(categoryOf({ man_made: "mast" })).toBe("telecom");
  });

  it("measures lines and parses plant output", () => {
    const way = { type: "way" as const, id: 1, tags: { power: "line" }, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] };
    expect(isLinear(way)).toBe(true);
    expect(lengthMeters(way)).toBeCloseTo(111195, -2);
    const long = { ...way, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0, lon: 1 }] };
    expect(lengthMeters(long, { lon: 0, lat: 0, radius: 5000 })).toBeCloseTo(1112, -1);
    expect(isLinear({ type: "way", id: 2, tags: { power: "plant" }, geometry: way.geometry })).toBe(false);
    expect(plantMegawatts({ "plant:output:electricity": "1.2 GW" })).toBe(1200);
    expect(plantMegawatts({ "plant:output:electricity": "250 MW" })).toBe(250);
    expect(plantMegawatts({ "plant:output:electricity": "yes" })).toBeNull();
    expect(plantSource({ "plant:source": "wind" })).toBe("wind");
  });
});
