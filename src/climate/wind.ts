// The wind as a living field: sample the wind on a grid over the view, turn
// it into a smooth field, and trace streamlines through it so drops of light
// can run along them, faster where the wind is stronger. Pure functions; the
// layer that fetches and draws is windLayer.ts.

export interface Box { w: number; s: number; e: number; n: number }
export interface Sample { lon: number; lat: number; speed: number; dir: number }
/** A wind field on a regular grid: u (east) and v (north), km/h. */
export interface Field { box: Box; nx: number; ny: number; u: Float32Array; v: Float32Array }

/** Grid points across a box, nx × ny, row by row from the south-west (pure). */
export function gridPoints(box: Box, nx: number, ny: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    pts.push([box.w + ((box.e - box.w) * i) / (nx - 1), box.s + ((box.n - box.s) * j) / (ny - 1)]);
  return pts;
}

/** A grid size for a box: about 16 across, rows in proportion, at most about 220 points (pure). */
export function gridFor(box: Box): { nx: number; ny: number } {
  const wide = Math.max(1e-6, box.e - box.w), tall = box.n - box.s;
  return { nx: 16, ny: Math.max(6, Math.min(14, Math.round((16 * tall) / wide))) };
}

/** Wind speed and the direction it blows FROM (degrees) to u/v, the way it moves (pure). */
export const toUV = (speed: number, from: number): [number, number] => {
  const r = (from * Math.PI) / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
};

export function fieldFrom(box: Box, nx: number, ny: number, samples: Sample[]): Field {
  const u = new Float32Array(nx * ny), v = new Float32Array(nx * ny);
  samples.forEach((s, k) => { const [a, b] = toUV(s.speed, s.dir); u[k] = a; v[k] = b; });
  return { box, nx, ny, u, v };
}

/** The wind at a point, by bilinear interpolation; null outside the field (pure). */
export function windAt(f: Field, lon: number, lat: number): [number, number] | null {
  const { box, nx, ny } = f;
  const fx = ((lon - box.w) / (box.e - box.w)) * (nx - 1), fy = ((lat - box.s) / (box.n - box.s)) * (ny - 1);
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), a = fx - i, b = fy - j;
  const at = (arr: Float32Array, ii: number, jj: number) => arr[jj * nx + ii];
  const mix = (arr: Float32Array) => (at(arr, i, j) * (1 - a) + at(arr, i + 1, j) * a) * (1 - b) + (at(arr, i, j + 1) * (1 - a) + at(arr, i + 1, j + 1) * a) * b;
  return [mix(f.u), mix(f.v)];
}

export interface Streamline { pts: [number, number][]; speed: number }

/**
 * Streamlines through the field from evenly spread seeds (pure): each follows
 * the wind (Runge–Kutta, step a fraction of the box) until it leaves, stalls
 * or runs long. `seeds` per side; deterministic jitter keeps lines from lining up.
 */
export function streamlines(f: Field, seeds = 16, steps = 40): Streamline[] {
  const { box } = f;
  const span = Math.max(box.e - box.w, box.n - box.s), h = span / 90;
  const out: Streamline[] = [];
  const cosLat = (lat: number) => Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const step = (lon: number, lat: number): [number, number] | null => {
    const w = windAt(f, lon, lat);
    if (!w) return null;
    const s = Math.hypot(w[0], w[1]);
    if (s < 0.5) return null;
    // Move a fixed distance along the wind's direction (degrees; east scaled for latitude).
    return [(w[0] / s) * h / cosLat(lat), (w[1] / s) * h];
  };
  for (let j = 0; j < seeds; j++) for (let i = 0; i < seeds; i++) {
    const jit = ((i * 7 + j * 13) % 10) / 10;
    let lon = box.w + ((i + 0.3 + jit * 0.4) / seeds) * (box.e - box.w), lat = box.s + ((j + 0.3 + ((jit * 7) % 1) * 0.4) / seeds) * (box.n - box.s);
    const pts: [number, number][] = [[lon, lat]];
    let total = 0, n = 0;
    for (let k = 0; k < steps; k++) {
      const k1 = step(lon, lat);
      if (!k1) break;
      const k2 = step(lon + k1[0] / 2, lat + k1[1] / 2);
      if (!k2) break;
      lon += k2[0]; lat += k2[1];
      pts.push([lon, lat]);
      const w = windAt(f, lon, lat);
      if (w) { total += Math.hypot(w[0], w[1]); n++; }
    }
    if (pts.length >= 6) out.push({ pts, speed: n ? total / n : 0 });
  }
  return out;
}

/** A colour for a wind speed, km/h: calm teal, breezy white, strong amber, gale magenta (pure). */
export function windColor(kmh: number): string {
  const stops: [number, [number, number, number]][] = [[0, [90, 200, 255]], [15, [120, 255, 214]], [30, [255, 255, 255]], [50, [255, 196, 90]], [75, [255, 90, 140]], [110, [200, 90, 255]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) if (kmh <= stops[i][0]) { a = stops[i - 1]; b = stops[i]; break; }
  const t = b[0] === a[0] ? 1 : Math.max(0, Math.min(1, (kmh - a[0]) / (b[0] - a[0])));
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** The Beaufort description of a wind speed, km/h (pure). */
export function beaufort(kmh: number): string {
  const scale: [number, string][] = [[1, "calm"], [6, "light air"], [12, "light breeze"], [20, "gentle breeze"], [29, "moderate breeze"], [39, "fresh breeze"], [50, "strong breeze"], [62, "near gale"], [75, "gale"], [89, "strong gale"], [103, "storm"], [118, "violent storm"]];
  return (scale.find(([v]) => kmh < v) ?? [0, "hurricane force"])[1];
}
