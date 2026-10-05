import { describe, expect, it } from "vitest";
import { solarMoment, sunsetSolarHour } from "../src/render/grade";
import { kindOf } from "../src/render/import3d";
import { baseDepth, upMatrix } from "../src/render/splat/globe";
import { demoSplat, parseSplat, bounds } from "../src/render/splat/format";
import { guessScale, guessUp, metres, splatBudget, splatsText } from "../src/render/studio";

describe("grades: the sun", () => {
  it("sets at 6 pm solar at the equinox anywhere off the poles", () => {
    expect(sunsetSolarHour(0, 81)).toBeCloseTo(18, 1);
    expect(sunsetSolarHour(51.5, 81)).toBeCloseTo(18, 1);
  });
  it("sets later in a northern summer and earlier in winter", () => {
    expect(sunsetSolarHour(51.5, 172)).toBeGreaterThan(20);
    expect(sunsetSolarHour(51.5, 355)).toBeLessThan(16.2);
  });
  it("has no sunset in polar day or night", () => {
    expect(sunsetSolarHour(78, 172)).toBe(-1);
    expect(sunsetSolarHour(78, 355)).toBe(-1);
  });
  it("turns local solar time into UTC by longitude", () => {
    const d = new Date(Date.UTC(2026, 5, 21, 9));
    expect(solarMoment(d, 0, 12).toISOString()).toBe("2026-06-21T12:00:00.000Z");
    expect(solarMoment(d, -75, 12).toISOString()).toBe("2026-06-21T17:00:00.000Z");
    expect(solarMoment(d, 135, 18).toISOString()).toBe("2026-06-21T09:00:00.000Z");
  });
});

describe("bringing 3D in", () => {
  it("tells links and files apart", () => {
    expect(kindOf("https://x.org/city/tileset.json")).toBe("tiles");
    expect(kindOf("https://x.org/tileset.json?key=1")).toBe("tiles");
    expect(kindOf("96188")).toBe("ion");
    expect(kindOf("chair.GLB")).toBe("model");
    expect(kindOf("https://x.org/a.gltf?v=2")).toBe("model");
    expect(kindOf("scan.ply")).toBe("capture");
    expect(kindOf("garden.spz")).toBe("capture");
    expect(kindOf("notes.txt")).toBeNull();
  });
  it("turns each capture's up into glTF's Y-up", () => {
    const apply = (m: number[], v: number[]) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + 0);
    expect(apply(upMatrix("z"), [0, 0, 1])).toEqual([0, 1, 0]);
    expect(apply(upMatrix("-y"), [0, -1, 0])).toEqual([0, 1, 0]);
    expect(apply(upMatrix("y"), [0, 1, 0])).toEqual([0, 1, 0]);
  });
  it("stands a capture on its lowest splat", () => {
    const c = { min: [-1, -2, -3], max: [1, 4, 5] };
    expect(baseDepth(c, "y")).toBe(2);
    expect(baseDepth(c, "z")).toBe(3);
    expect(baseDepth(c, "-y")).toBe(4);
  });
});

describe("3D Studio", () => {
  it("makes a readable demo capture", () => {
    const c = parseSplat(demoSplat(5000));
    expect(c.count).toBe(5000);
    const b = bounds(c);
    expect(b.min[1]).toBeGreaterThanOrEqual(0);
    expect(b.max[1]).toBeLessThan(1.3);
    expect(b.radius).toBeGreaterThan(1);
    expect(b.radius).toBeLessThan(2);
  });
  it("guesses scale and which way is up", () => {
    expect(guessScale(1.5)).toBe(1);
    expect(guessScale(0.01)).toBe(100);
    expect(guessScale(20_000)).toBe(0.01);
    expect(guessUp("point_cloud.ply", [0, 0, 0], [1, 1, 1])).toBe("-y");
    expect(guessUp("street.ply", [0, 0, 0], [100, 80, 6])).toBe("z");
    expect(guessUp("statue.spz", [-1, 0, -1], [1, 3, 1])).toBe("y");
  });
  it("words sizes and budgets", () => {
    expect(splatsText(1_234_567)).toBe("1.2M splats");
    expect(splatsText(60_000)).toBe("60k splats");
    expect(splatsText(12)).toBe("12 splats");
    expect(metres(3.31)).toBe("3.3 m");
    expect(metres(133.2)).toBe("133 m");
    expect(metres(1400)).toBe("1.4 km");
    expect(splatBudget("low")).toBeLessThan(splatBudget("mid"));
    expect(splatBudget("mid")).toBeLessThan(splatBudget("high"));
  });
});
