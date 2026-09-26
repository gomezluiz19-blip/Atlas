// One-touch map overlays shared by every theme: live aurora forecast,
// earthquakes, tectonic plates, night lights, rain radar, species records.
import { Cartesian2, Cartesian3, Color, CustomDataSource, ImageryLayer, LabelStyle, UrlTemplateImageryProvider, VerticalOrigin, type Viewer } from "cesium";
import { auroraForecast } from "../data/space";
import { recentQuakes } from "../data/quakes";
import { GBIF_DENSITY_TILES } from "../data/inaturalist";
import { latestRadarTiles } from "../data/radar";
import { plates } from "../data/worldData";
import { makePickable } from "./pickables";
import { vectorLayer } from "./vectorLayer";

export type OverlayId = "labels" | "aurora" | "quakes" | "plates" | "lights" | "radar" | "species";

export const OVERLAYS: { id: OverlayId; label: string; about: string }[] = [
  { id: "labels", label: "Labels", about: "Names of places, rivers, landmarks and more" },
  { id: "aurora", label: "Aurora", about: "Live NOAA forecast of where the northern and southern lights are overhead" },
  { id: "quakes", label: "Earthquakes", about: "Magnitude 2.5+ in the past week (USGS)" },
  { id: "plates", label: "Plates", about: "Boundaries of Earth's tectonic plates" },
  { id: "lights", label: "Night lights", about: "Cities seen from space at night (NASA)" },
  { id: "radar", label: "Rain radar", about: "Live precipitation (RainViewer)" },
  { id: "species", label: "Wildlife records", about: "Where plants and animals have been recorded (GBIF)" },
];

const NIGHT_LIGHTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";

export class Overlays {
  private state = new Map<OverlayId, boolean>([["labels", true]]);
  private layers = new Map<OverlayId, ImageryLayer>();
  private quakes: CustomDataSource | null = null;
  private listeners = new Set<() => void>();
  onLabels?: (on: boolean) => void;

  constructor(private viewer: Viewer, private toast: (m: string) => void) {}

  isOn(id: OverlayId) {
    return this.state.get(id) ?? false;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async set(id: OverlayId, on: boolean) {
    this.state.set(id, on);
    this.listeners.forEach((fn) => fn());
    try {
      if (id === "labels") this.onLabels?.(on);
      else if (id === "quakes") await this.setQuakes(on);
      else {
        let layer = this.layers.get(id);
        if (on && !layer) {
          layer = await this.create(id);
          if (!layer) return;
          this.layers.set(id, layer);
          this.viewer.imageryLayers.add(layer);
        }
        if (layer) layer.show = this.isOn(id);
      }
    } catch (err) {
      this.state.set(id, false);
      this.listeners.forEach((fn) => fn());
      this.toast(`${OVERLAYS.find((o) => o.id === id)?.label} is unavailable right now: ${(err as Error).message}`);
    }
  }

  toggle(id: OverlayId) {
    return this.set(id, !this.isOn(id));
  }

  private async create(id: OverlayId): Promise<ImageryLayer | undefined> {
    const url = (u: string, max: number, credit: string, alpha = 1) =>
      new ImageryLayer(new UrlTemplateImageryProvider({ url: u, maximumLevel: max, credit }), { alpha });
    switch (id) {
      case "lights": return url(NIGHT_LIGHTS, 8, "Earth at night: NASA Black Marble", 0.9);
      case "species": return url(GBIF_DENSITY_TILES, 14, "Species records: GBIF.org", 0.85);
      case "radar": return url((await latestRadarTiles()).url, 7, "Radar: RainViewer", 0.7);
      case "plates": {
        const p = await plates();
        const shapes = p.boundaries.map(([, , lines]) => {
          let w = 180, s = 90, e = -180, n = -90;
          for (const l of lines) for (let i = 0; i < l.length; i += 2) { w = Math.min(w, l[i]); e = Math.max(e, l[i]); s = Math.min(s, l[i + 1]); n = Math.max(n, l[i + 1]); }
          return { polygons: lines.map((l) => [pairs(l)]), bbox: [w, s, e, n] as [number, number, number, number] };
        });
        return vectorLayer(shapes, { stroke: "rgba(255, 99, 71, 0.95)", width: 2.2, scaleWithZoom: true });
      }
      case "aurora": return auroraLayer(await auroraForecast());
    }
    return undefined;
  }

  private async setQuakes(on: boolean) {
    if (on && !this.quakes) {
      const ds = new CustomDataSource("quakes");
      const now = Date.now();
      for (const q of await recentQuakes()) {
        const days = (now - q.time) / 86_400_000;
        const color = days < 1 ? "#ff3b30" : days < 3 ? "#ff9500" : "#ffcc00";
        const e = ds.entities.add({
          position: Cartesian3.fromDegrees(q.lon, q.lat),
          point: {
            pixelSize: 4 + Math.max(0, q.mag - 2.5) * 4.5,
            color: Color.fromCssColorString(color).withAlpha(0.8),
            outlineColor: Color.WHITE.withAlpha(0.8),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: q.mag >= 5 ? {
            text: `M${q.mag.toFixed(1)}`, font: "600 12px -apple-system, system-ui, sans-serif", fillColor: Color.WHITE,
            outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } : undefined,
        });
        makePickable(e, { lon: q.lon, lat: q.lat, title: `Magnitude ${q.mag.toFixed(1)} earthquake`, context: q.place, feature: { type: "quake", quake: q } });
      }
      this.quakes = ds;
      await this.viewer.dataSources.add(ds);
    }
    if (this.quakes) this.quakes.show = this.isOn("quakes");
  }
}

function pairs(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Map tiles painted from the OVATION grid: a green veil that turns whiter where aurora is likeliest. */
class AuroraImageryProvider extends UrlTemplateImageryProvider {
  constructor(private f: { grid: Uint8Array }) {
    super({ url: "about:blank?{z}/{x}/{y}", maximumLevel: 6, enablePickFeatures: false, credit: "Aurora forecast: NOAA SWPC OVATION" });
  }
  override requestImage(x: number, y: number, level: number) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    const n = 2 ** level;
    const at = (lon: number, lat: number) => {
      const gx = ((Math.floor(lon) % 360) + 360) % 360, gy = Math.floor(lat) + 90;
      const fx = lon - Math.floor(lon), fy = lat - Math.floor(lat);
      const v = (i: number, j: number) => this.f.grid[(((gx + i) % 360) * 181) + Math.min(180, Math.max(0, gy + j))];
      return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy;
    };
    for (let j = 0; j < size; j++) {
      const t = (y + (j + 0.5) / size) / n;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * t))) * 180) / Math.PI;
      for (let i = 0; i < size; i++) {
        const lon = ((x + (i + 0.5) / size) / n) * 360 - 180;
        const p = at(lon, lat) / 100;
        if (p < 0.03) continue;
        const o = (j * size + i) * 4;
        img.data[o] = 60 + p * 150;
        img.data[o + 1] = 255;
        img.data[o + 2] = 150 + p * 60;
        img.data[o + 3] = Math.min(170, 30 + p * 200);
      }
    }
    ctx.putImageData(img, 0, 0);
    return Promise.resolve(canvas);
  }
}

function auroraLayer(f: { grid: Uint8Array }): ImageryLayer {
  return new ImageryLayer(new AuroraImageryProvider(f), { alpha: 0.8 });
}
