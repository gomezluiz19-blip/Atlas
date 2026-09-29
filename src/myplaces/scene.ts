// The 3D view of a saved place: the buildings around it from OpenStreetMap,
// extruded to their mapped height (or floors × 3 m), with the place's own
// building highlighted, and its devices (panels, tanks, cameras…) drawn in,
// cameras with their field of view on the ground.
import {
  Cartesian2, Cartesian3, Color, CustomDataSource, HeightReference, LabelStyle, Math as CesiumMath, PolygonHierarchy, VerticalOrigin,
  BoundingSphere, HeadingPitchRange, HorizontalOrigin, Matrix4, type Viewer,
} from "cesium";
import { elevation } from "../data/elevation";
import { overpass } from "../data/overpass";
import { DEVICES, type Device, type MyPlace } from "./store";
import { ringAreaM2 } from "./estimates";

export interface Building {
  ring: [number, number][];
  height: number;
  /** Where the height came from, for honesty in the UI. */
  heightSource: "mapped" | "floors" | "guess";
  /** Ground elevation under it (m), sampled once so no per-building terrain clamping is needed. */
  ground?: number;
  name?: string;
  tags: Record<string, string>;
}

const TYPICAL: Record<string, number> = { house: 6, detached: 6, residential: 8, apartments: 15, hotel: 12, commercial: 9, retail: 5, industrial: 8, warehouse: 8, church: 12, school: 8, garage: 3, shed: 3, roof: 4 };

export function buildingHeight(t: Record<string, string>): { height: number; source: Building["heightSource"] } {
  const h = parseFloat((t.height ?? "").replace(",", "."));
  if (Number.isFinite(h) && h > 0) return { height: h, source: "mapped" };
  const lv = parseFloat(t["building:levels"] ?? "");
  if (Number.isFinite(lv) && lv > 0) return { height: lv * 3 + (t.roof_shape && t.roof_shape !== "flat" ? 1.5 : 0.5), source: "floors" };
  return { height: TYPICAL[t.building] ?? 7, source: "guess" };
}

export async function fetchBuildings(lon: number, lat: number, radiusM = 250): Promise<Building[]> {
  const els = await overpass(`[out:json][timeout:40];
(
  way(around:${radiusM},${lat.toFixed(6)},${lon.toFixed(6)})["building"];
);
out tags geom 2500;`);
  return els.flatMap((el) => {
    const g = el.geometry;
    if (!g || g.length < 4) return [];
    const t = el.tags ?? {};
    const { height, source } = buildingHeight(t);
    return [{ ring: g.map((p) => [p.lon, p.lat] as [number, number]), height, heightSource: source, name: t.name, tags: t }];
  });
}

