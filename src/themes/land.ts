// Land: the ground itself: shape, slope, rocks and what's mined from them.
import type { App, Subtab, Theme } from "../app";
import { toolSubtab } from "../app";
import { elevation } from "../data/elevation";
import { fetchMapUnit } from "../data/macrostrat";
import { haversine, lonLatToPixel, metersPerPixel, pixelToLonLat } from "../data/mercator";
import { CrossSectionTool } from "../tools/crossSection";
import { RockSectionTool } from "../tools/geology";
import { MinesTool } from "../tools/mines";
import { RockColumnTool } from "../tools/rockColumn";
import { formatDistance, formatElevation, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { action, asyncBlock, bearing, compass, hero, note, section, stats } from "./common";

/** Describes a spot from its slope and its height relative to the surroundings. */
export function landform(slopeDeg: number, relief: number, position: number): string {
  if (relief < 25 && slopeDeg < 3) return "Flat land";
  if (position > 0.8 && relief > 60) return slopeDeg < 12 ? "Summit or ridge top" : "Ridge";
  if (position < 0.2 && relief > 250) return "Canyon or deep valley floor";
  if (position < 0.25 && relief > 60) return "Valley floor";
  if (slopeDeg >= 35) return "Cliff or very steep slope";
  if (slopeDeg >= 15) return "Steep hillside";
  if (relief < 80) return "Gently rolling land";
  return "Hillside";
}

const overview: Subtab = {
  id: "overview",
  label: "Overview",
  render({ app, place, body }) {
    asyncBlock(app, body, "Reading the terrain…", async () => {
      const z = 13;
      const [px, py] = lonLatToPixel(place.lon, place.lat, z);
      const N = 64; // ~1.2 km across at mid-latitudes
      const g = await elevation.grid(z, px - N / 2, py - N / 2, N, N);
      const [here] = await elevation.sample([[place.lon, place.lat]], z);
      const cell = metersPerPixel(place.lat, z);
      const c = (N / 2) * N + N / 2, d = g.data;
      const dzdx = (d[c - N + 1] + 2 * d[c + 1] + d[c + N + 1] - (d[c - N - 1] + 2 * d[c - 1] + d[c + N - 1])) / (8 * cell);
      const dzdy = (d[c + N - 1] + 2 * d[c + N] + d[c + N + 1] - (d[c - N - 1] + 2 * d[c - N] + d[c - N + 1])) / (8 * cell);
      const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      const aspect = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
      let min = Infinity, max = -Infinity, maxI = 0;
      d.forEach((v, i) => { if (v < min) min = v; if (v > max) { max = v; maxI = i; } });
      const relief = max - min;
      const position = relief > 0 ? (here - min) / relief : 0.5;
      const [hlon, hlat] = pixelToLonLat(g.px0 + (maxI % N) + 0.5, g.py0 + Math.floor(maxI / N) + 0.5, z);
      const toHigh = haversine(place.lon, place.lat, hlon, hlat);

      const bedrock = h("dd", {}, "Looking up…");
      fetchMapUnit(place.lon, place.lat)
        .then(({ unit }) => (bedrock.textContent = unit ? `${unit.name}${unit.best_int_name ? ` · ${unit.best_int_name}` : ""}` : "Not mapped here"))
        .catch(() => (bedrock.textContent = "Unavailable"));

      return [
        hero(formatElevation(here), here <= 0 ? "at or below sea level" : "above sea level"),
        h("div", { class: "badge-row" }, h("span", { class: "badge" }, landform(slope, relief, position))),
        section("The ground here",
          stats(
            ["Slope", slope < 0.5 ? "Flat" : `${slope.toFixed(0)}°`, "Steepness right here"],
            ["Faces", slope < 1 ? "—" : `${compass(aspect)} (${Math.round(aspect)}°)`, "The direction the slope looks toward"],
            ["Height range nearby", formatElevation(relief), "Highest minus lowest ground within about 600 m"],
            toHigh > 30 ? ["Nearby high point", `${formatElevation(max)}, ${formatDistance(toHigh)} ${compass(bearing(place.lon, place.lat, hlon, hlat))}`] : ["Nearby high point", "You're on it"],
          ),
          h("dl", { class: "stat-list" }, h("div", { class: "stat-row" }, h("dt", {}, "Bedrock"), bedrock))),
        section("Explore further",
          action("Slice through the land", () => app.setSubtab("profile"), icons.section),
          action("See the rock layers below", () => app.setSubtab("rocks"), icons.strata),
          action("Find mines and quarries", () => app.setSubtab("minerals"), icons.pick)),
        note("Elevation from open terrain data (about 30 m detail in most places). Bedrock from Macrostrat."),
      ];
    });
  },
};

export function landTheme(app: App): Theme {
  const profile = new CrossSectionTool();
  const column = new RockColumnTool();
  const slicer = new RockSectionTool();
  const mines = new MinesTool();
  app.home("section", "land", "profile");
  app.home("rocksection", "land", "rocks");
  app.home("mines", "land", "minerals");

  const rocks: Subtab = {
    id: "rocks",
    label: "Rocks",
    render({ app, place, body }) {
      const slicing = slicer.hasResult;
      const toColumn = h("button", { class: "segmented-mini-btn", "aria-pressed": "true" }, "Layers below");
      const toSlice = h("button", { class: "segmented-mini-btn", "aria-pressed": "false" }, "Slice through");
      const host = h("div");
      const show = (which: "column" | "slice") => {
        toColumn.setAttribute("aria-pressed", String(which === "column"));
        toSlice.setAttribute("aria-pressed", String(which === "slice"));
        host.replaceChildren();
        if (which === "column") {
          app.releaseTool(slicer);
          app.hostTool(column, host, place, "point");
        } else {
          app.releaseTool(column);
          app.hostTool(slicer, host, place, "line");
        }
      };
      toColumn.addEventListener("click", () => show("column"));
      toSlice.addEventListener("click", () => show("slice"));
      body.append(h("div", { class: "segmented-mini" }, toColumn, toSlice), host);
      show(slicing ? "slice" : "column");
    },
    leave(app) {
      app.releaseTool(column);
      app.releaseTool(slicer);
    },
  };

  return {
    id: "land",
    label: "Land",
    icon: icons.mountain,
    color: "#a2845e",
    intro: "Mountains, canyons and the rock beneath them.",
    subtabs: [
      overview,
      toolSubtab("profile", "Profile", profile, "line"),
      rocks,
      toolSubtab("minerals", "Minerals", mines, "point"),
    ],
  };
}
