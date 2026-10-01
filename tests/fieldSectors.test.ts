import { describe, expect, it } from "vitest";
import type { Conditions, Climate } from "../src/pro/services/conditions";
import { demoCompany } from "../src/pro/services/demo";
import { fleetHealth } from "../src/pro/services/network";
import { artClimate, buildingSeasons, clinicPower, coolingLoad, factoryFloor, farmSeason, fitProspect, lostWeeks, playSeason, SECTORS, sectorDemo, span, surveyWindow, towerFuel, venueSeason, workWindow } from "../src/pro/services/sectors";

const climate = (m: (i: number) => { tmax: number; tmin: number; rain: number }): Climate => {
  const months = Array.from({ length: 12 }, (_, i) => m(i));
  return { months, hottest: Math.max(...months.map((x) => x.tmax)), coldest: Math.min(...months.map((x) => x.tmin)), recordHigh: 45, recordLow: -30, annualRain: months.reduce((s, x) => s + x.rain, 0), wetMonths: months.map((x, i) => (x.rain > 100 ? i : -1)).filter((i) => i >= 0) };
};
const cond = (cl: Climate, grid = 20): Conditions => ({ alt: 300, density: 0.96, derate: 0, climate: cl, grid: { plant: { name: "P", lon: 0, lat: 0, fuel: "Gas", mw: 400, country: "X", year: 2000 }, km: grid }, port: null, airport: null, electric: { score: 50, reasons: [] }, conflict: false });
// Mato Grosso-like: warm all year, rains October to April.
const tropical = climate((i) => ({ tmax: 32, tmin: 20, rain: i >= 9 || i <= 3 ? 220 : 20 }));
// Temperate: frost in winter, summer growing.
const temperate = climate((i) => ({ tmax: [2, 4, 9, 15, 20, 25, 28, 27, 22, 15, 8, 3][i], tmin: [-8, -7, -2, 3, 8, 13, 16, 15, 10, 4, -1, -6][i], rain: 70 }));

describe("sector insights", () => {
  it("names month spans across the year end", () => {
    expect(span([9, 10, 11, 0, 1, 2, 3])).toBe("Oct–Apr");
    expect(span([4, 5, 6])).toBe("May–Jul");
    expect(span([])).toBe("none");
  });
  it("services farm machines before planting: the rains in the tropics, spring elsewhere", () => {
    expect(farmSeason(cond(tropical)).value).toBe("Sep");
    expect(farmSeason(cond(temperate)).value).toBe("Apr");
  });
  it("finds maintenance windows, clinic power, tower fuel, lost weeks and playing months", () => {
    expect(workWindow(cond(tropical)).value).toBe("5");
    expect(clinicPower(cond(tropical, 120)).value).toBe("backup");
    expect(clinicPower(cond(tropical, 10)).value).toBe("grid");
    const c = sectorDemo("telecom", demoCompany);
    expect(Number(towerFuel(cond(tropical, 200), c.accounts[0], c).value.replace(" d", ""))).toBeGreaterThan(5);
    expect(Number(lostWeeks(cond(tropical)).value.replace("~", ""))).toBeGreaterThan(10);
    expect(Number(playSeason(cond(temperate)).value)).toBeGreaterThanOrEqual(6);
  });
});

describe("sector demos and fit", () => {
  it("builds a working demo for every sector", () => {
    for (const v of Object.keys(SECTORS) as (keyof typeof SECTORS)[]) {
      const c = sectorDemo(v, demoCompany);
      expect(c.vertical, v).toBe(v);
      expect(c.accounts.length, v).toBeGreaterThanOrEqual(5);
      expect(c.assets.length, v).toBeGreaterThan(10);
      expect(fleetHealth(c, new Date().toISOString().slice(0, 10)).total, v).toBe(c.assets.length);
      if (v !== "mining") expect(c.offer.commodities, v).toEqual(SECTORS[v].focus);
    }
  });
  it("scores any prospect by focus, method and reach", () => {
    const c = sectorDemo("energy", demoCompany);
    const wind = { id: "1", name: "W", lon: 0, lat: 0, tags: ["wind", "large"] }, coal = { id: "2", name: "C", lon: 0, lat: 0, tags: ["coal"] };
    expect(fitProspect(c, wind, 5).score).toBeGreaterThan(fitProspect(c, coal, 5).score);
    expect(fitProspect(c, wind, 500).why.some((w) => w.includes("new base"))).toBe(true);
  });
});

describe("the industries' service sectors", () => {
  const months = (f: (i: number) => { tmax: number; tmin: number; rain: number }) => Array.from({ length: 12 }, (_, i) => f(i));
  const cond = (ms: { tmax: number; tmin: number; rain: number }[], grid = 10) => ({
    alt: 10, density: 1, derate: 0, port: null, airport: null, electric: { score: 50, reasons: [] }, conflict: false,
    grid: grid ? { plant: { name: "P", lon: 0, lat: 0, mw: 500, fuel: "Gas", country: "X" }, km: grid } : null,
    climate: { hottest: Math.max(...ms.map((m) => m.tmax)), coldest: Math.min(...ms.map((m) => m.tmin)), recordHigh: 40, recordLow: -10, annualRain: ms.reduce((s, m) => s + m.rain, 0), wetMonths: ms.map((m, i) => (m.rain > 100 ? i : -1)).filter((i) => i >= 0), months: ms },
  }) as unknown as Parameters<typeof artClimate>[0];
  const dhaka = cond(months((i) => ({ tmax: i >= 3 && i <= 8 ? 34 : 27, tmin: 15, rain: i >= 5 && i <= 8 ? 350 : 20 })), 0);
  const london = cond(months((i) => ({ tmax: 8 + 14 * Math.sin((Math.PI * i) / 11), tmin: 2 + 10 * Math.sin((Math.PI * i) / 11), rain: 55 })));
  it("reads each sector's one thing from a site's conditions", () => {
    expect(factoryFloor(dhaka).value).toBe("6");
    expect(factoryFloor(dhaka).lines.join(" ")).toMatch(/stabilisers/);
    expect(buildingSeasons(london).lines[1]).toMatch(/Heating season/);
    expect(coolingLoad(dhaka, "walk-ins").good).toBe(false);
    expect(coolingLoad(london, "cooling units").lines.join(" ")).toMatch(/free cooling/);
    expect(surveyWindow(london).value).toBe("12");
    expect(artClimate(london).lines.at(-1)).toMatch(/Calmest months/);
    expect(venueSeason(dhaka).value).toBe("backup");
  });
  it("has a demo at real places for each new sector", () => {
    for (const v of ["art", "fashion", "gaming", "realestate", "architecture", "food", "retail", "tech"] as const) {
      const c = SECTORS[v].demo();
      expect(c.vertical).toBe(v);
      expect(c.accounts.length).toBe(6);
      expect(c.assets.length).toBeGreaterThan(10);
      expect(c.assets.every((a) => SECTORS[v].types[a.type])).toBe(true);
    }
  });
});
