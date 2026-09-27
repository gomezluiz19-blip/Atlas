import { describe, expect, it } from "vitest";
import { classify, isUnderground, lineLength, summarize, toFeatures } from "../src/analysis/cityWater";
import type { OsmElement } from "../src/data/overpass";

const way = (id: number, tags: Record<string, string>, pts: [number, number][]): OsmElement => ({ type: "way", id, tags, geometry: pts.map(([lon, lat]) => ({ lon, lat })) });

describe("city water", () => {
  it("classifies the parts of a water system", () => {
    expect(classify({ waterway: "river" })).toBe("river");
    expect(classify({ waterway: "drain" })).toBe("drain");
    expect(classify({ waterway: "weir" })).toBe("control");
    expect(classify({ man_made: "wastewater_plant" })).toBe("wastewater");
    expect(classify({ man_made: "pumping_station", substance: "sewage" })).toBe("wastewater");
    expect(classify({ man_made: "pumping_station" })).toBe("supply");
    expect(classify({ man_made: "water_tower" })).toBe("supply");
    expect(classify({ man_made: "pipeline", substance: "gas" })).toBeNull();
    expect(classify({ man_made: "pipeline", substance: "water" })).toBe("pipe");
    expect(classify({ landuse: "basin", basin: "retention" })).toBe("basin");
    expect(classify({ highway: "primary" })).toBeNull();
  });

  it("spots buried channels", () => {
    expect(isUnderground({ waterway: "stream", tunnel: "culvert" })).toBe(true);
    expect(isUnderground({ waterway: "stream", layer: "-1" })).toBe(true);
    expect(isUnderground({ waterway: "stream", tunnel: "no" })).toBe(false);
    expect(isUnderground({ waterway: "river" })).toBe(false);
  });

  it("measures open and buried channels and names the main ones", () => {
    const deg = lineLength([[0, 0], [0, 0.01]]);
    expect(deg).toBeCloseTo(1112, -1);
    const fs = toFeatures([
      way(1, { waterway: "river", name: "Thames" }, [[0, 0], [0, 0.02]]),
      way(2, { waterway: "river", name: "Thames" }, [[0, 0.02], [0, 0.03]]),
      way(3, { waterway: "canal", name: "Regent's Canal" }, [[0, 0], [0, 0.01]]),
      way(4, { waterway: "stream", name: "Fleet", tunnel: "culvert" }, [[0, 0], [0, 0.01]]),
      way(5, { waterway: "drain" }, [[0, 0], [0, 0.005]]),
      { type: "node", id: 6, lat: 0, lon: 0, tags: { man_made: "wastewater_plant", name: "Beckton" } },
    ]);
    const s = summarize(fs);
    expect(s.open.river).toBeCloseTo(3 * deg, -1);
    expect(s.buried).toBeCloseTo(deg, -1);
    expect(s.open.drain).toBeCloseTo(deg / 2, -1);
    expect(s.counts.wastewater).toBe(1);
    expect(s.mainChannels).toEqual(["Thames", "Regent's Canal"]);
  });
});
