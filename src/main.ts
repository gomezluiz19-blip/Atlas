import "./styles.css";
import "./brand.css";
import { installEmojiGuard } from "./ui/noEmoji";
import { wordmarkHtml } from "./ui/brand";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { BoundingSphere, Cartesian2, Cartesian3, HeadingPitchRange, Math as CesiumMath, SceneTransforms } from "cesium";
import { createMapControls, homeRegion } from "./globe/controls";
import { installWayfinder } from "./wayfind/ui";
import { qrSvg } from "./ui/qr";
import { Looks } from "./globe/looks";
import { featureChips } from "./explore/featureLayers";
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
import { describe as describeCriterion, looksLikeSearch, parseQuery, type Criterion } from "./answers/criteria";
import { resolvePlace, searchPlaces, slugOfPlace, warmPlaces } from "./place/places";
import { findThings, scoreThing, tokens, type Thing } from "./ui/frontDoor";
import { buildThings } from "./ui/things";
import { TimeBar } from "./time/bar";
import { arrive, stopArriving } from "./delight/arrive";
import { introFor, introForAsync, loadWorldHeritage, shouldPlay, type IntroPlace } from "./intros/places";
import { playIntro } from "./delight/intro";
import { setSound, soundOn } from "./delight/sound";
import { startTour, tourDone } from "./delight/tour";
import { firstSentence, headline } from "./place/headline";
import { measureAt } from "./place/measure";
import { yearName } from "./time/model";
import { iconSvg } from "./ui/glyph";
import { createLayersPanel } from "./ui/layers";
import { createSearch, flyToPlace, freeArea, geocode, type Command, type Place as SearchPlace, type SearchResult } from "./ui/search";
import { createRobot } from "./ui/robotCard";
import { createAiSettings } from "./ui/aiSettings";
import { aiOn, looksLikeAsk } from "./robot/llm";
import { PlaceStore, type MyPlace } from "./myplaces/store";
import type { DockItem } from "./myplaces/holo";
import { packageSummary, readPackages } from "./myplaces/packages";
import { localRecords, type TodayItem } from "./myplaces/today";
import { forecast } from "./data/openmeteo";
import { activeSpace, adopt, closeSpace, openSpace } from "./delight/spaces";
import { PlaceScene } from "./myplaces/scene";
import { createMyPlaces } from "./myplaces/panel";
import { createPro } from "./pro/panel";
import { createWork, type WorkCtx, type WorkTool } from "./work/hub";
import { workMap } from "./work/workMap";
import type { Station } from "./work/workLines";
import { createModeBar, type Mode } from "./ui/modes";
import { briefFor, todayCard } from "./myplaces/todayUi";
import { backupRow, keepStorage } from "./myplaces/backup";
import { STORAGE_FULL } from "./util/storage";
import { hasDemo, loadDemo, removeDemo } from "./myplaces/demo";
import { planLog } from "./myplaces/logAny";
import { describeDrafts, parseSteps } from "./work/journeyModel";
import { createSpace } from "./space/panel";
import { spaceTheme } from "./space/theme";
import { peopleTheme } from "./themes/people";
import { createLenses } from "./lenses/bar";
import { LENSES } from "./lenses";
import { borders, openPresent, showYear } from "./work/present";
import { YEARS, yearLabel } from "./data/history";
import { ndviAction, openGrow } from "./work/grow";
import { loadPassport, savePassport, stamp } from "./work/passport";
import { countryAt } from "./data/countries";
import { plan } from "./robot/plan";
import { describe } from "./robot/run";
import { siteBrowser } from "./ui/sites";
import { createViewStack } from "./ui/viewStack";
import { SITES, sitesFor, type Site } from "./content/sites";
import { MINES } from "./content/minerals";
import { LINKS } from "./content/links";
import { wireSocial } from "./social/wire";
import { watchForProblems } from "./ui/errors";
import { seamlessDeploys, warmUp } from "./ui/warm";
watchForProblems();
import { allProfiles, searchProfiles } from "./social/store";
import { allLenses, myLenses } from "./lenses/library";
import { topicThemes } from "./topics/themes";
import { openWorldNow } from "./live/worldNow";
import { createTraffic } from "./live/tracks";
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
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, named ? { title: p.name, context: p.detail ?? "" } : undefined);
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
app.addTheme(plantsTheme());
app.addTheme(animalsTheme());
app.addTheme(builtTheme(app, overlays, openSite));
app.addTheme(peopleTheme(app));
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

