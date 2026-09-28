import { describe, expect, it } from "vitest";
import { flystrikeDays, huttonPeriods, type Hour } from "../src/myplaces/risks";

const day = (date: string, t: (h: number) => number, rh: (h: number) => number): Hour[] =>
  Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, "0")}:00`, t: t(h), rh: rh(h) }));
const muggy = (d: string) => day(d, (h) => 14 + (h > 10 && h < 18 ? 6 : 0), (h) => (h < 8 ? 95 : 80));
const dry = (d: string) => day(d, () => 14, () => 60);
const cold = (d: string) => day(d, (h) => 6 + h / 4, () => 95);

describe("disease risk", () => {
  it("finds Hutton periods: two warm, humid days in a row", () => {
    expect(huttonPeriods([...muggy("2026-07-01"), ...muggy("2026-07-02"), ...dry("2026-07-03")])).toEqual(["2026-07-02"]);
    expect(huttonPeriods([...muggy("2026-07-01"), ...dry("2026-07-02"), ...muggy("2026-07-03")])).toEqual([]);
    expect(huttonPeriods([...cold("2026-07-01"), ...cold("2026-07-02")])).toEqual([]);
  });
  it("finds flystrike weather", () => {
    expect(flystrikeDays([...muggy("2026-07-01"), ...dry("2026-07-02")])).toEqual(["2026-07-01"]);
  });
});
