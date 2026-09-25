// Climate statistics from daily weather records: monthly normals, Köppen–Geiger
// climate type (Peel, Finlayson & McMahon 2007) and long-term warming trend.

export interface MonthlyNormals {
  /** Mean temperature of each month, °C (Jan..Dec). */
  temp: number[];
  /** Mean total precipitation of each month, mm. */
  precip: number[];
}

/** Averages daily records into monthly normals over [fromYear, toYear]. */
export function monthlyNormals(dates: string[], temp: (number | null)[], precip: (number | null)[], fromYear: number, toYear: number): MonthlyNormals {
  const tSum = new Array(12).fill(0), tN = new Array(12).fill(0);
  const pByYearMonth = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) {
    const y = Number(dates[i].slice(0, 4));
    if (y < fromYear || y > toYear) continue;
    const m = Number(dates[i].slice(5, 7)) - 1;
    const t = temp[i], p = precip[i];
    if (t !== null && t !== undefined) { tSum[m] += t; tN[m]++; }
    if (p !== null && p !== undefined) {
      const key = `${y}-${m}`;
      pByYearMonth.set(key, (pByYearMonth.get(key) ?? 0) + p);
    }
  }
  const pSum = new Array(12).fill(0), pN = new Array(12).fill(0);
  for (const [key, v] of pByYearMonth) {
    const m = Number(key.split("-")[1]);
    pSum[m] += v;
    pN[m]++;
  }
  return {
    temp: tSum.map((s, m) => (tN[m] ? s / tN[m] : NaN)),
    precip: pSum.map((s, m) => (pN[m] ? s / pN[m] : NaN)),
  };
}

/** Mean temperature of each complete year. */
export function annualMeans(dates: string[], temp: (number | null)[]): { year: number; mean: number }[] {
  const sum = new Map<number, number>(), n = new Map<number, number>();
  for (let i = 0; i < dates.length; i++) {
    const t = temp[i];
    if (t === null || t === undefined) continue;
    const y = Number(dates[i].slice(0, 4));
    sum.set(y, (sum.get(y) ?? 0) + t);
    n.set(y, (n.get(y) ?? 0) + 1);
  }
  return [...sum.keys()]
    .filter((y) => (n.get(y) ?? 0) >= 360)
    .sort((a, b) => a - b)
    .map((y) => ({ year: y, mean: sum.get(y)! / n.get(y)! }));
}

