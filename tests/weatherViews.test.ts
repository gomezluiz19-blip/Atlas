import { describe, expect, it } from "vitest";
import { anomalies, climateShift, skySentence, stripeColor, tempColor } from "../src/climate/sky";
import { beaufort, fieldFrom, gridFor, gridPoints, streamlines, toUV, windAt, windColor } from "../src/climate/wind";

describe("the wind field", () => {
  const box = { w: 0, s: 40, e: 10, n: 50 };
  const { nx, ny } = gridFor(box);
  const pts = gridPoints(box, nx, ny);
  it("lays a grid over the view", () => {
    expect(nx * ny).toBe(pts.length);
    expect(pts[0]).toEqual([0, 40]);
    expect(pts[pts.length - 1]).toEqual([10, 50]);
  });
  it("turns 'wind from' into the way it moves", () => {
    const [u, v] = toUV(20, 270); // a westerly blows east
    expect(u).toBeCloseTo(20); expect(v).toBeCloseTo(0);
  });
  it("interpolates and traces streamlines downwind", () => {
    const f = fieldFrom(box, nx, ny, pts.map(([lon, lat]) => ({ lon, lat, speed: 30, dir: 270 })));
    expect(windAt(f, 5, 45)![0]).toBeCloseTo(30);
    expect(windAt(f, 20, 45)).toBeNull();
    const lines = streamlines(f, 6, 30);
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) expect(l.pts[l.pts.length - 1][0]).toBeGreaterThan(l.pts[0][0]);
  });
  it("colours and names wind speeds", () => {
    expect(windColor(0)).not.toBe(windColor(80));
    expect(beaufort(25)).toBe("moderate breeze");
    expect(beaufort(130)).toBe("hurricane force");
  });
});

describe("the sky ring and the stripes", () => {
  const time = Array.from({ length: 48 }, (_, i) => `2026-10-01T${String(i % 24).padStart(2, "0")}:00`.replace("2026-10-01", i < 24 ? "2026-10-01" : "2026-10-02"));
  const base = { time, temperature_2m: time.map((_, i) => 10 + (i % 24) / 2), precipitation: time.map(() => 0), weather_code: time.map(() => 1), wind_speed_10m: time.map(() => 10), is_day: time.map(() => 1), cloud_cover: time.map(() => 10) };
  it("says the next two days in a sentence", () => {
    expect(skySentence({ ...base, precipitation_probability: time.map(() => 5) })).toMatch(/^Dry for the next two days; warmest at 11 pm/);
    expect(skySentence({ ...base, precipitation_probability: time.map((_, i) => (i === 15 ? 80 : 5)) })).toMatch(/^Rain likely from 3 pm \(80%\)/);
    expect(skySentence({ ...base, precipitation_probability: time.map((_, i) => (i === 30 ? 60 : 5)) })).toMatch(/from 6 am tomorrow/);
  });
  it("colours temperatures cold to hot", () => {
    expect(tempColor(-30)).toBe("rgb(40,70,180)");
    expect(tempColor(50)).toBe("rgb(180,30,60)");
  });
  it("measures years against 1961–1990 and colours them", () => {
    const years = Array.from({ length: 70 }, (_, i) => ({ year: 1950 + i, mean: 10 + (i > 40 ? (i - 40) * 0.05 : 0) }));
    const a = anomalies(years);
    expect(a.find((y) => y.year === 1970)!.d).toBeCloseTo(0);
    expect(a[a.length - 1].d).toBeGreaterThan(1);
    expect(stripeColor(-2)).toBe("#08306b");
    expect(stripeColor(2)).toBe("#67000d");
  });
  it("turns warming into a move towards the equator or downhill", () => {
    expect(climateShift(1.2, 51)).toEqual({ km: 220, metres: 180 });
    expect(climateShift(1.2, 5).km).toBeNull();
  });
});

import { decades } from "../src/climate/sky";
describe("hot days and frosty nights by decade", () => {
  it("averages per year and drops thin decades", () => {
    const time: string[] = [], tx: number[] = [], tn: number[] = [];
    for (let y = 1991; y <= 2050; y++) for (let d = 0; d < 10; d++) { time.push(`${y}-07-${String(d + 1).padStart(2, "0")}`); tx.push(y >= 2040 ? 32 : 25); tn.push(y < 2000 ? -1 : 5); }
    const ds = decades(time, tx, tn);
    expect(ds.map((d) => d.decade)).toEqual([1990, 2000, 2010, 2020, 2030, 2040]);
    expect(ds[0]).toEqual({ decade: 1990, hot: 0, frost: 10 });
    expect(ds[5].hot).toBe(10);
  });
});
