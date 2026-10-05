// Draws space on the globe: satellites as moving dots (thousands, updated a
// slice per frame), the ISS with its orbit ahead and behind, launch pads with
// countdowns, and rockets climbing after liftoff.
import {
  ArcType, CallbackProperty, Cartesian2, Cartesian3, Color, ConstantPositionProperty, CustomDataSource, LabelStyle, Matrix4, NearFarScalar,
  PointPrimitiveCollection, PolylineDashMaterialProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, VerticalOrigin, type PointPrimitive, type Viewer,
} from "cesium";
import { everyFrame } from "../globe/motion";
import { GROUPS, groundTrack, stateAt, type Sat } from "./orbits";
import { ascent, countdown, inFlight, type Launch } from "./launches";

const emojiCache = new Map<string, string>();
export function emojiIcon(e: string, bg = "rgba(12,16,24,0.75)"): string {
  const k = e + bg;
  let url = emojiCache.get(k);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 72;
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.beginPath();
    g.arc(36, 36, 32, 0, Math.PI * 2);
    g.fill();
    g.font = "40px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(e, 36, 39);
    url = c.toDataURL();
    emojiCache.set(k, url);
  }
  return url;
}

export class SpaceLayer {
  private points = new PointPrimitiveCollection();
  private sats: { sat: Sat; pt: PointPrimitive }[] = [];
  private ds = new CustomDataSource("space");
  private cursor = 0;
  private handler: ScreenSpaceEventHandler;
  private iss: Sat | null = null;
  private following = false;
  private trackAt = 0;
  visible = true;
  onPick?: (s: Sat) => void;
  onLaunchPick?: (l: Launch) => void;

