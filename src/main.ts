import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { Cartesian3 } from "cesium";
import { App, type Theme } from "./app";
import { Globe } from "./globe/viewer";
import { builtTheme } from "./themes/built";
import { climateTheme } from "./themes/climate";
import { countriesTheme } from "./themes/countries";
import { landTheme } from "./themes/land";
import { animalsTheme, plantsTheme } from "./themes/life";
import { waterTheme } from "./themes/water";
import { formatElevation, formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";
import { createLayersPanel } from "./ui/layers";
import { createSearch, fieldSiteButtons, type Place as SearchPlace } from "./ui/search";

const $ = (id: string) => document.getElementById(id)!;

const globe = new Globe($("globe"), $("credits"));
const app = new App(globe, $("ui"));

const pick = (p: SearchPlace) => app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.detail ?? "" });

app.emptyState = (theme: Theme) =>
  h("div", { class: "empty" },
    h("div", { class: "empty-hint" }, h("span", { class: "empty-icon", html: icons.target }), h("span", {}, h("strong", {}, "Tap anywhere on Earth"), h("span", {}, "or search for a place to see its ", theme.label.toLowerCase(), "."))),
    h("h2", { class: "group-title" }, "Places to start"),
    fieldSiteButtons(globe, pick));

app.addTheme(landTheme(app));
app.addTheme(waterTheme(app));
app.addTheme(climateTheme());
app.addTheme(plantsTheme());
app.addTheme(animalsTheme());
app.addTheme(builtTheme(app));
app.addTheme(countriesTheme());

$("search-slot").replaceWith(createSearch(globe, pick));

// Map style popover.
const layersBtn = $("layers-btn");
const layers = createLayersPanel(globe);
$("ui").append(layers);
layersBtn.innerHTML = icons.layers;
const toggleLayers = (open = layers.hidden) => {
  layers.hidden = !open;
  layersBtn.setAttribute("aria-expanded", String(open));
};
layersBtn.addEventListener("click", () => toggleLayers());
globe.viewer.scene.canvas.addEventListener("pointerdown", () => toggleLayers(false));

// About / data sources.
const about = $("about-btn");
about.innerHTML = icons.info;
const aboutPanel = h("div", { class: "popover about", hidden: true },
  h("h2", { class: "group-title" }, "About Atlas"),
  h("p", {}, "Tap anywhere on Earth, then flip through the themes to learn about that place: its land, water, climate, life, what people have built, and the country it's in."),
  h("h2", { class: "group-title" }, "Where the data comes from"),
  h("ul", { class: "plain-list" },
    h("li", {}, "Terrain: open elevation tiles (SRTM, USGS 3DEP and others). Imagery: Esri."),
    h("li", {}, "Rocks: Macrostrat. Weather and climate: Open-Meteo (ERA5). Rain radar: RainViewer."),
    h("li", {}, "Plants and animals: iNaturalist and GBIF. Built features, water and mines: OpenStreetMap."),
    h("li", {}, "Countries: Natural Earth borders, REST Countries, World Bank. Night lights: NASA."),
    h("li", {}, "Place names: OpenStreetMap Nominatim.")),
  h("p", { class: "fineprint" }, "Every dataset is a record of what's been measured or mapped. None of them is complete, so treat gaps as unknowns, not absences."),
  h("p", { class: "fineprint" }, "Keyboard: 1–7 switch themes · Esc cancels a line or closes a chart."));
$("ui").append(aboutPanel);
about.addEventListener("click", () => (aboutPanel.hidden = !aboutPanel.hidden));

// Status bar: cursor position.
const readout = $("readout");
app.onPointer = (p) => {
  readout.textContent = p ? `${formatLonLat(p.lon, p.lat)} · ${formatElevation(p.height)}` : "";
};

// Opening view: the whole planet.
globe.viewer.camera.setView({ destination: Cartesian3.fromDegrees(-40, 25, 17_000_000) });

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { atlas: { app, globe } });
