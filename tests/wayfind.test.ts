import { describe, expect, it } from "vitest";
import { aheadOf, bearing, compassPoint, distanceText, etaText, guessDestination, km, motionOf, offset, paceOf, passingNow, ribbonX, scaleFor, sideText, turnFrom, type Candidate, type Fix, type Poi } from "../src/wayfind/model";
import { decode6, parseRoute, progress, routeUrl } from "../src/wayfind/route";
import { DULL, parseGeo } from "../src/wayfind/pois";
import { soonPlans } from "../src/wayfind/candidates";
import { axiformaFaces } from "../src/ui/fonts";

const at = { lon: 0, lat: 0 };
const poi = (id: string, lon: number, lat: number, weight = 2, kind = "peak"): Poi => ({ id, name: id, kind, lon, lat, weight, line: `${id} line` });
/** A walk east along the equator: one fix a second at `kmh`. */
const walk = (kmh: number, n = 20, bearingDeg = 90): Fix[] => Array.from({ length: n }, (_, i) => ({ ...offset(at, bearingDeg, (kmh / 3600) * i), t: i * 1000 }));

describe("wayfinder geometry", () => {
  it("measures distance and bearing on the sphere", () => {
    expect(km({ lon: 0, lat: 0 }, { lon: 1, lat: 0 })).toBeCloseTo(111.19, 1);
    expect(bearing(at, { lon: 1, lat: 0 })).toBeCloseTo(90, 5);
    expect(bearing(at, { lon: 0, lat: -1 })).toBeCloseTo(180, 5);
    const p = offset(at, 45, 10);
    expect(km(at, p)).toBeCloseTo(10, 5);
    expect(bearing(at, p)).toBeCloseTo(45, 3);
  });
  it("folds turns into ±180 and names points", () => {
    expect(turnFrom(350, 10)).toBe(20);
    expect(turnFrom(10, 350)).toBe(-20);
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(134)).toBe("SE");
  });
});

describe("motion", () => {
  it("reads heading, speed and steadiness from fixes", () => {
    const m = motionOf(walk(5))!;
    expect(m.heading).toBeCloseTo(90, 0);
    expect(m.speedKmh).toBeCloseTo(5, 0);
    expect(m.steady).toBeGreaterThan(0.95);
    expect(paceOf(m.speedKmh)).toBe("walk");
  });
  it("is null when standing still, and a zig-zag is unsteady", () => {
    expect(motionOf([{ ...at, t: 0 }, { ...at, t: 5000 }])).toBeNull();
    const zig: Fix[] = Array.from({ length: 12 }, (_, i) => ({ ...offset(at, 90, i * 0.01), t: i * 1000 })).map((f, i) => ({ ...offset(f, i % 2 ? 0 : 180, 0.05), t: f.t }));
    expect(motionOf(zig)!.steady).toBeLessThan(0.5);
  });
  it("names paces by speed", () => {
    expect([0.5, 4, 10, 20, 90, 250, 800].map(paceOf)).toEqual(["still", "walk", "run", "cycle", "drive", "rail", "fly"]);
  });
});

describe("what's ahead and what you're passing", () => {
  const pois = [poi("ahead", 0.05, 0), poi("left", 0, 0.02), poi("behind", -0.05, 0), poi("far", 3, 0), poi("minor", 0.04, 0.001, 1)];
  it("finds things in the cone ahead, landmarks first", () => {
    const a = aheadOf(at, 90, pois, { rangeKm: 20, coneDeg: 40 });
    expect(a.map((s) => s.poi.id)).toEqual(["ahead", "minor"]);
    expect(aheadOf(at, 90, pois, { rangeKm: 20, minWeight: 2 }).map((s) => s.poi.id)).toEqual(["ahead"]);
  });
  it("tells you what's beside you, once", () => {
    const s = passingNow(at, 90, pois, 3, new Set())!;
    expect(s.poi.id).toBe("left");
    expect(sideText(s.rel)).toBe("on your left");
    expect(passingNow(at, 90, pois, 3, new Set(["left"]))).toBeNull();
  });
  it("places sightings on the ribbon", () => {
    expect(ribbonX(0)).toBe(0.5);
    expect(ribbonX(-80)).toBe(0);
    expect(ribbonX(100)).toBeNull();
  });
  it("widens with height", () => {
    expect(scaleFor(500).minWeight).toBe(1);
    expect(scaleFor(200_000).minWeight).toBe(2);
    expect(scaleFor(2_000_000).minWeight).toBe(3);
    expect(scaleFor(2_000_000).rangeKm).toBeGreaterThan(scaleFor(20_000).rangeKm);
  });
});

