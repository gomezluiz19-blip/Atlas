// Mines & minerals: mines and quarries around a point, what they produce,
// whether they are still working, and the rock that hosts them.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { commodityOf, GROUPS, isHistoric, mineKind, type CommodityGroup } from "../analysis/commodities";
import { fetchColumn, fetchMapUnit } from "../data/macrostrat";
import { elementPoint, osmUrl, overpass, type OsmElement } from "../data/overpass";
import { layer, marker } from "../globe/draw";
import { flyToPlace } from "../ui/search";
import { h, stat } from "../ui/dom";
import { icons } from "../ui/icons";
import { drawArea, radiusChips, radiusForCamera } from "./area";

interface Site {
  el: OsmElement;
  lon: number;
  lat: number;
  name: string;
  kind: string;
  commodity: string | null;
  group: CommodityGroup;
  historic: boolean;
}

export class MinesTool implements Tool {
  id = "mines";
  label = "Mines";
  icon = icons.pick;
  shortcut = "m";
  hint = "Mines and quarries, what they produce and the rock around them";

  private app!: App;
  private ds!: CustomDataSource;
  private centre: GeoPoint | null = null;
  private radius = 20;
  private sites: Site[] = [];
  private hidden = new Set<CommodityGroup>();
  private job = 0;

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "mines");
    this.ds.show = true;
    if (this.centre && this.sites.length) this.render();
    else
      app.panel.show(
        "Mines & minerals",
        h("p", {}, "Click anywhere to find the mines and quarries around it: what they produce, whether they're still active, and the bedrock they're dug into."),
        h("p", { class: "muted" }, "Tip: turn on Layers → Geologic map to see how mines follow particular rock types."),
        h("p", { class: "muted" }, "Data: OpenStreetMap (mapped sites and commodities), Macrostrat (geology)."),
      );
  }

  deactivate() {
    this.ds.show = false;
    this.app.drawer.hide();
  }

  onClick(p: GeoPoint) {
    this.centre = p;
    this.radius = Math.max(5, radiusForCamera(this.app.globe.cameraHeight()));
    void this.load();
  }

  private async load() {
    const c = this.centre!;
    const job = ++this.job;
    this.ds.entities.removeAll();
    this.app.drawer.hide();
    drawArea(this.ds, c.lon, c.lat, this.radius, "#ffd166");
    this.app.panel.show("Mines & minerals", this.header(), h("p", { class: "muted" }, "Searching OpenStreetMap…"), h("div", { class: "spinner" }));
    const r = Math.round(this.radius * 1000);
    const at = `around:${r},${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
    const q = `[out:json][timeout:50];
(
  nwr(${at})["landuse"="quarry"];
  nwr(${at})["man_made"~"^(mineshaft|adit)$"];
  nwr(${at})["historic"~"^(mine|mine_shaft|mine_adit)$"];
  nwr(${at})["industrial"="mine"];
  nwr(${at})["disused:landuse"="quarry"];
  nwr(${at})["abandoned:landuse"="quarry"];
);
out tags center 1500;`;
    try {
      const els = await overpass(q);
      if (job !== this.job) return;
      this.sites = els.flatMap((el) => {
        const pt = elementPoint(el);
        if (!pt) return [];
        const tags = el.tags ?? {};
        const { text, group } = commodityOf(tags);
        return [{ el, lon: pt[0], lat: pt[1], name: tags.name ?? "", kind: mineKind(tags), commodity: text, group, historic: isHistoric(tags) }];
      });
      this.render();
      void this.geologyContext(job);
    } catch (err) {
      if (job === this.job) this.app.panel.show("Mines & minerals", this.header(), h("p", { class: "error" }, `${(err as Error).message}. Try again, or pick a smaller radius.`));
    }
  }

  private header(): HTMLElement {
    return h("div", { class: "survey-head" },
      radiusChips(this.radius, (r) => { this.radius = r; void this.load(); }));
  }

  private geoBox = h("div", { class: "geo-context" });

  private async geologyContext(job: number) {
    const c = this.centre!;
    this.geoBox.replaceChildren(h("p", { class: "muted" }, "Checking the geology here…"));
    try {
      const [col, map] = await Promise.all([fetchColumn(c.lon, c.lat), fetchMapUnit(c.lon, c.lat)]);
      if (job !== this.job) return;
      const econ = [...new Set(col.flatMap((u) => (u.econ ?? []).map((e) => e.name)))];
      this.geoBox.replaceChildren(
        h("div", { class: "stat-label" }, "Geology at the centre"),
        map.unit ? h("p", {}, h("span", { class: "bedrock-swatch inline", style: `background:${map.unit.color}` }), map.unit.name, map.unit.lith ? ` (${map.unit.lith})` : "") : h("p", { class: "muted" }, "No bedrock map here."),
        econ.length ? h("p", { class: "fineprint" }, h("strong", {}, "Resources known from the rock layers below: "), econ.join(", ")) : "",
      );
    } catch {
      this.geoBox.replaceChildren();
    }
  }

  private render() {
    this.ds.entities.removeAll();
    const c = this.centre!;
    drawArea(this.ds, c.lon, c.lat, this.radius, "#ffd166");
    const visible = this.sites.filter((s) => !this.hidden.has(s.group));
    for (const s of visible) {
      const g = GROUPS.find((x) => x.id === s.group)!;
      marker(this.ds, s.lon, s.lat, { color: s.historic ? shade(g.color) : g.color, size: s.historic ? 8 : 11 });
    }
    const counts = new Map<CommodityGroup, number>();
    for (const s of this.sites) counts.set(s.group, (counts.get(s.group) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    const historic = this.sites.filter((s) => s.historic).length;
    const commodities = new Map<string, number>();
    for (const s of this.sites) if (s.commodity) for (const part of s.commodity.split(", ")) commodities.set(part, (commodities.get(part) ?? 0) + 1);
    const topCommodities = [...commodities].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const bars = GROUPS.filter((g) => counts.get(g.id)).map((g) =>
      h("button", {
        class: `bar-row${this.hidden.has(g.id) ? " off" : ""}`,
        title: "Show or hide on the globe",
        onclick: () => { this.hidden.has(g.id) ? this.hidden.delete(g.id) : this.hidden.add(g.id); this.render(); },
      },
        h("span", { class: "bar-swatch", style: `background:${g.color}` }),
        h("span", { class: "bar-label" }, g.label),
        h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: `width:${((counts.get(g.id)! / max) * 100).toFixed(0)}%;background:${g.color}` })),
        h("span", { class: "bar-value" }, String(counts.get(g.id)))),
    );

    const named = visible.filter((s) => s.name || s.commodity).slice(0, 60);
    const list = named.map((s) =>
      h("button", { class: "site-row", onclick: () => void this.inspect(s) },
        h("span", { class: "bar-swatch", style: `background:${GROUPS.find((g) => g.id === s.group)!.color}` }),
        h("span", { class: "site-text" },
          h("span", { class: "site-name" }, s.name || s.kind),
          h("span", { class: "site-detail" }, [s.kind, s.commodity, s.historic ? "historic / inactive" : ""].filter(Boolean).join(" · ")))),
    );

    this.app.panel.show(
      "Mines & minerals",
      this.header(),
      h("div", { class: "callout mines" },
        h("div", { class: "callout-label" }, "Mapped sites"),
        h("div", { class: "callout-value" }, String(this.sites.length)),
        h("p", {}, this.sites.length ? `${historic} historic or inactive, ${this.sites.length - historic} active or of unknown status.` : "No mines or quarries are mapped within this radius.")),
      bars.length ? h("div", { class: "bars" }, ...bars) : "",
      topCommodities.length ? h("div", { class: "stats" }, ...topCommodities.slice(0, 4).map(([k, v]) => stat(cap(k), `${v} site${v === 1 ? "" : "s"}`))) : "",
      this.geoBox,
      list.length ? h("h3", { class: "panel-sub" }, "Sites") : "",
      h("div", { class: "site-list" }, ...list),
      h("p", { class: "fineprint" }, "Faded dots are historic or inactive. OpenStreetMap coverage varies: many small or historic workings are unmapped, and commodities are often not recorded."),
    );
  }

  private async inspect(s: Site) {
    void flyToPlace(this.app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: s.el.type === "node" ? 800 : 1500 });
    const g = GROUPS.find((x) => x.id === s.group)!;
    const bedrock = h("p", { class: "muted" }, "Looking up the bedrock…");
    const content = h("div", { class: "mine-detail" },
      h("div", { class: "stats" },
        stat("Type", s.kind),
        stat("Produces", s.commodity ? cap(s.commodity) : "Not recorded"),
        stat("Group", g.label),
        stat("Status", s.historic ? "Historic / inactive" : "Active or unknown")),
      bedrock,
      h("div", { class: "row" },
        h("a", { class: "btn", href: osmUrl(s.el), target: "_blank", rel: "noopener" }, "OpenStreetMap record"),
        s.name ? h("a", { class: "btn", href: `https://www.mindat.org/search.php?search=${encodeURIComponent(s.name)}`, target: "_blank", rel: "noopener" }, "Search Mindat") : ""),
    );
    this.app.drawer.showCustom(s.name || s.kind, content, [], false);
    try {
      const { unit } = await fetchMapUnit(s.lon, s.lat);
      bedrock.className = "";
      bedrock.replaceChildren(h("strong", {}, "Host rock: "), unit ? `${unit.name}${unit.lith ? ` (${unit.lith})` : ""}${unit.best_int_name ? `, ${unit.best_int_name}` : ""}` : "not mapped here");
    } catch {
      bedrock.textContent = "Bedrock lookup unavailable.";
    }
  }
}

function shade(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, 0.55)`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
