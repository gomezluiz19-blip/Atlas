// Everything the search box can show or open, gathered from the app's own
// registries: themes, their "On the map" layers, networks, live overlays,
// people views, tools, lenses and the library's featured stories.
import type { App } from "../app";
import { FEATURED } from "../content/stories";
import { VIEWS } from "../data/people";
import { THEME_LAYERS, switchLayer, layerIsOn } from "../explore/featureLayers";
import { NETWORKS } from "../globe/networks";
import { OVERLAYS, type Overlays } from "../globe/overlays";
import { LENSES } from "../lenses";
import type { WorkTool } from "../work/hub";
import type { OverlayKind } from "../globe/viewer";
import type { Thing } from "./frontDoor";

const THEME: Record<string, { emoji: string; words: string }> = {
  explore: { emoji: "🧭", words: "overview discover browse explore" },
  money: { emoji: "💰", words: "money finance commerce trade business economy companies currency exchange rate dollar inflation interest banks stock market shopping malls markets" },
  sports: { emoji: "🏟️", words: "sport stadium arena teams football soccer baseball basketball athletes gym pitch" },
  fashion: { emoji: "👗", words: "clothes boutique designers brands labels style fashion week tailor shoes" },
  food: { emoji: "🍲", words: "restaurants cafes eat cuisine dishes dining markets bakery" },
  tourism: { emoji: "🧳", words: "tourism tourists visitors hotels stay sights attractions heritage unesco travel" },
  education: { emoji: "🎓", words: "education schools universities colleges literacy libraries students" },
  health: { emoji: "🏥", words: "health hospitals clinics doctors pharmacy medical life expectancy" },
  arts: { emoji: "🎭", words: "music musicians bands artists theatre galleries venues concerts culture" },
  land: { emoji: "⛰️", words: "earth ground terrain rocks geology minerals mountains soil" },
  water: { emoji: "🌊", words: "rivers lakes oceans sea flood" },
  climate: { emoji: "🌦️", words: "weather temperature rain forecast" },
  plants: { emoji: "🌿", words: "trees flowers vegetation species" },
  animals: { emoji: "🐾", words: "wildlife species birds" },
  built: { emoji: "🏙️", words: "cities infrastructure buildings roads" },
  people: { emoji: "👥", words: "population demographics census" },
  countries: { emoji: "🗺️", words: "nations borders economy" },
  space: { emoji: "🪐", words: "satellites iss planets stars launches" },
};
const NET_EMOJI: Record<string, string> = { rail: "🚆", roads: "🚗", shipping: "🚢", ports: "⚓", airports: "✈️", power: "🏭", cables: "〰️" };
const OVERLAY_EMOJI: Record<string, string> = { labels: "🏷️", aurora: "🌌", quakes: "〽️", plates: "🧩", lights: "🌃", radar: "🌧️", species: "🔬" };
const TOOL: Record<string, { emoji: string; words: string }> = {
  grow: { emoji: "🌱", words: "farm crops field harvest" }, flock: { emoji: "🐾", words: "animals livestock herd vet" },
  build: { emoji: "🏗️", words: "construction project site house" }, occupancy: { emoji: "🏢", words: "rooms bookings hotel" },
  plan: { emoji: "🗓️", words: "trip travel itinerary route event holiday" }, present: { emoji: "📖", words: "story slides presentation tour" },
  video: { emoji: "🎬", words: "record film movie studio" }, teach: { emoji: "🎓", words: "lesson quiz class students" },
  ask: { emoji: "✨", words: "find search suitable conditions land where" }, learn: { emoji: "🏛️", words: "games museums quiz challenge" },
  space: { emoji: "🪐", words: "satellites iss launches" },
  office: { emoji: "🏛️", words: "politics pro congress district office constituents casework whip count bill staff crm legislature campaign town hall" },
  network: { emoji: "🔗", words: "business network supply chain logistics suppliers partners customers shipping goods flows carbon" },
  news: { emoji: "🗞️", words: "news headlines world now happening today stories current events wildfires storms" },
  year: { emoji: "🌱", words: "seasons year months greening spring summer autumn winter solstice equinox rhythm" },
};

/** The analysis layers drawn by the globe itself (from the Layers popover, now stacked like any view). */
const ANALYSIS: { kind: OverlayKind; label: string; emoji: string; about: string }[] = [
  { kind: "geology", label: "Geologic map", emoji: "🪨", about: "Bedrock at the surface, coloured by rock unit and age" },
  { kind: "elevation", label: "Elevation colours", emoji: "⛰️", about: "Height above sea level, and depth below it" },
  { kind: "slope", label: "Slope", emoji: "📐", about: "How steep the ground is" },
  { kind: "contours", label: "Contour lines", emoji: "〰️", about: "Lines of equal height, finer as you zoom in" },
];
const LIVE_OVERLAYS = new Set(["quakes", "radar", "aurora"]);