// ---- The three modes: My Places, Explore, Create -------------------------------------------------
// My Places: saved places (home, a farm, a hotel…) with today's brief, 3D, energy, water and
// security, and the tools to run them (Grow, Flock, Build, live occupancy).
// Look: the Earth through themes and lenses (the place card), plus Space and Learn.
// Make: Plan, Present, Video and Teach.
const myStore = new PlaceStore();
const myScene = new PlaceScene(globe.viewer);
const tool = (id: string, label: string, about: string, color: string, icon: string, open: (ctx: WorkCtx) => void): WorkTool => ({ id, label, about, color, icon, open });
const PLACE_TOOLS: WorkTool[] = [
  tool("reach", "Getting around", "Walk, bike or drive: how far you get in 15 minutes, which way wins to the places you go, and what's within a short walk", "#5b9467", icons.route, (ctx) => void import("./travel/reachUi").then((m) => m.openReach(ctx, app))),
  tool("travel", "Travel", "Go somewhere: the way there drawn on the globe, the time change and the weather when you land, stays near what you came for, and where to book", "#3563d6", icons.suitcase, (ctx) => void import("./travel/travelUi").then((m) => m.openTravel(ctx, app))),
  tool("myplans", "My plans", "Everything you've planned across Terreno on one map: the darker the blue, the sooner", "#3563d6", icons.flag, (ctx) => void import("./plans/ui").then((m) => m.openPlans(ctx))),
  tool("packages", "Packages", "What's on the way to you: paste a tracking number or the shipping email", "#8b5fa8", icons.suitcase, (ctx) => void import("./myplaces/packagesUi").then((m) => m.openPackages(ctx))),
  tool("grow", "Grow", "Fields and crops: growth stage, harvest, water and frost", "#5b9467", icons.sprout, openGrow),
  tool("flock", "Flock", "Animals in your care: farms, vets, rescues and adoption", "#8faa5a", icons.paw, openFlock),
  tool("build", "Build", "Model a building on its site and track construction; worksite tools (Pro)", "#d19a2e", icons.crane, openBuild),
];
const WORK_TOOLS: WorkTool[] = [
  tool("buildpro", "Build Pro", "For builders and contractors: every site's schedule and critical path, the weather against the plan, the money as earned value, deliveries, neighbours and permits", "#d19a2e", icons.crane, (ctx) => void import("./pro/build/ui").then((m) => m.openBuildPro(ctx))),
  tool("occupancy", "Live occupancy", "Rooms, floors and bookings from your booking system (Pro)", "#b8496a", icons.building, () => app.actions.get("pro:occupancy")?.run()),
  tool("office", "Politics Pro", "Run a legislative office: the district and its people, casework, events, and the whip count on your bills", "#5160c2", icons.flag, (ctx) => void import("./pro/office/ui").then((m) => m.openOffice(ctx))),
  tool("network", "Business network", "Your sites, suppliers, partners and customers, and the goods, people and money moving between them", "#d19a2e", icons.route, (ctx) => void import("./pro/network/ui").then((m) => m.openNetwork(ctx))),
  tool("sports", "Sports Pro", "Run a club: fixtures and the season's travel, where the fans are, match-day crowds and the players you're scouting", "#b8496a", icons.trophy, (ctx) => void import("./pro/sports/ui").then((m) => m.openSports(ctx))),
  tool("shipping", "Freight Desk", "For freight forwarders, shipping agents and shippers: every shipment on its sea route with its ship, real ETAs against promises, port waits and demurrage, chokepoint what-ifs (Suez, Red Sea, Panama), carbon and the EU ETS bill, and risks on the way", "#3563d6", icons.globe, (ctx) => void import("./pro/shipping/ui").then((m) => m.openShipping(ctx))),
  tool("relief", "Relief Pipeline", "For humanitarian logisticians: port to people. When each place runs out and the last day to send more, roads, rivers and air links cut by rains or incidents, what's on the way, and the fastest, cheapest or ground-only way to move the next load", "#5b9467", icons.route, (ctx) => void import("./pro/relief/ui").then((m) => m.openRelief(ctx))),
  tool("services", "Field Network", "For companies that sell to and service many sites (mining, farm machinery, wind and solar, medical equipment, telecom towers, cranes, sports facilities): site conditions, your equipment and its service, technicians and travel, parts, prospects and risk", "#d19a2e", icons.gem, (ctx) => void import("./pro/services/ui").then((m) => m.openServices(ctx))),
  tool("mining", "Mining Pro", "Run a mine: pit to smelter, what the year is worth, communities and grievances, permits, and who lives downhill of the dam", "#9a7552", icons.pick, (ctx) => void import("./pro/mining/ui").then((m) => m.openMining(ctx))),
  tool("field", "Field Ops", "Run an aid or development programme: who is too far from water, health or school, where one more site helps most, supplies and incidents", "#5b9467", icons.medical, (ctx) => void import("./pro/field/ui").then((m) => m.openField(ctx))),
];
const MAKE_TOOLS: WorkTool[] = [
  tool("plan", "Plan", "Trips told step by step, an event's running order, sites, zones and routes", "#3563d6", icons.route, openPlans),
  tool("present", "Stories", "Tell a story on the globe, publish it, and use or remix others'", "#c9a256", icons.slides, openPresent),
  tool("video", "Video", "A studio: the globe on a monitor, shots, looks, camera moves and narration", "#b8496a", icons.video, openVideo),
  tool("studio3d", "3D Studio", "Put real 3D on the real Earth: Gaussian-splat captures, scans, 3D tiles and models, filmed with drone and crane moves and graded like a film", "#4c9ac9", icons.cube, (ctx) => void import("./render/studio").then((m) => m.openStudio(ctx))),
  tool("teach", "Teach", "Lessons, quizzes, games, a world politics simulation and field trips", "#8b5fa8", icons.graduate, openTeach),
  tool("whatif", "What if…", "Model a shock (a blockade, an export ban, a drought, your own) and watch prices, countries, companies and your portfolio react", "#c4513a", icons.activity, (ctx) => void import("./econ/labUi").then((m) => m.openLab(ctx, app))),
];
const LOOK_TOOLS: WorkTool[] = [
  tool("news", "World now", "The biggest stories, the latest headlines, fires, storms and quakes going on, and what the world is reading", "#b8496a", icons.globe, (ctx) => openWorldNow(ctx)),
  tool("year", "The year breathes", "Spin through the seasons: the sun, polar night and the planet greening week by week", "#5b9467", icons.sprout, (ctx) => { ctx.close(); app.actions.get("rhythms:year")?.run(); }),
  tool("ask", "Ask the map", "Find places that meet many things at once: ground, climate, towns, access, rivers, hazards", "#ffb04a", icons.sparkle, openAsk),
  tool("learn", "Learn", "Games, a daily challenge, your passport, and museums and libraries near you", "#5b9467", icons.book, openLearn),
  tool("space", "Space", "Satellites, the ISS, rocket launches and the solar system", "#5160c2", icons.saturn, () => app.setTheme("space")),
];

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
        h("p", { class: "small" }, "Save your home, farm, site or business and Terreno gives you a daily brief there: frost, heat, storms, and what's due for your animals, fields and projects."),
        addressBox(),
        ...list,
        h("button", { class: "pill-btn", onclick: () => { loadDemo(myStore); openMode("place"); app.toast("Hillside Farm is a demo: sheep, cattle, hens and three fields. Remove it any time from the bottom of My Places.", 7000); } }, "Or try a demo farm")),
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
    app.toast("This browser's storage for Terreno is full, so your latest changes aren't saved here. Back up (My Place › Your data) and remove what you no longer need, or share the workspace with your team to keep it in the cloud.", 12_000);
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
  if (st.tool.startsWith("services:")) { void import("./pro/services/ui").then((m) => m.openServices(ctx, st.tool.slice(9) as Parameters<typeof m.openServices>[1])); return; }
  const t = [...WORK_TOOLS, ...PLACE_TOOLS].find((x) => x.id === st.tool);
  if (t) t.open(ctx);
  else app.actions.get(`work:${st.tool}`)?.run(); // Create and Explore tools (Teach, Learn) open in their own hub
};
const workHub = createWork(app, [], {
  title: "Work",
  intro: "",
  top: () => [workMap(openStation)],
});
const lookHub = createWork(app, LOOK_TOOLS, {
  title: "Explore more",
  intro: "What's happening in the world now, ask the map a question, watch the seasons turn, learn with games, and look up at space.",
});

const myPlaces = createMyPlaces(app, myStore, myScene, {
  onPro: (id) => { myPlaces.close(); pro.open(id); },
  home: () => openMode("place"),
  onShow: () => closePanels(myPlaces.panel),
});
$("ui").append(myPlaces.panel);
// Terreno Pro: live operations (bookings from a CRM or booking system) for a saved building.
const pro = createPro(app, myStore, myScene, (id) => { myPlaces.open(id); myPlaces.close(); });

