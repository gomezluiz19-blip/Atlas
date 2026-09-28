import { describe, expect, it } from "vitest";
import { YEARS, nearestYear, yearLabel } from "../src/data/history";
import { TEMPLATES, deckFromJson, slideSeconds } from "../src/work/presentModel";
import { coverCrop, outputSize, pickMime, wrap, clock } from "../src/work/videoModel";
import { CROPS, cropById, gddDay, kcAt, mergeDays, season, stageAt, effectiveRain, type Day } from "../src/work/growModel";

describe("history", () => {
  it("labels BC and AD years", () => {
    expect(yearLabel(-323)).toBe("323 BC");
    expect(yearLabel(1914)).toBe("AD 1914");
  });
  it("finds the nearest snapshot", () => {
    expect(nearestYear(1916)).toBe(1914);
    expect(nearestYear(1492)).toBe(1492);
    expect(nearestYear(-50)).toBe(-1);
    expect(YEARS).toContain(nearestYear(3000));
  });
});

describe("presentations", () => {
  let n = 0;
  const id = () => `id${n++}`;
  it("templates use real snapshot years and valid cameras", () => {
    for (const t of TEMPLATES) for (const s of t.slides) {
      if (s.year !== undefined) expect(YEARS).toContain(s.year);
      expect(Math.abs(s.camera.lat)).toBeLessThanOrEqual(90);
      expect(s.camera.pitch).toBeLessThan(0);
    }
  });
  it("reads an exported deck and rejects bad slides", () => {
    const d = deckFromJson({ name: "Rome", slides: [
      { title: "A", text: "b", camera: { lon: 12, lat: 41, height: 1e5, heading: 0, pitch: -1, roll: 0 }, year: 100, layers: ["net:rail", 3], thumb: "javascript:x" },
      { title: "bad", camera: { lon: "x" } },
    ] }, id)!;
    expect(d.name).toBe("Rome");
    expect(d.slides).toHaveLength(1);
    expect(d.slides[0].layers).toEqual(["net:rail"]);
    expect(d.slides[0].thumb).toBeUndefined();
    expect(deckFromJson({ foo: 1 }, id)).toBeNull();
  });
  it("gives longer slides more time", () => {
    const cam = TEMPLATES[0].slides[0].camera;
    expect(slideSeconds({ id: "", title: "Hi", text: "", camera: cam })).toBe(6);
    expect(slideSeconds({ id: "", title: "Hi", text: "x".repeat(200), camera: cam })).toBeGreaterThan(10);
    expect(slideSeconds({ id: "", title: "", text: "", camera: cam, seconds: 3 })).toBe(3);
  });
});

describe("video", () => {
  it("crops to fill without stretching", () => {
    const c = coverCrop(2000, 1000, 1080, 1080);
    expect(c.sw).toBeCloseTo(1000);
    expect(c.sh).toBeCloseTo(1000);
    expect(c.sx).toBeCloseTo(500);
    expect(c.sy).toBeCloseTo(0);
  });
  it("sizes outputs with even dimensions", () => {
    expect(outputSize("wide", 800, 600)).toEqual({ w: 1920, h: 1080 });
    expect(outputSize("screen", 3001, 1501)).toEqual({ w: 1920, h: 960 });
  });
  it("picks a supported format", () => {
    expect(pickMime((t) => t === "video/mp4")).toEqual({ mime: "video/mp4", ext: "mp4" });
    expect(pickMime(() => false)).toBeNull();
  });
  it("wraps captions", () => {
    const lines = wrap("one two three four five", 9, (s) => s.length);
    expect(lines).toEqual(["one two", "three", "four five"]);
    expect(wrap("a b c d e f", 1, (s) => s.length, 2)).toHaveLength(2);
    expect(clock(65_000)).toBe("1:05");
  });
});

describe("grow", () => {
  it("computes growing degree days with base and cap", () => {
    expect(gddDay(30, 20, 10)).toBe(15);
    expect(gddDay(35, 22, 10, 30)).toBe(16);
    expect(gddDay(8, 2, 10)).toBe(0);
    expect(gddDay(20, 5, 10)).toBe(5); // min raised to base
  });
  it("follows the FAO crop coefficient curve", () => {
    const maize = cropById("maize");
    expect(kcAt(maize, 0.05)).toBe(0.3);
    expect(kcAt(maize, 0.6)).toBe(1.2);
    expect(kcAt(maize, 1)).toBeCloseTo(0.6);
    expect(kcAt(cropById("coffee"), 0.1)).toBe(0.95);
  });
  it("names stages", () => {
    const maize = cropById("maize");
    expect(stageAt(maize, 0).name).toBe("Emerging");
    expect(stageAt(maize, 0.5).name).toBe("Tasselling and silking");
    expect(stageAt(maize, 1.1).name).toBe("Ready to harvest");
    for (const c of CROPS) expect(stageAt(c, 0.99).index).toBeLessThan(c.stages.length - 1);
  });
  it("ignores light showers", () => {
    expect(effectiveRain(3)).toBe(0);
    expect(effectiveRain(10)).toBe(8);
  });
  it("merges archive and forecast days", () => {
    const a: Day[] = [{ date: "2026-01-01", tmax: 1, tmin: 0, rain: 0, et0: 1 }, { date: "2026-01-02", tmax: 2, tmin: 0, rain: 0, et0: 1 }];
    const b: Day[] = [{ date: "2026-01-02", tmax: 5, tmin: null, rain: 1, et0: 2 }, { date: "2026-01-03", tmax: 3, tmin: 0, rain: 0, et0: 1 }];
    const m = mergeDays(a, b);
    expect(m.map((d) => d.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(m[1]).toEqual({ date: "2026-01-02", tmax: 5, tmin: 0, rain: 1, et0: 2 });
  });
  it("follows a season: heat, water, harvest, frost", () => {
    const days: Day[] = [];
    const start = Date.parse("2026-05-01T00:00:00Z");
    for (let i = 0; i < 100; i++) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      days.push({ date, tmax: 30, tmin: 20, rain: i % 10 === 0 ? 20 : 0, et0: 5 });
    }
    days[93].tmin = 1; // a cold night ahead (2 August)
    const s = season(cropById("maize"), "2026-05-01", days, "2026-08-01"); // 92 days in: 92 × 15 GDD
    expect(s.gdd).toBe(92 * 15);
    expect(s.daysSince).toBe(92);
    expect(s.stage.name).toBe("Drying down");
    expect(s.rain7).toBe(16);
    expect(s.need7).toBeGreaterThan(0);
    expect(s.irrigate7).toBeCloseTo(s.need7 - s.rainNext7);
    expect(s.frost.map((f) => f.date)).toEqual(["2026-08-02"]);
    expect(s.harvest![0] <= s.harvest![1]).toBe(true);
    expect(s.harvest![0] >= "2026-08-01").toBe(true);
  });
});
