// Watershed: the whole area that drains through a chosen point, with its
// stream network and classic basin statistics.
import { ImageryLayer, Rectangle, SingleTileImageryProvider, type CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { analysisZoom, delineateWatershed, zoomLabel, type Watershed } from "../analysis/water";
import { lonLatToPixel, pixelToLonLat } from "../data/mercator";
import { layer, marker } from "../globe/draw";
import { formatArea, formatElevation, formatLonLat, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";

const MAX_IMAGE = 2048;

export class WatershedTool implements Tool {
  id = "watershed";
  label = "Watershed";
  icon = icons.watershed;
  shortcut = "w";
  hint = "Outline all the land that drains through a point";

  private app!: App;
  private ds!: CustomDataSource;
  private overlay: ImageryLayer | null = null;
  private job = 0;
  private result: Watershed | null = null;

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "watershed");
    if (this.result) this.showResults(this.result);
    else
      app.panel.show(
        "Watershed",
        h("p", {}, "Click on a stream or valley to outline every slope that drains through that point: its watershed, or drainage basin."),
        h("p", { class: "muted" }, "Your click snaps to the nearest channel. Large basins take a few seconds while Atlas zooms out to fit them."),
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
    this.clear();
    const progress = h("p", { class: "muted" }, "Analysing terrain…");
    this.app.panel.show("Watershed", progress, h("div", { class: "spinner" }));
    let ws: Watershed;
    try {
      ws = await delineateWatershed(p.lon, p.lat, analysisZoom(this.app.globe.cameraHeight(), 11) + 1, (m) => {
        if (job === this.job) progress.textContent = m;
      });
    } catch (err) {
      if (job === this.job) this.app.panel.show("Watershed", h("p", { class: "error" }, `Analysis failed: ${String(err)}`));
      return;
    }
    if (job !== this.job) return;
    this.result = ws;
    this.overlay = new ImageryLayer(renderMask(ws));
    this.app.globe.viewer.imageryLayers.add(this.overlay);
    marker(this.ds, ws.outlet.lon, ws.outlet.lat, { color: "#4cc9f0", label: "Outlet" });
    this.showResults(ws);
  }

  private clear() {
    this.result = null;
    this.ds.entities.removeAll();
    if (this.overlay) this.app.globe.viewer.imageryLayers.remove(this.overlay, true);
    this.overlay = null;
    this.app.drawer.hide();
  }

  private showResults(ws: Watershed) {
    const hi = ws.hypsometricIntegral;
    const stage =
      hi > 0.6
        ? "High: much of the basin is still high ground. Typical of young, actively uplifting landscapes."
        : hi < 0.35
          ? "Low: most of the basin has been worn down. Typical of old, heavily eroded landscapes."
          : "Intermediate: a mature landscape, partly eroded.";
    this.app.panel.show(
      "Watershed",
      h("div", { class: "callout" }, h("div", { class: "callout-label" }, "Drainage area"), h("div", { class: "callout-value" }, formatArea(ws.areaM2)), h("p", {}, `All of this land drains through the outlet at ${formatLonLat(ws.outlet.lon, ws.outlet.lat)}.`)),
      ws.truncated
        ? h("p", { class: "warning" }, "This basin is bigger than the largest area Atlas analyses at once, so the outline is cut off at the edge and the area is a minimum.")
        : "",
      h(
        "div",
        { class: "stats" },
        stat("Outlet", formatElevation(ws.outlet.elevation)),
        stat("Highest point", formatElevation(ws.maxElevation)),
        stat("Relief", formatElevation(ws.maxElevation - ws.minElevation)),
        stat("Mean elevation", formatElevation(ws.meanElevation)),
        stat("Mean slope", `${ws.meanSlopeDeg.toFixed(1)}°`),
        stat("Hypsometric integral", hi.toFixed(2), "(mean − min) / (max − min) elevation"),
      ),
      h("p", { class: "fineprint" }, `Hypsometric integral: ${stage}`),
      h("p", { class: "fineprint" }, `Blue lines are channels with a large upstream area. Priority-Flood + D8 routing on ${zoomLabel(ws.zoom)} terrain.`),
    );
    this.app.drawer.show(
      "Hypsometric curve",
      { x: ws.hypsometry.areaFraction, y: ws.hypsometry.elevation },
      {
        xLabel: "Share of basin area above this elevation",
        yLabel: "Elevation (m)",
        xFormat: (v) => `${Math.round(v * 100)}%`,
        yFormat: (v) => `${Math.round(v).toLocaleString()} m`,
      },
    );
  }
}

/** Draws the basin (fill, outline, stream network) into a lon/lat-aligned image. */
function renderMask(ws: Watershed): SingleTileImageryProvider {
  const { grid, mask, model, bbox } = ws;
  const { width: w, px0, py0, z } = grid;
  const [west, north] = pixelToLonLat(px0 + bbox.x0, py0 + bbox.y0, z);
  const [east, south] = pixelToLonLat(px0 + bbox.x1 + 1, py0 + bbox.y1 + 1, z);
  const cols = bbox.x1 - bbox.x0 + 1, rows = bbox.y1 - bbox.y0 + 1;
  const scale = Math.min(1, MAX_IMAGE / Math.max(cols, rows)) * (Math.max(cols, rows) < 512 ? 2 : 1);
  const W = Math.max(1, Math.round(cols * scale)), H = Math.max(1, Math.round(rows * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const streamArea = Math.max(ws.areaM2 / 400, 40 * ws.cellSize * ws.cellSize);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < grid.height && mask[y * w + x] === 1;

  for (let oy = 0; oy < H; oy++) {
    const lat = north - ((oy + 0.5) / H) * (north - south);
    const gy = Math.floor(lonLatToPixel(0, lat, z)[1]) - py0;
    for (let ox = 0; ox < W; ox++) {
      const gx = bbox.x0 + Math.floor(((ox + 0.5) / W) * cols);
      if (!inside(gx, gy)) continue;
      const o = (oy * W + ox) * 4;
      const i = gy * w + gx;
      const edge = !inside(gx - 1, gy) || !inside(gx + 1, gy) || !inside(gx, gy - 1) || !inside(gx, gy + 1);
      if (edge) {
        img.data.set([255, 255, 255, 240], o);
      } else if (model.area[i] >= streamArea) {
        img.data.set([40, 150, 255, 235], o);
      } else {
        img.data.set([76, 201, 240, 60], o);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return new SingleTileImageryProvider({
    url: canvas.toDataURL("image/png"),
    tileWidth: W,
    tileHeight: H,
    rectangle: Rectangle.fromDegrees(west, south, east, north),
  });
}
