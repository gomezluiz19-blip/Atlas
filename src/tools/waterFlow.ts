// "Where does the water go?" — follow surface runoff downhill from any point.
import type { CustomDataSource, Entity } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { analysisZoom, traceFlow, zoomLabel, type FlowTrace } from "../analysis/water";
import { downloadText, groundLine, layer, marker, thin } from "../globe/draw";
import { formatDistance, formatElevation, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";

const WATER = "#4cc9f0";

export class WaterFlowTool implements Tool {
  id = "flow";
  label = "Water flow";
  icon = icons.flow;
  shortcut = "f";
  hint = "Follow rainfall downhill from any point";

  private app!: App;
  private ds!: CustomDataSource;
  private job = 0;
  private trace: FlowTrace | null = null;
  private origin: GeoPoint | null = null;
  private hover: Entity | null = null;

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "water-flow");
    if (this.trace) this.showResults(this.trace);
    else
      app.panel.show(
        "Water flow",
        h("p", {}, "Click anywhere to follow a raindrop downhill: over slopes, down channels, and on toward the sea."),
        h(
          "p",
          { class: "muted" },
          "The path follows the steepest way down across the terrain. Zoom in first for finer detail; zoom out to follow a whole river system.",
        ),
      );
  }

  deactivate() {}

  onCancel() {
    this.job++;
  }

  onClick(p: GeoPoint) {
    void this.run(p);
  }

  async run(p: GeoPoint) {
    const job = ++this.job;
    this.origin = p;
    this.trace = null;
    this.ds.entities.removeAll();
    this.hover = null;
    this.app.drawer.hide();
    marker(this.ds, p.lon, p.lat, { color: WATER, label: "Start" });
    const z = analysisZoom(this.app.globe.cameraHeight());
    const progress = h("p", { class: "muted" }, `Following the water at ${zoomLabel(z)}…`);
    this.app.panel.show("Water flow", progress, h("div", { class: "spinner" }));

    let trace: FlowTrace;
    try {
      trace = await traceFlow(p.lon, p.lat, z, (partial) => {
        if (job !== this.job) return;
        this.draw(partial);
        progress.textContent = `Following the water… ${formatDistance(partial.distance[partial.distance.length - 1] ?? 0)} so far`;
      });
    } catch (err) {
      if (job === this.job) this.app.panel.show("Water flow", h("p", { class: "error" }, `Analysis failed: ${String(err)}`));
      return;
    }
    if (job !== this.job) return;
    this.trace = trace;
    this.draw(trace);
    const last = trace.points[trace.points.length - 1];
    marker(this.ds, last.lon, last.lat, { color: WATER, label: trace.end === "sea" ? "Reaches the sea" : "End" });
    this.showResults(trace);
  }

  private draw(trace: FlowTrace) {
    for (const id of this.ds.entities.values.filter((e) => e.polyline).map((e) => e.id)) this.ds.entities.removeById(id);
    // Split into runs so reaches through depressions can be drawn differently.
    const pts = trace.points;
    let runStart = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i < pts.length && pts[i].ponded === pts[runStart].ponded) continue;
      const run = pts.slice(Math.max(0, runStart - 1), i);
      if (run.length >= 2) {
        const coords = thin(run.map((q) => [q.lon, q.lat] as [number, number]), 1500);
        groundLine(this.ds, coords, pts[runStart].ponded ? { color: "#bde0fe", width: 3, dashed: true } : { color: WATER, width: 7, glow: true });
      }
      runStart = i;
    }
  }

  private showResults(trace: FlowTrace) {
    const pts = trace.points;
    const first = pts[0], last = pts[pts.length - 1];
    const length = trace.distance[trace.distance.length - 1];
    const drop = first.elevation - Math.max(0, last.elevation);
    const ponded = pts.filter((q) => q.ponded).length / pts.length;
    const endText = {
      sea: "The water reaches sea level.",
      limit: "Stopped at the analysis length limit. Click near the end to keep following it.",
      flat: "The water reaches flat ground here, often a lake or reservoir surface, where the elevation data can't show which way it moves next.",
    }[trace.end];

    const csv = h("button", { class: "btn", onclick: () => this.exportCsv(trace) }, h("span", { html: icons.download }), "Export CSV");
    const shed = h(
      "button",
      {
        class: "btn",
        onclick: () => {
          if (!this.origin) return;
          this.app.use("watershed");
          void this.app.tool<import("./watershed").WatershedTool>("watershed").run(this.origin);
        },
      },
      h("span", { html: icons.watershed }),
      "Watershed here",
    );
    this.app.panel.show(
      "Water flow",
      h("div", { class: "callout" }, h("div", { class: "callout-label" }, "Flow path"), h("div", { class: "callout-value" }, formatDistance(length)), h("p", {}, endText)),
      h(
        "div",
        { class: "stats" },
        stat("Starts at", formatElevation(first.elevation)),
        stat("Ends at", formatElevation(last.elevation)),
        stat("Total drop", formatElevation(drop)),
        stat("Average gradient", length > 0 ? `${((drop / length) * 1000).toFixed(1)} m/km` : "—", "Drop per kilometre travelled"),
      ),
      ponded > 0.01
        ? h(
            "p",
            { class: "fineprint" },
            `Dashed reaches (${Math.round(ponded * 100)}% of the path) cross a closed hollow in the terrain: a lake, a closed basin, or a small error in the elevation data. Water there would pool before spilling on.`,
          )
        : "",
      h("p", { class: "fineprint" }, `Surface runoff only (it ignores soil infiltration and groundwater). Steepest-descent (D8) routing on ${zoomLabel(trace.zoom)} terrain.`),
      h("div", { class: "row" }, shed, csv),
    );

    this.app.drawer.show(
      "River long profile",
      { x: trace.distance, y: pts.map((q) => q.elevation), flag: pts.map((q) => q.ponded) },
      {
        xLabel: "Distance downstream",
        yLabel: "Elevation (m)",
        xFormat: formatDistance,
        yFormat: (v) => `${Math.round(v).toLocaleString()} m`,
        showExaggeration: true,
        onHover: (i) => {
          if (this.hover) this.ds.entities.remove(this.hover);
          this.hover = i === null ? null : marker(this.ds, pts[i].lon, pts[i].lat, { color: "#ffffff", size: 9 });
        },
      },
      [h("button", { class: "btn btn-small", onclick: () => this.exportCsv(trace) }, "CSV")],
    );
  }

  private exportCsv(trace: FlowTrace) {
    const rows = ["distance_m,longitude,latitude,elevation_m,ponded"];
    trace.points.forEach((q, i) => rows.push(`${trace.distance[i].toFixed(1)},${q.lon.toFixed(6)},${q.lat.toFixed(6)},${q.elevation.toFixed(1)},${q.ponded ? 1 : 0}`));
    downloadText("atlas-flow-path.csv", rows.join("\n"));
  }
}