// ---- My Place, booted: your place as a hologram, with a dock of what you do there -------------------
// The live hologram (your place, or any other place or site) is kept by spaces.ts, one at a time.
let holo: import("./myplaces/holo").Holo | null = null;
const closeHolo = () => { closeSpace(); holo = null; };
function dockFor(place: MyPlace, brief?: TodayItem[]): DockItem[] {
  const rec = localRecords(), pk = packageSummary(readPackages(), new Date().toISOString().slice(0, 10));
  const cams = place.devices.filter((d) => d.type === "camera").length;
  const urgent = brief?.filter((b) => b.urgency !== "fyi").length ?? 0;
  const n = (x: number) => (x ? String(x) : undefined);
  return [
    { id: "today", label: "Today", icon: icons.sun, color: "#e1b843", badge: n(urgent), alert: !!brief?.some((b) => b.urgency === "now") },
    { id: "packages", label: "Packages", icon: icons.suitcase, color: "#8b5fa8", badge: n(pk.coming), alert: pk.today > 0 || pk.problems > 0 },
    { id: "cameras", label: "Cameras", icon: icons.video, color: "#b8496a", badge: n(cams) },
    { id: "events", label: "What's on", icon: icons.music, color: "#d19a2e" },
    { id: "myplans", label: "Plans", icon: icons.flag, color: "#3563d6" },
    { id: "grow", label: "Grow", icon: icons.sprout, color: "#5b9467", badge: n(rec.fields.length) },
    { id: "flock", label: "Flock", icon: icons.paw, color: "#8faa5a", badge: n(rec.flock?.animals.length ?? 0) },
    { id: "build", label: "Build", icon: icons.crane, color: "#d19a2e", badge: n(rec.builds.length) },
    { id: "energy", label: "Energy & water", icon: icons.pylon, color: "#4c9ac9" },
  ];
}
function pickDock(place: MyPlace, id: string) {
  holo?.minimize();
  const ctx = placeHub.ctx;
  const inHub = (f: () => void) => { closePanels(placeHub.panel); ctx.open(); f(); };
  if (id === "today") inHub(() => ctx.home());
  else if (id === "packages") inHub(() => void import("./myplaces/packagesUi").then((m) => m.openPackages(ctx)));
  else if (id === "events") inHub(() => void import("./myplaces/eventsHere").then((m) => m.openEventsHere(ctx, place)));
  else if (id === "cameras" || id === "energy") {
    closePanels(myPlaces.panel);
    myPlaces.open(place.id);
    const want = id === "cameras" ? /Cameras/ : /Energy/;
    setTimeout(() => [...myPlaces.panel.querySelectorAll(".group-title")].find((e) => want.test(e.textContent ?? ""))?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  } else inHub(() => PLACE_TOOLS.find((t) => t.id === id)?.open(ctx));
}
async function bootMyPlace(id?: string) {
  const all = myStore.all(), place = id ? all.find((x) => x.id === id) : savedPlaceHere();
  if (!place) { closeHolo(); placeHub.ctx.open(); placeHub.ctx.home(); return; }
  closeHolo();
  closePanels();
  const m = await import("./myplaces/holo");
  const h0 = m.bootPlace({
    place, places: all, dock: dockFor(place),
    onPick: (d) => pickDock(place, d),
    onSwitch: (x) => void bootMyPlace(x),
    onGlobe: () => { closeHolo(); void flyToPlace(globe, { name: place.name, lon: place.lon, lat: place.lat, radius: 600 }); },
    onClose: () => closeHolo(),
    onAdd: () => { holo?.minimize(); closePanels(placeHub.panel); placeHub.ctx.open(); placeHub.ctx.home(); app.toast("Search for the address, or tap the spot on the map, then Save.", 5000); },
    onTrace: () => void traceMyBuilding(place),
    onLand: () => void addMyLand(place),
  });
  holo = h0;
  adopt(h0);
  modes.set("place");
  // What's going on there now: the weather, the light, and the day's most pressing thing.
  void forecast(place.lon, place.lat).then((f) => {
    if (holo !== h0) return;
    const c = f.current, sunset = f.daily.sunset?.[0]?.slice(11, 16), sunrise = f.daily.sunrise?.[0]?.slice(11, 16);
    const local = new Date().toLocaleTimeString(undefined, { timeZone: f.timezone, hour: "2-digit", minute: "2-digit" });
    h0.setHud([
      { k: "Local time", v: local },
      { k: "Now", v: `${Math.round(c.temperature_2m)}° · feels ${Math.round(c.apparent_temperature)}°` },
      { k: "Wind", v: `${Math.round(c.wind_speed_10m)} km/h` },
      { k: "Today", v: `${Math.round(f.daily.temperature_2m_min[0])}° to ${Math.round(f.daily.temperature_2m_max[0])}°${f.daily.precipitation_sum[0] ? `, ${f.daily.precipitation_sum[0]} mm` : ""}` },
      ...(sunrise && sunset ? [{ k: c.is_day ? "Sunset" : "Sunrise", v: c.is_day ? sunset : sunrise }] : []),
    ]);
  }).catch(() => {});
  void briefFor(place).then((b) => { if (holo !== h0) return; h0.setDock(dockFor(place, b)); const top = b[0]; if (top) h0.setHud([...h0.el.querySelectorAll(".holo-hud div")].map((d) => ({ k: d.querySelector("dt")?.textContent ?? "", v: d.querySelector("dd")?.textContent ?? "" })), `${top.icon} ${top.title}`); }).catch(() => {});
}
/** Keeps the camera looking straight down (no automatic tilt) while tracing. */
let holdTilt = false;
/** How many storeys: a row of choices over the map. */
function askStoreys(now: number): Promise<number> {
  return new Promise((resolve) => {
    const pick = (n: number) => { bar.remove(); resolve(n); };
    const bar = h("div", { class: "draw-bar", role: "toolbar" }, h("span", { class: "draw-prompt" }, "How many storeys?"),
      ...[1, 2, 3, 4, 6, 10].map((n) => h("button", { class: n === now ? "primary-btn" : "pill-btn", onclick: () => pick(n) }, n === 10 ? "10+" : String(n))));
    $("ui").append(bar);
  });
}
/** Looks straight down at a place, 160 m above its ground, for tracing. */
async function lookDown(place: MyPlace) {
  closeHolo();
  closePanels();
  stopArriving();
  holdTilt = true;
  const { elevation } = await import("./data/elevation");
  const ground = await Promise.race([elevation.sample([[place.lon, place.lat]], 15).then((v) => v[0] ?? 0).catch(() => 0), new Promise<number>((r) => setTimeout(() => r(0), 2500))]);
  await new Promise<void>((done) => globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(place.lon, place.lat, Math.max(0, ground) + 200), orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 }, duration: 1.6, complete: done, cancel: done }));
}
/** A row of choices over the map. */
function askChoice(prompt: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    const bar = h("div", { class: "draw-bar", role: "toolbar" }, h("span", { class: "draw-prompt" }, prompt),
      ...options.map((o, i) => h("button", { class: i === 0 ? "primary-btn" : "pill-btn", onclick: () => { bar.remove(); resolve(i); } }, o)));
    $("ui").append(bar);
  });
}
/** Add what the map doesn't have: your pool, your trees. */
async function addMyLand(place: MyPlace) {
  await lookDown(place);
  const { drawOnMap } = await import("./work/draw");
  const land = { pools: [...(place.land?.pools ?? [])], trees: [...(place.land?.trees ?? [])] };
  try {
    for (;;) {
      const pick = await askChoice("Add to your place:", ["🏊 Trace the pool", "🌳 Tap trees", land.pools.length || land.trees.length ? "Clear mine" : "", "Done"].filter(Boolean));
      const label = ["🏊 Trace the pool", "🌳 Tap trees", land.pools.length || land.trees.length ? "Clear mine" : "", "Done"].filter(Boolean)[pick];
      if (label === "Done") break;
      if (label === "Clear mine") { land.pools = []; land.trees = []; continue; }
      if (label.includes("pool")) { const ring = await drawOnMap(app, "area", "#6ff7ff", "Tap each corner of the pool, then Done"); if (ring && ring.length > 2) land.pools.push(ring); }
      else { const pts = await drawOnMap(app, "points", "#5dffa8", "Tap each tree (the middle of its crown), then Done"); if (pts) land.trees.push(...pts); }
    }
  } finally { holdTilt = false; }
  myStore.save({ ...(myStore.get(place.id) ?? place), land });
  app.toast(`Saved: ${land.pools.length} pool${land.pools.length === 1 ? "" : "s"} and ${land.trees.length} tree${land.trees.length === 1 ? "" : "s"} of yours. The hologram shows them with what's mapped around.`, 5000);
  void bootMyPlace(place.id);
}
/** Trace your own building over the satellite view, when the map doesn't have it (or has it wrong). */
async function traceMyBuilding(place: MyPlace) {
  // Straight down, still (no circling or tilting), from just above the ground (not sea level: the ground may be higher).
  await lookDown(place);
  const { drawOnMap } = await import("./work/draw");
  const ring = await drawOnMap(app, "area", "#ffc46b", "Tap each corner of your building, then Done").finally(() => { holdTilt = false; });
  if (!ring || ring.length < 3) { void bootMyPlace(place.id); return; }
  const storeys = await askStoreys(place.storeys ?? (place.kind === "home" ? 2 : 1));
  myStore.save({ ...(myStore.get(place.id) ?? place), footprint: ring, storeys });
  app.toast("Saved: your building as you traced it. The hologram uses it from now on.", 5000);
  void bootMyPlace(place.id);
}
app.actions.set("myplace:boot", { label: "Boot my place", run: (id) => void bootMyPlace(id || undefined) });
// Any place on Earth as a hologram: the size follows what it is (a building, a town, a mountain).
app.actions.set("space:boot", { label: "See it as a hologram", run: () => {
  const p = app.place;
  if (!p) return;
  const kind = String((p.feature as { world?: { kind?: string } } | undefined)?.world?.kind ?? "");
  const size = /peak|volcano|range|glacier|island|water|lake/.test(kind) ? 2400 : /city|capital/.test(kind) ? 1600 : 700;
  closePanels();
  void openSpace(app, { name: p.name?.title ?? "This spot", kicker: [p.name?.context, `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`].filter(Boolean).join(" · "), lon: p.lon, lat: p.lat, size, own: true, tint: "violet" });
} });
$("ui").append(pro.panel);
// Space: satellites, the ISS, launches and the solar system.
const space = createSpace(app);
app.addTheme(spaceTheme(space));
// Topics (Money & trade, Sports, Fashion, Food, Arts & music) live under "More" on the theme bar.
for (const t of topicThemes()) app.addTheme(t);
$("ui").append(space.panel, placeHub.panel, makeHub.panel, workHub.panel, lookHub.panel);
space.button.addEventListener("space:opened", () => closePanels(space.panel));
for (const hub of [placeHub, makeHub, workHub, lookHub]) hub.button.addEventListener("work:opened", () => closePanels(hub.panel));
app.actions.set("space:open", { label: "Space", run: () => space.open() });
app.actions.set("news:open", { label: "World now: the news", run: () => { lookHub.ctx.open(); openWorldNow(lookHub.ctx); } });
app.actions.set("space:solar", { label: "Solar system", run: () => space.toSolar() });
app.actions.set("work:ndvi", ndviAction(app));

