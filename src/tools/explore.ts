// Explore: navigate freely; click to inspect any point on the surface.
import type { CustomDataSource } from "cesium";
import type { App, GeoPoint, Tool } from "../app";
import { elevation } from "../data/elevation";
import { lonLatToPixel, metersPerPixel } from "../data/mercator";
import { layer, marker } from "../globe/draw";
import { formatElevation, formatLonLat, h, stat } from "../ui/dom";
import { icons } from "../ui/icons";
import { fieldSiteButtons } from "../ui/search";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export class ExploreTool implements Tool {
  id = "explore";
  label = "Explore";
  icon = icons.explore;
  shortcut = "e";
  hint = "Navigate the globe and inspect any point";

  private app!: App;
  private ds!: CustomDataSource;
  private job = 0;

  activate(app: App) {
    this.app = app;
    this.ds ??= layer(app.globe.viewer, "explore");
  }

  deactivate() {
    this.ds.entities.removeAll();
  }

  onCancel() {
    this.ds.entities.removeAll();
    this.app.panel.hide();
  }

  showWelcome() {
    this.app.panel.show(
      "Welcome to Atlas",
      h("p", {}, "A 3D Earth for studying landscapes. Drag to move, scroll to zoom, and right-drag or Ctrl-drag to tilt."),
      h(
        "ul",
        { class: "tool-list" },
        h("li", {}, h("strong", {}, "Cross-section"), " — slice through a gorge or volcano and measure its depth."),
        h("li", {}, h("strong", {}, "Water flow"), " — follow a raindrop downhill to the sea."),
        h("li", {}, h("strong", {}, "Watershed"), " — outline all the land that drains to a point."),
        h("li", {}, h("strong", {}, "Layers"), " — relief shading, elevation colours, slope and contour lines."),
      ),
      h("h3", { class: "panel-sub" }, "Start at a field site"),
      fieldSiteButtons(this.app.globe),
    );
  }

  onClick(p: GeoPoint) {
    void this.inspect(p);
  }

  private async inspect(p: GeoPoint) {
    const job = ++this.job;
    this.ds.entities.removeAll();
    marker(this.ds, p.lon, p.lat, { color: "#ffffff", size: 10 });
    const z = 13;
    const [px, py] = lonLatToPixel(p.lon, p.lat, z);
    const g = await elevation.grid(z, px - 1.5, py - 1.5, 3, 3);
    const [centre] = await elevation.sample([[p.lon, p.lat]], z);
    if (job !== this.job) return;
    const d = g.data, cell = metersPerPixel(p.lat, z);
    const dzdx = (d[2] + 2 * d[5] + d[8] - (d[0] + 2 * d[3] + d[6])) / (8 * cell);
    const dzdy = (d[6] + 2 * d[7] + d[8] - (d[0] + 2 * d[1] + d[2])) / (8 * cell);
    const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    // Aspect: the compass direction the slope faces (downhill), clockwise from north.
    const aspect = (((Math.atan2(-dzdx, dzdy) * 180) / Math.PI) + 360) % 360;
    const coords = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

    const copy = h("button", {
      class: "btn",
      onclick: () => {
        void navigator.clipboard?.writeText(coords);
        this.app.toast("Coordinates copied");
      },
    }, "Copy coordinates");
    const flow = h("button", {
      class: "btn",
      onclick: () => {
        this.app.use("flow");
        void this.app.tool<import("./waterFlow").WaterFlowTool>("flow").run(p);
      },
    }, h("span", { html: icons.flow }), "Trace water");
    this.app.panel.show(
      "Point",
      h("p", { class: "coords" }, formatLonLat(p.lon, p.lat)),
      h(
        "div",
        { class: "stats" },
        stat("Elevation", formatElevation(centre)),
        stat("Slope", `${slope.toFixed(1)}°`, "Steepness of the ground over ~" + Math.round(cell * 3) + " m"),
        stat("Faces", slope < 0.5 ? "Flat" : `${COMPASS[Math.round(aspect / 45) % 8]} (${Math.round(aspect)}°)`, "Aspect: the direction the slope faces"),
      ),
      h("div", { class: "row" }, flow, copy),
    );
  }
}
