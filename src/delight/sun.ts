// Where the sun is, for any moment and place: its height above the horizon
// and its compass bearing (a standard low-precision solar position, good to
// a fraction of a degree), and what follows from it: sunrise, sunset, day
// length, golden hour, polar day and night. Also the light on real ground:
// how brightly each slope faces the sun, and which ground a ridge shadows.

const R = Math.PI / 180;

/** The sun's altitude and azimuth (degrees; azimuth clockwise from north) at a moment and place. */
export function sunPosition(t: Date | number, lat: number, lon: number): { alt: number; az: number; dec: number } {
  const d = (typeof t === "number" ? t : t.getTime()) / 86_400_000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * R;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
  const e = (23.439 - 0.00000036 * d) * R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = (gmst * 15 + lon) * R - ra;
  const la = lat * R;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  return { alt: alt / R, az: ((az / R) + 360) % 360, dec: dec / R };
}

/** Midnight UTC at the start of the day that holds `t` in local sun time (longitude / 15 hours). */
export const sunDayStart = (t: number, lon: number) => {
  const shift = (lon / 15) * 3_600_000;
  return Math.floor((t + shift) / 86_400_000) * 86_400_000 - shift;
};

export interface SunDay {
  /** Minutes after local sun-midnight (null: the sun doesn't rise or set that day). */
  sunrise: number | null;
  sunset: number | null;
  /** Hours of daylight. */
  length: number;
  noonAlt: number;
  kind: "normal" | "polar-day" | "polar-night";
  /** Golden hour spans (sun between −4° and 6°), in minutes after sun-midnight. */
  golden: [number, number][];
}

/** The sun's day at a place, minute by minute (robust at the poles). */
export function sunDay(dayStart: number, lat: number, lon: number): SunDay {
  const alt = (m: number) => sunPosition(dayStart + m * 60_000, lat, lon).alt;
  let sunrise: number | null = null, sunset: number | null = null, up = 0, noonAlt = -90;
  const golden: [number, number][] = [];
  let prev = alt(0), inGold = prev > -4 && prev < 6 ? 0 : -1;
  for (let m = 1; m <= 1440; m++) {
    const a = alt(m);
    if (prev < -0.833 && a >= -0.833 && sunrise === null) sunrise = m;
    if (prev >= -0.833 && a < -0.833) sunset = m;
    if (a >= -0.833) up++;
    if (a > noonAlt) noonAlt = a;
    const g = a > -4 && a < 6;
    if (g && inGold < 0) inGold = m;
    if (!g && inGold >= 0) { golden.push([inGold, m]); inGold = -1; }
    prev = a;
  }
  if (inGold >= 0) golden.push([inGold, 1440]);
  const kind = up >= 1440 ? "polar-day" : up === 0 ? "polar-night" : "normal";
  return { sunrise, sunset, length: up / 60, noonAlt, kind, golden };
}

/** "6:42". */
export const clock = (minutes: number) => `${Math.floor(minutes / 60) % 24}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
export const hoursText = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} min`;

// ---- Light on the ground --------------------------------------------------------------------------

export interface Dem {
  /** Row-major heights (metres), north row first. */
  z: Float32Array;
  n: number;
  /** Ground distance between samples (metres). */
  cell: number;
}

/**
 * How much sun each sample receives, 0 (shadow or facing away) to 1 (facing
 * the sun squarely): the slope's angle to the sun, and whether ground
 * between it and the sun rises above the sunlight.
 */
export function sunlight(dem: Dem, altDeg: number, azDeg: number, out = new Float32Array(dem.n * dem.n)): Float32Array {
  const { z, n, cell } = dem;
  if (altDeg <= -1) { out.fill(0); return out; }
  const alt = Math.max(0.2, altDeg) * R, az = azDeg * R;
  // Sun direction in grid terms: x east, y south (rows run north to south).
  const sx = Math.sin(az) * Math.cos(alt), sy = -Math.cos(az) * Math.cos(alt), sz = Math.sin(alt);
  const tanAlt = Math.tan(alt);
  const stepX = Math.sin(az), stepY = -Math.cos(az);
  const maxSteps = Math.min(n * 1.5, 240);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const zc = z[k];
    // Surface normal from the neighbours.
    const zl = z[j * n + Math.max(0, i - 1)], zr = z[j * n + Math.min(n - 1, i + 1)];
    const zu = z[Math.max(0, j - 1) * n + i], zd = z[Math.min(n - 1, j + 1) * n + i];
    const dzdx = (zr - zl) / (2 * cell), dzdy = (zd - zu) / (2 * cell);
    const nl = Math.hypot(dzdx, dzdy, 1);
    let lit = (-dzdx * sx - dzdy * sy + sz) / nl;
    if (lit <= 0) { out[k] = 0; continue; }
    // March toward the sun: is any ground above the sun's ray?
    for (let s = 1; s < maxSteps; s++) {
      const x = i + stepX * s, y = j + stepY * s;
      if (x < 0 || y < 0 || x > n - 1 || y > n - 1) break;
      const h = z[Math.round(y) * n + Math.round(x)];
      if (h > zc + s * cell * tanAlt) { lit = 0; break; }
    }
    out[k] = lit;
  }
  return out;
}