/** Closes every mode panel except one. */
function closePanels(keep?: HTMLElement) {
  if (keep !== placeHub.panel) placeHub.ctx.close();
  if (keep !== makeHub.panel) makeHub.ctx.close();
  if (keep !== workHub.panel) workHub.ctx.close();
  if (keep !== lookHub.panel) lookHub.ctx.close();
  if (keep !== myPlaces.panel) myPlaces.close();
  if (keep !== pro.panel) pro.close();
  if (keep !== space.panel) space.close();
  toggleLayers(false);
  hideSocial();
}
/** Profile pages and Lens Studio step aside when another panel opens (set up once they exist). */
let hideSocial = () => {};
function openMode(m: Mode) {
  if (activeSpace() !== holo) holo = null;
  if (m !== "place") closeHolo();
  if (m === "look") { closePanels(); modes.set("look"); return; }
  // My Place: boot the place as a model (or bring the puck back); with nothing saved, the first-run card.
  if (m === "place" && myStore.all().length) {
    if (holo?.el.classList.contains("mini")) { closePanels(); holo.restore(); return; }
    if (!holo) { void bootMyPlace(); return; }
  }
  const hub = m === "place" ? placeHub : m === "work" ? workHub : makeHub;
  // Tapping the current mode again goes back to its home screen.
  hub.ctx.open();
  hub.ctx.home();
  // My Places takes you to your place when you're looking at somewhere far away.
  const main = m === "place" ? savedPlaceHere() : undefined;
  if (main) {
    const cam = globe.viewer.camera.positionCartographic;
    const far = cam.height > 60_000 || Math.hypot(CesiumMath.toDegrees(cam.longitude) - main.lon, CesiumMath.toDegrees(cam.latitude) - main.lat) > 1;
    if (far) void flyToPlace(globe, { name: main.name, lon: main.lon, lat: main.lat, radius: 1500 });
  }
}
const modes = createModeBar(openMode);
app.actions.set("mode:place", { label: "My Places", run: () => openMode("place") });
app.actions.set("mode:make", { label: "Create", run: () => openMode("make") });
app.actions.set("mode:work", { label: "Work", run: () => openMode("work") });
app.actions.set("myplace:report", {
  label: "About your place",
  run: () => {
    const p = savedPlaceHere();
    if (!p) { openMode("place"); app.toast("Save your place first: the report and sowing calendar come from its own weather.", 6000); return; }
    myPlaces.open(p.id);
    setTimeout(() => myPlaces.panel.querySelector(".report")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  },
});
$("layers-btn").parentElement!.before(modes.el);
// Pulse: everything you have, alive on the planet, with time and what-ifs.
const pulseBtn = h("button", { class: "round-btn pulse-btn", "aria-label": "Pulse: your world, live", title: "Pulse: your world, live", html: icons.activity, onclick: () => { closePanels(); closeHolo(); void import("./pulse/ui").then((m) => m.openPulse(app)); } });
$("layers-btn").before(pulseBtn);
app.actions.set("pulse:open", { label: "Pulse: your world, live", run: () => pulseBtn.click() });
// The switch follows whichever panel is showing.
const syncMode = () => {
  const shown = (el: HTMLElement) => !el.hidden;
  // Everything closed while your place was a puck: it comes back.
  if (holo && activeSpace() === holo && holo.el.classList.contains("mini") && ![placeHub.panel, myPlaces.panel].some(shown)) holo.restore();
  modes.set([placeHub.panel, myPlaces.panel].some(shown) ? "place" : [workHub.panel, pro.panel].some(shown) ? "work" : shown(makeHub.panel) ? "make" : "look");
  // Phones have room for one panel: the place card steps aside while a mode panel is open.
  document.body.dataset.panel = [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel, workHub.panel, lookHub.panel, space.panel].some(shown) ? "open" : "";
  // Working in My Places or Make: the empty Explore card steps aside so the mode has the screen.
  document.body.dataset.work = [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel, workHub.panel].some(shown) ? "1" : "";
};
const watcher = new MutationObserver(syncMode);
for (const el of [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel, workHub.panel, lookHub.panel, space.panel]) watcher.observe(el, { attributes: true, attributeFilter: ["hidden"] });

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
  if (/^#(story|s)=/.test(hash)) void import("./stories/ui").then((m) => { closePanels(makeHub.panel); modes.set("make"); void m.openFromHash(makeHub.ctx, hash); });
};
openStoryHash();
// Pasting a story link into a tab that already has Terreno open.
addEventListener("hashchange", openStoryHash);
for (const y of YEARS)
  app.actions.set(`work:borders:${y}`, { label: `Borders in ${yearLabel(y)}`, run: () => void showYear(app, y).catch(() => app.toast("Couldn't load the historical borders. Check the connection.", 5000)), isOn: () => borders(app).year === y });

app.actions.set("pro:occupancy", {
  label: "Live occupancy",
  run: () => {
    const p = savedPlaceHere();
    if (p) pro.open(p.id);
    else { app.toast("Save the building in My Places first, then connect its bookings.", 6000); openMode("place"); }
  },
});

// The task robot: plain-language requests typed into the search box.
const aiSettings = createAiSettings();
$("ui").append(aiSettings.panel);
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
}, {
  showBorders: async (y) => { await showYear(app, y); },
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
/** "Daisy had twins", "sprayed Top field" or "Oak Street: slab poured" typed into the search box. */
const logCommand = (q: string): Command | null => {
  const plan = planLog(q);
  return plan ? { title: `Log for ${plan.tool}: ${plan.summary}`, steps: [plan.saves], run: () => void plan.run().then((r) => app.toast(r ? `Logged: ${r}` : "Couldn't log that.", 4000)) } : null;
};

/** A trip typed into the search box: "fly to Manila, taxi to the Peninsula, stay 3 nights". */
const tripCommand = (q: string): Command | null => {
  const d = parseSteps(q);
  if (d.length < 2 || !d.some((x) => x.kind === "move" || x.kind === "stay")) return null;
  return { title: "Plan this trip", steps: [describeDrafts(d)], run: () => {
    closePanels(makeHub.panel);
    makeHub.ctx.open();
    void import("./work/planUi").then((m) => m.tripFromText(makeHub.ctx, q)).catch(() => app.toast("Couldn't load the planner. Check the connection and try again.", 5000));
  } };
};

/** "Flat land under 800 m near an airport": a question for every place on screen at once. */
const askMap = (q?: string) => {
  closePanels(lookHub.panel);
  lookHub.ctx.open();
  void import("./answers/ui").then((m) => m.openAsk(lookHub.ctx, q)).catch(() => app.toast("Couldn't load that tool. Check the connection and try again.", 5000));
};
app.actions.set("answers:ask", { label: "Ask the map", run: (q) => askMap(q) });
/** "Places like this": step back to see the region around the place, then answer. */
app.actions.set("answers:preset", { label: "Places like this", run: (json) => {
  if (!json) return;
  const preset = JSON.parse(json) as { title: string; criteria: Criterion[]; exclude?: [number, number] };
  const at = app.place;
  const answer = () => {
    closePanels(lookHub.panel);
    lookHub.ctx.open();
    void import("./answers/ui").then((m) => m.openAsk(lookHub.ctx, undefined, preset)).catch(() => app.toast("Couldn't load that tool. Check the connection and try again.", 5000));
  };
  if (!at) { answer(); return; }
  globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(at.lon, at.lat, 1_400_000), duration: 1.6, complete: answer, cancel: answer });
} });
const answerCommand = (q: string): Command | null => {
  if (!looksLikeSearch(q)) return null;
  return { title: "Answer on the map", steps: parseQuery(q).criteria.map(describeCriterion), run: () => askMap(q) };
};

