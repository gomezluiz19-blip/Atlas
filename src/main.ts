import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { Cartesian2, Cartesian3, Math as CesiumMath } from "cesium";
import { App, type Theme } from "./app";
import { Globe, type OverlayKind } from "./globe/viewer";
import { Feeds, searchLocal } from "./explore/feeds";
import { formatHash, parseHash } from "./data/locationParse";
import { LabelLayer } from "./globe/labels";
import { OVERLAYS, Overlays } from "./globe/overlays";
import { KIND_INFO } from "./analysis/placeKinds";
import { builtTheme } from "./themes/built";
import { exploreTheme } from "./themes/explore";
import { climateTheme } from "./themes/climate";
import { countriesTheme } from "./themes/countries";
import { landTheme } from "./themes/land";
import { mineralsTheme } from "./themes/minerals";
import { animalsTheme, plantsTheme } from "./themes/life";
import { waterTheme } from "./themes/water";
import { formatElevation, formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";
import { createLayersPanel } from "./ui/layers";
import { createSearch, flyToPlace, geocode, type Command, type Place as SearchPlace, type SearchResult } from "./ui/search";
import { createRobot } from "./ui/robotCard";
import { PlaceStore } from "./myplaces/store";
import { PlaceScene } from "./myplaces/scene";
import { createMyPlaces } from "./myplaces/panel";
import { createPro } from "./pro/panel";
import { createWork } from "./work/hub";
import { openPlans } from "./work/planUi";
import { borders, openPresent, showYear } from "./work/present";
import { YEARS, yearLabel } from "./data/history";
import { openVideo } from "./work/video";
import { ndviAction, openGrow } from "./work/grow";
import { plan } from "./robot/plan";
import { describe } from "./robot/run";
import { siteBrowser } from "./ui/sites";
import { createCanvasTray } from "./ui/canvasTray";
import { SITES, sitesFor, type Site } from "./content/sites";
import { MINES } from "./content/minerals";
import { LINKS } from "./content/links";

const $ = (id: string) => document.getElementById(id)!;

const globe = new Globe($("globe"), $("credits"));
const app = new App(globe, $("ui"));
globe.onNotice = (m) => app.toast(m, 6000);

// A thin bar along the top while terrain and imagery tiles are streaming in.
const loadingBar = h("div", { class: "tile-progress", role: "progressbar", "aria-label": "Loading map tiles", hidden: true });
$("ui").append(loadingBar);
let loadingTimer = 0;
globe.viewer.scene.globe.tileLoadProgressEvent.addEventListener((queued: number) => {
  clearTimeout(loadingTimer);
  if (queued > 0) loadingTimer = window.setTimeout(() => (loadingBar.hidden = false), 400);
  else loadingBar.hidden = true;
});

// Live labels and one-touch overlays.
const labels = new LabelLayer(globe.viewer.scene, () => globe.state.exaggeration);
$("ui").prepend(labels.el);
app.labels = labels;
const overlays = new Overlays(globe.viewer, (m) => app.toast(m, 5000), app.canvas);
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
app.addTheme(mineralsTheme(app));
app.addTheme(waterTheme(app));
app.addTheme(climateTheme(overlays));
app.addTheme(plantsTheme());
app.addTheme(animalsTheme());
app.addTheme(builtTheme(app, overlays, openSite));
app.addTheme(countriesTheme());

/** Curated sites whose name starts a word with the query. */
const siteMatches = (q: string): SearchResult[] => {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const mines = MINES.map((m) => ({ name: m.name, where: `${m.country} · mine`, why: m.note, lon: m.lon, lat: m.lat, radius: 4000 }));
  return [...Object.values(SITES).flat().flatMap((c) => c.sites), ...mines]
    .filter((s) => s.name.toLowerCase().startsWith(needle) || s.name.toLowerCase().split(/[\s/–-]+/).some((w) => w.startsWith(needle)))
    .slice(0, 3)
    .map((s) => ({ name: s.name, detail: `${s.where} · ${s.why}`, lon: s.lon, lat: s.lat, radius: s.radius, source: "local" as const, icon: "target" as const }));
};

// My Places: saved places (home, a family hotel…) with 3D, energy, water and security.
const myStore = new PlaceStore();
const myScene = new PlaceScene(globe.viewer);
const myPlaces = createMyPlaces(app, myStore, myScene, { onPro: (id) => { myPlaces.close(); pro.open(id); } });
$("layers-btn").before(myPlaces.button);
$("ui").append(myPlaces.panel);
// Atlas Pro: live operations (bookings from a CRM or booking system) for a saved building.
const pro = createPro(app, myStore, myScene, (id) => { myPlaces.open(id); myPlaces.close(); });
$("ui").append(pro.panel);
myPlaces.button.addEventListener("click", () => pro.close());
// Work: plan, present, record and grow, open to everyone.
const work = createWork(app, [
  { id: "plan", label: "Plan", about: "Trips, events, business sites, policy zones and infrastructure", color: "#0a84ff", icon: icons.route, open: openPlans },
  { id: "present", label: "Present", about: "Slides and flying tours of places, with borders from history", color: "#e0b050", icon: icons.slides, open: openPresent },
  { id: "video", label: "Video", about: "Record the globe with a title, captions and narration", color: "#ff375f", icon: icons.video, open: openVideo },
  { id: "grow", label: "Grow", about: "Fields and crops: growth stage, harvest, water and frost", color: "#30d158", icon: icons.sprout, open: openGrow },
]);
myPlaces.button.before(work.button);
$("ui").append(work.panel);
work.button.addEventListener("work:opened", () => { myPlaces.close(); pro.close(); toggleLayers(false); });
myPlaces.button.addEventListener("click", () => work.ctx.close());
app.actions.set("work:ndvi", ndviAction(app));
for (const t of ["plan", "present", "video", "grow"] as const)
  app.actions.set(`work:${t}`, { label: `Work › ${t}`, run: () => { work.ctx.open(); ({ plan: openPlans, present: openPresent, video: openVideo, grow: openGrow })[t](work.ctx); } });
for (const y of YEARS)
  app.actions.set(`work:borders:${y}`, { label: `Borders in ${yearLabel(y)}`, run: () => void showYear(app, y).catch(() => app.toast("Couldn't load the historical borders. Check the connection.", 5000)), isOn: () => borders(app).year === y });

/** The saved place at (or nearest to) the chosen spot, else the first one. */
const savedPlaceHere = () => {
  const all = myStore.all();
  if (!all.length) return undefined;
  const p = app.place;
  if (!p) return all[0];
  return [...all].sort((a, b) => Math.hypot(a.lon - p.lon, a.lat - p.lat) - Math.hypot(b.lon - p.lon, b.lat - p.lat))[0];
};
app.actions.set("pro:occupancy", {
  label: "Live occupancy",
  run: () => {
    const p = savedPlaceHere();
    if (p) pro.open(p.id);
    else app.toast("Save the building in My Places first (the house button), then connect its bookings.", 6000);
  },
});

// The task robot: plain-language requests typed into the search box.
const robot = createRobot(app, {
  async find(text) {
    const mine = myStore.find(text);
    if (mine) return { name: mine.name, detail: mine.address ?? "", lon: mine.lon, lat: mine.lat, radius: 150 };
    const local = siteMatches(text)[0] ?? searchLocal(feeds, text).find((m) => m.name.toLowerCase() === text.toLowerCase());
    if (local) return { name: local.name, detail: local.detail, lon: local.lon, lat: local.lat, radius: "radius" in local ? local.radius : 3000 };
    const [r] = await geocode(text, feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null);
    return r ?? null;
  },
  async go(p) {
    await flyToPlace(globe, p);
    app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.detail ?? "" });
  },
  centre() {
    const c = globe.viewer.canvas;
    return globe.pick(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
  },
});
$("ui").append(robot.el);
const asCommand = (q: string): Command | null => {
  const p = plan(q);
  if (!p.steps.length) return null;
  const steps = describe(p);
  return { title: steps.length === 1 ? steps[0] : `Do ${steps.length} things`, steps, run: () => void robot.run(q.trim(), p) };
};

