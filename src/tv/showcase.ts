// The screens that show Terreno at work, not a screensaver: the same readings the app makes, live, big enough
// for a room.
//   A place, live: fly to a place, read it as the app does (its weather, sun, air, the planes overhead and
//     what's happening nearby), and lead with the one fact worth knowing about it.
//   Now on Earth: what's happening right now (the top story, the strongest earthquake, the next launch, the
//     aurora), each found on the globe in turn, with the whole list on the board.
// Each scene returns a function that stops it.
import { Cartesian3 } from "cesium";
import { earthNow, type PulseLine } from "../delight/pulse";
import { nowHere, type NowHere } from "../live/nowHere";
import { headline } from "../place/headline";
import { measureAt } from "../place/measure";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { WorkLayer } from "../work/layer";
import type { WallCtx } from "./wall";

export interface ShowPlace { name: string; sub: string; lon: number; lat: number; radius: number; /** What it is, so its headline isn't about itself ("a volcano is 8 km away" at Fuji). */ kind?: string }

/** Great places, chosen to show different sides of the planet and of Terreno. */
export const SHOW_PLACES: ShowPlace[] = [
  { name: "Mount Fuji", sub: "Japan", lon: 138.7274, lat: 35.3606, radius: 9000, kind: "volcano" },
  { name: "Grand Canyon", sub: "Arizona, United States", lon: -112.1129, lat: 36.1069, radius: 12000 },
  { name: "Venice", sub: "Italy", lon: 12.3358, lat: 45.4371, radius: 4000 },
  { name: "Machu Picchu", sub: "Peru", lon: -72.545, lat: -13.1631, radius: 2500 },
  { name: "Cape Town", sub: "South Africa", lon: 18.4241, lat: -33.9249, radius: 9000 },
  { name: "Mount Everest", sub: "Nepal and China", lon: 86.925, lat: 27.9881, radius: 14000 },
  { name: "Reykjavík", sub: "Iceland", lon: -21.9426, lat: 64.1466, radius: 7000 },
  { name: "Rio de Janeiro", sub: "Brazil", lon: -43.1729, lat: -22.9068, radius: 9000 },
];

const KIND_WORD: Record<PulseLine["kind"], string> = { news: "Top story", quake: "Earthquake", launch: "Launch", aurora: "Aurora" };
const KIND_COLOR: Record<PulseLine["kind"], string> = { news: "#4c9ac9", quake: "#c4513a", launch: "#d19a2e", aurora: "#5b9467" };

let layer: WorkLayer | null = null;
const pins = (ctx: WallCtx) => (layer ??= new WorkLayer(ctx.app, "tv-show", "On the screen", "#4c9ac9", false));

function boardRows(ctx: WallCtx, title: string, rows: HTMLElement[]) {
  ctx.board.replaceChildren(h("h3", {}, title), h("div", { class: "tv-board-rows" }, ...rows));
  ctx.board.classList.add("on");
}

/** One reading on the board: a label, and its value once it arrives. */
function reading(label: string) {
  const value = h("span", { class: "tv-read-value" }, "…");
  const row = h("div", { class: "tv-row tv-read" }, h("small", {}, label), value);
  return { row, set: (v: string | null) => { value.textContent = v ?? "–"; row.classList.toggle("none", !v); } };
}

