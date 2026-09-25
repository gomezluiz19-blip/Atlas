// Infrastructure: the built systems around a point (roads, rail, power,
// pipelines, water and transport hubs), drawn on the terrain and totalled.
import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  PolylineColorAppearance,
  type CustomDataSource,
} from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { CATEGORIES, categoryOf, isLinear, lengthMeters, plantMegawatts, plantSource, type InfraCategory } from "../analysis/infrastructure";
import { elementPoint, overpass, type OsmElement } from "../data/overpass";
import { layer, marker } from "../globe/draw";
import { formatDistance, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";
import { drawArea, radiusChips, radiusForCamera } from "./area";

interface Feature {
  el: OsmElement;
  cat: InfraCategory;
  linear: boolean;
  length: number;
}

export class InfrastructureTool implements Tool {
  id: string;
  label = "Infra\u00adstructure";
  icon = icons.pylon;
  shortcut = "i";
  hint = "Roads, rail, power, pipelines and water systems around a point";

  private app!: App;
  private ds!: CustomDataSource;
  private lines = new Map<InfraCategory, GroundPolylinePrimitive>();
  private centre: GeoPoint | null = null;
  private radius = 10;
  private features: Feature[] = [];
  private hidden = new Set<InfraCategory>();
  private job = 0;

  /** @param only limit this instance to some categories (for themed subtabs) */
  constructor(private only?: InfraCategory[], id = "infra") {
    this.id = id;
  }

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, `infrastructure-${this.id}`);
    this.ds.show = true;
    for (const p of this.lines.values()) p.show = true;
    if (this.centre && this.features.length) this.render();
    else
      app.panel.show(
        "Infrastructure",
        h("p", {}, "Click anywhere to map the infrastructure around it: major roads, railways, power lines and plants, pipelines, dams and water works, airports and stations."),
        h("p", { class: "muted" }, "Data: OpenStreetMap. Dense cities load slowly, so start with a small radius there."),
      );
  }

  deactivate() {
    this.ds.show = false;
    for (const p of this.lines.values()) p.show = false;
  }

  onClick(p: GeoPoint) {
    this.centre = p;
    this.radius = Math.min(20, radiusForCamera(this.app.globe.cameraHeight()));
    void this.load();
  }

  private clearLines() {
    for (const prim of this.lines.values()) this.app.globe.viewer.scene.groundPrimitives.remove(prim);
    this.lines.clear();
  }

  private async load() {
    const c = this.centre!;
    const job = ++this.job;
    this.ds.entities.removeAll();
    this.clearLines();
    this.app.drawer.hide();
    drawArea(this.ds, c.lon, c.lat, this.radius, "#f4d35e");
    this.app.panel.show("Infrastructure", this.header(), h("p", { class: "muted" }, "Searching OpenStreetMap…"), h("div", { class: "spinner" }));
    const at = `around:${Math.round(this.radius * 1000)},${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
    const q = `[out:json][timeout:60];
(
  way(${at})["highway"~"^(motorway|trunk|primary|secondary)$"];
  way(${at})["railway"~"^(rail|light_rail|subway|narrow_gauge)$"];
  way(${at})["power"~"^(line|minor_line|cable)$"];
  nwr(${at})["power"~"^(plant|substation)$"];
  way(${at})["man_made"="pipeline"];
  nwr(${at})["waterway"="dam"];
  way(${at})["waterway"="canal"];
  nwr(${at})["man_made"~"^(water_works|wastewater_plant|water_tower|pumping_station)$"];
  nwr(${at})["aeroway"="aerodrome"];
  nwr(${at})["railway"="station"];
  nwr(${at})["amenity"="ferry_terminal"];
  nwr(${at})["man_made"~"^(mast|communications_tower)$"];
);
out tags geom 6000;`;
    try {
      const els = await overpass(q);
      if (job !== this.job) return;
      this.features = els.flatMap((el) => {
        const cat = categoryOf(el.tags ?? {});
        if (!cat || (this.only && !this.only.includes(cat))) return [];
        const linear = isLinear(el);
        const within = { lon: c.lon, lat: c.lat, radius: this.radius * 1000 };
        return [{ el, cat, linear, length: linear ? lengthMeters(el, within) : 0 }];
      });
      this.render();
    } catch (err) {
      if (job === this.job) this.app.panel.show("Infrastructure", this.header(), h("p", { class: "error" }, `${(err as Error).message}. Try a smaller radius.`));
    }
  }

  private header(): HTMLElement {
    return h("div", { class: "survey-head" },
      radiusChips(this.radius, (r) => { this.radius = r; void this.load(); }, 20));
  }

  private render() {
    const c = this.centre!;
    this.ds.entities.removeAll();
    this.clearLines();
    drawArea(this.ds, c.lon, c.lat, this.radius, "#f4d35e");
    const scene = this.app.globe.viewer.scene;

    for (const cat of CATEGORIES) {
      if (this.hidden.has(cat.id)) continue;
      const color = Color.fromCssColorString(cat.color);
      const instances = this.features
        .filter((f) => f.cat === cat.id && f.linear)
        .map((f) => new GeometryInstance({
          geometry: new GroundPolylineGeometry({
            positions: Cartesian3.fromDegreesArray(f.el.geometry!.flatMap((g) => [g.lon, g.lat])),
            width: cat.id === "roads" || cat.id === "rail" ? 3 : 2.5,
          }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
        }));
      if (instances.length) {
        const prim = new GroundPolylinePrimitive({ geometryInstances: instances, appearance: new PolylineColorAppearance(), asynchronous: true });
        this.lines.set(cat.id, scene.groundPrimitives.add(prim));
      }
      for (const f of this.features.filter((x) => x.cat === cat.id && !x.linear)) {
        const pt = elementPoint(f.el);
        if (pt) marker(this.ds, pt[0], pt[1], { color: cat.color, size: 9, label: bigPoint(f.el) ? f.el.tags?.name : undefined });
      }
    }

    const length = new Map<InfraCategory, number>();
    const count = new Map<InfraCategory, number>();
    for (const f of this.features) {
      if (f.linear) length.set(f.cat, (length.get(f.cat) ?? 0) + f.length);
      else count.set(f.cat, (count.get(f.cat) ?? 0) + 1);
    }
    const plants = this.features.filter((f) => f.el.tags?.power === "plant");
    const bySource = new Map<string, { n: number; mw: number }>();
    for (const p of plants) {
      const src = plantSource(p.el.tags!);
      const e = bySource.get(src) ?? { n: 0, mw: 0 };
      e.n++;
      e.mw += plantMegawatts(p.el.tags!) ?? 0;
      bySource.set(src, e);
    }
    const totalMw = [...bySource.values()].reduce((s, v) => s + v.mw, 0);
    const bridges = this.features.filter((f) => f.el.tags?.bridge && f.el.tags.bridge !== "no").length;
    const dams = this.features.filter((f) => f.el.tags?.waterway === "dam");
    const airports = this.features.filter((f) => f.el.tags?.aeroway === "aerodrome");

    const rows = CATEGORIES.filter((cat) => !this.only || this.only.includes(cat.id)).filter((cat) => length.get(cat.id) || count.get(cat.id)).map((cat) => {
      const parts = [length.get(cat.id) ? formatDistance(length.get(cat.id)!) : "", count.get(cat.id) ? `${count.get(cat.id)} site${count.get(cat.id) === 1 ? "" : "s"}` : ""].filter(Boolean);
      return h("button", {
        class: `bar-row${this.hidden.has(cat.id) ? " off" : ""}`, title: `${cat.about}. Click to show or hide.`,
        onclick: () => { this.hidden.has(cat.id) ? this.hidden.delete(cat.id) : this.hidden.add(cat.id); this.render(); },
      },
        h("span", { class: "bar-swatch", style: `background:${cat.color}` }),
        h("span", { class: "bar-label" }, cat.label),
        h("span", { class: "bar-value wide" }, parts.join(" · ")));
    });

    const area = Math.PI * this.radius * this.radius;
    const roadKm = (length.get("roads") ?? 0) / 1000; // lengths only count segments inside the circle
    this.app.panel.show(
      "Infrastructure",
      this.header(),
      h("div", { class: "callout infra" },
        h("div", { class: "callout-label" }, "Mapped features"),
        h("div", { class: "callout-value" }, this.features.length.toLocaleString()),
        h("p", {}, this.features.length ? `Within ${this.radius} km. Major-road density: ${(roadKm / area).toFixed(2)} km per km².` : "Nothing mapped here in these categories.")),
      rows.length ? h("div", { class: "bars" }, ...rows) : "",
      h("div", { class: "stats" },
        stat("Power plants", plants.length ? `${plants.length}${totalMw ? ` · ${Math.round(totalMw).toLocaleString()} MW` : ""}` : "None", "Capacity counts only plants that record their output"),
        stat("Bridges", String(bridges), "Major-road and rail bridges"),
        stat("Dams", String(dams.length)),
        stat("Airports", String(airports.length))),
      bySource.size
        ? h("p", { class: "fineprint" }, h("strong", {}, "Power by source: "), [...bySource].sort((a, b) => b[1].mw - a[1].mw || b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}${v.mw ? ` (${Math.round(v.mw)} MW)` : ""}`).join(", "))
        : "",
      h("p", { class: "fineprint" }, "Click a category to show or hide it. OpenStreetMap coverage is excellent for roads and rail and patchier for pipelines and utilities; some features are deliberately left unmapped."),
    );
  }
}

function bigPoint(el: OsmElement): boolean {
  const t = el.tags ?? {};
  return t.aeroway === "aerodrome" || t.power === "plant" || t.waterway === "dam";
}
