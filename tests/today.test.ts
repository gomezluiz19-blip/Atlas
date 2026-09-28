import { describe, expect, it } from "vitest";
import { todayItems } from "../src/myplaces/today";
import type { SiteDay } from "../src/data/openmeteo";

const day = (date: string, o: Partial<SiteDay> = {}): SiteDay => ({ date, rain: 0, rainChance: 0, windMax: 10, gustMax: 20, tmin: 8, tmax: 18, ...o });
const base = { today: "2026-05-10", flock: null, fields: [], builds: [] };

describe("today at your place", () => {
  it("says it's a good day when the weather is calm", () => {
    const items = todayItems({ ...base, weather: [day("2026-05-10"), day("2026-05-11"), day("2026-05-12"), day("2026-05-13")] });
    expect(items[0].title).toMatch(/good day/);
  });
  it("puts tonight's frost first, with advice for crops", () => {
    const items = todayItems({ ...base, fields: [{ name: "Top field", crop: "wheat", planted: "2026-05-01" }], weather: [day("2026-05-10", { tmin: -1 }), day("2026-05-11")] });
    expect(items[0].title).toMatch(/Frost today/);
    expect(items[0].detail).toMatch(/seedlings/);
    expect(items[0].urgency).toBe("now");
    expect(items.some((i) => i.title.startsWith("Top field"))).toBe(true);
  });
  it("flags heavy rain and gales", () => {
    const items = todayItems({ ...base, weather: [day("2026-05-10"), day("2026-05-11", { rain: 32, gustMax: 75 })] });
    expect(items.map((i) => i.title).join(" ")).toMatch(/Heavy rain tomorrow.*|Strong wind tomorrow/);
    expect(items.some((i) => /Strong wind/.test(i.title))).toBe(true);
  });
  it("lists animals due, overdue first", () => {
    const flock = { org: "farm" as const, name: "", paddocks: [], animals: [
      { id: "a", species: "sheep", name: "Daisy", bred: "2025-12-20", weights: [], health: [], photos: [] },
      { id: "b", species: "cattle", name: "Bramble", weights: [], health: [{ id: "h", date: "2026-04-01", kind: "vaccination" as const, text: "Booster", due: "2026-05-08" }], photos: [] },
    ] } as never;
    const items = todayItems({ ...base, weather: null, flock });
    expect(items[0].title).toMatch(/Bramble: booster \(overdue\)/);
    expect(items[0].detail).toBe("Was due 2 days ago.");
    expect(items.some((i) => i.title.startsWith("Daisy"))).toBe(true);
  });
});
