import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { App } from "./app";
import { Globe } from "./globe/viewer";
import { CrossSectionTool } from "./tools/crossSection";
import { ExploreTool } from "./tools/explore";
import { RockSectionTool } from "./tools/geology";
import { InfrastructureTool } from "./tools/infrastructure";
import { LifeTool } from "./tools/life";
import { MinesTool } from "./tools/mines";
import { RockColumnTool } from "./tools/rockColumn";
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
app.register(explore, "Land");
app.register(new CrossSectionTool(), "Land");
app.register(new WaterFlowTool(), "Land");
app.register(new WatershedTool(), "Land");
app.register(new RockSectionTool(), "Rock");
app.register(new RockColumnTool(), "Rock");
app.register(new MinesTool(), "Rock");
app.register(new LifeTool(), "Life");
app.register(new InfrastructureTool(), "Built");
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
      h("li", {}, h("strong", {}, "Geology: "), "Macrostrat stratigraphic columns and bedrock maps (CC-BY 4.0)."),
      h("li", {}, h("strong", {}, "Life: "), "iNaturalist research-grade observations; GBIF occurrence maps."),
      h("li", {}, h("strong", {}, "Mines and infrastructure: "), "OpenStreetMap (© OpenStreetMap contributors, ODbL) via the Overpass API."),
      h("li", {}, h("strong", {}, "Search: "), "OpenStreetMap Nominatim."),
    ),
    h("h3", { class: "panel-sub" }, "Limits to keep in mind"),
    h(
      "ul",
      { class: "tool-list" },
      h("li", {}, "Water routing uses the surface only. It does not model infiltration, groundwater, or human structures such as culverts and dams."),
      h("li", {}, "Elevation models smooth out narrow features. Slot canyons and cliffs narrower than a few cells look shallower than they really are."),
      h("li", {}, "Rock sections assume flat, even layers. They suit plateaus like the Grand Canyon and miss folds and faults."),
      h("li", {}, "Species, mines and infrastructure show what people have recorded, which is never complete."),
    ),
    h("p", { class: "fineprint" }, "Keyboard: E explore · S cross-section · F water flow · W watershed · R rock section · C rock column · M mines · B life · I infrastructure · L layers · Esc cancel"),
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