  constructor(private viewer: Viewer) {
    viewer.scene.primitives.add(this.points);
    void viewer.dataSources.add(this.ds);
    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((e: { position: Cartesian2 }) => {
      if (!this.visible) return;
      const hit = viewer.scene.pick(e.position) as { id?: unknown } | undefined;
      const id = hit?.id as { sat?: Sat; launch?: Launch; entity?: unknown } | { properties?: unknown } | undefined;
      if (id && typeof id === "object" && "sat" in id && id.sat) this.onPick?.(id.sat);
      else if (id && typeof id === "object" && "launch" in id && id.launch) this.onLaunchPick?.(id.launch);
      else {
        const ent = hit?.id as { _space?: { sat?: Sat; launch?: Launch } } | undefined;
        if (ent?._space?.sat) this.onPick?.(ent._space.sat);
        if (ent?._space?.launch) this.onLaunchPick?.(ent._space.launch);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    everyFrame(viewer.scene, () => this.tick(), () => this.visible && this.sats.length > 0 && !document.hidden);
  }

  setGroup(group: string, sats: Sat[] | null) {
    const keep = this.sats.filter((s) => s.sat.group !== group);
    for (const s of this.sats) if (s.sat.group === group) this.points.remove(s.pt);
    this.sats = keep;
    if (!sats) return;
    const g = GROUPS.find((x) => x.id === group)!;
    const color = Color.fromCssColorString(g.color);
    const size = group === "starlink" ? 3 : group === "stations" ? 9 : 5;
    const now = Date.now();
    for (const sat of sats) {
      if (group !== "stations" && this.sats.some((x) => x.sat.id === sat.id)) continue;
      const st = stateAt(sat, now);
      const pt = this.points.add({
        position: st ? Cartesian3.fromDegrees(st.lon, st.lat, st.alt * 1000) : Cartesian3.ZERO,
        color, pixelSize: size, outlineColor: Color.BLACK.withAlpha(0.5), outlineWidth: 1,
        scaleByDistance: new NearFarScalar(1e6, 1.4, 5e7, 0.7), id: { sat },
        show: !!st,
      });
      this.sats.push({ sat, pt });
    }
    if (group === "stations") this.setIss(sats.find((s) => s.id === 25544) ?? sats.find((s) => /ISS/.test(s.name)) ?? null, sats);
  }

  count(group?: string) {
    return group ? this.sats.filter((s) => s.sat.group === group).length : this.sats.length;
  }

  /** Moves a slice of the satellites each frame, so thousands stay smooth. */
  private tick() {
    if (!this.visible || !this.sats.length) return;
    const now = Date.now();
    const n = Math.min(this.sats.length, 700);
    for (let k = 0; k < n; k++) {
      this.cursor = (this.cursor + 1) % this.sats.length;
      const s = this.sats[this.cursor];
      const st = stateAt(s.sat, now);
      if (st) s.pt.position = Cartesian3.fromDegrees(st.lon, st.lat, st.alt * 1000);
      s.pt.show = !!st;
    }
    if (this.iss && now - this.trackAt > 60_000) this.drawTrack();
    if (this.following && this.iss) {
      const st = stateAt(this.iss, now);
      if (st) this.viewer.camera.lookAt(Cartesian3.fromDegrees(st.lon, st.lat, st.alt * 1000), new Cartesian3(-900_000, -900_000, 700_000));
    }
  }

  private issEntities: unknown[] = [];
  private setIss(iss: Sat | null, stations: Sat[]) {
    for (const e of this.issEntities) this.ds.entities.remove(e as never);
    this.issEntities = [];
    this.iss = iss;
    for (const s of stations) {
      const big = s === iss || /TIANHE|CSS/.test(s.name);
      if (!big) continue;
      const pos = new CallbackProperty(() => { const st = stateAt(s, Date.now()); return st ? Cartesian3.fromDegrees(st.lon, st.lat, st.alt * 1000) : undefined; }, false);
      const e = this.ds.entities.add({
        position: pos as never,
        billboard: { image: emojiIcon("🛰️", s === iss ? "rgba(255,214,10,0.9)" : "rgba(196, 81, 58,0.85)"), width: 34, height: 34, disableDepthTestDistance: 0 },
        label: {
          text: s === iss ? "ISS" : "Tiangong", font: "700 14px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -22),
        },
      });
      (e as unknown as { _space: { sat: Sat } })._space = { sat: s };
      this.issEntities.push(e);
    }
    this.trackAt = 0;
  }

  private trackEntities: unknown[] = [];
  private drawTrack() {
    this.trackAt = Date.now();
    for (const e of this.trackEntities) this.ds.entities.remove(e as never);
    this.trackEntities = [];
    if (!this.iss) return;
    const toPos = (pts: [number, number, number][]) => pts.map(([lon, lat, alt]) => Cartesian3.fromDegrees(lon, lat, alt * 1000));
    const ahead = groundTrack(this.iss, Date.now(), 0, 92, 1), behind = groundTrack(this.iss, Date.now(), -45, 0, 1);
    this.trackEntities.push(
      this.ds.entities.add({ polyline: { positions: toPos(ahead), width: 2.5, material: Color.fromCssColorString("#e1b843").withAlpha(0.85), arcType: ArcType.NONE } }),
      this.ds.entities.add({ polyline: { positions: toPos(behind), width: 2, material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString("#e1b843").withAlpha(0.5) }), arcType: ArcType.NONE } }),
    );
  }

  follow(on: boolean) {
    this.following = on && !!this.iss;
    if (!this.following) this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  }
  get isFollowing() { return this.following; }
  issState() { return this.iss ? stateAt(this.iss, Date.now()) : null; }
  get issSat() { return this.iss; }

  private launchEntities: unknown[] = [];
  setLaunches(list: Launch[]) {
    for (const e of this.launchEntities) this.ds.entities.remove(e as never);
    this.launchEntities = [];
    const now = Date.now();
    for (const l of list.filter((x) => x.net > now - 3_600_000).slice(0, 10)) {
      const pad = this.ds.entities.add({
        position: new ConstantPositionProperty(Cartesian3.fromDegrees(l.lon, l.lat)),
        billboard: { image: emojiIcon("🚀"), width: 30, height: 30, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: new CallbackProperty(() => `${l.rocket}\n${inFlight(l) ? "In flight" : countdown(l.net)}`, false) as never,
          font: "600 12px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
          verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -20), scaleByDistance: new NearFarScalar(1e6, 1, 2e7, 0.6), disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (pad as unknown as { _space: { launch: Launch } })._space = { launch: l };
      this.launchEntities.push(pad);
      if (inFlight(l, now)) {
        // An illustrative climb: position and trail from the time since liftoff.
        const at = () => { const a = ascent(l, (Date.now() - l.net) / 1000); return Cartesian3.fromDegrees(a.lon, a.lat, a.alt); };
        const rocket = this.ds.entities.add({
          position: new CallbackProperty(at, false) as never,
          billboard: { image: emojiIcon("🚀", "rgba(255,59,48,0.9)"), width: 36, height: 36, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: `${l.rocket} (illustrative path)`, font: "700 12px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, pixelOffset: new Cartesian2(0, -26), disableDepthTestDistance: Number.POSITIVE_INFINITY },
        });
        const trail = this.ds.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const t = (Date.now() - l.net) / 1000;
              return Array.from({ length: 40 }, (_, i) => { const a = ascent(l, (t * i) / 39); return Cartesian3.fromDegrees(a.lon, a.lat, a.alt); });
            }, false) as never,
            width: 4, material: Color.fromCssColorString("#d19a2e").withAlpha(0.9), arcType: ArcType.NONE,
          },
        });
        (rocket as unknown as { _space: { launch: Launch } })._space = { launch: l };
        this.launchEntities.push(rocket, trail);
      }
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.points.show = v;
    this.ds.show = v;
    if (!v) this.follow(false);
  }
}
