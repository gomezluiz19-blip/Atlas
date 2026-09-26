import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { Cartesian3, Math as CesiumMath } from "cesium";
import { App, type Theme } from "./app";
import { Globe } from "./globe/viewer";
import { Feeds, searchLocal } from "./explore/feeds";
import { formatHash, parseHash } from "./data/locationParse";
import { LabelLayer } from "./globe/labels";
import { Overlays } from "./globe/overlays";
import { KIND_INFO } from "./analysis/placeKinds";
import { builtTheme } from "./themes/built";
import { exploreTheme } from "./themes/explore";
import { climateTheme } from "./themes/climate";
import { countriesTheme } from "./themes/countries";
import { landTheme } from "./themes/land";
import { animalsTheme, plantsTheme } from "./themes/life";
import { waterTheme } from "./themes/water";
import { formatElevation, formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";
import { createLayersPanel } from "./ui/layers";
import { createSearch, flyToPlace, type Place as SearchPlace, type SearchResult } from "./ui/search";
import { siteBrowser } from "./ui/sites";
import { SITES, sitesFor, type Site } from "./content/sites";

const $ = (id: string) => document.getElementById(id)!;

const globe = new Globe($("globe"), $("credits"));
const app = new App(globe, $("ui"));

// Live labels and one-touch overlays.
const labels = new LabelLayer(globe.viewer.scene, () => globe.state.exaggeration);
$("ui").prepend(labels.el);
app.labels = labels;
const overlays = new Overlays(globe.viewer, (m) => app.toast(m, 5000));
overlays.onLabels = (on) => labels.setVisible(on);
const feeds = new Feeds(globe.viewer, labels);
labels.onClick = (l) => {
  const n = (l.data as { notable?: { description?: string } } | undefined)?.notable;
  app.select({ lon: l.lon, lat: l.lat, height: 0 }, { title: l.name, context: n?.description ?? l.sub ?? KIND_INFO[l.kind].label }, l.data ?? { source: "world" });
};

const pick = (p: SearchPlace | SearchResult) =>
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, "named" in p && p.named === false ? undefined : { title: p.name, context: p.detail ?? "" });

app.emptyState = (theme: Theme) =>
  h("div", { class: "empty" },
    h("div", { class: "empty-hint" }, h("span", { class: "empty-icon", html: icons.target }), h("span", {}, h("strong", {}, "Tap anywhere on Earth"), h("span", {}, "or search for a place to see its ", theme.label.toLowerCase(), "."))),
    siteBrowser(sitesFor(theme.id), openSite, { color: theme.color }));

const openSite = (s: Site) => {
  void flyToPlace(globe, s);
  app.select({ lon: s.lon, lat: s.lat, height: 0 }, { title: s.name, context: s.where });
};

app.addTheme(exploreTheme(app, feeds, overlays, openSite));
app.addTheme(landTheme(app));
app.addTheme(waterTheme(app));
app.addTheme(climateTheme(overlays));
app.addTheme(plantsTheme());
app.addTheme(animalsTheme());
app.addTheme(builtTheme(app, overlays));
app.addTheme(countriesTheme());

/** Curated sites whose name starts a word with the query. */
const siteMatches = (q: string): SearchResult[] => {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return Object.values(SITES).flat().flatMap((c) => c.sites)
    .filter((s) => s.name.toLowerCase().startsWith(needle) || s.name.toLowerCase().split(/[\s/–-]+/).some((w) => w.startsWith(needle)))
    .slice(0, 3)
    .map((s) => ({ name: s.name, detail: `${s.where} · ${s.why}`, lon: s.lon, lat: s.lat, radius: s.radius, source: "local" as const, icon: "target" as const }));
};

