// Rock section: slice through the landscape and see the rock layers inside,
// built from Macrostrat's stratigraphic column and bedrock map.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { buildStack, fitStructure, type StackLayer, type SurfaceObservation } from "../analysis/geosection";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { mapLimit } from "../data/http";
import { fetchColumn, fetchMapUnit, formatAge, type StratUnit } from "../data/macrostrat";
import { greatCirclePoints, haversine } from "../data/mercator";
import { Curtain } from "../globe/curtain";
import { downloadText, groundLine, layer } from "../globe/draw";
import { formatDistance, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";
import { SectionStudio, type SectionData } from "../ui/sectionStudio";
import { LinePicker } from "./linePicker";

const SAMPLES = 600;
const SURFACE_SAMPLES = 36;
const LINE = "#f4a261";

interface Result extends SectionData {
  points: [number, number][];
  columnAt: GeoPoint;
}

export class RockSectionTool implements Tool {
  id = "rocksection";
  label = "Rock section";
  icon = icons.strata;
  shortcut = "r";
  hint = "Slice through the ground and see the rock layers inside";

  private app!: App;
  private ds!: CustomDataSource;
  private picker!: LinePicker;
  private curtain!: Curtain;
  private studio: SectionStudio | null = null;
  private result: Result | null = null;
  private job = 0;

  activate(app: App) {
    this.app = app;
    if (!this.ds) {
      this.ds = layer(app.globe.viewer, "rock-section");
      this.picker = new LinePicker(this.ds, LINE);
      this.curtain = new Curtain(app.globe.viewer);
    }
    if (this.result) this.showResults(this.result);
    else this.intro();
  }

  deactivate() {
    this.picker.cancel();
    this.curtain.clear();
  }

  onCancel() {
    this.picker.cancel();
    if (!this.result) this.intro();
  }

  onMove(p: GeoPoint | null) {
    this.picker.move(p);
  }

  onClick(p: GeoPoint) {
    const line = this.picker.click(p, () => {
      this.curtain.clear();
      this.result = null;
      this.app.drawer.hide();
      this.app.panel.show("Rock section", h("p", {}, "Now click the end point (B)."));
    });
    if (line) void this.compute(...line);
  }

  private intro() {
    this.app.panel.show(
      "Rock section",
      h("p", {}, "Draw a line across a canyon, mountain or valley to cut it open and see the rock layers beneath the surface."),
      h("p", {}, "Then press ", h("strong", {}, "Play history"), " to watch the layers being laid down and the landscape being carved, or tilt the layers to match what you see in the canyon walls."),
      h("p", { class: "muted" }, "Works best where the rock lies in layers, like the Grand Canyon. Data: Macrostrat stratigraphic columns and bedrock maps."),
    );
  }

  private async compute(a: GeoPoint, b: GeoPoint) {
    const job = ++this.job;
    const points = greatCirclePoints(a.lon, a.lat, b.lon, b.lat, SAMPLES);
    groundLine(this.ds, points.filter((_, i) => i % 6 === 0 || i === SAMPLES - 1), { color: LINE, width: 3 });
    const status = h("p", { class: "muted" }, "Reading the terrain…");
    this.app.panel.show("Rock section", status, h("div", { class: "spinner" }));

    const distance = new Float64Array(SAMPLES);
    for (let i = 1; i < SAMPLES; i++) distance[i] = distance[i - 1] + haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    const L = distance[SAMPLES - 1];
    const mid = points[SAMPLES >> 1];

    try {
      const z = zoomForSpacing(L / (SAMPLES - 1), mid[1]);
      const heights = await elevation.sample(points, z);
      if (job !== this.job) return;

      status.textContent = "Finding the rock column…";
      let columnAt: GeoPoint = { lon: mid[0], lat: mid[1], height: 0 };
      let units: StratUnit[] = await fetchColumn(mid[0], mid[1]);
      for (const p of [a, b]) {
        if (units.length) break;
        units = await fetchColumn(p.lon, p.lat);
        columnAt = p;
      }
      if (job !== this.job) return;

      status.textContent = "Reading the bedrock map along the line…";
      const { scale } = await fetchMapUnit(mid[0], mid[1]);
      const sampleIdx = Array.from({ length: SURFACE_SAMPLES }, (_, k) => Math.round((k / (SURFACE_SAMPLES - 1)) * (SAMPLES - 1)));
      const mapped = scale
        ? await mapLimit(sampleIdx, 6, async (i) => (await fetchMapUnit(points[i][0], points[i][1], scale).catch(() => ({ unit: null }))).unit)
        : sampleIdx.map(() => null);
      if (job !== this.job) return;

      const stack = buildStack(units);
      const obs: SurfaceObservation[] = [];
      const surface: SectionData["surface"] = [];
      sampleIdx.forEach((i, k) => {
        const unit = mapped[k];
        if (!unit) return;
        obs.push({ x: distance[i], z: heights[i], unitIds: unit.macro_units ?? [] });
        const x0 = k === 0 ? 0 : (distance[sampleIdx[k - 1]] + distance[i]) / 2;
        const x1 = k === SURFACE_SAMPLES - 1 ? L : (distance[i] + distance[sampleIdx[k + 1]]) / 2;
        const last = surface[surface.length - 1];
        if (last && last.unit.map_id === unit.map_id) last.x1 = x1;
        else surface.push({ x0, x1, unit });
      });
      let zmax = -Infinity;
      for (const v of heights) zmax = Math.max(zmax, v);
      const fit = fitStructure(stack, obs, L, zmax);

      this.result = { points, distance, elevation: heights, stack, fit, surface, columnAt };
      this.showResults(this.result);
    } catch (err) {
      if (job === this.job) this.app.panel.show("Rock section", h("p", { class: "error" }, `${String((err as Error).message ?? err)}. Check your connection and try again.`));
    }
  }

  private showResults(r: Result) {
    const { stack, fit, surface } = r;
    if (!stack.length) {
      this.app.panel.show(
        "Rock section",
        h("p", {}, "Macrostrat has no stratigraphic column here, so the layers below the surface can't be drawn."),
        surface.length ? h("p", {}, "Bedrock mapped along the line: ", surface.map((s) => s.unit.name).join(", "), ".") : "",
        h("p", { class: "muted" }, "Columns cover most of North America and parts of other continents. Try the Grand Canyon or the Colorado Plateau."),
      );
      return;
    }
    const oldest = stack[stack.length - 1].unit, youngest = stack[0].unit;
    const thickness = stack[stack.length - 1].depthBottom;
    const dip = (Math.atan(fit.structure.slope) * 180) / Math.PI;
    const fitText = {
      fit: `Layer position and tilt fitted to ${fit.used} places where the bedrock map shows a known layer at the surface (apparent dip ${Math.abs(dip).toFixed(1)}°).`,
      anchor: `Layer position anchored to ${fit.used} mapped outcrop${fit.used === 1 ? "" : "s"}; layers drawn flat.`,
      default: "The bedrock map couldn't be matched to the column here, so the top of the column is placed at the highest ground. Use Raise / lower and Tilt to adjust.",
    }[fit.method];

    const threeD = h("button", { class: "btn", onclick: () => this.toggle3D(threeD) }, h("span", { html: icons.cube }), this.curtain.visible ? "Hide 3D" : "See it in 3D");
    const png = h("button", {
      class: "btn",
      onclick: async () => {
        const blob = await this.studio?.exportPng();
        if (blob) {
          const url = URL.createObjectURL(blob);
          Object.assign(document.createElement("a"), { href: url, download: "atlas-rock-section.png" }).click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      },
    }, h("span", { html: icons.download }), "PNG");
    const csv = h("button", { class: "btn", onclick: () => this.exportCsv(r) }, "Layers CSV");

    this.app.panel.show(
      "Rock section",
      h("div", { class: "callout" },
        h("div", { class: "callout-label" }, "Rock record"),
        h("div", { class: "callout-value" }, `${stack.length} layers`),
        h("p", {}, `About ${Math.round(thickness).toLocaleString()} m of rock spanning ${formatAge(oldest.b_age)} to ${formatAge(youngest.t_age)} ago.`)),
      h("div", { class: "stats" },
        stat("Section length", formatDistance(r.distance[r.distance.length - 1])),
        stat("Surface units", String(new Set(surface.map((s) => s.unit.map_id)).size), "Different bedrock map units crossed by the line"),
        stat("Oldest layer", oldest.unit_name),
        stat("Youngest layer", youngest.unit_name)),
      h("p", { class: "fineprint" }, fitText),
      h("p", { class: "fineprint" }, "The model assumes layers are flat sheets of constant thickness (a “layer cake”). That suits plateaus like the Grand Canyon; it misses folds, faults and layers that thin out."),
      h("div", { class: "row" }, threeD, png, csv),
    );

    this.studio = new SectionStudio(r);
    this.studio.onStructureChange = () => this.refresh3D();
    this.studio.onHighlight = () => this.refresh3D();
    this.app.drawer.showCustom("Rock section A → B", this.studio.el, [h("span", { class: "drawer-hint" }, "Click a layer to highlight it")]);
    this.app.drawer.onHide = () => this.curtain.clear();
  }

  private toggle3D(btn: HTMLButtonElement) {
    if (this.curtain.visible) {
      this.curtain.clear();
    } else {
      this.refresh3D(true);
      const r = this.result;
      if (r) this.curtain.frame(r.points, r.distance, r.elevation, this.app.globe.state.exaggeration);
      this.app.toast("The ground is see-through around the section. Tilt the view to look underground.");
    }
    btn.lastChild!.textContent = this.curtain.visible ? "Hide 3D" : "See it in 3D";
  }

  private refresh3D(force = false) {
    const r = this.result, st = this.studio;
    if (!r || !st || (!force && !this.curtain.visible)) return;
    this.curtain.show(r.points, r.distance, r.elevation, r.stack, st.currentStructure, this.app.globe.state.exaggeration, st.currentHighlight);
  }

  private exportCsv(r: Result) {
    const rows = ["order,unit,top_depth_m,bottom_depth_m,thickness_m,top_age_ma,base_age_ma,lithology,color"];
    r.stack.forEach((l: StackLayer, i) => {
      const u = l.unit;
      rows.push([i + 1, `"${u.unit_name}"`, l.depthTop.toFixed(0), l.depthBottom.toFixed(0), (l.depthBottom - l.depthTop).toFixed(0), u.t_age, u.b_age, `"${u.lith.map((x) => x.name).join("; ")}"`, u.color].join(","));
    });
    downloadText("atlas-rock-layers.csv", rows.join("\n"));
  }
}
