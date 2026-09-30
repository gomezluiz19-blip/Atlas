import { describe, expect, it } from "vitest";
import { addDays } from "../src/pro/kit/ops";
import { airDensity, conflictMinerals, derate, electricReadiness, summarise } from "../src/pro/services/conditions";
import { demoCompany } from "../src/pro/services/demo";
import { commoditiesIn, fit, readMines } from "../src/pro/services/market";
import { bestBase, coverage, dispatch, exposure, fleetHealth, hoursNow, lifeLeft, pipeline, serviceDue, travel, type Airport, type Asset } from "../src/pro/services/network";

const T = "2026-10-01";
const ap = (iata: string, lon: number, lat: number, type = "large"): Airport => ({ name: iata, iata, lon, lat, type, rank: 1 });
const AIRPORTS = [ap("ANF", -70.44, -23.44), ap("SCL", -70.79, -33.39), ap("LIM", -77.11, -12.02), ap("CJC", -68.9, -22.5, "mid"), ap("FBM", 27.53, -11.59, "mid"), ap("JNB", 28.24, -26.13), ap("PER", 115.97, -31.94), ap("ULN", 106.77, 47.84), ap("OYU", 106.85, 43.0, "small")];

describe("the installed base", () => {
  const a: Asset = { id: "a", account: "x", type: "Haul truck", model: "m", serial: "s", installed: "2024-01-01", hours: 10_000, asOf: addDays(T, -10), perDay: 20, serviceEvery: 500, lastService: 9_800, lifeHours: 20_000, status: "running" };
  it("projects hours and the next service", () => {
    expect(hoursNow(a, T)).toBe(10_200);
    expect(serviceDue(a, T)).toEqual({ hoursLeft: 100, daysLeft: 5, overdue: false });
    expect(serviceDue({ ...a, lastService: 9_600 }, T).overdue).toBe(true);
    expect(hoursNow({ ...a, status: "down" }, T)).toBe(10_000);
    expect(lifeLeft(a, T)!.years).toBeCloseTo(9_800 / 20 / 365, 3);
  });
  it("reads the demo fleet's health", () => {
    const c = demoCompany(), fh = fleetHealth(c, new Date().toISOString().slice(0, 10));
    expect(fh.total).toBeGreaterThan(50);
    expect(fh.down.length).toBeGreaterThan(0);
    expect(fh.availability).toBeLessThan(1);
  });
});

describe("getting to remote sites", () => {
  it("drives short hops and flies long ones, slower in the wet", () => {
    const short = travel({ lon: -70.4, lat: -23.65 }, { lon: -69.07, lat: -24.27 }, AIRPORTS);
    expect(short.how).toBe("drive");
    expect(travel({ lon: -70.4, lat: -23.65 }, { lon: -69.07, lat: -24.27 }, AIRPORTS, true).hours).toBeCloseTo(short.hours * 1.5, 5);
    const long = travel({ lon: 28.05, lat: -26.2 }, { lon: 25.42, lat: -10.72 }, AIRPORTS);
    expect(long.how).toMatch(/^fly JNB→FBM/);
    expect(long.hours).toBeLessThan(20);
  });
  it("adds a connection for small airports", () => {
    const viaSmall = travel({ lon: 106.92, lat: 47.92 }, { lon: 106.87, lat: 43.01 }, AIRPORTS);
    const drive = travel({ lon: 106.92, lat: 47.92 }, { lon: 106.87, lat: 43.01 }, []);
    expect(Math.min(viaSmall.hours, drive.hours)).toBe(viaSmall.hours);
  });
  it("sends the nearest available technician with the skill", () => {
    const c = demoCompany();
    const loaderJob = c.jobs.find((j) => j.asset && c.assets.find((a) => a.id === j.asset)?.type === "Underground loader") ?? { ...c.jobs[0], asset: c.assets.find((a) => a.type === "Underground loader")!.id, account: c.assets.find((a) => a.type === "Underground loader")!.account };
    const opts = dispatch(c, loaderJob, AIRPORTS);
    expect(opts.every((o) => o.t.skills.includes("Underground loader"))).toBe(true);
    const firstBusy = opts.findIndex((o) => !o.t.available);
    if (firstBusy >= 0) expect(opts.slice(firstBusy).every((o) => !o.t.available)).toBe(true);
  });
  it("finds sites beyond their response time and the base that helps most", () => {
    const c = demoCompany();
    const cov = coverage(c, AIRPORTS);
    expect(cov.length).toBe(c.accounts.length);
    const out = cov.filter((r) => !r.within);
    expect(out.length).toBeGreaterThan(0);
    const b = bestBase(c, AIRPORTS);
    expect(b?.machines).toBeGreaterThan(0);
  });
});

describe("pipeline, exposure and site conditions", () => {
  it("weights the pipeline by stage and counts the win rate", () => {
    const p = pipeline(demoCompany().opps);
    expect(p.weighted).toBeLessThan(p.value);
    expect(p.winRate).toBe(0.5);
  });
  it("shows where the installed base is concentrated", () => {
    const e = exposure(demoCompany());
    expect(e.commodity[0].k).toBe("copper");
    expect(e.commodity.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
  });
  it("reads altitude, climate and electric readiness", () => {
    expect(airDensity(0)).toBe(1);
    expect(airDensity(4400)).toBeCloseTo(0.593, 2);
    expect([derate(1500), derate(3000), derate(4400)]).toEqual([0, 10, 24]);
    const days = Array.from({ length: 730 }, (_, i) => { const d = new Date(Date.UTC(2023, 0, 1 + i)); const m = d.getUTCMonth(); return { date: d.toISOString().slice(0, 10), tmin: m < 3 ? -25 : 5, tmax: m < 3 ? -10 : 25, rain: m === 11 ? 5 : 0.5 }; });
    const cl = summarise(days)!;
    expect(cl.wetMonths).toEqual([11]);
    expect(cl.coldest).toBe(-25);
    const e = electricReadiness(4400, { plant: { name: "P", lon: 0, lat: 0, fuel: "Solar", mw: 300, country: "CHL", year: 2020 }, km: 30 }, 200, cl);
    expect(e.score).toBe(80);
    expect(e.reasons.length).toBe(3);
    expect(conflictMinerals("Rwanda", "tin")).toBe(true);
    expect(conflictMinerals("Chile", "copper")).toBe(false);
  });
  it("reads Wikidata mines and scores the fit", () => {
    expect(commoditiesIn("copper ore and gold")).toEqual(expect.arrayContaining(["copper", "gold"]));
    const ms = readMines([{ m: { value: "http://www.wikidata.org/entity/Q1" }, mLabel: { value: "Test Mine" }, coord: { value: "Point(-69 -23)" }, prodLabel: { value: "copper" }, typeLabel: { value: "open-pit mine" }, countryLabel: { value: "Chile" } }]);
    expect(ms[0]).toMatchObject({ name: "Test Mine", commodities: ["copper"], method: "open pit", country: "Chile" });
    const c = demoCompany();
    expect(fit(c, ms[0], 5).score).toBe(100);
    expect(fit(c, { ...ms[0], commodities: ["coal"] }, 200).score).toBeLessThan(50);
  });
});
