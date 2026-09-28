import { describe, expect, it } from "vitest";
import { frostSeason, slopeAspect, yearly, type ClimateDay } from "../src/myplaces/reportModel";

/** A synthetic climate: sinusoidal minimum temperature peaking in July (north). */
function climate(minMean: number, amp: number, years = 5, south = false): ClimateDay[] {
  const out: ClimateDay[] = [];
  for (let y = 2018; y < 2018 + years; y++)
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86_400_000) {
      const d = new Date(t), doy = (t - Date.UTC(y, 0, 1)) / 86_400_000;
      const s = Math.cos(((doy - 196) / 365) * 2 * Math.PI) * (south ? -1 : 1);
      out.push({ date: d.toISOString().slice(0, 10), tmin: minMean + amp * s, tmax: minMean + amp * s + 10, rain: 2 });
    }
  return out;
}

describe("place report numbers", () => {
  it("finds spring and autumn frost dates in a temperate climate", () => {
    const f = frostSeason(climate(5, 8), 52);
    expect(f.years).toBe(5);
    expect(f.lastSpring).toBeGreaterThan(50);   // March–April
    expect(f.lastSpring).toBeLessThan(130);
    expect(f.firstAutumn).toBeGreaterThan(260); // October–November
    expect(f.freeDays).toBeGreaterThan(150);
    expect(f.freeDays).toBeLessThan(300);
  });
  it("says frost is rare in the tropics, and flips seasons in the south", () => {
    expect(frostSeason(climate(20, 4), 5)).toMatchObject({ lastSpring: null, firstAutumn: null, freeDays: 365, frostDays: 0 });
    const s = frostSeason(climate(5, 8, 5, true), -40);
    // Southern last spring frost falls in September–October.
    expect(s.lastSpring).toBeGreaterThan(240);
    expect(s.lastSpring).toBeLessThan(310);
  });
  it("adds up heat units and rain", () => {
    const y = yearly(climate(5, 8));
    expect(y.rain).toBe(730);
    expect(y.gdd).toBeGreaterThan(300);
  });
  it("reads slope and aspect from a 3x3 grid", () => {
    // Higher to the north: faces south, 45° at 10 m cells with 10 m rise per cell.
    const z = [20, 20, 20, 10, 10, 10, 0, 0, 0];
    const r = slopeAspect(z, 10);
    expect(r.faces).toBe("south");
    expect(Math.round(r.slope)).toBe(45);
    expect(slopeAspect([5, 5, 5, 5, 5, 5, 5, 5, 5], 10).faces).toBe("flat");
  });
});
