// The wind on the globe, live: the wind now on a grid over the view (one
// Open-Meteo request), traced into streamlines, with drops of light running
// along them, coloured and paced by speed. Refreshed when the view settles
// somewhere new, and every quarter of an hour.
import type { App } from "../app";
import { getJson } from "../data/http";
import { FlowOverlay, type FlowLine } from "../globe/flow";
import { fieldFrom, gridFor, gridPoints, streamlines, windColor, type Box, type Sample } from "./wind";

type Point = { current?: { wind_speed_10m: number; wind_direction_10m: number } };

/** The view as a box, clamped to where the wind grid is meaningful. */
function viewBox(app: App): Box | null {
  const r = app.globe.viewer.camera.computeViewRectangle();
  if (!r) return { w: -180, s: -70, e: 180, n: 75 };
  const d = 180 / Math.PI;
  let w = r.west * d, e = r.east * d;
  if (e < w) e += 360;
  if (e - w > 200) { w = -180; e = 180; }
  return { w, e: Math.min(e, w + 360), s: Math.max(-75, r.south * d), n: Math.min(78, r.north * d) };
}

const kmBetween = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r), y = (b[1] - a[1]) * r;
  return Math.hypot(x, y) * 6371;
};

export class WindLayer {
  private flow: FlowOverlay | null = null;
  private on = false;
  private lastKey = "";
  private timer = 0;
  private stopMove: (() => void) | null = null;
  /** The last reading, for a sentence or a legend. */
  stats: { max: number; mean: number; at?: [number, number] } | null = null;
  onChange?: () => void;

  constructor(private app: App) {}

  get isOn() { return this.on; }

  toggle(v = !this.on) { if (v) this.start(); else this.stop(); return this.on; }

  start() {
    if (this.on) return;
    this.on = true;
    this.flow ??= new FlowOverlay(this.app.globe.viewer, { maxHeight: Number.POSITIVE_INFINITY, maxDrops: 3000, fade: 0.07 });
    this.flow.show(true);
    // On the stack of views like any layer: tap to hide it for a moment, x to switch it off.
    this.app.canvas.put({ id: "wind", label: "💨 Wind", color: "#4c9ac9", scope: "world", pinned: true, show: (v) => this.flow?.show(v), remove: () => this.stop() }, true);
    let t = 0;
    this.stopMove = this.app.globe.viewer.camera.moveEnd.addEventListener(() => { clearTimeout(t); t = window.setTimeout(() => void this.refresh(), 500); });
    this.timer = window.setInterval(() => { this.lastKey = ""; void this.refresh(); }, 15 * 60_000);
    void this.refresh();
  }

  stop() {
    this.on = false;
    this.app.canvas.drop("wind");
    this.flow?.show(false);
    this.flow?.set([]);
    this.stopMove?.(); this.stopMove = null;
    clearInterval(this.timer);
    this.lastKey = "";
    this.onChange?.();
  }

  async refresh() {
    if (!this.on) return;
    const box = viewBox(this.app);
    if (!box) return;
    const key = [box.w, box.s, box.e, box.n].map((v) => Math.round(v * 2) / 2).join(",");
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { nx, ny } = gridFor(box);
    const pts = gridPoints(box, nx, ny).map(([lon, lat]) => [((lon + 540) % 360) - 180, lat] as [number, number]);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p[1].toFixed(2)).join(",")}&longitude=${pts.map((p) => p[0].toFixed(2)).join(",")}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
    let rows: Point[];
    try {
      const r = await getJson<Point | Point[]>("Open-Meteo", url, undefined, 25_000);
      rows = Array.isArray(r) ? r : [r];
    } catch { this.lastKey = ""; this.app.toast("Couldn't read the wind just now.", 3000); return; }
    if (!this.on || rows.length !== pts.length) return;
    const samples: Sample[] = rows.map((r, i) => ({ lon: pts[i][0], lat: pts[i][1], speed: r.current?.wind_speed_10m ?? 0, dir: r.current?.wind_direction_10m ?? 0 }));
    const field = fieldFrom(box, nx, ny, samples);
    const lines = streamlines(field, box.e - box.w > 120 ? 22 : 16, 48);
    const flows: FlowLine[] = lines.map((l) => {
      let km = 0;
      for (let i = 1; i < l.pts.length; i++) km += kmBetween(l.pts[i - 1], l.pts[i]);
      // Drops cross a line in about 10 s in a moderate breeze, faster in a gale.
      return { pts: l.pts, color: windColor(l.speed), speed: (km * 1000 / 10) * Math.max(0.35, Math.min(2.5, l.speed / 25)), density: 7 / Math.max(1, km), size: 1.3 + Math.min(1.2, l.speed / 60) };
    });
    this.flow?.set(flows);
    const sp = samples.map((s) => s.speed), max = Math.max(...sp), top = samples[sp.indexOf(max)];
    this.stats = { max, mean: sp.reduce((a, b) => a + b, 0) / sp.length, at: [top.lon, top.lat] };
    this.onChange?.();
  }
}

let shared: WindLayer | null = null;
export const windLayer = (app: App) => (shared ??= new WindLayer(app));
