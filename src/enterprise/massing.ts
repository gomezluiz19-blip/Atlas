// Buildings as glowing floor-by-floor models on the globe, for the enterprise
// tools (schools and campuses, construction sites, a city's facilities): each
// floor a slab of its own colour (a status, a stage, an agency), floors not yet
// built drawn as ghosts, alerts pulsing, a tower crane on sites going up, and a
// label over each. They rise into place floor by floor. Tapping one calls back.
import { CallbackProperty, Cartesian2, Cartesian3, Color, ColorMaterialProperty, CustomDataSource, HeightReference, LabelStyle, NearFarScalar, PolygonHierarchy, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { wake } from "../globe/motion";
import { makeTappable } from "../globe/pickables";

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

export class Massing {
  private ds = new CustomDataSource("massing");
  private born = 0;
  private pulsing = false;

  constructor(private app: App, private id: string, private label: string, private color: string, private emoji = "🏢") {
    void app.globe.viewer.dataSources.add(this.ds);
  }

  draw(buildings: MassBuilding[], label?: string, rise = true) {
    if (label) this.label = label;
    this.ds.entities.removeAll();
    this.born = performance.now();
    this.pulsing = buildings.some((b) => b.pulse);
    for (const b of buildings) {
      const fh = b.floorH ?? 3.6, corners = footprint(b);
      const hier = new PolygonHierarchy(Cartesian3.fromDegreesArray(corners.flat()));
      const ghostFrom = b.ghostFrom ?? b.floors;
      for (let i = 0; i < b.floors; i++) {
        const ghost = i >= ghostFrom, col = Color.fromCssColorString(b.floorColor(i));
        // Rise floor by floor: each slab appears a beat after the one below.
        const shown = rise ? () => performance.now() - this.born > i * 70 : () => true;
        const e = this.ds.entities.add({
          polygon: { hierarchy: hier, height: i * fh + 0.25, extrudedHeight: (i + 1) * fh - 0.25, heightReference: HeightReference.RELATIVE_TO_GROUND, extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
            material: new ColorMaterialProperty(new CallbackProperty(() => (shown() ? col.withAlpha(ghost ? 0.12 : 0.82) : Color.TRANSPARENT), false)),
            outline: true, outlineColor: col.brighten(0.35, new Color()).withAlpha(ghost ? 0.45 : 0.9) },
        });
        if (b.onTap) makeTappable(e, b.onTap);
      }
      // An alert: a pulsing halo on the ground around the building.
      if (b.pulse) {
        const pc = Color.fromCssColorString(b.pulse), r = Math.max(b.w, b.d) * 0.95;
        const [lon, lat] = this.centre(b);
        this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat), ellipse: { semiMajorAxis: r, semiMinorAxis: r,
          material: new ColorMaterialProperty(new CallbackProperty(() => pc.withAlpha(0.15 + 0.25 * (0.5 + 0.5 * Math.sin((performance.now() - this.born) / 380))), false)) } });
      }
      if (b.crane) this.crane(b, Math.max(b.floors, ghostFrom) * fh);
      if (b.dot) {
        const [lon, lat] = this.centre(b);
        const e = this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat), point: { pixelSize: 10, color: Color.fromCssColorString(b.dot), outlineColor: Color.WHITE, outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, translucencyByDistance: new NearFarScalar(1500, 0, 4000, 1) } });
        if (b.onTap) makeTappable(e, b.onTap);
      }
      if (b.label) {
        const [lon, lat] = this.centre(b), top = b.floors * fh;
        const e = this.ds.entities.add({ position: Cartesian3.fromDegrees(lon, lat, top + 12), label: { text: b.label, font: "700 12px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, heightReference: HeightReference.RELATIVE_TO_GROUND, pixelOffset: new Cartesian2(0, -4),
          scaleByDistance: new NearFarScalar(500, 1.1, 60_000, 0.6), translucencyByDistance: new NearFarScalar(60_000, 1, 260_000, 0) } });
        if (b.onTap) makeTappable(e, b.onTap);
      }
    }
    this.app.canvas.put({ id: this.id, label: `${this.emoji} ${this.label}`, color: this.color, scope: "world", pinned: true, show: (v) => { this.ds.show = v; wake(800); }, remove: () => this.ds.entities.removeAll() }, true);
    const done = this.born + buildings.reduce((a, b) => Math.max(a, b.floors), 0) * 70 + 600;
    const tick = () => { wake(200); if (this.pulsing || performance.now() < done) setTimeout(tick, 180); };
    tick();
  }

  private centre(b: MassBuilding): [number, number] {
    const mLon = M_LAT * Math.cos((b.lat * Math.PI) / 180);
    return [b.lon + (b.dx ?? 0) / mLon, b.lat + (b.dy ?? 0) / M_LAT];
  }

  /** A tower crane beside the building: a yellow mast and a jib swinging slowly. */
  private crane(b: MassBuilding, height: number) {
    const [lon, lat] = this.centre(b), mLon = M_LAT * Math.cos((lat * Math.PI) / 180);
    const mx = lon + (b.w / 2 + 8) / mLon, my = lat;
    const mastH = height + 18, jib = Math.max(35, b.w * 0.9), yellow = Color.fromCssColorString("#ffcc00");
    this.ds.entities.add({ position: Cartesian3.fromDegrees(mx, my, mastH / 2), box: { dimensions: new Cartesian3(2.4, 2.4, mastH), material: yellow, heightReference: HeightReference.RELATIVE_TO_GROUND } as never });
    const swing = () => ((performance.now() - this.born) / 9000) % (Math.PI * 2);
    this.ds.entities.add({ polyline: { positions: new CallbackProperty(() => {
      const a = swing(), ex = Math.cos(a) * jib, ny = Math.sin(a) * jib, bx = -Math.cos(a) * jib * 0.3, by = -Math.sin(a) * jib * 0.3;
      return Cartesian3.fromDegreesArrayHeights([mx + bx / mLon, my + by / M_LAT, mastH + this.groundAt, mx + ex / mLon, my + ny / M_LAT, mastH + this.groundAt]);
    }, false), width: 4, material: yellow } });
    this.pulsing = true;
  }
  /** Ground height for things drawn in absolute heights (the jib); set by callers that know it. */
  groundAt = 0;

  clear() { this.pulsing = false; this.ds.entities.removeAll(); this.app.canvas.drop(this.id); }
  get entities(): Entity[] { return this.ds.entities.values; }
}
