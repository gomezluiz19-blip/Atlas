// Getting around: from any place, how far you get on foot, by bike and by
// car. On the map, the ground each mode reaches in so many minutes, nested; on
// the panel a reach rose (how far each mode gets in every direction, overlaid
// like petals), the ground each covers, a race to your places in three lanes
// with the sensible winner crowned, and the 15-minute check: which of daily
// life's needs are within a quarter-hour walk.
import { Cartesian2 } from "cesium";
import type { App } from "../app";
import { getJson } from "../data/http";
import { overpass } from "../data/overpass";
import { title } from "../pro/kit/ui";
import { h } from "../ui/dom";
import { flyToPlace, geocode } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import { WorkLayer, type WorkFeature } from "../work/layer";
import {
  areaKm2, bestMode, compareLine, countNeeds, dirWord, estimateMinutes, estimateRings, fmtMin, isochroneUrl, matrixUrl, NEEDS, needsQuery, needsScore,
  parseIsochrone, parseMatrix, REACH_IDS, REACH_MODES, reachRose, type IsoResponse, type MatrixResponse, type ReachMode, type Ring,
} from "./reach";

const NS = "http://www.w3.org/2000/svg";
const svgEl = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number> = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };

export interface Spot { name: string; lon: number; lat: number }
type Choice = ReachMode | "all";

let layer: WorkLayer | null = null;
const cache = new Map<string, Promise<Ring[]>>();

/** The router's shapes, else estimated circles. */
function rings(c: Spot, mode: ReachMode, minutes: number[]): Promise<Ring[]> {
  const key = `${c.lon.toFixed(4)},${c.lat.toFixed(4)},${mode},${minutes.join("-")}`;
  if (!cache.has(key)) cache.set(key, getJson<IsoResponse>("Valhalla", isochroneUrl(c, mode, minutes), undefined, 20_000)
    .then((r) => { const out = parseIsochrone(r); if (!out.length) throw new Error("empty"); return out; })
    .catch(() => { cache.delete(key); return estimateRings(c, mode, minutes); }));
  return cache.get(key)!;
}

/** Each mode's reach in every direction, overlaid like petals, with distance rings. */
function rose(petals: { mode: ReachMode; km: number[] }[], size = 260): SVGSVGElement {
  const c = size / 2, R = c - 18, far = Math.max(0.5, ...petals.flatMap((p) => p.km));
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((x) => x >= far / 2) ?? far / 2;
  const k = R / far;
  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "reach-rose", role: "img", "aria-label": "How far each way of travelling gets in every direction" });
  for (const d of [nice, nice * 2].filter((x) => x <= far * 1.05)) {
    svg.append(svgEl("circle", { cx: c, cy: c, r: d * k, class: "rr-ring" }));
    const t = svgEl("text", { x: c + d * k * 0.71 + 3, y: c - d * k * 0.71 - 2, class: "rr-label" }); t.textContent = `${d} km`; svg.append(t);
  }
  for (const a of [0, 90, 180, 270]) {
    const r = (a * Math.PI) / 180;
    svg.append(svgEl("line", { x1: c, y1: c, x2: c + Math.sin(r) * R, y2: c - Math.cos(r) * R, class: "rr-axis" }));
  }
  // Widest first, so the narrower petals sit on top.
  [...petals].sort((a, b) => Math.max(...b.km) - Math.max(...a.km)).forEach((p, i) => {
    const n = p.km.length;
    const d = p.km.map((km, j) => { const a = (j / n) * Math.PI * 2; return `${j ? "L" : "M"}${(c + Math.sin(a) * km * k).toFixed(1)},${(c - Math.cos(a) * km * k).toFixed(1)}`; }).join("") + "Z";
    const path = svgEl("path", { d, class: "rr-petal", fill: REACH_MODES[p.mode].color, stroke: REACH_MODES[p.mode].color, style: `animation-delay:${i * 120}ms` });
    svg.append(path);
  });
  svg.append(svgEl("circle", { cx: c, cy: c, r: 4.5, class: "rr-origin" }));
  const n = svgEl("text", { x: c, y: 11, class: "rr-n" }); n.textContent = "N"; svg.append(n);
  return svg;
}

