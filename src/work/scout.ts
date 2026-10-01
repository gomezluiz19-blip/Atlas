// Look round and Scout: the everyday and pro sides of an industry around a
// place. Look round shows what's within a walk of the middle of the map as a
// radar (north up, rings every 200 m), the places on the map in their
// colours, and the industry's signature places worldwide, each with its
// intro. Scout drops up to four candidate addresses and compares them: what
// draws people within a walk, who else is there, a score, and a radar each.
import { Cartesian2 } from "cesium";
import type { App } from "../app";
import { overpass } from "../data/overpass";
import { introsTagged } from "../intros/places";
import { OpsMap, frame, lines, title, empty } from "../pro/kit/ui";
import { ring } from "../pro/kit/ops";
import { downloadCsv } from "../pro/kit/report";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "./hub";
import type { WorkFeature } from "./layer";
import { industry, kindsOf, metres, nearestFirst, query, scoreSite, toPois, WALK, type Find, type Industry, type Poi } from "./scoutModel";

const KEY = "atlas.work.scout.v1";
interface Candidate { id: string; name: string; lon: number; lat: number }
interface Saved { industry: string; as?: string; sites: Candidate[] }
const readAll = (): Saved[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const saved = (id: string): Saved => readAll().find((s) => s.industry === id) ?? { industry: id, sites: [] };
const keep = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify([...readAll().filter((x) => x.industry !== s.industry), s])); } catch { /* private mode */ } };

let map: OpsMap | null = null;
const mapFor = (app: App) => (map ??= new OpsMap(app, "scout", "#ff6b3d"));

function centre(app: App): { lon: number; lat: number } | null {
  const c = app.globe.viewer.canvas;
  const p = app.globe.pick(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
  return p ? { lon: p.lon, lat: p.lat } : null;
}
const close = (app: App) => (app.globe.viewer.camera.positionCartographic.height < 25_000);

/** What's within `r` metres of a point, by kind, as a little radar (north up). */
function radar(at: { lon: number; lat: number }, pois: Poi[], kinds: Find[], r = WALK, onPick?: (p: Poi) => void, size = 220): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg", c = size / 2, k = (c - 10) / r;
  const el = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number>) => { const e = document.createElementNS(ns, t); for (const [x, y] of Object.entries(a)) e.setAttribute(x, String(y)); return e; };
  const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, class: "sc-radar", role: "img", "aria-label": "What's within a walk" });
  for (const m of [200, 400, 600].filter((m) => m <= r)) svg.append(el("circle", { cx: c, cy: c, r: m * k, class: "sc-ring" }));
  svg.append(el("line", { x1: c, y1: 8, x2: c, y2: size - 8, class: "sc-axis" }), el("line", { x1: 8, y1: c, x2: size - 8, y2: c, class: "sc-axis" }));
  const n = el("text", { x: c, y: 9, class: "sc-n" }); n.textContent = "N"; svg.append(n);
  const colour = new Map(kinds.map((f) => [f.id, f.color]));
  const lat0 = Math.cos((at.lat * Math.PI) / 180);
  for (const p of pois) {
    const dx = (p.lon - at.lon) * 111_320 * lat0, dy = (p.lat - at.lat) * 110_540;
    if (Math.hypot(dx, dy) > r) continue;
    const dot = el("circle", { cx: c + dx * k, cy: c - dy * k, r: 3.4, fill: colour.get(p.kind) ?? "#fff", class: "sc-dot" });
    const t = el("title", {}); t.textContent = p.name; dot.append(t);
    if (onPick) dot.addEventListener("click", () => onPick(p));
    svg.append(dot);
  }
  svg.append(el("circle", { cx: c, cy: c, r: 4.5, class: "sc-you" }));
  return svg;
}

/** A score as a ring dial. */
function dial(score: number, color: string): HTMLElement {
  return h("div", { class: "sc-dial", style: `--p:${score};--c:${color}` }, h("strong", {}, String(score)));
}