/** Point-in-polygon (ray casting). */
export function contains(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The building the place is in, or the closest one within ~40 m. */
export function ownBuilding(bs: Building[], lon: number, lat: number): Building | null {
  const inside = bs.find((b) => contains(b.ring, lon, lat));
  if (inside) return inside;
  let best: Building | null = null, bestD = 40;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  for (const b of bs) {
    for (const [x, y] of b.ring) {
      const d = Math.hypot((x - lon) * kx, (y - lat) * 110_540);
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  return best;
}

export const footprintM2 = (b: Building) => ringAreaM2(b.ring);

/** A camera's field of view as a ground polygon. */
export function cameraSector(d: Device, steps = 16): [number, number][] {
  const heading = d.heading ?? 0, fov = d.fov ?? 90, range = d.range ?? 25;
  const kx = 111_320 * Math.cos((d.lat * Math.PI) / 180), ky = 110_540;
  const pts: [number, number][] = [[d.lon, d.lat]];
  for (let i = 0; i <= steps; i++) {
    const a = ((heading - fov / 2 + (fov * i) / steps) * Math.PI) / 180;
    pts.push([d.lon + (Math.sin(a) * range) / kx, d.lat + (Math.cos(a) * range) / ky]);
  }
  return pts;
}

const iconCache = new Map<string, string>();
function deviceIcon(type: Device["type"]): string {
  let url = iconCache.get(type);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.beginPath();
    ctx.arc(24, 24, 20, 0, Math.PI * 2);
    ctx.fillStyle = DEVICES[type].color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#1c1c1e";
    ctx.font = "700 20px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glyph: Record<Device["type"], string> = { camera: "◉", solar: "☀", battery: "⚡", generator: "G", tank: "💧", well: "W", gate: "⊓", alarm: "!", light: "✦", sensor: "•" };
    ctx.fillText(glyph[type], 24, 25);
    url = c.toDataURL();
    iconCache.set(type, url);
  }
  return url;
}

export class PlaceScene {
  readonly ds = new CustomDataSource("my-place");
  buildings: Building[] = [];
  own: Building | null = null;
  private orbitOff: (() => void) | null = null;

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
    void viewer.dataSources.add(this.floorDs);
    void viewer.dataSources.add(this.liveDs);
  }

  /** Loads and draws the buildings around a place. */
  async showBuildings(p: MyPlace): Promise<void> {
    const bs = await fetchBuildings(p.lon, p.lat);
    // One batch of elevation samples (the same tiles the terrain uses) for every footprint's centre.
    const centres = bs.map((b) => [b.ring.reduce((s, q) => s + q[0], 0) / b.ring.length, b.ring.reduce((s, q) => s + q[1], 0) / b.ring.length] as [number, number]);
    const heights = await elevation.sample(centres, 15).catch(() => centres.map(() => 0));
    bs.forEach((b, i) => (b.ground = Math.max(0, heights[i] ?? 0)));
    this.buildings = bs;
    this.own = ownBuilding(this.buildings, p.lon, p.lat);
    this.draw(p);
  }

  draw(p: MyPlace) {
    this.ds.entities.removeAll();
    const accent = Color.fromCssColorString("#ff9f0a");
    for (const b of this.buildings) {
      const mine = b === this.own;
      const e = this.ds.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(b.ring.map(([x, y]) => Cartesian3.fromDegrees(x, y))),
          // Sunk a metre so sloping ground doesn't leave a gap under the walls.
          height: (b.ground ?? 0) - 1,
          extrudedHeight: (b.ground ?? 0) + b.height,
          material: mine ? accent.withAlpha(0.92) : Color.fromCssColorString("#f2f2f7").withAlpha(b.heightSource === "guess" ? 0.55 : 0.75),
        },
      });
      if (mine) {
        this.ownEntity = e;
        e.show = !this.floors?.length;
      }
    }
    for (const d of p.devices) {
      if (d.type === "camera") {
        this.ds.entities.add({
          polygon: {
            hierarchy: new PolygonHierarchy(cameraSector(d).map(([x, y]) => Cartesian3.fromDegrees(x, y))),
            heightReference: HeightReference.CLAMP_TO_GROUND,
            material: Color.fromCssColorString(DEVICES.camera.color).withAlpha(0.28),
          },
        });
      }
      this.ds.entities.add({
        position: Cartesian3.fromDegrees(d.lon, d.lat),
        billboard: { image: deviceIcon(d.type), width: 28, height: 28, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: d.label || DEVICES[d.type].label, font: "600 12px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 3, verticalOrigin: VerticalOrigin.TOP,
          pixelOffset: new Cartesian2(0, 16), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 0.95,
        },
      });
    }
  }

  /** Floor-by-floor colours for the place's own building (Atlas Pro), or null for plain. */
  floors: { floor: number; color: string; label: string }[] | null = null;

  /** Floor slabs live in their own layer, so live updates don't redraw the whole neighbourhood. */
  readonly floorDs = new CustomDataSource("my-place-floors");
  private ownEntity: import("cesium").Entity | null = null;
  private floorKey = "";

  setFloors(_p: MyPlace, floors: { floor: number; color: string; label: string }[] | null) {
    const key = JSON.stringify(floors);
    if (key === this.floorKey) return;
    this.floorKey = key;
    this.floors = floors;
    this.floorDs.entities.removeAll();
    if (this.ownEntity) this.ownEntity.show = !floors?.length;
    if (floors?.length && this.own) this.drawFloors(this.own, floors);
  }

  /** Stacks the building as floor slabs, each in its own colour, labelled at the side. */
  private drawFloors(b: Building, floors: { floor: number; color: string; label: string }[]) {
    const n = Math.max(floors.length, ...floors.map((f) => f.floor));
    const storey = Math.max(2.8, b.height / n);
    const base = b.ground ?? 0;
    const hierarchy = new PolygonHierarchy(b.ring.map(([x, y]) => Cartesian3.fromDegrees(x, y)));
    // Label anchor: the footprint's easternmost corner.
    const east = b.ring.reduce((a, q) => (q[0] > a[0] ? q : a), b.ring[0]);
    for (let i = 1; i <= n; i++) {
      const f = floors.find((x) => x.floor === i);
      const bottom = base + (i - 1) * storey;
      this.floorDs.entities.add({
        polygon: {
          hierarchy,
          height: i === 1 ? base - 1 : bottom + 0.25,
          extrudedHeight: bottom + storey - 0.25,
          material: Color.fromCssColorString(f?.color ?? "#8e8e93").withAlpha(f ? 0.95 : 0.5),
        },
      });
      if (f)
        this.floorDs.entities.add({
          position: Cartesian3.fromDegrees(east[0], east[1], bottom + storey / 2),
          label: {
            text: f.label, font: "700 13px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE,
            fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
            horizontalOrigin: HorizontalOrigin.LEFT, pixelOffset: new Cartesian2(12, 0), disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
    }
  }

  /** Live camera detections as dots on the ground (Atlas Pro). */
  readonly liveDs = new CustomDataSource("my-place-live");

  setLive(points: { lon: number; lat: number; color: string }[]) {
    this.liveDs.entities.removeAll();
    for (const p of points)
      this.liveDs.entities.add({
        position: Cartesian3.fromDegrees(p.lon, p.lat),
        point: { pixelSize: 11, color: Color.fromCssColorString(p.color), outlineColor: Color.WHITE, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
  }

  /** A low, angled view of the place, like looking at a model. */
  frame(p: MyPlace, range = 220) {
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(p.lon, p.lat, 10), 30), {
      offset: new HeadingPitchRange(CesiumMath.toRadians(-30), CesiumMath.toRadians(-32), range),
      duration: 2,
    });
  }

  /** Slowly circles the place until stopped (or the user takes the controls). */
  orbit(p: MyPlace | null, on: boolean) {
    this.orbitOff?.();
    this.orbitOff = null;
    if (!on || !p) return;
    const centre = Cartesian3.fromDegrees(p.lon, p.lat, 10);
    let heading = CesiumMath.toRadians(-30);
    const scene = this.viewer.scene;
    const tick = scene.preRender.addEventListener(() => {
      heading += 0.0025;
      this.viewer.camera.lookAt(centre, new HeadingPitchRange(heading, CesiumMath.toRadians(-30), 200));
    });
    const stop = () => this.orbit(p, false);
    const canvas = scene.canvas;
    canvas.addEventListener("pointerdown", stop, { once: true });
    canvas.addEventListener("wheel", stop, { once: true });
    this.orbitOff = () => {
      tick();
      canvas.removeEventListener("pointerdown", stop);
      canvas.removeEventListener("wheel", stop);
      this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    };
  }

  clear() {
    this.orbit(null, false);
    this.floors = null;
    this.floorKey = "";
    this.ownEntity = null;
    this.floorDs.entities.removeAll();
    this.ds.entities.removeAll();
    this.buildings = [];
    this.own = null;
  }
}
