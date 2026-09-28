import { describe, expect, it } from "vitest";
import { FLAG_COUNTRIES, flag, kindOf, priceOf } from "../src/work/learnData";
import { award, dailyIndex, dailyPlayed, stamp, type Passport } from "../src/work/passport";
import { bearing, travel } from "../src/work/flight";

const fresh = (): Passport => ({ stamps: {}, badges: {}, streak: { last: "", days: 0 }, flights: 0 });

describe("learn data", () => {
  it("makes flag emoji and names countries", () => {
    expect(flag("fr")).toBe("🇫🇷");
    expect(FLAG_COUNTRIES.length).toBe(50);
    expect(FLAG_COUNTRIES.find((c) => c.capital === "Santo Domingo")).toMatchObject({ country: "Dominican Republic", iso: "DO", the: true });
    expect(FLAG_COUNTRIES.find((c) => c.capital === "Tokyo")).toMatchObject({ country: "Japan", the: false });
  });
  it("sorts places to learn and reads prices", () => {
    expect(kindOf({ amenity: "library" })).toBe("library");
    expect(kindOf({ tourism: "museum", museum: "science" })).toBe("science");
    expect(kindOf({ tourism: "aquarium" })).toBe("nature");
    expect(kindOf({ historic: "castle" })).toBe("history");
    expect(kindOf({ tourism: "museum" })).toBe("museum");
    expect(kindOf({ shop: "books" })).toBeNull();
    expect(priceOf({ fee: "no" })).toBe("free");
    expect(priceOf({ fee: "yes" })).toBe("paid");
    expect(priceOf({ amenity: "library" })).toBe("free");
    expect(priceOf({ tourism: "museum" })).toBe("unknown");
  });
});

describe("passport", () => {
  it("stamps each country once and awards badges", () => {
    const p = fresh();
    expect(stamp(p, "France")).toEqual(["stamp1"]);
    expect(stamp(p, "France")).toEqual([]);
    for (const c of ["Spain", "Italy", "Peru"]) stamp(p, c);
    expect(stamp(p, "Kenya")).toEqual(["stamp5"]);
    expect(award(p, "pilot")).toBe(true);
    expect(award(p, "pilot")).toBe(false);
  });
  it("counts a daily streak and resets after a gap", () => {
    const p = fresh();
    dailyPlayed(p, "2026-03-01");
    dailyPlayed(p, "2026-03-02");
    expect(dailyPlayed(p, "2026-03-03")).toEqual(["streak3"]);
    expect(p.streak.days).toBe(3);
    expect(dailyPlayed(p, "2026-03-03")).toEqual([]);
    dailyPlayed(p, "2026-03-05");
    expect(p.streak.days).toBe(1);
    expect(dailyIndex(100, "2026-03-05")).toBe(dailyIndex(100, "2026-03-05"));
  });
});

describe("flight maths", () => {
  it("flies along great circles", () => {
    const [lon, lat] = travel(0, 0, 90, 111.195);
    expect(lon).toBeCloseTo(1, 2);
    expect(lat).toBeCloseTo(0, 5);
    const b = bearing([-0.13, 51.51], [2.35, 48.86]); // London to Paris
    expect(b.km).toBeCloseTo(344, -1);
    expect(b.deg).toBeGreaterThan(140);
    expect(b.deg).toBeLessThan(160);
  });
});