let things: Thing[] | null = null;
const iconOfKind = (k: string) => (k === "peak" || k === "range" || k === "volcano" ? "mountain" as const : k === "water" || k === "sea" || k === "waterfall" ? "drop" as const : k === "city" || k === "capital" ? "building" as const : "target" as const);

const asCommand = (q: string): Command | null => {
  const logged = logCommand(q);
  if (logged) return logged;
  const trip = tripCommand(q);
  if (trip) return trip;
  const answer = answerCommand(q);
  if (answer) return answer;
  const p = plan(q);
  // With Claude connected, anything that reads as a request or question goes to it.
  if (aiOn() && looksLikeAsk(q)) return { title: "Ask Terreno AI", steps: [p.steps.length ? describe(p).join(" → ") : "Claude will work out the steps"], run: () => void robot.ask(q.trim(), p.steps.length ? p : null) };
  if (!p.steps.length) return null;
  const steps = describe(p);
  return { title: steps.length === 1 ? steps[0] : `Do ${steps.length} things`, steps, run: () => void robot.run(q.trim(), p) };
};

$("search-slot").replaceWith(createSearch(globe, {
  command: asCommand,
  examples: [
    "Find flat, sunny land under 800 m near an airport, low flood risk",
    "Where does rain go in downtown Chicago, and show the storm drains",
    "Railways and power plants near Munich",
  ],
  onPick: pick,
  local: (q) => [
    // Places Terreno knows by name open their page.
    ...searchPlaces(q, 4).map((r): SearchResult => ({ name: r.name, detail: r.detail, lon: r.lon, lat: r.lat, radius: r.radius, source: "local", icon: iconOfKind(r.kind), run: () => void openPlace(r.slug) })),
    ...siteMatches(q), ...searchLocal(feeds, q).map((m) => ({
    name: m.name, detail: m.detail, lon: m.lon, lat: m.lat, source: "local" as const,
    radius: m.kind === "sea" || m.kind === "continent" ? 1_500_000 : m.kind === "range" || m.kind === "desert" || m.kind === "region" ? 400_000 : m.kind === "city" || m.kind === "capital" ? 15_000 : m.kind === "district" ? 3000 : 1200,
    icon: iconOfKind(m.kind),
  }))].filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i).slice(0, 8),
  things: (q) => {
    things ??= buildThings(app, overlays, [...PLACE_TOOLS, ...MAKE_TOOLS, ...LOOK_TOOLS]);
    const found = findThings(things, q, 6);
    const as = (t: Thing): SearchResult => ({ name: t.title, detail: t.on?.() ? `On · ${t.detail}` : t.detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(t.emoji, 18) ?? icons.sparkle, run: t.run });
    // A year ("1914", "500 BC", "the world in 2050") goes there in time.
    const y = /^(?:(?:the )?world in |in |year )?(\d{1,4})\s*(bc|bce|ad)?$/i.exec(q.trim());
    const year = y ? Number(y[1]) * (/^bc/i.test(y[2] ?? "") ? -1 : 1) : NaN;
    const time: SearchResult[] = Number.isFinite(year) && year >= -3000 && year <= 2100 && (Math.abs(year) >= 100 || y![2])
      ? [{ name: `Go to ${yearName(year)}`, detail: year < 2000 ? "The world's borders at the time" : year < new Date().getUTCFullYear() ? "The Earth from space that year" : "Projections for places", lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("⏳", 18) ?? icons.sparkle, run: () => timeBar.goToYear(year) }]
      : [];
    // One word that names an Terreno thing outright ("tour", "seasons", "railways"), and no place
    // is called exactly that: the thing leads, ahead of places and commands.
    const words = tokens(q);
    const lead = found[0] && words.length === 1 && scoreThing(found[0], q) >= 3 && !searchPlaces(q, 4).some((p) => tokens(p.name).join(" ") === words[0]) ? found[0] : null;
    // People by name or @handle, and lenses people have made.
    const people: SearchResult[] = searchProfiles(q).slice(0, 3).map((p) => ({ name: p.name, detail: `@${p.handle}${p.now ? ` · ${p.now}` : ""}`, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(p.avatar.emoji, 18) ?? icons.people, run: () => app.actions.get("profile:open")?.run(p.handle) }));
    const qw = words.filter((w) => w.length > 2);
    const made: SearchResult[] = qw.length ? allLenses().filter((d) => qw.every((w) => `${d.name} ${d.blurb}`.toLowerCase().includes(w)) || qw.some((w) => d.name.toLowerCase().startsWith(w))).slice(0, 2)
      .map((d) => ({ name: `${d.name} lens`, detail: d.blurb, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(d.icon, 18) ?? icons.sparkle, run: () => app.actions.get("lens:custom")?.run(d.id) })) : [];
    const guides: SearchResult[] = qw.length ? allProfiles().flatMap((p) => (p.guides ?? []).map((g) => ({ p, g })))
      .filter(({ g }) => qw.every((w) => `${g.title} ${g.blurb}`.toLowerCase().includes(w))).slice(0, 2)
      .map(({ p, g }) => ({ name: g.title, detail: `A guide by ${p.name} · ${g.stops.length} stops`, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("🧭", 18) ?? icons.compass, run: () => { location.hash = `#/g/${p.handle}/${g.id}`; } })) : [];
    return [
      ...(lead ? [{ heading: "Best match", items: [as(lead)], lead: true }] : []),
      { heading: "People", items: people },
      { heading: "Guides", items: guides },
      { heading: "Lenses people made", items: made },
      { heading: "Time", items: time },
      ...(["Show on the map", "Open", "Stories"] as const).map((g) => ({ heading: g, items: found.filter((t) => t.group === g && t !== lead).slice(0, 3).map(as) })),
    ].filter((g) => g.items.length);
  },
  frontDoor: () => {
    const go = (name: string, slug: string, detail: string, emoji: string): SearchResult => ({ name, detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(emoji, 18) ?? icons.target, run: () => void openPlace(slug) });
    const show = (name: string, detail: string, emoji: string, run: () => void): SearchResult => ({ name, detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(emoji, 18) ?? icons.sparkle, run });
    return [
      { heading: "Go to", items: [{ name: "Show me something amazing", detail: "Somewhere unexpected, and why it's worth seeing", lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("🎲", 18) ?? icons.sparkle, run: () => app.actions.get("surprise")?.run() }, go("The Nile", "nile", "The longest river, source to sea", "🌊"), go("Mount Everest", "mount-everest", "The highest mountain", "🏔️"), go("Grand Canyon", "grand-canyon", "Two billion years of rock", "🏜️")] },
      { heading: "Show", items: [show("Where people live", "Every town and city as a glow", "👥", () => app.actions.get("people:view")?.run("pop")), show("This week's earthquakes", "Live, worldwide", "〽️", () => void overlays.set("quakes", true)), show("The planet at night", "City lights from space", "🌃", () => void overlays.set("lights", true))] },
    ];
  },
  bias: () => (feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null),
}));

