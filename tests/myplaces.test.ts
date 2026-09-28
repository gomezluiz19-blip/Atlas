import { describe, expect, it } from "vitest";
import { monthly, ringAreaM2, roofHarvestLitres, solarByMonth } from "../src/myplaces/estimates";
import { blankPlace, PlaceStore, sanitize } from "../src/myplaces/store";
import { buildingHeight, cameraSector, contains, ownBuilding } from "../src/myplaces/scene";
import { plan } from "../src/robot/plan";

describe("my places", () => {
  it("sanitizes stored and imported places", () => {
    const good = blankPlace("Hotel", -70.25, 19.3, "hotel");
    good.devices.push({ id: "d", type: "camera", lon: -70.25, lat: 19.3, heading: 90 });
    const out = sanitize([good, { name: "bad", lon: 500, lat: 0 }, null, { ...good, id: "x", devices: [{ type: "laser", lon: 0, lat: 0 }] }]);
    expect(out).toHaveLength(2);
    expect(out[0].devices[0].type).toBe("camera");
    expect(out[1].devices).toEqual([]);
    expect(sanitize("nope")).toEqual([]);
  });

  it("estimates solar and rain from daily data", () => {
    const time = ["2024-01-01", "2024-01-02", "2024-07-01"];
    const s = monthly(time, [18, 18, 36], [10, 20, 5], "2024");
    expect(s.sunKwhM2[0]).toBeCloseTo(5);
    expect(s.sunKwhM2[6]).toBeCloseTo(10);
    expect(s.rainMm[0]).toBe(30);
    const pv = solarByMonth(4, s);
    expect(pv[0]).toBeCloseTo(4 * 5 * 0.75 * 31);
    expect(roofHarvestLitres(100, s)).toBeCloseTo(100 * 35 * 0.8);
  });

  it("measures a roof", () => {
    // About 20 m × 10 m at the equator.
    const d = 1 / 111_320;
    expect(ringAreaM2([[0, 0], [20 * d, 0], [20 * d, 10 / 110_540], [0, 10 / 110_540]])).toBeCloseTo(200, 0);
  });

  it("finds saved places by name or kind, as the robot asks for them", () => {
    const s = new PlaceStore();
    s.save(blankPlace("Hotel Yaluma", -70.25, 19.3, "hotel"));
    s.save(blankPlace("Grandma's house", -70.2, 19.2, "home"));
    expect(s.find("my hotel")?.name).toBe("Hotel Yaluma");
    expect(s.find("hotel yaluma")?.name).toBe("Hotel Yaluma");
    expect(s.find("home")?.name).toBe("Grandma's house");
    const p = plan("weather at my hotel").place;
    expect(p?.kind === "query" && s.find(p.text)?.name).toBe("Hotel Yaluma");
  });

  it("reads building heights and outlines", () => {
    expect(buildingHeight({ building: "yes", height: "12.5" })).toEqual({ height: 12.5, source: "mapped" });
    expect(buildingHeight({ building: "hotel", "building:levels": "3" }).source).toBe("floors");
    expect(buildingHeight({ building: "house" })).toEqual({ height: 6, source: "guess" });
    const sq: [number, number][] = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]];
    expect(contains(sq, 0.0005, 0.0005)).toBe(true);
    expect(contains(sq, 0.002, 0.0005)).toBe(false);
    const b = { ring: sq, height: 6, heightSource: "guess" as const, tags: {} };
    expect(ownBuilding([b], 0.0005, 0.0005)).toBe(b);
    expect(ownBuilding([b], 0.01, 0.01)).toBeNull();
  });

  it("draws a camera's view as a wedge", () => {
    const w = cameraSector({ id: "c", type: "camera", lon: 0, lat: 0, heading: 90, fov: 90, range: 20 }, 2);
    expect(w).toHaveLength(4);
    expect(w[2][0]).toBeGreaterThan(0); // the middle ray points east
    expect(Math.abs(w[2][1])).toBeLessThan(1e-9);
  });
});