describe("guessing where you're going", () => {
  const home: Candidate = { id: "home", name: "Home", lon: 0.03, lat: 0.001, why: "home", weight: 3 };
  const cafe: Candidate = { id: "cafe", name: "Café", lon: 0.025, lat: -0.012, why: "recent", weight: 1.5 };
  const behind: Candidate = { id: "gym", name: "Gym", lon: -0.03, lat: 0, why: "saved", weight: 2 };
  const m = motionOf(walk(5))!;
  it("picks the place you're walking toward", () => {
    const g = guessDestination(at, m, [home, cafe, behind], { hour: 18 })!;
    expect(g.c.id).toBe("home");
    expect(g.eta).toBeGreaterThan(30);
    expect(g.confidence).toBeGreaterThan(0.5);
  });
  it("won't guess behind you, out of reach, or on a wandering path", () => {
    expect(guessDestination(at, m, [behind])).toBeNull();
    expect(guessDestination(at, m, [{ ...home, lon: 2 }])).toBeNull();
    expect(guessDestination(at, { ...m, steady: 0.3 }, [home])).toBeNull();
  });
  it("only shows a clear winner", () => {
    const twin: Candidate = { ...home, id: "twin", why: "saved", weight: 3, lat: -0.001 };
    expect(guessDestination(at, m, [home, twin], { hour: 10 })).toBeNull();
  });
  it("counts today's plans", () => {
    const out = soonPlans([{ id: "a", title: "Lunch", date: "2026-10-05", lon: 1, lat: 1 }, { id: "b", title: "Later", date: "2026-11-30", lon: 1, lat: 1 }], "2026-10-05");
    expect(out.map((c) => c.name)).toEqual(["Lunch"]);
  });
});

describe("words", () => {
  it("says distances and times plainly", () => {
    expect(distanceText(0.234)).toBe("230 m");
    expect(distanceText(3.26)).toBe("3.3 km");
    expect(distanceText(1234)).toBe("1,234 km");
    expect(etaText(0.5)).toBe("under a minute");
    expect(etaText(42)).toBe("42 min");
    expect(etaText(125)).toBe("2 h 5 min");
    expect(etaText(null)).toBe("");
  });
});

describe("routes", () => {
  it("decodes Valhalla's polyline6", () => {
    // Two points: (38.5, -120.2) and (40.7, -120.95), encoded at 1e6.
    const enc = "_izlhA~rlgdF_{geC~ywl@";
    const pts = decode6(enc);
    expect(pts[0].lat).toBeCloseTo(38.5, 5);
    expect(pts[0].lon).toBeCloseTo(-120.2, 5);
    expect(pts[1].lat).toBeCloseTo(40.7, 5);
  });
  it("builds a request and follows progress along the shape", () => {
    expect(routeUrl(at, { lon: 1, lat: 1 }, "pedestrian")).toContain("%22costing%22%3A%22pedestrian%22");
    const r = parseRoute({ trip: { summary: { length: 2, time: 1500 }, legs: [{ shape: "", maneuvers: [] }] } });
    expect(r).toBeNull();
    const route = { shape: [0, 1, 2, 3, 4].map((i) => offset(at, 90, i * 0.5)), km: 2, minutes: 25, steps: [{ text: "Start", km: 1, at: 0 }, { text: "Turn left", km: 1, at: 2 }, { text: "Arrive", km: 0, at: 4 }] };
    const p = progress(route, offset(at, 90, 0.3));
    expect(p.next?.text).toBe("Turn left");
    expect(p.toNextKm).toBeCloseTo(0.5, 2);
    expect(p.leftKm).toBeCloseTo(1.5, 2);
  });
});

describe("street-level finds", () => {
  it("keeps what's worth passing from Wikipedia", () => {
    const out = parseGeo({ query: { pages: [
      { pageid: 1, title: "Cologne Cathedral", description: "Gothic cathedral in Cologne, Germany", coordinates: [{ lat: 50.94, lon: 6.96 }], thumbnail: { source: "x" } },
      { pageid: 2, title: "Hohe Straße", description: "street in Cologne", coordinates: [{ lat: 50.93, lon: 6.95 }] },
      { pageid: 3, title: "No place", description: "a thing" },
    ] } });
    expect(out.map((p) => p.name)).toEqual(["Cologne Cathedral"]);
    expect(out[0].line).toBe("Gothic cathedral in Cologne, Germany");
    expect(DULL.test("Bus station in Lyon")).toBe(true);
  });
});

describe("house type", () => {
  it("serves Axiforma files only when they're there", () => {
    const none = axiformaFaces(() => false);
    expect(none).toContain('local("Axiforma Heavy")');
    expect(none).not.toContain("url(");
    const some = axiformaFaces((f) => f === "Axiforma-Regular.woff2", "/x/");
    expect(some).toContain('url("/x/Axiforma-Regular.woff2") format("woff2")');
    expect(some.match(/url\(/g)).toHaveLength(1);
  });
});
