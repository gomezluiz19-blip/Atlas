import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { App } from "./app";
import { Globe } from "./globe/viewer";
import { CrossSectionTool } from "./tools/crossSection";
import { ExploreTool } from "./tools/explore";
import { WaterFlowTool } from "./tools/waterFlow";
import { WatershedTool } from "./tools/watershed";
import { formatDistance, formatElevation, formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";
import { createLayersPanel } from "./ui/layers";
import { createSearch } from "./ui/search";
import { Cartesian3 } from "cesium";

const $ = (id: string) => document.getElementById(id)!;

const globe = new Globe($("globe"), $("credits"));
const app = new App(globe, $("rail"), $("ui"));

const explore = new ExploreTool();
app.register(explore);
app.register(new CrossSectionTool());
app.register(new WaterFlowTool());
app.register(new WatershedTool());
app.use("explore");
explore.showWelcome();

$("search-slot").replaceWith(createSearch(globe));

// Layers popover.
const layersBtn = $("layers-btn");
const layers = createLayersPanel(globe);
$("ui").append(layers);
layersBtn.prepend(h("span", { html: icons.layers }));
const toggleLayers = (open = layers.hidden) => {
  layers.hidden = !open;
  layersBtn.setAttribute("aria-expanded", String(open));
};
layersBtn.addEventListener("click", () => toggleLayers());
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "l" && !(e.target instanceof HTMLInputElement) && !e.metaKey && !e.ctrlKey) toggleLayers();
});

// About / data sources.
const about = $("about-btn");
about.innerHTML = icons.info;
about.addEventListener("click", () =>
  app.panel.show(
    "About Atlas",
    h("p", {}, "Atlas makes terrain analysis quick and visual for anyone studying the Earth."),
    h("h3", { class: "panel-sub" }, "Data"),
    h(
      "ul",
      { class: "tool-list" },
      h("li", {}, h("strong", {}, "Elevation: "), "Terrain Tiles on AWS (Mapzen/Tilezen), which blends SRTM, USGS 3DEP (finer detail in the US), ETOPO1 bathymetry and more. Resolution is roughly 30 m in most places."),
      h("li", {}, h("strong", {}, "Imagery: "), "Esri World Imagery, with Natural Earth II as an offline fallback."),
      h("li", {}, h("strong", {}, "Search: "), "OpenStreetMap Nominatim."),
    ),
    h("h3", { class: "panel-sub" }, "Limits to keep in mind"),
    h(
      "ul",
      { class: "tool-list" },
      h("li", {}, "Water routing uses the surface only. It does not model infiltration, groundwater, or human structures such as culverts and dams."),
      h("li", {}, "Elevation models smooth out narrow features. Slot canyons and cliffs narrower than a few cells look shallower than they really are."),
    ),
    h("p", { class: "fineprint" }, "Keyboard: E explore · S cross-section · F water flow · W watershed · L layers · Esc cancel"),
  ),
);

// Status bar: cursor position and camera altitude.
const readout = $("readout"), altitude = $("altitude");
app.onPointer = (p) => {
  readout.textContent = p ? `${formatLonLat(p.lon, p.lat)}  ·  ${formatElevation(p.height)}` : "Move the cursor over the globe";
};
globe.viewer.camera.changed.addEventListener(() => {
  altitude.textContent = `Eye ${formatDistance(globe.cameraHeight())}`;
});
globe.viewer.camera.percentageChanged = 0.05;

// Opening view: the whole planet.
globe.viewer.camera.setView({ destination: Cartesian3.fromDegrees(-40, 25, 17_000_000) });
altitude.textContent = `Eye ${formatDistance(globe.cameraHeight())}`;

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { atlas: { app, globe } });
