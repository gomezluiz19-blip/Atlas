// Geometry for Work mode: distances, lengths, areas, and what falls inside an area.
export type LonLat = [number, number];

const R = 6_371_008.8;
const rad = Math.PI / 180;

export function metres(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLength(pts: LonLat[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += metres(pts[i - 1], pts[i]);
  return m;
}

/** Area of a lon/lat ring in m² (spherical excess approximation, good to well under 1% for farm-to-region sizes). */
export function areaM2(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((a * R * R) / 2);
}

export function inside(ring: LonLat[], [x, y]: LonLat): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Evenly spaced points along a path (for elevation profiles). */
export function along(pts: LonLat[], n: number): LonLat[] {
  const total = pathLength(pts);
  if (pts.length < 2 || !total) return pts.slice();
  const out: LonLat[] = [];
  let seg = 0, segStart = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < pts.length - 2 && segStart + metres(pts[seg], pts[seg + 1]) < target) { segStart += metres(pts[seg], pts[seg + 1]); seg++; }
    const len = metres(pts[seg], pts[seg + 1]) || 1;
    const t = Math.min(1, Math.max(0, (target - segStart) / len));
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t]);
  }
  return out;
}

/** Do two segments cross? */
export function segmentsCross(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const o = (p: LonLat, q: LonLat, r: LonLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0;
}

/** How many times a path crosses a set of lines (flat [lon, lat, …] arrays with bboxes). */
export function crossings(path: LonLat[], lines: { xy: ArrayLike<number>; bbox: [number, number, number, number] }[]): number {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of path) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  let count = 0;
  for (const l of lines) {
    if (l.bbox[2] < w || l.bbox[0] > e || l.bbox[3] < s || l.bbox[1] > n) continue;
    for (let i = 0; i + 3 < l.xy.length; i += 2) {
      const c: LonLat = [l.xy[i], l.xy[i + 1]], d: LonLat = [l.xy[i + 2], l.xy[i + 3]];
      for (let k = 1; k < path.length; k++) if (segmentsCross(path[k - 1], path[k], c, d)) count++;
    }
  }
  return count;
}

export const fmtDist = (m: number) => (m >= 10_000 ? `${Math.round(m / 1000).toLocaleString()} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
export const fmtArea = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(m2 >= 1e8 ? 0 : 2)} km²` : m2 >= 1e4 ? `${(m2 / 1e4).toFixed(1)} ha` : `${Math.round(m2).toLocaleString()} m²`);
export const fmtHours = (h: number) => { if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`; const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60; return mm ? `${hh} h ${mm} min` : `${hh} h`; };