/** Least-squares slope and intercept of y against x. */
export function linearTrend(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

export interface Koppen {
  code: string;
  name: string;
  description: string;
}

const NAMES: Record<string, [string, string]> = {
  Af: ["Tropical rainforest", "Hot and wet all year."],
  Am: ["Tropical monsoon", "Hot all year, with a short dry season and a very wet season."],
  Aw: ["Tropical savanna", "Hot all year, with a pronounced dry season."],
  BWh: ["Hot desert", "Very dry, with hot summers."],
  BWk: ["Cold desert", "Very dry, with cold winters."],
  BSh: ["Hot semi-arid", "Dry grassland or scrub, warm to hot."],
  BSk: ["Cold semi-arid", "Dry grassland or scrub, with cold winters."],
  Csa: ["Mediterranean, hot summer", "Dry, hot summers and mild, wet winters."],
  Csb: ["Mediterranean, warm summer", "Dry, warm summers and mild, wet winters."],
  Csc: ["Mediterranean, cool summer", "Dry, cool summers and wet winters."],
  Cwa: ["Humid subtropical, dry winter", "Hot, wet summers and dry winters."],
  Cwb: ["Subtropical highland, dry winter", "Mild, wet summers and dry winters."],
  Cwc: ["Subtropical highland, cold", "Cool summers and dry winters."],
  Cfa: ["Humid subtropical", "Hot, humid summers and mild winters; rain all year."],
  Cfb: ["Oceanic", "Mild summers and cool winters; rain all year."],
  Cfc: ["Subpolar oceanic", "Cool summers and cold, wet winters."],
  Dsa: ["Continental, dry hot summer", "Hot, dry summers and cold winters."],
  Dsb: ["Continental, dry warm summer", "Warm, dry summers and cold winters."],
  Dsc: ["Subarctic, dry summer", "Short, cool, dry summers and long cold winters."],
  Dsd: ["Subarctic, dry summer, severe winter", "Extremely cold winters."],
  Dwa: ["Continental monsoon, hot summer", "Hot, wet summers and very cold, dry winters."],
  Dwb: ["Continental monsoon, warm summer", "Warm, wet summers and very cold, dry winters."],
  Dwc: ["Subarctic monsoon", "Short summers and very cold, dry winters."],
  Dwd: ["Subarctic monsoon, severe winter", "Extremely cold, dry winters."],
  Dfa: ["Hot-summer continental", "Hot summers, cold winters, rain all year."],
  Dfb: ["Warm-summer continental", "Warm summers, cold winters, rain all year."],
  Dfc: ["Subarctic", "Short, cool summers and long, very cold winters."],
  Dfd: ["Subarctic, severe winter", "Extremely cold winters."],
  ET: ["Tundra", "Warmest month between 0 and 10 °C; too cold for trees."],
  EF: ["Ice cap", "Below freezing all year."],
};

/**
 * Köppen–Geiger class from monthly normals.
 * @param lat latitude, to decide which half of the year is summer
 */
export function koppen(n: MonthlyNormals, lat: number): Koppen {
  const T = n.temp, P = n.precip;
  const tmax = Math.max(...T), tmin = Math.min(...T);
  const mat = T.reduce((a, b) => a + b, 0) / 12;
  const map = P.reduce((a, b) => a + b, 0);
  const summer = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const winter = lat >= 0 ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const ps = summer.map((m) => P[m]), pw = winter.map((m) => P[m]);
  const psTotal = ps.reduce((a, b) => a + b, 0), pwTotal = pw.reduce((a, b) => a + b, 0);
  const pdry = Math.min(...P);
  const psdry = Math.min(...ps), pswet = Math.max(...ps), pwdry = Math.min(...pw), pwwet = Math.max(...pw);

  let code: string;
  if (tmax < 10) {
    code = tmax > 0 ? "ET" : "EF";
  } else {
    const pth = pwTotal >= 0.7 * map ? 2 * mat : psTotal >= 0.7 * map ? 2 * mat + 28 : 2 * mat + 14;
    if (map < 10 * pth) {
      code = (map < 5 * pth ? "BW" : "BS") + (mat >= 18 ? "h" : "k");
    } else if (tmin >= 18) {
      code = pdry >= 60 ? "Af" : pdry >= 100 - map / 25 ? "Am" : "Aw";
    } else {
      const first = tmin > 0 ? "C" : "D";
      const second = psdry < 40 && psdry < pwwet / 3 ? "s" : pwdry < pswet / 10 ? "w" : "f";
      const warm = T.filter((t) => t >= 10).length;
      const third = tmax >= 22 ? "a" : warm >= 4 ? "b" : first === "D" && tmin < -38 ? "d" : "c";
      code = first + second + third;
    }
  }
  const [name, description] = NAMES[code] ?? [code, ""];
  return { code, name, description };
}

/** WMO weather interpretation codes → short description and emoji-free icon key. */
export function weatherText(code: number): { text: string; icon: "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm" } {
  if (code === 0) return { text: "Clear", icon: "sun" };
  if (code <= 2) return { text: code === 1 ? "Mostly clear" : "Partly cloudy", icon: "partly" };
  if (code === 3) return { text: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { text: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { text: "Drizzle", icon: "rain" };
  if (code >= 61 && code <= 67) return { text: code >= 65 ? "Heavy rain" : "Rain", icon: "rain" };
  if (code >= 71 && code <= 77) return { text: "Snow", icon: "snow" };
  if (code >= 80 && code <= 82) return { text: "Showers", icon: "rain" };
  if (code === 85 || code === 86) return { text: "Snow showers", icon: "snow" };
  if (code >= 95) return { text: "Thunderstorm", icon: "storm" };
  return { text: "—", icon: "cloud" };
}
