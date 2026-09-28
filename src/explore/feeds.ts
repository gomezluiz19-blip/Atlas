// Keeps the map's labels in step with the camera: world-scale names from
// bundled Natural Earth data, rivers, and notable places from Wikidata when
// zoomed in. Also remembers the notable places in view for the Explore card.
import type { Viewer } from "cesium";
import { KIND_INFO } from "../analysis/placeKinds";
import { overpass } from "../data/overpass";
import { notablePlaces, type Notable } from "../data/wikidata";
import { riverLines, worldLabels, type RiverLine, type WorldLabel } from "../data/worldData";
import type { LabelLayer, MapLabel } from "../globe/labels";
import { currentView, type ViewInfo } from "./view";

export interface LabelData {
  source: "world" | "river" | "notable";
  notable?: Notable;
  world?: WorldLabel;
}

const inBox = (lon: number, lat: number, b: [number, number, number, number]) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

export class Feeds {
  view: ViewInfo;
  notable: Notable[] = [];
  private world: WorldLabel[] = [];
  get worldList(): WorldLabel[] {
    return this.world;
  }
  private rivers: RiverLine[] = [];
  private timer = 0;
  private job = 0;
  private listeners = new Set<() => void>();

  constructor(private viewer: Viewer, private labels: LabelLayer) {
    this.view = currentView(viewer);
    void Promise.all([worldLabels(), riverLines()]).then(([w, r]) => {
      this.world = w;
      this.rivers = r;
      this.refreshWorld();
    });
    viewer.camera.moveEnd.addEventListener(() => this.schedule());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private schedule() {
    clearTimeout(this.timer);
    this.view = currentView(this.viewer);
    this.refreshWorld();
    this.emit();
    this.timer = window.setTimeout(() => void this.refreshLocal(), 650);
  }

  private refreshWorld() {
    const v = this.view;
    const pad = (b: typeof v.bbox): typeof v.bbox => {
      const dx = (b[2] - b[0]) * 0.25, dy = (b[3] - b[1]) * 0.25;
      return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
    };
    const box = v.zoom < 3 ? ([-360, -90, 360, 90] as typeof v.bbox) : pad(v.bbox);
    const z = v.zoom;
    const world: MapLabel[] = this.world
      .filter((l) => l.minZoom <= z + 0.6 && (inBox(l.lon, l.lat, box) || inBox(l.lon + 360, l.lat, box) || inBox(l.lon - 360, l.lat, box)))
      .filter((l) => !(l.kind === "continent" && z > 4.5) && !(l.kind === "sea" && z > 11))
      .map((l) => ({
        id: `w:${l.kind}:${l.name}`,
        name: l.name,
        lon: l.lon,
        lat: l.lat,
        kind: l.kind,
        rank: l.rank + (l.kind === "capital" ? 20 : 0),
        sub: l.kind === "peak" ? l.detail : undefined,
        data: { source: "world", world: l } satisfies LabelData,
      }));
    this.labels.set("world", world);

    // Rivers from Natural Earth at mid zooms: one label per river, on the stretch nearest the view centre.
    const rivers: MapLabel[] = [];
    if (z >= 3.5 && z < 11) {
      const best = new Map<string, { lon: number; lat: number; d: number; rank: number }>();
      for (const r of this.rivers) {
        if (r.minZoom > z + 0.8) continue;
        for (let i = 0; i < r.pts.length; i += 2) {
          const lon = r.pts[i], lat = r.pts[i + 1];
          if (!inBox(lon, lat, v.bbox)) continue;
          const d = (lon - v.lon) ** 2 + (lat - v.lat) ** 2;
          const prev = best.get(r.name);
          if (!prev || d < prev.d) best.set(r.name, { lon, lat, d, rank: r.rank });
        }
      }
      for (const [name, p] of best) rivers.push({ id: `r:${name}`, name, lon: p.lon, lat: p.lat, kind: "water", rank: p.rank, data: { source: "river" } satisfies LabelData });
    }
    this.labels.set("rivers", rivers);
  }

  private async refreshLocal() {
    const v = this.view;
    const job = ++this.job;
    const span = Math.max(v.bbox[2] - v.bbox[0], v.bbox[3] - v.bbox[1]);
    if (v.zoom < 7.5 || span > 6) {
      this.notable = [];
      this.labels.set("notable", []);
      this.labels.set("osm-rivers", []);
      this.emit();
      return;
    }
    const [w, s, e, n] = v.bbox.map((x) => Math.round(x * 50) / 50) as typeof v.bbox;
    const tasks: Promise<void>[] = [];
    tasks.push(
      notablePlaces(w, s, e, n, 160)
        .then((list) => {
          if (job !== this.job) return;
          this.notable = list;
          this.labels.set("notable", list.map((p) => ({
            id: `q:${p.id}`,
            name: p.name,
            lon: p.lon,
            lat: p.lat,
            kind: p.kind === "other" ? "landmark" : p.kind,
            rank: 40 + p.sitelinks * 2 + (p.heritage ? 12 : 0) + (p.kind === "district" || p.kind === "city" ? -30 : 0),
            heritage: p.heritage,
            data: { source: "notable", notable: p } satisfies LabelData,
          })));
        })
        .catch(() => {}),
    );
    if (v.zoom >= 10 && span < 1.2) {
      tasks.push(
        overpass(`[out:json][timeout:25];way["waterway"~"^(river|canal)$"]["name"](${s},${w},${n},${e});out tags geom 400;`)
          .then((els) => {
            if (job !== this.job) return;
            const best = new Map<string, { lon: number; lat: number; d: number }>();
            for (const el of els) {
              const name = el.tags?.name;
              if (!name || !el.geometry) continue;
              for (const g of el.geometry) {
                if (!inBox(g.lon, g.lat, v.bbox)) continue;
                const d = (g.lon - v.lon) ** 2 + (g.lat - v.lat) ** 2;
                const prev = best.get(name);
                if (!prev || d < prev.d) best.set(name, { lon: g.lon, lat: g.lat, d });
              }
            }
            this.labels.set("osm-rivers", [...best].map(([name, p]) => ({ id: `o:${name}`, name, lon: p.lon, lat: p.lat, kind: "water", rank: 170, data: { source: "river" } satisfies LabelData })));
          })
          .catch(() => {}),
      );
    } else this.labels.set("osm-rivers", []);
    await Promise.all(tasks);
    if (job === this.job) this.emit();
  }
}

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export interface LocalMatch {
  name: string;
  detail: string;
  lon: number;
  lat: number;
  kind: WorldLabel["kind"];
  rank: number;
}

/** Instant, offline matches for the search box: bundled world names plus notable places in view. */
export function searchLocal(feeds: Feeds, q: string, limit = 5): LocalMatch[] {
  const needle = fold(q.trim());
  if (needle.length < 2) return [];
  const score = (name: string) => {
    const n = fold(name);
    if (n === needle) return 3;
    if (n.startsWith(needle)) return 2;
    if (n.includes(` ${needle}`)) return 1;
    return 0;
  };
  const out: (LocalMatch & { s: number })[] = [];
  for (const n of feeds.notable) {
    const s = score(n.name);
    if (s) out.push({ name: n.name, detail: n.description ?? KIND_INFO[n.kind].label, lon: n.lon, lat: n.lat, kind: n.kind, rank: n.sitelinks * 2, s: s + 1 });
  }
  for (const w of feeds.worldList) {
    const s = score(w.name);
    if (s) out.push({ name: w.name, detail: w.kind === "city" || w.kind === "capital" ? w.detail : w.kind === "peak" ? `Mountain · ${w.detail}` : KIND_INFO[w.kind].label, lon: w.lon, lat: w.lat, kind: w.kind, rank: w.rank, s });
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.s - a.s || b.rank - a.rank)
    .filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)))
    .slice(0, limit);
}

export function kindLabel(kind: keyof typeof KIND_INFO): string {
  return KIND_INFO[kind].label;
}
