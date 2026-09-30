import { describe, expect, it } from "vitest";
import { demoProgramme } from "../src/pro/field/demo";
import { gaps } from "../src/pro/field/model";
import { communitiesFromRows, fourW, gapMatrix, indicatorProgress, planSites, reached, stockCover, total, walkHours } from "../src/pro/field/mne";

describe("Field Ops monitoring", () => {
  const p = demoProgramme();
  it("adds up people reached by sex and age, leaving out planned work", () => {
    const r = reached(p.activities!);
    expect(total(r)).toBeGreaterThan(100_000);
    expect(total(reached(p.activities!, "Nutrition"))).toBe(0);
    expect(reached(p.activities!, "Education").women).toBe(0);
  });
  it("tracks indicators from activities, or as entered", () => {
    const ind = indicatorProgress(p.indicators!, p.activities!);
    expect(ind.find((x) => x.i.name.startsWith("Boreholes"))!.value).toBe(5);
    expect(ind.find((x) => x.i.sector === "Health")!.share).toBeGreaterThan(0.5);
  });
  it("writes the 4W with coordinates and a total", () => {
    const rows = fourW(p, p.activities!);
    expect(rows.length).toBe(p.activities!.length);
    expect(rows[0].length).toBe(14);
    expect(Number(rows[0][13])).toBe(Number(rows[0][9]) + Number(rows[0][10]) + Number(rows[0][11]) + Number(rows[0][12]));
  });
  it("finds needs no one is working on, and overlaps", () => {
    const g = gapMatrix(p, p.activities!);
    expect(g.gaps.some((x) => x.c.name === "Lokichoggio" && x.sector === "WASH")).toBe(true);
    expect(g.overlaps.some((x) => x.c.name === "Kakuma" && x.sector === "WASH")).toBe(true);
    expect(g.peopleInGaps).toBeGreaterThan(0);
  });
  it("warns before supplies run out", () => {
    const c = stockCover(p.stock!);
    expect(c[0].s.item).toBe("Oral rehydration salts");
    expect(c[0].weeks).toBeCloseTo(3, 5);
  });
  it("plans several sites that each reach more people", () => {
    const r = planSites(p, "health", 3);
    expect(r.picks.length).toBeGreaterThan(1);
    expect(r.after).toBeLessThan(r.before);
    expect(r.before).toBe(gaps(p, "health").missed);
  });
  it("reads communities from a Kobo-style export", () => {
    const cs = communitiesFromRows([
      { "village": "Kaeris", "_gps_latitude": "4.1", "_gps_longitude": "35.5", "households": "120", "priority needs": "WASH; health" },
      { "village": "No place", "_gps_latitude": "", "_gps_longitude": "" },
    ], () => "id");
    expect(cs).toEqual([{ id: "id", name: "Kaeris", lat: 4.1, lon: 35.5, people: 600, needs: ["water", "health"] }]);
    expect(walkHours(10)).toBeCloseTo(3.25);
  });
});
