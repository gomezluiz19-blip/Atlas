// Cinematic camera moves, borrowed from film and games. A shot is a set of keyframes, each a camera position
// and the point it looks at (and optionally a field of view); playback runs a centripetal Catmull-Rom spline
// through both (smooth, no overshoot or loops, unlike the uniform kind), eased like a camera operator's hands
// (slow in, slow out), with the orientation always derived from "where am I, what am I looking at" so the
// horizon never rolls. The shot library covers the standard drone and crane moves, and Hitchcock's dolly zoom.
// Everything here is pure; play.ts drives the Cesium camera.

export interface Key { /** camera [lon, lat, height above ground in metres] */ at: [number, number, number]; /** target [lon, lat, height] */ look: [number, number, number]; /** vertical field of view, degrees */ fov?: number }
export interface Shot { id: string; label: string; keys: Key[]; seconds: number; ease: Ease }
export type Ease = "linear" | "inOut" | "in" | "out" | "smoother";

/** Easing curves (pure). "smoother" is Perlin's smootherstep: zero velocity and acceleration at both ends. */
export function ease(t: number, e: Ease): number {
  const x = Math.min(1, Math.max(0, t));
  switch (e) {
    case "linear": return x;
    case "in": return x * x * x;
    case "out": return 1 - (1 - x) ** 3;
    case "smoother": return x * x * x * (x * (x * 6 - 15) + 10);
    default: return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

type V = number[];
const sub = (a: V, b: V) => a.map((v, i) => v - b[i]);
const dist = (a: V, b: V) => Math.hypot(...sub(a, b));

/**
 * Centripetal Catmull-Rom (alpha 0.5) through points p[0..n−1], at u in [0, 1] across the whole path (pure).
 * Works in any dimension. Ends are extended by mirroring so the curve passes through the first and last points.
 */
export function catmullRom(p: V[], u: number): V {
  if (p.length === 1) return p[0].slice();
  const n = p.length - 1;
  const s = Math.min(n - 1e-9, Math.max(0, u * n)), i = Math.floor(s), t = s - i;
  const p1 = p[i], p2 = p[i + 1];
  const p0 = p[i - 1] ?? p1.map((v, k) => 2 * v - p2[k]);
  const p3 = p[i + 2] ?? p2.map((v, k) => 2 * v - p1[k]);
  const tj = (a: V, b: V, ti: number) => ti + Math.max(1e-6, Math.sqrt(dist(a, b)));
  const t0 = 0, t1 = tj(p0, p1, t0), t2 = tj(p1, p2, t1), t3 = tj(p2, p3, t2);
  const tt = t1 + (t2 - t1) * t;
  const lerp = (a: V, b: V, ta: number, tb: number) => a.map((v, k) => ((tb - tt) / (tb - ta)) * v + ((tt - ta) / (tb - ta)) * b[k]);
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * Where the camera is and what it looks at, a moment into a shot (pure). The spline runs in metres around the
 * shot's first target (degrees of longitude and metres of height don't mix), then comes back to lon/lat.
 */
export function sample(shot: Shot, seconds: number): Key {
  const u = ease(seconds / Math.max(0.001, shot.seconds), shot.ease);
  const o = shot.keys[0].look, kx = M_LAT * Math.cos((o[1] * Math.PI) / 180);
  const toM = (p: number[]) => [(p[0] - o[0]) * kx, (p[1] - o[1]) * M_LAT, p[2]];
  const toLL = (m: number[]): [number, number, number] => [o[0] + m[0] / kx, o[1] + m[1] / M_LAT, m[2]];
  const at = toLL(catmullRom(shot.keys.map((k) => toM(k.at)), u));
  const look = toLL(catmullRom(shot.keys.map((k) => toM(k.look)), u));
  return { at, look, fov: catmullRom(shot.keys.map((k) => [k.fov ?? 60]), u)[0] };
}

const M_LAT = 111_320;
/** A point d metres east and n north of [lon, lat] (pure). */
export const offset = (lon: number, lat: number, e: number, n: number): [number, number] => [lon + e / (M_LAT * Math.cos((lat * Math.PI) / 180)), lat + n / M_LAT];

export interface Subject { lon: number; lat: number; /** height of the thing's middle above ground */ height: number; /** about how big it is, metres */ size: number }
const deg = (d: number) => (d * Math.PI) / 180;

/** The shot library (pure): each a few keyframes around a subject, sized to it. */
export function shots(s: Subject, opts: { heading?: number } = {}): Shot[] {
  const h0 = opts.heading ?? 30, r = Math.max(30, s.size * 2.4), look: Key["look"] = [s.lon, s.lat, s.height];
  const around = (headingDeg: number, dist: number, up: number): Key["at"] => { const [lon, lat] = offset(s.lon, s.lat, Math.sin(deg(headingDeg)) * dist, Math.cos(deg(headingDeg)) * dist); return [lon, lat, up]; };
  // A full orbit: a key every 30° keeps the spline within about 1% of the circle.
  const orbit: Key[] = Array.from({ length: 13 }, (_, i) => ({ at: around(h0 + i * 30, r, s.height + r * 0.45), look }));
  return [
    { id: "orbit", label: "Orbit", keys: orbit, seconds: 18, ease: "linear" },
    { id: "reveal", label: "Reveal", seconds: 9, ease: "smoother",
      keys: [{ at: around(h0, s.size * 0.7, s.height * 0.4 + 2), look }, { at: around(h0 + 10, r * 0.9, s.height + r * 0.25), look }, { at: around(h0 + 25, r * 1.8, s.height + r * 0.9), look }] },
    { id: "flyover", label: "Flyover", seconds: 10, ease: "inOut",
      keys: [{ at: around(h0 + 180, r * 2.2, s.height + r * 0.8), look }, { at: around(h0 + 180, r * 0.6, s.height + r * 0.75), look: around(h0, r * 0.4, s.height * 0.5) as Key["look"] }, { at: around(h0, r * 1.6, s.height + r * 0.9), look: around(h0, r * 4, 0) as Key["look"] }] },
    { id: "dronie", label: "Dronie", seconds: 8, ease: "out",
      keys: [{ at: around(h0, s.size * 0.6, s.height), look }, { at: around(h0, r * 3.5, s.height + r * 2.2), look }] },
    { id: "crane", label: "Crane up", seconds: 7, ease: "smoother",
      keys: [{ at: around(h0, r, 2), look: [s.lon, s.lat, s.height * 0.6] }, { at: around(h0, r * 1.05, s.height + r * 1.2), look }] },
    // Hitchcock's dolly zoom: the camera pulls back while the lens zooms in, so the subject stays the same size
    // and the world behind it seems to stretch away. d · tan(fov/2) stays constant.
    { id: "vertigo", label: "Dolly zoom", seconds: 6, ease: "inOut", keys: dollyZoom(s, h0) },
  ];
}

/** Keys for a dolly zoom (pure): distance and field of view change together so the subject's framed size holds. */
export function dollyZoom(s: Subject, heading: number, fromFov = 70, toFov = 18): Key[] {
  const look: Key["look"] = [s.lon, s.lat, s.height];
  const d0 = Math.max(20, s.size * 1.2), k = d0 * Math.tan(deg(fromFov) / 2);
  return [0, 0.5, 1].map((t) => {
    const fov = fromFov + (toFov - fromFov) * t, d = k / Math.tan(deg(fov) / 2);
    const [lon, lat] = offset(s.lon, s.lat, Math.sin(deg(heading)) * d, Math.cos(deg(heading)) * d);
    return { at: [lon, lat, s.height], look, fov };
  });
}

/** A shot through places someone picked, looking ahead along the way (pure): a tour. */
export function tour(points: { lon: number; lat: number }[], altitude: number, secondsPerLeg = 6): Shot {
  const keys: Key[] = points.map((p, i) => {
    const next = points[Math.min(points.length - 1, i + 1)], prev = points[Math.max(0, i - 1)];
    const ahead: [number, number] = i === points.length - 1 ? [p.lon + (p.lon - prev.lon) * 0.5, p.lat + (p.lat - prev.lat) * 0.5] : [next.lon, next.lat];
    return { at: [p.lon, p.lat, altitude], look: [ahead[0], ahead[1], 0] };
  });
  return { id: "tour", label: "Tour", keys, seconds: Math.max(4, (points.length - 1) * secondsPerLeg), ease: "inOut" };
}
