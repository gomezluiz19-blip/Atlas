// A person's footprint on the planet: the world drawn in fine dots, turning
// slowly, with the places on their page glowing in their colour and arcs
// from home to each. Drawn on a 2D canvas (no WebGL), cheap enough to sit at
// the top of every page.
import { feature } from "topojson-client";

type Ring = [number, number][];
let landDots: Promise<[number, number][]> | null = null;

/** Every land point on a ~1.6° grid, spaced evenly by latitude (cached). */
function dots(): Promise<[number, number][]> {
  landDots ??= (async () => {
    const topo = await import("world-atlas/land-110m.json");
    const t = (topo as { default?: unknown }).default ?? topo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(t as any, (t as any).objects.land) as unknown as { features: { geometry: { type: string; coordinates: Ring[] | Ring[][] } }[] };
    const polys: { rings: Ring[]; bbox: [number, number, number, number] }[] = [];
    for (const f of fc.features) {
      const ps = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
      for (const rings of ps) {
        let w = 180, s = 90, e = -180, n = -90;
        for (const [x, y] of rings[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
        polys.push({ rings, bbox: [w, s, e, n] });
      }
    }
    const inRing = (x: number, y: number, r: Ring) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const out: [number, number][] = [];
    const step = 1.6;
    for (let lat = -58; lat <= 82; lat += step) {
      const dlon = step / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      for (let lon = -180; lon < 180; lon += dlon)
        if (polys.some((p) => lon >= p.bbox[0] && lon <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3] && inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h)))) out.push([lon, lat]);
    }
    return out;
  })();
  return landDots;
}

/** Orthographic projection about a centre (pure): x, y in −1..1, and whether it's on the near side. */
export function ortho(lon: number, lat: number, lon0: number, lat0: number): { x: number; y: number; front: boolean } {
  const r = Math.PI / 180, l = (lon - lon0) * r, p = lat * r, p0 = lat0 * r;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return { x: Math.cos(p) * Math.sin(l), y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l), front: cosc > 0 };
}

export interface FootprintOpts { places: { lon: number; lat: number }[]; home?: { lon: number; lat: number }; accent: string; height?: number }

/** The footprint as a live canvas; it stops drawing once it leaves the page. */
export function footprint(o: FootprintOpts): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "pf-globe";
  const g = c.getContext("2d")!;
  const centre = o.home ?? o.places[0] ?? { lon: 0, lat: 20 };
  let lon0 = centre.lon - 25;
  const lat0 = Math.max(-35, Math.min(45, centre.lat * 0.6));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let land: [number, number][] = [];
  void dots().then((d) => { land = d; });
  const t0 = performance.now();
  const draw = (now: number) => {
    const dpr = Math.min(2, devicePixelRatio), w = c.clientWidth || 600, hh = c.clientHeight || (o.height ?? 260);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const R = Math.min(w * 0.34, hh * 0.62), cx = w * 0.68, cy = hh * 0.56;
    // The planet's limb: a faint ring of light.
    const glow = g.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.12);
    glow.addColorStop(0, "rgba(255,255,255,0)"); glow.addColorStop(0.45, `${o.accent}33`); glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, Math.PI * 2); g.fill();
    // Land in dots, brighter towards the middle of the face.
    for (const [lon, lat] of land) {
      const q = ortho(lon, lat, lon0, lat0);
      if (!q.front) continue;
      const depth = Math.sqrt(Math.max(0, 1 - q.x * q.x - q.y * q.y));
      g.fillStyle = `rgba(210, 225, 240, ${0.12 + depth * 0.5})`;
      g.fillRect(cx + q.x * R - 0.8, cy - q.y * R - 0.8, 1.6, 1.6);
    }
    // Arcs from home, lifted off the surface.
    const pulse = (Math.sin((now - t0) / 700) + 1) / 2;
    if (o.home) for (const p of o.places) {
      const steps = 40;
      g.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, lon = o.home.lon + (p.lon - o.home.lon) * f, lat = o.home.lat + (p.lat - o.home.lat) * f;
        const q = ortho(lon, lat, lon0, lat0);
        if (!q.front) { started = false; continue; }
        const lift = 1 + Math.sin(f * Math.PI) * 0.12;
        const x = cx + q.x * R * lift, y = cy - q.y * R * lift;
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.strokeStyle = `${o.accent}99`; g.lineWidth = 1.2; g.stroke();
    }
    for (const p of o.places) {
      const q = ortho(p.lon, p.lat, lon0, lat0);
      if (!q.front) continue;
      const x = cx + q.x * R, y = cy - q.y * R;
      const halo = g.createRadialGradient(x, y, 0, x, y, 9 + pulse * 3);
      halo.addColorStop(0, "#fff"); halo.addColorStop(0.25, o.accent); halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(x, y, 9 + pulse * 3, 0, Math.PI * 2); g.fill();
    }
    if (!reduced) lon0 += 0.04;
    if (c.isConnected || now - t0 < 2000) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return c;
}
