// Location facts computed from first principles: geomagnetic latitude (for
// aurora), daylight and the sun's position, and distance to plate boundaries.

const RAD = Math.PI / 180;

/** Geomagnetic north pole (IGRF dipole, epoch 2025). */
export const MAGNETIC_POLE = { lat: 80.8, lon: -72.8 };

/** Latitude relative to Earth's magnetic dipole, degrees. Aurora tracks this, not geographic latitude. */
export function magneticLatitude(lat: number, lon: number): number {
  const p = MAGNETIC_POLE;
  const s = Math.sin(lat * RAD) * Math.sin(p.lat * RAD) + Math.cos(lat * RAD) * Math.cos(p.lat * RAD) * Math.cos((lon - p.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

export type AuroraZone = "oval" | "storms" | "rare" | "none";

/** How often aurora are overhead or visible, from magnetic latitude. */
export function auroraZone(mlat: number): AuroraZone {
  const m = Math.abs(mlat);
  if (m >= 62 && m <= 76) return "oval"; // under the auroral oval: frequent displays
  if (m >= 76 || m >= 54) return "storms"; // polar cap or just equatorward: during geomagnetic storms
  if (m >= 45) return "rare"; // only in strong storms (Kp 7+)
  return "none";
}

/** Solar declination for a date, degrees (Cooper's approximation). */
export function solarDeclination(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86_400_000;
  return 23.44 * Math.sin(((360 / 365) * (day + 284)) * RAD);
}

/** Hours between sunrise and sunset (0 = polar night, 24 = midnight sun). */
export function daylightHours(lat: number, date: Date): number {
  const d = solarDeclination(date) * RAD;
  // Sun centre at -0.833° accounts for refraction and the solar disc.
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(d)) / (Math.cos(lat * RAD) * Math.cos(d));
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * Math.acos(cosH)) / RAD / 15;
}

/** The sun's altitude above the horizon, degrees, at a time and place. */
export function sunAltitude(lat: number, lon: number, date: Date): number {
  const d = solarDeclination(date) * RAD;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const hourAngle = (utcHours + lon / 15 - 12) * 15 * RAD;
  const s = Math.sin(lat * RAD) * Math.sin(d) + Math.cos(lat * RAD) * Math.cos(d) * Math.cos(hourAngle);
  return Math.asin(s) / RAD;
}

export function skyState(altitude: number): "day" | "twilight" | "dark" {
  if (altitude > -0.833) return "day";
  if (altitude > -12) return "twilight";
  return "dark";
}

/** Great-circle distance in km (spherical Earth). */
export function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Nearest point on a set of polylines (flat [lon, lat, …] arrays) and its distance, km. */
export function nearestOnLines(lon: number, lat: number, lines: number[][]): { km: number; line: number } {
  let best = Infinity, bestLine = -1;
  const k = Math.cos(lat * RAD);
  lines.forEach((pts, li) => {
    for (let i = 2; i < pts.length; i += 2) {
      // Project onto the segment in a local equirectangular frame, then measure properly.
      let ax = pts[i - 2] - lon, bx = pts[i] - lon;
      if (Math.abs(ax) > 180 || Math.abs(bx) > 180) continue;
      ax *= k; bx *= k;
      const ay = pts[i - 1] - lat, by = pts[i + 1] - lat;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const px = lon + (ax + t * dx) / k, py = lat + ay + t * dy;
      const d = distanceKm(lon, lat, px, py);
      if (d < best) { best = d; bestLine = li; }
    }
  });
  return { km: best, line: bestLine };
}
