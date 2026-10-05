// Historical world borders by year, from "historical-basemaps" by André Ourednik
// and contributors (GPL-3.0), loaded live from GitHub. 54 snapshots from
// 123,000 BC to 2010. Borders before the modern era are approximate and many
// peoples lived outside any state; the source says so too.
import { Cartesian3, Color, CustomDataSource, DistanceDisplayCondition, LabelStyle, NearFarScalar, type ImageryLayer, type Viewer } from "cesium";
import { canvasLayer, tracePath } from "../globe/networkLayer";

const BASE = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master";
export const HISTORY_CREDIT = "Historical borders: historical-basemaps by A. Ourednik et al. (GPL-3.0)";

/** Years available (fallback if the index can't be read). */
export const YEARS = [-123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010];

export const yearLabel = (y: number) => (y < 0 ? `${(-y).toLocaleString()} BC` : `AD ${y}`);
const fileFor = (y: number) => (y < 0 ? `world_bc${-y}.geojson` : `world_${y}.geojson`);

export interface Polity {
  name: string;
  rings: [number, number][][];
  bbox: [number, number, number, number];
  area: number;
  label: [number, number];
}

const cache = new Map<number, Promise<Polity[]>>();

export function bordersFor(year: number): Promise<Polity[]> {
  let p = cache.get(year);
  if (!p) {
    p = fetch(`${BASE}/geojson/${fileFor(year)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`no borders for ${yearLabel(year)}`);
        return r.json();
      })
      .then((fc: { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } | null }[] }) =>
        fc.features.flatMap((f) => {
          const name = String(f.properties.NAME ?? f.properties.ABBREVN ?? "");
          if (!f.geometry || !name) return [];
          const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : []) as [number, number][][][];
          const rings = polys.map((poly) => poly[0]);
          let w = 180, s = 90, e = -180, n = -90, best = rings[0], bestA = -1, area = 0;
          for (const ring of rings) {
            let a = 0;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
            a = Math.abs(a / 2);
            area += a;
            if (a > bestA) { bestA = a; best = ring; }
            for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
          }
          // Label at the centre of the largest part.
          let cx = 0, cy = 0;
          for (const [x, y] of best) { cx += x; cy += y; }
          return [{ name, rings, bbox: [w, s, e, n] as [number, number, number, number], area, label: [cx / best.length, cy / best.length] as [number, number] }];
        }));
    p.catch(() => cache.delete(year));
    cache.set(year, p);
  }
  return p;
}

/** A stable, distinct colour per polity name. */
export function polityColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 62%, 58%)`;
}

export class HistoryLayer {
  private tiles: ImageryLayer | null = null;
  private labels = new CustomDataSource("history-labels");
  year: number | null = null;

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.labels);
  }

  async show(year: number | null): Promise<Polity[]> {
    this.year = year;
    if (this.tiles) this.viewer.imageryLayers.remove(this.tiles, true);
    this.tiles = null;
    this.labels.entities.removeAll();
    if (year === null) return [];
    const polities = await bordersFor(year);
    if (this.year !== year) return polities;
    this.tiles = canvasLayer((ctx, t) => {
      for (const p of polities) {
        if (!t.touches(p.bbox, 4)) continue;
        ctx.beginPath();
        for (const ring of p.rings) {
          tracePath(ctx, t, new Float32Array(ring.flat()));
          ctx.closePath();
        }
        ctx.fillStyle = polityColor(p.name).replace("hsl", "hsla").replace(")", ", 0.5)");
        ctx.fill("evenodd");
        // A dark edge under a light line reads over both desert and forest.
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(20,16,10,0.55)";
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "rgba(255,248,230,0.95)";
        ctx.stroke();
      }
    }, { maximumLevel: 8, credit: HISTORY_CREDIT });
    this.viewer.imageryLayers.add(this.tiles);
    for (const p of polities) {
      // Big empires are named from far away; small states only when zoomed in.
      const far = Math.min(3e7, 2e6 + Math.sqrt(p.area) * 1.2e6);
      this.labels.entities.add({
        position: Cartesian3.fromDegrees(p.label[0], p.label[1]),
        label: {
          text: p.name, font: "600 13px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
          scaleByDistance: new NearFarScalar(1e6, 1.1, 2e7, 0.7),
          distanceDisplayCondition: new DistanceDisplayCondition(0, far),
          disableDepthTestDistance: 5e6,
        },
      });
    }
    return polities;
  }

  setVisible(v: boolean) {
    if (this.tiles) this.tiles.show = v;
    this.labels.show = v;
  }
}

/** The snapshot year closest to `y` (borders change between snapshots; this is the nearest map). */
export function nearestYear(y: number, years = YEARS): number {
  return years.reduce((best, v) => (Math.abs(v - y) < Math.abs(best - y) ? v : best), years[0]);
}