$("search-slot").replaceWith(createSearch(globe, {
  command: asCommand,
  examples: [
    "Where does rain go in downtown Chicago, and show the storm drains",
    "Lithium mines in Chile",
    "Railways and power plants near Munich",
    "Earthquakes and tectonic plates in Japan",
  ],
  onPick: pick,
  local: (q) => [...siteMatches(q), ...searchLocal(feeds, q).map((m) => ({
    name: m.name, detail: m.detail, lon: m.lon, lat: m.lat, source: "local" as const,
    radius: m.kind === "sea" || m.kind === "continent" ? 1_500_000 : m.kind === "range" || m.kind === "desert" || m.kind === "region" ? 400_000 : m.kind === "city" || m.kind === "capital" ? 15_000 : m.kind === "district" ? 3000 : 1200,
    icon: m.kind === "peak" || m.kind === "range" ? "mountain" as const : m.kind === "water" || m.kind === "sea" ? "drop" as const : m.kind === "city" || m.kind === "capital" ? "building" as const : "target" as const,
  }))].filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i).slice(0, 8),
  bias: () => (feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null),
}));

// Layers any theme can add to the map by name (Built registers its networks itself).
for (const o of OVERLAYS) if (o.id !== "labels") app.actions.set(`overlay:${o.id}`, { label: o.label, run: () => void overlays.set(o.id, true), isOn: () => overlays.isOn(o.id) });
for (const k of ["geology", "elevation", "slope", "contours"] as const)
  app.actions.set(`globe:${k}`, { label: k, run: () => { globe.state.overlays[k].on = true; globe.apply(); }, isOn: () => globe.state.overlays[k].on });

