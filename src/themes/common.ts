// Building blocks shared by the theme pages: big numbers, stat grids,
// sections, inline charts and loading/error states.
import { ImageryLayer, UrlTemplateImageryProvider, type Viewer } from "cesium";
import type { App } from "../app";
import { Chart, type ChartData, type ChartOptions } from "../ui/chart";
import { h } from "../ui/dom";

export function hero(value: string, label: string, note?: string): HTMLElement {
  return h("div", { class: "hero-stat" },
    h("span", { class: "hero-value" }, value),
    h("span", { class: "hero-label" }, label),
    note ? h("span", { class: "hero-note" }, note) : "");
}

export function stats(...items: ([string, string] | [string, string, string] | null | false)[]): HTMLElement {
  return h("dl", { class: "stat-list" },
    ...items.filter(Boolean).map((it) => {
      const [label, value, hint] = it as [string, string, string?];
      return h("div", { class: "stat-row", title: hint },
        h("dt", {}, label),
        h("dd", {}, value));
    }));
}

export function section(title: string, ...content: (Node | string)[]): HTMLElement {
  return h("section", { class: "group" }, h("h2", { class: "group-title" }, title), ...content);
}

export function loading(text = "Loading…"): HTMLElement {
  return h("div", { class: "loading" }, h("div", { class: "spinner" }), text);
}

export function failure(err: unknown): HTMLElement {
  return h("p", { class: "error" }, `${(err as Error)?.message ?? String(err)}. Check your connection and try again.`);
}

export function note(text: string): HTMLElement {
  return h("p", { class: "fineprint" }, text);
}

export function action(label: string, onclick: () => void, icon?: string): HTMLButtonElement {
  return h("button", { class: "action", onclick }, icon ? h("span", { class: "action-icon", html: icon }) : "", h("span", {}, label), h("span", { class: "chev", html: "&rsaquo;" }));
}

export function inlineChart(data: ChartData, opts: ChartOptions, height = 170): HTMLElement {
  const chart = new Chart();
  const box = h("div", { class: "inline-chart", style: `height:${height}px` }, chart.el);
  requestAnimationFrame(() => chart.render(data, opts));
  return box;
}

/**
 * Renders async content into `body`: shows a spinner, then `build()`'s result,
 * unless the user has moved on (a newer render started).
 */
export function asyncBlock(app: App, body: HTMLElement, text: string, build: () => Promise<(Node | string)[]>) {
  const token = app.token;
  const holder = h("div", { class: "async" }, loading(text));
  body.append(holder);
  build()
    .then((nodes) => { if (app.isCurrent(token)) holder.replaceChildren(...nodes); })
    .catch((err) => { if (app.isCurrent(token)) holder.replaceChildren(failure(err)); });
}

export function tileLayer(viewer: Viewer, url: string, opts: { maximumLevel: number; credit: string; alpha?: number }): ImageryLayer {
  const layer = new ImageryLayer(new UrlTemplateImageryProvider({ url, maximumLevel: opts.maximumLevel, credit: opts.credit }), { alpha: opts.alpha ?? 1 });
  viewer.imageryLayers.add(layer);
  return layer;
}

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Bearing from one point to another, degrees clockwise from north. */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
