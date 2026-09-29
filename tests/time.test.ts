import { describe, expect, it } from "vitest";
import { dayFor, momentIndex, moments, polityAt, projectedChange, rulerTimeline, spanMean, yearName, yearlyMeans } from "../src/time/model";

describe("the time scale", () => {
  const list = moments(2026, [-5000, -500, 800, 1914, 1994, 2000, 2010]);
  it("runs from the borders of history through the satellite years to the future", () => {
    expect(list.map((m) => m.kind)).toEqual(["borders", "borders", "borders", "borders", ...Array(26).fill("imagery"), "now", "future", "future", "future", "future"]);
    expect(list[0].year).toBe(-500); // before 3000 BC is left out
    expect(list.find((m) => m.kind === "now")!.label).toBe("Today");
    expect(list[momentIndex(list, 1920)].year).toBe(1914);
    expect(list[momentIndex(list, 2049)].year).toBe(2050);
  });
  it("names years the way people say them", () => {
    expect(yearName(-500)).toBe("500 BC");
    expect(yearName(800)).toBe("AD 800");
    expect(yearName(1914)).toBe("1914");
  });
  it("picks a summer day for the hemisphere", () => {
    expect(dayFor(2005, 48)).toBe("2005-07-15");
    expect(dayFor(2005, -33)).toBe("2005-01-15");
  });
});

describe("a place through time", () => {
  const days = (y: number, t: number) => Array.from({ length: 365 }, (_, i) => ({ time: `${y}-${String(1 + Math.floor(i / 31)).padStart(2, "0")}-01`, t }));
  it("averages whole years only and measures change", () => {
    const d = [...days(1950, 10), ...days(1951, 11), ...days(2020, 12).slice(0, 100)];
    const y = yearlyMeans(d.map((x) => x.time), d.map((x) => x.t));
    expect(y).toEqual([{ year: 1950, mean: 10 }, { year: 1951, mean: 11 }]);
    expect(spanMean(y, 1950, 1959)).toBe(10.5);
    expect(projectedChange([{ year: 1995, mean: 14 }, { year: 2005, mean: 14.4 }, { year: 2050, mean: 15.9 }])).toBeCloseTo(1.7);
  });
  it("finds who governed a point, and merges runs", () => {
    const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
    const empire = { name: "Empire", rings: [sq(0, 0, 10)], bbox: [0, 0, 10, 10] as [number, number, number, number], area: 100 };
    const duchy = { name: "Duchy", rings: [sq(2, 2, 2)], bbox: [2, 2, 4, 4] as [number, number, number, number], area: 4 };
    expect(polityAt([empire, duchy], 3, 3)).toBe("Duchy");
    expect(polityAt([empire, duchy], 8, 8)).toBe("Empire");
    expect(polityAt([empire], 20, 20)).toBeNull();
    expect(rulerTimeline([{ year: 1800, name: "A" }, { year: 1880, name: "A" }, { year: 1914, name: "B" }, { year: 2026, name: "B" }]))
      .toEqual([{ from: 1800, to: 1880, name: "A" }, { from: 1914, to: 2026, name: "B" }]);
  });
});
