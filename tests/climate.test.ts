import { describe, expect, it } from "vitest";
import { annualMeans, koppen, linearTrend, monthlyNormals } from "../src/analysis/climate";

describe("koppen", () => {
  it("classifies well-known climates", () => {
    // Phoenix, Arizona
    expect(koppen({ temp: [12.8, 14.7, 17.9, 21.8, 26.9, 32.2, 34.9, 34.2, 31.2, 24.8, 17.3, 12.1], precip: [23, 24, 26, 7, 3, 1, 27, 24, 17, 15, 17, 24] }, 33.4).code).toBe("BWh");
    // London
    expect(koppen({ temp: [5.2, 5.3, 7.6, 9.9, 13.3, 16.4, 18.7, 18.5, 15.7, 12.0, 8.0, 5.5], precip: [55, 41, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55] }, 51.5).code).toBe("Cfb");
    // Singapore
    expect(koppen({ temp: [26.5, 27.1, 27.5, 28, 28.3, 28.3, 27.9, 27.9, 27.6, 27.6, 26.9, 26.4], precip: [234, 114, 176, 154, 171, 132, 158, 176, 169, 194, 256, 288] }, 1.35).code).toBe("Af");
    // Moscow
    expect(koppen({ temp: [-6.2, -5.9, -0.7, 6.7, 13.2, 17.0, 19.2, 17.0, 11.3, 5.6, -0.9, -4.8], precip: [53, 44, 39, 36, 61, 78, 84, 78, 66, 70, 52, 51] }, 55.75).code).toBe("Dfb");
    // Rome
    expect(koppen({ temp: [7.5, 8.2, 10.2, 12.6, 17.2, 21.1, 24.1, 24.5, 20.8, 16.4, 11.4, 8.4], precip: [67, 73, 58, 81, 53, 34, 19, 37, 73, 113, 115, 81] }, 41.9).code).toBe("Csa");
  });
});

describe("climate series", () => {
  it("builds monthly normals and annual trends", () => {
    const dates: string[] = [], temp: number[] = [], precip: number[] = [];
    for (let y = 2000; y <= 2009; y++) {
      for (let d = 0; d < 365; d++) {
        const date = new Date(Date.UTC(y, 0, 1 + d));
        dates.push(date.toISOString().slice(0, 10));
        temp.push(10 + (y - 2000) * 0.1);
        precip.push(1);
      }
    }
    const n = monthlyNormals(dates, temp, precip, 2000, 2009);
    expect(n.precip[0]).toBeCloseTo(31, 5);
    expect(n.precip[1]).toBeCloseTo(28.3, 5); // three leap years in 2000–2009
    const years = annualMeans(dates, temp);
    expect(years).toHaveLength(10);
    const t = linearTrend(years.map((y) => y.year), years.map((y) => y.mean));
    expect(t.slope).toBeCloseTo(0.1, 6);
  });
});
