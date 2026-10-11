// Drawing a slide's visual (presentData.ts) in Terreno's hand: hairlines, figures in mono, the four pigments,
// and motion that tells the story: bars grow in rank order, a line draws itself left to right, a figure counts
// up to its value, a share fills tile by tile, places land on the globe one after another.
import { Cartesian2, Cartesian3, Color, LabelStyle, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import { countUp, dropIn } from "../ui/motion";
import { niceTicks, short, tiles, type Spot, type Visual } from "./presentData";

/** The pigments, in the order a share uses them (styles.css :root). */
const PIGMENTS = ["var(--ochre)", "var(--cobalt)", "var(--sage)", "var(--terra)", "var(--umber)", "#8a8f86", "#b9a77d", "#4e6f8f"];
const OCHRE = "#c4922b";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: Element[]) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};

const head = (v: Visual, extra?: string) =>
  v.title || extra ? h("div", { class: "pv-head" }, v.title ? h("span", { class: "pv-title" }, v.title) : "", extra ? h("span", { class: "pv-sub" }, extra) : "") : "";

function bars(v: Extract<Visual, { kind: "bars" }>): HTMLElement {
  const max = Math.max(...v.items.map((x) => Math.abs(x.value))) || 1;
  return h("div", { class: "pv pv-bars" }, head(v),
    h("ol", { class: "pv-rows" }, ...v.items.map((x, i) =>
      h("li", { style: `--i:${i}` },
        h("span", { class: "pv-label", title: x.label }, x.label),
        h("span", { class: "pv-track" }, h("span", { class: "pv-bar" + (x.value < 0 ? " neg" : ""), style: `--w:${(Math.abs(x.value) / max) * 100}%` })),
        h("span", { class: "pv-val" }, short(x.value, v.unit))))));
}

function line(v: Extract<Visual, { kind: "line" }>): HTMLElement {
  const W = 600, H = 240, L = 8, R = 8, T = 14, B = 26;
  const ys = v.items.map((x) => x.value);
  const lo0 = Math.min(...ys), hi0 = Math.max(...ys);
  // Start the axis at zero when the values are all one side of it and not far off it.
  const ticks = niceTicks(lo0 >= 0 && lo0 < hi0 * 0.5 ? 0 : lo0, hi0);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = (i: number) => L + (i / Math.max(1, v.items.length - 1)) * (W - L - R);
  const y = (val: number) => T + (1 - (val - lo) / (hi - lo || 1)) * (H - T - B);
  const d = v.items.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = v.items[v.items.length - 1], first = v.items[0];
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "pv-svg", role: "img", "aria-label": `${v.title ?? "Values"} from ${first.label} to ${last.label}` },
    ...ticks.map((t) => svg("g", { class: "pv-grid" }, svg("line", { x1: L, x2: W - R, y1: y(t), y2: y(t) }), Object.assign(svg("text", { x: W - R, y: y(t) - 4, "text-anchor": "end" }), { textContent: short(t, v.unit) }))),
    svg("path", { class: "pv-area", d: `${d}L${x(v.items.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z` }),
    svg("path", { class: "pv-line", d, pathLength: 1 }),
    svg("circle", { class: "pv-dot", cx: x(v.items.length - 1), cy: y(last.value), r: 5 }),
    Object.assign(svg("text", { class: "pv-x", x: L, y: H - 6 }), { textContent: first.label }),
    Object.assign(svg("text", { class: "pv-x", x: W - R, y: H - 6, "text-anchor": "end" }), { textContent: last.label }));
  return h("div", { class: "pv pv-line-chart" }, head(v),
    h("div", { class: "pv-now" }, h("span", { class: "pv-figure small" }, short(last.value, v.unit)), h("span", { class: "pv-sub" }, last.label)),
    chart as unknown as HTMLElement);
}

function figure(v: Extract<Visual, { kind: "number" }>): HTMLElement {
  let change: HTMLElement | "" = "";
  if (v.was !== undefined && v.was !== 0) {
    const pct = ((v.value - v.was) / Math.abs(v.was)) * 100;
    const words = Math.abs(pct) < 0.5 ? "About the same" : `${pct > 0 ? "Up" : "Down"} ${short(Math.abs(pct), "%")}`;
    change = h("p", { class: "pv-change" + (pct > 0.5 ? " up" : pct < -0.5 ? " down" : "") }, `${words}${v.wasLabel ? ` since ${v.wasLabel}` : ""}`, h("span", { class: "pv-sub" }, ` from ${short(v.was, v.unit)}`));
  }
  return h("div", { class: "pv pv-number" }, h("span", { class: "pv-figure" }, short(v.value, v.unit)), v.title ? h("p", { class: "pv-title" }, v.title) : "", change);
}