const poiPoints = (pois: Poi[], kinds: Find[], labels = 40): WorkFeature[] => {
  const col = new Map(kinds.map((f) => [f.id, f.color]));
  return pois.slice(0, 600).map((p, i) => ({ id: p.id, kind: "point" as const, pts: [[p.lon, p.lat]], color: col.get(p.kind) ?? "#fff", label: i < labels ? p.name : undefined }));
};

const showPoi = (app: App, p: Poi, kinds: Find[]) => {
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: kinds.find((f) => f.id === p.kind)?.label.replace(/s$/, "") ?? "" });
  void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 250 });
};

/** The industry's signature places, each opening with its intro. */
function signature(ctx: WorkCtx, ind: Industry): HTMLElement {
  const places = introsTagged(...ind.tags);
  if (!places.length) return h("span", {});
  return h("div", {},
    title(`Signature ${ind.label.toLowerCase()} places`),
    h("div", { class: "sc-sig" }, ...places.slice(0, 24).map((p) => h("button", { class: "sc-sig-card", style: `--c:${ind.color}`, onclick: () => {
      ctx.app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.where });
      ctx.app.actions.get("intro:play")?.run();
    } }, h("strong", {}, p.name), h("small", {}, p.where)))));
}

// ---- Look round --------------------------------------------------------------------------------------

let look: { at: { lon: number; lat: number }; pois: Poi[]; for: string } | null = null;
let shown: Set<string> | null = null;

export function openExplore(ctx: WorkCtx, id: string) {
  const ind = industry(id);
  if (!ind) return;
  const { app } = ctx, kinds = ind.explore.finds;
  if (!shown || ![...shown].every((k) => kinds.some((f) => f.id === k))) shown = new Set(kinds.map((f) => f.id));
  const status = h("p", { class: "muted small" });
  const body = h("div", {});
  const render = () => {
    const l = look?.for === id ? look : null;
    if (!l) { body.replaceChildren(); return; }
    const vis = l.pois.filter((p) => shown!.has(p.kind));
    mapFor(app).draw(ind.explore.label, poiPoints(nearestFirst(vis, l.at), kinds));
    const near = nearestFirst(vis, l.at).slice(0, 30);
    const within = vis.filter((p) => metres(l.at, p) <= WALK).length;
    body.replaceChildren(
      h("div", { class: "sc-look" },
        radar(l.at, vis, kinds, WALK, (p) => showPoi(app, p, kinds)),
        h("div", { class: "sc-look-side" },
          h("p", { class: "sc-big" }, h("strong", {}, String(within)), ` ${ind.explore.label === "Eat & drink" ? "places to eat and drink" : "places"} within a 7-minute walk`),
          h("div", { class: "sc-chips" }, ...kinds.map((f) => {
            const n = l.pois.filter((p) => p.kind === f.id).length;
            return h("button", { class: "sc-chip" + (shown!.has(f.id) ? " on" : ""), style: `--c:${f.color}`, onclick: () => { if (shown!.has(f.id)) shown!.delete(f.id); else shown!.add(f.id); render(); } }, h("i", {}), `${f.emoji} ${f.label}`, h("small", {}, String(n)));
          })))),
      near.length ? h("div", { class: "list" }, ...near.map((p) => {
        const f = kinds.find((x) => x.id === p.kind)!;
        return h("button", { class: "list-row", onclick: () => showPoi(app, p, kinds) }, h("span", { class: "dot", style: `background:${f.color}` }), h("span", { class: "sc-row-main" }, h("strong", {}, p.name), h("small", {}, `${f.label.replace(/s$/, "")}${p.tags.cuisine ? ` · ${p.tags.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}` : ""}${p.tags.opening_hours ? ` · ${p.tags.opening_hours}` : ""}`)), h("span", { class: "muted small" }, `${Math.round(p.m)} m`));
      })) : empty("None of these in view."));
  };
  const lookHere = () => {
    const at = centre(app);
    if (!at) { status.textContent = "Point the map at a place first."; return; }
    if (!close(app)) { status.textContent = "Zoom in to a neighbourhood (a few km across) to look round."; return; }
    status.textContent = "Looking round…";
    const r = app.globe.viewer.camera.computeViewRectangle(), d = 180 / Math.PI;
    const box = r ? `${(r.south * d).toFixed(4)},${(r.west * d).toFixed(4)},${(r.north * d).toFixed(4)},${(r.east * d).toFixed(4)}` : null;
    void overpass(box ? query(kinds, { bbox: box }) : query(kinds, { ...at, m: 1500 }))
      .then((els) => { look = { at, pois: toPois(els, kinds), for: id }; status.textContent = ""; render(); })
      .catch(() => { status.textContent = "Couldn't reach OpenStreetMap just now. Try again in a moment."; });
  };
  ctx.show(ind.explore.label, ctx.home,
    h("p", { class: "sc-lede" }, ind.explore.who, "."),
    h("div", { class: "row-btns" }, h("button", { class: "primary-btn", onclick: lookHere }, "◎ Look round here"), h("button", { class: "pill-btn", onclick: () => openScout(ctx, id) }, `For pros: ${ind.scout.label} →`)),
    status, body,
    signature(ctx, ind));
  if (look?.for === id) render(); else if (close(app)) lookHere();
}

