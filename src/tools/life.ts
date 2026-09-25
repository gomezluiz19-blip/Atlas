// Plants and animals recorded around a place, from iNaturalist: a species
// gallery, life zones by elevation, and threatened species. One LifeTool
// instance per subtab; instances of the same theme share a LifeState.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { elevation } from "../data/elevation";
import { mapLimit } from "../data/http";
import { observations, speciesCounts, taxonPageUrl, type SpeciesCount, type Taxon, type TaxonGroup } from "../data/inaturalist";
import { layer, marker } from "../globe/draw";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { rangeChart } from "../ui/rangeChart";
import { drawArea, radiusChips, radiusForCamera } from "./area";

export interface LifeState {
  groups: TaxonGroup[];
  group: TaxonGroup;
  radius: number;
  color: string;
  noun: string;
}

export function lifeState(groups: TaxonGroup[], color: string, noun: string): LifeState {
  return { groups, group: groups[0], radius: 0, color, noun };
}

type View = "species" | "zones" | "threatened";

export class LifeTool implements Tool {
  label = "Life";
  icon = icons.leaf;
  shortcut = "";
  hint = "";

  private app!: App;
  private ds!: CustomDataSource;
  private obsDs!: CustomDataSource;
  private centre: GeoPoint | null = null;
  private job = 0;

  constructor(readonly id: string, private state: LifeState, private view: View) {}

  activate(app: App) {
    this.app = app;
    if (!this.ds) {
      this.ds = layer(app.globe.viewer, `${this.id}-area`);
      this.obsDs = layer(app.globe.viewer, `${this.id}-obs`);
    }
    this.ds.show = this.obsDs.show = true;
  }

  deactivate() {
    this.ds.show = this.obsDs.show = false;
    this.app.drawer.hide();
  }

  onCancel() {}

  onClick(p: GeoPoint) {
    this.centre = p;
    if (!this.state.radius) this.state.radius = Math.max(2, radiusForCamera(this.app.globe.cameraHeight()));
    void this.load();
  }

