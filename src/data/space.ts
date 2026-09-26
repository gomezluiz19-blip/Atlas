// Space weather from NOAA's Space Weather Prediction Center: the OVATION
// aurora forecast (chance of aurora overhead, next ~30–90 minutes) and the
// planetary Kp index of geomagnetic activity.
import { getJson } from "./http";

export interface AuroraForecast {
  /** Probability of visible aurora overhead, percent, on a 1° grid: [lon 0..359][lat -90..90]. */
  grid: Uint8Array;
  forecastTime: string;
}

export async function auroraForecast(): Promise<AuroraForecast> {
  const body = await getJson<{ "Forecast Time": string; coordinates: [number, number, number][] }>(
    "NOAA SWPC",
    `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json?t=${Math.floor(Date.now() / 600_000)}`,
  );
  const grid = new Uint8Array(360 * 181);
  for (const [lon, lat, p] of body.coordinates) {
    const x = ((Math.round(lon) % 360) + 360) % 360, y = Math.round(lat) + 90;
    if (y >= 0 && y <= 180) grid[x * 181 + y] = Math.min(100, Math.max(0, Math.round(p)));
  }
  return { grid, forecastTime: body["Forecast Time"] };
}

export function auroraAt(f: AuroraForecast, lon: number, lat: number): number {
  const x = ((Math.round(lon) % 360) + 360) % 360, y = Math.round(lat) + 90;
  return y >= 0 && y <= 180 ? f.grid[x * 181 + y] : 0;
}

/** Latest planetary Kp (0–9). */
export async function latestKp(): Promise<{ kp: number; time: string } | null> {
  const body = await getJson<unknown[]>("NOAA SWPC", `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json?t=${Math.floor(Date.now() / 600_000)}`);
  const rows = body.filter((r) => (Array.isArray(r) ? r[0] !== "time_tag" : true));
  const last = rows[rows.length - 1] as unknown;
  if (!last) return null;
  if (Array.isArray(last)) return { time: String(last[0]), kp: Number(last[1]) };
  const o = last as { time_tag?: string; Kp?: number; kp_index?: number };
  return { time: o.time_tag ?? "", kp: Number(o.Kp ?? o.kp_index ?? NaN) };
}

export function kpMeaning(kp: number): string {
  if (kp >= 7) return "a severe geomagnetic storm: aurora may reach far from the poles";
  if (kp >= 5) return "a geomagnetic storm: aurora likely across the aurora zone and beyond";
  if (kp >= 4) return "active: good chances in the aurora zone";
  if (kp >= 2) return "unsettled: aurora possible under the oval";
  return "quiet: faint aurora near the poles only";
}
