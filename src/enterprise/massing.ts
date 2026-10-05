// Buildings as glowing floor-by-floor models on the globe, for the enterprise
// tools (schools and campuses, construction sites, a city's facilities): each
// floor a slab of its own colour (a status, a stage, an agency), floors not yet
// built drawn as ghosts, alerts pulsing, a tower crane on sites going up, and a
// label over each. They rise into place floor by floor. Tapping one calls back.
//
// Built for speed. Every slab of every building goes into ONE batched GPU
// primitive (plus one for the outlines), built off the main thread, instead of
// an entity per floor. Each floor's colour and visibility live in per-instance
// attributes, so recolouring (a time slider scrubbing a region, a toggle from
// agency to condition) writes a few bytes per floor and never rebuilds
// geometry. Heights come from the terrain once per building and are cached,
// so nothing is clamped to the ground frame after frame. Ambient motion
// (pulses, cranes) draws at a calm 20 frames a second, not the full rate.
import {
  CallbackProperty, Cartesian2, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, ColorMaterialProperty, CustomDataSource, GeometryInstance, LabelStyle,
  NearFarScalar, PerInstanceColorAppearance, PolygonHierarchy, PolygonOutlineGeometry, Primitive, PrimitiveCollection, sampleTerrain, ShowGeometryInstanceAttribute, VerticalOrigin,
} from "cesium";
import type { App } from "../app";
import { ambient, wake } from "../globe/motion";
import { makeTappable } from "../globe/pickables";
import { facadeAppearance, floorGeometry } from "../render/facade";

export interface MassBuilding {
  id: string;
  lon: number;
  lat: number;
  /** Footprint, metres: along the bearing, and across it. */
  w: number;
  d: number;
  bearing?: number;
  /** Offset from lon/lat, metres east and north (for a campus of several buildings). */
  dx?: number;
  dy?: number;
  floors: number;
  floorH?: number;
  /** The colour of each floor (CSS). */
  floorColor: (i: number) => string;
  /** Floors from here up are drawn as ghosts (planned, not built). */
  ghostFrom?: number;
  label?: string;
  pulse?: string;
  crane?: boolean;
  /** A dot on the ground in this colour, so the building can be found from far out (it fades as you come close). */
  dot?: string;
  onTap?: () => void;
}

const M_LAT = 111_320;
/** The four corners of a footprint, turned and offset (pure). */
export function footprint(b: Pick<MassBuilding, "lon" | "lat" | "w" | "d" | "bearing" | "dx" | "dy">): [number, number][] {
  const r = ((b.bearing ?? 0) * Math.PI) / 180, mLon = M_LAT * Math.cos((b.lat * Math.PI) / 180);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const x = (sx * b.w) / 2, y = (sy * b.d) / 2;
    const e = (b.dx ?? 0) + x * Math.sin(r) + y * Math.cos(r), n = (b.dy ?? 0) + x * Math.cos(r) - y * Math.sin(r);
    return [b.lon + e / mLon, b.lat + n / M_LAT];
  });
}

/** What makes a building's geometry: if this is unchanged, only colours need updating (pure). */
export const shapeKey = (b: MassBuilding) => `${b.id}|${b.lon.toFixed(6)}|${b.lat.toFixed(6)}|${b.w}|${b.d}|${b.bearing ?? 0}|${b.dx ?? 0}|${b.dy ?? 0}|${b.floors}|${b.floorH ?? 3.6}`;

/** A floor's fill and outline colour (pure): ghosts are faint, built floors nearly solid. */
export function floorPaint(b: MassBuilding, i: number): { fill: [number, number, number, number]; line: [number, number, number, number] } {
  const c = Color.fromCssColorString(b.floorColor(i)) ?? Color.GRAY;
  const ghost = i >= (b.ghostFrom ?? b.floors);
  const l = Color.lerp(c, Color.WHITE, 0.35, new Color());
  return { fill: [c.red, c.green, c.blue, ghost ? 0.12 : 0.82], line: [l.red, l.green, l.blue, ghost ? 0.45 : 0.9] };
}

