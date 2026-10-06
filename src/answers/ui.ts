// Ask the map: one sentence ("flat, south-facing land under 800 m, near an
// airport, low flood risk") becomes conditions you can see and tune; every
// place on screen is scored against all of them at once, and the planet
// glows where they're met. The best few places are pinned, named and ranked,
// each with the reasons it made the list and what held it back.
import { Cartesian2, Cartographic, type ImageryLayer } from "cesium";
import type { App } from "../app";
import { reverseGeocode } from "../data/geocode";
import { canvasLayer } from "../globe/networkLayer";
import { h } from "../ui/dom";
import { iconFor, labelled } from "../ui/glyph";
import { flyToPlace, freeArea } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import { WorkLayer } from "../work/layer";
import { MEASURES, describe, parseQuery, type Criterion, type Group, type Needs } from "./criteria";
import { kmBetween, makeGrid, needsOf, pickBest, scoreArea, type Area, type Bbox, type Cell } from "./engine";
import { STEP_WORDS, gather } from "./layers";

export const EXAMPLES = [
  "Flat, south-facing land under 800 m, near an airport, low flood risk",
  "Somewhere mild and sunny by the sea, far from volcanoes",
  "Quiet countryside within 60 km of a big city, near a railway",
  "Cool highlands with rain over 1000 mm, in a healthy country",
];

/** The glow: violet where a place half fits, coral, then gold-white where it all does. */
const RAMP: [number, [number, number, number, number]][] = [
  [0.25, [40, 30, 110, 0]], [0.45, [86, 60, 200, 0.4]], [0.65, [236, 72, 140, 0.62]], [0.82, [255, 150, 70, 0.8]], [1, [255, 240, 190, 0.95]],
];
function rampAt(s: number): [number, number, number, number] {
  if (s <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i], [t0, c0] = RAMP[i - 1];
    if (s <= t1) { const u = (s - t0) / (t1 - t0); return c0.map((v, k) => v + (c1[k] - v) * u) as [number, number, number, number]; }
  }
  return RAMP[RAMP.length - 1][1];
}
const LEGEND_STOPS = ["rgba(86,60,200,0.7)", "rgb(236,72,140)", "rgb(255,150,70)", "rgb(255,240,190)"];

