// Water › City water: how water moves through the built-up area around a place.
// Rain runs off roofs and streets into drains and ditches, buried streams and
// culverts, stormwater basins, then rivers and canals; drinking water comes from
// water works and towers, and sewage goes to treatment plants. All drawn on the
// map from OpenStreetMap, and kept there while you look through other themes.
import type { ImageryLayer } from "cesium";
import type { App, Place, Subtab } from "../app";
import { CITY_WATER, summarize, toFeatures, type CityWaterFeature, type CityWaterKind } from "../analysis/cityWater";
import { overpass } from "../data/overpass";
import { km } from "../data/infra";
import { canvasLayer, drawDots, drawLines } from "../globe/networkLayer";
import { formatDistance, h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { asyncBlock, hero, note, section } from "./common";
import { FlowOverlay, type FlowLine } from "../globe/flow";

/** How each kind of channel flows on screen: rivers fast and bright, drains a trickle. */
const FLOW: Partial<Record<CityWaterKind, { speed: number; density: number; size: number; color: string }>> = {
  river: { speed: 90, density: 34, size: 2.2, color: "#8fb6dc" },
  canal: { speed: 45, density: 26, size: 2, color: "#8fd8ff" },
  stream: { speed: 70, density: 30, size: 1.8, color: "#9ee6ff" },
  drain: { speed: 40, density: 26, size: 1.5, color: "#b5f0ff" },
  pipe: { speed: 55, density: 22, size: 1.4, color: "#d6c3a0" },
};

/** The channels as moving water (downstream, the way OpenStreetMap draws waterways). */
function flowLines(fs: CityWaterFeature[]): FlowLine[] {
  return fs.filter((f) => f.line && FLOW[f.kind]).map((f) => {
    const k = FLOW[f.kind]!;
    return { pts: f.line as [number, number][], color: k.color, speed: k.speed, density: k.density, size: k.size, dim: f.underground };
  });
}

const RADII = [1, 2, 3, 5];

async function fetchCityWater(place: Place, radiusKm: number): Promise<CityWaterFeature[]> {
  const at = `around:${Math.round(radiusKm * 1000)},${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
  const els = await overpass(`[out:json][timeout:60];
(
  way(${at})["waterway"~"^(river|stream|canal|drain|ditch|tidal_channel)$"];
  nwr(${at})["waterway"~"^(dam|weir|lock_gate|sluice_gate)$"];
  nwr(${at})["man_made"~"^(water_works|wastewater_plant|water_tower|reservoir_covered|water_well|pumping_station)$"];
  way(${at})["man_made"="pipeline"]["substance"~"water|sewage|rain"];
  nwr(${at})["landuse"="basin"];
  nwr(${at})["basin"~"retention|detention|infiltration|stormwater"];
);
out tags geom 4000;`);
  return toFeatures(els);
}

const km1 = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** The map layer: channels (buried ones dashed), then basins and works as dots. */
function drawLayer(fs: CityWaterFeature[]): ImageryLayer {
  const lines = fs.filter((f) => f.line).map((f) => {
    const xy = new Float32Array(f.line!.flat());
    let w = 180, s = 90, e = -180, n = -90;
    for (const [x, y] of f.line!) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { attrs: [f.kind, f.underground ? 1 : 0], xy, bbox: [w, s, e, n] as [number, number, number, number] };
  });
  const points = fs.filter((f) => !f.line && f.point).map((f) => ({ lon: f.point![0], lat: f.point![1], kind: f.kind }));
  const width: Record<string, number> = { river: 3, canal: 2.6, stream: 1.8, drain: 1.3, pipe: 1.2 };
  return canvasLayer((ctx, t) => {
    drawLines(ctx, t, lines, (l, lv) => {
      const kind = l.attrs[0] as CityWaterKind, buried = l.attrs[1] === 1;
      if (lv < 11 && (kind === "drain" || kind === "pipe")) return null;
      const g = Math.min(1.6, 0.6 + (lv - 10) * 0.18);
      return { color: CITY_WATER[kind].color, width: (width[kind] ?? 1.5) * g, dash: buried ? [3, 2.5] : undefined, casing: kind === "river" || kind === "canal" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)" };
    });
    drawDots(ctx, t, points, (p, lv) => (lv < 11 ? null : { color: CITY_WATER[p.kind].color, radius: p.kind === "basin" ? 3.5 : 4.5 }));
  }, { maximumLevel: 18, credit: "City water: © OpenStreetMap contributors" });
}

function story(place: Place, fs: CityWaterFeature[], radiusKm: number): HTMLElement {
  const s = summarize(fs);
  const drains = s.open.drain;
  const nearest = (kind: CityWaterKind) =>
    fs.filter((f) => f.kind === kind && f.point).map((f) => ({ f, d: km(place.lon, place.lat, f.point![0], f.point![1]) })).sort((a, b) => a.d - b.d)[0];
  const isPlant = (f: CityWaterFeature) => f.el.tags?.man_made === "wastewater_plant";
  const wastewater = fs.filter((f) => f.kind === "wastewater" && f.point).map((f) => ({ f, d: km(place.lon, place.lat, f.point![0], f.point![1]) })).sort((a, b) => a.d - b.d);
  const plant = wastewater.find((x) => isPlant(x.f));
  const pumping = wastewater.find((x) => !isPlant(x.f));
  const works = nearest("supply");
  const p: string[] = [];
  p.push(drains > 0 || s.counts.basin > 0
    ? `Rain on roofs and streets here runs into drains and gutters. Within ${radiusKm} km, OpenStreetMap maps ${km1(drains)} of open drains and ditches${s.counts.basin ? ` and ${s.counts.basin} stormwater basin${s.counts.basin === 1 ? "" : "s"} that hold back floodwater` : ""}.`
    : `Rain on roofs and streets here runs into drains and gutters. In most cities these storm drains run under the streets and are rarely mapped, so few show up within ${radiusKm} km.`);
  if (s.buried > 0) p.push(`${km1(s.buried)} of streams and channels run hidden in culverts and tunnels (dashed on the map).`);
  if (s.mainChannels.length) p.push(`It all heads for ${listOf(s.mainChannels.slice(0, 3))}.`);
  if (works) p.push(`Drinking water: the nearest mapped supply works is ${works.f.name || "a " + supplyName(works.f)} (${formatDistance(works.d * 1000)} away).`);
  if (plant) p.push(`Sewage goes to treatment works such as ${plant.f.name || "one"} ${formatDistance(plant.d * 1000)} away, which clean it before it's released to a river or the sea.`);
  else if (pumping) p.push(`Sewage pumping stations${pumping.f.name ? ` like ${pumping.f.name}` : ""} (${formatDistance(pumping.d * 1000)} away) push it on to treatment works beyond this area.`);
  return h("div", { class: "water-story" }, ...p.map((x) => h("p", {}, x)));
}

function supplyName(f: CityWaterFeature): string {
  const mm = f.el.tags?.man_made ?? "";
  return mm === "water_tower" ? "water tower" : mm === "reservoir_covered" ? "covered reservoir" : mm === "water_well" ? "well" : mm === "pumping_station" ? "pumping station" : "water works";
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function cityWaterSubtab(): Subtab {
  let radius = 2;
  let layer: ImageryLayer | null = null;
  let lastKey = "";

  let flow: FlowOverlay | null = null;
  const put = (app: App, fs: CityWaterFeature[]) => {
    if (layer) app.globe.viewer.imageryLayers.remove(layer, true);
    layer = drawLayer(fs);
    app.globe.viewer.imageryLayers.add(layer);
    flow ??= new FlowOverlay(app.globe.viewer, { maxHeight: 30_000 });
    flow.set(flowLines(fs));
    flow.show(true);
    const l = layer, fl = flow;
    const where = app.place?.name?.title;
    // On the shared canvas: stays on while you look at this place through other themes.
    app.canvas.put({
      id: "water:city", label: `Water › City water${where ? ` · ${where}` : ""}`, color: "#3563d6", theme: "water", scope: "place", pinned: false,
      show: (v) => { l.show = v; fl.show(v); },
      remove: () => {
        app.globe.viewer.imageryLayers.remove(l, true);
        fl.set([]);
        if (layer === l) { layer = null; lastKey = ""; }
      },
    }, true);
  };

  return {
    id: "city",
    label: "City water",
    render({ app, place, body }) {
      const chips = h("div", { class: "chips", role: "radiogroup", "aria-label": "Radius" },
        h("span", { class: "chips-label" }, "Within"),
        ...RADII.map((r) => h("button", { class: "chip", role: "radio", "aria-checked": String(r === radius), onclick: () => { radius = r; app.render(); } }, `${r} km`)));
      body.append(chips);
      asyncBlock(app, body, "Mapping drains, channels and water works…", async () => {
        const key = `${place.lon},${place.lat},${radius}`;
        const fs = await fetchCityWater(place, radius);
        if (key !== lastKey) {
          lastKey = key;
          put(app, fs);
          // Drains only draw once zoomed in to street level, so come down if we're high above.
          if (app.globe.cameraHeight() > radius * 5000) void flyToPlace(app.globe, { name: "", lon: place.lon, lat: place.lat, radius: radius * 700 });
        }
        const s = summarize(fs);
        const total = s.open.river + s.open.stream + s.open.canal + s.open.drain + s.buried;
        if (!fs.length) return [h("p", { class: "muted" }, `No water channels or works are mapped within ${radius} km. Try a larger radius, or the Rain path to follow the terrain.`)];
        const legendRow = (k: CityWaterKind, value: string) =>
          h("div", { class: "stat-row" }, h("dt", {}, h("span", { class: "dot", style: `background:${CITY_WATER[k].color};display:inline-block;margin-right:8px` }), CITY_WATER[k].label), h("dd", {}, value));
        return [
          hero(km1(total), `of mapped channels within ${radius} km`, s.buried ? `${Math.round((s.buried / Math.max(1, total)) * 100)}% of it buried in culverts and tunnels` : "Rivers, streams, canals, drains and ditches"),
          h("p", { class: "flow-caption" }, h("span", { class: "flow-dots" }), "The moving light is the water: it runs downstream along each channel, faint where it's buried."),
          section("How water moves here", story(place, fs, radius)),
          section("On the map",
            h("dl", { class: "stat-list" },
              s.open.river ? legendRow("river", km1(s.open.river)) : "",
              s.open.canal ? legendRow("canal", km1(s.open.canal)) : "",
              s.open.stream ? legendRow("stream", km1(s.open.stream)) : "",
              s.open.drain ? legendRow("drain", km1(s.open.drain)) : "",
              s.buried ? h("div", { class: "stat-row" }, h("dt", {}, h("span", { class: "dash-key" }), "Buried (culverts, tunnels)"), h("dd", {}, km1(s.buried))) : "",
              s.counts.basin ? legendRow("basin", String(s.counts.basin)) : "",
              s.counts.supply ? legendRow("supply", String(s.counts.supply)) : "",
              s.counts.wastewater ? legendRow("wastewater", String(s.counts.wastewater)) : "",
              s.pipeLength ? legendRow("pipe", km1(s.pipeLength)) : "",
              s.counts.control ? legendRow("control", String(s.counts.control)) : "")),
          s.mainChannels.length ? section("Main rivers and canals", h("div", { class: "chips wrap" }, ...s.mainChannels.slice(0, 6).map((n) => h("span", { class: "chip static" }, n)))) : "",
          note("From OpenStreetMap. Storm sewers and water mains are mostly underground and unmapped, so treat the drains and pipes as a lower bound. Pair this with the Rain path to see which way the ground sends water."),
        ];
      });
    },
  };
}