/** Three lanes to one place: a bar per mode, the sensible winner crowned. */
function raceRow(name: string, t: Partial<Record<ReachMode, number | null>>, scale: number, onPick: () => void, estimated: boolean): HTMLElement {
  const win = bestMode(t);
  return h("button", { class: "race-row", onclick: onPick },
    h("div", { class: "race-head" }, h("strong", {}, name), win ? h("span", { class: "race-win", style: `--c:${REACH_MODES[win].color}` }, `${REACH_MODES[win].emoji} ${REACH_MODES[win].label.toLowerCase()} it · ${fmtMin(t[win])}`) : ""),
    ...REACH_IDS.map((m) => {
      const v = t[m];
      return h("div", { class: "race-lane" + (m === win ? " win" : "") },
        h("span", { class: "race-emoji" }, REACH_MODES[m].emoji),
        h("span", { class: "race-track" }, h("i", { style: `width:${typeof v === "number" ? Math.max(3, Math.min(100, (v / scale) * 100)) : 0}%;background:${REACH_MODES[m].color}` })),
        h("span", { class: "race-time" }, fmtMin(v)));
    }),
    estimated ? h("small", { class: "muted" }, "Estimated from distance") : "");
}

export function openReach(ctx: WorkCtx, app: App, start?: Spot) {
  layer ??= new WorkLayer(app, "reach", "Getting around", "#5b9467");
  let origin: Spot | null = start ?? (app.place ? { name: app.place.name?.title ?? "this spot", lon: app.place.lon, lat: app.place.lat } : null);
  let choice: Choice = "all", minutes = 15, run = 0;
  const extra: Spot[] = [];
  const status = h("p", { class: "muted small" });
  const body = h("div", {});

  const mine = (): Spot[] => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as Spot[]).slice(0, 12); } catch { return []; } };
  const centre = (): Spot | null => { const cv = app.globe.viewer.canvas, p = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2)); return p ? { name: "the middle of the map", lon: p.lon, lat: p.lat } : null; };

  const modeSeg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "How you travel" },
    ...(["all", ...REACH_IDS] as Choice[]).map((m) => h("button", { role: "radio", "aria-checked": String(m === choice), onclick: (e: Event) => { choice = m; modeSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget))); void draw(); } },
      m === "all" ? "All three" : `${REACH_MODES[m].emoji} ${REACH_MODES[m].label}`)));
  const timeSeg = h("div", { class: "chips" }, ...[10, 15, 20, 30, 45, 60].map((t) => h("button", { class: "chip" + (t === minutes ? " on" : ""), onclick: (e: Event) => { minutes = t; timeSeg.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); void draw(); } }, `${t} min`)));

  async function draw() {
    if (!origin) { status.textContent = "Choose where to start from."; body.replaceChildren(); return; }
    const me = ++run, o = origin;
    status.textContent = `Working out how far you get from ${o.name}…`;
    const modes = choice === "all" ? REACH_IDS : [choice];
    // One mode: three nested times; all three: one shape each at the chosen time.
    const times = choice === "all" ? [minutes] : [Math.round(minutes / 3), Math.round((minutes * 2) / 3), minutes].filter((t, i, a) => t > 0 && a.indexOf(t) === i);
    const got = await Promise.all(modes.map((m) => rings(o, m, times).then((r) => ({ mode: m, rings: r }))));
    if (me !== run) return;
    const estimated = got.some((g) => g.rings.some((r) => r.estimated));
    // The map: the shapes, largest underneath; the start as a point.
    const feats: WorkFeature[] = got.flatMap((g) => [...g.rings].reverse().map((r, i): WorkFeature => ({ id: `${g.mode}${r.minutes}`, kind: "area", pts: r.ring, color: REACH_MODES[g.mode].color, fill: choice === "all" ? (g.mode === "drive" ? 0.1 : 0.18) : 0.08 + i * 0.07, dashed: r.estimated })));
    layer!.set([...feats, { id: "o", kind: "point", pts: [[o.lon, o.lat]], color: "#ffffff", label: o.name }], `Getting around ${o.name}`);
    const outer = got.map((g) => ({ mode: g.mode, ring: g.rings[g.rings.length - 1] })).filter((x) => x.ring);
    const farKm = Math.max(0.5, ...outer.map((x) => Math.max(...reachRose(x.ring.ring, o, 24))));
    void flyToPlace(app.globe, { name: o.name, lon: o.lon, lat: o.lat, radius: farKm * 1600 });
    const petals = outer.map((x) => ({ mode: x.mode, km: reachRose(x.ring.ring, o, 48) }));
    const areas = Object.fromEntries(outer.map((x) => [x.mode, areaKm2(x.ring.ring)])) as Partial<Record<ReachMode, number>>;
    status.textContent = estimated ? "The router didn't answer, so these are estimates from typical speeds (dashed on the map)." : "";
    const maxA = Math.max(...Object.values(areas).map((v) => v ?? 0), 0.01);
    body.replaceChildren(
      h("div", { class: "reach-top" }, rose(petals),
        h("div", { class: "reach-side" },
          ...outer.map((x) => {
            const km = petals.find((p) => p.mode === x.mode)!.km, i = km.indexOf(Math.max(...km));
            return h("div", { class: "reach-stat", style: `--c:${REACH_MODES[x.mode].color}` },
              h("span", { class: "reach-k" }, `${REACH_MODES[x.mode].emoji} ${REACH_MODES[x.mode].label}`),
              h("strong", {}, `${areas[x.mode]! < 10 ? areas[x.mode]!.toFixed(1) : Math.round(areas[x.mode]!).toLocaleString()} km²`),
              h("span", { class: "reach-bar" }, h("i", { style: `width:${Math.max(2, (areas[x.mode]! / maxA) * 100)}%` })),
              h("small", { class: "muted" }, `farthest ${km[i] < 10 ? km[i].toFixed(1) : Math.round(km[i])} km, to the ${dirWord(i, km.length)}`));
          }))),
      choice === "all" ? h("p", { class: "reach-lede" }, compareLine(areas, minutes)) : h("p", { class: "reach-lede" }, `${REACH_MODES[choice].emoji} The rings are ${times.join(", ")} minutes out.`),
      raceBlock(o),
      fifteenBlock(o));
  }

  /** Your places (and any you add), each a three-lane race. */
  function raceBlock(o: Spot): HTMLElement {
    const box = h("div", {});
    const targets = [...mine(), ...extra].filter((p) => Math.abs(p.lon - o.lon) + Math.abs(p.lat - o.lat) > 1e-4).slice(0, 25);
    const add = h("input", { class: "pro-url", placeholder: "Add a place: the office, a school, a friend's…", "aria-label": "Add a place to the race" }) as HTMLInputElement;
    const addRow = h("div", { class: "build-log-form" }, add, h("button", { class: "pill-btn", onclick: () => void addPlace() }, "Add"));
    async function addPlace() {
      const q = add.value.trim();
      if (!q) return;
      const r = (await geocode(q, o).catch(() => []))[0];
      if (!r) { app.toast("Couldn't find that place.", 3000); return; }
      extra.push({ name: r.name, lon: r.lon, lat: r.lat });
      add.value = "";
      box.replaceWith(raceBlock(o));
    }
    add.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void addPlace(); });
    if (!targets.length) { box.append(title("The race"), h("p", { class: "muted small" }, "Add the places you go (or save them in My Place) to see walking, biking and driving race there."), addRow); return box; }
    const list = h("div", { class: "race-list" }, h("p", { class: "muted small" }, "Timing the routes…"));
    box.append(title("The race to your places"), list, addRow);
    void Promise.all(REACH_IDS.map((m) => getJson<MatrixResponse>("Valhalla", matrixUrl(o, targets, m), undefined, 20_000).then((r) => parseMatrix(r, targets.length)).catch(() => null)))
      .then((res) => {
        const estimated = res.some((r) => !r);
        const t = targets.map((p, i) => Object.fromEntries(REACH_IDS.map((m, j) => [m, res[j] ? res[j]![i] : estimateMinutes(o, p, m)])) as Record<ReachMode, number | null>);
        const order = targets.map((_, i) => i).sort((a, b) => (t[a].drive ?? 1e9) - (t[b].drive ?? 1e9));
        list.replaceChildren(...order.map((i) => {
          const scale = Math.max(...REACH_IDS.map((m) => t[i][m] ?? 0), 1);
          return raceRow(targets[i].name, t[i], scale, () => { void flyToPlace(app.globe, { name: targets[i].name, lon: targets[i].lon, lat: targets[i].lat, radius: 800 }); }, estimated);
        }));
        const wins = order.map((i) => bestMode(t[i])).filter(Boolean) as ReachMode[];
        const n = (m: ReachMode) => wins.filter((w) => w === m).length;
        if (wins.length > 1) list.prepend(h("p", { class: "reach-lede" }, `Of ${wins.length} places, ${n("walk")} are best on foot, ${n("bike")} by bike and ${n("drive")} by car.`));
      });
    return box;
  }

  /** Which of daily life's needs are within a 15-minute walk. */
  function fifteenBlock(o: Spot): HTMLElement {
    const box = h("div", {}, title("The 15-minute check"), h("p", { class: "muted small" }, "Looking for shops, schools, doctors and parks within a 15-minute walk…"));
    void rings(o, "walk", [15]).then(async (r) => {
      const els = await overpass(needsQuery(r[0].ring));
      const counts = countNeeds(els), s = needsScore(counts);
      box.replaceChildren(title("The 15-minute check"),
        h("div", { class: "fifteen-head" }, h("div", { class: "fifteen-dial", style: `--p:${s.met / s.of}` }, h("strong", {}, `${s.met}/${s.of}`)), h("div", {}, h("strong", {}, s.word), h("p", { class: "muted small" }, `What's within a 15-minute walk of ${o.name}${r[0].estimated ? " (walk estimated)" : ""}.`))),
        h("div", { class: "fifteen-grid" }, ...NEEDS.map((n) => h("div", { class: "fifteen-tile" + (counts[n.id] ? " on" : "") }, h("span", { class: "ft-emoji" }, n.emoji), h("span", {}, n.label), h("strong", {}, counts[n.id] ? String(counts[n.id]) : "none")))),
        h("p", { class: "fineprint" }, "From OpenStreetMap: only what volunteers have mapped."));
    }).catch(() => box.replaceChildren(title("The 15-minute check"), h("p", { class: "muted small" }, "Couldn't reach OpenStreetMap just now.")));
    return box;
  }

  const set = (s: Spot) => { origin = s; fromLabel.textContent = `From ${s.name}`; void draw(); };
  const fromLabel = h("strong", { class: "reach-from" }, origin ? `From ${origin.name}` : "From…");
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => set({ name: "where you are", lon: p.coords.longitude, lat: p.coords.latitude }), () => app.toast("Couldn't find where you are.", 3000), { timeout: 10_000 });
  ctx.show("Getting around", ctx.home,
    h("p", { class: "sc-lede" }, "Walk, bike or drive: how far you get, and which way wins to the places you go."),
    fromLabel,
    h("div", { class: "row-btns" },
      app.place ? h("button", { class: "chip", onclick: () => set({ name: app.place!.name?.title ?? "this spot", lon: app.place!.lon, lat: app.place!.lat }) }, "◎ The chosen place") : "",
      h("button", { class: "chip", onclick: () => { const c = centre(); if (c) set(c); } }, "Middle of the map"),
      h("button", { class: "chip", onclick: () => { ctx.hide(); app.pickOnce("Tap where to start", (p) => { ctx.unhide(); set({ name: "the spot you tapped", lon: p.lon, lat: p.lat }); }, () => ctx.unhide()); } }, "Tap a spot"),
      "geolocation" in navigator ? h("button", { class: "chip", onclick: locate }, "Where I am") : "",
      ...mine().slice(0, 4).map((p) => h("button", { class: "chip", onclick: () => set(p) }, `⌂ ${p.name}`))),
    modeSeg, timeSeg, status, body,
    h("p", { class: "fineprint" }, "Routes by Valhalla over OpenStreetMap (© OpenStreetMap contributors). Typical speeds, without today's traffic."));
  void draw();
}

export const clearReach = () => layer?.set([]);
