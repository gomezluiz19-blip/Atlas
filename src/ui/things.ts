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
import type { Thing } from "./frontDoor";

const THEME: Record<string, { emoji: string; words: string }> = {
  explore: { emoji: "🧭", words: "discover browse" },
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
  year: { emoji: "🌱", words: "seasons year months greening spring summer autumn winter solstice equinox rhythm" },
};

export function buildThings(app: App, overlays: Overlays, tools: WorkTool[]): Thing[] {
  const out: Thing[] = [];
  const act = (id: string, arg?: string) => () => app.actions.get(id)?.run(arg);
  for (const t of app.themes)
    out.push({ title: t.label, detail: t.intro, words: THEME[t.id]?.words, emoji: THEME[t.id]?.emoji ?? "🌍", group: "Open", run: () => app.setTheme(t.id) });
  const seen = new Set<string>();
  for (const [themeId, layers] of Object.entries(THEME_LAYERS))
    for (const l of layers) {
      if (seen.has(l.label)) continue;
      seen.add(l.label);
      out.push({ title: l.label, detail: l.about, emoji: l.emoji, group: "Show on the map", words: themeId, on: () => layerIsOn(app, themeId, l),
        run: () => void switchLayer(app, themeId, l, true).then(() => app.toast(`${l.label} on the map. Switch it off from “On the map”.`, 3000)) });
    }
  for (const n of NETWORKS)
    if (!seen.has(n.label)) {
      seen.add(n.label);
      out.push({ title: n.label, detail: n.about, emoji: NET_EMOJI[n.id] ?? "🗺️", group: "Show on the map", words: n.id === "roads" ? "roads motorways" : n.id, on: () => !!app.actions.get(`net:${n.id}`)?.isOn?.(), run: act(`net:${n.id}`) });
    }
  for (const o of OVERLAYS)
    if (o.id !== "labels" && !seen.has(o.label)) {
      seen.add(o.label);
      out.push({ title: o.label, detail: o.about, emoji: OVERLAY_EMOJI[o.id] ?? "✨", group: "Show on the map", on: () => overlays.isOn(o.id), run: () => void overlays.set(o.id, true) });
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
  out.push({ title: "Show me something amazing", detail: "Somewhere unexpected, and why it's worth seeing", emoji: "🎲", group: "Open", words: "surprise random wonder amazing beautiful inspire", run: act("surprise") });
  out.push({ title: "Take the tour", detail: "A one-minute walk through what Atlas can do", emoji: "🧭", group: "Open", words: "tour help tutorial guide intro introduction how start learn", run: act("tour") });
  out.push({ title: "Time travel", detail: "The globe in any year: borders of the time, the view from space, projections", emoji: "⏳", group: "Open", words: "time history past then now future year years borders empires old", run: act("time:open") });
  return out;
}