// Layers any theme can add to the map by name (Built registers its networks itself).
for (const o of OVERLAYS) if (o.id !== "labels") app.actions.set(`overlay:${o.id}`, { label: o.label, run: () => void overlays.set(o.id, true), isOn: () => overlays.isOn(o.id), stop: () => void overlays.set(o.id, false) });
for (const k of ["geology", "elevation", "slope", "contours"] as const)
  app.actions.set(`globe:${k}`, { label: k, run: () => { globe.state.overlays[k].on = true; globe.apply(); }, isOn: () => globe.state.overlays[k].on, stop: () => { globe.state.overlays[k].on = false; globe.apply(); } });

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
app.actions.set("handoff:phone", { label: "Continue on your phone", run: () => {
  document.querySelector(".handoff")?.remove();
  const link = app.shareLink?.() ?? location.href;
  const close = () => box.remove();
  const box = h("div", { class: "handoff reg", role: "dialog", "aria-label": "Continue on your phone" },
    h("div", { class: "handoff-qr", html: qrSvg(link) }),
    h("div", { class: "handoff-text" }, h("strong", {}, "Continue on your phone"), h("p", {}, "Point your phone's camera at the code. The same view opens there; tap Guide me to be taken to it."),
      h("button", { class: "pill-btn", onclick: close }, "Done")));
  $("ui").append(box);
  addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") close(); }, { once: true });
} });
app.actions.set("wayfind:guide", { label: "Guide me there", run: () => { const p = app.place; if (p) wayfinder.guideTo({ id: `place:${p.lon},${p.lat}`, name: p.name?.title ?? "there", lon: p.lon, lat: p.lat, why: "poi", weight: 1 }); } });

// Everything on the map, from every theme.
// Everything on the map as bubbles at the edge of the globe; + adds a view without leaving it.
$("ui").append(createViewStack(app, () => (things ??= buildThings(app, overlays, [...PLACE_TOOLS, ...MAKE_TOOLS, ...LOOK_TOOLS]))));