/** Ground heights by place, shared across every massing (terrain doesn't move). */
const groundCache = new Map<string, number>();
const gKey = (lon: number, lat: number) => `${lon.toFixed(5)},${lat.toFixed(5)}`;

export class Massing {
  private ds = new CustomDataSource("massing");
  private prims: PrimitiveCollection;
  private fill: Primitive | null = null;
  private line: Primitive | null = null;
  private keys: string[] = [];
  private current: MassBuilding[] = [];
  private ground = new Map<string, number>();
  private seq = 0;
  private visible = true;

  constructor(private app: App, private id: string, private label: string, private color: string, private emoji = "🏢") {
    void app.globe.viewer.dataSources.add(this.ds);
    this.prims = app.globe.viewer.scene.primitives.add(new PrimitiveCollection());
  }

  /**
   * Draws the buildings. If their shapes are the same as last time (only colours, ghosts, labels or alerts
   * changed), the geometry stays and only per-floor attributes are rewritten: cheap enough to scrub a slider.
   */
  async draw(buildings: MassBuilding[], label?: string, rise = true) {
    if (label) this.label = label;
    const seq = ++this.seq;
    const keys = buildings.map(shapeKey);
    const same = !!this.fill && keys.length === this.keys.length && keys.every((k, i) => k === this.keys[i]);
    this.current = buildings;
    this.putOnCanvas();
    if (same) { this.recolour(); this.extras(); return; }
    await this.groundFor(buildings);
    if (seq !== this.seq) return; // a newer draw has started
    this.keys = keys;
    this.build(rise);
    this.extras();
  }

  /** Looks up (once) the ground height under each building, so slabs can sit on absolute heights. */
  private async groundFor(bs: MassBuilding[]) {
    const scene = this.app.globe.viewer.scene;
    const need = bs.filter((b) => !groundCache.has(gKey(...this.centre(b))));
    if (need.length) {
      const cartos = need.map((b) => Cartographic.fromDegrees(...this.centre(b)));
      try {
        const provider = scene.terrainProvider;
        // A level fine enough for a building, coarse enough to be a handful of tiles for a whole city.
        const done = await Promise.race([sampleTerrain(provider, 13, cartos), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
        need.forEach((b, i) => groundCache.set(gKey(...this.centre(b)), done ? (done[i].height ?? 0) : 0));
      } catch { need.forEach((b) => groundCache.set(gKey(...this.centre(b)), 0)); }
    }
    const ex = scene.verticalExaggeration ?? 1;
    for (const b of bs) this.ground.set(b.id, (groundCache.get(gKey(...this.centre(b))) ?? 0) * ex);
  }

  /** One primitive for every slab, one for every outline: a couple of draw calls whatever the count. */
  private build(rise: boolean) {
    if (this.fill) this.prims.remove(this.fill);
    if (this.line) this.prims.remove(this.line);
    const fills: GeometryInstance[] = [], lines: GeometryInstance[] = [];
    this.fillIds.clear();
    for (const b of this.current) {
      const fh = b.floorH ?? 3.6, g = this.ground.get(b.id) ?? 0;
      const corners = footprint(b), hier = new PolygonHierarchy(Cartesian3.fromDegreesArray(corners.flat()));
      for (let i = 0; i < b.floors; i++) {
        const key = `${b.id}#${i}`, fid: unknown = b.onTap ? { building: b.id, floor: i } : key;
        if (b.onTap) makeTappable(fid as object, b.onTap);
        this.fillIds.set(key, fid);
        const p = floorPaint(b, i), show = !rise;
        // The ground floor reaches a little below the sampled ground, so a coarse terrain tile never shows a gap.
        const bottom = g + i * fh + (i === 0 ? -2 : 0.25), top = g + (i + 1) * fh - 0.25;
        fills.push(new GeometryInstance({ id: fid, geometry: floorGeometry(corners, bottom, top),
          attributes: { color: new ColorGeometryInstanceAttribute(...p.fill), show: new ShowGeometryInstanceAttribute(show) } }));
        lines.push(new GeometryInstance({ id: key, geometry: new PolygonOutlineGeometry({ polygonHierarchy: hier, height: bottom, extrudedHeight: top }),
          attributes: { color: new ColorGeometryInstanceAttribute(...p.line), show: new ShowGeometryInstanceAttribute(show) } }));
      }
    }
    // Facades: windows at a real bay spacing, catching the sun by day and lit at night (render/facade.ts).
    // The slabs are already built geometry (not a worker-built type), so this batch compiles synchronously; it is
    // a few thousand vertices even for a whole city.
    this.fill = this.prims.add(new Primitive({ geometryInstances: fills, appearance: facadeAppearance(), asynchronous: false, releaseGeometryInstances: false, show: this.visible }));
    this.line = this.prims.add(new Primitive({ geometryInstances: lines, appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }), asynchronous: true, releaseGeometryInstances: false, show: this.visible }));
    this.whenReady(() => (rise ? this.rise() : wake(300)));
  }

