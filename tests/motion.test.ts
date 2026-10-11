import { describe, expect, it } from "vitest";
import { bezier, countable, lift, settle } from "../src/ui/motion";

describe("easing", () => {
  it("starts at 0, ends at 1, and never runs backwards", () => {
    for (const f of [settle, lift, bezier(0.25, 0.1, 0.25, 1)]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      let last = 0;
      for (let t = 0.05; t < 1; t += 0.05) { const v = f(t); expect(v).toBeGreaterThanOrEqual(last - 1e-9); last = v; }
    }
  });
  it("settles: most of the way there early, then a long finish", () => {
    expect(settle(0.3)).toBeGreaterThan(0.6);
  });
  it("lifts: a gentle start, then it settles", () => {
    expect(lift(0.1)).toBeLessThan(0.05);
    expect(lift(0.5)).toBeGreaterThan(0.5);
    expect(lift(0.9)).toBeGreaterThan(0.98);
  });
  it("matches the linear curve when asked for one", () => {
    const linear = bezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    expect(linear(0.37)).toBeCloseTo(0.37, 4);
  });
});

describe("figures that count up", () => {
  const vals = (t: string) => countable(t).map((x) => x.value);
  it("finds the numbers in a sentence, with their format", () => {
    expect(vals("214 kinds of life seen in the last 30 days.")).toEqual([214, 30]);
    expect(vals("Your 12 people span 4 countries")).toEqual([12, 4]);
    expect(countable("1,234.5 km")[0]).toMatchObject({ value: 1234.5, decimals: 1 });
  });
  it("leaves years, times, dates and ones alone", () => {
    expect(vals("Since 1914, at 14:05 on 2026-10-11, 1 left")).toEqual([]);
    expect(vals("in 3 days")).toEqual([3]);
  });
});
