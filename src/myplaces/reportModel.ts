// The numbers behind a place report: frost dates and the growing season, heat
// units, rain and the ground, from ten years of daily weather and the terrain.

export interface ClimateDay { date: string; tmin: number | null; tmax: number | null; rain: number | null }

const doy = (iso: string) => {
  const d = Date.parse(iso + "T00:00:00Z"), y = Date.UTC(Number(iso.slice(0, 4)), 0, 1);
  return Math.round((d - y) / 86_400_000) + 1;
};
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Day of year → "12 Apr". */
export const dayLabel = (d: number) => new Date(Date.UTC(2021, 0, Math.round(d))).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export interface FrostSeason {
  /** Median last spring frost and first autumn frost (day of year), null where frost is rare. */
  lastSpring: number | null;
  firstAutumn: number | null;
  /** Median frost-free days a year (365 where there's no frost). */
  freeDays: number;
  /** Average number of frosty days (min ≤ 0 °C) a year. */
  frostDays: number;
  years: number;
}

/**
 * Frost dates from daily minimum temperatures. In the south the seasons are
 * flipped, so the "year" runs from July to June.
 */
export function frostSeason(days: ClimateDay[], lat: number): FrostSeason {
  const south = lat < 0;
  const byYear = new Map<number, ClimateDay[]>();
  for (const d of days) {
    if (d.tmin === null) continue;
    const y = Number(d.date.slice(0, 4)), m = Number(d.date.slice(5, 7));
    const key = south ? (m >= 7 ? y : y - 1) : y;
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key)!.push(d);
  }
  const springs: number[] = [], autumns: number[] = [], free: number[] = [], frosty: number[] = [];
  let years = 0;
  for (const list of byYear.values()) {
    if (list.length < 330) continue; // incomplete year
    years++;
    // Position within the season-year: days since 1 Jan (north) or 1 Jul (south).
    const pos = (d: ClimateDay) => (south ? (doy(d.date) + 184 - 1) % 366 + 1 : doy(d.date));
    const cold = list.filter((d) => d.tmin! <= 0).map(pos);
    frosty.push(cold.length);
    const mid = 182;
    const early = cold.filter((p) => p < mid), late = cold.filter((p) => p >= mid);
    const ls = early.length ? Math.max(...early) : null, fa = late.length ? Math.min(...late) : null;
    if (ls !== null) springs.push(ls);
    if (fa !== null) autumns.push(fa);
    free.push((fa ?? 366) - (ls ?? 0) - 1);
  }
  // Frost in fewer than a third of years: call it rare.
  const need = Math.max(1, Math.ceil(years / 3));
  const unshift = (p: number) => (south ? ((p - 184 + 365) % 365) + 1 : p);
  return {
    lastSpring: springs.length >= need ? unshift(median(springs)) : null,
    firstAutumn: autumns.length >= need ? unshift(median(autumns)) : null,
    freeDays: Math.min(365, Math.round(median(free))),
    frostDays: frosty.length ? Math.round(frosty.reduce((a, b) => a + b, 0) / frosty.length) : 0,
    years,
  };
}

/** Average yearly growing degree days above a base, and yearly rain. */
export function yearly(days: ClimateDay[], base = 10): { gdd: number; rain: number; hotDays: number } {
  const years = new Set(days.map((d) => d.date.slice(0, 4))).size || 1;
  let gdd = 0, rain = 0, hot = 0;
  for (const d of days) {
    if (d.tmax !== null && d.tmin !== null) gdd += Math.max(0, Math.min(30, (d.tmax + d.tmin) / 2) - base);
    rain += d.rain ?? 0;
    if ((d.tmax ?? 0) >= 30) hot++;
  }
  return { gdd: Math.round(gdd / years), rain: Math.round(rain / years), hotDays: Math.round(hot / years) };
}

/** Slope (degrees) and the way the ground faces, from a 3×3 grid of heights (row 0 north) with cell size in metres. */
export function slopeAspect(z: ArrayLike<number>, cell: number): { slope: number; faces: string } {
  const dzdx = ((z[2] + 2 * z[5] + z[8]) - (z[0] + 2 * z[3] + z[6])) / (8 * cell);
  const dzdy = ((z[6] + 2 * z[7] + z[8]) - (z[0] + 2 * z[1] + z[2])) / (8 * cell); // south minus north
  const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
  // Downhill direction (the way the slope faces): east component -dzdx, north component +dzdy.
  const az = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return { slope, faces: slope < 1.5 ? "flat" : names[Math.round(az / 45) % 8] };
}