  /** Runs once both primitives have finished building on the workers. */
  private whenReady(fn: () => void) {
    const fill = this.fill, line = this.line, scene = this.app.globe.viewer.scene;
    const check = () => {
      if (fill !== this.fill || line !== this.line) return; // replaced meanwhile
      if (fill?.ready && line?.ready) { fn(); return; }
      scene.requestRender(); setTimeout(check, 60);
    };
    check();
  }

  /** The floors appear one storey at a time, all buildings together. */
  private rise() {
    const fill = this.fill, line = this.line;
    if (!fill || !line) return;
    const floors = Math.max(1, ...this.current.map((b) => b.floors));
    const t0 = performance.now();
    let shown = -1;
    const step = () => {
      if (fill !== this.fill) return;
      const upTo = Math.min(floors - 1, Math.floor((performance.now() - t0) / 70));
      for (let i = shown + 1; i <= upTo; i++) for (const b of this.current) if (i < b.floors) this.setShow(b, i, true);
      shown = upTo;
      wake(120);
      if (shown < floors - 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** A floor's per-instance attributes in one of the two primitives (undefined until it's built). */
  private attrs(prim: Primitive | null, b: MassBuilding, i: number) {
    if (!prim?.ready) return undefined;
    const key = `${b.id}#${i}`;
    return prim.getGeometryInstanceAttributes(prim === this.fill ? this.fillIds.get(key) ?? key : key) as { color: Uint8Array; show: Uint8Array } | undefined;
  }
  /** Fill instance ids: an object (so a tap finds its building) for tappable buildings, else a string. */
  private fillIds = new Map<string, unknown>();

  private setShow(b: MassBuilding, i: number, v: boolean) {
    for (const prim of [this.fill, this.line]) {
      const a = this.attrs(prim, b, i);
      if (a) a.show = ShowGeometryInstanceAttribute.toValue(v, a.show);
    }
  }

  /** New colours and ghosts for the same shapes: attribute writes only. */
  private recolour() {
    if (!this.fill?.ready || !this.line?.ready) { this.whenReady(() => this.recolour()); return; }
    for (const b of this.current) for (let i = 0; i < b.floors; i++) {
      const p = floorPaint(b, i);
      const fa = this.attrs(this.fill, b, i), la = this.attrs(this.line, b, i);
      if (fa) { fa.color = ColorGeometryInstanceAttribute.toValue(new Color(...p.fill), fa.color); fa.show = ShowGeometryInstanceAttribute.toValue(true, fa.show); }
      if (la) { la.color = ColorGeometryInstanceAttribute.toValue(new Color(...p.line), la.color); la.show = ShowGeometryInstanceAttribute.toValue(true, la.show); }
    }
    wake(250);
  }

  /** The few things that stay entities: pulses, dots, labels and cranes. All at absolute heights. */
  private extras() {
    this.ds.entities.removeAll();
    this.setAmbient(false);
    let moving = false;
    const born = performance.now();
    for (const b of this.current) {
      const fh = b.floorH ?? 3.6, g = this.ground.get(b.id) ?? 0, [lon, lat] = this.centre(b);
      if (b.pulse) {
        const pc = Color.fromCssColorString(b.pulse), r = Math.max(b.w, b.d) * 0.95;
        this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat, g), ellipse: { semiMajorAxis: r, semiMinorAxis: r, height: g + 0.5,
          material: new ColorMaterialProperty(new CallbackProperty(() => pc.withAlpha(0.15 + 0.25 * (0.5 + 0.5 * Math.sin((performance.now() - born) / 380))), false)) } });
        moving = true;
      }
      if (b.crane) { this.crane(b, Math.max(b.floors, b.ghostFrom ?? b.floors) * fh, g, born); moving = true; }
      if (b.dot) {
        const e = this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat, g + 2), point: { pixelSize: 10, color: Color.fromCssColorString(b.dot), outlineColor: Color.WHITE, outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, translucencyByDistance: new NearFarScalar(1500, 0, 4000, 1) } });
        if (b.onTap) makeTappable(e, b.onTap);
      }
      if (b.label) {
        const e = this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat, g + b.floors * fh + 12), label: { text: b.label, font: "700 12px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -4),
          scaleByDistance: new NearFarScalar(500, 1.1, 60_000, 0.6), translucencyByDistance: new NearFarScalar(60_000, 1, 260_000, 0) } });
        if (b.onTap) makeTappable(e, b.onTap);
      }
    }
    this.setAmbient(moving);
    wake(300);
  }

  /** Pulses and cranes move at a calm 20 frames a second while shown. */
  private setAmbient(on: boolean) {
    ambient(this.app.globe.viewer.scene, this, on);
  }

  private putOnCanvas() {
    this.app.canvas.put({ id: this.id, label: `${this.emoji} ${this.label}`, color: this.color, scope: "world", pinned: true,
      show: (v) => { this.visible = v; this.ds.show = v; if (this.fill) this.fill.show = v; if (this.line) this.line.show = v; this.setAmbient(v && this.ds.entities.values.length > 0 && this.current.some((b) => b.pulse || b.crane)); wake(800); },
      remove: () => this.clear(false) }, true);
  }

  private centre(b: MassBuilding): [number, number] {
    const mLon = M_LAT * Math.cos((b.lat * Math.PI) / 180);
    return [b.lon + (b.dx ?? 0) / mLon, b.lat + (b.dy ?? 0) / M_LAT];
  }

  /** A tower crane beside the building: a yellow mast and a jib swinging slowly. */
  private crane(b: MassBuilding, height: number, g: number, born: number) {
    const [lon, lat] = this.centre(b), mLon = M_LAT * Math.cos((lat * Math.PI) / 180);
    const mx = lon + (b.w / 2 + 8) / mLon, my = lat;
    const mastH = height + 18, jib = Math.max(35, b.w * 0.9), yellow = Color.fromCssColorString("#ffcc00");
    this.ds.entities.add({ position: Cartesian3.fromDegrees(mx, my, g + mastH / 2), box: { dimensions: new Cartesian3(2.4, 2.4, mastH), material: yellow } });
    const top = g + mastH;
    this.ds.entities.add({ polyline: { positions: new CallbackProperty(() => {
      const a = ((performance.now() - born) / 9000) % (Math.PI * 2), ex = Math.cos(a) * jib, ny = Math.sin(a) * jib, bx = -Math.cos(a) * jib * 0.3, by = -Math.sin(a) * jib * 0.3;
      return Cartesian3.fromDegreesArrayHeights([mx + bx / mLon, my + by / M_LAT, top, mx + ex / mLon, my + ny / M_LAT, top]);
    }, false), width: 4, material: yellow } });
  }

  clear(drop = true) {
    this.seq++;
    this.setAmbient(false);
    this.ds.entities.removeAll();
    if (this.fill) this.prims.remove(this.fill);
    if (this.line) this.prims.remove(this.line);
    this.fill = this.line = null; this.keys = []; this.current = [];
    if (drop) this.app.canvas.drop(this.id);
    wake(300);
  }
}
