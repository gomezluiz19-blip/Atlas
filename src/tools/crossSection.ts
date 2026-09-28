// Cross-section: draw a line across terrain and get its elevation profile,
// including how deeply a gorge or valley is cut below its rims.
import { CallbackProperty, Cartesian3, Color, type CustomDataSource, type Entity } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { profileStats, zoomForSpacing, type ProfileStats } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { greatCirclePoints, haversine, metersPerPixel } from "../data/mercator";
import { downloadText, groundLine, layer, marker } from "../globe/draw";
import { formatDistance, formatElevation, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";

const SAMPLES = 600;
const LINE = "#ffd166";

interface Section {
  a: GeoPoint;
  b: GeoPoint;
  points: [number, number][];
  distance: Float64Array;
  elevation: Float32Array;
  stats: ProfileStats;
  cellSize: number;
}

export class CrossSectionTool implements Tool {
  id = "section";
  label = "Cross-section";
  icon = icons.section;
  shortcut = "s";
  hint = "Slice through the terrain to see its profile and depth";

  private app!: App;
  private ds!: CustomDataSource;
  private start: GeoPoint | null = null;
  private cursor: GeoPoint | null = null;
  private hover: Entity | null = null;
  private section: Section | null = null;
  private busy = 0;

  wantsClicks() {
    return this.start !== null;
  }

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "cross-section");
    this.ds.show = true;
    if (this.section) this.showResults(this.section);
    else this.showIntro();
  }

  deactivate() {
    this.start = null;
    this.ds.entities.removeById("rubber");
    this.ds.show = false;
    this.app.drawer.hide();
  }

  onCancel() {
    this.start = null;
    this.ds.entities.removeById("rubber");
    if (!this.section) this.showIntro();
  }

  private showIntro() {
    this.app.panel.show(
      "Cross-section",
      h("p", {}, "Slice through the land to see its shape: how deep a canyon is, how steep a mountain."),
      h("p", { class: "muted" }, "Tip: tilt the view (right-drag or Ctrl-drag) to see the landscape in 3D."),
    );
  }

  onMove(p: GeoPoint | null) {
    this.cursor = p;
  }

  onClick(p: GeoPoint) {
    if (!this.start) {
      this.clear();
      this.start = p;
      marker(this.ds, p.lon, p.lat, { color: LINE, label: "A" });
      this.ds.entities.add({
        id: "rubber",
        polyline: {
          positions: new CallbackProperty(() => {
            const end = this.cursor ?? this.start!;
            return Cartesian3.fromDegreesArray([this.start!.lon, this.start!.lat, end.lon, end.lat]);
          }, false),
          width: 2,
          clampToGround: true,
          material: Color.fromCssColorString(LINE).withAlpha(0.8),
        },
      });
      this.app.panel.show("Cross-section", h("div", { class: "prompt" }, h("strong", {}, "Tap where the slice should end."), h("span", {}, "The line starts at your place and runs to the point you tap. Tip: go straight across a valley or peak.")));
      return;
    }
    const a = this.start;
    this.start = null;
    this.ds.entities.removeById("rubber");
    marker(this.ds, p.lon, p.lat, { color: LINE, label: "B" });
    void this.compute(a, p);
  }

  private clear() {
    this.ds.entities.removeAll();
    this.hover = null;
    this.section = null;
    this.app.drawer.hide();
  }

  private async compute(a: GeoPoint, b: GeoPoint) {
    const job = ++this.busy;
    const points = greatCirclePoints(a.lon, a.lat, b.lon, b.lat, SAMPLES);
    groundLine(this.ds, points.filter((_, i) => i % 6 === 0 || i === SAMPLES - 1), { color: LINE, width: 3 });
    const length = haversine(a.lon, a.lat, b.lon, b.lat);
    const midLat = (a.lat + b.lat) / 2;
    const z = zoomForSpacing(length / (SAMPLES - 1), midLat);
    this.app.panel.show("Cross-section", h("p", { class: "muted" }, "Reading elevations…"));
    let heights: Float32Array;
    try {
      heights = await elevation.sample(points, z);
    } catch (err) {
      this.app.panel.show("Cross-section", h("p", { class: "error" }, `Couldn't load elevation data: ${String(err)}`));
      return;
    }
    if (job !== this.busy) return;
    const distance = new Float64Array(SAMPLES);
    for (let i = 1; i < SAMPLES; i++) {
      distance[i] = distance[i - 1] + haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    const stats = profileStats(distance, heights);
    this.section = { a, b, points, distance, elevation: heights, stats, cellSize: metersPerPixel(midLat, z) };
    this.showResults(this.section);
  }

  private showResults(sec: Section) {
    const { stats } = sec;
    const inc = stats.incision && stats.incision.depth >= 5 ? stats.incision : null; // ignore dips too small to be a valley
    const grid = h(
      "div",
      { class: "stats" },
      stat("Length", formatDistance(stats.length)),
      stat("Relief", formatElevation(stats.relief), "Highest minus lowest point on the line"),
      stat("Highest", formatElevation(stats.maxElevation)),
      stat("Lowest", formatElevation(stats.minElevation)),
      stat("Steepest", `${stats.maxSlopeDeg.toFixed(1)}°`, "Steepest slope between neighbouring samples"),
      stat("Average slope", `${stats.meanSlopeDeg.toFixed(1)}°`),
      stat("Total climb", formatElevation(stats.totalAscent), "Sum of all uphill segments from A to B"),
      stat("Total descent", formatElevation(stats.totalDescent)),
    );
    const depth = inc
      ? h(
          "div",
          { class: "callout" },
          h("div", { class: "callout-label" }, "Depth below the rims"),
          h("div", { class: "callout-value" }, formatElevation(inc.depth)),
          h(
            "p",
            {},
            `The lowest point sits ${formatElevation(inc.depth)} below the lower rim, and the rims are ${formatDistance(inc.rimWidth)} apart.`,
          ),
        )
      : h("p", { class: "muted" }, "No valley along this line: the ground mostly rises or falls from one end to the other.");

    const csv = h(
      "button",
      { class: "btn", onclick: () => this.exportCsv(sec) },
      h("span", { html: icons.download }),
      "Export CSV",
    );
    this.app.panel.show(
      "Cross-section",
      depth,
      grid,
      h("p", { class: "fineprint" }, `Elevation data resolved to ~${Math.round(sec.cellSize)} m. Hover over the chart to find each spot on the globe.`),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => this.app.restartLine(this) }, "New slice"), csv),
    );

    const annotations = [{ index: stats.lowestIndex, label: `Floor ${formatElevation(stats.minElevation)}` }];
    if (inc) {
      annotations.push({ index: inc.leftRimIndex, label: "Rim" }, { index: inc.rightRimIndex, label: "Rim" });
    }
    this.app.drawer.show(
      "Elevation profile A → B",
      { x: sec.distance, y: sec.elevation },
      {
        xLabel: "Distance from A",
        yLabel: "Elevation (m)",
        xFormat: formatDistance,
        yFormat: (v) => `${Math.round(v).toLocaleString()} m`,
        showExaggeration: true,
        annotations,
        onHover: (i) => this.showHover(sec, i),
      },
      [h("button", { class: "btn btn-small", onclick: () => this.exportCsv(sec) }, "CSV")],
    );
  }

  private showHover(sec: Section, i: number | null) {
    if (this.hover) this.ds.entities.remove(this.hover);
    this.hover = null;
    if (i === null) return;
    const [lon, lat] = sec.points[i];
    this.hover = marker(this.ds, lon, lat, { color: "#ffffff", size: 9 });
  }

  private exportCsv(sec: Section) {
    const rows = ["distance_m,longitude,latitude,elevation_m"];
    sec.points.forEach(([lon, lat], i) => {
      rows.push(`${sec.distance[i].toFixed(1)},${lon.toFixed(6)},${lat.toFixed(6)},${sec.elevation[i].toFixed(1)}`);
    });
    downloadText("atlas-cross-section.csv", rows.join("\n"));
  }
}
