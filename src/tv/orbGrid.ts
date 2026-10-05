// The remote's orb is a trackball: a wireframe globe that turns under the thumb in any direction. Its
// orientation is a rotation matrix, turned about the screen's own axes (drag right: it turns about the
// vertical; drag down: about the horizontal), so a drag always moves the grid the way the thumb goes,
// however far it has already turned. Pure: the canvas drawing lives in remote.ts.

export type M3 = [number, number, number, number, number, number, number, number, number];
export const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const mul = (a: M3, b: M3): M3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

/** Turns the ball by a drag of (dx, dy), as fractions of its width (pure). Half a width turns it 90°. */
export function turn(m: M3, dx: number, dy: number): M3 {
  const a = dx * Math.PI, b = dy * Math.PI;
  const ry: M3 = [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  const rx: M3 = [1, 0, 0, 0, Math.cos(b), Math.sin(b), 0, -Math.sin(b), Math.cos(b)];
  const r = mul(rx, mul(ry, m));
  // Keep it a pure rotation as drags pile up (Gram–Schmidt on the rows).
  const n = (v: number[]) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const r0 = n([r[0], r[1], r[2]]);
  const d = r0[0] * r[3] + r0[1] * r[4] + r0[2] * r[5];
  const r1 = n([r[3] - d * r0[0], r[4] - d * r0[1], r[5] - d * r0[2]]);
  const r2 = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
  return [...r0, ...r1, ...r2] as M3;
}

export interface Line { pts: { x: number; y: number; z: number }[]; kind: "grid" | "equator" | "meridian" }

/**
 * The globe's grid as seen now: parallels and meridians every `step` degrees, on a unit sphere, rotated
 * by `m`; x to the right, y down, z towards the viewer (z > 0 is the near side) (pure).
 */
export function sphereLines(m: M3, step = 20, seg = 64): Line[] {
  const rad = Math.PI / 180, out: Line[] = [];
  const at = (lat: number, lon: number) => {
    const p = [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    return { x: m[0] * p[0] + m[1] * p[1] + m[2] * p[2], y: m[3] * p[0] + m[4] * p[1] + m[5] * p[2], z: m[6] * p[0] + m[7] * p[1] + m[8] * p[2] };
  };
  for (let lat = -90 + step; lat < 90; lat += step)
    out.push({ kind: lat === 0 ? "equator" : "grid", pts: Array.from({ length: seg + 1 }, (_, i) => at(lat * rad, (i / seg) * 2 * Math.PI)) });
  for (let lon = 0; lon < 180; lon += step)
    out.push({ kind: lon === 0 ? "meridian" : "grid", pts: Array.from({ length: seg + 1 }, (_, i) => at(-Math.PI / 2 + (i / seg) * 2 * Math.PI, lon * rad)) });
  return out;
}

/** Which way the d-pad goes for a tap at (x, y) from the centre of the square (pure). */
export function edgeDir(x: number, y: number): "up" | "down" | "left" | "right" {
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}
