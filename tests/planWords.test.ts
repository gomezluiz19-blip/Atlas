import { describe, expect, it } from "vitest";
import { defaultSchedule } from "../src/work/buildModel";
import { schedulePhases, seasonPlan } from "../src/work/planWords";

describe("schedulePhases", () => {
  const current = defaultSchedule("2026-01-05", 4, 2000);
  it("sets lengths, a start and overlaps from words", () => {
    const p = schedulePhases("Start 2 March; site 2 weeks, foundations 6 weeks, frame 3 months, roof and walls 8 weeks overlapping 4 weeks, fit-out 10 weeks", current, "2026-09-28")!;
    expect(p.start).toBe("2027-03-02");
    const byId = Object.fromEntries(p.phases.map((x) => [x.id, x]));
    expect(byId.site.start).toBe("2027-03-02");
    expect(byId.site.end).toBe("2027-03-16");
    expect(byId.foundations.start).toBe("2027-03-16");
    expect(byId.envelope.start < byId.structure.end).toBe(true);
    expect(p.understood.map((u) => u.id)).toEqual(["site", "foundations", "structure", "envelope", "interiors"]);
    // Services wasn't mentioned: it keeps its length.
    const was = current.find((x) => x.id === "services")!;
    expect(Date.parse(byId.services.end) - Date.parse(byId.services.start)).toBe(Date.parse(was.end) - Date.parse(was.start));
  });
  it("returns null when nothing was understood", () => {
    expect(schedulePhases("hello there", current, "2026-09-28")).toBeNull();
  });
});

describe("seasonPlan", () => {
  it("reads crops one after another", () => {
    const p = seasonPlan("potatoes 20 March, then cabbages after harvest, then winter wheat on 15 October", "2026-09-28", "2026-09-28");
    expect(p.map((x) => x.crop)).toEqual(["potato", "cabbage", "wheat-winter"]);
    expect(p[0].planted).toBe("2027-03-20");
    expect(p[1].planted > p[0].planted).toBe(true);
    expect(p[2].planted).toBe("2026-10-15");
  });
});
