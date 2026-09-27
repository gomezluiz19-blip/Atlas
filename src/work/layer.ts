// Draws Work-mode features (stops, routes, zones, fields, proposed lines) on the
// globe: lines and areas as map tiles that drape over the terrain, points as
// markers with labels. Each layer is an item on the shared canvas.
import { Cartesian2, Cartesian3, Color, CustomDataSource, HeightReference, LabelStyle, VerticalOrigin, type ImageryLayer } from "cesium";
import type { App } from "../app";
import { canvasLayer, tracePath } from "../globe/networkLayer";
import type { LonLat } from "./geo";

export interface WorkFeature {
  id: string;
  kind: "point" | "line" | "area";
  pts: LonLat[];
  color: string;
  label?: string;
  dashed?: boolean;
  /** Area fill opacity (0–1). */
  fill?: number;
}

export class WorkLayer {
  private ds = new CustomDataSource("work");
  private tiles: ImageryLayer | null = null;
  private visible = true;

  constructor(private app: App, private id: string, private label: string, private color: string, private onCanvas = true) {
    void app.globe.viewer.dataSources.add(this.ds);
  }

  set(features: WorkFeature[], label?: string) {
    if (label) this.label = label;
    this.ds.entities.removeAll();
    for (const f of features.filter((x) => x.kind === "point"))
      for (const [lon, lat] of f.pts)
        this.ds.entities.add({
          position: Cartesian3.fromDegrees(lon, lat),
          point: { pixelSize: 14, color: Color.fromCssColorString(f.color), outlineColor: Color.WHITE, outlineWidth: 2.5, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: f.label ? {
            text: f.label, font: "700 13px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -12),
            heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } : undefined,
        });
    // Lines and areas: rebuild the tile layer (it's small).
    const viewer = this.app.globe.viewer;
    if (this.tiles) viewer.imageryLayers.remove(this.tiles, true);
    this.tiles = null;
    const shapes = features.filter((f) => f.kind !== "point" && f.pts.length > 1).map((f) => {
      let w = 180, s = 90, e = -180, n = -90;
      for (const [x, y] of f.pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      const xy = new Float32Array((f.kind === "area" ? [...f.pts, f.pts[0]] : f.pts).flat());
      return { f, xy, bbox: [w, s, e, n] as [number, number, number, number] };
    });
    if (shapes.length) {
      this.tiles = canvasLayer((ctx, t) => {
        for (const { f, xy, bbox } of shapes) {
          if (!t.touches(bbox, 12)) continue;
          ctx.beginPath();
          tracePath(ctx, t, xy);
          if (f.kind === "area") {
            ctx.closePath();
            ctx.fillStyle = hexAlpha(f.color, f.fill ?? 0.25);
            ctx.fill();
          }
          ctx.setLineDash(f.dashed ? [12, 8] : []);
          ctx.lineWidth = 7;
          ctx.strokeStyle = "rgba(0,0,0,0.45)";
          ctx.stroke();
          ctx.lineWidth = 4.5;
          ctx.strokeStyle = f.color;
          ctx.stroke();
        }
      }, { maximumLevel: 18 });
      viewer.imageryLayers.add(this.tiles);
      this.tiles.show = this.visible;
    }
    if (this.onCanvas) {
      if (features.length)
        this.app.canvas.put({
          id: this.id, label: this.label, color: this.color, scope: "world", pinned: true,
          show: (v) => this.show(v),
          remove: () => this.clear(false),
        }, true);
      else this.app.canvas.drop(this.id);
    }
  }

  show(v: boolean) {
    this.visible = v;
    this.ds.show = v;
    if (this.tiles) this.tiles.show = v;
  }

  clear(fromCanvas = true) {
    this.ds.entities.removeAll();
    if (this.tiles) this.app.globe.viewer.imageryLayers.remove(this.tiles, true);
    this.tiles = null;
    if (fromCanvas && this.onCanvas) this.app.canvas.drop(this.id);
  }
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
