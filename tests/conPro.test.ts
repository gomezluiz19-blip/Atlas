import { describe, expect, it } from "vitest";
import { demoRegion } from "../src/pro/con/demo";
import { demand, floorsUp, fromDobPermits, masonryEstimate, pipeline, routePlan, sitesFromCsv, stageAt, unionFlags, variance, windowsFor } from "../src/pro/con/model";

const DAY = "2026-10-05";

describe("Construction Pro", () => {
  const sites = demoRegion(DAY);
  it("spreads a demo region over every stage", () => {
    expect(sites.length).toBeGreaterThan(20);
    const st = new Set(sites.map((s) => { const a = stageAt(s, DAY); return a.status === "under way" ? a.stage : a.status; }));
    expect(st.size).toBeGreaterThan(4);
    expect(sites.some((s) => s.mine)).toBe(true);
    expect(sites.every((s) => s.source === "demo" && /demo/.test(s.address))).toBe(true);
  });
  it("puts the floors up in order: frame, then facade, then fit-out", () => {
    for (const s of sites) { const u = floorsUp(s, DAY); expect(u.built).toBeGreaterThanOrEqual(u.clad); expect(u.clad).toBeGreaterThanOrEqual(u.fitted); expect(u.built).toBeLessThanOrEqual(s.stories); }
  });
  it("knows when bricklayers are needed and how much facade there is", () => {
    const brick = sites.find((s) => s.masonry === "brick")!;
    const w = windowsFor(brick, "Bricklayers");
    expect(w.map((x) => x.stage)).toContain("envelope");
    const e = masonryEstimate(brick);
    expect(e.bricks).toBe(Math.round(e.area * 60));
    expect(e.masonDays).toBeGreaterThan(50);
    const env = w.find((x) => x.stage === "envelope")!;
    expect(unionFlags(brick, env.start, "Bricklayers")[0].text).toMatch(/needed now/);
  });
  it("plans a route that visits every site once", () => {
    const p = routePlan(sites.slice(0, 6), { lon: -76.86, lat: 38.97 });
    expect(new Set(p.order.map((s) => s.id)).size).toBe(6);
    expect(p.km).toBeGreaterThan(0);
  });
  it("adds up material demand, the pipeline and variance", () => {
    const d = demand(sites, DAY, 6);
    expect(d.months).toHaveLength(6);
    expect(d.totals.concrete.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const p = pipeline(sites, DAY);
    expect([...p.by.values()].reduce((a, e) => a + e.n, 0)).toBe(sites.length);
    expect(Number.isInteger(variance(sites[0], DAY))).toBe(true);
  });
  it("reads NYC DOB permits and a CSV", () => {
    const dob = fromDobPermits([{ gis_latitude: "40.7", gis_longitude: "-73.95", job_type: "NB", issuance_date: "03/14/2026", house__: "12", street_name: "MAIN ST", borough: "BROOKLYN", job__: "321" }, { gis_latitude: "", gis_longitude: "" }], DAY);
    expect(dob).toHaveLength(1);
    expect(dob[0]).toMatchObject({ start: "2026-03-14", source: "NYC DOB", stories: 8 });
    const csv = sitesFromCsv("Name,Lat,Lon,Stories,Union,Address\n\"Pier 5, Block A\",38.9,-77.0,9,yes,1 Water St\nBad,,\n", DAY);
    expect(csv).toHaveLength(1);
    expect(csv[0]).toMatchObject({ name: "Pier 5, Block A", stories: 9, union: "union", address: "1 Water St" });
  });
});
