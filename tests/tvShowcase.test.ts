import { describe, expect, it } from "vitest";
import { ROOMS, SCENE_LABELS, TOOLS } from "../src/tv/rooms";
import { readingValues, SHOW_PLACES } from "../src/tv/showcase";
import type { NowHere } from "../src/live/nowHere";

const base: NowHere = { place: { name: "Fuji", lon: 138.7, lat: 35.4 }, time: "2026-10-06T03:00:00Z", sun: { altitudeDeg: 41.6, azimuthDeg: 180, phase: "day", sunsetLocal: "17:21" }, events: [], missing: [] };

describe("TV showcase", () => {
  it("turns a live reading into board values", () => {
    const v = readingValues({ ...base, timezone: "Asia/Tokyo",
      weather: { temperatureC: 12.4, feelsLikeC: 11, condition: "Partly cloudy", humidityPct: 60, windKmh: 9, windFrom: "W", precipitationMm: 0, isDay: true },
      air: { usAqi: 31, quality: "good" }, aircraft: { count: 3, withinKm: 40, source: "x" },
      earthquake: { magnitude: 4.66, place: "x", distanceKm: 120, hoursAgo: 5 } });
    expect(v.weather).toBe("12° · Partly cloudy");
    expect(v.sun).toBe("Up 42° · sets 17:21");
    expect(v.air).toBe("Good · AQI 31");
    expect(v.sky).toBe("3 planes within 40 km");
    expect(v.near).toBe("M4.7 quake, 120 km");
    expect(v.time).toMatch(/\d\d:\d\d/);
  });
  it("says plainly what it couldn't read", () => {
    const v = readingValues({ ...base, sun: { altitudeDeg: -20, azimuthDeg: 0, phase: "night", sunriseLocal: "05:40" } });
    expect(v.weather).toBeNull();
    expect(v.air).toBeNull();
    expect(v.sun).toBe("Night · rises 05:40");
    expect(v.near).toBe("Nothing reported");
  });
  it("names every scene a room plays, and every scene tool", () => {
    for (const r of ROOMS) for (const s of r.scenes) expect(SCENE_LABELS[s]).toBeTruthy();
    for (const id of Object.keys(TOOLS).filter((k) => k.startsWith("scene:"))) expect(SCENE_LABELS[id.slice(6) as keyof typeof SCENE_LABELS]).toBeTruthy();
  });
  it("has real coordinates for every showcase place", () => {
    for (const p of SHOW_PLACES) { expect(Math.abs(p.lat)).toBeLessThanOrEqual(90); expect(Math.abs(p.lon)).toBeLessThanOrEqual(180); expect(p.radius).toBeGreaterThan(0); }
  });
});