// Under every view of a place: where to go next, keeping what's on the map.
app.connections = (themeId, subtabId) => {
  const links = LINKS[`${themeId}/${subtabId}`];
  if (!links?.length) return null;
  const rows = links.map((l) => {
    if (l.to) {
      const [tid, sid] = l.to;
      const th = app.themes.find((x) => x.id === tid);
      const sub = th?.subtabs.find((s) => s.id === sid);
      if (!th || !sub) return null;
      return h("button", { class: "list-row link-row", onclick: () => { app.setTheme(tid, sid); app.sheet.body.scrollTop = 0; } },
        h("span", { class: "link-icon", style: `--c:${th.color}`, html: th.icon }),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.label), h("span", { class: "list-sub" }, `${th.label} › ${sub.label}`)),
        h("span", { class: "chev", html: "&rsaquo;" }));
    }
    const act = l.action ? app.actions.get(l.action) : undefined;
    if (!act) return null;
    const on = act.isOn?.() ?? false;
    const btn = h("button", { class: "list-row link-row", disabled: on, onclick: () => {
      act.run();
      btn.disabled = true;
      btn.querySelector(".list-sub")!.textContent = "On the map";
    } },
      h("span", { class: "link-icon add", html: icons.layers }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.label), h("span", { class: "list-sub" }, on ? "On the map" : "Adds a layer; you stay here")),
      h("span", { class: "chev", html: on ? "✓" : "+" }));
    return btn;
  }).filter((r): r is HTMLButtonElement => r !== null);
  return rows.length ? h("section", { class: "group connected" }, h("h2", { class: "group-title" }, "Connected"), h("div", { class: "list" }, ...rows)) : null;
};

// Everything on the map, from every theme.
$("ui").append(createCanvasTray(app));

// Map style popover.
const layersBtn = $("layers-btn");
let layers = createLayersPanel(globe);
$("ui").append(layers);
layersBtn.innerHTML = icons.layers;
const toggleLayers = (open = layers.hidden) => {
  if (open) {
    // Rebuilt on open so it matches the canvas (layers can be removed from the tray).
    const fresh = createLayersPanel(globe);
    layers.replaceWith(fresh);
    layers = fresh;
  }
  layers.hidden = !open;
  layersBtn.setAttribute("aria-expanded", String(open));
};

// Analysis layers from the Layers popover (and elsewhere) live on the shared canvas too.
const GLOBE_LAYERS: { kind: OverlayKind; label: string; color: string }[] = [
  { kind: "geology", label: "Geologic map", color: "#a2845e" },
  { kind: "elevation", label: "Elevation colours", color: "#34c759" },
  { kind: "slope", label: "Slope", color: "#ff9f0a" },
  { kind: "contours", label: "Contour lines", color: "#d1d1d6" },
  { kind: "species", label: "Species records", color: "#30d158" },
];
globe.onApply = () => {
  for (const { kind, label, color } of GLOBE_LAYERS) {
    const key = `globe:${kind}`, on = globe.state.overlays[kind].on;
    if (on && !app.canvas.has(key))
      app.canvas.put({
        id: key, label, color, scope: "world", pinned: false,
        show: () => {},
        remove: () => {
          globe.state.overlays[kind].on = false;
          globe.apply();
        },
      }, true);
    else if (!on && app.canvas.has(key)) app.canvas.drop(key);
  }
};
layersBtn.addEventListener("click", () => { myPlaces.close(); pro.close(); work.ctx.close(); toggleLayers(); });
globe.viewer.scene.canvas.addEventListener("pointerdown", () => toggleLayers(false));

// About / data sources.
const about = $("about-btn");
about.innerHTML = icons.info;
const aboutPanel = h("div", { class: "popover about", hidden: true },
  h("h2", { class: "group-title" }, "About Atlas"),
  h("p", {}, "Move the map and Atlas labels what's worth knowing. Tap anything, or anywhere, then flip through the themes to learn about that place: its land, minerals, water, climate, life, what people have built, and the country it's in."),
  h("p", {}, "You can also type a request into the search box, like \u201cstorm drains and railways in Chicago\u201d, and Atlas will plan the steps and do them."),
  h("p", {}, "The themes are lenses on one shared map. What you add stays as you switch (see \"On the map\" at the top), and every view ends with Connected links to related views of the same place."),
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
app.onPlace = () => { syncHash(); myPlaces.refresh(); };
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
else if (!shared.camera && myStore.all().length) {
  // Start where people are: fly in to their own place.
  const saved = myStore.all();
  const home = saved.find((p) => p.kind === "home") ?? saved[0];
  setTimeout(() => {
    void flyToPlace(globe, { name: home.name, lon: home.lon, lat: home.lat, radius: 400 });
    app.select({ lon: home.lon, lat: home.lat, height: 0 }, { title: home.name, context: home.address ?? "My place" });
    app.toast(`Welcome back to ${home.name}. My Places (the house button) has its 3D view and dashboard.`, 6000);
  }, 1200);
}

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { atlas: { app, globe, labels, overlays, feeds } });
  void import("cesium").then((Cesium) => Object.assign(window, { Cesium }));
}
