// Pulse on the globe: everything you have in Atlas as one living picture.
// Places and sites glow, plans brighten as they near, ships ride their lanes,
// relief loads move between warehouses. Drag the time scrub (a month back, a
// quarter ahead) and the world moves with it, or press play. "What if" plays
// a closure out as theatre: the strait seals in red, the affected ships'
// routes redraw the long way round, and the cost counts up. Wall mode clears
// everything else away for a screen on the wall; Still and Film capture it.
import { demand } from "../globe/motion";
import {
  CallbackProperty, Cartesian2, Cartesian3, Color, CustomDataSource, LabelStyle, NearFarScalar, PolylineDashMaterialProperty, PolylineGlowMaterialProperty, VerticalOrigin,
} from "cesium";
import type { App } from "../app";
import { film, still } from "../delight/capture";
import { CHOKEPOINTS, NODES, densify, type LonLat } from "../pro/shipping/sea";
import { whatIf, type Desk } from "../pro/shipping/model";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { LAYERS, SPAN, fracAt, tAt, worldAt, type Layer, type World } from "./model";

const DAY = 86_400_000;
const sprites = new Map<string, HTMLCanvasElement>();
/** A soft glowing dot in a colour (cached). */
function glow(color: string, core = "#ffffff"): HTMLCanvasElement {
  const k = `${color}|${core}`;
  let c = sprites.get(k);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, core); r.addColorStop(0.18, color); r.addColorStop(0.45, Color.fromCssColorString(color).withAlpha(0.35).toCssColorString()); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  sprites.set(k, c);
  return c;
}
const C = (css: string, a = 1) => Color.fromCssColorString(css).withAlpha(a);
const P = ([lon, lat]: LonLat, h = 0) => Cartesian3.fromDegrees(lon, lat, h);
const read = <T>(key: string): T[] => { try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" });

let open: { close(): void } | null = null;

export function openPulse(app: App) {
  if (open) { open.close(); return; }
  const viewer = app.globe.viewer, scene = viewer.scene;
  const ds = new CustomDataSource("pulse"), theatre = new CustomDataSource("pulse-theatre");
  demand(() => document.body.classList.contains("pulse-on"));
  void viewer.dataSources.add(ds); void viewer.dataSources.add(theatre);
  const now = Date.now();
  let t = now, playing = false, hidden = new Set<Layer>(), closed: string[] | undefined;
  let world: World = worldAt(t);

  // ---- The frame ----
  const dateEl = h("h1", { class: "pu-date" }, fmtDate(t));
  const rel = h("p", { class: "pu-rel" }, "Today");
  const chips = h("div", { class: "pu-layers" });
  const counter = h("div", { class: "pu-count", hidden: true });
  const ifs = h("div", { class: "pu-ifs" });
  const knob = h("i", { class: "pu-knob" });
  const fill = h("b", { class: "pu-fill" });
  const track = h("div", { class: "pu-track", role: "slider", "aria-label": "Time", tabindex: 0 }, fill, h("span", { class: "pu-now", style: `left:${fracAt(now, now) * 100}%` }), knob);
  const play = h("button", { class: "pu-play", "aria-label": "Play", onclick: () => toggle() }, "▶");
  const months = h("div", { class: "pu-months" });
  for (let d = -SPAN.back; d <= SPAN.ahead; d++) { const day = new Date(now + d * DAY); if (day.getDate() === 1) months.append(h("span", { style: `left:${fracAt(now, now + d * DAY) * 100}%` }, day.toLocaleDateString(undefined, { month: "short" }))); }
  const clock = h("p", { class: "pu-clock" });
  const el = h("section", { class: "pz", role: "region", "aria-label": "Pulse: your world" },
    h("header", { class: "pu-head" },
      h("p", { class: "pu-kicker" }, "PULSE · YOUR WORLD"), dateEl, rel, clock, chips),
    h("div", { class: "pu-actions" },
      h("button", { class: "pu-btn", onclick: () => wall(!document.body.classList.contains("pulse-wall")) }, "Wall"),
      h("button", { class: "pu-btn", onclick: () => void shoot(false) }, "Still"),
      h("button", { class: "pu-btn", onclick: () => void shoot(true) }, "Film"),
      h("button", { class: "pu-btn icon", "aria-label": "Close", onclick: () => close() }, "✕")),
    ifs, counter,
    h("footer", { class: "pu-time" }, play, h("button", { class: "pu-btn small", onclick: () => setT(now, true) }, "Now"), h("div", { class: "pu-scrub" }, months, track)));
  (document.getElementById("ui") ?? document.body).append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  document.body.classList.add("pulse-on");

  // ---- Drawing the world at t ----
  const draw = () => {
    ds.entities.removeAll();
    const show = (l: Layer) => !hidden.has(l);
    for (const ln of world.lanes.filter((x) => show(x.layer))) {
      if (ln.done !== undefined && ln.done > 0.01 && ln.done < 0.99) {
        const pts = densify(ln.pts, 150), cut = Math.max(1, Math.round(pts.length * ln.done));
        ds.entities.add({ polyline: { positions: pts.slice(0, cut + 1).map((p) => P(p)), width: 2, material: C(ln.color, 0.25) } });
        ds.entities.add({ polyline: { positions: pts.slice(cut).map((p) => P(p)), width: 6, material: new PolylineGlowMaterialProperty({ glowPower: 0.25, color: C(ln.color, 0.85) }) } });
      } else {
        ds.entities.add({ polyline: { positions: densify(ln.pts, 150).map((p) => P(p)), width: ln.dashed ? 2.5 : 5, material: ln.dashed ? new PolylineDashMaterialProperty({ color: C(ln.color, 0.75), dashLength: 14 }) : new PolylineGlowMaterialProperty({ glowPower: 0.22, color: C(ln.color, 0.75) }) } });
      }
    }
    for (const a of world.anchors.filter((x) => show(x.layer))) {
      ds.entities.add({
        position: P([a.lon, a.lat], 50),
        billboard: { image: glow(a.color), scale: 0.55 * a.size, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(2e5, 1.4, 2e7, 0.7) },
        label: { text: a.label, font: "600 12px Inter, system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: C("#000", 0.7), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.TOP, pixelOffset: new Cartesian2(0, 12), disableDepthTestDistance: Number.POSITIVE_INFINITY, translucencyByDistance: new NearFarScalar(5e5, 1, 6e6, 0) },
      });
    }
    for (const m of world.movers.filter((x) => show(x.layer))) {
      ds.entities.add({
        position: P([m.lon, m.lat], 80),
        billboard: { image: glow(LAYERS[m.layer].color, "#ffffff"), scale: 0.9, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: m.label, font: "700 12px Inter, system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: C("#000", 0.75), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY, translucencyByDistance: new NearFarScalar(1e6, 1, 2e7, 0.15) },
      });
    }
    scene.requestRender();
  };
  const renderChips = () => {
    chips.replaceChildren(...(Object.keys(LAYERS) as Layer[]).filter((l) => world.counts[l]).map((l) => h("button", { class: "pu-chip" + (hidden.has(l) ? " off" : ""), style: `--c:${LAYERS[l].color}`, onclick: () => { if (hidden.has(l)) hidden.delete(l); else hidden.add(l); renderChips(); draw(); } }, h("i", {}), `${LAYERS[l].label} `, h("b", {}, String(world.counts[l])))));
  };
  const setT = (x: number, redraw = true) => {
    t = Math.min(tAt(now, 1), Math.max(tAt(now, 0), x));
    const f = fracAt(now, t);
    knob.style.left = fill.style.width = `${f * 100}%`;
    const d = Math.round((t - now) / DAY);
    dateEl.textContent = fmtDate(t);
    rel.textContent = d === 0 ? "Today" : d > 0 ? `${d} day${d === 1 ? "" : "s"} ahead` : `${-d} day${d === -1 ? "" : "s"} ago`;
    if (redraw) { world = worldAt(t, closed); draw(); renderChips(); }
  };

  // ---- The time scrub ----
  const fromPointer = (e: PointerEvent) => { const r = track.getBoundingClientRect(); setT(tAt(now, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))); };
  track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); fromPointer(e); stop(); });
  track.addEventListener("pointermove", (e) => { if (track.hasPointerCapture(e.pointerId)) fromPointer(e); });
  track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") setT(t + DAY); if (e.key === "ArrowLeft") setT(t - DAY); });
  let playTimer = 0;
  const stop = () => { playing = false; play.textContent = "▶"; clearInterval(playTimer); };
  function toggle() {
    if (playing) { stop(); return; }
    playing = true; play.textContent = "❚❚";
    if (t >= tAt(now, 1) - DAY) setT(tAt(now, 0));
    playTimer = window.setInterval(() => { if (t >= tAt(now, 1)) { stop(); return; } setT(t + DAY / 2); }, 140);
  }

  // ---- What if: closures as theatre ----
  const desks = read<Desk>("atlas.pro.shipping.v1");
  const used = new Set<string>();
  for (const d of desks) for (const s of d.shipments ?? []) { const w = world.lanes.find((l) => l.id === `fl${s.id}`); if (w) for (const c of Object.keys(CHOKEPOINTS)) if (whatIf({ ...d, shipments: [s] }, c, now).length) used.add(c); }
  const renderIfs = () => ifs.replaceChildren(...(used.size ? [h("p", { class: "pu-ifs-title" }, "What if…"), ...[...used].map((c) => h("button", { class: "pu-if" + (closed?.includes(c) ? " on" : ""), onclick: () => void theatreFor(c) }, `${CHOKEPOINTS[c].label} closed`))] : []));
  renderIfs();
  async function theatreFor(c: string) {
    theatre.entities.removeAll();
    if (closed?.includes(c)) { closed = undefined; counter.hidden = true; renderIfs(); setT(t); return; }
    closed = [c];
    renderIfs();
    const hits = desks.flatMap((d) => whatIf(d, c, t).map((x) => ({ d, ...x })));
    const node = NODES[CHOKEPOINTS[c].edges[0].split("-")[1]] ?? NODES[CHOKEPOINTS[c].edges[0].split("-")[0]];
    const t0 = performance.now();
    // The strait seals: a red ring that breathes.
    theatre.entities.add({ position: P([node[0], node[1]]), ellipse: { semiMajorAxis: new CallbackProperty(() => 120_000 + 60_000 * Math.sin(Math.floor((performance.now() - t0) / 10) / 30), false), semiMinorAxis: new CallbackProperty(() => 0.95 * (120_000 + 60_000 * Math.sin(Math.floor((performance.now() - t0) / 10) / 30)), false), material: C("#ff453a", 0.25), outline: false } as never });
    theatre.entities.add({ position: P([node[0], node[1]], 2000), label: { text: `${CHOKEPOINTS[c].label} closed`, font: "800 15px Inter, system-ui, sans-serif", fillColor: C("#ff6b5f"), outlineColor: C("#000", 0.8), outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -26), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    // The new world, then each affected ship's new way round drawn growing.
    world = worldAt(t, closed);
    draw();
    for (const x of hits) {
      const lane = world.lanes.find((l) => l.id === `fl${x.s.id}`);
      if (!lane) continue;
      const pts = densify(lane.pts, 120), from = Math.max(0, Math.round(pts.length * (lane.done ?? 0)));
      const ahead = pts.slice(from);
      theatre.entities.add({ polyline: { positions: new CallbackProperty(() => { const k = Math.min(1, (performance.now() - t0) / 2600); return ahead.slice(0, Math.max(2, Math.round(ahead.length * k))).map((p) => P(p, 3000)); }, false), width: 7, material: new PolylineGlowMaterialProperty({ glowPower: 0.3, color: C("#ffb347", 0.95) }) } });
    }
    // The cost counts up.
    const days = hits.reduce((s, x) => s + x.addDays, 0), co2 = hits.reduce((s, x) => s + x.addCo2, 0), usd = days * 50_000;
    counter.hidden = false;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 2600), e = 1 - (1 - k) ** 3;
      counter.replaceChildren(
        h("p", { class: "pu-count-title" }, `If the ${CHOKEPOINTS[c].label} closed`),
        h("div", { class: "pu-count-row" }, h("strong", {}, `+${Math.round(days * e)}`), h("span", {}, "ship-days")),
        h("div", { class: "pu-count-row" }, h("strong", {}, `+${(co2 * e).toFixed(1)} t`), h("span", {}, "CO₂")),
        h("div", { class: "pu-count-row" }, h("strong", {}, `≈ $${Math.round((usd * e) / 1000).toLocaleString()}k`), h("span", {}, "at ~$50k a ship-day")),
        h("p", { class: "pu-count-fine" }, `${hits.length} shipment${hits.length === 1 ? "" : "s"} rerouted${hits.some((x) => x.stuck) ? "; some have no way through" : ""}. ${CHOKEPOINTS[c].note}`));
      scene.requestRender();
      if (k < 1 && !gone) requestAnimationFrame(tick);
    };
    tick();
    const n = NODES[CHOKEPOINTS[c].edges[0].split("-")[0]];
    void flyToPlace(app.globe, { name: CHOKEPOINTS[c].label, lon: n[0], lat: n[1], radius: 3_500_000 });
  }

  // ---- Wall mode: everything else cleared away, the world slowly turning ----
  let offSpin = () => {};
  function wall(on: boolean) {
    document.body.classList.toggle("pulse-wall", on);
    offSpin();
    offSpin = () => {};
    if (on) {
      const spin = scene.preRender.addEventListener(() => { viewer.camera.rotate(Cartesian3.UNIT_Z, -0.0009); });
      const tickClock = window.setInterval(() => { clock.textContent = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); scene.requestRender(); }, 1000);
      clock.textContent = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      offSpin = () => { spin(); clearInterval(tickClock); clock.textContent = ""; };
      try { void document.documentElement.requestFullscreen?.(); } catch { /* not allowed */ }
    } else if (document.fullscreenElement) void document.exitFullscreen();
  }
  const keys = (e: KeyboardEvent) => { if (e.key === "Escape") { if (document.body.classList.contains("pulse-wall")) wall(false); else close(); } else if (e.key === " " && document.activeElement === document.body) { e.preventDefault(); toggle(); } };
  addEventListener("keydown", keys);

  // ---- Capture ----
  async function shoot(asFilm: boolean) {
    const card = { title: "My world", sub: `${fmtDate(t)} · ${world.anchors.length} places, ${world.movers.length} on the move`, accent: "#5ad8ff" };
    const src = scene.canvas;
    if (!asFilm) { await still(src, (cb) => { const off = scene.postRender.addEventListener(() => { off(); cb(); }); scene.requestRender(); }, card); return; }
    await film(src, (cb) => scene.postRender.addEventListener(cb), card, 8, () => {
      const spin = scene.preRender.addEventListener(() => viewer.camera.rotate(Cartesian3.UNIT_Z, -0.0025));
      return spin;
    });
  }

  // ---- Start ----
  let gone = false;
  function close() {
    gone = true;
    stop(); wall(false);
    removeEventListener("keydown", keys);
    void viewer.dataSources.remove(ds, true); void viewer.dataSources.remove(theatre, true);
    el.classList.remove("in");
    document.body.classList.remove("pulse-on");
    setTimeout(() => el.remove(), 300);
    scene.requestRender();
    open = null;
  }
  open = { close };
  setT(now);
  // Frame everything: the planet, centred on what's there.
  const pts = world.anchors.length ? world.anchors : [{ lon: 0, lat: 20 }];
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length, lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  void flyToPlace(app.globe, { name: "Your world", lon, lat, radius: 6_000_000 });
  return { close };
}