/** The scores as a smooth field, drawn into the map's tiles (so it drapes over the terrain). */
function glowLayer(area: Area): ImageryLayer {
  const up = 8;
  const small = document.createElement("canvas");
  small.width = area.nx; small.height = area.ny;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(area.nx, area.ny);
  area.cells.forEach((c, i) => {
    const [r, g, b, a] = c.sea ? [0, 0, 0, 0] : rampAt(c.score);
    img.data.set([r, g, b, Math.round(a * 255)], i * 4);
  });
  sctx.putImageData(img, 0, 0);
  // Upscale once, smoothly, so tiles only slice it.
  const big = document.createElement("canvas");
  big.width = area.nx * up; big.height = area.ny * up;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  // Soften the cells into one field (a blur, drawn with a margin so the edges don't fade in).
  bctx.filter = `blur(${up * 0.4}px)`;
  bctx.drawImage(small, 0, 0, big.width, big.height);
  bctx.filter = "none";
  const { w, s, e, n } = area.box;
  const bbox: [number, number, number, number] = [w, s, e, n];
  const best = area.cells.filter((c) => !c.sea && c.score >= 0.85);
  return canvasLayer((ctx, t) => {
    if (!t.touches(bbox, 2)) return;
    ctx.imageSmoothingEnabled = true;
    // Row bands, so the lat-linear grid lands right on the Mercator tile.
    const band = 3;
    for (let y = 0; y < big.height; y += band) {
      const lat0 = n - (y / big.height) * (n - s), lat1 = n - (Math.min(big.height, y + band) / big.height) * (n - s);
      const [x0, y0] = t.project(w, lat0), [x1, y1] = t.project(e, lat1);
      if (y1 < 0 || y0 > 512) continue;
      ctx.drawImage(big, 0, y, big.width, Math.min(band, big.height - y), x0, y0, x1 - x0, Math.max(0.5, y1 - y0) + 0.5);
    }
    // The places that meet everything shine.
    ctx.globalCompositeOperation = "lighter";
    const [ax] = t.project(w, s), [bx] = t.project(e, s);
    const cellPx = Math.abs(bx - ax) / area.nx;
    for (const c of best) {
      const [x, y] = t.project(c.lon, c.lat);
      const r = Math.max(4, cellPx * 0.9);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.08 + (c.score - 0.85) * 1.2;
      g.addColorStop(0, `rgba(255,245,210,${a})`);
      g.addColorStop(0.5, `rgba(255,170,90,${a * 0.35})`);
      g.addColorStop(1, "rgba(255,120,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, { maximumLevel: 14, credit: "Answers across layers: Terreno" });
}

/** The part of the world you can see between the panels, trimmed to something worth scoring cell by cell. */
function viewArea(app: App): Bbox | null {
  const { viewer } = app.globe, canvas = viewer.scene.canvas;
  const pad = freeArea(canvas), W = canvas.clientWidth, H = canvas.clientHeight;
  const d = 180 / Math.PI;
  const lons: number[] = [], lats: number[] = [];
  // Sample the visible map's edges; points over the sky are skipped.
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    if (i && i < 4 && j && j < 4) continue;
    const x = pad.left + ((W - pad.left - pad.right) * i) / 4, y = pad.top + ((H - pad.top - pad.bottom) * j) / 4;
    const p = viewer.camera.pickEllipsoid(new Cartesian2(x, y));
    if (!p) continue;
    const c = Cartographic.fromCartesian(p);
    lons.push(c.longitude * d); lats.push(c.latitude * d);
  }
  let w: number, e: number, s: number, n: number;
  if (lons.length >= 12 && Math.max(...lons) - Math.min(...lons) < 180) {
    [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  } else {
    const r = viewer.camera.computeViewRectangle();
    if (!r) return null;
    [w, e, s, n] = [r.west * d, r.east * d, r.south * d, r.north * d];
    if (e < w) e = 180; // Across the date line: the western side is enough.
  }
  s = Math.max(-70, s); n = Math.min(75, n);
  if (n <= s) return null;
  // Seen from space, answer for the middle of the view.
  const cx = (w + e) / 2, cy = (s + n) / 2, maxW = 50, maxH = 36;
  if (e - w > maxW) { w = cx - maxW / 2; e = cx + maxW / 2; }
  const hh = Math.min(n - s, maxH) / 2;
  return { w, e, s: cy - hh, n: cy + hh };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const GROUPS: Group[] = ["Ground", "Climate", "People", "Getting there", "Water", "Hazards", "Country"];
const NOTES: Partial<Record<Needs, string>> = {
  climate: "Climate is last year's weather (ERA5 via Open-Meteo), adjusted for height.",
  places: "Crowds count towns and cities (Natural Earth), not the countryside between them.",
  water: "Flood risk is a rough proxy (flat ground by a river, low ground by the sea), not a flood map.",
  hazards: "Volcanoes are the famous ones only; fault distance is to the nearest plate boundary.",
  country: "Country figures are national averages (World Bank).",
};

interface State {
  query: string;
  criteria: Criterion[];
  notYet: string[];
  area: Area | null;
  names: Map<string, string>;
  /** "Places like this": the place itself isn't an answer. */
  exclude?: [number, number];
}
const state: State = { query: "", criteria: [], notYet: [], area: null, names: new Map() };
/** The best places, leaving out the one being compared with. */
const bestOf = (area: Area) => pickBest(area, 6).filter((c) => !state.exclude || kmBetween(c.lon, c.lat, state.exclude[0], state.exclude[1]) > Math.max(40, area.cellKm * 2)).slice(0, 5);
let glow: ImageryLayer | null = null;
let pins: WorkLayer | null = null;
let job = 0;

function paint(app: App) {
  const area = state.area;
  if (glow) { app.globe.viewer.imageryLayers.remove(glow, true); glow = null; }
  if (!area) return;
  glow = glowLayer(area);
  app.globe.viewer.imageryLayers.add(glow);
  pins ??= new WorkLayer(app, "answers-pins", "Answers", "#ffb04a", false);
  pins.set(bestOf(area).map((c, i) => ({ id: `a${i}`, kind: "point", pts: [[c.lon, c.lat]], color: "#2a1650", label: String(i + 1) })));
  app.looks?.setLegend({ emoji: "✨", name: "How well it fits", stops: LEGEND_STOPS, from: "half", to: "all of it" });
  app.canvas.put({
    id: "answers", label: "Answers: where it fits", color: "#ffb04a", scope: "world", pinned: false,
    show: (v) => { if (glow) glow.show = v; pins?.show(v); },
    remove: () => clearMap(app, false),
  }, true);
}

function clearMap(app: App, fromCanvas = true) {
  document.querySelector(".ask-peek")?.remove();
  if (glow) { app.globe.viewer.imageryLayers.remove(glow, true); glow = null; }
  pins?.clear(false);
  app.looks?.setLegend(null);
  if (fromCanvas) app.canvas.drop("answers");
}

/** A value as said: the coast is "on the coast" when it runs through the cell. */
const valueText = (key: string, v: number, area: Area) =>
  !Number.isFinite(v) ? "unknown" : key === "coast" && v <= area.cellKm / 4 + 0.01 ? "on the coast" : MEASURES[key].fmt(v);

const cellKey = (c: Cell) => `${c.lon.toFixed(3)},${c.lat.toFixed(3)}`;

/** Opens Ask the map, optionally with a question to answer straight away. */
export function openAsk(ctx: WorkCtx, question?: string, preset?: { title: string; criteria: Criterion[]; exclude?: [number, number] }) {
  const { app } = ctx;
  if (preset) Object.assign(state, { query: preset.title, criteria: preset.criteria.map((c) => ({ ...c })), notYet: [], area: null, exclude: preset.exclude });
  else if (question !== undefined && question.trim() && question.trim() !== state.query) {
    const p = parseQuery(question);
    Object.assign(state, { query: question.trim(), criteria: p.criteria, notYet: p.notYet, area: null, exclude: undefined });
  }
  const input = h("textarea", { class: "ask-input", rows: 2, placeholder: "Find flat, south-facing land under 800 m near an airport, low flood risk", "aria-label": "What are you looking for?" }) as HTMLTextAreaElement;
  input.value = state.query;
  const understood = h("div", { class: "ask-conds" });
  const notes = h("div", { class: "ask-notes" });
  const progress = h("div", { class: "ask-progress", hidden: true, role: "status" });
  const results = h("div", { class: "ask-results" });
  const go = h("button", { class: "primary-btn ask-go" }, ...labelled("✨ Answer on the map"));

  const read = () => {
    const p = parseQuery(input.value);
    Object.assign(state, { query: input.value.trim(), criteria: p.criteria, notYet: p.notYet, exclude: undefined });
    renderConds();
  };

  const rescore = () => {
    if (!state.area) return;
    scoreArea(state.area, state.criteria);
    paint(app);
    renderResults();
  };
  let t = 0;
  const rescoreSoon = () => { clearTimeout(t); t = window.setTimeout(rescore, 120); };

  const renderConds = () => {
    const rows = state.criteria.map((c, i) => {
      const m = MEASURES[c.key];
      const label = h("span", { class: "ask-cond-text" }, describe(c));
      const slider = h("input", { type: "range", min: m.min, max: m.max, step: m.step, value: c.value, "aria-label": `${m.label} limit` }) as HTMLInputElement;
      slider.addEventListener("input", () => { c.value = Number(slider.value); label.textContent = describe(c); rescoreSoon(); });
      const flip = c.op === "dir" ? "" : h("button", { class: "ask-flip", title: "Switch between under and over", onclick: () => { c.op = c.op === "lt" ? "gt" : "lt"; label.textContent = describe(c); rescoreSoon(); } }, c.op === "lt" ? "≤" : "≥");
      return h("div", { class: "ask-cond", style: `--i:${i}` },
        h("span", { class: "ask-cond-icon" }, iconFor(m.emoji, 16)),
        h("div", { class: "ask-cond-body" }, h("div", { class: "ask-cond-top" }, label, flip), slider),
        h("button", { class: "ask-x", "aria-label": `Remove ${describe(c)}`, onclick: () => { state.criteria.splice(i, 1); renderConds(); rescoreSoon(); } }, "✕"));
    });
    const add = h("select", { class: "ask-add", "aria-label": "Add a condition" },
      h("option", { value: "" }, "+ Add a condition"),
      ...GROUPS.map((g) => h("optgroup", { label: g }, ...Object.values(MEASURES).filter((m) => m.group === g && !state.criteria.some((c) => c.key === m.key)).map((m) => h("option", { value: m.key }, m.label))))) as HTMLSelectElement;
    add.addEventListener("change", () => {
      const m = MEASURES[add.value];
      if (!m) return;
      state.criteria.push({ key: m.key, op: m.op, value: m.value });
      renderConds();
      // A new kind of data needs reading; the rest re-scores at once.
      if (state.area && !state.area.read.has(m.needs)) void answer(); else rescoreSoon();
    });
    understood.replaceChildren(
      state.criteria.length ? h("div", { class: "ask-label" }, "Understood as") : h("p", { class: "muted small" }, "Say what matters, like height, warmth, rain, airports, rivers or flood risk."),
      ...rows, add);
    notes.replaceChildren(...state.notYet.map((n) => h("p", { class: "ask-note" }, n)));
    go.toggleAttribute("disabled", !state.criteria.length);
  };

  const renderResults = () => {
    const area = state.area;
    if (!area) { results.replaceChildren(); return; }
    const land = area.cells.filter((c) => !c.sea);
    const good = land.filter((c) => c.score >= 0.7).length;
    const best = bestOf(area);
    const summary = h("div", { class: "ask-summary" },
      h("strong", {}, land.length ? pct(good / land.length) : "0%"),
      h("span", {}, good ? "of the land on screen fits well; it glows gold." : "of the land on screen fits well. Loosen a condition, or move the map and search again."));
    const cards = best.map((c, i) => {
      const key = cellKey(c);
      const name = h("strong", { class: "ask-name" }, state.names.get(key) ?? `${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}°`);
      if (!state.names.has(key)) {
        state.names.set(key, name.textContent!);
        void (async () => {
          await new Promise((r) => setTimeout(r, i * 1100)); // Nominatim asks for one request a second.
          const p = await reverseGeocode(c.lon, c.lat, 10).catch(() => null);
          if (!p) return;
          const label = p.context ? `Near ${p.title} · ${p.context.split(", ").slice(-2).join(", ")}` : `Near ${p.title}`;
          state.names.set(key, label);
          name.textContent = label;
        })();
      }
      const weakest = c.parts.reduce((m, s, k) => (s < c.parts[m] ? k : m), 0);
      const bars = state.criteria.map((k, j) => {
        const m = MEASURES[k.key], v = c.v[k.key], s = c.parts[j] ?? 0;
        return h("div", { class: "ask-bar" },
          h("span", { class: "ask-bar-icon" }, iconFor(m.emoji, 13)),
          h("span", { class: "ask-bar-label" }, describe(k)),
          h("span", { class: "ask-bar-track" }, h("i", { style: `width:${pct(s)};background:${s > 0.8 ? "var(--ask-good)" : s > 0.4 ? "var(--ask-mid)" : "var(--ask-bad)"}` })),
          h("span", { class: "ask-bar-value" }, valueText(k.key, v, area)));
      });
      const held = c.parts[weakest] !== undefined && c.parts[weakest] < 0.8 ? h("p", { class: "ask-held" }, `Held back by ${MEASURES[state.criteria[weakest].key].label.toLowerCase()}: ${valueText(state.criteria[weakest].key, c.v[state.criteria[weakest].key], area)}.`) : "";
      return h("button", { class: "ask-card", style: `--i:${i}`, onclick: () => {
        void flyToPlace(app.globe, { name: name.textContent ?? "", lon: c.lon, lat: c.lat, radius: Math.max(3000, area.cellKm * 1500) });
        app.select({ lon: c.lon, lat: c.lat, height: 0 });
      } },
        h("span", { class: "ask-rank" }, String(i + 1)),
        h("div", { class: "ask-card-main" }, h("div", { class: "ask-card-head" }, name, h("span", { class: "ask-score" }, pct(c.score))), ...bars, held));
    });
    results.replaceChildren(summary,
      cards.length ? h("div", { class: "ask-cards" }, ...cards) : h("p", { class: "muted small" }, "Nothing here meets enough of it. Try loosening the tightest condition (its slider), or look somewhere else."),
      h("p", { class: "muted small" }, [...area.read].map((n) => NOTES[n]).filter(Boolean).join(" "), area.missing.length ? ` Couldn't read ${area.missing.map((n) => STEP_WORDS[n]).join(", ")} just now; those conditions count as unknown.` : ""),
      h("button", { class: "link-btn", onclick: () => { clearMap(app); state.area = null; renderResults(); } }, "Clear from the map"));
  };

  const answer = async () => {
    if (!state.criteria.length) return;
    const box = viewArea(app);
    if (!box) { app.toast("Turn the globe so some land is in view, then try again.", 4000); return; }
    const my = ++job;
    const area = makeGrid(box);
    const needs = needsOf(state.criteria);
    // Keep what's already read for the same view (adding a condition only reads what's new).
    const prev = state.area;
    const same = prev && Math.abs(prev.box.w - box.w) < 1e-6 && Math.abs(prev.box.n - box.n) < 1e-6 && Math.abs(prev.box.e - box.e) < 1e-6;
    const a = same ? prev : area;
    const steps = [...needs].filter((n) => !a.read.has(n));
    progress.hidden = false;
    progress.replaceChildren(h("div", { class: "ask-label" }, "Reading the layers"), ...steps.map((n) => h("div", { class: "ask-step", "data-n": n }, h("i"), `Reading ${STEP_WORDS[n]}`)));
    go.setAttribute("disabled", "");
    await gather(a, needs, (n, ok) => {
      const el = progress.querySelector(`[data-n="${n}"]`);
      el?.classList.add(ok ? "done" : "failed");
    });
    go.removeAttribute("disabled");
    if (my !== job) return;
    progress.hidden = true;
    state.area = a;
    if (!same) state.names.clear();
    rescore();
    // On a phone the panel covers the map: step aside so the answer shows, with a way back.
    if (matchMedia("(max-width: 720px)").matches) {
      const n = bestOf(a).length;
      ctx.hide();
      document.querySelector(".ask-peek")?.remove();
      const peek = h("button", { class: "ask-peek", onclick: () => { peek.remove(); ctx.unhide(); } }, ...labelled(`✨ ${n ? `${n} place${n > 1 ? "s" : ""} found` : "No close match"} · Show the list`));
      document.getElementById("ui")?.append(peek);
    }
  };

  go.addEventListener("click", () => { read(); void answer(); });
  input.addEventListener("input", () => { clearTimeout(t); t = window.setTimeout(read, 250); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); read(); void answer(); } });

  const chips = h("div", { class: "ask-examples" }, ...EXAMPLES.map((q) => h("button", { class: "fl-chip", onclick: () => { input.value = q; read(); void answer(); } }, q)));
  ctx.show("Ask the map", ctx.home,
    h("div", { class: "ask-hero" },
      h("p", { class: "ask-lede" }, "Ask for places that meet many things at once. Terreno reads the ground, climate, towns, roads, rivers, hazards and country figures together, for everywhere on screen."),
      input, go),
    understood, notes, progress, results,
    state.query ? "" : h("div", {}, h("div", { class: "ask-label" }, "Try"), chips));
  renderConds();
  renderResults();
  if ((question || preset) && state.criteria.length && !state.area) void answer();
}
