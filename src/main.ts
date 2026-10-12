import "./styles.css";
import { installEmojiGuard } from "./ui/noEmoji";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { BoundingSphere, Cartesian2, Cartesian3, HeadingPitchRange, Math as CesiumMath } from "cesium";
import { createMapControls } from "./globe/controls";
import { installWayfinder } from "./wayfind/ui";
import { Looks } from "./globe/looks";
import { featureChips } from "./explore/featureLayers";
import { App, type Theme } from "./app";
import { Globe } from "./globe/viewer";
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
import { animalsTheme, natureTheme, plantsTheme } from "./themes/life";
import { peopleOnMap } from "./people/mineUi";
import { createChrome } from "./ui/chrome";
import { createAbout } from "./shell/about";
import { wireSearch } from "./shell/searchBox";
import { myPlaceHologram } from "./shell/hologram";
import { cardFollowsMap } from "./shell/followCard";
import { openingView } from "./shell/opening";
import { connections } from "./shell/connections";
import { globeLayersOnCanvas } from "./shell/globeLayers";
import { waterTheme } from "./themes/water";
import { deferred, formatElevation, formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";
import { resolvePlace, slugOfPlace, warmPlaces } from "./place/places";
import { type Thing } from "./ui/frontDoor";
import { buildThings } from "./ui/things";
import { TimeBar } from "./time/bar";
import { arrive, stopArriving } from "./delight/arrive";
import { introFor, introForAsync, loadWorldHeritage, shouldPlay, type IntroPlace } from "./intros/places";
import { startTour } from "./delight/tour";
import { firstSentence, headline } from "./place/headline";
import { measureAt } from "./place/measure";
import { iconSvg } from "./ui/glyph";
import { createLayersPanel } from "./ui/layers";
import { venueOf } from "./place/venue";
import { flyToPlace, geocode, type Place as SearchPlace, type SearchResult } from "./ui/search";
import { createRobot } from "./ui/robotCard";
import { createAiSettings } from "./ui/aiSettings";
import { aiOn } from "./robot/llm";
import { PlaceStore, blankPlace } from "./myplaces/store";
import { activeSpace, openSpace } from "./delight/spaces";
import { PlaceScene } from "./myplaces/scene";
import { createMyPlaces } from "./myplaces/panel";
import { createWork, type WorkCtx, type WorkTool } from "./work/hub";
import type { Station } from "./work/workLines";
import { briefFor, todayCard } from "./myplaces/todayUi";
import { backupRow, keepStorage } from "./myplaces/backup";
import { STORAGE_FULL } from "./util/storage";
import { hasDemo, loadDemo, removeDemo } from "./myplaces/demo";
import { planLog } from "./myplaces/logAny";
import { spaceTheme } from "./space/theme";
import { peopleTheme } from "./themes/people";
import { createLenses } from "./lenses/bar";
import { LENSES } from "./lenses";
import { YEARS, yearLabel } from "./data/history";
import { loadPassport, savePassport, stamp } from "./work/passport";
import { countryAt } from "./data/countries";
import { siteBrowser } from "./ui/sites";
import { createViewStack } from "./ui/viewStack";
import { sitesFor, type Site } from "./content/sites";
import { wireSocial } from "./social/wire";
import { watchForProblems } from "./ui/errors";
import { later } from "./util/later";
import { watchMotion } from "./ui/motion";
import { seamlessDeploys, warmUp } from "./ui/warm";
watchForProblems();
import { topicThemes } from "./topics/themes";
import { openWorldNow } from "./live/worldNow";
import { createCityLife } from "./city/life";

// Terreno's own icons, never a phone's emoji (src/ui/noEmoji.ts).
installEmojiGuard();

// The address the page opened with: the camera keeps the hash up to date as it moves, so links that open
// something (a TV, a quiz) are read from here rather than from the hash later on.
const startHash = location.hash;

const $ = (id: string) => document.getElementById(id)!;

// Tools that aren't needed to show the globe load when first opened.
const lazy = (load: () => Promise<(ctx: WorkCtx) => void>) => (ctx: WorkCtx) => {
  load().then((open) => open(ctx)).catch(() => app.toast("Couldn't load that tool. Check the connection and try again.", 5000));
};
const openPlans = lazy(() => import("./work/planUi").then((m) => m.openPlans));
const openVideo = lazy(() => import("./work/video").then((m) => m.openVideo));
const openBuild = lazy(() => import("./work/build").then((m) => m.openBuild));
const openFlock = lazy(() => import("./work/flock").then((m) => m.openFlock));
const openTeach = lazy(() => import("./work/teach").then((m) => m.openTeach));
const openLearn = lazy(() => import("./work/learn").then((m) => m.openLearn));
const openAsk = lazy(() => import("./answers/ui").then((m) => (ctx: WorkCtx) => m.openAsk(ctx)));
const openGrow = lazy(() => import("./work/grow").then((m) => m.openGrow));
const openPresent = lazy(() => import("./work/present").then((m) => m.openPresent));
const grow = later(() => import("./work/grow"));
const present = later(() => import("./work/present"));

const globe = new Globe($("globe"), $("credits"));
const app = new App(globe, $("ui"));
globe.onNotice = (m) => app.toast(m, 6000);

// A thin bar along the top while terrain and imagery tiles are streaming in.
const loadingBar = h("div", { class: "tile-progress", role: "progressbar", "aria-label": "Loading map tiles", hidden: true });
$("ui").append(loadingBar);
// Figures count up and sets arrive in order wherever they appear (src/ui/motion.ts).
watchMotion($("ui"));
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
app.layerChips = (id) => featureChips(app, id);
const overlays = new Overlays(globe.viewer, (m) => app.toast(m, 5000), app.canvas);
overlays.onLabels = (on) => labels.setVisible(on);
const feeds = new Feeds(globe.viewer, labels);
labels.onClick = (l) => {
  const d = l.data as { notable?: { description?: string }; world?: { detail?: string } } | undefined;
  const detail = d?.world?.detail && !/^\d/.test(d.world.detail) ? d.world.detail.replace("range/mtn", "mountain range").replace("pen/cape", "peninsula or cape") : undefined;
  app.select({ lon: l.lon, lat: l.lat, height: 0 }, { title: l.name, context: d?.notable?.description ?? (detail ? detail[0].toUpperCase() + detail.slice(1) : undefined) ?? l.sub ?? KIND_INFO[l.kind].label }, { ...((l.data as object | undefined) ?? { source: "world" }), kind: l.kind, name: l.name });
};

// Landmark intros: the first time in a visit that a well-known place is opened, it's shown as a white model
// with a few lines about it, then the view cuts to the real place.
const withIntro = (name: string | undefined, lon: number, lat: number, then: (ip?: IntroPlace) => void, force = false) => {
  void introForAsync(name, lon, lat).then((ip) => {
    if (!ip || (!force && !shouldPlay(ip))) { then(); return; }
    void import("./intros/intro").then((m) => m.playIntro(ip, () => then(ip))).catch(() => then());
  });
};
// The whole World Heritage List, once the globe has settled.
setTimeout(() => void loadWorldHeritage().catch(() => {}), 6000);
const arriveAt = (ip: IntroPlace) => void arrive(app, { name: ip.name, kicker: ip.where, lon: ip.lon, lat: ip.lat, radius: Math.max(150, ip.size / 3), fact: ip.lines[0] });

const pick = (p: SearchPlace | SearchResult) => {
  const named = !("named" in p && p.named === false) && !("source" in p && p.source === "coords");
  // A venue (a school, a shop, an address) carries what the map says it is, so its card leads with what suits it.
  const category = "category" in p && p.category && venueOf(p.category, p.name) ? p.category : undefined;
  // A school, a shop, an address: its maps-style card lives in Overview, whichever tab you searched from.
  if (category && app.theme.id !== "explore") app.setTheme("explore");
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, named ? { title: p.name, context: p.detail ?? "" } : undefined, category ? { venue: category } : undefined);
  if (named) withIntro(p.name, p.lon, p.lat, (ip) => ip && arriveAt(ip));
};