$("search-slot").replaceWith(createSearch(globe, {
  onPick: pick,
  local: (q) => [...siteMatches(q), ...searchLocal(feeds, q).map((m) => ({
    name: m.name, detail: m.detail, lon: m.lon, lat: m.lat, source: "local" as const,
    radius: m.kind === "sea" || m.kind === "continent" ? 1_500_000 : m.kind === "range" || m.kind === "desert" || m.kind === "region" ? 400_000 : m.kind === "city" || m.kind === "capital" ? 15_000 : m.kind === "district" ? 3000 : 1200,
    icon: m.kind === "peak" || m.kind === "range" ? "mountain" as const : m.kind === "water" || m.kind === "sea" ? "drop" as const : m.kind === "city" || m.kind === "capital" ? "building" as const : "target" as const,
  }))].filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i).slice(0, 8),
  bias: () => (feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null),
}));

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
  h("p", {}, "Move the map and Atlas labels what's worth knowing. Tap anything, or anywhere, then flip through the themes to learn about that place: its land, water, climate, life, what people have built, and the country it's in."),
  h("h2", { class: "group-title" }, "Where the data comes from"),
  h("ul", { class: "plain-list" },
    h("li", {}, "Terrain: open elevation tiles (SRTM, USGS 3DEP and others). Imagery: Esri."),
    h("li", {}, "Rocks: Macrostrat. Weather and climate: Open-Meteo (ERA5). Rain radar: RainViewer."),
    h("li", {}, "Plants and animals: iNaturalist and GBIF. Built features, water and mines: OpenStreetMap."),
    h("li", {}, "Countries: Natural Earth borders, REST Countries, World Bank. Night lights: NASA."),
    h("li", {}, "Labels: Natural Earth (world), Wikidata and Wikipedia (notable places), OpenStreetMap (rivers)."),
    h("li", {}, "Aurora and geomagnetic activity: NOAA Space Weather Prediction Center. Earthquakes: USGS. Plates: Bird (2003)."),
    h("li", {}, "Place names: OpenStreetMap Nominatim.")),
  h("p", { class: "fineprint" }, "Every dataset is a record of what's been measured or mapped. None of them is complete, so treat gaps as unknowns, not absences."),
  h("p", { class: "fineprint" }, "Keyboard: 1–8 switch themes · Esc cancels a line or closes a chart."));
$("ui").append(aboutPanel);
about.addEventListener("click", () => (aboutPanel.hidden = !aboutPanel.hidden));

// Status bar: cursor position.
const readout = $("readout");
app.onPointer = (p) => {
  readout.textContent = p ? `${formatLonLat(p.lon, p.lat)} · ${formatElevation(p.height)}` : "";
};

// Shareable links: the URL hash holds the camera, the chosen place and the theme.
const cameraState = () => {
  const c = globe.viewer.camera;
  const pos = c.positionCartographic;
  return { lat: CesiumMath.toDegrees(pos.latitude), lon: CesiumMath.toDegrees(pos.longitude), height: pos.height, heading: CesiumMath.toDegrees(c.heading), pitch: CesiumMath.toDegrees(c.pitch) };
};
const stateHash = () => formatHash({ place: app.place ?? undefined, theme: app.theme?.id !== "explore" ? app.theme?.id : undefined, camera: cameraState() });
app.shareLink = () => `${location.origin}${location.pathname}${stateHash()}`;
let hashTimer = 0;
const syncHash = () => {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    try {
      history.replaceState(null, "", stateHash() || location.pathname);
    } catch {
      /* some embedded viewers forbid history changes */
    }
  }, 400);
};
app.onPlace = syncHash;
app.onTheme = syncHash;
globe.viewer.camera.moveEnd.addEventListener(syncHash);

// Opening view: a shared link's view, or the whole planet.
const shared = parseHash(location.hash);
if (shared.camera) {
  const c = shared.camera;
  globe.viewer.camera.setView({
    destination: Cartesian3.fromDegrees(c.lon, c.lat, Math.max(50, c.height)),
    orientation: { heading: CesiumMath.toRadians(c.heading), pitch: CesiumMath.toRadians(c.pitch), roll: 0 },
  });
} else {
  globe.viewer.camera.setView({ destination: Cartesian3.fromDegrees(-40, 25, 17_000_000) });
}
if (shared.theme) app.setTheme(shared.theme);
if (shared.place) app.select({ lon: shared.place.lon, lat: shared.place.lat, height: 0 });

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { atlas: { app, globe, labels, overlays, feeds } });
  void import("cesium").then((Cesium) => Object.assign(window, { Cesium }));
}
