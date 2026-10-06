// The wall screens: what an operations room, a site office or a lobby keeps up all day.
//   Our sites: every site from the Pro tools (on this screen, or handed over from a phone), framed together,
//     then one by one with its local time and weather, beside a board of all of them.
//   Hazards: this week's earthquakes within reach of a site (USGS), biggest first.
//   World clocks: local time where you work, with who's in working hours, over the day and night on the globe.
//   Welcome: a message for visitors with the weather and time here.
// Each scene returns a function that stops it.
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { weatherText } from "../analysis/climate";
import { forecast, type Forecast } from "../data/openmeteo";
import { recentQuakes } from "../data/quakes";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { WorkLayer } from "../work/layer";
import { DEFAULT_CLOCKS, frameSites, localTime, quakesNear, workingHours, type WallSite } from "./rooms";

export interface WallCtx { app: App; say(t: string, s?: string): void; board: HTMLElement; sites: WallSite[]; alive(): boolean }

const ICON: Record<string, string> = { sun: "☀️", partly: "⛅", cloud: "☁️", fog: "🌫", rain: "🌧", snow: "❄️", storm: "⛈" };
let layer: WorkLayer | null = null;
const pins = (app: App) => (layer ??= new WorkLayer(app, "tv-wall", "On the wall", "#4c9ac9", false));

/** Weather and time zone for a site, once per visit. */
const weather = new Map<string, Promise<Forecast | null>>();
function weatherAt(s: { lon: number; lat: number }) {
  const k = `${s.lon.toFixed(2)},${s.lat.toFixed(2)}`;
  if (!weather.has(k)) weather.set(k, forecast(s.lon, s.lat).catch(() => null));
  return weather.get(k)!;
}
const wx = (f: Forecast | null) => (f ? `${ICON[weatherText(f.current.weather_code).icon] ?? ""} ${Math.round(f.current.temperature_2m)}°` : "");

function board(ctx: WallCtx, title: string, rows: HTMLElement[]) {
  ctx.board.replaceChildren(h("h3", {}, title), h("div", { class: "tv-board-rows" }, ...rows));
  ctx.board.classList.add("on");
}

export function sitesScene(ctx: WallCtx): () => void {
  const { app, sites } = ctx;
  if (!sites.length) {
    app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(0, 20, 20_000_000), duration: 2.5 });
    ctx.say("No sites on this screen yet", "On your phone's remote, press Our sites to send them here");
    return () => {};
  }
  pins(app).set(sites.map((s, i) => ({ id: `s${i}`, kind: "point", pts: [[s.lon, s.lat]], color: "#4c9ac9", label: s.name })));
  const rows = sites.slice(0, 14).map((s) => {
    const time = h("span", { class: "tv-row-time" }), temp = h("span", { class: "tv-row-wx" });
    void weatherAt(s).then((f) => { if (f) { const t = localTime(f.timezone); time.textContent = t.time; temp.textContent = wx(f); } });
    return h("div", { class: "tv-row" }, h("div", {}, h("strong", {}, s.name), h("small", {}, s.tool)), time, temp);
  });
  board(ctx, `Our sites · ${sites.length}`, rows);
  const f = frameSites(sites);
  app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(f.lon, f.lat, f.height), duration: 3 });
  const tools = [...new Set(sites.map((s) => s.tool))];
  ctx.say(`${sites.length} site${sites.length === 1 ? "" : "s"}`, tools.join(" · "));
  // Then each site in turn.
  let i = -1;
  const next = () => {
    if (!ctx.alive()) return;
    i = (i + 1) % Math.min(sites.length, 14);
    const s = sites[i];
    rows.forEach((r, k) => r.classList.toggle("on", k === i));
    void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 2500 });
    ctx.say(s.name, s.tool);
    void weatherAt(s).then((fc) => {
      if (!fc || !ctx.alive() || sites[i] !== s) return;
      const t = localTime(fc.timezone), w = weatherText(fc.current.weather_code);
      ctx.say(s.name, `${s.tool} · ${t.time} local · ${w.text}, ${Math.round(fc.current.temperature_2m)}° · wind ${Math.round(fc.current.wind_speed_10m)} km/h`);
    });
  };
  const timer = window.setInterval(next, 7000);
  return () => { clearInterval(timer); layer?.clear(); ctx.board.classList.remove("on"); };
}