app.emptyState = (theme: Theme) =>
  h("div", { class: "empty" },
    h("div", { class: "empty-hint" }, h("span", { class: "empty-icon", html: icons.target }), h("span", {}, h("strong", {}, "Tap anywhere on Earth"), h("span", {}, "or search for a place to see its ", theme.label.toLowerCase(), "."))),
    siteBrowser(sitesFor(theme.id), openSite, { color: theme.color }));

const openSite = (s: Site) => {
  void flyToPlace(globe, s);
  app.select({ lon: s.lon, lat: s.lat, height: 0 }, { title: s.name, context: s.where });
  withIntro(s.name, s.lon, s.lat, (ip) => ip && arriveAt(ip));
};

// The bar: three ways in (your people, the living world, the nations); everything else waits under More.
app.barOrder = ["people", "nature", "countries"];
app.addTheme(exploreTheme(app, feeds, overlays, openSite));
// Earth: the ground, the rocks and the minerals in them, in one place.
{
  const land = landTheme(app), minerals = mineralsTheme(app);
  app.addTheme({
    ...land, label: "Earth", icon: icons.globe, intro: "Mountains, volcanoes, canyons, the rock beneath them and the minerals in it.",
    subtabs: [...land.subtabs, ...minerals.subtabs.map((t) => (t.id === "here" ? { ...t, label: "Minerals" } : t.id === "mines" ? { ...t, label: "Mines" } : t))],
    enter: (a) => { land.enter?.(a); minerals.enter?.(a); },
    leave: (a) => { land.leave?.(a); minerals.leave?.(a); },
  });
  app.aliases.set("minerals", "land");
}
app.addTheme(waterTheme(app));
app.addTheme(climateTheme(overlays));
{
  const plants = plantsTheme(), animals = animalsTheme();
  app.addTheme(natureTheme(plants, animals));
  app.addTheme(plants);
  app.addTheme(animals);
}
app.addTheme(builtTheme(app, overlays, openSite));
app.addTheme(peopleTheme(app));
app.addTheme(countriesTheme());


// ---- What ＋ and Me open --------------------------------------------------------------------------
// My Place (from Me): saved places (home, a farm, a hotel…) with today's brief, 3D, energy, water and
// security, and the tools to run them (Grow, Flock, Build, live occupancy).
// Explore: the world now, questions for the map, the seasons, games and space.
// Create: plans, stories, videos, 3D captures and lessons. Work: every field's tools, as a line map.
const myStore = new PlaceStore();
const myScene = new PlaceScene(globe.viewer);
const tool = (id: string, label: string, about: string, color: string, icon: string, open: (ctx: WorkCtx) => void): WorkTool => ({ id, label, about, color, icon, open });
const PLACE_TOOLS: WorkTool[] = [
  tool("reach", "Getting around", "How far you get in 15 minutes on foot, by bike or by car", "#5b9467", icons.route, (ctx) => void import("./travel/reachUi").then((m) => m.openReach(ctx, app))),
  tool("travel", "Travel", "Plan a trip: the route, the weather when you land, where to stay", "#3563d6", icons.suitcase, (ctx) => void import("./travel/travelUi").then((m) => m.openTravel(ctx, app))),
  tool("myplans", "My plans", "Everything you've planned, on one map", "#3563d6", icons.flag, (ctx) => void import("./plans/ui").then((m) => m.openPlans(ctx))),
  tool("packages", "Packages", "Track what's on its way to you", "#8b5fa8", icons.suitcase, (ctx) => void import("./myplaces/packagesUi").then((m) => m.openPackages(ctx))),
  tool("grow", "Grow", "Your fields: growth stage, water, frost and harvest", "#5b9467", icons.sprout, openGrow),
  tool("flock", "Flock", "Animals in your care, for farms, vets and rescues", "#8faa5a", icons.paw, openFlock),
  tool("build", "Build", "Model a building on its site and follow it as it rises", "#d19a2e", icons.crane, openBuild),
];
const WORK_TOOLS: WorkTool[] = [
  tool("buildpro", "Build Pro", "Run construction sites: schedule, weather, cost and permits", "#d19a2e", icons.crane, (ctx) => void import("./pro/build/ui").then((m) => m.openBuildPro(ctx))),
  tool("occupancy", "Live occupancy", "Live rooms and floors from your booking system", "#b8496a", icons.building, () => app.actions.get("pro:occupancy")?.run()),
  tool("office", "Politics Pro", "Run a legislative office: district, casework and the whip count", "#5160c2", icons.flag, (ctx) => void import("./pro/office/ui").then((m) => m.openOffice(ctx))),
  tool("network", "Business network", "Your sites, suppliers and customers, and what moves between them", "#d19a2e", icons.route, (ctx) => void import("./pro/network/ui").then((m) => m.openNetwork(ctx))),
  tool("sports", "Sports Pro", "Run a club: fixtures, travel, fans and scouting", "#b8496a", icons.trophy, (ctx) => void import("./pro/sports/ui").then((m) => m.openSports(ctx))),
  tool("shipping", "Freight Desk", "Every shipment on its route, with real ETAs, delays and carbon", "#3563d6", icons.globe, (ctx) => void import("./pro/shipping/ui").then((m) => m.openShipping(ctx))),
  tool("relief", "Relief Pipeline", "Humanitarian supply lines: stock, routes and what's cut off", "#5b9467", icons.route, (ctx) => void import("./pro/relief/ui").then((m) => m.openRelief(ctx))),
  tool("services", "Field Network", "Service equipment across many sites: crews, parts and travel", "#d19a2e", icons.gem, (ctx) => void import("./pro/services/ui").then((m) => m.openServices(ctx))),
  tool("mining", "Mining Pro", "Run a mine: output, communities, permits and the tailings dam", "#9a7552", icons.pick, (ctx) => void import("./pro/mining/ui").then((m) => m.openMining(ctx))),
  tool("field", "Field Ops", "Run an aid programme: who's out of reach and where to build next", "#5b9467", icons.medical, (ctx) => void import("./pro/field/ui").then((m) => m.openField(ctx))),
];
const MAKE_TOOLS: WorkTool[] = [
  tool("plan", "Plan", "Trips, events, sites and routes, step by step", "#3563d6", icons.route, openPlans),
  tool("present", "Stories", "Tell a story on the globe and publish it", "#c9a256", icons.slides, openPresent),
  tool("video", "Video", "Film the globe with shots, looks and narration", "#b8496a", icons.video, openVideo),
  tool("studio3d", "3D Studio", "Place real 3D captures on the Earth and film them", "#4c9ac9", icons.cube, (ctx) => void import("./render/studio").then((m) => m.openStudio(ctx))),
  tool("teach", "Teach", "Lessons, quizzes, games and field trips", "#8b5fa8", icons.graduate, openTeach),
  tool("whatif", "What if…", "Model a shock and watch prices, countries and companies react", "#c4513a", icons.activity, (ctx) => void import("./econ/labUi").then((m) => m.openLab(ctx, app))),
];
const LOOK_TOOLS: WorkTool[] = [
  tool("news", "World now", "Top stories, live headlines, fires, storms and quakes", "#b8496a", icons.globe, (ctx) => openWorldNow(ctx)),
  tool("year", "The year breathes", "Watch a year of seasons sweep the planet", "#5b9467", icons.sprout, (ctx) => { ctx.close(); app.actions.get("rhythms:year")?.run(); }),
  tool("ask", "Ask the map", "Find places that meet many conditions at once", "#ffb04a", icons.sparkle, openAsk),
  tool("learn", "Learn", "Games, a daily challenge and your passport", "#5b9467", icons.book, openLearn),
  tool("space", "Space", "Satellites, the ISS, rocket launches and the solar system", "#5160c2", icons.saturn, () => app.setTheme("space")),
];

