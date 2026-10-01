// Made and grown nearby, on screen: a bloom of every source around the site
// (at its true bearing, nearer ones closer in, rings at 10, 25 and 50 km),
// supply lines on the map with drops flowing in to the site, the nearest
// sources in a list, and for food a season wheel of what grows here when.
import { Cartesian2 } from "cesium";
import type { App } from "../app";
import { monthlyNormals } from "../analysis/climate";
import { history } from "../data/openmeteo";
import { overpass } from "../data/overpass";
import { arcFlow, OpsMap, empty, title } from "../pro/kit/ui";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "./hub";
import type { WorkFeature } from "./layer";
import { bands, inSeason, mainDirection, PRODUCE, sourceSet, sourcesQuery, toSources, type Source, type SourceSet } from "./sourcing";

const NS = "http://www.w3.org/2000/svg";
const svgEl = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number> = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

let map: OpsMap | null = null;

/** Every source as a dot at its bearing, the radius by the square root of distance. */
function bloom(set: SourceSet, src: Source[], size = 280, onPick?: (s: Source) => void): SVGSVGElement {
  const c = size / 2, R = c - 14, k = (km: number) => (Math.sqrt(km / set.radiusKm) * R);
  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "src-bloom", role: "img", "aria-label": `${set.label}: sources around the site` });
  for (const km of [10, 25, 50].filter((x) => x <= set.radiusKm)) {
    svg.append(svgEl("circle", { cx: c, cy: c, r: k(km), class: "src-ring" }));
    const t = svgEl("text", { x: c + 3, y: c - k(km) + 10, class: "src-ring-label" }); t.textContent = `${km} km`; svg.append(t);
  }
  const col = new Map(set.kinds.map((f) => [f.id, f.color]));
  src.slice(0, 900).forEach((s, i) => {
    const a = (s.bearing * Math.PI) / 180, r = k(s.km), x = c + Math.sin(a) * r, y = c - Math.cos(a) * r;
    if (i < 60) svg.append(svgEl("line", { x1: c, y1: c, x2: x, y2: y, stroke: col.get(s.kind) ?? "#fff", class: "src-spoke" }));
    const d = svgEl("circle", { cx: x, cy: y, r: i < 60 ? 3.6 : 2.4, fill: col.get(s.kind) ?? "#fff", class: "src-dot" });
    const tt = svgEl("title"); tt.textContent = `${s.name} · ${s.km.toFixed(1)} km`; d.append(tt);
    if (onPick) d.addEventListener("click", () => onPick(s));
    svg.append(d);
  });
  svg.append(svgEl("circle", { cx: c, cy: c, r: 6, class: "src-site" }));
  const n = svgEl("text", { x: c, y: 11, class: "src-n" }); n.textContent = "N"; svg.append(n);
  return svg;
}

/** Twelve months as a wheel, each shaded by its warmth, with what's in season around the rim. */
function seasonWheel(T: number[], now: number, size = 280): SVGSVGElement {
  const c = size / 2, r0 = c * 0.42, r1 = c * 0.7;
  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "season-wheel", role: "img", "aria-label": "What's in season here, month by month" });
  const lo = Math.min(...T), hi = Math.max(...T);
  const pt = (a: number, r: number) => [c + Math.sin(a) * r, c - Math.cos(a) * r];
  for (let m = 0; m < 12; m++) {
    const a0 = (m / 12) * Math.PI * 2 + 0.01, a1 = ((m + 1) / 12) * Math.PI * 2 - 0.01;
    const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
    const t = (T[m] - lo) / Math.max(1, hi - lo);
    const seg = svgEl("path", { d: `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`, fill: `hsl(${200 - t * 170}, 70%, ${62 - t * 8}%)`, class: "sw-month" + (m === now ? " now" : "") });
    const tt = svgEl("title"); tt.textContent = `${MONTHS[m]}: ${T[m].toFixed(0)} °C on average · ${inSeason(T, m).map((p) => p.label).join(", ") || "little in season"}`; seg.append(tt);
    svg.append(seg);
    const [lx, ly] = pt((a0 + a1) / 2, (r0 + r1) / 2);
    const lab = svgEl("text", { x: lx, y: ly, class: "sw-label" }); lab.textContent = MONTHS[m][0]; svg.append(lab);
    // Produce in season: small emoji stacked outward from the rim.
    inSeason(T, m).slice(0, 4).forEach((p, i) => {
      const [ex, ey] = pt((a0 + a1) / 2, r1 + 11 + i * 12);
      const e = svgEl("text", { x: ex, y: ey, class: "sw-emoji" + (m === now ? " now" : "") }); e.textContent = p.emoji; svg.append(e);
    });
  }
  const t = svgEl("text", { x: c, y: c - 2, class: "sw-center" }); t.textContent = MONTHS[now]; svg.append(t);
  const t2 = svgEl("text", { x: c, y: c + 14, class: "sw-sub" }); t2.textContent = `${T[now].toFixed(0)} °C`; svg.append(t2);
  return svg;
}

