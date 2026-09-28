import { describe, expect, it } from "vitest";
import { sowingTasks, upcoming } from "../src/myplaces/calendar";

describe("sowing calendar", () => {
  it("works back from the last frost", () => {
    const t = sowingTasks(110, 290); // last frost ~20 Apr, first ~17 Oct
    const tom = t.filter((x) => x.crop === "Tomatoes");
    expect(tom.find((x) => x.what === "Sow indoors")).toMatchObject({ from: 54, to: 68 });
    expect(tom.find((x) => x.what === "Plant out")).toMatchObject({ from: 117, to: 131 });
  });
  it("drops tender crops when the season is too short", () => {
    const t = sowingTasks(160, 230); // a short upland season
    expect(t.some((x) => x.crop === "Aubergines")).toBe(false);
    expect(t.some((x) => x.crop === "Peas")).toBe(true);
  });
  it("has nothing to say where there's no frost", () => {
    expect(sowingTasks(null, null)).toEqual([]);
  });
  it("lists what's open now and coming up", () => {
    const t = sowingTasks(110, 290);
    const u = upcoming(t, 60, 4);
    expect(u[0].now).toBe(true);
    expect(u.some((x) => x.crop === "Tomatoes" && x.what === "Sow indoors" && x.now)).toBe(true);
    expect(u.every((x) => x.inDays <= 28)).toBe(true);
  });
});

describe("autumn jobs", () => {
  it("adds garlic and overwintering sowings from the first autumn frost", () => {
    const t = sowingTasks(110, 290);
    expect(t.find((x) => x.crop === "Garlic")).toMatchObject({ what: "Plant out", from: 276, to: 332 });
    const u = upcoming(t, 271, 6); // 28 September
    expect(u.some((x) => x.crop === "Garlic")).toBe(true);
    expect(u.some((x) => /Broad beans/.test(x.crop))).toBe(true);
  });
});
