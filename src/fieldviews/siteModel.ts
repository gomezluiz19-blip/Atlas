// What a piece of land could make from the sun and the wind, from a year of
// hourly weather (Open-Meteo's ERA5 archive, CC BY 4.0), pure.
//   Solar: kWh per kWp a year from the sunlight on the ground, with a typical
//     performance ratio and the gain from tilting panels towards the equator.
//   Wind: a generic 3.6 MW, 120 m rotor turbine's power curve run over every
//     hour of wind at 100 m, giving its yearly output and capacity factor.
//   The sun's path over the site on the solstices and equinox, for drawing.
import { sunPosition } from "../delight/sun";

export interface YearHours { time: string[]; ghi: number[]; wind: number[]; dir: number[] }

/** A generic modern onshore turbine (kW at m/s), from manufacturers' published curves, rounded. */
const CURVE: [number, number][] = [[3, 0], [4, 120], [5, 300], [6, 560], [7, 920], [8, 1380], [9, 1960], [10, 2600], [11, 3150], [12, 3500], [13, 3600], [25, 3600]];
export const RATED_KW = 3600;
export function turbineKw(v: number): number {
  if (v < 3 || v > 25) return 0;
  for (let i = 1; i < CURVE.length; i++) if (v <= CURVE[i][0]) { const [v0, p0] = CURVE[i - 1], [v1, p1] = CURVE[i]; return p0 + ((v - v0) / (v1 - v0)) * (p1 - p0); }
  return 0;
}

export interface SitePotential {
  solar: { kwhPerKwp: number; cf: number; monthly: number[]; tiltGain: number };
  wind: { mean: number; mwh: number; cf: number; monthly: number[]; rose: { dir: number; share: number; mean: number }[] };
}

/** Yearly potential from hourly sunlight (W/m²) and wind at 100 m (km/h) (pure). */
export function potential(y: YearHours, lat: number, performance = 0.8): SitePotential {
  const months = Array(12).fill(0), wm = Array(12).fill(0);
  let ghi = 0, n = 0, kwh = 0, vs = 0;
  const sectors = Array.from({ length: 16 }, () => ({ n: 0, v: 0 }));
  y.time.forEach((t, i) => {
    const mo = Number(t.slice(5, 7)) - 1, g = y.ghi[i] ?? 0, v = (y.wind[i] ?? 0) / 3.6;
    ghi += g; months[mo] += g;
    const p = turbineKw(v); kwh += p; wm[mo] += p; vs += v; n++;
    const s = Math.round(((y.dir[i] ?? 0) % 360) / 22.5) % 16; sectors[s].n++; sectors[s].v += v;
  });
  const hours = Math.max(1, n), scale = 8760 / hours;
  // Tilting panels at about the latitude catches more of the low sun: roughly +10% at mid-latitudes, less near the equator.
  const tiltGain = 1 + Math.min(0.18, Math.abs(lat) / 300);
  const kwhPerKwp = Math.round((ghi / 1000) * scale * performance * tiltGain);
  return {
    solar: { kwhPerKwp, cf: Math.round((kwhPerKwp / 8760) * 1000) / 10, monthly: months.map((m) => Math.round((m / 1000) * performance * tiltGain)), tiltGain: Math.round((tiltGain - 1) * 100) },
    wind: { mean: Math.round((vs / hours) * 10) / 10, mwh: Math.round((kwh * scale) / 1000), cf: Math.round(((kwh / hours) / RATED_KW) * 1000) / 10, monthly: wm.map((x) => Math.round(x / 1000)),
      rose: sectors.map((s, i) => ({ dir: i * 22.5, share: Math.round((s.n / hours) * 1000) / 10, mean: s.n ? Math.round((s.v / s.n) * 10) / 10 : 0 })) },
  };
}

/** A calmer or windier year: output scales with roughly the cube of the wind until the turbine maxes out (pure). */
export function windIfChanged(y: YearHours, pct: number): number {
  let kwh = 0;
  for (const w of y.wind) kwh += turbineKw(((w ?? 0) / 3.6) * (1 + pct / 100));
  return Math.round((kwh * (8760 / Math.max(1, y.wind.length))) / 1000);
}

/** The sun's path on a day: positions every 20 minutes while it's up (pure). */
export function sunPath(lat: number, lon: number, dayUtc: number): { alt: number; az: number; t: number }[] {
  const out: { alt: number; az: number; t: number }[] = [];
  for (let m = 0; m < 1440; m += 20) {
    const t = dayUtc + m * 60_000 - (lon / 15) * 3_600_000, s = sunPosition(t, lat, lon);
    if (s.alt > 0) out.push({ alt: s.alt, az: s.az, t });
  }
  return out;
}