export function buildThings(app: App, overlays: Overlays, tools: WorkTool[]): Thing[] {
  const out: Thing[] = [];
  const act = (id: string, arg?: string) => () => app.actions.get(id)?.run(arg);
  const stop = (id: string) => () => app.actions.get(id)?.stop?.();
  const themeLabel = (id: string) => app.themes.find((t) => t.id === id)?.label ?? id;
  for (const t of app.themes)
    out.push({ title: t.label, detail: t.intro, words: THEME[t.id]?.words, emoji: THEME[t.id]?.emoji ?? "🌍", group: "Open", run: () => app.setTheme(t.id) });
  const seen = new Set<string>();
  for (const [themeId, layers] of Object.entries(THEME_LAYERS))
    for (const l of layers) {
      if (seen.has(l.label)) continue;
      seen.add(l.label);
      out.push({ title: l.label, detail: l.about, emoji: l.emoji, group: "Show on the map", words: themeId, on: () => layerIsOn(app, themeId, l),
        shelf: themeLabel(themeId), off: () => void switchLayer(app, themeId, l, false),
        run: () => void switchLayer(app, themeId, l, true).then(() => app.toast(`${l.label} on the map. Tap its bubble at the edge of the globe to hide it.`, 3000)) });
    }
  for (const [id, title, emoji, detail, words] of [
    ["live:planes", "Live planes", "✈️", "Every aircraft in view, moving live at its real height", "planes flights aircraft flying overhead air traffic adsb flight tracker"],
    ["city:life", "Living city", "🏙️", "3D buildings and trees, with cars and people moving on the real streets", "3d city buildings traffic people pedestrians cars simulation streets living"],
    ["live:ships", "Live ships", "🚢", "Vessels moving live over AIS: cargo, tankers, ferries", "ships boats vessels marine traffic ais shipping ferries"],
  ] as const)
    out.push({ title, detail, emoji, group: "Show on the map", words, on: () => !!app.actions.get(id)?.isOn?.(), run: act(id), off: stop(id), shelf: "Live" });
  out.push({ title: "Wind", detail: "The wind now, flowing over the whole view", emoji: "💨", group: "Show on the map", words: "wind breeze gusts air flow weather", shelf: "Live",
    on: () => !!app.actions.get("wind:toggle")?.isOn?.(), run: () => { if (!app.actions.get("wind:toggle")?.isOn?.()) act("wind:toggle")(); }, off: stop("wind:toggle") });
  for (const n of NETWORKS)
    if (!seen.has(n.label)) {
      seen.add(n.label);
      out.push({ title: n.label, detail: n.about, emoji: NET_EMOJI[n.id] ?? "🗺️", group: "Show on the map", words: n.id === "roads" ? "roads motorways" : n.id, on: () => !!app.actions.get(`net:${n.id}`)?.isOn?.(), run: act(`net:${n.id}`), off: stop(`net:${n.id}`), shelf: "Networks" });
    }
  for (const o of OVERLAYS)
    if (o.id !== "labels" && !seen.has(o.label)) {
      seen.add(o.label);
      out.push({ title: o.label, detail: o.about, emoji: OVERLAY_EMOJI[o.id] ?? "✨", group: "Show on the map", on: () => overlays.isOn(o.id), run: () => void overlays.set(o.id, true), off: () => void overlays.set(o.id, false), shelf: LIVE_OVERLAYS.has(o.id) ? "Live" : "The whole Earth" });
    }
  for (const a of ANALYSIS) {
    const st = () => app.globe.state.overlays[a.kind];
    out.push({ title: a.label, detail: a.about, emoji: a.emoji, group: "Show on the map", words: "analysis terrain layer", shelf: "Analysis",
      on: () => st().on, run: () => { st().on = true; app.globe.apply(); }, off: () => { st().on = false; app.globe.apply(); } });
  }
  out.push({ title: "Where people live", detail: "Every town and city as a glow", emoji: "👥", group: "Show on the map", words: "population density heat map", run: act("people:view", "pop") });
  for (const v of VIEWS)
    out.push({ title: v.label, detail: `${v.about}, country by country`, emoji: v.emoji, group: "Show on the map", words: `people ${v.group}`, run: act("people:view", v.id) });
  for (const t of tools)
    out.push({ title: t.label, detail: t.about, emoji: TOOL[t.id]?.emoji ?? "✨", group: "Open", words: TOOL[t.id]?.words, run: t.id === "space" ? () => app.setTheme("space") : t.id === "occupancy" ? act("pro:occupancy") : t.id === "year" ? act("rhythms:year") : act(`work:${t.id}`) });
  for (const l of LENSES)
    out.push({ title: `${l.label} lens`, detail: l.blurb, emoji: l.icon, group: "Open", words: l.id === "day" ? "lens look sunrise sunset shadows golden hour light sun rhythm" : "lens look", run: act(`lens:${l.id}`) });
  for (const s of FEATURED)
    out.push({ title: s.title, detail: s.summary, emoji: "📖", group: "Stories", words: `story ${s.tags.join(" ")}`, run: act("story:open", s.id) });
  // The economy and the field views, from anywhere.
  for (const [id, title, emoji, detail, words] of [
    ["econ:desk", "Commodity desk", "⛏️", "Raw materials as markets: where they're mined and refined, prices, supply risk, policies and what-ifs", "commodities raw materials metals lithium copper cobalt oil gas wheat cocoa coffee prices supply chain critical minerals refining"],
    ["econ:portfolio", "My portfolio", "📈", "Where you're invested, as a map: where your companies earn, their supply chains, raw materials and the policies about to bite", "portfolio investments stocks shares holdings exposure invest my money"],
    ["econ:lab", "What if…", "⚡", "Play out a shock (a blockade, an export ban, a drought) and see prices, companies and your portfolio react", "what if scenario stress test shock simulate model blockade export ban recession tariffs"],
    ["view:matchday", "Matchday sun and shade", "🏟️", "Stands cast real shadows over the pitch through a match; the best kickoff, the weather and fans in reach", "stadium kickoff shade sun pitch match fixture"],
    ["view:soil", "Soil profile", "🪱", "The ground two metres down in 3D: texture, pH, carbon, water held, and what it suits", "soil quality ph clay sand loam farm field drainage"],
    ["view:sun", "Sun on a building", "🏢", "Hours of sun on every floor of every face, and what a tower across the street would take", "sunlight daylight apartment facade south facing shadow building"],
    ["view:crowd", "Crowd flow", "🚇", "How a crowd leaves a venue: stations, queues and clearing times", "crowd egress concert stadium exit stations queue"],
    ["view:site", "Site potential", "☀️", "Sun paths and a wind rose in 3D, and what the land could make from solar and wind", "solar wind farm site renewable yield irradiance energy potential"],
  ] as const)
    out.push({ title, detail, emoji, group: "Open", words, run: act(id) });
  // The enterprise tools: schools, construction, a city.
  for (const [id, arg, title, emoji, detail, words] of [
    ["ent:edu", "", "Education Pro", "🏫", "Run schools from the map: cover for who's out, every room in 3D, repairs, drills, buses, trips and lessons", "principal school district superintendent substitute cover attendance teachers staff campus"],
    ["ent:con", "", "Construction Pro", "🏗️", "The region's sites rising in 3D: stages, trades and when, the schedule, materials and the pipeline", "construction sites contractor general contractor developer pipeline permits building projects region"],
    ["ent:con", "union", "Union site tracker", "✊", "Which sites need your craft now and soon, who's signatory, visits, safety and today's route", "union organizer business agent bricklayers ironworkers carpenters electricians signatory site visits building trades local"],
    ["ent:con", "supplier", "Construction material demand", "🚚", "What the region's sites will need month by month, and who to call", "concrete rebar brick block drywall glazing supplier building materials sales leads"],
    ["ent:gov", "", "City Ops", "🏛️", "A city's facilities, agencies, people, capital projects, incidents and 311 on one map, with the morning brief", "mayor city hall government agencies facilities municipal operations commissioner city manager"],
    ["ent:gov", "311", "311 heat map", "📞", "A day of 311 requests as a heat map you can play hour by hour", "311 complaints service requests noise heat hot water potholes city"],
  ] as const)
    out.push({ title, detail, emoji, group: "Open", words, run: arg ? act(id, arg) : act(id) });
  out.push({ title: "Show me something amazing", detail: "Somewhere unexpected, and why it's worth seeing", emoji: "🎲", group: "Open", words: "surprise random wonder amazing beautiful inspire", run: act("surprise") });
  out.push({ title: "Take the tour", detail: "A one-minute walk through what Atlas can do", emoji: "🧭", group: "Open", words: "tour help tutorial guide intro introduction how start learn", run: act("tour") });
  out.push({ title: "Time travel", detail: "The globe in any year: borders of the time, the view from space, projections", emoji: "⏳", group: "Open", words: "time history past then now future year years borders empires old", run: act("time:open") });
  return out;
}
