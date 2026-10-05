import { describe, expect, it } from "vitest";
import { catmullRom, dollyZoom, ease, offset, sample, shots, tour } from "../src/render/cinema";

describe("Cinematic camera", () => {
  it("eases from rest to rest", () => {
    for (const e of ["linear", "inOut", "in", "out", "smoother"] as const) { expect(ease(0, e)).toBe(0); expect(ease(1, e)).toBeCloseTo(1, 9); }
    expect(ease(0.5, "smoother")).toBeCloseTo(0.5, 9);
    // Smootherstep starts slower than linear: no jolt.
    expect(ease(0.05, "smoother")).toBeLessThan(0.01);
  });
  it("passes through every keyframe, and never overshoots on a straight line", () => {
    const pts = [[0, 0], [10, 0], [20, 0], [30, 0]];
    expect(catmullRom(pts, 0)).toEqual([0, 0]);
    expect(catmullRom(pts, 1 / 3)[0]).toBeCloseTo(10, 6);
    expect(catmullRom(pts, 1)[0]).toBeCloseTo(30, 6);
    for (let u = 0; u <= 1; u += 0.01) { const [x, y] = catmullRom(pts, u); expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(30 + 1e-6); expect(Math.abs(y)).toBeLessThan(1e-9); }
  });
  it("keeps an orbit at its radius from the subject", () => {
    const s = { lon: -73.97, lat: 40.78, height: 20, size: 50 };
    const orbit = shots(s).find((x) => x.id === "orbit")!;
    const radius = (k: { at: number[] }) => Math.hypot(...(() => { const [e, n] = [(k.at[0] - s.lon) * 111_320 * Math.cos((s.lat * Math.PI) / 180), (k.at[1] - s.lat) * 111_320]; return [e, n]; })());
    const r0 = radius(sample(orbit, 0));
    for (let t = 0; t <= orbit.seconds; t += 1.3) expect(Math.abs(radius(sample(orbit, t)) - r0) / r0).toBeLessThan(0.015);
  });
  it("holds the subject's framed size through a dolly zoom", () => {
    const keys = dollyZoom({ lon: 0, lat: 0, height: 0, size: 40 }, 0);
    const framed = keys.map((k) => { const d = Math.hypot(k.at[0] * 111_320, k.at[1] * 111_320); return d * Math.tan(((k.fov! * Math.PI) / 180) / 2); });
    for (const f of framed) expect(f).toBeCloseTo(framed[0], 3);
    expect(keys[2].fov!).toBeLessThan(keys[0].fov!);
  });
  it("builds a tour that ends where it should, and offsets in metres", () => {
    const t = tour([{ lon: 0, lat: 0 }, { lon: 0.01, lat: 0 }, { lon: 0.02, lat: 0.01 }], 300);
    expect(sample(t, t.seconds).at[0]).toBeCloseTo(0.02, 6);
    const [lon, lat] = offset(0, 0, 1000, 0);
    expect(lon * 111_320).toBeCloseTo(1000, 3);
    expect(lat).toBe(0);
  });
});
