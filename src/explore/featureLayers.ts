// What each theme can put on the map with one tap: Earth's peaks, volcanoes,
// canyons and craters; Water's deeps, lakes, rivers and falls; Climate's snow,
// surface heat and rain; Plants' forests and greenness; Animals' wildlife
// wonders and great migrations; Built's metro systems. Each switch-on joins the
// shared "On the map" tray, so it stays while you look through other themes.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import type { App } from "../app";
import type { PlaceKind } from "../analysis/placeKinds";
import { FEATURES, type FeatureKind } from "../content/features";
import { FEATURE_COLOR as C, PIGMENT as P } from "../content/kindColor";
import { MIGRATIONS, WILD_PLACES } from "../content/wildlife";
import { gbifTiles } from "../data/inaturalist";
import { riverLines } from "../data/worldData";
import type { MapLabel } from "../globe/labels";
import { canvasLayer, tracePath } from "../globe/networkLayer";
import { h } from "../ui/dom";
import { iconFor } from "../ui/glyph";

export interface Layer {
  id: string;
  emoji: string;
  label: string;
  about: string;
  color: string;
  /** Switch on; returns how to show/hide and remove it. */
  on?(app: App): { show(v: boolean): void; remove(): void } | Promise<{ show(v: boolean): void; remove(): void }>;
  /** Or: an existing app action (overlay:*, net:*, globe:*). */
  action?: string;
}

const KIND_OF: Record<FeatureKind, PlaceKind> = {
  peak: "peak", volcano: "volcano", desert: "desert", canyon: "nature", crater: "nature", deep: "water",
  lake: "water", river: "water", waterfall: "waterfall", forest: "park", metro: "transport",
  glacier: "glacier", island: "island", reef: "water", cave: "nature", range: "range", plateau: "region", wetland: "water", rift: "nature",
};

/** Named features of some kinds as map labels. */
const features = (id: string, emoji: string, label: string, about: string, color: string, kinds: FeatureKind[]): Layer => ({
  id, emoji, label, about, color,
  on(app) {
    const list: MapLabel[] = FEATURES.filter((f) => kinds.includes(f.kind)).map((f) => ({
      id: `fl:${id}:${f.name}`, name: f.name, lon: f.lon, lat: f.lat, kind: KIND_OF[f.kind], rank: 320,
      sub: f.facts[0]?.[1], data: { source: "feature", notable: { description: f.blurb.split(/(?<=\.)\s/)[0] } },
    }));
    const src = `fl:${id}`;
    app.labels?.set(src, list);
    return { show: (v) => app.labels?.set(src, v ? list : []), remove: () => app.labels?.set(src, []) };
  },
});

/** A tile layer (NASA GIBS or GBIF) over the map. */
const tiles = (id: string, emoji: string, label: string, about: string, color: string, url: string, maximumLevel: number, credit: string, alpha = 0.8): Layer => ({
  id, emoji, label, about, color,
  on(app) {
    const layer = new ImageryLayer(new UrlTemplateImageryProvider({ url, maximumLevel, credit }), { alpha });
    app.globe.viewer.imageryLayers.add(layer);
    return { show: (v) => (layer.show = v), remove: () => app.globe.viewer.imageryLayers.remove(layer, true) };
  },
});
const gibs = (layer: string, level: number, ext = "png") => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/default/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;

const rivers: Layer = {
  id: "rivers", emoji: "〰️", label: "Rivers", about: "The world's rivers traced in blue, big ones bolder", color: C.river,
  async on(app) {
    const lines = (await riverLines()).map((r) => {
      let w = 180, s = 90, e = -180, n = -90;
      for (let i = 0; i < r.pts.length; i += 2) { w = Math.min(w, r.pts[i]); e = Math.max(e, r.pts[i]); s = Math.min(s, r.pts[i + 1]); n = Math.max(n, r.pts[i + 1]); }
      return { xy: new Float32Array(r.pts), bbox: [w, s, e, n] as [number, number, number, number], rank: r.rank, minZoom: r.minZoom };
    });
    const layer = canvasLayer((ctx, t) => {
      for (const l of lines) {
        if (l.minZoom > t.level + 2 || !t.touches(l.bbox)) continue;
        ctx.beginPath();
        tracePath(ctx, t, l.xy);
        ctx.strokeStyle = "rgba(76, 201, 240, 0.95)";
        ctx.lineWidth = Math.max(1.2, (t.level + 2) * 0.7 - l.rank * 0.25);
        ctx.stroke();
      }
    }, { maximumLevel: 10, credit: "Rivers: Natural Earth" });
    app.globe.viewer.imageryLayers.add(layer);
    return { show: (v) => (layer.show = v), remove: () => app.globe.viewer.imageryLayers.remove(layer, true) };
  },
};

