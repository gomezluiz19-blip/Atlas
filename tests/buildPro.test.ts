import { describe, expect, it } from "vitest";
import { addWorkdays, deliveryClashes, earnedValue, forecastFinish, headcount, isWorkday, lostDaysByMonth, noiseAt, projectFlags, schedule, weatherClashes, workable, workdaysBetween, type Day, type Project, type Task } from "../src/pro/build/model";
import { demoFirm } from "../src/pro/build/demo";

const T = (id: string, days: number, after: string[] = [], o: Partial<Task> = {}): Task => ({ id, name: id, trade: "x", days, after, weather: "none", progress: 0, budget: 100, ...o });
const P = (tasks: Task[], o: Partial<Project> = {}): Project => ({ id: "p", name: "P", client: "C", kind: "commercial", lon: -97.7, lat: 30.3, value: 1000, start: "2026-10-05", finish: "2026-11-30", cost: 0, tasks, deliveries: [], permits: [], rfis: [], log: [], ...o });
const day = (date: string, o: Partial<Day> = {}): Day => ({ date, rain: 0, windMax: 10, gustMax: 20, tmin: 12, tmax: 24, ...o });

describe("working days", () => {
  it("skip weekends", () => {
    expect(isWorkday("2026-10-03")).toBe(false); // Saturday
    expect(addWorkdays("2026-10-02", 1)).toBe("2026-10-05"); // Friday + 1 = Monday
    expect(workdaysBetween("2026-10-05", "2026-10-12")).toBe(5);
  });
});

describe("the critical path", () => {
  // a(5) → b(10) → d(5); a → c(3) → d
  const p = P([T("a", 5), T("b", 10, ["a"]), T("c", 3, ["a"]), T("d", 5, ["b", "c"])]);
  it("finds early starts, float and the critical path", () => {
    const s = schedule(p);
    const g = (id: string) => s.slots.find((x) => x.task.id === id)!;
    expect(s.days).toBe(20);
    expect(g("c").float).toBe(7);
    expect(["a", "b", "d"].every((id) => g(id).critical)).toBe(true);
    expect(g("c").critical).toBe(false);
    expect(g("a").start).toBe("2026-10-05");
    expect(s.finish).toBe(addWorkdays("2026-10-05", 19));
  });
  it("shortens tasks by their progress", () => {
    const q = P([T("a", 10, [], { progress: 0.5 }), T("b", 4, ["a"])]);
    expect(schedule(q).days).toBe(9);
  });
  it("reports a loop instead of hanging", () => {
    expect(schedule(P([T("a", 2, ["b"]), T("b", 2, ["a"])])).cycle).toBe(true);
  });
  it("forecasts the finish against the contract date", () => {
    const late = forecastFinish(P([T("a", 60)], { finish: "2026-11-30" }), "2026-10-05");
    expect(late.late).toBeGreaterThan(0);
    expect(late.critical).toEqual(["a"]);
  });
});

describe("weather", () => {
  it("applies each kind of work's rule", () => {
    expect(workable("pour", day("2026-10-05", { rain: 5 })).ok).toBe(false);
    expect(workable("pour", day("2026-10-05", { tmin: 3 })).why).toMatch(/3 °C/);
    expect(workable("crane", day("2026-10-05", { gustMax: 65 })).ok).toBe(false);
    expect(workable("earth", day("2026-10-05", { rain: 5 })).ok).toBe(true);
    expect(workable("none", day("2026-10-05", { rain: 90 })).ok).toBe(true);
  });
  it("flags planned work on a ruled-out day, with the next good one", () => {
    const p = P([T("pour", 2, [], { weather: "pour" })]);
    const c = weatherClashes(p, [day("2026-10-05", { rain: 12 }), day("2026-10-06", { rain: 8 }), day("2026-10-07")], "2026-10-05");
    expect(c).toHaveLength(1);
    expect(c[0].date).toBe("2026-10-05");
    expect(c[0].next).toBe("2026-10-07");
  });
  it("turns past years into lost days a month", () => {
    const hist = [...Array(30)].map((_, i) => ({ date: `2020-01-${String(i + 1).padStart(2, "0")}`, tmin: 2, tmax: 10, rain: 0 }));
    expect(lostDaysByMonth("pour", hist)[0]).toBeCloseTo(21.7, 1);
    expect(lostDaysByMonth("earth", hist)[0]).toBe(0);
  });
});

describe("money", () => {
  it("works out earned value", () => {
    const p = P([T("a", 10, [], { budget: 1000, progress: 0.5 }), T("b", 10, ["a"], { budget: 1000 })], { cost: 600 });
    const ev = earnedValue(p, addWorkdays("2026-10-05", 9)); // end of task a's planned time
    expect(ev.bac).toBe(2000);
    expect(ev.pv).toBeCloseTo(1000, 5);
    expect(ev.ev).toBe(500);
    expect(ev.spi).toBeCloseTo(0.5, 5);
    expect(ev.cpi).toBeCloseTo(500 / 600, 5);
    expect(ev.eac).toBeCloseTo(600 + 1500 / (500 / 600), 5);
  });
});

describe("the site", () => {
  it("counts people on site from the tasks running", () => {
    const p = P([T("a", 3, [], { crew: 5 }), T("b", 3, [], { crew: 2 })]);
    expect(headcount(p, "2026-10-05", 4).map((x) => x.people)).toEqual([7, 7, 7, 0]);
  });
  it("spots deliveries in the same window and crane lifts on a windy day", () => {
    const p = P([], { deliveries: [
      { id: "1", what: "Steel", supplier: "S", date: "2026-10-06", window: "07:00–09:00", trucks: 2, crane: true, status: "booked" },
      { id: "2", what: "Rebar", supplier: "R", date: "2026-10-06", window: "07:00–09:00", trucks: 1, status: "booked" },
    ] });
    const c = deliveryClashes(p, [day("2026-10-06", { gustMax: 70 })]);
    expect(c).toHaveLength(2);
    expect(c.some((x) => /crane/.test(x.why))).toBe(true);
  });
  it("estimates noise falling with distance", () => {
    expect(noiseAt(10)).toBe(85);
    expect(noiseAt(20)).toBe(79);
    expect(noiseAt(160)).toBe(61);
  });
});

describe("the demo contractor", () => {
  it("has a story: one site late, one over budget", () => {
    const f = demoFirm(Date.parse("2026-09-30T12:00:00Z")), t = "2026-09-30";
    expect(f.projects).toHaveLength(4);
    const lofts = f.projects[0], dc = f.projects[1];
    expect(earnedValue(lofts, t).spi).toBeLessThan(0.95);
    expect(earnedValue(dc, t).cpi).toBeLessThan(0.95);
    expect(projectFlags(lofts, t).some((x) => /overdue since/.test(x.text))).toBe(true);
    for (const p of f.projects) expect(schedule(p).cycle).toBe(false);
  });
});
