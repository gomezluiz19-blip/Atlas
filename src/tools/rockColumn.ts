// Rock column: the stack of rock layers beneath any point, drawn as a
// geologist's stratigraphic column, plus the bedrock mapped at the surface.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { fetchColumn, fetchMapUnit, formatAge, lithologySummary, unitThickness, type MapUnit, type StratUnit } from "../data/macrostrat";
import { layer, marker } from "../globe/draw";
import { formatLonLat, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { PATTERN_LABEL, patternCss, patternFor } from "../ui/lithology";

export class RockColumnTool implements Tool {
  id = "column";
  label = "Rock column";
  icon = icons.column;
  shortcut = "c";
  hint = "See the stack of rock layers beneath any point";

  private app!: App;
  private ds!: CustomDataSource;
  private job = 0;

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "rock-column");
    app.panel.show(
      "Rock column",
      h("p", {}, "Click anywhere to drill down: see every rock layer beneath that spot, oldest at the bottom, with its age and what it's made of."),
      h("p", { class: "muted" }, "Data: Macrostrat. Best coverage in North America."),
    );
  }

  deactivate() {
    this.ds.entities.removeAll();
  }

  onClick(p: GeoPoint) {
    void this.run(p);
  }

  private async run(p: GeoPoint) {
    const job = ++this.job;
    this.ds.entities.removeAll();
    marker(this.ds, p.lon, p.lat, { color: "#f4a261" });
    this.app.panel.show("Rock column", h("p", { class: "muted" }, "Drilling down…"), h("div", { class: "spinner" }));
    try {
      const [units, map] = await Promise.all([fetchColumn(p.lon, p.lat), fetchMapUnit(p.lon, p.lat)]);
      if (job !== this.job) return;
      this.show(p, units, map.unit);
    } catch (err) {
      if (job === this.job) this.app.panel.show("Rock column", h("p", { class: "error" }, `${(err as Error).message}. Check your connection and try again.`));
    }
  }

  private show(p: GeoPoint, units: StratUnit[], surface: MapUnit | null) {
    const surfaceBox = surface
      ? h("div", { class: "bedrock" },
          h("span", { class: "bedrock-swatch", style: `background:${surface.color}` }),
          h("div", {},
            h("div", { class: "stat-label" }, "Bedrock at the surface"),
            h("div", { class: "bedrock-name" }, surface.name),
            h("div", { class: "fineprint" }, [surface.best_int_name, surface.lith].filter(Boolean).join(" · "))))
      : h("p", { class: "muted" }, "No bedrock map here.");

    if (!units.length) {
      this.app.panel.show("Rock column", h("p", { class: "coords" }, formatLonLat(p.lon, p.lat)), surfaceBox, h("p", { class: "muted" }, "No stratigraphic column covers this spot."));
      return;
    }
    const surfaceIds = new Set(surface?.macro_units ?? []);
    const total = units.reduce((s, u) => s + (unitThickness(u) || 30), 0);
    const scale = Math.min(0.25, 520 / total);
    const econ = [...new Set(units.flatMap((u) => (u.econ ?? []).map((e) => e.name)))];
    const envs = [...new Set(units.flatMap((u) => (u.environ ?? []).map((e) => e.name)))];

    const rows = units.map((u) => {
      const t = unitThickness(u);
      const kind = patternFor(u.lith);
      const heightPx = Math.max(20, (t || 30) * scale);
      return h(
        "div",
        { class: `col-row${surfaceIds.has(u.unit_id) ? " at-surface" : ""}` },
        h("div", {
          class: "col-bar",
          title: PATTERN_LABEL[kind],
          style: `min-height:${heightPx.toFixed(0)}px;background-color:${u.color};background-image:${patternCss(kind)}`,
        }),
        h("div", { class: "col-text" },
          h("div", { class: "col-name" }, u.unit_name, surfaceIds.has(u.unit_id) ? h("span", { class: "pill" }, "at surface") : ""),
          h("div", { class: "col-meta" }, `${u.b_int_name ?? ""} · ${Math.round(u.b_age)}–${Math.round(u.t_age)} Ma · ${t ? `~${Math.round(t)} m` : "thickness unknown"}`),
          h("div", { class: "col-meta" }, lithologySummary(u) || "")),
      );
    });

    this.app.panel.show(
      "Rock column",
      h("p", { class: "coords" }, formatLonLat(p.lon, p.lat)),
      surfaceBox,
      h("div", { class: "callout" },
        h("div", { class: "callout-label" }, "Beneath your feet"),
        h("div", { class: "callout-value" }, `${units.length} layers`),
        h("p", {}, `~${Math.round(total).toLocaleString()} m of rock, from ${formatAge(units[units.length - 1].b_age)} to ${formatAge(units[0].t_age)} ago.`)),
      h("div", { class: "column" }, ...rows),
      econ.length ? h("p", { class: "fineprint" }, h("strong", {}, "Resources in these layers: "), econ.join(", ")) : "",
      envs.length ? h("p", { class: "fineprint" }, h("strong", {}, "Ancient environments: "), envs.slice(0, 8).join(", ")) : "",
      h("p", { class: "fineprint" }, "Bar heights are proportional to thickness. Patterns follow geologic map conventions (dots: sandstone, bricks: limestone, dashes: shale)."),
    );
  }
}