// Map style popover.
const layersBtn = $("layers-btn");
// Live traffic: planes and ships moving on the globe.
const traffic = createTraffic(app);
// The living city: buildings, trees, and simulated cars and people on the real streets, once zoomed in.
const cityLife = createCityLife(app);
app.actions.set("city:life", { label: "Living city (3D, simulated movement)", run: () => cityLife.set(true), isOn: () => cityLife.isOn(), stop: () => cityLife.set(false) });
// 3D by default: coming down into a place, the camera tilts toward the horizon once (unless you've tilted it yourself).
{
  let tilted = false;
  const cam = globe.viewer.camera;
  cam.moveEnd.addEventListener(() => {
    // Not while you're drawing on the map, or looking straight down to trace something.
    if (holdTilt || app.interacting) return;
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
  app.actions.set(`live:${kind}s`, { label: kind === "plane" ? "Live planes" : "Live ships", run: () => traffic.set(kind, true), isOn: () => traffic.isOn(kind), stop: () => traffic.set(kind, false) });
// A shared flight or ship (#follow=p:a1b2c3@lon,lat): open Terreno following it.
const followHash = () => {
  const m = /^#follow=([ps]:[\w-]+)@(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  if (m) setTimeout(() => traffic.openShared(m[1], Number(m[2]), Number(m[3])), 2500);
};
followHash();
addEventListener("hashchange", followHash);
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
  { kind: "geology", label: "🪨 Geologic map", color: "#9a7552" },
  { kind: "elevation", label: "⛰️ Elevation colours", color: "#5b9467" },
  { kind: "slope", label: "📐 Slope", color: "#d19a2e" },
  { kind: "contours", label: "〰️ Contour lines", color: "#d1d1d6" },
  { kind: "species", label: "🔬 Species records", color: "#5b9467" },
];
// Hidden for now from the stack of views: off on the globe, but still listed.
const resting = new Set<OverlayKind>();
globe.onApply = () => {
  for (const { kind, label, color } of GLOBE_LAYERS) {
    const key = `globe:${kind}`, on = globe.state.overlays[kind].on;
    if (on && !app.canvas.has(key))
      app.canvas.put({
        id: key, label, color, scope: "world", pinned: false,
        show: (v) => {
          if (v === globe.state.overlays[kind].on) return;
          if (v) resting.delete(kind); else resting.add(kind);
          globe.state.overlays[kind].on = v;
          globe.apply();
        },
        remove: () => {
          resting.delete(kind);
          globe.state.overlays[kind].on = false;
          globe.apply();
        },
      }, true);
    else if (on && resting.has(kind)) { resting.delete(kind); app.canvas.setOff(key, false); }
    else if (!on && !resting.has(kind) && app.canvas.has(key)) app.canvas.drop(key);
  }
};
layersBtn.addEventListener("click", () => { const open = layers.hidden; for (const c of [placeHub.ctx, makeHub.ctx, lookHub.ctx]) c.close(); myPlaces.close(); pro.close(); space.close(); toggleLayers(open); });
globe.viewer.scene.canvas.addEventListener("pointerdown", () => toggleLayers(false));
addEventListener("atlas:add-view", () => toggleLayers(false));

// Time: one slider from the ancient world to 2100 (borders of the time, the view from space, projections).
const timeBar = new TimeBar(app);
$("ui").append(timeBar.el);
const timeBtn = h("button", { id: "time-btn", class: "round-btn", "aria-label": "Time: see the globe in another year", html: iconSvg("⏳", 20) ?? "" });
timeBtn.addEventListener("click", () => (timeBar.el.hidden ? timeBar.open() : timeBar.close()));
layersBtn.before(timeBtn);
app.actions.set("time:open", { label: "Time travel", run: () => timeBar.open() });
// "1914", or "1914@lon,lat" to light up whoever governed that place.
app.actions.set("time:close", { label: "Back to today", run: () => timeBar.close() });
app.actions.set("time:go", { label: "Go to a year", run: (arg) => {
  const m = /^(-?\d+)(?:@(-?[\d.]+),(-?[\d.]+))?$/.exec(arg ?? "");
  if (m) timeBar.goToYear(Number(m[1]), m[2] ? [Number(m[2]), Number(m[3])] : undefined);
} });

// About / data sources.
// Terreno on a TV: TV mode plays by itself and a phone is the remote (src/tv). A link to #/tv/CODE opens it.
const tvLink = /^#\/tv(\/([A-Za-z0-9]{6}))?$/.exec(startHash);
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
{
  const castBtn = h("button", { class: "round-btn cast-btn", "aria-label": "Show Terreno on a TV", title: "Show Terreno on a TV", html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5V6.8A1.8 1.8 0 0 1 4.8 5h14.4A1.8 1.8 0 0 1 21 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H14"/><path d="M3 19.5h.01M3 13a6.5 6.5 0 0 1 6.5 6.5M3 16a3.5 3.5 0 0 1 3.5 3.5"/></svg>', onclick: () => app.actions.get("tv:cast")?.run() });
  document.querySelector(".topbar-actions")?.prepend(castBtn);
  if (tvLink) setTimeout(() => app.actions.get("tv:mode")?.run(tvLink[2]?.toUpperCase()), 2600);
}
const about = $("about-btn");
// The mark and the name, top left: the brand's one place on screen; it opens About.
document.querySelector(".topbar")?.prepend(h("button", { class: "brand", "aria-label": "About Terreno", html: wordmarkHtml(26), onclick: () => about.click() }));
about.innerHTML = icons.info;
const soundBtn = h("button", { class: "pill-btn sound-toggle", "aria-pressed": String(soundOn()) }, soundOn() ? "Sounds on" : "Sounds off") as HTMLButtonElement;
soundBtn.addEventListener("click", () => { const on = !soundOn(); setSound(on); soundBtn.textContent = on ? "Sounds on" : "Sounds off"; soundBtn.setAttribute("aria-pressed", String(on)); });
const aboutPanel = h("div", { class: "popover about", hidden: true },
  h("div", { class: "about-head" }, h("h2", { class: "group-title" }, "About Terreno"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (aboutPanel.hidden = true) })),
  h("p", {}, "Terreno does three things, switched at the top. Explore: the whole Earth and space; tap anything, then flip through the themes or look at it through a lens. Create: trips, stories, videos and lessons made from the map. My Places: your home, farm, site or business, with a daily brief and the tools to run it."),
  h("p", {}, "You can also type a request into the search box, like \u201cstorm drains and railways in Chicago\u201d, and Terreno will plan the steps and do them."),
  h("p", {}, "People have pages here too: the places they love, a journal, and lenses they've made. Make your own from the account button, and a lens of your own in Lens Studio."),
  h("button", { class: "pill-btn about-ai", onclick: () => { aboutPanel.hidden = true; aiSettings.open(); } }, aiOn() ? "Terreno AI: connected · settings" : "Connect Terreno AI (Claude)…"),
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
  h("h2", { class: "group-title" }, "Your privacy"),
  h("p", { class: "fineprint" }, "What you make in Terreno stays in this browser unless you sign in and sync it or share it with your team; there are no ads, no tracking and no selling of data. To answer you, Terreno asks public services about the places you look at (for example OpenStreetMap for names and Open-Meteo for weather), which sends them the coordinates, not who you are. With Terreno AI on, your requests go to Anthropic."),
  h("p", { class: "fineprint about-legal" }, ...[["terms", "Terms"], ["privacy", "Privacy"], ["acceptable-use", "Acceptable use"], ["security", "Security"], ["accessibility", "Accessibility"], ["subprocessors", "Subprocessors"]].flatMap(([n, t], i) => [i ? " · " : "", h("a", { href: `legal/${n}.html`, target: "_blank", rel: "noopener" }, t)])),
  h("p", { class: "fineprint" }, "Keyboard: 1–9 switch themes · / searches · + and − zoom · Esc cancels a line or closes a chart. Double-click to zoom in on a spot."),
  // Showing Terreno to people one after another on the same computer.
  (() => {
    const row = h("div", { class: "about-row" }, h("span", { class: "muted small" }, "Showing Terreno to people one after another? Start fresh for the next visitor: the opening, the tour and a clean slate (Terreno AI and feedback notes are kept)."));
    const btn = h("button", { class: "pill-btn" }, "Start fresh") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Tap again to clear"; setTimeout(() => { btn.dataset.sure = ""; btn.textContent = "Start fresh"; }, 4000); return; }
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.") && k !== "atlas.ai.v1" && k !== "atlas.feedback.v1") localStorage.removeItem(k);
        sessionStorage.clear();
      } catch { /* storage blocked */ }
      location.replace(location.pathname);
    });
    row.append(btn);
    return row;
  })());
$("ui").append(aboutPanel);

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
// "More" also holds the lenses you've made or kept, one tap from any place.
app.moreExtras = () => {
  const mine = myLenses();
  return [
    h("p", { class: "more-title" }, "Your lenses"),
    h("div", { class: "chips wrap more-lenses" },
      ...mine.map((d) => h("button", { class: "chip", title: d.blurb, onclick: () => { app.toggleMore(false); app.actions.get("lens:custom")?.run(d.id); } }, `${d.icon} ${d.name}`)),
      h("button", { class: "chip", onclick: () => { app.toggleMore(false); app.actions.get("lens:studio")?.run(); } }, mine.length ? "✨ Make another" : "✨ Make a lens")),
  ];
};
app.sheet.el.querySelector(".share-menu")!.after(lenses.strip);
$("ui").append(lenses.panel);
app.onName = (p) => lenses.rename(p);
for (const l of LENSES) app.actions.set(`lens:${l.id}`, { label: l.label, run: () => void lenses.openWhenReady(l.id).then((ok) => { if (!ok) app.toast("Tap a place first, then choose a lens.", 4000); }) });