  private async load() {
    const c = this.centre!;
    const job = ++this.job;
    this.ds.entities.removeAll();
    this.obsDs.entities.removeAll();
    this.app.drawer.hide();
    drawArea(this.ds, c.lon, c.lat, this.state.radius, this.state.color);
    const header = this.header();
    this.app.panel.show("", header, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Looking up sightings…"));
    const area = { lon: c.lon, lat: c.lat, radiusKm: this.state.radius };
    const q = this.state.group.query;
    try {
      if (this.view === "threatened") {
        const threatened = await speciesCounts(area, q, { threatened: true, perPage: 60 });
        if (job === this.job) this.renderThreatened(header, threatened.results);
        return;
      }
      const all = await speciesCounts(area, q, { perPage: 60 });
      if (job !== this.job) return;
      if (this.view === "zones") this.renderZones(header, all.results, job);
      else this.renderSpecies(header, all.total, all.results);
    } catch (err) {
      if (job === this.job) this.app.panel.show("", header, h("p", { class: "error" }, `${(err as Error).message}. Check your connection and try again.`));
    }
  }

  private header(): HTMLElement {
    const s = this.state;
    const groups = h(
      "div",
      { class: "chips", role: "radiogroup", "aria-label": "Group" },
      ...s.groups.map((g) =>
        h("button", { class: "chip", role: "radio", "aria-checked": String(g === s.group), onclick: () => { s.group = g; void this.load(); } }, g.label),
      ),
    );
    return h("div", { class: "survey-head" }, groups, radiusChips(s.radius, (r) => { s.radius = r; void this.load(); }));
  }

  private renderSpecies(header: HTMLElement, total: number, species: SpeciesCount[]) {
    const s = this.state;
    this.app.panel.show(
      "",
      header,
      h("div", { class: "hero-stat" },
        h("span", { class: "hero-value" }, total.toLocaleString()),
        h("span", { class: "hero-label" }, total === 1 ? `kind of ${s.noun} recorded` : `kinds of ${s.noun} recorded within ${s.radius} km`)),
      total ? "" : h("p", { class: "muted" }, "No sightings recorded here yet. Try a larger radius."),
      h("div", { class: "species-grid" }, ...species.map((sp) => this.card(sp))),
      h("p", { class: "fineprint" }, "From sightings people have shared on iNaturalist, so busy trails are better covered than remote places. Photos © their observers."),
    );
  }

  private renderThreatened(header: HTMLElement, species: SpeciesCount[]) {
    this.app.panel.show(
      "",
      header,
      h("div", { class: "hero-stat" },
        h("span", { class: "hero-value" }, String(species.length)),
        h("span", { class: "hero-label" }, species.length === 1 ? "threatened species recorded" : "threatened species recorded")),
      species.length ? "" : h("p", { class: "muted" }, "No threatened species have been recorded here. That can also mean nobody has looked yet."),
      h("div", { class: "species-grid" }, ...species.map((sp) => this.card(sp, true))),
      h("p", { class: "fineprint" }, "Threatened means listed as vulnerable, endangered or critically endangered by the IUCN or a national authority. Exact locations of sensitive species are hidden by iNaturalist."),
    );
  }

  private renderZones(header: HTMLElement, species: SpeciesCount[], job: number) {
    const top = species.slice(0, 14);
    const status = h("div", { class: "loading" }, h("div", { class: "spinner" }), `Placing ${top.length} species by elevation…`);
    this.app.panel.show(
      "",
      header,
      h("p", {}, "As you climb a mountain, it gets cooler and the plants and animals change, much like travelling toward the poles. These bands are called ", h("strong", {}, "life zones"), ", an idea first worked out at the Grand Canyon in 1889."),
      h("p", { class: "muted" }, "The chart below shows the elevations where each common species has been seen."),
      top.length ? status : h("p", { class: "muted" }, "No sightings recorded here yet."),
    );
    if (!top.length) return;
    const c = this.centre!;
    const box = h("div", { class: "zones" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Working out elevations…"));
    this.app.drawer.showCustom("Where each species lives by elevation", box, [], false);
    mapLimit(top, 3, async (sp) => {
      const obs = await observations({ lon: c.lon, lat: c.lat, radiusKm: this.state.radius }, sp.taxon.id, 100);
      const hs = obs.length ? Array.from(await elevation.sample(obs.map((o) => [o.lon, o.lat]), 12)) : [];
      return { label: nameOf(sp.taxon), sublabel: sp.taxon.name, values: hs, color: this.state.color };
    })
      .then((rows) => {
        if (job !== this.job) return;
        status.replaceChildren(h("span", {}, "Bars span where each species was seen; the box holds the middle half and the tick is the median."));
        box.replaceChildren(rangeChart(rows, (v) => `${Math.round(v).toLocaleString()} m`));
      })
      .catch((err) => box.replaceChildren(h("p", { class: "error" }, (err as Error).message)));
  }

  private card(s: SpeciesCount, threatened = false): HTMLElement {
    const t = s.taxon;
    const photo = t.default_photo?.square_url;
    const status = t.conservation_status?.status_name;
    return h(
      "button",
      { class: "species", onclick: () => void this.showSpecies(t), title: t.default_photo?.attribution ?? "" },
      photo ? h("img", { src: photo, alt: "", loading: "lazy", width: 56, height: 56 }) : h("span", { class: "species-noimg" }),
      h("span", { class: "species-text" },
        h("span", { class: "species-name" }, nameOf(t)),
        h("span", { class: "species-sci" }, t.name),
        h("span", { class: "species-count" }, `${s.count.toLocaleString()} sightings`,
          threatened ? h("span", { class: "pill threat" }, status ? cap(status) : "Threatened") : "",
          t.introduced ? h("span", { class: "pill" }, "Introduced") : "")),
    );
  }

  private async showSpecies(t: Taxon) {
    const c = this.centre!;
    const job = ++this.job;
    this.obsDs.entities.removeAll();
    try {
      const obs = await observations({ lon: c.lon, lat: c.lat, radiusKm: this.state.radius }, t.id);
      if (job !== this.job) return;
      for (const o of obs) marker(this.obsDs, o.lon, o.lat, { color: this.state.color, size: 8 });
      const heights = obs.length ? await elevation.sample(obs.map((o) => [o.lon, o.lat]), 12) : new Float32Array();
      if (job !== this.job) return;
      const sorted = Array.from(heights).sort((a, b) => a - b);
      const photo = t.default_photo?.medium_url;
      const content = h("div", { class: "species-detail" },
        photo ? h("img", { src: photo, alt: nameOf(t), loading: "lazy" }) : "",
        h("div", {},
          h("p", { class: "species-sci" }, t.name),
          h("p", {}, `${obs.length} sightings are shown on the globe.`),
          sorted.length ? h("p", {}, `Seen between ${Math.round(sorted[0]).toLocaleString()} m and ${Math.round(sorted[sorted.length - 1]).toLocaleString()} m above sea level, most often around ${Math.round(sorted[sorted.length >> 1]).toLocaleString()} m.`) : "",
          h("div", { class: "row" },
            h("a", { class: "btn", href: taxonPageUrl(t), target: "_blank", rel: "noopener" }, "iNaturalist"),
            t.wikipedia_url ? h("a", { class: "btn", href: t.wikipedia_url, target: "_blank", rel: "noopener" }, "Wikipedia") : ""),
          t.default_photo?.attribution ? h("p", { class: "fineprint" }, t.default_photo.attribution) : ""),
      );
      this.app.drawer.showCustom(nameOf(t), content, [], false);
    } catch (err) {
      this.app.toast((err as Error).message);
    }
  }
}

function nameOf(t: Taxon): string {
  return t.preferred_common_name ? cap(t.preferred_common_name) : t.name;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
