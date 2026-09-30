import "./styles.css";
// Cesium loads its web workers and assets relative to this URL.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL("./cesium/", document.baseURI).href;

import { Cartesian2, Cartesian3, Math as CesiumMath, SceneTransforms } from "cesium";
import { createMapControls, homeRegion } from "./globe/controls";
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
import { playIntro } from "./delight/intro";
import { setSound, soundOn } from "./delight/sound";
import { startTour, tourDone } from "./delight/tour";
import { firstSentence, headline } from "./place/headline";
import { measureAt } from "./place/measure";
import { yearName } from "./time/model";
import { iconSvg } from "./ui/glyph";
import { createLayersPanel, type LiveSwitch } from "./ui/layers";
import { createSearch, flyToPlace, freeArea, geocode, type Command, type Place as SearchPlace, type SearchResult } from "./ui/search";
import { createRobot } from "./ui/robotCard";
import { createAiSettings } from "./ui/aiSettings";
import { aiOn, looksLikeAsk } from "./robot/llm";
import { PlaceStore } from "./myplaces/store";
import { PlaceScene } from "./myplaces/scene";
import { createMyPlaces } from "./myplaces/panel";
import { createPro } from "./pro/panel";
import { createWork, type WorkCtx, type WorkTool } from "./work/hub";
import { createModeBar, type Mode } from "./ui/modes";
import { briefFor, todayCard } from "./myplaces/todayUi";
import { backupRow, keepStorage } from "./myplaces/backup";
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
import { createCanvasTray } from "./ui/canvasTray";
import { SITES, sitesFor, type Site } from "./content/sites";
import { MINES } from "./content/minerals";
import { LINKS } from "./content/links";
import { wireSocial } from "./social/wire";
import { watchForProblems } from "./ui/errors";
watchForProblems();
import { allProfiles, searchProfiles } from "./social/store";
import { allLenses, myLenses } from "./lenses/library";
import { topicThemes } from "./topics/themes";
import { openWorldNow } from "./live/worldNow";
import { createTraffic } from "./live/tracks";

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
  tool("grow", "Grow", "Fields and crops: growth stage, harvest, water and frost", "#30d158", icons.sprout, openGrow),
  tool("flock", "Flock", "Animals in your care: farms, vets, rescues and adoption", "#8bd346", icons.paw, openFlock),
  tool("build", "Build", "Model a building on its site and track construction; worksite tools (Pro)", "#ff9f0a", icons.crane, openBuild),
  tool("occupancy", "Live occupancy", "Rooms, floors and bookings from your booking system (Pro)", "#ff375f", icons.building, () => app.actions.get("pro:occupancy")?.run()),
];
const MAKE_TOOLS: WorkTool[] = [
  tool("plan", "Plan", "Trips told step by step, an event's running order, sites, zones and routes", "#0a84ff", icons.route, openPlans),
  tool("present", "Stories", "Tell a story on the globe, publish it, and use or remix others'", "#e0b050", icons.slides, openPresent),
  tool("video", "Video", "A studio: the globe on a monitor, shots, looks, camera moves and narration", "#ff375f", icons.video, openVideo),
  tool("teach", "Teach", "Lessons, quizzes, games, a world politics simulation and field trips", "#bf5af2", icons.graduate, openTeach),
];
const LOOK_TOOLS: WorkTool[] = [
  tool("news", "World now", "The biggest stories, the latest headlines, fires, storms and quakes going on, and what the world is reading", "#ff375f", icons.globe, (ctx) => openWorldNow(ctx)),
  tool("year", "The year breathes", "Spin through the seasons: the sun, polar night and the planet greening week by week", "#30d158", icons.sprout, (ctx) => { ctx.close(); app.actions.get("rhythms:year")?.run(); }),
  tool("ask", "Ask the map", "Find places that meet many things at once: ground, climate, towns, access, rivers, hazards", "#ffb04a", icons.sparkle, openAsk),
  tool("learn", "Learn", "Games, a daily challenge, your passport, and museums and libraries near you", "#30d158", icons.book, openLearn),
  tool("space", "Space", "Satellites, the ISS, rocket launches and the solar system", "#5e5ce6", icons.saturn, () => app.setTheme("space")),
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
  title: "My Places",
  intro: "Your home, farm, site or business: what matters there today, and the tools to run it.",
  top: () => {
    const main = savedPlaceHere();
    // The places-only export is covered by "Back up everything" below.
    const list = myPlaces.listBody().filter((n) => !(n instanceof HTMLElement && n.classList.contains("mp-foot")));
    // Nothing saved yet: one card with every way in (address, this spot, where I am, a demo).
    if (!main) return [
      h("div", { class: "today-card first" },
        h("div", { class: "today-head" }, h("strong", {}, "Start with your place")),
        h("p", { class: "small" }, "Save your home, farm, site or business and Atlas gives you a daily brief there: frost, heat, storms, and what's due for your animals, fields and projects."),
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
const makeHub = createWork(app, MAKE_TOOLS, {
  title: "Create",
  intro: "Make something from the map: a trip, a story, a video or a lesson.",
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
// Atlas Pro: live operations (bookings from a CRM or booking system) for a saved building.
const pro = createPro(app, myStore, myScene, (id) => { myPlaces.open(id); myPlaces.close(); });
$("ui").append(pro.panel);
// Space: satellites, the ISS, launches and the solar system.
const space = createSpace(app);
app.addTheme(spaceTheme(space));
// Topics (Money & trade, Sports, Fashion, Food, Arts & music) live under "More" on the theme bar.
for (const t of topicThemes()) app.addTheme(t);
$("ui").append(space.panel, placeHub.panel, makeHub.panel, lookHub.panel);
space.button.addEventListener("space:opened", () => closePanels(space.panel));
for (const hub of [placeHub, makeHub, lookHub]) hub.button.addEventListener("work:opened", () => closePanels(hub.panel));
app.actions.set("space:open", { label: "Space", run: () => space.open() });
app.actions.set("news:open", { label: "World now: the news", run: () => { lookHub.ctx.open(); openWorldNow(lookHub.ctx); } });
app.actions.set("space:solar", { label: "Solar system", run: () => space.toSolar() });
app.actions.set("work:ndvi", ndviAction(app));

/** Closes every mode panel except one. */
function closePanels(keep?: HTMLElement) {
  if (keep !== placeHub.panel) placeHub.ctx.close();
  if (keep !== makeHub.panel) makeHub.ctx.close();
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
  if (m === "look") { closePanels(); modes.set("look"); return; }
  const hub = m === "place" ? placeHub : makeHub;
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
// The switch follows whichever panel is showing.
const syncMode = () => {
  const shown = (el: HTMLElement) => !el.hidden;
  modes.set([placeHub.panel, myPlaces.panel, pro.panel].some(shown) ? "place" : shown(makeHub.panel) ? "make" : "look");
  // Phones have room for one panel: the place card steps aside while a mode panel is open.
  document.body.dataset.panel = [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel, lookHub.panel, space.panel].some(shown) ? "open" : "";
  // Working in My Places or Make: the empty Explore card steps aside so the mode has the screen.
  document.body.dataset.work = [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel].some(shown) ? "1" : "";
};
const watcher = new MutationObserver(syncMode);
for (const el of [placeHub.panel, myPlaces.panel, pro.panel, makeHub.panel, lookHub.panel, space.panel]) watcher.observe(el, { attributes: true, attributeFilter: ["hidden"] });

const HUB_OF: Record<string, { hub: typeof placeHub; open: (ctx: WorkCtx) => void }> = {};
for (const [hub, tools] of [[placeHub, PLACE_TOOLS], [makeHub, MAKE_TOOLS], [lookHub, LOOK_TOOLS]] as const)
  for (const t of tools) if (t.id !== "occupancy" && t.id !== "space" && t.id !== "year") HUB_OF[t.id] = { hub, open: t.open };
for (const [t, { hub, open }] of Object.entries(HUB_OF))
  app.actions.set(`work:${t}`, { label: `${hub === placeHub ? "My Places" : hub === makeHub ? "Create" : "Explore"} › ${t}`, run: () => { hub.ctx.open(); open(hub.ctx); } });
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
  void arrive(app, {
    name: r.name || "This spot", kicker, lon: r.lon, lat: r.lat, radius: r.radius,
    fact: r.blurb ? firstSentence(r.blurb) : measureAt(r.lon, r.lat).then((m) => headline(m.v, r.kind)),
  });
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
const quizLink = /^#quiz=([\w-]+)/.exec(location.hash);
if (quizLink) void import("./work/quiz").then((m) => m.openQuizLink(app, quizLink[1]));
app.actions.set("story:open", { label: "Open a story", run: (id) => { if (id) void import("./stories/ui").then((m) => { makeHub.ctx.open(); void m.openStory(makeHub.ctx, id); }); } });
// A story someone shared: from the library (#story=…) or carried in the link (#s=…).
const openStoryHash = () => {
  const hash = location.hash;
  if (/^#(story|s)=/.test(hash)) void import("./stories/ui").then((m) => { closePanels(makeHub.panel); modes.set("make"); void m.openFromHash(makeHub.ctx, hash); });
};
openStoryHash();
// Pasting a story link into a tab that already has Atlas open.
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
  if (aiOn() && looksLikeAsk(q)) return { title: "Ask Atlas AI", steps: [p.steps.length ? describe(p).join(" → ") : "Claude will work out the steps"], run: () => void robot.ask(q.trim(), p.steps.length ? p : null) };
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
    // Places Atlas knows by name open their page.
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
    // One word that names an Atlas thing outright ("tour", "seasons", "railways"), and no place
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
$("ui").append(createMapControls(globe.viewer));

// Everything on the map, from every theme.
$("ui").append(createCanvasTray(app));

// Map style popover.
const layersBtn = $("layers-btn");
// Live traffic: planes and ships moving on the globe.
const traffic = createTraffic(app);
const LIVE: LiveSwitch[] = [
  { label: "Planes", about: "Every aircraft in view, live over ADS-B, flying at its real height. Tap one for its card; follow it.", on: () => traffic.isOn("plane"), set: (v) => traffic.set("plane", v), status: () => (traffic.count("plane") ? `${traffic.count("plane").toLocaleString()} live` : traffic.note("plane")) },
  { label: "Ships", about: "Vessels live over AIS: cargo, tankers, ferries, fishing boats. Tap one for its card.", on: () => traffic.isOn("ship"), set: (v) => traffic.set("ship", v), status: () => (traffic.count("ship") ? `${traffic.count("ship").toLocaleString()} live` : traffic.note("ship")) },
  // The other live overlays, so everything happening now is switched from one place.
  ...(["quakes", "radar", "aurora"] as const).map((id) => {
    const o = OVERLAYS.find((x) => x.id === id)!;
    return { label: o.label, about: o.about, on: () => overlays.isOn(id), set: (v: boolean) => void overlays.set(id, v) } satisfies LiveSwitch;
  }),
];
for (const kind of ["plane", "ship"] as const)
  app.actions.set(`live:${kind}s`, { label: kind === "plane" ? "Live planes" : "Live ships", run: () => traffic.set(kind, true), isOn: () => traffic.isOn(kind), stop: () => traffic.set(kind, false) });
// A shared flight or ship (#follow=p:a1b2c3@lon,lat): open Atlas following it.
const followHash = () => {
  const m = /^#follow=([ps]:[\w-]+)@(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  if (m) setTimeout(() => traffic.openShared(m[1], Number(m[2]), Number(m[3])), 2500);
};
followHash();
addEventListener("hashchange", followHash);
let layers = createLayersPanel(globe, LIVE);
$("ui").append(layers);
layersBtn.innerHTML = icons.layers;
const toggleLayers = (open = layers.hidden) => {
  if (open) {
    // Rebuilt on open so it matches the canvas (layers can be removed from the tray).
    const fresh = createLayersPanel(globe, LIVE);
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
layersBtn.addEventListener("click", () => { const open = layers.hidden; for (const c of [placeHub.ctx, makeHub.ctx, lookHub.ctx]) c.close(); myPlaces.close(); pro.close(); space.close(); toggleLayers(open); });
globe.viewer.scene.canvas.addEventListener("pointerdown", () => toggleLayers(false));

// Time: one slider from the ancient world to 2100 (borders of the time, the view from space, projections).
const timeBar = new TimeBar(app);
$("ui").append(timeBar.el);
const timeBtn = h("button", { id: "time-btn", class: "round-btn", "aria-label": "Time: see the globe in another year", html: iconSvg("⏳", 20) ?? "" });
timeBtn.addEventListener("click", () => (timeBar.el.hidden ? timeBar.open() : timeBar.close()));
layersBtn.before(timeBtn);
app.actions.set("time:open", { label: "Time travel", run: () => timeBar.open() });
// "1914", or "1914@lon,lat" to light up whoever governed that place.
app.actions.set("time:go", { label: "Go to a year", run: (arg) => {
  const m = /^(-?\d+)(?:@(-?[\d.]+),(-?[\d.]+))?$/.exec(arg ?? "");
  if (m) timeBar.goToYear(Number(m[1]), m[2] ? [Number(m[2]), Number(m[3])] : undefined);
} });

// About / data sources.
const about = $("about-btn");
about.innerHTML = icons.info;
const soundBtn = h("button", { class: "pill-btn sound-toggle", "aria-pressed": String(soundOn()) }, soundOn() ? "Sounds on" : "Sounds off") as HTMLButtonElement;
soundBtn.addEventListener("click", () => { const on = !soundOn(); setSound(on); soundBtn.textContent = on ? "Sounds on" : "Sounds off"; soundBtn.setAttribute("aria-pressed", String(on)); });
const aboutPanel = h("div", { class: "popover about", hidden: true },
  h("div", { class: "about-head" }, h("h2", { class: "group-title" }, "About Atlas"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (aboutPanel.hidden = true) })),
  h("p", {}, "Atlas does three things, switched at the top. Explore: the whole Earth and space; tap anything, then flip through the themes or look at it through a lens. Create: trips, stories, videos and lessons made from the map. My Places: your home, farm, site or business, with a daily brief and the tools to run it."),
  h("p", {}, "You can also type a request into the search box, like \u201cstorm drains and railways in Chicago\u201d, and Atlas will plan the steps and do them."),
  h("p", {}, "People have pages here too: the places they love, a journal, and lenses they've made. Make your own from the account button, and a lens of your own in Lens Studio."),
  h("button", { class: "pill-btn about-ai", onclick: () => { aboutPanel.hidden = true; aiSettings.open(); } }, aiOn() ? "Atlas AI: connected · settings" : "Connect Atlas AI (Claude)…"),
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
  h("p", { class: "fineprint" }, "What you make in Atlas (your page, places, lenses, farm records, plans) stays in this browser; there are no ads and no tracking. To answer you, Atlas asks public services about the places you look at (for example OpenStreetMap for names and Open-Meteo for weather), which sends them the coordinates, not who you are. With Atlas AI on, your requests go to Anthropic."),
  h("p", { class: "fineprint" }, "Keyboard: 1–9 switch themes · / searches · + and − zoom · Esc cancels a line or closes a chart. Double-click to zoom in on a spot."),
  // Showing Atlas to people one after another on the same computer.
  (() => {
    const row = h("div", { class: "about-row" }, h("span", { class: "muted small" }, "Showing Atlas to people one after another? Start fresh for the next visitor: the opening, the tour and a clean slate (Atlas AI and feedback notes are kept)."));
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
    { label: aiOn() ? "Atlas AI: connected" : "Connect Atlas AI", icon: icons.sparkle, run: () => aiSettings.open() },
    { label: "Send feedback", icon: icons.pencil, run: () => void import("./ui/feedback").then((m) => m.openFeedback(app)) },
    { label: "About Atlas and its data", icon: icons.info, run: () => { aboutPanel.hidden = false; } },
    soundRow,
  ],
});
about.replaceWith(social.account.button);
$("ui").append(social.account.menu);
hideSocial = () => { if (social.profiles.isOpen) social.profiles.close(); if (social.studio.isOpen) social.studio.close(); };
app.onPlace = (p) => {
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
// the card lets go of it and shows what's in view instead, with "Back to …" one tap away. Atlas's own camera
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
    if (home && !tourDone()) setTimeout(() => startTour(app), 1200);
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

// Offline: the app, bundled data and the map tiles you've seen keep working without a connection.
if (import.meta.env.PROD && "serviceWorker" in navigator)
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => {}));

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { atlas: { app, globe, labels, overlays, feeds, traffic, cart: (lon: number, lat: number, h: number) => Cartesian3.fromDegrees(lon, lat, h) } });
  void import("cesium").then((Cesium) => Object.assign(window, { Cesium }));
}
