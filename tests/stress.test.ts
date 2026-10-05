// Load: the pure engines under far more than they'll see, with time limits a phone would notice past.
import { describe, expect, it } from "vitest";
import { aheadOf, guessDestination, motionOf, offset, passingNow, type Candidate, type Fix, type Poi } from "../src/wayfind/model";
import { progress } from "../src/wayfind/route";
import { basePois } from "../src/wayfind/pois";
import { FEATURES } from "../src/content/features";
import { cleanHandle, validEmail } from "../src/auth/model";

const rnd = (() => { let s = 42; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const ms = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };

describe("under load", () => {
  const pois: Poi[] = Array.from({ length: 20_000 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "peak", lon: rnd() * 360 - 180, lat: rnd() * 170 - 85, weight: 1 + (i % 3), line: "" }));
  it("finds what's ahead among 20,000 places fast enough to run every frame", () => {
    const t = ms(() => { for (let i = 0; i < 20; i++) aheadOf({ lon: rnd() * 360 - 180, lat: rnd() * 120 - 60 }, rnd() * 360, pois, { rangeKm: 800, coneDeg: 80, limit: 7 }); });
    expect(t / 20).toBeLessThan(25);
  });
  it("finds what's being passed among 20,000 places, once each", () => {
    const told = new Set<string>();
    let found = 0;
    const t = ms(() => { for (let i = 0; i < 200; i++) { const s = passingNow(offset({ lon: 10, lat: 45 }, 90, i * 2), 90, pois, 150, told); if (s) { told.add(s.poi.id); found++; } } });
    expect(new Set(told).size).toBe(found);
    expect(t / 200).toBeLessThan(15);
  });
  it("reads motion from a long noisy GPS trace", () => {
    // A walk north-east at 5 km/h with GPS noise of a few metres on every fix.
    const fixes: Fix[] = Array.from({ length: 5000 }, (_, i) => ({ ...offset(offset({ lon: 0, lat: 0 }, 45, i * 0.0014), rnd() * 360, rnd() * 0.005), t: i * 1000 }));
    const m = motionOf(fixes, 30_000)!;
    expect(m.heading).toBeGreaterThan(30);
    expect(m.heading).toBeLessThan(60);
    expect(m.speedKmh).toBeGreaterThan(3);
  });
  it("guesses among hundreds of saved places", () => {
    const cands: Candidate[] = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, lon: rnd() * 2 - 1, lat: rnd() * 2 - 1, why: "saved", weight: 2 }));
    const m = { heading: 90, speedKmh: 40, steady: 0.95 };
    expect(ms(() => { for (let i = 0; i < 100; i++) guessDestination({ lon: 0, lat: 0 }, m, cands); }) / 100).toBeLessThan(5);
  });
  it("follows a 20,000-point route quickly", () => {
    const shape = Array.from({ length: 20_000 }, (_, i) => offset({ lon: 0, lat: 0 }, 90, i * 0.01));
    const route = { shape, km: 200, minutes: 150, steps: Array.from({ length: 400 }, (_, i) => ({ text: `Step ${i}`, km: 0.5, at: i * 50 })) };
    const t = ms(() => { for (let i = 0; i < 20; i++) progress(route, offset({ lon: 0, lat: 0 }, 90, i * 5)); });
    expect(t / 20).toBeLessThan(40);
  });
  it("builds the bundled places once, with sane ids and coordinates", () => {
    const all = basePois();
    expect(all.length).toBeGreaterThan(FEATURES.length * 0.8);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) { expect(Number.isFinite(p.lon) && Number.isFinite(p.lat)).toBe(true); expect(Math.abs(p.lat)).toBeLessThanOrEqual(90); }
    expect(basePois()).toBe(all);
  });
  it("cleans and checks thousands of hostile inputs without throwing", () => {
    const junk = Array.from({ length: 5000 }, () => Array.from({ length: Math.floor(rnd() * 80) }, () => String.fromCharCode(Math.floor(rnd() * 0xffff))).join(""));
    for (const s of junk) { const h = cleanHandle(s); expect(h).toMatch(/^[a-z0-9._]*$/); expect(h.length).toBeLessThanOrEqual(24); validEmail(s); }
    expect(validEmail("a@b.co" + "x".repeat(300))).toBe(false);
  });
});
