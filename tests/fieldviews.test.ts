import { describe, expect, it } from "vitest";
import { DEFAULT_BOWL, heatFlag, kickoffs, matchShade, patchiness, shadeFraction } from "../src/fieldviews/matchModel";
import { dryDays, readSoil, readSoilGrids, soakHours, textureClass } from "../src/fieldviews/soilModel";
import { potential, sunPath, turbineKw, windIfChanged } from "../src/fieldviews/siteModel";

describe("matchday sun and shade", () => {
  it("shades nothing at noon overhead and everything at night", () => {
    expect(shadeFraction(DEFAULT_BOWL, 89, 180).shade).toBe(0);
    expect(shadeFraction(DEFAULT_BOWL, -5, 180).shade).toBe(1);
  });
  it("shades more as the sun sinks, from the side it's behind", () => {
    const high = shadeFraction(DEFAULT_BOWL, 40, 270).shade, low = shadeFraction(DEFAULT_BOWL, 12, 270).shade;
    expect(low).toBeGreaterThan(high);
    // Sun in the west: the western touchline (x < 0 when the pitch runs north) is in shade first.
    const { grid } = shadeFraction({ ...DEFAULT_BOWL, bearing: 90 }, 20, 270);
    expect(grid[0][0]).toBe(true);
  });
  it("follows a match and ranks kickoffs", () => {
    const ms = matchShade(DEFAULT_BOWL, Date.parse("2025-06-21T17:00:00Z"), 51.5, -0.1);
    expect(ms[0].minute).toBe(0);
    expect(ms[ms.length - 1].shade).toBeGreaterThanOrEqual(ms[0].shade);
    expect(patchiness(ms)).toBeGreaterThanOrEqual(0);
    const k = kickoffs(DEFAULT_BOWL, "2025-06-21", 1, 51.5, -0.1);
    expect(k[0].patchy).toBeLessThanOrEqual(k[k.length - 1].patchy);
    expect(heatFlag(33).level).toBe(3);
  });
});