const localClock = (tz?: string) => {
  if (!tz) return null;
  try { return new Intl.DateTimeFormat([], { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(new Date()); } catch { return null; }
};

/** The live readings as board values (pure). */
export function readingValues(n: NowHere): Record<"time" | "weather" | "sun" | "air" | "sky" | "near", string | null> {
  const w = n.weather, s = n.sun, a = n.aircraft;
  return {
    time: localClock(n.timezone),
    weather: w ? `${Math.round(w.temperatureC)}° · ${w.condition}` : null,
    sun: s.phase === "day" ? `Up ${Math.round(s.altitudeDeg)}°${s.sunsetLocal ? ` · sets ${s.sunsetLocal}` : ""}` : s.phase === "twilight" ? "Twilight" : `Night${s.sunriseLocal ? ` · rises ${s.sunriseLocal}` : ""}`,
    air: n.air?.usAqi !== undefined ? `${n.air.quality[0].toUpperCase()}${n.air.quality.slice(1)} · AQI ${Math.round(n.air.usAqi)}` : null,
    sky: a ? (a.count ? `${a.count} plane${a.count === 1 ? "" : "s"} within ${a.withinKm} km` : "Clear of planes") : null,
    near: n.earthquake ? `M${n.earthquake.magnitude.toFixed(1)} quake, ${n.earthquake.distanceKm} km` : n.events[0] ? `${n.events[0].title}, ${n.events[0].distanceKm} km` : "Nothing reported",
  };
}

/** A place, read live. `orbit` starts the slow circle around it once the camera has arrived. */
export function placeScene(ctx: WallCtx, p: ShowPlace, orbit: (p: ShowPlace) => void): () => void {
  let live = true;
  const alive = () => live && ctx.alive();
  ctx.app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.sub });
  void flyToPlace(ctx.app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: p.radius });
  ctx.say(p.name, p.sub);
  const rows = { time: reading("Local time"), weather: reading("Weather"), sun: reading("Sun"), air: reading("Air"), sky: reading("Overhead"), near: reading("Nearby") };
  boardRows(ctx, "Right now", Object.values(rows).map((r) => r.row));
  const arrive = window.setTimeout(() => { if (alive()) orbit(p); }, 4500);
  void nowHere({ name: p.name, context: p.sub, lon: p.lon, lat: p.lat }).then((n) => {
    if (!alive()) return;
    const v = readingValues(n);
    for (const k of Object.keys(rows) as (keyof typeof rows)[]) rows[k].set(v[k]);
  }).catch(() => { if (alive()) for (const r of Object.values(rows)) r.set(null); });
  // The one fact worth knowing leads, once the layers have been read.
  void measureAt(p.lon, p.lat).then((m) => {
    const line = headline(m.v, p.kind);
    if (alive() && line) ctx.say(p.name, [p.sub, line.replace(/\.$/, "")].filter(Boolean).join(" · "));
  }).catch(() => {});
  return () => { live = false; clearTimeout(arrive); ctx.board.classList.remove("on"); };
}

/** What's happening on Earth now, found one by one. */
export function worldScene(ctx: WallCtx): () => void {
  let live = true, timer = 0;
  const alive = () => live && ctx.alive();
  ctx.say("Now on Earth", "Finding what's happening…");
  ctx.app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(10, 20, 20_000_000), duration: 3 });
  void earthNow(6000).then((lines) => {
    if (!alive()) return;
    const placed = lines.filter((l) => l.lon !== undefined && l.lat !== undefined);
    if (!lines.length) { ctx.say("Now on Earth", "A quiet moment: nothing big reported in the last few hours"); return; }
    const rows = lines.map((l) => h("div", { class: "tv-row tv-now", style: `--k:${KIND_COLOR[l.kind]}` },
      h("div", {}, h("small", {}, KIND_WORD[l.kind]), h("strong", {}, l.text))));
    boardRows(ctx, "Now on Earth", rows);
    pins(ctx).set(placed.map((l, i) => ({ id: `n${i}`, kind: "point", pts: [[l.lon!, l.lat!]], color: KIND_COLOR[l.kind], label: KIND_WORD[l.kind] })));
    let i = -1;
    const next = () => {
      if (!alive()) return;
      i = (i + 1) % lines.length;
      const l = lines[i];
      rows.forEach((r, k) => r.classList.toggle("on", k === i));
      ctx.say(KIND_WORD[l.kind], l.text);
      if (l.lon !== undefined && l.lat !== undefined)
        ctx.app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(l.lon, l.lat - 8, 4_500_000), orientation: { heading: 0, pitch: -1.2, roll: 0 }, duration: 3 });
      timer = window.setTimeout(next, 8000);
    };
    next();
  }).catch(() => { if (alive()) ctx.say("Now on Earth", "The live feeds aren't answering just now"); });
  return () => { live = false; clearTimeout(timer); layer?.clear(); ctx.board.classList.remove("on"); };
}