export function openSourcing(ctx: WorkCtx, setId: string) {
  const set = sourceSet(setId);
  if (!set) return;
  const { app } = ctx;
  map ??= new OpsMap(app, "sourcing", "#8bd346");
  const status = h("p", { class: "muted small" });
  const body = h("div", {});
  const run = (site: { lon: number; lat: number; name: string }) => {
    status.textContent = `Looking ${set.radiusKm} km around ${site.name}…`;
    body.replaceChildren();
    void flyToPlace(app.globe, { name: site.name, lon: site.lon, lat: site.lat, radius: set.radiusKm * 900 });
    void overpass(sourcesQuery(set, site.lon, site.lat)).then((els) => {
      const src = toSources(els, set, site);
      status.textContent = "";
      const pick = (s: Source) => { app.select({ lon: s.lon, lat: s.lat, height: 0 }, { title: s.name, context: set.kinds.find((f) => f.id === s.kind)?.label ?? "" }); void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 600 }); };
      const col = new Map(set.kinds.map((f) => [f.id, f.color]));
      const flows = src.slice(0, 40).map((s, i) => arcFlow(`f${i}`, s, site, col.get(s.kind) ?? "#fff", 0.6));
      const feats: WorkFeature[] = [...src.slice(0, 400).map((s): WorkFeature => ({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: col.get(s.kind) ?? "#fff" })), { id: "site", kind: "point", pts: [[site.lon, site.lat]], color: "#ffffff", label: site.name }];
      map!.draw(set.label, [...flows.map((f) => f.line), ...feats], flows.map((f) => f.flow));
      if (!src.length) { body.replaceChildren(empty(`Nothing of this kind is mapped within ${set.radiusKm} km on OpenStreetMap yet.`)); return; }
      const dir = mainDirection(src);
      const b = bands(src);
      body.replaceChildren(
        h("p", { class: "src-lede" }, h("strong", {}, String(src.length)), ` within ${set.radiusKm} km of ${site.name}; the nearest ${src[0].km < 1 ? `${Math.round(src[0].km * 1000)} m` : `${src[0].km.toFixed(1)} km`} away${dir ? `; most lie to the ${dir}` : ""}.`),
        h("div", { class: "src-top" }, bloom(set, src, 280, pick),
          h("div", { class: "src-kinds" }, ...set.kinds.map((f) => {
            const row = b.find((x) => x.kind === f.id);
            return h("div", { class: "src-kind", style: `--c:${f.color}` }, h("i", {}), h("span", {}, `${f.emoji} ${f.label}`), h("small", {}, row ? row.within.map((n, i) => `${n}${i === 0 ? " ≤10" : i === 1 ? " ≤25" : " ≤50"}`).join(" · ") : "none"));
          }))),
        set.id === "food" ? seasonBlock(site) : "",
        title("Nearest"),
        h("div", { class: "list" }, ...src.slice(0, 25).map((s) => {
          const f = set.kinds.find((x) => x.id === s.kind)!;
          return h("button", { class: "list-row", onclick: () => pick(s) }, h("span", { class: "dot", style: `background:${f.color}` }), h("span", { class: "sc-row-main" }, h("strong", {}, s.name), h("small", {}, f.label)), h("span", { class: "muted small" }, `${s.km.toFixed(1)} km`));
        })),
        h("p", { class: "fineprint" }, "From OpenStreetMap: only what volunteers have mapped, so a blank patch may still have farms or makers. Lines on the map join the 40 nearest to the site."));
    }).catch(() => { status.textContent = "Couldn't reach OpenStreetMap just now. Try again in a moment."; });
  };
  const centre = () => { const c = app.globe.viewer.canvas, p = app.globe.pick(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2)); return p ? { lon: p.lon, lat: p.lat, name: "the middle of the map" } : null; };
  const mine = (() => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { name: string; lon: number; lat: number }[]).slice(0, 6); } catch { return []; } })();
  ctx.show(set.label, ctx.home,
    h("p", { class: "sc-lede" }, set.who, "."),
    h("div", { class: "row-btns" },
      h("button", { class: "primary-btn", onclick: () => { const c = centre(); if (c) run(c); else status.textContent = "Point the map at a place first."; } }, "◎ Around the middle of the map"),
      h("button", { class: "pill-btn", onclick: () => { ctx.hide(); app.pickOnce("Tap the site", (p) => { ctx.unhide(); run({ lon: p.lon, lat: p.lat, name: "the spot you tapped" }); }, () => ctx.unhide()); } }, "Tap the site"),
      ...mine.map((p) => h("button", { class: "chip", onclick: () => run(p) }, `⌂ ${p.name}`))),
    status, body);
}

/** The season wheel for a site, from 30 years of its weather. */
function seasonBlock(site: { lon: number; lat: number }): HTMLElement {
  const box = h("div", { class: "season-block" }, h("p", { class: "muted small" }, "Reading the local climate…"));
  void history(site.lon, site.lat).then((hist) => {
    const n = monthlyNormals(hist.daily.time, hist.daily.temperature_2m_mean, hist.daily.precipitation_sum, 1991, 2020);
    if (n.temp.some((t) => Number.isNaN(t))) { box.replaceChildren(); return; }
    const now = new Date().getMonth(), next = (now + 1) % 12;
    const here = inSeason(n.temp, now), coming = inSeason(n.temp, next).filter((p) => !here.includes(p));
    box.replaceChildren(
      title("In season here"),
      h("div", { class: "src-top" }, seasonWheel(n.temp, now),
        h("div", { class: "season-list" },
          h("p", {}, h("strong", {}, "Now: "), here.length ? here.map((p) => `${p.emoji} ${p.label}`).join(", ") : "little grows in this month here"),
          coming.length ? h("p", {}, h("strong", {}, `Coming in ${MONTHS[next]}: `), coming.map((p) => `${p.emoji} ${p.label}`).join(", ")) : "",
          h("p", { class: "muted small" }, `A rough guide from the local climate (1991–2020 monthly temperatures), for ${PRODUCE.length} kinds of produce; growers' own calendars beat it.`))));
  }).catch(() => box.replaceChildren());
  return box;
}

export const clearSourcing = (_app?: App) => map?.clear();