function share(v: Extract<Visual, { kind: "share" }>): HTMLElement {
  const n = tiles(v.items);
  const cells: HTMLElement[] = [];
  n.forEach((count, k) => { for (let j = 0; j < count; j++) cells.push(h("span", { class: "pv-tile", style: `--c:${PIGMENTS[k % PIGMENTS.length]};--i:${cells.length}` })); });
  return h("div", { class: "pv pv-share" }, head(v), h("div", { class: "pv-share-body" },
    h("div", { class: "pv-tiles", role: "img", "aria-label": v.items.map((x, k) => `${x.label} ${n[k]}%`).join(", ") }, ...cells),
    h("ul", { class: "pv-legend" }, ...v.items.map((x, k) =>
      h("li", { style: `--c:${PIGMENTS[k % PIGMENTS.length]};--i:${k}` }, h("span", { class: "pv-key" }), h("span", { class: "pv-label" }, x.label), h("span", { class: "pv-val" }, `${n[k]}%`))))));
}

function points(v: Extract<Visual, { kind: "points" }>): HTMLElement {
  const valued = v.items.some((p) => p.value !== undefined);
  const top = valued ? [...v.items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5) : v.items.slice(0, 5);
  return h("div", { class: "pv pv-points" }, head(v, `${v.items.length} place${v.items.length === 1 ? "" : "s"}`),
    h("ol", { class: "pv-rows plain" }, ...top.map((p, i) =>
      h("li", { style: `--i:${i}` }, h("span", { class: "pv-key" }), h("span", { class: "pv-label" }, p.label), h("span", { class: "pv-val" }, p.value !== undefined ? short(p.value, v.unit) : "")))));
}

/** A slide's visual as an element; `mini` for the editor's preview. */
export function visualEl(v: Visual, mini = false): HTMLElement {
  const el = v.kind === "bars" ? bars(v) : v.kind === "line" ? line(v) : v.kind === "number" ? figure(v) : v.kind === "share" ? share(v) : v.kind === "points" ? points(v)
    : h("figure", { class: "pv pv-image" }, h("img", { src: v.src, alt: v.title ?? "A chart" }), v.title ? h("figcaption", {}, v.title) : "");
  if (mini) el.classList.add("mini");
  return el;
}

/** Puts the element on screen and starts its figures counting. */
export function animateVisual(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>(".pv-figure, .pv-val").forEach((f) => countUp(f));
}

/** A one-line description of a visual for the slide list. */
export function visualLabel(v: Visual): string {
  switch (v.kind) {
    case "bars": return `Bars, ${v.items.length} items`;
    case "line": return `A line, ${v.items.length} points`;
    case "number": return `A figure, ${short(v.value, v.unit)}`;
    case "share": return `Shares, ${v.items.length} parts`;
    case "points": return `${v.items.length} places on the globe`;
    case "image": return "A picture";
  }
}

/** Shows a points visual on the globe, each place landing a beat after the last; returns how to take it off. */
export function showPoints(app: App, v: Extract<Visual, { kind: "points" }>): () => void {
  const { viewer } = app.globe;
  const vals = v.items.map((p) => p.value).filter((x): x is number => x !== undefined && x > 0);
  const max = vals.length ? Math.max(...vals) : 0;
  // Up to eight labels, the biggest first, none crowding another at the slide's zoom.
  const lats = v.items.map((p) => p.lat), lons = v.items.map((p) => p.lon);
  const near = Math.max(0.002, Math.max(Math.max(...lats) - Math.min(...lats), Math.min(360 - (Math.max(...lons) - Math.min(...lons)), Math.max(...lons) - Math.min(...lons))) / 14);
  const ranked = new Set<Spot>();
  for (const p of max ? [...v.items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) : v.items) {
    if (ranked.size >= 8) break;
    if (![...ranked].some((q) => Math.abs(q.lat - p.lat) < near && Math.abs(q.lon - p.lon) < near * 2)) ranked.add(p);
  }
  const fill = Color.fromCssColorString(OCHRE);
  const added: Entity[] = v.items.slice(0, 2000).map((p, i) => {
    // Area, not radius, follows the value.
    const size = max && p.value !== undefined && p.value > 0 ? 8 + 22 * Math.sqrt(p.value / max) : 11;
    return viewer.entities.add({
      position: Cartesian3.fromDegrees(p.lon, p.lat),
      point: { pixelSize: dropIn(viewer, Math.min(i, 40), size), color: fill.withAlpha(0.88), outlineColor: Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: ranked.has(p) ? {
        text: p.value !== undefined ? `${p.label}  ${short(p.value, v.unit)}` : p.label,
        font: "600 13px 'Terreno Sans', 'Plus Jakarta Sans', sans-serif", style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: Color.fromCssColorString("#1b1d1a"),
        fillColor: Color.WHITE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -(size / 2 + 6)), disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });
  });
  viewer.scene.requestRender();
  return () => { for (const e of added) viewer.entities.remove(e); viewer.scene.requestRender(); };
}
