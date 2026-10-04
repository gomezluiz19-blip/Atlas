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

describe("fields in the brief", () => {
  it("flags a harvest window, irrigation, and quiet fields", () => {
    const items = todayItems({ ...base, weather: null, fields: [{ name: "Top field", crop: "wheat", planted: "2026-03-01" }, { name: "Barn plot", crop: "potato", planted: "2026-04-01" }, { name: "Orchard", crop: "apple", planted: "2026-04-20" }], seasons: [
      { name: "Top field", stage: "Ripening", harvest: ["2026-05-16", "2026-05-24"], irrigate7: 0, m2: 40_000, frost: false },
      { name: "Barn plot", stage: "Tubers bulking", irrigate7: 22, m2: 2000, frost: false, harvest: ["2026-07-01", "2026-07-10"] },
    ] });
    const titles = items.map((i) => i.title);
    expect(titles).toContain("Top field: harvest in about 6 days");
    expect(titles).toContain("Barn plot: irrigate about 22 mm this week");
    expect(items.find((i) => i.title.startsWith("Barn plot: irrigate"))!.detail).toMatch(/44,000 litres/);
    // No season for the orchard: falls back to the planting nudge only if recent (it's 20 days: none).
    expect(titles.some((t) => t.startsWith("Orchard"))).toBe(false);
  });
});

import { makeBackup, readBackup } from "../src/myplaces/backup";
describe("backups", () => {
  it("round-trips Terreno data and never includes the AI settings", () => {
    const store = new Map<string, string>([["atlas.myplaces.v1", "[1]"], ["atlas.ai.v1", '{"key":"sk-secret"}'], ["other.app", "x"]]);
    (globalThis as { localStorage?: unknown }).localStorage = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i], getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    const b = makeBackup();
    expect(Object.keys(b.data)).toEqual(["atlas.myplaces.v1"]);
    expect(readBackup(JSON.stringify(b)).data["atlas.myplaces.v1"]).toBe("[1]");
    expect(() => readBackup(JSON.stringify({ ...b, data: { "atlas.ai.v1": "{}" } }))).toThrow();
    expect(() => readBackup('{"hello":1}')).toThrow();
  });
});

describe("grouped births", () => {
  it("rolls three or more births of one species into one line", () => {
    const ewes = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, species: "sheep", name: "", tag: String(300 + i), status: "Active", bred: `2025-12-${String(18 + i).padStart(2, "0")}`, weights: [], health: [] }));
    const flock = { org: "farm", name: "", paddocks: [], animals: [...ewes, { id: "c", species: "cattle", name: "Daisy", status: "Active", bred: "2025-08-05", weights: [], health: [] }] } as never;
    const items = todayItems({ ...base, weather: null, flock });
    expect(items.filter((i) => /sheep/.test(i.title))).toHaveLength(1);
    expect(items.find((i) => /sheep/.test(i.title))!.title).toBe("5 sheep due to give birth in the next two weeks");
  });
});

describe("disease weather in the brief", () => {
  it("warns about blight for potatoes and flystrike for sheep", () => {
    const flock = { org: "farm", name: "", paddocks: [], animals: [{ id: "s", species: "sheep", name: "", status: "Active", weights: [], health: [] }] } as never;
    const items = todayItems({ ...base, weather: null, flock, fields: [{ name: "Veg patch", crop: "potato", planted: "2026-04-01" }], risks: { hutton: ["2026-05-11"], flystrike: ["2026-05-10", "2026-05-11"] } });
    expect(items.find((i) => i.icon === "🍂")!.title).toBe("Blight weather tomorrow (a Hutton period)");
    expect(items.some((i) => i.title === "Flystrike weather")).toBe(true);
    // No potatoes or tomatoes: no blight line.
    expect(todayItems({ ...base, weather: null, risks: { hutton: ["2026-05-11"], flystrike: [] } }).some((i) => i.icon === "🍂")).toBe(false);
  });
});
