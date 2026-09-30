// A trip playing out on the globe: for each leg, a small vehicle (the plane,
// the train, the car) travels from one place to the next while the route
// draws itself behind it in the leg's colour. Flights lift off the globe in a
// high arc; ground travel hugs it. A ripple marks each arrival. Used when a
// trip is played, and for each new leg as it's added.
import { BillboardCollection, Cartesian3, Color, Material, NearFarScalar, PolylineCollection, type Billboard, type Polyline } from "cesium";
import type { App } from "../app";
import { iconSvg } from "../ui/glyph";
import { arc } from "./journey";
import { metres } from "./geo";
import { MODES, type Mode, type Spot } from "./journeyModel";

let prims: { bbs: BillboardCollection; lines: PolylineCollection } | null = null;
const layer = (app: App) => {
  if (!prims) {
    const scene = app.globe.viewer.scene;
    prims = { bbs: scene.primitives.add(new BillboardCollection({ scene })), lines: scene.primitives.add(new PolylineCollection()) };
  }
  return prims;
};

/** A round badge with the mode's picture in it. */
function badge(mode: Mode): string {
  const m = MODES[mode];
  // The line icon's drawing, re-hosted in white inside the badge.
  const paths = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(iconSvg(m.emoji, 26) ?? "")?.[1] ?? "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="${m.color}" stroke="#fff" stroke-width="3"/><svg x="12" y="12" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></svg>`)}`;
}
const RING = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="none" stroke="#fff" stroke-width="3"/></svg>')}`;

/** The leg as points with heights: a flight arcs up (higher for longer hops), ground travel stays low. */
export function legPath(from: Spot, to: Spot, mode: Mode): { lon: number; lat: number; h: number }[] {
  const d = metres([from.lon, from.lat], [to.lon, to.lat]);
  const pts = (mode === "fly" || d > 300_000 ? arc([from.lon, from.lat], [to.lon, to.lat], 64).flat() : Array.from({ length: 33 }, (_, i) => [from.lon + ((to.lon - from.lon) * i) / 32, from.lat + ((to.lat - from.lat) * i) / 32] as [number, number]));
  const top = mode === "fly" ? Math.min(900_000, Math.max(8000, d * 0.12)) : 60;
  return pts.map(([lon, lat], i) => ({ lon, lat, h: mode === "fly" ? Math.sin((Math.PI * i) / (pts.length - 1)) * top : top }));
}

/** Plays one leg: the vehicle travels it and the route draws in behind. Resolves on arrival. */
export function animateLeg(app: App, from: Spot, to: Spot, mode: Mode, still: () => boolean = () => true): Promise<void> {
  const { bbs, lines } = layer(app);
  const path = legPath(from, to, mode);
  const xyz = path.map((p) => Cartesian3.fromDegrees(p.lon, p.lat, p.h));
  const km = metres([from.lon, from.lat], [to.lon, to.lat]) / 1000;
  const ms = Math.max(1600, Math.min(4800, 1400 + Math.log10(km + 1) * 900));
  const color = Color.fromCssColorString(MODES[mode].color);
  const line: Polyline = lines.add({ positions: [xyz[0], xyz[0]], width: mode === "fly" ? 5 : 7, material: Material.fromType(Material.PolylineGlowType, { color, glowPower: 0.22 }) });
  const car: Billboard = bbs.add({ position: xyz[0], image: badge(mode), width: 34, height: 34, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(2e4, 1.2, 2e7, 0.7) });
  const scene = app.globe.viewer.scene;
  const t0 = performance.now();
  return new Promise((done) => {
    const off = scene.preRender.addEventListener(() => {
      const raw = Math.min(1, (performance.now() - t0) / ms);
      const f = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2; // ease in and out
      const at = f * (xyz.length - 1), i = Math.floor(at);
      const here = i >= xyz.length - 1 ? xyz[xyz.length - 1] : Cartesian3.lerp(xyz[i], xyz[i + 1], at - i, new Cartesian3());
      car.position = here;
      line.positions = [...xyz.slice(0, i + 1), here];
      if (raw >= 1 || !still()) {
        off();
        bbs.remove(car);
        if (raw >= 1) ripple(app, to);
        // The drawn route stays a moment, then gives way to the trip's own line.
        setTimeout(() => lines.remove(line), 900);
        done();
      }
    });
  });
}

/** A ring that spreads and fades where you arrive. */
function ripple(app: App, at: Spot) {
  const { bbs } = layer(app);
  const b = bbs.add({ position: Cartesian3.fromDegrees(at.lon, at.lat, 30), image: RING, width: 64, height: 64, disableDepthTestDistance: Number.POSITIVE_INFINITY });
  const t0 = performance.now();
  const off = app.globe.viewer.scene.preRender.addEventListener(() => {
    const f = (performance.now() - t0) / 900;
    if (f >= 1) { off(); bbs.remove(b); return; }
    b.scale = 0.4 + f * 1.4;
    b.color = Color.WHITE.withAlpha(1 - f);
  });
}
