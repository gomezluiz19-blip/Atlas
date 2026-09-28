import { describe, expect, it } from "vitest";
import { Analyzer, fromCoco, groundPoint, type Detection } from "../src/pro/vision/analytics";

const person = (x: number, y: number): Detection => ({ kind: "person", score: 0.9, box: [x - 0.05, y - 0.3, 0.1, 0.3] });

describe("camera analytics", () => {
  it("keeps people, vehicles and bikes, normalising boxes", () => {
    const d = fromCoco([
      { class: "person", score: 0.9, bbox: [100, 50, 50, 200] },
      { class: "bus", score: 0.8, bbox: [0, 0, 400, 300] },
      { class: "dog", score: 0.99, bbox: [0, 0, 10, 10] },
      { class: "person", score: 0.2, bbox: [0, 0, 10, 10] },
    ], 400, 400);
    expect(d.map((x) => x.kind)).toEqual(["person", "vehicle"]);
    expect(d[0].box).toEqual([0.25, 0.125, 0.125, 0.5]);
  });

  it("follows people between frames and counts line crossings", () => {
    const a = new Analyzer();
    a.setLine({ a: [0.5, 0], b: [0.5, 1] }); // a vertical line down the middle
    a.update([person(0.3, 0.8)], 0);
    a.update([person(0.4, 0.8)], 1000);
    const t = a.update([person(0.55, 0.8)], 2000); // crosses left → right
    expect(a.tracks).toHaveLength(1);
    expect(t.counts.person).toBe(1);
    expect(t.entered + t.exited).toBe(1);
    const back = a.update([person(0.45, 0.8)], 3000);
    expect(back.entered + back.exited).toBe(2);
    expect(back.entered).toBe(1);
    // Someone gone for longer than the forget window is dropped.
    a.update([], 7000);
    expect(a.tracks).toHaveLength(0);
  });

  it("does not count a new person appearing on the far side", () => {
    const a = new Analyzer();
    a.setLine({ a: [0.5, 0], b: [0.5, 1] });
    a.update([person(0.2, 0.8)], 0);
    const t = a.update([person(0.2, 0.8), person(0.9, 0.8)], 1000);
    expect(t.entered + t.exited).toBe(0);
    expect(t.counts.person).toBe(2);
  });

  it("keeps the busiest count per minute", () => {
    const a = new Analyzer();
    a.update([person(0.1, 0.9), person(0.3, 0.9)], 0);
    a.update([person(0.1, 0.9)], 30_000);
    a.update([person(0.1, 0.9)], 61_000);
    expect(a.history.map((x) => x.people)).toEqual([2, 1]);
  });

  it("places what it sees on the ground inside the camera's view", () => {
    const cam = { lon: 0, lat: 0, heading: 90, fov: 90, range: 30 };
    const [lon1, lat1] = groundPoint(cam, 0.5, 1); // straight ahead, bottom of picture: ~2 m east
    expect(lon1 * 111_320).toBeCloseTo(2, 0);
    expect(Math.abs(lat1)).toBeLessThan(1e-9);
    const [lon2] = groundPoint(cam, 0.5, 0.4); // further up the picture: further away
    expect(lon2).toBeGreaterThan(lon1);
    const [, latLeft] = groundPoint(cam, 0, 0.8); // left edge of an east-facing camera is north-east
    expect(latLeft).toBeGreaterThan(0);
  });
});