// People: accounts, pages about the places people love, and lenses anyone can make.
const soundRow = h("div", { class: "am-row am-static" }, h("span", {}, "Sounds and taps"), soundBtn);
const social = wireSocial(app, {
  lensList: LENSES,
  lenses,
  openPlace: (slug) => openPlace(slug),
  closePanels: () => closePanels(),
  extras: () => [
    { label: `Watching${social ? ` (${social.watch.count()})` : ""}`, icon: iconSvg("🔔", 18) ?? icons.sparkle, run: () => app.actions.get("watch:open")?.run() },
    { label: "Take the tour", icon: icons.compass, run: () => startTour(app) },
    { label: aiOn() ? "Terreno AI: connected" : "Connect Terreno AI", icon: icons.sparkle, run: () => aiSettings.open() },
    { label: "Send feedback", icon: icons.pencil, run: () => void import("./ui/feedback").then((m) => m.openFeedback(app)) },
    { label: "About Terreno and its data", icon: icons.info, run: () => { aboutPanel.hidden = false; } },
    soundRow,
  ],
});
about.replaceWith(social.account.button);
$("ui").append(social.account.menu);
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
  // My Places's home lists "Save this spot": keep it in step with the selection.
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
app.onTheme = (id) => { looks.set(id); syncHash(); };
globe.viewer.camera.moveEnd.addEventListener(syncHash);

// The card follows the map. After you move the map yourself (drag, scroll, pinch, the zoom buttons), if the
// place you chose has left the part of the map you can see (or you've pulled right out to the whole planet),
// the card lets go of it and shows what's in view instead, with "Back to …" one tap away. Terreno's own camera
// moves (arriving somewhere, time travel, framing an answer) never do this, nor do moves while a lens or a
// drawing tool is working on the place.
{
  const canvas = globe.viewer.scene.canvas;
  let byHand = false;
  const mark = () => { byHand = true; };
  for (const ev of ["pointerdown", "wheel", "touchstart"]) canvas.addEventListener(ev, mark, { passive: true });
  document.addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.(".map-zoom, .map-ctl")) mark(); }, true);
  const inView = (p: { lon: number; lat: number; height: number }) => {
    const scene = globe.viewer.scene, pos = Cartesian3.fromDegrees(p.lon, p.lat, 0);
    // Behind the globe?
    const cam = scene.camera.positionWC, n = Cartesian3.normalize(pos, new Cartesian3());
    if (Cartesian3.dot(Cartesian3.subtract(cam, pos, new Cartesian3()), n) < 0) return false;
    const w = SceneTransforms.worldToWindowCoordinates(scene, pos);
    if (!w) return false;
    const pad = freeArea(canvas), W = canvas.clientWidth, H = canvas.clientHeight, m = 12;
    return w.x >= pad.left - m && w.x <= W - pad.right + m && w.y >= pad.top - m && w.y <= H - pad.bottom + m;
  };
  globe.viewer.camera.moveEnd.addEventListener(() => {
    if (!byHand) return;
    byHand = false;
    const p = app.place;
    if (!p || !lenses.panel.hidden || app.interacting) return;
    const far = globe.viewer.camera.positionCartographic.height > 6_000_000;
    if (!inView(p) || far) app.release();
  });
  // "Back to …": fly back and open it again, as it was.
  app.onReturn = (p) => {
    const slug = p.slug;
    if (slug && !slug.startsWith("@")) { void openPlace(slug); return; }
    void flyToPlace(globe, { name: p.name?.title ?? "", lon: p.lon, lat: p.lat, radius: 1500 });
    app.select({ lon: p.lon, lat: p.lat, height: p.height }, p.name, p.feature);
  };
}

// Opening view: a shared link's view, or the whole planet.
const shared = parseHash(location.hash);
// Opened from a place's own page (p/nile/), or a link to one (#/p/nile).
const pageSlug = (window as { ATLAS_PAGE?: string }).ATLAS_PAGE;
// Places by name answer the first keystroke.
setTimeout(warmPlaces, 1500);
document.querySelector(".seo-page")?.remove();
const pageLinked = /^#\/p\//.test(location.hash) || /^#follow=/.test(location.hash) || (!!pageSlug && !location.hash);
if (shared.camera) {
  const c = shared.camera;
  globe.viewer.camera.setView({
    destination: Cartesian3.fromDegrees(c.lon, c.lat, Math.max(50, c.height)),
    orientation: { heading: CesiumMath.toRadians(c.heading), pitch: CesiumMath.toRadians(c.pitch), roll: 0 },
  });
} else {
  // Open on the user's own side of the planet (from the time zone).
  const home = homeRegion();
  globe.viewer.camera.setView({ destination: Cartesian3.fromDegrees(home.lon - 25, home.lat * 0.6, 22_000_000) });
}
// The opening: from black, the titles (first visit) or just the name, then the Earth in real sunlight
// settling on the viewer's side of the planet. A link to a view or a place, or a saved place, sets its own view.
{
  let seen = false;
  try { seen = localStorage.getItem("atlas.intro") === "1"; } catch { /* private mode */ }
  const home = !shared.camera && !pageLinked && !myStore.all().length ? homeRegion() : null;
  void playIntro(app, { home, full: !seen && !!home }).then(() => {
    try { localStorage.setItem("atlas.intro", "1"); } catch { /* private mode */ }
    // The tour, once: after the first opening (not when arriving by a link to a place or view).
    if (home && !tourDone() && !tvLink) setTimeout(() => startTour(app), 1200);
  });
}
if (pageLinked) { if (/^#\/p\//.test(location.hash)) placeHash(); else if (pageSlug) void openPlace(pageSlug); }
if (shared.theme) app.setTheme(shared.theme);
if (shared.place) app.select({ lon: shared.place.lon, lat: shared.place.lat, height: 0 });
else if (!shared.camera && !pageLinked && myStore.all().length) {
  // Start where people are: fly in to their own place.
  const saved = myStore.all();
  const home = saved.find((p) => p.kind === "home") ?? saved[0];
  setTimeout(() => {
    void flyToPlace(globe, { name: home.name, lon: home.lon, lat: home.lat, radius: 400 });
    app.select({ lon: home.lon, lat: home.lat, height: 0 }, { title: home.name, context: home.address ?? "My place" });
    app.toast(`Welcome back to ${home.name}. My Places (top right) has today's brief and its dashboard.`, 6000);
  }, 1200);
}

// Offline: the app, bundled data and the map tiles you've seen keep working without a connection,
// and a new deploy takes over without breaking an open tab (ui/warm.ts, public/sw.js).
if (import.meta.env.PROD) seamlessDeploys();
// What people open next, fetched while the browser is idle.
warmUp(globe, [() => import("./intros/intro"), () => loadWorldHeritage(), () => import("./answers/ui")]);

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { atlas: { app, globe, labels, overlays, feeds, traffic, cityLife, cart: (lon: number, lat: number, h: number) => Cartesian3.fromDegrees(lon, lat, h) } });
  void import("cesium").then((Cesium) => Object.assign(window, { Cesium }));
}