/** Everything Terreno can show or open (for search and the stack of views), built the first time it's asked for. */
let things: Thing[] | null = null;
const allThings = () => (things ??= buildThings(app, overlays, [...PLACE_TOOLS, ...MAKE_TOOLS, ...LOOK_TOOLS]));

/** The saved place at (or nearest to) the chosen spot, else home, else the first one. */
const savedPlaceHere = () => {
  const all = myStore.all();
  if (!all.length) return undefined;
  const p = app.place;
  if (!p) return all.find((x) => x.kind === "home" || x.kind === "farm") ?? all[0];
  return [...all].sort((a, b) => Math.hypot(a.lon - p.lon, a.lat - p.lat) - Math.hypot(b.lon - p.lon, b.lat - p.lat))[0];
};

/** A brief item opens the animal, field or project it's about (or the tool). */
function openBriefItem(tool: "flock" | "grow" | "build", ref?: string) {
  const ctx = placeHub.ctx;
  const fail = () => app.toast("Couldn't load that tool. Check the connection and try again.", 5000);
  if (!ref) { PLACE_TOOLS.find((x) => x.id === tool)?.open(ctx); return; }
  if (tool === "flock") void import("./work/flock").then((m) => { m.openFlock(ctx); m.openAnimal(ctx, ref); }).catch(fail);
  else if (tool === "grow") void import("./work/grow").then((m) => { m.openGrow(ctx); m.openField(ctx, ref); }).catch(fail);
  else void import("./work/build").then((m) => { m.openBuild(ctx); m.openProject(ctx, ref); }).catch(fail);
}

/** First run: find your address and go straight to saving it. */
function addressBox(): HTMLElement {
  const input = h("input", { class: "pro-url", placeholder: "Your address or farm name", "aria-label": "Your address", autocomplete: "street-address" }) as HTMLInputElement;
  const note = h("p", { class: "muted small" });
  const find = async () => {
    const q = input.value.trim();
    if (!q) return;
    note.textContent = "Looking…";
    const [r] = await geocode(q, feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null).catch(() => []);
    if (!r) { note.textContent = "Couldn't find that. Try adding the town, or tap the place on the map."; return; }
    note.textContent = "";
    void flyToPlace(globe, { ...r, radius: 600 });
    app.select({ lon: r.lon, lat: r.lat, height: 0 }, { title: r.name, context: r.detail ?? "" });
    myPlaces.add(r.lon, r.lat, r.name);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void find(); });
  return h("div", {}, h("div", { class: "build-log-form" }, input, h("button", { class: "primary-btn", onclick: () => void find() }, "Find")), note);
}

