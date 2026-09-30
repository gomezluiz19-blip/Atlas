import { describe, expect, it } from "vitest";
import { addDays, dueSoon, issueQueue, moveFacts, offsetKm, kmBetween, type Site } from "../src/pro/kit/ops";
import { fanReach, matchDay, modeFor, pipeline, seasonTravel, type Club } from "../src/pro/sports/model";
import { demoClub } from "../src/pro/sports/demo";
import { downhill, economics, mainSite, quakesNear, townsNear, usd } from "../src/pro/mining/model";
import { demoMine } from "../src/pro/mining/demo";
import { bestNextSite, coverage, gaps, needsTally } from "../src/pro/field/model";
import { demoProgramme } from "../src/pro/field/demo";

const T = "2026-10-01";

describe("Pro kit", () => {
  it("puts points the right distance away and measures moves", () => {
    const [lon, lat] = offsetKm(0, 0, 90, 100);
    expect(kmBetween({ lon: 0, lat: 0 }, { lon, lat })).toBeCloseTo(100, 0);
    const a: Site = { id: "a", name: "A", kind: "x", lon: 0, lat: 0 }, b: Site = { id: "b", name: "B", kind: "x", lon, lat };
    const f = moveFacts({ id: "m", from: "a", to: "b", what: "Ore", kind: "goods", amount: 100, unit: "t", per: "month", mode: "rail" }, a, b);
    expect(f.tonnes).toBe(1200);
    expect(f.co2t).toBeCloseTo((1200 * 125 * 0.028) / 1000, 1);
  });
  it("queues issues by severity then age, flags stale ones, and finds what's due", () => {
    const q = issueQueue([
      { id: "1", title: "a", opened: addDays(T, -30), updated: addDays(T, -20), status: "open", severity: 1 },
      { id: "2", title: "b", opened: addDays(T, -2), updated: addDays(T, -1), status: "open", severity: 3 },
      { id: "3", title: "c", opened: addDays(T, -9), updated: T, status: "closed", severity: 3 },
    ], T);
    expect(q.map((x) => x.id)).toEqual(["2", "1"]);
    expect(q[1].stale).toBe(true);
    const d = dueSoon([{ id: "a", title: "x", date: addDays(T, 200), kind: "k" }, { id: "b", title: "y", date: addDays(T, 10), kind: "k" }, { id: "c", title: "z", date: addDays(T, -3), kind: "k" }], T);
    expect(d.map((x) => [x.id, x.left])).toEqual([["c", -3], ["b", 10]]);
  });
});

describe("Sports Pro", () => {
  it("travels by coach under 500 km and flies further", () => {
    expect(modeFor(430)).toBe("truck");
    expect(modeFor(1400)).toBe("air");
  });
  it("adds up the season's travel and flags tight turnarounds", () => {
    const club = demoClub();
    const s = seasonTravel(club);
    expect(s.km).toBeGreaterThan(15_000);
    expect(s.flights).toBeGreaterThan(4);
    expect(s.furthest.to.name).toMatch(/Belém|Fortaleza/);
    // Porto Alegre then Fortaleza three days later: over 3,000 km, flagged.
    expect(s.tight.some((t) => /Porto Alegre/.test(t.a.venue.name) && /Fortaleza/.test(t.b.venue.name))).toBe(true);
    // Straight on from Porto Alegre to Fortaleza, not home in between.
    const i = s.legs.findIndex((l) => /Porto Alegre/.test(l.to.name));
    expect(s.legs[i + 1].to.name).toMatch(/Fortaleza/);
  });
  it("comes home between away games more than four days apart", () => {
    const club: Club = { ...demoClub(), fixtures: [] };
    const v = { name: "Away", lon: -43.2, lat: -22.9 };
    club.fixtures = [{ id: "a", date: "2026-10-01", opponent: "x", home: false, venue: v }, { id: "b", date: "2026-10-10", opponent: "y", home: false, venue: v }];
    expect(seasonTravel(club).legs.length).toBe(4);
  });
  it("knows where the fans are and fills the ground from them", () => {
    const club = demoClub();
    const r = fanReach(club);
    expect(r.local).toBeGreaterThan(0.5);
    expect(r.wide).toBeLessThan(1);
    expect(r.furthest.f.name).toMatch(/Boston|Lisbon/);
    const m = matchDay(club);
    expect(m.expected).toBeGreaterThan(10_000);
    expect(m.expected).toBeLessThan(club.ground.capacity);
    expect(pipeline(club).counts.shortlist).toBe(2);
  });
});

describe("Mining Pro", () => {
  it("values a year's copper and gold", () => {
    const cu = economics({ oreMt: 12, grade: 0.62, gradeUnit: "%", recovery: 88, payable: 96, price: 9500, costPerT: 28 });
    expect(cu.contained).toBeCloseTo(74_400, -2);
    expect(cu.revenue).toBeCloseTo(74_400 * 0.88 * 0.96 * 9500, -4);
    expect(cu.margin).toBeGreaterThan(0);
    const au = economics({ oreMt: 1, grade: 3.11035, gradeUnit: "g/t", recovery: 100, payable: 100, price: 2000, costPerT: 50 });
    expect(au.contained).toBeCloseTo(100_000, -1);
    expect(au.breakeven).toBeCloseTo(500, 0);
    expect(usd(1.23e9)).toBe("USD 1.2 bn");
  });
  it("finds towns around the mine and those downhill of the dam", () => {
    const pts: [number, number, number][] = [[26.39, -12.17, 90_000], [26.2, -12.4, 5_000], [30, -10, 1_000_000]];
    const near = townsNear(pts, { lon: 26.1, lat: -12.3 }, 50);
    expect(near.map((t) => t.people)).toEqual([5_000, 90_000]);
    const d = downhill(1300, near, [1250, 1340]);
    expect(d.people).toBe(5_000);
    expect(quakesNear([{ lon: 26.2, lat: -12.3, mag: 4.1 }, { lon: 40, lat: 0, mag: 6 }], { lon: 26.1, lat: -12.3 }).length).toBe(1);
  });
  it("starts the demo from its pit", () => {
    expect(mainSite(demoMine())?.kind).toBe("pit");
  });
});

describe("Field Ops", () => {
  it("finds who is too far from each service", () => {
    const p = demoProgramme();
    const w = gaps(p, "water");
    expect(w.missed).toBeGreaterThan(0);
    expect(w.out.some((r) => r.c.name === "Lokichoggio")).toBe(true);
    expect(coverage(p, "health").find((r) => r.c.name === "Kakuma")?.covered).toBe(true);
    expect(needsTally(p).find((x) => x.s === "water")!.people).toBeGreaterThan(100_000);
  });
  it("suggests where one more site reaches the most people", () => {
    const p = demoProgramme();
    const b = bestNextSite(p, "health")!;
    expect(b.people).toBeGreaterThan(0);
    expect(b.reaches.every((c) => gaps(p, "health").out.some((r) => r.c.id === c.id))).toBe(true);
    const biggest = Math.max(...gaps(p, "health").out.map((r) => r.c.people));
    expect(b.people).toBeGreaterThanOrEqual(biggest);
  });
});
