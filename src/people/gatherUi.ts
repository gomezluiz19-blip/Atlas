// Where people gather, on screen: a heat map of where people likely are at an hour (indigo through rose to
// gold), a clock to move it through the day, the centres of life, and the busiest places at that time.
import { Cartesian2, ImageryLayer, Rectangle, SingleTileImageryProvider } from "cesium";
import type { App } from "../app";
import { overpass } from "../data/overpass";
import { section } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { venueOf } from "../place/venue";
import { busyAt, busyWord, centres, gatherFrom, gatherQuery, GROUPS, HEAT_STOPS, heatColor, heatGrid, KINDS, type GatherGroup, type GatherSpot } from "./gather";

type Spot = { lon: number; lat: number };

const CLOCKS: { id: string; label: string; set?: (d: Date) => void }[] = [
  { id: "now", label: "Now" },
  { id: "morning", label: "Morning", set: (d) => d.setHours(9, 0, 0, 0) },
  { id: "lunch", label: "Lunch", set: (d) => d.setHours(12, 30, 0, 0) },
  { id: "afternoon", label: "Afternoon", set: (d) => d.setHours(15, 30, 0, 0) },
  { id: "evening", label: "Evening", set: (d) => d.setHours(19, 0, 0, 0) },
  { id: "late", label: "Late", set: (d) => d.setHours(22, 30, 0, 0) },
];
const hourText = (hr: number) => `${hr % 12 || 12}${hr < 12 ? "am" : "pm"}`;
const distText = (km: number) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`);
const kmBetween = (a: Spot, b: Spot) => {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
};

/** The heat on the globe: one image over the area, replaced as the hour changes. */
function heatLayer(app: App, id: string, scope: "place" | "world") {
  let layer: ImageryLayer | null = null;
  let job = 0, owned = false;
  const viewer = app.globe.viewer;
  // Stays above the theme's own glow, which can arrive after it.
  let unlisten: (() => void) | null = null;
  const onTop = () => { if (layer && viewer.imageryLayers.contains(layer) && viewer.imageryLayers.indexOf(layer) < viewer.imageryLayers.length - 1) viewer.imageryLayers.raiseToTop(layer); };
  const clear = () => { job++; unlisten?.(); unlisten = null; if (layer) { viewer.imageryLayers.remove(layer, true); layer = null; viewer.scene.requestRender(); } };
  return {
    async draw(spots: GatherSpot[], box: { west: number; south: number; east: number; north: number }, at: Date) {
      // A newer panel takes over the map from an older one (its heat goes).
      if (!owned) { owned = true; app.canvas.remove(id); }
      const my = ++job;
      const W = 384, H = Math.max(96, Math.round(W * ((box.north - box.south) / ((box.east - box.west) * Math.cos(((box.north + box.south) / 2) * Math.PI / 180)))));
      const grid = heatGrid(spots, box, W, Math.min(H, 768), at, 11);
      const hh = Math.min(H, 768);
      const c = document.createElement("canvas");
      c.width = W; c.height = hh;
      const g = c.getContext("2d")!, img = g.createImageData(W, hh);
      for (let i = 0; i < grid.length; i++) { const [r, gg, b, a] = heatColor(grid[i]); img.data.set([r, gg, b, a], i * 4); }
      g.putImageData(img, 0, 0);
      const provider = await SingleTileImageryProvider.fromUrl(c.toDataURL(), { rectangle: Rectangle.fromDegrees(box.west, box.south, box.east, box.north) });
      if (my !== job) return;
      const next = new ImageryLayer(provider, { alpha: 0.85 });
      viewer.imageryLayers.add(next);
      if (layer) viewer.imageryLayers.remove(layer, true);
      layer = next;
      unlisten ??= viewer.imageryLayers.layerAdded.addEventListener(() => setTimeout(onTop, 0));
      app.canvas.put({ id, label: "Where people gather", color: "#e0457b", scope, theme: scope === "world" ? "people" : undefined, pinned: false, show: (v) => { if (layer) layer.show = v; viewer.scene.requestRender(); }, remove: clear }, true);
      viewer.scene.requestRender();
    },
    clear,
  };
}

/**
 * Where people gather around a spot: the heat for an hour of the day, the centres of life and the
 * busiest places. `scope` is "place" for a chosen place, "world" for the area in view.
 */
export function gatherPanel(app: App, at: Spot, radiusKm: number, scope: "place" | "world" = "place"): HTMLElement {
  const token = app.token;
  const body = h("div", { class: "gt" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Finding where people gather…"));
  const heat = heatLayer(app, scope === "place" ? "people:gather" : "people:gather-view", scope);
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.cos((at.lat * Math.PI) / 180));
  const box = { west: at.lon - dLon, east: at.lon + dLon, south: at.lat - dLat, north: at.lat + dLat };
  let clock = "now", weekend = [0, 6].includes(new Date().getDay()), group: GatherGroup | "all" = "all";

  void overpass(gatherQuery(at, radiusKm * 1000)).then((els) => {
    if (!app.isCurrent(token) && scope === "place") return;
    const { spots, names } = gatherFrom(els);
    if (!spots.length) { body.replaceChildren(h("p", { class: "muted small" }, "The map shows no restaurants, shops or parks here yet.")); return; }
    const centreList = centres(spots, names, 3);
    const when = () => {
      const d = new Date();
      const c = CLOCKS.find((x) => x.id === clock)!;
      if (c.set) {
        // Move to the next weekday or weekend day if the toggle asks for the other kind of day.
        while ([0, 6].includes(d.getDay()) !== weekend) d.setDate(d.getDate() + 1);
        c.set(d);
      }
      return d;
    };
    const draw = () => {
      const d = when();
      const shown = spots.filter((s) => group === "all" || KINDS[s.kind].group === group);
      void heat.draw(shown, box, d);
      const all = shown.filter((s) => s.name).map((s) => ({ s, b: busyAt(s, d), km: kmBetween(at, s) })).sort((a, b) => b.b - a.b || a.km - b.km);
      // A mix, not eight of one kind: at most three of each.
      const perKind = new Map<string, number>();
      const ranked = all.filter((x) => { const n = perKind.get(x.s.kind) ?? 0; perKind.set(x.s.kind, n + 1); return n < 3; });
      const quiet = (ranked[0]?.b ?? 0) < 0.1;
      const busyNow = all.filter((x) => x.b >= 0.55).length;
      const tally = (Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => [k, shown.filter((s) => s.kind === k).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      const label = clock === "now" ? "now" : `${weekend ? "on a weekend" : "on a weekday"} ${CLOCKS.find((c) => c.id === clock)!.label.toLowerCase()}`;
      body.replaceChildren(
        h("div", { class: "gt-clock" },
          h("div", { class: "chips gt-times" }, ...CLOCKS.map((c) => h("button", { class: `chip${clock === c.id ? " on" : ""}`, onclick: () => { clock = c.id; draw(); } }, c.label))),
          h("div", { class: "ppl-seg gt-days" }, ...[false, true].map((we) => h("button", { class: weekend === we ? "on" : "", onclick: () => { weekend = we; if (clock === "now") clock = "evening"; draw(); } }, we ? "Weekend" : "Weekday")))),
        h("div", { class: "chips gt-groups" }, ...GROUPS.map((gr) => h("button", { class: `chip${group === gr.id ? " on" : ""}`, onclick: () => { group = gr.id; draw(); } }, gr.label))),
        h("div", { class: "gt-legend" }, h("span", {}, "Quiet"), h("i", { style: `background:linear-gradient(90deg,${HEAT_STOPS.slice(1).map(([, c]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0.35, c[3] / 255)})`).join(",")})` }), h("span", {}, "Busy")),
        h("div", { class: "gt-figs" },
          h("div", {}, h("strong", {}, shown.length.toLocaleString()), h("small", {}, `places to gather within ${radiusKm < 1 ? `${Math.round(radiusKm * 1000)} m` : `${radiusKm.toFixed(radiusKm < 3 ? 1 : 0)} km`}`)),
          h("div", {}, h("strong", {}, String(busyNow)), h("small", {}, `likely busy ${label}`))),
        h("div", { class: "gt-mix" }, ...tally.slice(0, 6).map(([k, n]) => h("span", { style: `--c:${KINDS[k].color}` }, h("i", {}), `${n} ${KINDS[k].label.toLowerCase()}`))),
        centreList.length ? section("Centres of life", h("div", { class: "list" }, ...centreList.map((c) =>
          h("button", { class: "list-row gt-centre", onclick: () => void flyToPlace(app.globe, { name: c.name, lon: c.lon, lat: c.lat, radius: 900 }) },
            h("span", { class: "gt-centre-dot" }),
            h("span", { class: "list-text" },
              h("span", { class: "list-title" }, c.name),
              h("span", { class: "list-sub" }, `${c.count} places · mostly ${c.mix.slice(0, 2).map(([k]) => KINDS[k].label.toLowerCase()).join(" and ")} · busiest around ${hourText(weekend ? c.peak.weekend : c.peak.weekday)}`)),
            h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
        quiet ? section(clock === "now" ? "Quiet right now" : `Quiet ${label}`, h("p", { class: "muted small" }, "Most places here are closed or empty at this hour."),
          h("button", { class: "pill-btn", onclick: () => { clock = "evening"; draw(); } }, "See it in the evening")) : "",
        ranked.length && !quiet ? section(clock === "now" ? "Busiest right now" : `Busiest ${label}`, h("div", { class: "list" }, ...ranked.slice(0, 8).map((x) => {
          const kind = venueOf({ key: x.s.key, value: x.s.value })?.label ?? KINDS[x.s.kind].label;
          return h("button", { class: "list-row gt-place", onclick: () => {
            void flyToPlace(app.globe, { name: x.s.name!, lon: x.s.lon, lat: x.s.lat, radius: 500 });
            app.select({ lon: x.s.lon, lat: x.s.lat, height: 0 }, { title: x.s.name!, context: kind }, { venue: { key: x.s.key, value: x.s.value, osm: x.s.osm } });
          } },
            h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.s.name!), h("span", { class: "list-sub" }, `${kind} · ${distText(x.km)}`)),
            h("span", { class: "gt-meter", title: busyWord(x.b) }, h("i", { style: `width:${Math.round(x.b * 100)}%;background:rgb(${heatColor(Math.max(0.3, x.b)).slice(0, 3).join(",")})` }), h("small", {}, busyWord(x.b))));
        }))) : "",
        h("p", { class: "fineprint" }, "How busy is an estimate from how each kind of place is usually used through the day, and its posted hours; it isn't a live count. Places from OpenStreetMap."));
    };
    draw();
  }).catch(() => body.replaceChildren(h("p", { class: "muted small" }, "Couldn't reach the map's places just now. Try again in a moment.")));
  return body;
}

/** The area in view's centre and a sensible radius, or null when the view is too wide for streets. */
export function viewArea(app: App): { at: Spot; radiusKm: number } | null {
  const viewer = app.globe.viewer, cv = viewer.canvas;
  const height = viewer.camera.positionCartographic.height;
  if (height > 60_000) return null;
  const p = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  if (!p) return null;
  return { at: { lon: p.lon, lat: p.lat }, radiusKm: Math.max(0.8, Math.min(4, height / 4000)) };
}