/** "What happened today?": one box for animals, fields and building sites. */
function logBox(): HTMLElement {
  const input = h("input", { class: "pro-url", placeholder: "What happened? \u201cDaisy had twins\u201d, \u201csprayed Top field\u201d", "aria-label": "Log what happened" }) as HTMLInputElement;
  const hint = h("p", { class: "muted small flock-log-preview" }, "Log animals, fields or a building site in plain words.");
  const commit = () => {
    const plan = planLog(input.value);
    if (!plan) { hint.textContent = "Couldn't tell what that's about. Name the animal, field or project."; hint.classList.add("warn"); return; }
    void plan.run().then((r) => { app.toast(r ? `Logged in ${plan.tool}: ${r}` : "Couldn't log that.", 4000); input.value = ""; placeHub.ctx.home(); });
  };
  input.addEventListener("input", () => {
    hint.classList.remove("warn");
    const plan = input.value.trim() ? planLog(input.value) : null;
    hint.textContent = plan ? `Will log in ${plan.tool}: ${plan.summary}` : input.value.trim() ? "…" : "Log animals, fields or a building site in plain words.";
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
  return h("div", { class: "flock-log" }, h("div", { class: "build-log-form" }, input, h("button", { class: "pill-btn", onclick: commit }, "Log")), hint);
}

const placeHub = createWork(app, PLACE_TOOLS, {
  title: "My Place",
  intro: "Your home, farm, site or business: what matters there today, and the tools to run it.",
  top: () => {
    const main = savedPlaceHere();
    // The places-only export is covered by "Back up everything" below.
    const list = myPlaces.listBody().filter((n) => !(n instanceof HTMLElement && n.classList.contains("mp-foot")));
    // Nothing saved yet: one card with every way in (address, this spot, where I am, a demo).
    if (!main) return [
      h("div", { class: "today-card first" },
        h("div", { class: "today-head" }, h("strong", {}, "Start with your place")),
        h("p", { class: "small" }, "Save your home, farm or business for a daily brief there: frost, storms, and what's due."),
        addressBox(),
        ...list,
        h("button", { class: "pill-btn", onclick: () => { loadDemo(myStore); openMode("place"); app.toast("Hillside Farm is a demo: sheep, cattle, hens and three fields. Remove it any time from the bottom of My Place.", 7000); } }, "Or try a demo farm")),
      h("h2", { class: "group-title" }, "Run your place"),
    ];
    return [
      todayCard(main, openBriefItem),
      logBox(),
      h("h2", { class: "group-title" }, "Your places"),
      ...list,
      h("h2", { class: "group-title" }, "Run your place"),
    ];
  },
  bottom: () => [
    backupRow((m) => app.toast(m, 5000)),
    hasDemo(myStore) ? h("button", { class: "link-btn danger", onclick: () => { removeDemo(myStore); myScene.clear(); app.canvas.drop("myplace"); openMode("place"); app.toast("Demo farm removed.", 3000); } }, "Remove the demo farm") : "",
  ],
});
keepStorage();
// A save the browser refused (storage full): say so once per visit, with what to do, instead of losing work silently.
{
  let warned = 0;
  addEventListener(STORAGE_FULL, () => {
    if (Date.now() - warned < 120_000) return;
    warned = Date.now();
    app.toast("Storage on this device is full, so your latest changes aren't saved. Back up in My Place › Your data and remove what you don't need.", 12_000);
  });
}
const makeHub = createWork(app, MAKE_TOOLS, {
  title: "Create",
  intro: "Make something from the map: a trip, a story, a video or a lesson.",
});
/** Work: every pro tool as a station on its industry's line (the Work map). */
const openStation = (st: Station) => {
  const ctx = workHub.ctx;
  // A view of the world (a theme) or a live layer: the panel steps aside so the map can show it.
  if (st.tool.startsWith("theme:")) { const [theme, sub] = st.tool.slice(6).split("/"); openMode("look"); app.setTheme(theme, sub); return; }
  if (st.tool.startsWith("action:")) { ctx.close(); app.actions.get(st.tool.slice(7))?.run(); return; }
  if (st.tool.startsWith("ent:")) {
    const which = st.tool.slice(4);
    void (which === "edu" ? import("./pro/edu/ui").then((m) => m.openEducation(ctx, app))
      : which.startsWith("con") ? import("./pro/con/ui").then((m) => m.openConstruction(ctx, app, which.split(":")[1]))
      : import("./pro/gov/ui").then((m) => m.openCityOps(ctx, app, which.split(":")[1])));
    return;
  }
  if (st.tool.startsWith("view:")) {
    const which = st.tool.slice(5);
    void (which === "matchday" ? import("./fieldviews/matchdayUi").then((m) => m.openMatchday(ctx, app))
      : which === "soil" ? import("./fieldviews/soilUi").then((m) => m.openSoil(ctx, app))
      : which === "sun" ? import("./fieldviews/sunUi").then((m) => m.openSun(ctx, app))
      : which === "crowd" ? import("./fieldviews/crowdUi").then((m) => m.openCrowd(ctx, app))
      : import("./fieldviews/siteUi").then((m) => m.openSite(ctx, app)));
    return;
  }
  if (st.tool.startsWith("econ:")) {
    const which = st.tool.slice(5);
    void import(which === "desk" ? "./econ/deskUi" : which === "portfolio" ? "./econ/portfolioUi" : "./econ/labUi").then((m) =>
      "openDesk" in m ? m.openDesk(ctx, app) : "openPortfolio" in m ? m.openPortfolio(ctx, app) : m.openLab(ctx, app));
    return;
  }
  if (st.tool.startsWith("explore:")) { void import("./work/scout").then((m) => m.openExplore(ctx, st.tool.slice(8))); return; }
  if (st.tool.startsWith("source:")) { void import("./work/sourcingUi").then((m) => m.openSourcing(ctx, st.tool.slice(7))); return; }
  if (st.tool.startsWith("scout:")) { void import("./work/scout").then((m) => m.openScout(ctx, st.tool.slice(6))); return; }
  if (st.tool.startsWith("fin:") || st.tool.startsWith("bank:")) {
    void import("./finance/ui").then((m) => ({ "fin:markets": () => m.openMarkets(ctx, app), "fin:company": () => m.openCompany(ctx, app), "fin:watch": () => m.openWatchlist(ctx, app),
      "bank:near": () => m.openBanksNear(ctx, app), "bank:company": () => m.openCompany(ctx, app, "bank"), "bank:coverage": () => m.openCoverage(ctx, app) } as Record<string, () => void>)[st.tool]?.());
    return;
  }
  if (st.tool.startsWith("social:")) { void import("./pro/social/ui").then((m) => (st.tool === "social:find" ? m.openFindSupport(ctx, app) : m.openSocialPro(ctx, app))); return; }
  if (st.tool.startsWith("services:")) { void import("./pro/services/ui").then((m) => m.openServices(ctx, st.tool.slice(9) as Parameters<typeof m.openServices>[1])); return; }
  const t = [...WORK_TOOLS, ...PLACE_TOOLS].find((x) => x.id === st.tool);
  if (t) t.open(ctx);
  else app.actions.get(`work:${st.tool}`)?.run(); // Create and Explore tools (Teach, Learn) open in their own hub
};
const workHub = createWork(app, [], {
  title: "Work",
  intro: "",
  // The line map loads with Work, the first time it opens.
  top: () => [deferred(() => import("./work/workMap").then((m) => m.workMap(openStation)), () => app.toast("Couldn't load Work. Check the connection and try again.", 5000))],
});
const lookHub = createWork(app, LOOK_TOOLS, {
  title: "Explore more",
  intro: "The world right now, questions for the map, the seasons, games and space.",
});

const myPlaces = createMyPlaces(app, myStore, myScene, {
  onPro: (id) => { myPlaces.close(); pro.open(id); },
  home: () => openMode("place"),
  onShow: () => closePanels(myPlaces.panel),
});
$("ui").append(myPlaces.panel);
// Terreno Pro: live operations (bookings from a CRM or booking system) for a saved building.
// Live occupancy, loaded the first time it opens.
const proPanel = later(() => import("./pro/panel").then((m) => m.createPro(app, myStore, myScene, (id) => { myPlaces.open(id); myPlaces.close(); })), (p) => {
  $("ui").append(p.panel);
  watcher.observe(p.panel, { attributes: true, attributeFilter: ["hidden"] });
});
const pro = { open: (id: string) => void proPanel.get().then((p) => p.open(id)), close: () => proPanel.now?.close() };

const hologram = myPlaceHologram({ app, store: myStore, placeHub, myPlaces, placeTools: PLACE_TOOLS, closePanels, savedPlaceHere });
const closeHolo = hologram.close;
app.actions.set("myplace:boot", { label: "Open My Place as a hologram", run: (id) => void hologram.boot(id || undefined) });
// Any place on Earth as a hologram: the size follows what it is (a building, a town, a mountain).
app.actions.set("space:boot", { label: "See it as a hologram", run: () => {
  const p = app.place;
  if (!p) return;
  const kind = String((p.feature as { world?: { kind?: string } } | undefined)?.world?.kind ?? "");
  const size = /peak|volcano|range|glacier|island|water|lake/.test(kind) ? 2400 : /city|capital/.test(kind) ? 1600 : 700;
  closePanels();
  void openSpace(app, { name: p.name?.title ?? "This spot", kicker: [p.name?.context, `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`].filter(Boolean).join(" · "), lon: p.lon, lat: p.lat, size, own: true, tint: "violet" });
} });
// Space: satellites, the ISS, launches and the solar system, loaded the first time it opens.
const spacePanel = later(() => import("./space/panel").then((m) => m.createSpace(app)), (s) => {
  $("ui").append(s.panel);
  watcher.observe(s.panel, { attributes: true, attributeFilter: ["hidden"] });
  s.button.addEventListener("space:opened", () => closePanels(s.panel));
});
const space = {
  open: () => void spacePanel.get().then((s) => s.open()),
  close: () => spacePanel.now?.close(),
  toSolar: () => void spacePanel.get().then((s) => s.toSolar()),
};
app.addTheme(spaceTheme(space));
// Topics (Money & trade, Sports, Fashion, Food, Arts & music) live under "More" on the theme bar.
for (const t of topicThemes()) app.addTheme(t);
$("ui").append(placeHub.panel, makeHub.panel, workHub.panel, lookHub.panel);
for (const hub of [placeHub, makeHub, workHub, lookHub]) hub.button.addEventListener("work:opened", () => closePanels(hub.panel));
app.actions.set("space:open", { label: "Space", run: () => space.open() });
app.actions.set("news:open", { label: "World now: the news", run: () => { lookHub.ctx.open(); openWorldNow(lookHub.ctx); } });
app.actions.set("space:solar", { label: "Solar system", run: () => space.toSolar() });
app.actions.set("work:ndvi", { label: "Plant health (NDVI)", run: () => void grow.get().then((m) => m.ndviAction(app).run()), isOn: () => grow.now?.ndviAction(app).isOn() ?? false });

/** Closes every mode panel except one. */
function closePanels(keep?: HTMLElement) {
  if (keep !== placeHub.panel) placeHub.ctx.close();
  if (keep !== makeHub.panel) makeHub.ctx.close();
  if (keep !== workHub.panel) workHub.ctx.close();
  if (keep !== lookHub.panel) lookHub.ctx.close();
  if (keep !== myPlaces.panel) myPlaces.close();
  if (keep !== proPanel.now?.panel) pro.close();
  if (keep !== spacePanel.now?.panel) space.close();
  toggleLayers(false);
  hideSocial();
}
/** Profile pages and Lens Studio step aside when another panel opens (set up once they exist). */
let hideSocial = () => {};
type Mode = "place" | "look" | "make" | "work";
function openMode(m: Mode) {
  const holo = hologram.current;
  if (m !== "place") closeHolo();
  if (m === "look") { closePanels(); return; }
  // My Place: boot the place as a model (or bring the puck back); with nothing saved, the first-run card.
  if (m === "place" && myStore.all().length) {
    if (holo?.el.classList.contains("mini")) { closePanels(); holo.restore(); return; }
    if (!holo) { void hologram.boot(); return; }
  }
  const hub = m === "place" ? placeHub : m === "work" ? workHub : makeHub;
  // Tapping the current mode again goes back to its home screen.
  hub.ctx.open();
  hub.ctx.home();
  // My Place takes you to your place when you're looking at somewhere far away.
  const main = m === "place" ? savedPlaceHere() : undefined;
  if (main) {
    const cam = globe.viewer.camera.positionCartographic;
    const far = cam.height > 60_000 || Math.hypot(CesiumMath.toDegrees(cam.longitude) - main.lon, CesiumMath.toDegrees(cam.latitude) - main.lat) > 1;
    if (far) void flyToPlace(globe, { name: main.name, lon: main.lon, lat: main.lat, radius: 1500 });
  }
}
app.actions.set("mode:place", { label: "My Place", run: () => openMode("place") });
app.actions.set("mode:make", { label: "Create", run: () => openMode("make") });
app.actions.set("mode:work", { label: "Work", run: () => openMode("work") });
app.actions.set("myplace:report", {
  label: "About your place",
  run: () => {
    const p = savedPlaceHere();
    if (!p) { openMode("place"); app.toast("Save your place first: the report and sowing calendar come from its own weather.", 6000); return; }
    myPlaces.open(p.id);
    setTimeout(() => myPlaces.panel.querySelector(".report, .deferred")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  },
});
// Pulse: everything you have, alive on the planet, with time and what-ifs.
const openPulse = () => { closePanels(); closeHolo(); void import("./pulse/ui").then((m) => m.openPulse(app)); };
app.actions.set("pulse:open", { label: "Pulse: your world, live", run: openPulse });
// The page follows whichever panel is showing.
const syncPanels = () => {
  const shown = (el: HTMLElement) => !el.hidden;
  // Everything closed while your place was a puck: it comes back.
  const holo = hologram.current;
  if (holo?.el.classList.contains("mini") && ![placeHub.panel, myPlaces.panel].some(shown)) holo.restore();
  // Phones have room for one panel: the place card steps aside while a mode panel is open.
  document.body.dataset.panel = [placeHub.panel, myPlaces.panel, proPanel.now?.panel, makeHub.panel, workHub.panel, lookHub.panel, spacePanel.now?.panel].some((el) => el && shown(el)) ? "open" : "";
  // Working in My Place or Make: the empty Explore card steps aside so the mode has the screen.
  document.body.dataset.work = [placeHub.panel, myPlaces.panel, proPanel.now?.panel, makeHub.panel, workHub.panel].some((el) => el && shown(el)) ? "1" : "";
};
const watcher = new MutationObserver(syncPanels);
for (const el of [placeHub.panel, myPlaces.panel, makeHub.panel, workHub.panel, lookHub.panel]) watcher.observe(el, { attributes: true, attributeFilter: ["hidden"] });

const HUB_OF: Record<string, { hub: typeof placeHub; open: (ctx: WorkCtx) => void }> = {};
for (const [hub, tools] of [[placeHub, PLACE_TOOLS], [makeHub, MAKE_TOOLS], [workHub, WORK_TOOLS], [lookHub, LOOK_TOOLS]] as const)
  for (const t of tools) if (t.id !== "occupancy" && t.id !== "space" && t.id !== "year") HUB_OF[t.id] = { hub, open: t.open };
for (const [t, { hub, open }] of Object.entries(HUB_OF))
  app.actions.set(`work:${t}`, { label: `${hub === placeHub ? "My Place" : hub === makeHub ? "Create" : hub === workHub ? "Work" : "Explore"} › ${t}`, run: () => { hub.ctx.open(); open(hub.ctx); } });
// Place pages: #/p/nile (or /p/nile/, which forwards here) opens the Nile's page.
const openPlace = async (slug: string, theme?: string) => {
  const r = await resolvePlace(slug).catch(() => null);
  if (!r) { app.toast("Couldn't find that place. The link may be out of date.", 5000); return; }
  app.setTheme(theme && app.themes.some((t) => t.id === theme) ? theme : "explore");
  app.select({ lon: r.lon, lat: r.lat, height: 0 }, r.name ? { title: r.name, context: r.context } : undefined, r.feature);
  if (app.place) app.place.slug = r.slug;
  // Arrive: the camera comes in at an angle, the name is set over the map with the one fact worth knowing.
  const what = r.what ?? KIND_WORDS[r.kind] ?? "";
  const kicker = [what && what.charAt(0).toUpperCase() + what.slice(1), r.context && !r.context.includes(":") ? r.context : ""].filter(Boolean).join(" · ");
  withIntro(r.name, r.lon, r.lat, (ip) => void arrive(app, {
    name: r.name || "This spot", kicker, lon: r.lon, lat: r.lat, radius: r.radius,
    fact: ip ? ip.lines[0] : r.blurb ? firstSentence(r.blurb) : measureAt(r.lon, r.lat).then((m) => headline(m.v, r.kind)),
  }));
};
const KIND_WORDS: Partial<Record<string, string>> = {
  city: "town or city", capital: "capital city", water: "lake or water", sea: "sea", island: "island", peak: "mountain", range: "mountain range",
  desert: "desert", region: "region", continent: "continent", glacier: "glacier", nature: "natural feature", park: "park", waterfall: "waterfall", volcano: "volcano",
};
app.actions.set("rhythms:year", { label: "The year breathes", run: () => void import("./delight/year").then((m) => m.yearBreathes(app)) });
app.actions.set("tour", { label: "Take the tour", run: () => void import("./delight/tour").then((m) => m.startTour(app)) });
app.actions.set("surprise", { label: "Show me something amazing", run: () => void import("./delight/surprise").then((m) => m.surprise(app)) });
app.actions.set("place:open", { label: "Open a place's page", run: (slug) => { if (slug) void openPlace(slug); } });
app.actions.set("place:save", { label: "Save this place", run: () => {
  const p = app.place;
  if (!p) return;
  myPlaces.add(p.lon, p.lat, p.name?.title);
} });
const placeHash = () => {
  const m = /^#\/p\/([^/]+)(?:\/([a-z]+))?$/.exec(location.hash);
  if (m && decodeURIComponent(m[1]) !== app.place?.slug) void openPlace(decodeURIComponent(m[1]), m[2]);
};
addEventListener("hashchange", placeHash);
// A student opening a quiz link from their teacher.
const quizLink = /^#quiz=([\w-]+)/.exec(startHash);
if (quizLink) void import("./work/quiz").then((m) => m.openQuizLink(app, quizLink[1]));
app.actions.set("story:open", { label: "Open a story", run: (id) => { if (id) void import("./stories/ui").then((m) => { makeHub.ctx.open(); void m.openStory(makeHub.ctx, id); }); } });
// A story someone shared: from the library (#story=…) or carried in the link (#s=…).
const openStoryHash = () => {
  const hash = location.hash;
  if (/^#(story|s)=/.test(hash)) void import("./stories/ui").then((m) => { closePanels(makeHub.panel); void m.openFromHash(makeHub.ctx, hash); });
};
openStoryHash();
// Pasting a story link into a tab that already has Terreno open.
addEventListener("hashchange", openStoryHash);
for (const y of YEARS)
  app.actions.set(`work:borders:${y}`, { label: `Borders in ${yearLabel(y)}`, run: () => void present.get().then((m) => m.showYear(app, y)).catch(() => app.toast("Couldn't load the historical borders. Check the connection.", 5000)), isOn: () => present.now?.borders(app).year === y });

app.actions.set("pro:occupancy", {
  label: "Live occupancy",
  run: () => {
    const p = savedPlaceHere();
    if (p) pro.open(p.id);
    else { app.toast("Save the building in My Place first, then connect its bookings.", 6000); openMode("place"); }
  },
});

// The task robot: plain-language requests typed into the search box.
const aiSettings = createAiSettings();
$("ui").append(aiSettings.panel);
const robot = createRobot(app, {
  async find(text) {
    const mine = myStore.find(text);
    if (mine) return { name: mine.name, detail: mine.address ?? "", lon: mine.lon, lat: mine.lat, radius: 150 };
    const local = search.siteMatches(text)[0] ?? searchLocal(feeds, text).find((m) => m.name.toLowerCase() === text.toLowerCase());
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
}, {
  showBorders: async (y) => { await (await present.get()).showYear(app, y); },
  openTool: (t) => {
    if (t === "space") space.open();
    else if (t === "myplace") openMode("place");
    else if (t === "solar") space.toSolar();
    else app.actions.get(`work:${t}`)?.run();
  },
  settings: () => aiSettings.open(),
  brief: async () => {
    const main = savedPlaceHere();
    if (!main) return "";
    const items = await briefFor(main);
    return `Today at ${main.name}:\n${items.map((x) => `- [${x.urgency}] ${x.title}. ${x.detail}`).join("\n") || "- Nothing pressing."}`;
  },
  logLine: async (line) => { const plan = planLog(line); return plan ? plan.run() : null; },
});
$("ui").append(robot.el);
const search = wireSearch({ app, feeds, overlays, robot, closePanels, makeHub, lookHub, openPlace, pick, goToYear: (y) => timeBar.goToYear(y), things: allThings });

// Layers any theme can add to the map by name (Built registers its networks itself).
for (const o of OVERLAYS) if (o.id !== "labels") app.actions.set(`overlay:${o.id}`, { label: o.label, run: () => void overlays.set(o.id, true), isOn: () => overlays.isOn(o.id), stop: () => void overlays.set(o.id, false) });
for (const k of ["geology", "elevation", "slope", "contours"] as const)
  app.actions.set(`globe:${k}`, { label: k, run: () => { globe.state.overlays[k].on = true; globe.apply(); }, isOn: () => globe.state.overlays[k].on, stop: () => { globe.state.overlays[k].on = false; globe.apply(); } });

// Under every view of a place: where to go next, keeping what's on the map.
app.connections = connections(app);

// From joining: home becomes a My Place, and the Earth flies there.
document.addEventListener("atlas:home", (e) => {
  const { name, lon, lat } = (e as CustomEvent<{ name: string; lon: number; lat: number }>).detail;
  const existing = myStore.all().find((p) => p.kind === "home");
  myStore.save(existing ? { ...existing, name: existing.name || name, lon, lat } : { ...blankPlace(name, lon, lat, "home"), name: "Home", address: name });
  void flyToPlace(globe, { name, lon, lat, radius: 1500 });
});
// Escape always leads back to the Earth: it closes whatever is over the globe, top layer first.
addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  const card = document.querySelector<HTMLElement>(".card-sheet");
  if (card) { card.remove(); return; }
  if (document.querySelector(".block-view")) { app.actions.get("lens:close")?.run(); return; }
  if (activeSpace()) { closeHolo(); return; }
});

// Messages from parts of Terreno that don't hold the app (sign-in, deleting an account).
document.addEventListener("atlas:toast", (e) => app.toast(String((e as CustomEvent<string>).detail), 5000));

// Zoom buttons, a compass and double-click zoom.
const mapControls = createMapControls(globe.viewer);
$("ui").append(mapControls);

// The wayfinder: the compass ribbon, what you're passing, where you seem to be going, and Guide (GPS).
const wayfinder = installWayfinder(app, $("ui"));
mapControls.prepend(wayfinder.guideButton);
// Phone and TV: a phone that has driven a TV in the last half day can hand it whatever place is open here.
const pairedTv = (): string | null => { try { const v = JSON.parse(localStorage.getItem("atlas.tv.code") ?? "null") as { code: string; at: number } | null; return v && Date.now() - v.at < 12 * 3_600_000 ? v.code : null; } catch { return null; } };
app.actions.set("tv:show", { label: "Show on the TV", isOn: () => !!pairedTv(), run: () => {
  const p = app.place, code = pairedTv();
  if (!p || !code) return;
  void import("./tv/link").then((m) => { m.send(code, "cmd", { t: "goto", lon: p.lon, lat: p.lat, title: p.name?.title ?? "A place on Earth", sub: p.name?.context }); app.toast("On the TV now.", 2500); });
} });
// Web to phone: the view you're looking at, as a code your phone's camera opens (and Guide can take you there).
app.actions.set("handoff:phone", { label: "Continue on your phone", run: () => void import("./ui/qr").then(({ qrSvg }) => {
  document.querySelector(".handoff")?.remove();
  const link = app.shareLink?.() ?? location.href;
  const close = () => box.remove();
  const box = h("div", { class: "handoff reg", role: "dialog", "aria-label": "Continue on your phone" },
    h("div", { class: "handoff-qr", html: qrSvg(link) }),
    h("div", { class: "handoff-text" }, h("strong", {}, "Continue on your phone"), h("p", {}, "Point your phone's camera at the code. The same view opens there; tap Guide me to be taken to it."),
      h("button", { class: "pill-btn", onclick: close }, "Done")));
  $("ui").append(box);
  addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") close(); }, { once: true });
}) });
app.actions.set("wayfind:guide", { label: "Guide me there", run: () => { const p = app.place; if (p) wayfinder.guideTo({ id: `place:${p.lon},${p.lat}`, name: p.name?.title ?? "there", lon: p.lon, lat: p.lat, why: "poi", weight: 1 }); } });

// Everything on the map as bubbles at the edge of the globe; + adds a view without leaving it.
$("ui").append(createViewStack(app, allThings));

// Live traffic: planes and ships moving on the globe, loaded the first time either is switched on.
const traffic = later(() => import("./live/tracks").then((m) => m.createTraffic(app)));
// The living city: buildings, trees, and simulated cars and people on the real streets, once zoomed in.
const cityLife = createCityLife(app);
app.actions.set("city:life", { label: "Living city (3D, simulated movement)", run: () => cityLife.set(true), isOn: () => cityLife.isOn(), stop: () => cityLife.set(false) });
// 3D by default: coming down into a place, the camera tilts toward the horizon once (unless you've tilted it yourself).
{
  let tilted = false;
  const cam = globe.viewer.camera;
  cam.moveEnd.addEventListener(() => {
    // Not while you're drawing on the map, or looking straight down to trace something.
    if (hologram.holdTilt || app.interacting) return;
    const hgt = cam.positionCartographic.height;
    if (hgt > 30_000) { tilted = false; return; }
    if (tilted || hgt > 6000 || CesiumMath.toDegrees(cam.pitch) > -75) { if (CesiumMath.toDegrees(cam.pitch) > -75) tilted = true; return; }
    tilted = true;
    const c = globe.viewer.canvas, ray = cam.getPickRay(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
    const target = ray ? globe.viewer.scene.globe.pick(ray, globe.viewer.scene) : undefined;
    if (!target) return;
    const range = Cartesian3.distance(cam.positionWC, target);
    cam.flyToBoundingSphere(new BoundingSphere(target, 1), { offset: new HeadingPitchRange(cam.heading, CesiumMath.toRadians(-40), range * 1.05), duration: 1.4 });
  });
}
for (const kind of ["plane", "ship"] as const)
  app.actions.set(`live:${kind}s`, { label: kind === "plane" ? "Live planes" : "Live ships", run: () => void traffic.get().then((t) => t.set(kind, true)), isOn: () => traffic.now?.isOn(kind) ?? false, stop: () => traffic.now?.set(kind, false) });
// A shared flight or ship (#follow=p:a1b2c3@lon,lat): open Terreno following it.
const followHash = () => {
  const m = /^#follow=([ps]:[\w-]+)@(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  if (m) setTimeout(() => void traffic.get().then((t) => t.openShared(m[1], Number(m[2]), Number(m[3]))), 2500);
};
followHash();
addEventListener("hashchange", followHash);
let layers = createLayersPanel(globe);
$("ui").append(layers);
const toggleLayers = (open = layers.hidden) => {
  if (open) {
    // Rebuilt on open so it matches the canvas (layers can be removed from the tray).
    const fresh = createLayersPanel(globe);
    layers.replaceWith(fresh);
    layers = fresh;
  }
  layers.hidden = !open;
};

// Analysis layers from the Layers popover (and elsewhere) live on the shared canvas too.
globeLayersOnCanvas(app);
const openLayers = () => { const open = layers.hidden; for (const c of [placeHub.ctx, makeHub.ctx, lookHub.ctx]) c.close(); myPlaces.close(); pro.close(); space.close(); toggleLayers(open); };
globe.viewer.scene.canvas.addEventListener("pointerdown", () => toggleLayers(false));
addEventListener("atlas:add-view", () => toggleLayers(false));

// Time: one slider from the ancient world to 2100 (borders of the time, the view from space, projections).
const timeBar = new TimeBar(app);
$("ui").append(timeBar.el);

app.actions.set("time:open", { label: "Time travel", run: () => timeBar.open() });
// "1914", or "1914@lon,lat" to light up whoever governed that place.
app.actions.set("time:close", { label: "Back to today", run: () => timeBar.close() });
app.actions.set("time:go", { label: "Go to a year", run: (arg) => {
  const m = /^(-?\d+)(?:@(-?[\d.]+),(-?[\d.]+))?$/.exec(arg ?? "");
  if (m) timeBar.goToYear(Number(m[1]), m[2] ? [Number(m[2]), Number(m[3])] : undefined);
} });

// Terreno on a TV: TV mode plays by itself and a phone is the remote (src/tv). A link to #/tv/CODE opens it.
// #/tv/CODE/@lat,lon/Name opens the TV on that place (sent from the app with a place open).
const tvLink = /^#\/tv(?:\/([A-Za-z0-9]{6}))?(?:\/@(-?[\d.]+),(-?[\d.]+)(?:\/(.+))?)?$/.exec(startHash);
// The economy views from anywhere (search, the Minerals theme, the robot): the commodity desk (optionally on one material), your portfolio, the What if lab.
for (const [id, label, load] of [
  ["econ:desk", "Commodity desk", (arg?: string) => void import("./econ/deskUi").then((m) => m.openDesk(workHub.ctx, app, arg || undefined))],
  ["econ:portfolio", "My portfolio", () => void import("./econ/portfolioUi").then((m) => m.openPortfolio(workHub.ctx, app))],
  ["econ:lab", "What if lab", () => void import("./econ/labUi").then((m) => m.openLab(makeHub.ctx, app))],
  ["view:matchday", "Matchday sun and shade", () => void import("./fieldviews/matchdayUi").then((m) => m.openMatchday(workHub.ctx, app))],
  ["view:soil", "Soil profile", () => void import("./fieldviews/soilUi").then((m) => m.openSoil(workHub.ctx, app))],
  ["view:site", "Site potential", () => void import("./fieldviews/siteUi").then((m) => m.openSite(workHub.ctx, app))],
  ["ent:edu", "Education Pro", () => void import("./pro/edu/ui").then((m) => m.openEducation(workHub.ctx, app))],
  ["ent:con", "Construction Pro", (arg?: string) => void import("./pro/con/ui").then((m) => m.openConstruction(workHub.ctx, app, arg || undefined))],
  ["ent:gov", "City Ops", (arg?: string) => void import("./pro/gov/ui").then((m) => m.openCityOps(workHub.ctx, app, arg || undefined))],
  ["view:sun", "Sun on a building", () => void import("./fieldviews/sunUi").then((m) => m.openSun(workHub.ctx, app))],
  ["view:crowd", "Crowd flow", () => void import("./fieldviews/crowdUi").then((m) => m.openCrowd(workHub.ctx, app))],
] as const)
  app.actions.set(id, { label, run: (arg) => { const hub = id === "econ:lab" ? makeHub : workHub; closePanels(hub.panel); hub.ctx.open(); load(arg); } });
app.actions.set("tv:mode", { label: "TV mode", run: (code) => void import("./tv/tv").then((m) => { closePanels(); m.enterTv(app, code || undefined); }) });
app.actions.set("tv:cast", { label: "Show Terreno on a TV", run: () => void import("./tv/tv").then((m) => m.openCast(app)) });
if (tvLink) setTimeout(() => void import("./tv/tv").then((m) => {
  const [, code, lat, lon, name] = tvLink;
  closePanels();
  m.enterTv(app, code?.toUpperCase(), lat && lon ? { name: name ? decodeURIComponent(name) : "Here", sub: "", lon: Number(lon), lat: Number(lat), radius: 6000 } : undefined);
}), 2600);
// About, and the band across the top that carries the mark and the name (it opens About).
const about = createAbout(() => aiSettings.open());
{
  // The map sits under the band as a big rounded bubble; one tap opens it to the whole screen and back.
  const FULL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const SMALL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const expand = document.createElement("button");
  expand.className = "map-expand";
  const paint = () => {
    const open = document.body.classList.contains("map-open");
    expand.innerHTML = open ? SMALL : FULL;
    expand.setAttribute("aria-label", open ? "Back to the bubble" : "Open the map to the whole screen");
    expand.setAttribute("aria-pressed", String(open));
  };
  expand.addEventListener("click", () => { document.body.classList.toggle("map-open"); paint(); app.globe.viewer.scene.requestRender(); });
  paint();
  const band = document.createElement("header");
  band.className = "app-band";
  band.append(about.mark);
  document.body.insertBefore(band, $("ui"));
  $("ui").append(expand);
}
$("ui").append(about.panel);

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
const stateHash = () => app.place?.slug && !app.place.slug.startsWith("@")
  ? `#/p/${app.place.slug}${app.theme?.id !== "explore" ? `/${app.theme.id}` : ""}`
  : formatHash({ place: app.place ?? undefined, theme: app.theme?.id !== "explore" ? app.theme?.id : undefined, camera: cameraState() });
app.shareLink = () => `${location.origin}${location.pathname}${stateHash()}`;
let hashTimer = 0;
const syncHash = () => {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    try {
      const next = stateHash();
      // On a place's own page, its address is already the URL.
      if (pageSlug && next === `#/p/${pageSlug}`) history.replaceState(null, "", location.pathname);
      else history.replaceState(null, "", next || location.pathname);
    } catch {
      /* some embedded viewers forbid history changes */
    }
  }, 400);
};
// Lenses: ways of looking at whatever was tapped, offered in the place card.
const lenses = createLenses(app, LENSES);
app.actions.set("lens:close", { label: "Close the lens", run: () => lenses.close() });
app.actions.set("place:clear", { label: "Close the place", run: () => app.clearPlace() });
app.sheet.el.querySelector(".share-menu")!.after(lenses.strip);
$("ui").append(lenses.panel);
app.onName = (p) => lenses.rename(p);
for (const l of LENSES) app.actions.set(`lens:${l.id}`, { label: l.label, run: () => void lenses.openWhenReady(l.id).then((ok) => { if (!ok) app.toast("Tap a place first, then choose a lens.", 4000); }) });

// People: accounts, pages about the places people love, and lenses anyone can make.
const social = wireSocial(app, {
  lensList: LENSES,
  lenses,
  openPlace: (slug) => openPlace(slug),
  closePanels: () => closePanels(),
  extras: () => [
    { label: "My Place", icon: icons.home, run: () => openMode("place"), art: "home" },
    { label: `Watching${social ? ` (${social.watch.count()})` : ""}`, icon: iconSvg("🔔", 18) ?? icons.sparkle, run: () => app.actions.get("watch:open")?.run(), art: "bell" },
    { label: "Take the tour", icon: icons.compass, run: () => startTour(app), art: "flag" },
    { label: aiOn() ? "Terreno AI: connected" : "Connect Terreno AI", icon: icons.sparkle, run: () => aiSettings.open() },
    { label: "Send feedback", icon: icons.pencil, run: () => void import("./ui/feedback").then((m) => m.openFeedback(app)) },
    { label: "About Terreno and its data", icon: icons.info, run: about.open },
    about.soundRow,
  ],
});
$("ui").append(social.account.menu);
// The frame: the dock along the bottom (Search, Navigate, Me, ＋). Everything else waits behind ＋.
{
  const TV_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5V6.8A1.8 1.8 0 0 1 4.8 5h14.4A1.8 1.8 0 0 1 21 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H14"/><path d="M3 19.5h.01M3 13a6.5 6.5 0 0 1 6.5 6.5M3 16a3.5 3.5 0 0 1 3.5 3.5"/></svg>';
  const chrome = createChrome(app, {
    search: document.querySelector<HTMLElement>(".topbar .search")!,
    me: social.account.button,
    primary: [
      { label: "Explore", sub: "The world now, games, space", icon: icons.compass, color: "#3563d6", run: () => { closePanels(lookHub.panel); lookHub.ctx.open(); lookHub.ctx.home(); } },
      { label: "Create", sub: "Trips, stories, videos, lessons", icon: icons.pencil, color: "#8b5fa8", run: () => openMode("make") },
      { label: "Work", sub: "Tools for your field", icon: icons.briefcase, color: "#d19a2e", run: () => openMode("work") },
    ],
    tools: [
      { label: "Pulse", sub: "Your world, live", icon: icons.activity, run: openPulse },
      { label: "Time", sub: "The globe in another year", icon: iconSvg("⏳", 20) ?? icons.clock, run: () => (timeBar.el.hidden ? timeBar.open() : timeBar.close()) },
      { label: "Map style and layers", sub: "Satellite, terrain, overlays", icon: icons.layers, run: openLayers },
      { label: "Add a view", sub: "Keep a layer on the map", icon: icons.eye, run: () => dispatchEvent(new Event("atlas:add-view")) },
      { label: "On a TV", sub: "Cast to a screen", icon: TV_ICON, run: () => app.actions.get("tv:cast")?.run() },
      { label: "My Place", sub: "Home, farm or business", icon: icons.home, run: () => openMode("place") },
      { label: "Lenses", sub: "Yours, and making one", icon: icons.sparkle, run: () => app.actions.get("lens:studio")?.run() },
    ],
  });
  // The dock: big, at the bottom, the one place to start from.
  $("ui").append(chrome.stage, chrome.dock, chrome.navPanel);
  app.actions.set("nav:open", { label: "Navigate", run: () => chrome.openNavigate() });
  app.actions.set("search:open", { label: "Search", run: () => chrome.openSearch(true) });
}
hideSocial = () => { if (social.profiles.isOpen) social.profiles.close(); if (social.studio.isOpen) social.studio.close(); };
// A landmark with an intro gets a small chip to play it again.
const introChip = h("button", { class: "lmi-replay", hidden: true });
$("ui").append(introChip);
const syncIntroChip = (p: typeof app.place) => {
  const ip = p ? introFor(p.name?.title, p.lon, p.lat) : null;
  introChip.hidden = !ip;
  if (!ip) return;
  introChip.replaceChildren(h("span", { "aria-hidden": "true" }, "▶"), ` ${ip.name}: the intro`);
  introChip.onclick = () => withIntro(ip.name, ip.lon, ip.lat, (x) => x && arriveAt(x), true);
};
app.actions.set("fin:company", { label: "Company explorer", run: (id) => { closePanels(workHub.panel); workHub.ctx.open(); void import("./finance/ui").then((m) => m.openCompany(workHub.ctx, app, "finance", id || undefined)); } });
app.actions.set("reach:open", { label: "Getting around from here", run: () => { closePanels(placeHub.panel); placeHub.ctx.open(); void import("./travel/reachUi").then((m) => m.openReach(placeHub.ctx, app)); } });
app.actions.set("travel:plan", { label: "Plan a trip", run: (arg) => {
  const o = (() => { try { return JSON.parse(arg ?? "{}") as { to?: { name: string; lon: number; lat: number }; from?: { name: string; lon: number; lat: number }; depart?: string; back?: string; people?: number }; } catch { return {}; } })();
  closePanels(placeHub.panel); placeHub.ctx.open();
  void import("./travel/travelUi").then((m) => m.openTravel(placeHub.ctx, app, o.to, o));
} });
app.actions.set("travel:to", { label: "Travel here", run: () => { const p = app.place; closePanels(placeHub.panel); placeHub.ctx.open(); void import("./travel/travelUi").then((m) => m.openTravel(placeHub.ctx, app, p ? { name: p.name?.title ?? "this spot", lon: p.lon, lat: p.lat } : undefined)); } });
let windOn = () => false;
app.actions.set("wind:toggle", { label: "Wind on the map",
  run: () => void import("./climate/windLayer").then((m) => { const w = m.windLayer(app); windOn = () => w.isOn; app.toast(w.toggle() ? "Wind on: the wind now, over the whole view." : "Wind off.", 3000); }),
  isOn: () => windOn(),
  stop: () => void import("./climate/windLayer").then((m) => m.windLayer(app).toggle(false)) });
app.actions.set("intro:play", { label: "Play this landmark's intro", run: () => { const p = app.place; if (p) withIntro(p.name?.title, p.lon, p.lat, (x) => x && arriveAt(x), true); } });
app.onPlace = (p) => {
  syncIntroChip(p);
  if (p) try { localStorage.setItem("atlas.tapped", "1"); } catch { /* private mode */ }
  // A new place ends the slow circling around the last one.
  stopArriving();
  void lenses.update(p);
  // Its page address, for the link in the URL.
  if (p && !p.slug) void slugOfPlace(p).then((s) => { if (app.place === p) { p.slug = s; syncHash(); } }).catch(() => {});
  // My Place's home lists "Save this spot": keep it in step with the selection.
  if (!placeHub.panel.hidden && placeHub.panel.querySelector(".today-card")) placeHub.ctx.home();
  syncHash();
  myPlaces.refresh();
  // Learn's passport: a stamp for each country explored (once a learner has opened Learn).
  if (p && loadPassport().active)
    void countryAt(p.lon, p.lat).then((c) => {
      if (!c) return;
      const pass = loadPassport();
      const earned = stamp(pass, c.name);
      savePassport(pass);
      if (earned.length) app.toast(`🛂 New passport stamp: ${c.name}`, 3000);
    }).catch(() => {});
};
// Each theme sees the planet its own way (relief, depths, clouds, greenness, night lights…).
const looks = new Looks(globe, $("ui"));
looks.set(app.theme.id);
app.looks = looks;
const myPeople = peopleOnMap(app);
app.onTheme = (id) => { looks.set(id); syncHash(); myPeople.sync(id); document.body.dataset.theme = id; };
document.body.dataset.theme = app.theme.id;
myPeople.sync(app.theme.id);
globe.viewer.camera.moveEnd.addEventListener(syncHash);

cardFollowsMap(app, () => !lenses.panel.hidden, openPlace);

// Opening view: a shared link's view, a place's page, or the map over where you are.
const shared = parseHash(location.hash);
// Opened from a place's own page (p/nile/), or a link to one (#/p/nile).
const pageSlug = (window as { ATLAS_PAGE?: string }).ATLAS_PAGE;
const pageLinked = /^#\/p\//.test(location.hash) || /^#follow=/.test(location.hash) || (!!pageSlug && !location.hash);
// Places by name answer the first keystroke.
setTimeout(warmPlaces, 1500);
document.querySelector(".seo-page")?.remove();
openingView(app, {
  shared, pageLinked, quiet: !!tvLink,
  openLinked: () => { if (/^#\/p\//.test(location.hash)) placeHash(); else if (pageSlug) void openPlace(pageSlug); },
});

// Offline: the app, bundled data and the map tiles you've seen keep working without a connection,
// and a new deploy takes over without breaking an open tab (ui/warm.ts, public/sw.js).
if (import.meta.env.PROD) seamlessDeploys();
// What people open next, fetched while the browser is idle.
warmUp(globe, [() => import("./intros/intro"), () => loadWorldHeritage(), () => import("./answers/ui"), () => import("./work/workMap")]);

// Handy for debugging from the browser console during development, and for automated test runs against a
// real build (?qa). Nothing secret is on it: it's the same app the page already runs.
if (import.meta.env.DEV || new URLSearchParams(location.search).has("qa")) {
  Object.assign(window, { atlas: { app, globe, labels, overlays, feeds, get traffic() { return traffic.now; }, cityLife, cart: (lon: number, lat: number, h: number) => Cartesian3.fromDegrees(lon, lat, h) } });
}
// The whole Cesium namespace only in development: in a build it would defeat tree-shaking and ship all of it.
if (import.meta.env.DEV) void import("cesium").then((Cesium) => Object.assign(window, { Cesium }));