describe("soil", () => {
  it("names textures", () => {
    expect(textureClass(40, 40, 20)).toBe("Loam");
    expect(textureClass(90, 5, 5)).toBe("Sand");
    expect(textureClass(20, 30, 50)).toBe("Clay");
    expect(textureClass(20, 65, 15)).toBe("Silt loam");
  });
  it("reads SoilGrids and sums it up for a grower", () => {
    const mk = (name: string, f: number, vals: number[]) => ({ name, unit_measure: { d_factor: f }, depths: ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"].map((label, i) => ({ label, values: { mean: vals[i] } })) });
    const layers = readSoilGrids({ properties: { layers: [mk("clay", 10, [220, 230, 250, 280, 300, 300]), mk("sand", 10, [300, 300, 280, 260, 250, 250]), mk("silt", 10, [480, 470, 470, 460, 450, 450]), mk("phh2o", 10, [64, 65, 66, 68, 70, 72]), mk("soc", 10, [250, 200, 120, 60, 30, 20])] } });
    expect(layers).toHaveLength(6);
    expect(layers[0]).toMatchObject({ clay: 22, sand: 30, ph: 6.4, soc: 25 });
    const s = readSoil(layers)!;
    expect(s.top).toBe("Loam");
    expect(s.awc).toBeGreaterThan(120);
    expect(s.suits).toContain("wheat");
    expect(dryDays(s.awc)).toBeGreaterThan(5);
    expect(soakHours(s, 25, 30)).toBeGreaterThan(0);
  });
});

describe("site potential", () => {
  it("runs a power curve", () => {
    expect(turbineKw(2)).toBe(0);
    expect(turbineKw(13)).toBe(3600);
    expect(turbineKw(7.5)).toBeCloseTo(1150, -1);
  });
  it("adds up a year of sun and wind", () => {
    const time = Array.from({ length: 24 * 30 }, (_, i) => `2024-0${1 + Math.floor(i / 240)}-01T00:00`);
    const y = { time, ghi: time.map((_, i) => (i % 24 >= 6 && i % 24 < 18 ? 400 : 0)), wind: time.map(() => 28.8), dir: time.map((_, i) => (i % 2 ? 270 : 225)) };
    const p = potential(y, 45);
    expect(p.solar.kwhPerKwp).toBeGreaterThan(1000);
    expect(p.wind.mean).toBe(8);
    expect(p.wind.cf).toBeGreaterThan(30);
    expect(p.wind.rose.reduce((a, r) => a + r.share, 0)).toBeCloseTo(100, 0);
    expect(windIfChanged(y, -10)).toBeLessThan(p.wind.mwh);
  });
  it("traces the sun's path on a day", () => {
    const june = sunPath(51.5, 0, Date.parse("2025-06-21T00:00:00Z")), dec = sunPath(51.5, 0, Date.parse("2025-12-21T00:00:00Z"));
    expect(june.length).toBeGreaterThan(dec.length);
    expect(Math.max(...june.map((p) => p.alt))).toBeGreaterThan(60);
  });
});

import { clearance, disperse, kindOf } from "../src/fieldviews/crowdModel";
import { faceAz, keyDays, sunHours, sunTable } from "../src/fieldviews/sunModel";
import { csvRows, importPositions } from "../src/econ/brokerImport";

describe("sun on a building", () => {
  const b = { length: 40, depth: 18, floors: 10, floorHeight: 3, bearing: 90 }; // long side east–west: front faces south
  it("faces the right way", () => {
    expect(faceAz(b, "front")).toBe(180);
    expect(faceAz({ ...b, bearing: 0 }, "front")).toBe(90);
  });
  it("gives the south face the most winter sun in the north, and a tower takes it from the low floors", () => {
    const [winter] = keyDays(51.5, 2025);
    const t = sunTable(b, 51.5, -0.1, winter.day);
    const south = t.find((x) => x.face === "front")!, north = t.find((x) => x.face === "back")!;
    expect(south.floors[0]).toBeGreaterThan(north.floors[0]);
    const shaded = sunHours(b, "front", 0, 51.5, -0.1, winter.day, { distance: 20, height: 60 });
    expect(shaded).toBeLessThan(south.floors[0]);
    expect(sunHours(b, "front", 9, 51.5, -0.1, winter.day, { distance: 20, height: 20 })).toBe(south.floors[9]);
  });
});

describe("crowd flow", () => {
  const st = [{ id: "a", name: "Big station", kind: "rail" as const, lon: 0, lat: 0, km: 0.4 }, { id: "b", name: "Far bus", kind: "bus" as const, lon: 0, lat: 0, km: 1.2 }];
  it("sends most of the crowd to the big, near station and clears it", () => {
    const s = disperse(20000, 0.6, st);
    expect(s[0].s.id).toBe("a");
    expect(s.reduce((a, x) => a + x.people, 0)).toBeCloseTo(12000, -1);
    const c = clearance(s);
    expect(c.minutes).toBeGreaterThan(0);
    const closed = disperse(20000, 0.6, [{ ...st[0], closed: true }, st[1]]);
    expect(clearance(closed).minutes).toBeGreaterThan(c.minutes);
    expect(clearance(disperse(20000, 0.6, st, 2)).minutes).toBeLessThan(c.minutes);
  });
  it("reads OpenStreetMap stops", () => {
    expect(kindOf({ railway: "station", station: "subway" })).toBe("subway");
    expect(kindOf({ highway: "bus_stop" })).toBe("bus");
    expect(kindOf({ amenity: "cafe" })).toBeNull();
  });
});

describe("broker import", () => {
  it("splits CSV with quotes", () => {
    expect(csvRows('a,"b, c",d\n1,2,3')).toEqual([["a", "b, c", "d"], ["1", "2", "3"]]);
  });
  it("reads a positions export and a pasted list", () => {
    const fidelity = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value\nX1,Brokerage,AAPL,APPLE INC,10,$190.00,"$1,900.00"\nX1,Brokerage,ZZZZ,UNKNOWN CO,5,$10,$50.00\nX1,Brokerage,SPAXX**,CASH,,,"$500.00"';
    const r = importPositions(fidelity);
    expect(r.holdings).toEqual([{ id: "apple", value: 1900 }]);
    expect(r.unknown[0].symbol).toBe("ZZZZ");
    const ibkr = "Symbol,Position,Mark\nNVDA,4,120\nTSLA,2,250";
    expect(importPositions(ibkr).holdings).toEqual([{ id: "nvidia", value: 480 }, { id: "tesla", value: 500 }]);
    expect(importPositions("AAPL 5000\nNestlé, $7,000").holdings).toEqual([{ id: "apple", value: 5000 }, { id: "nestle", value: 7000 }]);
  });
});
