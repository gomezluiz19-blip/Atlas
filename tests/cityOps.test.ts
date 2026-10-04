import { describe, expect, it } from "vitest";
import { demoCity } from "../src/pro/gov/demo";
import { agencyStats, cityKpis, coverageGaps, facilitiesFromCsv, facilityFlags, from311, heatCells, morningBrief, projectStatus, topTypes } from "../src/pro/gov/model";

const DAY = "2026-10-05", NOW = Date.parse("2026-10-05T13:00:00Z");

describe("City Ops", () => {
  const c = demoCity(DAY, NOW);
  it("builds a city of agencies, facilities and people", () => {
    expect(c.agencies.length).toBe(11);
    expect(c.facilities.length).toBeGreaterThan(100);
    for (const a of c.agencies) expect(agencyStats(c, a.id).facilities.length).toBeGreaterThan(0);
    expect(c.facilities.every((f) => f.lead && f.authorized >= f.staff * 0.7)).toBe(true);
    const k = cityKpis(c, DAY);
    expect(k.headcount).toBeGreaterThan(200_000);
    expect(k.incidents).toBe(6);
  });
  it("leads the morning brief with the worst incident", () => {
    const b = morningBrief(c, DAY);
    expect(b[0].level).toBe("now");
    expect(b[0].text).toMatch(/fire/i);
    expect(b.some((x) => /311/.test(x.text))).toBe(true);
  });
  it("judges capital projects on schedule and cost", () => {
    const late = c.projects.find((p) => p.id === "p4")!;
    const s = projectStatus(late, DAY);
    expect(s.slipWeeks).toBeLessThan(0);
    expect(s.eac).toBeGreaterThan(late.budget);
    expect(s.level).toBe("red");
    expect(projectStatus(c.projects.find((p) => p.id === "p7")!, DAY).level).toBe("green");
  });
  it("flags facilities, bins 311 into heat and finds coverage gaps", () => {
    expect(facilityFlags({ ...c.facilities[0], status: "closed", note: "Roof", condition: 1, staff: 10, authorized: 40, workOrders: 20 })).toHaveLength(4);
    const cells = heatCells(c.requests, 0.7);
    expect(cells.reduce((a, x) => a + x.n, 0)).toBe(c.requests.length);
    expect(topTypes(c.requests, 1)[0][0]).toMatch(/Noise|Parking/);
    const gaps = coverageGaps(c, "hospital", 3);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => g.km >= 3)).toBe(true);
  });
  it("reads live 311 rows and a facilities CSV", () => {
    const r = from311([{ unique_key: "1", created_date: "2026-10-05T08:00:00.000", complaint_type: "Rodent", agency: "DOHMH", latitude: "40.7", longitude: "-73.9", status: "Closed" }, { unique_key: "2" }]);
    expect(r).toEqual([expect.objectContaining({ id: "1", type: "Rodent", status: "closed" })]);
    const fs = facilitiesFromCsv("name,lat,lon,agency,kind,staff\nEngine 1,40.7,-74,FDNY,Firehouse,40\n", c.agencies);
    expect(fs[0]).toMatchObject({ agency: "fdny", kind: "firehouse", staff: 40 });
  });
});