// ---- Scout -----------------------------------------------------------------------------------------

const cache = new Map<string, Poi[]>();
const LETTERS = "ABCD";

export function openScout(ctx: WorkCtx, id: string) {
  const ind = industry(id);
  if (!ind) return;
  const { app } = ctx, kinds = kindsOf(ind);
  const st = saved(id);
  st.as ??= ind.id === "realestate" ? undefined : ind.explore.finds[0].id;
  const body = h("div", {});
  const status = h("p", { class: "muted small" });
  const load = (c: Candidate) => {
    const k = `${id}:${c.lon.toFixed(4)},${c.lat.toFixed(4)}`;
    if (cache.has(k)) return Promise.resolve(cache.get(k)!);
    return overpass(query(kinds, { lon: c.lon, lat: c.lat, m: WALK + 50 })).then((els) => { const p = toPois(els, kinds); cache.set(k, p); return p; });
  };
  const render = async () => {
    if (!st.sites.length) {
      body.replaceChildren(empty(`Add up to four addresses you're weighing. Each gets what's within a 7-minute walk: what brings people, who else is there, and a score.`));
      mapFor(app).draw(ind.scout.label, []);
      return;
    }
    status.textContent = "Reading what's around each address…";
    const data = await Promise.all(st.sites.map((c) => load(c).catch(() => null)));
    status.textContent = data.some((d) => !d) ? "Couldn't reach OpenStreetMap for some addresses; try again in a moment." : "";
    const scored = st.sites.map((c, i) => ({ c, i, pois: data[i] ?? [], s: data[i] ? scoreSite(ind, c, data[i]!, st.as) : null }));
    const best = scored.filter((x) => x.s).sort((a, b) => b.s!.score - a.s!.score)[0];
    const feats: WorkFeature[] = [];
    for (const x of scored) {
      feats.push({ id: `ring${x.c.id}`, kind: "area", pts: ring(x.c.lon, x.c.lat, WALK / 1000, 64), color: x === best ? ind.color : "#ffffff", fill: x === best ? 0.12 : 0.05 });
      feats.push({ id: `c${x.c.id}`, kind: "point", pts: [[x.c.lon, x.c.lat]], color: x === best ? ind.color : "#ffffff", label: `${LETTERS[x.i]} · ${x.c.name}${x.s ? ` · ${x.s.score}` : ""}` });
    }
    const all = scored.flatMap((x) => x.pois.filter((p) => metres(x.c, p) <= WALK));
    mapFor(app).draw(ind.scout.label, [...poiPoints(all, kinds, 0), ...feats]);
    const kindName = (k: string) => kinds.find((f) => f.id === k);
    body.replaceChildren(
      best && scored.length > 1 ? lines(`${LETTERS[best.i]} · ${best.c.name} scores best for a ${ind.scout.noun} (${best.s!.score}).`) : "",
      h("div", { class: "sc-cands" }, ...scored.map((x) => h("div", { class: "sc-cand" + (x === best ? " best" : ""), style: `--c:${ind.color}` },
        h("div", { class: "sc-cand-head" },
          h("span", { class: "sc-letter" }, LETTERS[x.i]),
          h("button", { class: "link-btn sc-cand-name", onclick: () => void flyToPlace(app.globe, { name: x.c.name, lon: x.c.lon, lat: x.c.lat, radius: 700 }) }, x.c.name),
          h("button", { class: "icon-btn", title: "Remove", "aria-label": "Remove", onclick: () => { st.sites = st.sites.filter((y) => y.id !== x.c.id); keep(st); void render(); } }, "×")),
        x.s ? h("div", { class: "sc-cand-body" },
          dial(x.s.score, ind.color),
          radar(x.c, x.pois, kinds, WALK, (p) => showPoi(app, p, kinds), 132),
          h("div", { class: "sc-counts" }, ...Object.entries(x.s.counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => { const f = kindName(k); return f ? h("span", { style: `--c:${f.color}` }, h("i", {}), `${n} ${f.label.toLowerCase()}`) : ""; }))) : empty("Couldn't read this address."),
        x.s ? h("ul", { class: "sc-why" }, ...x.s.lines.map((t) => h("li", {}, t))) : ""))),
      h("div", { class: "row-btns" },
        h("button", { class: "pill-btn", onclick: () => frame(app, ind.scout.label, st.sites, 800) }, "Show all"),
        h("button", { class: "pill-btn", onclick: () => downloadCsv(`${ind.id}-sites.csv`, ["Site", "Lon", "Lat", "Score", "Rivals", "Nearest rival (m)", ...kinds.map((f) => f.label)], scored.map((x) => [x.c.name, x.c.lon.toFixed(5), x.c.lat.toFixed(5), x.s?.score, x.s?.rivals, x.s?.nearest !== null && x.s?.nearest !== undefined ? Math.round(x.s.nearest) : "", ...kinds.map((f) => x.s?.counts[f.id] ?? 0)])) }, "Download CSV")));
  };
  const add = (c: Omit<Candidate, "id" | "name"> & { name?: string }) => {
    if (st.sites.length >= 4) st.sites.shift();
    st.sites.push({ id: Math.random().toString(36).slice(2, 9), name: c.name ?? `Site ${LETTERS[st.sites.length]}`, lon: c.lon, lat: c.lat });
    keep(st); void render();
  };
  ctx.show(ind.scout.label, ctx.home,
    h("p", { class: "sc-lede" }, ind.scout.who, "."),
    ind.id === "realestate" ? "" : h("label", { class: "po-field" }, h("span", {}, `What you'd open`),
      h("select", { onchange: (e: Event) => { st.as = (e.target as HTMLSelectElement).value; keep(st); void render(); } }, ...ind.explore.finds.map((f) => h("option", { value: f.id, ...(f.id === st.as ? { selected: true } : {}) }, `${f.emoji} ${f.label.replace(/s$/, "")}`)))),
    h("div", { class: "row-btns" },
      h("button", { class: "primary-btn", onclick: () => { ctx.hide(); app.pickOnce("Tap the address on the map", (p) => { ctx.unhide(); add({ lon: p.lon, lat: p.lat }); }, () => ctx.unhide()); } }, "＋ Tap an address"),
      h("button", { class: "pill-btn", onclick: () => { const c = centre(app); if (c) add(c); } }, "＋ Middle of the map"),
      h("button", { class: "pill-btn", onclick: () => openExplore(ctx, id) }, `← ${ind.explore.label}`)),
    status, body,
    ind.sector ? h("p", { class: "muted small" }, "Serve these businesses? ", h("button", { class: "link-btn", onclick: () => void import("../pro/services/ui").then((mm) => mm.openServices(ctx, ind.sector)) }, "Field Network for this sector →")) : "");
  void render();
}

/** Clears the scout layer (when leaving Work). */
export const clearScout = () => map?.clear();
