import { describe, expect, it } from "vitest";
import { bucket, daysUntil, fromJourney, fromPlan, shade, toHex } from "../src/plans/gather";
import type { Plan } from "../src/work/planModel";
import type { Journey } from "../src/work/journeyModel";

const light = (hsl: string) => Number(/(\d+)%\)$/.exec(hsl)![1]);

describe("my plans", () => {
  it("counts days from today", () => {
    expect(daysUntil("2026-10-01", "2026-09-30")).toBe(1);
    expect(daysUntil("2026-09-20", "2026-09-30")).toBe(-10);
  });
  it("shades sooner plans darker, one hue, past ones grey", () => {
    expect(light(shade(0))).toBeLessThan(light(shade(10)));
    expect(light(shade(10))).toBeLessThan(light(shade(60)));
    expect(shade(500)).toBe(shade(90));
    expect(shade(0)).toMatch(/^hsl\(214,/);
    expect(shade(-3)).toMatch(/^hsl\(220, 6%/);
    expect(light(shade(30, 30))).toBe(80);
  });
  it("buckets by when", () => {
    expect([-1, 0, 3, 20, 100].map(bucket)).toEqual(["Past", "Today", "This week", "This month", "Later"]);
  });
  it("converts hsl to hex", () => {
    expect(toHex("hsl(0, 100%, 50%)")).toBe("#ff0000");
    expect(toHex("hsl(214, 90%, 26%)")).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("takes dated stops from a trip plan, joined as one group", () => {
    const p: Plan = { id: "p1", type: "trip", name: "Lisbon", created: 0, checklist: [], items: [
      { id: "a", kind: "point", pts: [[-9.14, 38.72]], name: "Lisbon", date: "2026-10-03" },
      { id: "b", kind: "point", pts: [[-8.61, 41.15]], name: "Porto", date: "2026-10-06" },
      { id: "c", kind: "point", pts: [[-8.4, 40.2]], name: "Undated" },
    ] };
    const out = fromPlan(p);
    expect(out.map((x) => x.title)).toEqual(["Lisbon", "Porto"]);
    expect(out.every((x) => x.group === "p1" && x.source === "Trip")).toBe(true);
  });
  it("dates each step of a journey", () => {
    const j: Journey = { id: "j", name: "Alps", start: "2026-11-01", time: "08:00", origin: { name: "Zürich", lon: 8.54, lat: 47.37 }, created: 0, steps: [
      { id: "s1", kind: "move", mode: "train", to: { name: "Zermatt", lon: 7.75, lat: 46.02 } },
      { id: "s2", kind: "stay", place: { name: "Zermatt", lon: 7.75, lat: 46.02 }, nights: 3, visits: [] },
    ] };
    const out = fromJourney(j);
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe("2026-11-01");
    expect(out[0].sub).toMatch(/arrive/);
    expect(out[1].sub).toMatch(/3 nights/);
    expect(fromJourney({ ...j, start: "" })).toEqual([]);
  });
});
