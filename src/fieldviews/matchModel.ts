// Sun and shade on a pitch through a match (pure). The stadium is a bowl: a
// rim of stands, `rimHeight` metres tall, `setback` metres outside the touch
// and goal lines. A spot on the pitch is in shade when the line from it
// towards the sun meets the rim below the rim's height.
import { sunPosition } from "../delight/sun";

export interface Bowl { length: number; width: number; setback: number; rimHeight: number; /** Bearing of the pitch's long axis, degrees from north. */ bearing: number }
export const DEFAULT_BOWL: Bowl = { length: 105, width: 68, setback: 12, rimHeight: 32, bearing: 0 };

const R = Math.PI / 180;

/** Share of the pitch in shade (0–1) for a sun at `alt`, `az` (degrees), on a grid of cells (pure). */
export function shadeFraction(b: Bowl, alt: number, az: number, cells = 24): { shade: number; grid: boolean[][] } {
  const nx = cells, ny = Math.round((cells * b.width) / b.length);
  const grid: boolean[][] = [];
  if (alt <= 0.5) return { shade: 1, grid: Array.from({ length: ny }, () => Array(nx).fill(true)) };
  // The sun's direction across the ground, in the pitch's own frame (x along it, y across).
  const ux = Math.sin((az - b.bearing) * R), uy = Math.cos((az - b.bearing) * R);
  const hx = b.length / 2 + b.setback, hy = b.width / 2 + b.setback, slope = Math.tan(alt * R);
  let shaded = 0;
  for (let j = 0; j < ny; j++) {
    const row: boolean[] = [];
    for (let i = 0; i < nx; i++) {
      const x = -b.length / 2 + ((i + 0.5) * b.length) / nx, y = -b.width / 2 + ((j + 0.5) * b.width) / ny;
      // How far towards the sun before the rim: the nearer of the two walls the ray meets.
      const tx = ux > 1e-9 ? (hx - x) / ux : ux < -1e-9 ? (-hx - x) / ux : Infinity;
      const ty = uy > 1e-9 ? (hy - y) / uy : uy < -1e-9 ? (-hy - y) / uy : Infinity;
      const s = Math.min(tx, ty) * slope < b.rimHeight;
      row.push(s);
      if (s) shaded++;
    }
    grid.push(row);
  }
  return { shade: shaded / (nx * ny), grid };
}

export interface MatchMinute { minute: number; t: number; alt: number; az: number; shade: number }
/** Every few minutes of a match from kickoff (UTC ms), with the sun and the shade (pure). 105 minutes covers both halves and the break. */
export function matchShade(b: Bowl, kickoff: number, lat: number, lon: number, step = 5, length = 110): MatchMinute[] {
  const out: MatchMinute[] = [];
  for (let m = 0; m <= length; m += step) {
    const t = kickoff + m * 60_000, s = sunPosition(t, lat, lon);
    out.push({ minute: m, t, alt: s.alt, az: s.az, shade: shadeFraction(b, s.alt, s.az, 16).shade });
  }
  return out;
}

/** How patchy the light is over a match: 0 when the pitch is all sun or all shade, 1 when it's split down the middle (worst for players' eyes and TV). */
export const patchiness = (ms: MatchMinute[]) => ms.reduce((a, m) => a + 2 * Math.min(m.shade, 1 - m.shade), 0) / Math.max(1, ms.length);

/** The kickoff hours of a day (local) from best to worst for even light (pure). `offsetH`: the venue's UTC offset. */
export function kickoffs(b: Bowl, day: string, offsetH: number, lat: number, lon: number, from = 12, to = 21): { hour: number; patchy: number; sun: number }[] {
  const out: { hour: number; patchy: number; sun: number }[] = [];
  for (let hr = from; hr <= to; hr += 0.5) {
    const t = Date.parse(`${day}T00:00:00Z`) + (hr - offsetH) * 3_600_000;
    const ms = matchShade(b, t, lat, lon, 10);
    out.push({ hour: hr, patchy: Math.round(patchiness(ms) * 100) / 100, sun: Math.round(ms.reduce((a, m) => a + (1 - m.shade), 0) / ms.length * 100) / 100 });
  }
  return out.sort((a, b2) => a.patchy - b2.patchy);
}

/** Heat stress at kickoff from the "feels like" temperature (°C), as a governing body would flag it. */
export function heatFlag(feels: number | null | undefined): { level: 0 | 1 | 2 | 3; text: string } {
  if (feels == null) return { level: 0, text: "" };
  if (feels >= 32) return { level: 3, text: "Extreme heat: cooling breaks in each half, consider moving kickoff" };
  if (feels >= 28) return { level: 2, text: "Hot: cooling breaks likely" };
  if (feels <= 0) return { level: 1, text: "Freezing: check the pitch and under-soil heating" };
  return { level: 0, text: "Comfortable for playing" };
}
