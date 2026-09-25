// Life here: which plants, animals and fungi have been recorded around a
// point, with photos, threatened species, and where each lives by elevation.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { elevation } from "../data/elevation";
import { mapLimit } from "../data/http";
import { observations, speciesCounts, TAXON_GROUPS, taxonPageUrl, type SpeciesCount, type Taxon } from "../data/inaturalist";
import { layer, marker } from "../globe/draw";
import { formatLonLat, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { rangeChart } from "../ui/rangeChart";
import { drawArea, radiusChips, radiusForCamera } from "./area";

const GREEN = "#7bd389";
const GROUP_COLORS: Record<string, string> = {
  Plantae: "#7bd389", Aves: "#5fb4ff", Mammalia: "#e9a86b", Reptilia: "#c9d65a", Amphibia: "#4fd1c5",
  Insecta: "#f28fb1", Arachnida: "#c49bf2", Fungi: "#e6c48a", Mollusca: "#9fb0c4", Actinopterygii: "#6aa9d6",
};

export class LifeTool implements Tool {
  id = "life";
  label = "Life here";
  icon = icons.leaf;
  shortcut = "b";
  hint = "Plants, animals and fungi recorded around a point";

  private app!: App;
  private ds!: CustomDataSource;
  private obsDs!: CustomDataSource;
  private centre: GeoPoint | null = null;
  private radius = 5;
  private group = "";
  private job = 0;

  activate(app: App) {
    this.app = app;
    if (!this.ds) {
      this.ds = layer(app.globe.viewer, "life-area");
      this.obsDs = layer(app.globe.viewer, "life-observations");
    }
    if (this.centre) void this.load();
    else
      app.panel.show(
        "Life here",
        h("p", {}, "Click anywhere to see which plants, animals and fungi people have recorded around that spot, with photos."),
        h("p", {}, "Then compare where species live by elevation with ", h("strong", {}, "Life zones"), ", an idea first worked out at the Grand Canyon in 1889."),
        h("p", { class: "muted" }, "Data: research-grade iNaturalist observations. Tip: turn on Layers → Species records for a global map from GBIF."),
      );
  }

  deactivate() {}

  onCancel() {
    this.obsDs.entities.removeAll();
  }

  onClick(p: GeoPoint) {
    this.centre = p;
    this.radius = radiusForCamera(this.app.globe.cameraHeight());
    void this.load();
  }

  private async load() {
    const c = this.centre!;
    const job = ++this.job;
    this.ds.entities.removeAll();
    this.obsDs.entities.removeAll();
    this.app.drawer.hide();
    drawArea(this.ds, c.lon, c.lat, this.radius, GREEN);
    const header = this.header();
    this.app.panel.show("Life here", header, h("p", { class: "muted" }, "Looking up observations…"), h("div", { class: "spinner" }));
    const area = { lon: c.lon, lat: c.lat, radiusKm: this.radius };
    try {
      const [all, threatened] = await Promise.all([
        speciesCounts(area, this.group, { perPage: 60 }),
        speciesCounts(area, this.group, { threatened: true, perPage: 30 }),
      ]);
      if (job !== this.job) return;
      this.render(header, all.total, all.results, threatened.results);
    } catch (err) {
      if (job === this.job) this.app.panel.show("Life here", header, h("p", { class: "error" }, `${(err as Error).message}. Check your connection and try again.`));
    }
  }

  private header(): HTMLElement {
    const c = this.centre!;
    const groups = h(
      "div",
      { class: "chips wrap", role: "radiogroup", "aria-label": "Group" },
      ...TAXON_GROUPS.map((g) =>
        h("button", {
          class: "chip", role: "radio", "aria-checked": String(g.id === this.group),
          onclick: () => { this.group = g.id; void this.load(); },
        }, g.label),
      ),
    );
    return h("div", { class: "survey-head" },
      h("p", { class: "coords" }, formatLonLat(c.lon, c.lat)),
      radiusChips(this.radius, (r) => { this.radius = r; void this.load(); }),
      groups);
  }

  private render(header: HTMLElement, total: number, species: SpeciesCount[], threatened: SpeciesCount[]) {
    const threatIds = new Set(threatened.map((t) => t.taxon.id));
    const groupLabel = TAXON_GROUPS.find((g) => g.id === this.group)?.label.toLowerCase() ?? "species";
    const zones = h("button", { class: "btn", onclick: () => void this.lifeZones(species) }, "Life zones by elevation");

    const cards = species.map((s) => this.card(s, threatIds.has(s.taxon.id)));
    this.app.panel.show(
      "Life here",
      header,
      h("div", { class: "callout life" },
        h("div", { class: "callout-label" }, "Species recorded"),
        h("div", { class: "callout-value" }, total.toLocaleString()),
        h("p", {}, total
          ? `Research-grade ${this.group ? groupLabel : "species"} observed within ${this.radius} km.${threatened.length ? ` ${threatened.length} ${threatened.length === 1 ? "is" : "are"} threatened.` : ""}`
          : "Nobody has recorded research-grade observations here yet. Try a larger radius.")),
      threatened.length
        ? h("div", { class: "threatened" }, h("div", { class: "stat-label" }, "Threatened species here"),
            h("div", { class: "threat-list" }, ...threatened.slice(0, 12).map((t) => h("button", { class: "pill threat", onclick: () => void this.showSpecies(t.taxon) }, name(t.taxon)))))
        : "",
      species.length ? h("div", { class: "row" }, zones) : "",
      h("div", { class: "species-grid" }, ...cards),
      h("p", { class: "fineprint" }, "Counts are observations people have uploaded, so they reflect where people look as well as where species live. Photos © their observers via iNaturalist."),
    );
  }

  private card(s: SpeciesCount, threatened: boolean): HTMLElement {
    const t = s.taxon;
    const photo = t.default_photo?.square_url;
    return h(
      "button",
      { class: "species", onclick: () => void this.showSpecies(t), title: t.default_photo?.attribution ?? "" },
      photo ? h("img", { src: photo, alt: "", loading: "lazy", width: 56, height: 56 }) : h("span", { class: "species-noimg" }),
      h("span", { class: "species-text" },
        h("span", { class: "species-name" }, name(t)),
        h("span", { class: "species-sci" }, t.name),
        h("span", { class: "species-count" }, `${s.count.toLocaleString()} obs.`,
          threatened ? h("span", { class: "pill threat" }, "Threatened") : "",
          t.introduced ? h("span", { class: "pill" }, "Introduced") : "")),
    );
  }

  private async showSpecies(t: Taxon) {
    const c = this.centre!;
    const job = ++this.job;
    this.obsDs.entities.removeAll();
    const color = GROUP_COLORS[t.iconic_taxon_name ?? ""] ?? GREEN;
    try {
      const obs = await observations({ lon: c.lon, lat: c.lat, radiusKm: this.radius }, t.id);
      if (job !== this.job) return;
      for (const o of obs) marker(this.obsDs, o.lon, o.lat, { color, size: 8 });
      const heights = obs.length ? await elevation.sample(obs.map((o) => [o.lon, o.lat]), 12) : new Float32Array();
      if (job !== this.job) return;
      const sorted = Array.from(heights).sort((a, b) => a - b);
      const photo = t.default_photo?.medium_url;
      const content = h("div", { class: "species-detail" },
        photo ? h("img", { src: photo, alt: name(t), loading: "lazy" }) : "",
        h("div", {},
          h("h3", {}, name(t)),
          h("p", { class: "species-sci" }, t.name),
          h("p", {}, `${obs.length} located observations shown on the globe.`),
          sorted.length ? h("p", {}, `Recorded between ${Math.round(sorted[0])} m and ${Math.round(sorted[sorted.length - 1])} m elevation, most often around ${Math.round(sorted[sorted.length >> 1])} m.`) : "",
          h("div", { class: "row" },
            h("a", { class: "btn", href: taxonPageUrl(t), target: "_blank", rel: "noopener" }, "iNaturalist page"),
            t.wikipedia_url ? h("a", { class: "btn", href: t.wikipedia_url, target: "_blank", rel: "noopener" }, "Wikipedia") : ""),
          t.default_photo?.attribution ? h("p", { class: "fineprint" }, t.default_photo.attribution) : ""),
      );
      this.app.drawer.showCustom(name(t), content, [], false);
    } catch (err) {
      this.app.toast((err as Error).message);
    }
  }

  private async lifeZones(species: SpeciesCount[]) {
    const c = this.centre!;
    const top = species.slice(0, 14);
    const box = h("div", { class: "zones" }, h("p", { class: "muted" }, `Placing ${top.length} species by elevation…`), h("div", { class: "spinner" }));
    this.app.drawer.showCustom("Life zones: where each species lives by elevation", box);
    try {
      const results = await mapLimit(top, 3, async (s) => {
        const obs = await observations({ lon: c.lon, lat: c.lat, radiusKm: this.radius }, s.taxon.id, 100);
        const hs = obs.length ? Array.from(await elevation.sample(obs.map((o) => [o.lon, o.lat]), 12)) : [];
        return { label: name(s.taxon), sublabel: s.taxon.name, values: hs, color: GROUP_COLORS[s.taxon.iconic_taxon_name ?? ""] ?? GREEN };
      });
      box.replaceChildren(
        h("p", { class: "fineprint" }, "Each bar spans the elevations where a species was recorded; the box holds the middle half and the tick marks the median. Species that sort into bands reveal life zones, which shift with temperature and rainfall as you climb."),
        rangeChart(results, (v) => `${Math.round(v).toLocaleString()} m`),
      );
    } catch (err) {
      box.replaceChildren(h("p", { class: "error" }, (err as Error).message));
    }
  }
}

function name(t: Taxon): string {
  return t.preferred_common_name ? t.preferred_common_name.replace(/^./, (m) => m.toUpperCase()) : t.name;
}
