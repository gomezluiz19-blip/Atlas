import { describe, expect, it } from "vitest";
import { demoDistrict } from "../src/pro/edu/demo";
import { catchmentStats, certsDue, coverPlan, districtKpis, drillStatus, floorState, learning, roomStates, schoolFlags } from "../src/pro/edu/model";

const DAY = "2026-10-05";

describe("Education Pro", () => {
  const d = demoDistrict(DAY);
  const high = d.schools.find((s) => s.level === "high")!;
  it("builds a believable district", () => {
    expect(d.schools).toHaveLength(3);
    const k = districtKpis(d, DAY);
    expect(k.ratio).toBeGreaterThan(15);
    expect(k.ratio).toBeLessThan(35);
    expect(k.out).toBeGreaterThan(0);
  });
  it("covers absent teachers with free substitutes, the school's own first", () => {
    const plan = coverPlan(d, high, DAY);
    expect(plan.length).toBeGreaterThan(0);
    const covered = plan.filter((c) => c.cover);
    expect(covered.length).toBeGreaterThan(0);
    expect(covered[0].cover!.role).toBe("substitute");
    expect(new Set(covered.map((c) => c.cover!.id)).size).toBe(covered.length);
  });
  it("colours rooms and floors by their worst state", () => {
    const st = roomStates(d, high, DAY);
    const plan = coverPlan(d, high, DAY);
    const room = plan.find((c) => c.room)!.room!;
    expect(["covered", "cover", "repair"]).toContain(st.get(room.id));
    expect(["cover", "repair", "covered", "ok", "empty"]).toContain(floorState(high, st, room.building, room.floor));
  });
  it("flags what a principal must see first", () => {
    const flags = schoolFlags(d, high, DAY);
    expect(flags[0].level).toBe("now");
    expect(flags.some((f) => /repair/.test(f.text))).toBe(true);
    expect(flags.some((f) => /field trip/.test(f.text))).toBe(true);
  });
  it("tracks drills, certificates, catchment and learning", () => {
    const dr = drillStatus(high, DAY);
    expect(dr.find((x) => x.kind === "shelter")!.due).toBe(true);
    expect(certsDue(d, high.id, DAY, 10_000).length).toBeGreaterThan(0);
    const cs = catchmentStats(high);
    expect(cs.median).toBeGreaterThan(0);
    expect(cs.within[2][1]).toBeGreaterThanOrEqual(cs.within[0][1]);
    const l = learning(high, [{ title: "Capitals quiz", score: 7, total: 10 }, { title: "Capitals quiz", score: 9, total: 10 }]);
    expect(l.groups.length).toBeGreaterThan(0);
    expect(l.quizzes[0]).toMatchObject({ title: "Capitals quiz", n: 2, pct: 80 });
  });
});
