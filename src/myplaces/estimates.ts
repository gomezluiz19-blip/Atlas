// Back-of-the-envelope numbers for a place: solar output from its own sunshine,
// rain a roof could catch, how long a battery or tank lasts.
import { getJson } from "../data/http";

export interface SunAndRain {
  /** Average daily sunshine energy on a flat surface, kWh/m², by month (Jan..Dec). */
  sunKwhM2: number[];
  /** Average rainfall, mm, by month. */
  rainMm: number[];
  years: string;
}

/** Monthly averages over the last five full years of ERA5 reanalysis (Open-Meteo). */
export async function sunAndRain(lon: number, lat: number): Promise<SunAndRain> {
  const y1 = new Date().getUTCFullYear() - 1, y0 = y1 - 4;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&start_date=${y0}-01-01&end_date=${y1}-12-31&daily=shortwave_radiation_sum,precipitation_sum&timezone=UTC`;
  const r = await getJson<{ daily: { time: string[]; shortwave_radiation_sum: (number | null)[]; precipitation_sum: (number | null)[] } }>("Open-Meteo", url);
  return monthly(r.daily.time, r.daily.shortwave_radiation_sum, r.daily.precipitation_sum, `${y0}–${y1}`);
}

export function monthly(time: string[], sunMJ: (number | null)[], rain: (number | null)[], years: string): SunAndRain {
  const sun = Array.from({ length: 12 }, () => [0, 0]), rn = Array.from({ length: 12 }, () => 0);
  const yearsSeen = new Set<string>();
  time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    yearsSeen.add(t.slice(0, 4));
    if (sunMJ[i] != null) { sun[m][0] += sunMJ[i]! / 3.6; sun[m][1]++; }
    if (rain[i] != null) rn[m] += rain[i]!;
  });
  const n = Math.max(1, yearsSeen.size);
  return { sunKwhM2: sun.map(([s, c]) => (c ? s / c : 0)), rainMm: rn.map((v) => v / n), years };
}

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Solar output by month (kWh) for `kw` of panels. Uses sunshine on a flat
 * surface and a typical performance ratio of 0.75 (heat, wiring, inverter).
 * Panels tilted toward the equator usually do somewhat better.
 */
export function solarByMonth(kw: number, s: SunAndRain): number[] {
  return s.sunKwhM2.map((sun, m) => kw * sun * 0.75 * DAYS[m]);
}

/** Rain a roof can catch in a year, litres (about 80% makes it to the tank). */
export function roofHarvestLitres(roofM2: number, s: SunAndRain): number {
  return roofM2 * s.rainMm.reduce((a, b) => a + b, 0) * 0.8;
}

/** Area of a lon/lat polygon ring in m² (fine at building scale). */
export function ringAreaM2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][1] * Math.PI / 180;
  const kx = 111_320 * Math.cos(lat0), ky = 110_540;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  return Math.abs(a) / 2;
}