const wildPlaces: Layer = {
  id: "wild", emoji: "🦓", label: "Wildlife wonders", about: "The planet's great places to see animals in the wild", color: P.terracotta,
  on(app) {
    const list: MapLabel[] = WILD_PLACES.map((p) => ({ id: `wild:${p.name}`, name: `${p.emoji} ${p.name}`, lon: p.lon, lat: p.lat, kind: "other", rank: 330, data: { source: "feature", notable: { description: p.what } } }));
    app.labels?.set("fl:wild", list);
    return { show: (v) => app.labels?.set("fl:wild", v ? list : []), remove: () => app.labels?.set("fl:wild", []) };
  },
};

const migrations: Layer = {
  id: "migrations", emoji: "🦋", label: "Great migrations", about: "Where wildebeest, whales, terns, butterflies and turtles travel each year", color: P.madder,
  on(app) {
    const lines = MIGRATIONS.map((m) => {
      const flat = m.pts.flat();
      let w = 180, s = 90, e = -180, n = -90;
      for (const [x, y] of m.pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      return { m, xy: new Float32Array(flat), bbox: [w, s, e, n] as [number, number, number, number] };
    });
    const layer = canvasLayer((ctx, t) => {
      for (const l of lines) {
        if (!t.touches(l.bbox, 20)) continue;
        ctx.beginPath();
        tracePath(ctx, t, l.xy);
        ctx.setLineDash([14, 9]);
        ctx.lineWidth = 7; ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = l.m.color; ctx.stroke();
      }
    }, { maximumLevel: 9, credit: "Migration routes: simplified sketches" });
    app.globe.viewer.imageryLayers.add(layer);
    const list: MapLabel[] = MIGRATIONS.map((m) => { const p = m.pts[Math.floor(m.pts.length / 2)]; return { id: `mig:${m.name}`, name: `${m.emoji} ${m.name}`, lon: p[0], lat: p[1], kind: "other", rank: 335, data: { source: "feature", notable: { description: m.about } } }; });
    app.labels?.set("fl:migrations", list);
    return {
      show: (v) => { layer.show = v; app.labels?.set("fl:migrations", v ? list : []); },
      remove: () => { app.globe.viewer.imageryLayers.remove(layer, true); app.labels?.set("fl:migrations", []); },
    };
  },
};

export const THEME_LAYERS: Record<string, Layer[]> = {
  land: [
    features("peaks", "⛰️", "Peaks", "The great mountains, with their heights", C.peak, ["peak"]),
    features("ranges", "🏔️", "Mountain ranges", "The great ranges, with their highest points", C.range, ["range"]),
    features("volcanoes", "🌋", "Volcanoes", "Famous volcanoes, active and sleeping", C.volcano, ["volcano"]),
    features("rifts", "〰️", "Rifts and faults", "Where the plates pull apart, grind past and collide", C.rift, ["rift"]),
    features("plateaus", "🗺️", "Plateaus", "The high tablelands", C.plateau, ["plateau"]),
    features("canyons", "🏞️", "Canyons", "The deepest gorges on Earth", C.canyon, ["canyon"]),
    features("caves", "🕳️", "Caves", "The deepest, longest and strangest caves", C.cave, ["cave"]),
    features("islands", "🏝️", "Islands", "The great islands, and a few young ones", C.island, ["island"]),
    features("deserts", "🏜️", "Deserts", "Hot and cold deserts", C.desert, ["desert"]),
    features("craters", "☄️", "Impact craters", "Where asteroids hit", C.crater, ["crater"]),
    { id: "plates", emoji: "🧩", label: "Plates", about: "Where the tectonic plates meet", color: P.terracotta, action: "overlay:plates" },
    { id: "quakes", emoji: "〽️", label: "Earthquakes", about: "This week's earthquakes", color: P.ochre, action: "overlay:quakes" },
    { id: "geology", emoji: "🪨", label: "Rocks", about: "The bedrock, coloured by age and type", color: P.violet, action: "globe:geology" },
    { id: "contours", emoji: "📈", label: "Contours", about: "Lines of equal height", color: P.stone, action: "globe:contours" },
  ],
  water: [
    features("deeps", "🕳️", "Ocean deeps", "The deepest trenches", C.deep, ["deep"]),
    features("reefs", "🪸", "Coral reefs", "The great reefs, built by living things", C.reef, ["reef"]),
    features("lakes", "🏞️", "Lakes", "The great lakes of the world", C.lake, ["lake"]),
    features("wetlands", "🦩", "Wetlands and deltas", "Floodplains, swamps and river deltas", C.wetland, ["wetland"]),
    features("ice", "🧊", "Ice", "Ice sheets, ice caps and great glaciers", C.glacier, ["glacier"]),
    rivers,
    features("rivernames", "🛶", "Great rivers", "The longest rivers, with their facts", C.river, ["river"]),
    features("falls", "💧", "Waterfalls", "The tallest and widest falls", C.waterfall, ["waterfall"]),
    { id: "radar", emoji: "🌧️", label: "Rain now", about: "Live rain radar", color: P.cobalt, action: "overlay:radar" },
    { id: "shipping", emoji: "🚢", label: "Shipping lanes", about: "The main sea routes", color: P.cerulean, action: "net:shipping" },
    { id: "ports", emoji: "⚓", label: "Ports", about: "The world's seaports", color: P.cobalt, action: "net:ports" },
  ],
  climate: [
    { id: "radar", emoji: "🌧️", label: "Rain now", about: "Live rain radar", color: P.cobalt, action: "overlay:radar" },
    tiles("heat", "🌡️", "Surface heat", "How hot the ground is by day (NASA MODIS)", P.terracotta, gibs("MODIS_Terra_Land_Surface_Temp_Day", 7), 7, "Land surface temperature: NASA MODIS (GIBS)", 0.75),
    tiles("snow", "❄️", "Snow cover", "Where snow lies today (NASA MODIS)", P.ice, gibs("MODIS_Terra_NDSI_Snow_Cover", 8), 8, "Snow cover: NASA MODIS (GIBS)", 0.85),
    features("ice", "🧊", "Ice", "Ice sheets, ice caps and great glaciers", C.glacier, ["glacier"]),
    { id: "aurora", emoji: "🌌", label: "Aurora", about: "Tonight's northern and southern lights", color: P.sage, action: "overlay:aurora" },
    features("deserts", "🏜️", "Deserts", "The driest places on Earth", C.desert, ["desert"]),
  ],
  plants: [
    features("forests", "🌲", "Great forests", "The world's great forests", C.forest, ["forest"]),
    tiles("ndvi", "🌿", "Greenness", "How green the land is this week (NASA MODIS)", P.sap, gibs("MODIS_Terra_NDVI_8Day", 9), 9, "Vegetation: NASA MODIS NDVI (GIBS)", 0.8),
    tiles("plantrecords", "🌼", "Plant records", "Where plants have been recorded (GBIF)", P.sage, gbifTiles(6), 14, "Species records: GBIF.org", 0.85),
    features("wetlands", "🦩", "Wetlands", "Where water and plants make the richest ground", C.wetland, ["wetland"]),
    features("deserts", "🏜️", "Deserts", "Where little grows", C.desert, ["desert"]),
  ],
  animals: [
    wildPlaces,
    migrations,
    features("reefs", "🪸", "Coral reefs", "A quarter of all sea life, on under 1% of the sea floor", C.reef, ["reef"]),
    tiles("animalrecords", "🐾", "Animal records", "Where animals have been recorded (GBIF)", P.terracotta, gbifTiles(1), 14, "Species records: GBIF.org", 0.85),
    { id: "species", emoji: "🔬", label: "All life", about: "Every kind of life recorded (GBIF)", color: P.sage, action: "overlay:species" },
  ],
  built: [
    features("metros", "🚇", "Metro systems", "The world's great metros", C.metro, ["metro"]),
    { id: "lights", emoji: "🌃", label: "Night lights", about: "Cities seen from space at night", color: P.naples, action: "overlay:lights" },
  ],
};

const layerKey = (themeId: string, l: Layer) => `fl:${themeId}:${l.id}`;
/** Whether a theme's layer is on the map. */
export const layerIsOn = (app: App, themeId: string, l: Layer) => (l.action ? !!app.actions.get(l.action)?.isOn?.() : app.canvas.has(layerKey(themeId, l)));

/** Switches one of a theme's layers on or off (it joins the "On the map" tray). */
export async function switchLayer(app: App, themeId: string, l: Layer, on = !layerIsOn(app, themeId, l)) {
  if (l.action) {
    const a = app.actions.get(l.action);
    if (!a || on === !!a.isOn?.()) return;
    if (on) a.run(); else a.stop?.();
    return;
  }
  const id = layerKey(themeId, l);
  if (!on) { app.canvas.remove(id); return; }
  if (app.canvas.has(id)) return;
  try {
    const got = await l.on!(app);
    app.canvas.put({ id, label: `${l.emoji} ${l.label}`, color: l.color, scope: "world", pinned: true, show: got.show, remove: got.remove }, true);
  } catch {
    app.toast(`Couldn't load ${l.label.toLowerCase()}. Check the connection and try again.`, 4000);
  }
}

/** The switches for a theme, or null if it has none. */
export function featureChips(app: App, themeId: string): HTMLElement | null {
  const list = THEME_LAYERS[themeId];
  if (!list?.length) return null;
  const isOn = (l: Layer) => layerIsOn(app, themeId, l);
  const box = h("div", { class: "fl-chips", role: "group", "aria-label": "On the map" });
  const render = () => box.replaceChildren(...list.map((l) => {
    const on = isOn(l);
    return h("button", { class: `fl-chip${on ? " on" : ""}`, style: `--c:${l.color}`, "aria-pressed": String(on), title: l.about, onclick: () => void toggle(l) },
      iconFor(l.emoji, 15), h("span", {}, l.label));
  }));
  const toggle = async (l: Layer) => { await switchLayer(app, themeId, l); render(); setTimeout(render, 50); };
  render();
  const off = app.canvas.subscribe(() => { if (!box.isConnected) off(); else render(); });
  return h("section", { class: "group fl-group" }, h("h2", { class: "group-title" }, "On the map"), box);
}
