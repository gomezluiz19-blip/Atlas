// The economy on the globe: countries as glowing 3D columns that rise into
// place (taller for a bigger share), goods flowing between them as streams of
// light along arcs, countries a scenario hits as pulsing halos, and the sea
// lanes it closes. One layer per view, on the stack of views like any other.
import { BoundingSphere, CallbackProperty, Cartesian2, Cartesian3, Color, HeadingPitchRange, Math as CesiumMath, ColorMaterialProperty, CustomDataSource, LabelStyle, NearFarScalar, VerticalOrigin } from "cesium";
import type { App } from "../app";
import { FlowOverlay, type FlowLine } from "../globe/flow";
import { demand, wake, ambient } from "../globe/motion";
import { arc } from "../work/journey";
import { COUNTRIES } from "./places";

export interface Column { code: string; value: number; color: string; label?: string; /** Slide sideways (km east) so two columns in one country stand side by side. */ offsetKm?: number }
export interface Flow { from: string; to: string; weight: number; color: string }
export interface Halo { code: string; strength: number; color: string; label?: string }
export interface Pin { lon: number; lat: number; color: string; label: string }

const KM_PER_UNIT = 38; // a share of 50% stands about 1,900 km tall

/** Flies to look at a point from the south at a slant, so columns stand up instead of pointing at you. */
export function flyTilted(app: App, lon: number, lat: number, range: number, pitch = -48) {
  app.globe.viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(lon, lat, 0), 1), { offset: new HeadingPitchRange(0, CesiumMath.toRadians(pitch), range), duration: 1.8 });
}

const live = new Set<EconLayer>();

export class EconLayer {
  private ds = new CustomDataSource("econ");
  private flow: FlowOverlay;
  private born = 0;
  private visible = true;
  private lines: FlowLine[] = [];
  /** Halos and pins pulse, so the globe keeps drawing while they're on. */
  private pulsing = false;

  constructor(private app: App, private id: string, private label: string, private color: string, private emoji = "") {
    void app.globe.viewer.dataSources.add(this.ds);
    this.flow = new FlowOverlay(app.globe.viewer, { maxHeight: Number.POSITIVE_INFINITY, maxDrops: 2400, fade: 0.1 });
    // Columns rising: full rate for a moment. Halos pulsing after that: the calm ambient rate.
    demand(() => this.visible && performance.now() - this.born < 1600);
  }

  /** Draws a fresh scene: columns rise, flows start, halos pulse. */
  draw(opts: { columns?: Column[]; flows?: Flow[]; halos?: Halo[]; pins?: Pin[] }, label?: string) {
    if (label) this.label = label;
    // One economy view owns the globe at a time: the others step aside.
    for (const o of live) if (o !== this) o.clear();
    live.add(this);
    this.ds.entities.removeAll();
    this.born = performance.now();
    const grow = () => { const t = Math.min(1, (performance.now() - this.born) / 1400); return 1 - (1 - t) ** 3; };
    for (const c of opts.columns ?? []) {
      const at = COUNTRIES[c.code];
      if (!at || c.value <= 0) continue;
      const lon = at.lon + (c.offsetKm ?? 0) / (111 * Math.cos((at.lat * Math.PI) / 180));
      const full = Math.max(60, c.value * KM_PER_UNIT) * 1000;
      const col = Color.fromCssColorString(c.color);
      this.ds.entities.add({
        position: new CallbackProperty(() => Cartesian3.fromDegrees(lon, at.lat, (full * grow()) / 2), false) as unknown as Cartesian3,
        cylinder: { length: new CallbackProperty(() => Math.max(1, full * grow()), false), topRadius: 120_000, bottomRadius: 140_000,
          material: new ColorMaterialProperty(col.withAlpha(0.82)), outline: true, outlineColor: col.brighten(0.4, new Color()).withAlpha(0.9), numberOfVerticalLines: 0, slices: 32 },
      });
      if (c.label)
        this.ds.entities.add({
          position: new CallbackProperty(() => Cartesian3.fromDegrees(lon, at.lat, full * grow() + 90_000), false) as unknown as Cartesian3,
          label: { text: c.label, font: "700 13px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
            verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -4), scaleByDistance: new NearFarScalar(2e6, 1.1, 2.4e7, 0.75) },
        });
    }
    for (const hl of opts.halos ?? []) {
      const at = COUNTRIES[hl.code];
      if (!at) continue;
      const col = Color.fromCssColorString(hl.color), r = 350_000 + 650_000 * Math.min(1, hl.strength);
      const pulse = () => 0.18 + 0.22 * (0.5 + 0.5 * Math.sin((performance.now() - this.born) / 420));
      this.ds.entities.add({
        position: Cartesian3.fromDegrees(at.lon, at.lat),
        ellipse: { semiMajorAxis: r, semiMinorAxis: r, height: 0, material: new ColorMaterialProperty(new CallbackProperty(() => col.withAlpha(pulse()), false)), outline: false },
        label: hl.label ? { text: hl.label, font: "700 12px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: col.darken(0.5, new Color()), outlineWidth: 4, pixelOffset: new Cartesian2(0, 18) } : undefined,
      });
    }
    for (const p of opts.pins ?? [])
      this.ds.entities.add({
        position: Cartesian3.fromDegrees(p.lon, p.lat),
        point: { pixelSize: new CallbackProperty(() => 12 + 6 * (0.5 + 0.5 * Math.sin((performance.now() - this.born) / 300)), false), color: Color.fromCssColorString(p.color), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: p.label, font: "700 12px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
    // Flows: streams of light arcing between countries, heavier for bigger trade.
    const max = Math.max(1, ...(opts.flows ?? []).map((f) => f.weight));
    this.lines = (opts.flows ?? []).flatMap((f) => {
      const a = COUNTRIES[f.from], b = COUNTRIES[f.to];
      if (!a || !b) return [];
      const km = Math.hypot(a.lon - b.lon, a.lat - b.lat) * 100, w = f.weight / max;
      return arc([a.lon, a.lat], [b.lon, b.lat], 64).map((pts) => ({ pts: pts as [number, number][], color: f.color, speed: Math.max(60_000, km * 160), density: 0.02 + 0.08 * w, size: 1.4 + 2.4 * w, arc: Math.min(1_500_000, km * 260) }));
    });
    this.flow.set(this.visible ? this.lines : []);
    this.flow.show(this.visible);
    this.ds.show = this.visible;
    this.app.canvas.put({ id: this.id, label: `${this.emoji} ${this.label}`.trim(), color: this.color, scope: "world", pinned: true,
      show: (v) => { this.visible = v; this.ds.show = v; this.flow.show(v); if (v) this.flow.set(this.lines); ambient(this.app.globe.viewer.scene, this, v && this.pulsing); wake(1500); },
      remove: () => this.clear(false) }, true);
    this.pulsing = !!(opts.halos?.length || opts.pins?.length);
    ambient(this.app.globe.viewer.scene, this, this.visible && this.pulsing);
    wake(2500);
  }

  clear(drop = true) {
    live.delete(this);
    this.pulsing = false;
    ambient(this.app.globe.viewer.scene, this, false);
    this.ds.entities.removeAll();
    this.lines = [];
    this.flow.set([]);
    if (drop) this.app.canvas.drop(this.id);
  }
}