export function hazardsScene(ctx: WallCtx): () => void {
  const { app, sites } = ctx;
  let stopped = false;
  ctx.say("Hazards", "Earthquakes this week, from the US Geological Survey");
  app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(sites[0]?.lon ?? 140, 20, 19_000_000), duration: 3 });
  void recentQuakes().then((qs) => {
    if (stopped || !ctx.alive()) return;
    const near = sites.length ? quakesNear(qs, sites) : [];
    const shown = sites.length ? near.map((n) => n.quake) : [...qs].sort((a, b) => b.mag - a.mag).slice(0, 12);
    pins(app).set(shown.slice(0, 40).map((q, i) => ({ id: `q${i}`, kind: "point", pts: [[q.lon, q.lat]], color: q.mag >= 6 ? "#c4513a" : q.mag >= 5 ? "#d19a2e" : "#e1b843", label: `M${q.mag.toFixed(1)}` })));
    const ago = (t: number) => { const hrs = Math.round((Date.now() - t) / 3_600_000); return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`; };
    if (sites.length) {
      ctx.say(near.length ? `${near.length} earthquake${near.length === 1 ? "" : "s"} near your sites` : "No earthquakes near your sites this week",
        near.length ? `Biggest: M${near[0].quake.mag.toFixed(1)}, ${Math.round(near[0].km)} km from ${near[0].site.name}` : `${qs.length} worldwide, none within reach of your ${sites.length} sites`);
      board(ctx, "Near our sites", near.slice(0, 10).map((n) => h("div", { class: "tv-row" }, h("div", {}, h("strong", {}, `M${n.quake.mag.toFixed(1)} · ${Math.round(n.km)} km from ${n.site.name}`), h("small", {}, n.quake.place)), h("span", { class: "tv-row-time" }, ago(n.quake.time)))));
      if (!near.length) ctx.board.classList.remove("on");
    } else {
      ctx.say(`${qs.length} earthquakes this week`, shown[0] ? `Biggest: M${shown[0].mag.toFixed(1)}, ${shown[0].place}` : "");
      board(ctx, "Biggest this week", shown.slice(0, 10).map((q) => h("div", { class: "tv-row" }, h("div", {}, h("strong", {}, `M${q.mag.toFixed(1)}`), h("small", {}, q.place)), h("span", { class: "tv-row-time" }, ago(q.time)))));
    }
  }).catch(() => { if (!stopped) ctx.say("Hazards", "The earthquake feed didn't answer. It'll try again next time round."); });
  return () => { stopped = true; layer?.clear(); ctx.board.classList.remove("on"); };
}

export function clocksScene(ctx: WallCtx, el: HTMLElement): () => void {
  const { app, sites } = ctx;
  const viewer = app.globe.viewer;
  const lighting = viewer.scene.globe.enableLighting;
  viewer.scene.globe.enableLighting = true;
  viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(sites[0]?.lon ?? 10, 15, 22_000_000), duration: 3 });
  ctx.say("World clocks", sites.length ? "Local time at your sites, and who's in working hours" : "Local time around the world, day and night on the globe");
  let clocks: { name: string; tz: string }[] = DEFAULT_CLOCKS;
  const draw = () => {
    el.replaceChildren(...clocks.slice(0, 10).map((c) => {
      const t = localTime(c.tz), on = workingHours(t.hour, t.day);
      return h("div", { class: "tv-clock-cell" + (on ? " on" : "") }, h("strong", {}, t.time), h("span", {}, c.name), h("small", {}, `${t.day}${on ? " · working hours" : ""}`));
    }));
  };
  draw();
  el.classList.add("on");
  if (sites.length) {
    // One clock per time zone the sites are in, named after the first site there.
    void Promise.all(sites.slice(0, 30).map((s) => weatherAt(s).then((f) => (f ? { name: s.name, tz: f.timezone } : null)))).then((got) => {
      const byTz = new Map<string, string>();
      for (const g of got) if (g && !byTz.has(g.tz)) byTz.set(g.tz, g.name);
      if (byTz.size) { clocks = [...byTz].map(([tz, name]) => ({ name, tz })); draw(); }
    });
  }
  const timer = window.setInterval(draw, 15_000);
  return () => { clearInterval(timer); el.classList.remove("on"); viewer.scene.globe.enableLighting = lighting; };
}

export interface Welcome { text: string; place?: { name: string; lon: number; lat: number } }
export function welcomeScene(ctx: WallCtx, el: HTMLElement, w: Welcome): () => void {
  const { app } = ctx;
  const p = w.place;
  if (p) void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 6000 });
  else app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(-20 + Math.random() * 60, 25, 17_000_000), duration: 3 });
  const now = h("div", { class: "tv-welcome-now" });
  el.replaceChildren(h("h1", {}, w.text || "Welcome"), p ? h("p", { class: "tv-welcome-place" }, p.name) : "", now);
  el.classList.add("on");
  ctx.say("", "");
  let stopped = false;
  const draw = () => {
    if (!p) { now.textContent = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }); return; }
    void weatherAt(p).then((f) => {
      if (stopped || !f) return;
      const t = localTime(f.timezone), w2 = weatherText(f.current.weather_code);
      const set = f.daily.sunset[0]?.slice(11, 16);
      now.replaceChildren(
        h("span", { class: "tv-welcome-big" }, `${ICON[w2.icon] ?? ""} ${Math.round(f.current.temperature_2m)}°`),
        h("span", {}, `${w2.text} · high ${Math.round(f.daily.temperature_2m_max[0])}°, low ${Math.round(f.daily.temperature_2m_min[0])}°`),
        h("span", {}, `${t.day} ${t.time}${set ? ` · sunset ${set}` : ""}`));
    });
  };
  draw();
  const timer = window.setInterval(draw, 60_000);
  return () => { stopped = true; clearInterval(timer); el.classList.remove("on"); };
}
