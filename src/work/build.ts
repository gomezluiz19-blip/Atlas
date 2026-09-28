// Work › Build: model a construction project on the satellite map and follow
// it. Draw the footprint, set the use and storeys, and Atlas raises a 3D model
// that grows with the schedule (scrub the timeline to any date, or see today's
// actual progress), estimates floor area and cost, and flags the days the
// weather stops cranes and concrete. Worksite management (daily log with
// photos, issues pinned on the site, deliveries, daily report) is a Pro feature.
import { ArcType, Cartesian3, Color, CustomDataSource, LabelStyle, PolygonHierarchy, VerticalOrigin, Cartesian2 } from "cesium";
import type { App } from "../app";
import { elevation } from "../data/elevation";
import { siteWeather } from "../data/openmeteo";
import { stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import {
  PHASES, USES, addDays, daysBetween, defaultSchedule, massing, overall, plannedPct, status, weatherRisks,
  type BuildProject, type PhaseId, type Use,
} from "./buildModel";
import { drawOnMap } from "./draw";
import { areaM2, fmtArea, pathLength, type LonLat } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { ListStore, download, newId } from "./store";

const store = new ListStore<BuildProject>("atlas.work.build.v1");
let scene: CustomDataSource | null = null;
let marks: WorkLayer | null = null;

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const money = (v: number) => `$${v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v).toLocaleString()}`;
const centroid = (r: LonLat[]): LonLat => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Draws the building as it stands (actual) or as planned on a date. */
function drawModel(app: App, p: BuildProject, date: string | null) {
  if (!scene) {
    scene = new CustomDataSource("work-build");
    void app.globe.viewer.dataSources.add(scene);
    app.canvas.put({ id: "work:build3d", label: "Construction model", color: "#ff9f0a", scope: "world", pinned: true, show: (v) => { if (scene) scene.show = v; }, remove: () => scene?.entities.removeAll() }, true);
  }
  const ents = scene.entities;
  ents.removeAll();
  const pct = (id: PhaseId) => {
    const ph = p.phases.find((x) => x.id === id)!;
    return date ? plannedPct(ph, date) : ph.done;
  };
  const m = massing(p.floors, pct);
  const g = p.ground ?? 0;
  const hier = new PolygonHierarchy(p.ring.map(([x, y]) => Cartesian3.fromDegrees(x, y)));
  const box = (bottom: number, top: number, color: string, alpha: number) =>
    ents.add({ polygon: { hierarchy: hier, height: bottom, extrudedHeight: top, material: Color.fromCssColorString(color).withAlpha(alpha), outline: false } });
  if (m.siteWorks) ents.add({ polygon: { hierarchy: new PolygonHierarchy(grow(p.ring, 1.25).map(([x, y]) => Cartesian3.fromDegrees(x, y))), material: Color.fromCssColorString("#a2845e").withAlpha(0.45) } });
  if (m.slab > 0) box(g - 1.5, g + 0.4 * m.slab, "#9a9a92", 0.95);
  const useColor = USES[p.use].color;
  for (let i = 0; i < p.floors; i++) {
    const bottom = g + 0.4 + i * p.storey, top = bottom + p.storey;
    if (m.complete) box(bottom, top - 0.15, useColor, 0.97);
    else if (i < m.closed) box(bottom, top - 0.15, "#7fb2d9", 0.92);
    else if (i + 1 <= m.framed) box(bottom, top - 0.15, "#c9c7bf", 0.9);
    else if (i < m.framed) box(bottom, bottom + (m.framed - i) * p.storey, "#ff9f0a", 0.95);
    else box(bottom, top - 0.15, "#ffffff", 0.12);
  }
  const height = p.floors * p.storey;
  if (m.crane) {
    // A tower crane by the first corner, its jib swinging over the building.
    const [mx, my] = p.ring[0], [cx, cy] = centroid(p.ring);
    const top = g + height + 14;
    const yellow = Color.fromCssColorString("#ffcc00");
    const along = (k: number): LonLat => [mx + (cx - mx) * k, my + (cy - my) * k];
    ents.add({ polyline: { positions: [Cartesian3.fromDegrees(mx, my, g), Cartesian3.fromDegrees(mx, my, top + 4)], width: 6, material: yellow, arcType: ArcType.NONE } });
    const [jx, jy] = along(2.1), [bx, by] = along(-0.6);
    ents.add({ polyline: { positions: [Cartesian3.fromDegrees(bx, by, top), Cartesian3.fromDegrees(jx, jy, top)], width: 4, material: yellow, arcType: ArcType.NONE } });
    ents.add({ polyline: { positions: [Cartesian3.fromDegrees(jx, jy, top), Cartesian3.fromDegrees(mx, my, top + 4), Cartesian3.fromDegrees(bx, by, top)], width: 1.5, material: yellow.withAlpha(0.8), arcType: ArcType.NONE } });
  }
  const s = status(p.phases, today());
  const phase = date ? PHASES.find((x) => { const ph = p.phases.find((y) => y.id === x.id)!; return plannedPct(ph, date) < 100; }) : PHASES.find((x) => x.id === s.current);
  const [lx, ly] = centroid(p.ring);
  ents.add({
    position: Cartesian3.fromDegrees(lx, ly, g + height + 6),
    label: {
      text: `${p.name}\n${m.complete ? "Complete" : `${phase?.label ?? ""} · ${Math.round(overall(p.phases, (ph) => (date ? plannedPct(ph, date) : ph.done)))}%`}${date ? ` (plan, ${fmtDate(date)})` : ""}`,
      font: "700 13px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
      verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -6), disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** The ring scaled about its centre (for the site boundary around the building). */
function grow(ring: LonLat[], k: number): LonLat[] {
  const [cx, cy] = centroid(ring);
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

function drawMarks(app: App, p: BuildProject) {
  marks ??= new WorkLayer(app, "work:build", "Worksite", "#ff9f0a");
  marks.set([
    { id: "site", kind: "area", pts: grow(p.ring, 1.25), color: "#ff9f0a", dashed: true, fill: 0 },
    ...p.issues.map((i) => ({ id: i.id, kind: "point" as const, pts: [i.pt], color: i.open ? "#ff3b30" : "#30d158", label: i.open ? i.text.slice(0, 28) : undefined })),
  ], `Worksite · ${p.name}`);
}

/** Shrinks a photo to a small JPEG so it fits in browser storage. */
function smallPhoto(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---- Screens ----------------------------------------------------------------------------

export function openBuild(ctx: WorkCtx) {
  const { app } = ctx;
  const add = async () => {
    ctx.hide();
    const ring = await drawOnMap(app, "area", "#ff9f0a", "Zoom in and tap the corners of the building's footprint");
    ctx.unhide();
    if (!ring) return openBuild(ctx);
    let ground = 0;
    try { [ground] = await elevation.sample([centroid(ring)], 13); } catch { /* sea level */ }
    const gfa = areaM2(ring) * 4;
    const p: BuildProject = {
      id: newId(), name: `Project ${store.all().length + 1}`, use: "apartments", floors: 4, storey: USES.apartments.storey, ring, ground: Math.max(0, ground),
      costRate: USES.apartments.cost, created: Date.now(), phases: defaultSchedule(today(), 4, gfa), log: [], issues: [], deliveries: [],
    };
    store.save(p);
    openProject(ctx, p.id);
  };
  ctx.show("Build", ctx.home,
    h("p", { class: "mp-intro" }, "Model a building on the real site and follow its construction: a 3D model that grows with the schedule, planned against actual progress, floor area and cost, and the weather that stops work."),
    h("div", { class: "chips wrap" }, h("button", { class: "chip", onclick: () => void add() }, "+ New project (draw the footprint)")),
    store.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Projects"),
      h("div", { class: "list" }, ...store.all().map((p) => {
        const s = status(p.phases, today());
        return h("button", { class: "list-row", onclick: () => openProject(ctx, p.id) },
          h("span", { class: "dot big", style: `background:${USES[p.use].color}` }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name),
            h("span", { class: "list-sub" }, `${USES[p.use].label} · ${p.floors} floors · ${Math.round(s.actual)}% built${s.behindDays > 3 ? ` · ${s.behindDays} days behind` : ""}`)),
          h("span", { class: "chev", html: "&rsaquo;" }));
      }))) : h("p", { class: "muted small" }, "No projects yet."),
    h("div", { class: "pro-option" }, h("strong", {}, h("span", { class: "pro-badge" }, "PRO"), " Worksite management"),
      h("span", {}, "Daily logs with photos and crew counts, issues pinned on the site, deliveries, and a daily report to send. Open a project to try it.")),
  );
}

export function openProject(ctx: WorkCtx, id: string) {
  const p = store.get(id);
  if (!p) return openBuild(ctx);
  const { app } = ctx;
  const save = () => store.save(p);
  const again = () => openProject(ctx, id);
  const foot = areaM2(p.ring), gfa = foot * p.floors, height = p.floors * p.storey;
  const s = status(p.phases, today());
  drawModel(app, p, null);
  drawMarks(app, p);

  // Timeline: see the building as planned on any date.
  const first = p.phases[0].start, last = addDays(p.phases[p.phases.length - 1].end, 14);
  const span = Math.max(1, daysBetween(first, last));
  const tlLabel = h("strong", {}, "Today (actual)");
  const tl = h("input", { type: "range", min: 0, max: span, value: Math.min(span, Math.max(0, daysBetween(first, today()))), class: "borders-slider", "aria-label": "Timeline" }) as HTMLInputElement;
  tl.addEventListener("input", () => {
    const d = addDays(first, Number(tl.value));
    tlLabel.textContent = fmtDate(d) + " (plan)";
    drawModel(app, p, d);
  });
  let playing = 0;
  const playBtn = h("button", { class: "pill-btn", onclick: () => {
    if (playing) { clearInterval(playing); playing = 0; playBtn.textContent = "▶ Time-lapse"; return; }
    tl.value = "0";
    playBtn.textContent = "❚❚ Pause";
    playing = window.setInterval(() => {
      if (!tl.isConnected || Number(tl.value) >= span) { clearInterval(playing); playing = 0; playBtn.textContent = "▶ Time-lapse"; return; }
      tl.value = String(Math.min(span, Number(tl.value) + Math.max(1, span / 90)));
      tl.dispatchEvent(new Event("input"));
    }, 110);
  } }, "▶ Time-lapse");

  const gantt = h("div", { class: "gantt" }, ...PHASES.map((meta) => {
    const ph = p.phases.find((x) => x.id === meta.id)!;
    const left = (100 * daysBetween(first, ph.start)) / span, width = (100 * Math.max(1, daysBetween(ph.start, ph.end))) / span;
    const todayPos = (100 * daysBetween(first, today())) / span;
    const pctOut = h("span", { class: "gantt-pct" }, `${ph.done}%`);
    return h("div", { class: "gantt-row", style: `--c:${meta.color}` },
      h("div", { class: "gantt-head" },
        h("strong", { title: meta.about }, meta.label), pctOut,
        h("input", { type: "range", min: 0, max: 100, step: 5, value: ph.done, "aria-label": `${meta.label} % complete`, oninput: (e: Event) => { ph.done = Number((e.target as HTMLInputElement).value); pctOut.textContent = `${ph.done}%`; drawModel(app, p, null); }, onchange: () => { save(); again(); } })),
      h("div", { class: "gantt-track" },
        h("span", { class: "gantt-bar", style: `left:${left}%;width:${width}%` }, h("span", { class: "gantt-done", style: `width:${ph.done}%` })),
        todayPos >= 0 && todayPos <= 100 ? h("span", { class: "gantt-today", style: `left:${todayPos}%` }) : ""),
      h("div", { class: "gantt-dates" },
        h("input", { type: "date", value: ph.start, "aria-label": `${meta.label} start`, onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; if (v) { ph.start = v; if (ph.end < v) ph.end = v; save(); again(); } } }),
        h("span", {}, "→"),
        h("input", { type: "date", value: ph.end, "aria-label": `${meta.label} end`, onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; if (v && v >= ph.start) { ph.end = v; save(); again(); } } })));
  }));

  const weather = h("div", { class: "work-analysis" }, h("p", { class: "muted small" }, "Checking the site forecast…"));
  const [lon, lat] = centroid(p.ring);
  siteWeather(lon, lat).then((days) => {
    const risks = weatherRisks(days);
    weather.replaceChildren(
      h("div", { class: "site-days" }, ...risks.map((r) =>
        h("div", { class: "site-day" + (r.ok ? "" : " bad"), title: r.why.join(", ") || "Good working day" },
          h("span", {}, new Date(r.date + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short" })),
          h("strong", {}, r.ok ? "✓" : "!"),
          h("small", {}, r.crane ? "" : "crane", r.pour ? "" : r.crane ? "no pour" : " · no pour")))),
      h("p", { class: "muted small" }, `${risks.filter((r) => r.ok).length} of ${risks.length} days look workable. Cranes stand down in gusts over about 60 km/h; concrete needs dry weather above freezing. Always follow the crane's own limits.`));
  }).catch(() => weather.replaceChildren(h("p", { class: "muted small" }, "Couldn't load the site forecast.")));

  ctx.show("Project", () => openBuild(ctx),
    h("input", { class: "mp-name", value: p.name, "aria-label": "Project name", onchange: (e: Event) => { p.name = (e.target as HTMLInputElement).value || p.name; save(); drawModel(app, p, null); } }),
    h("div", { class: "build-fields" },
      h("label", { class: "mp-field" }, h("span", {}, "Use"),
        h("select", { onchange: (e: Event) => { p.use = (e.target as HTMLSelectElement).value as Use; p.storey = USES[p.use].storey; p.costRate = USES[p.use].cost; save(); again(); } },
          ...(Object.keys(USES) as Use[]).map((u) => h("option", { value: u, selected: u === p.use }, USES[u].label)))),
      h("label", { class: "mp-field" }, h("span", {}, "Floors"),
        h("input", { type: "number", min: 1, max: 120, value: p.floors, onchange: (e: Event) => { p.floors = Math.max(1, Math.min(120, parseInt((e.target as HTMLInputElement).value, 10) || 1)); save(); again(); } })),
      h("label", { class: "mp-field" }, h("span", {}, "Storey (m)"),
        h("input", { type: "number", min: 2.4, max: 12, step: 0.1, value: p.storey, onchange: (e: Event) => { p.storey = Math.max(2.4, Number((e.target as HTMLInputElement).value) || p.storey); save(); again(); } }))),
    stats(
      ["Footprint", fmtArea(foot)],
      ["Floor area", `${Math.round(gfa).toLocaleString()} m²`, "Footprint × floors (gross)"],
      ["Height", `${height.toFixed(0)} m`],
      ["Rough cost", `${money(gfa * p.costRate)} at $${p.costRate.toLocaleString()}/m²`, "A first estimate from typical rates; change the rate below"],
      ["Progress", `${Math.round(s.actual)}% built · plan says ${Math.round(s.planned)}%`],
      ["Finish", `${fmtDate(s.finish)}${s.behindDays > 0 ? ` (${s.behindDays} days behind)` : s.behindDays < 0 ? ` (${-s.behindDays} days ahead)` : ""}`],
    ),
    h("label", { class: "mp-field" }, h("span", {}, "Cost rate ($/m²)"),
      h("input", { type: "number", min: 100, step: 50, value: p.costRate, onchange: (e: Event) => { p.costRate = Number((e.target as HTMLInputElement).value) || p.costRate; save(); again(); } })),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Timeline"),
      h("div", { class: "build-tl" }, tlLabel, h("span", { class: "muted small" }, `${fmtDate(first)} → ${fmtDate(last)}`)), tl,
      h("div", { class: "pro-actions" }, playBtn, h("button", { class: "pill-btn", onclick: () => { tlLabel.textContent = "Today (actual)"; tl.value = String(Math.min(span, Math.max(0, daysBetween(first, today())))); drawModel(app, p, null); } }, "Today")),
      h("p", { class: "muted small" }, "Grey floors are framed, blue are closed in, orange is the floor going up; the white outline is what's still to come.")),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Schedule and progress"),
      h("p", { class: "muted small" }, "Drag each phase's slider to record progress; change dates to re-plan."),
      gantt,
      h("button", { class: "link-btn", onclick: () => { if (confirm("Replace the dates with a typical schedule starting today?")) { p.phases = defaultSchedule(today(), p.floors, gfa).map((x) => ({ ...x, done: p.phases.find((y) => y.id === x.id)?.done ?? 0 })); save(); again(); } } }, "Re-plan from today")),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Site weather, next 10 days"), weather),
    worksite(ctx, p, again),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => void flyToPlace(app.globe, { name: p.name, lon, lat, radius: Math.max(60, pathLength(p.ring) / 2, height * 1.2) }) }, "Show on map"),
      h("button", { class: "link-btn", onclick: () => download(`${p.name}.atlas-build.json`, JSON.stringify(p)) }, "Save as a file"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${p.name}"?`)) { store.remove(p.id); scene?.entities.removeAll(); marks?.clear(); openBuild(ctx); } } }, "Delete project")),
  );
}

/** Pro: the daily running of the site. */
function worksite(ctx: WorkCtx, p: BuildProject, again: () => void): HTMLElement {
  const { app } = ctx;
  const save = () => store.save(p);
  const text = h("input", { class: "pro-url", placeholder: "What happened on site today?" }) as HTMLInputElement;
  const crew = h("input", { type: "number", min: 0, class: "build-crew", placeholder: "Crew", "aria-label": "Crew on site" }) as HTMLInputElement;
  const photo = h("input", { type: "file", accept: "image/*", capture: "environment", "aria-label": "Photo" }) as HTMLInputElement;
  const addLog = async () => {
    if (!text.value.trim() && !photo.files?.length) return;
    let pic: string | undefined;
    try { if (photo.files?.[0]) pic = await smallPhoto(photo.files[0]); } catch { app.toast("Couldn't read that photo.", 4000); }
    p.log.unshift({ date: today(), text: text.value.trim(), photo: pic, crew: crew.value ? Number(crew.value) : undefined });
    save();
    again();
  };
  const addIssue = async () => {
    ctx.hide();
    const pts = await drawOnMap(app, "point", "#ff3b30", "Tap where the issue is");
    ctx.unhide();
    if (!pts) return again();
    const what = prompt("Describe the issue", "") ?? "";
    p.issues.unshift({ id: newId(), pt: pts[0], text: what || "Issue", open: true, date: today() });
    save();
    again();
  };
  const delivery = h("input", { class: "pro-url", placeholder: "Delivery (e.g. 40 m³ concrete, rebar)" }) as HTMLInputElement;
  const delDate = h("input", { type: "date", value: today(), class: "work-date" }) as HTMLInputElement;
  const report = () => {
    const s = status(p.phases, today());
    const todayLog = p.log.filter((l) => l.date === today());
    download(`${p.name} daily report ${today()}.html`, `<!doctype html><meta charset="utf-8"><title>${esc(p.name)} – ${today()}</title>
<style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1d1d1f}h1{margin-bottom:0}.m{color:#6e6e73}img{max-width:100%;border-radius:10px}li{margin:4px 0}.open{color:#c9302c}</style>
<h1>${esc(p.name)}</h1><p class="m">Daily report · ${fmtDate(today())} · ${USES[p.use].label}, ${p.floors} floors</p>
<p><b>${Math.round(s.actual)}%</b> complete (plan ${Math.round(s.planned)}%). Current phase: ${esc(PHASES.find((x) => x.id === s.current)?.label ?? "complete")}. Forecast finish ${fmtDate(s.finish)}${s.behindDays > 0 ? `, ${s.behindDays} days behind` : ""}.</p>
<h2>Today</h2>${todayLog.length ? todayLog.map((l) => `<p>${l.crew !== undefined ? `<b>Crew ${l.crew}.</b> ` : ""}${esc(l.text)}</p>${l.photo ? `<img src="${l.photo}">` : ""}`).join("") : "<p class=m>No log entries.</p>"}
<h2>Open issues</h2><ul>${p.issues.filter((i) => i.open).map((i) => `<li class="open">${esc(i.text)} <span class=m>(${i.date}, ${i.pt[1].toFixed(5)}, ${i.pt[0].toFixed(5)})</span></li>`).join("") || "<li class=m>None</li>"}</ul>
<h2>Deliveries</h2><ul>${p.deliveries.filter((d) => d.date >= today()).map((d) => `<li>${d.date}: ${esc(d.text)}</li>`).join("") || "<li class=m>None scheduled</li>"}</ul>
<p class="m">Made with Atlas.</p>`, "text/html");
  };
  return h("section", { class: "group build-pro" },
    h("h2", { class: "group-title" }, h("span", { class: "pro-badge" }, "PRO"), " Worksite"),
    h("p", { class: "muted small" }, "Run the site day to day. (A Pro feature, open to try.)"),
    h("div", { class: "build-log-form" }, text, crew, photo, h("button", { class: "primary-btn", onclick: () => void addLog() }, "Add to log")),
    p.log.length ? h("div", { class: "build-log" }, ...p.log.slice(0, 12).map((l, k) =>
      h("div", { class: "build-log-row" },
        l.photo ? h("img", { src: l.photo, alt: "" }) : "",
        h("div", {}, h("span", { class: "muted small" }, `${fmtDate(l.date)}${l.crew !== undefined ? ` · crew ${l.crew}` : ""}`), h("p", {}, l.text)),
        h("button", { class: "icon-btn", "aria-label": "Remove entry", onclick: () => { p.log.splice(k, 1); save(); again(); } }, "✕")))) : "",
    h("h3", { class: "build-sub" }, `Issues · ${p.issues.filter((i) => i.open).length} open`),
    h("button", { class: "chip", onclick: () => void addIssue() }, "+ Pin an issue on the site"),
    ...p.issues.map((i) => h("label", { class: "work-check" + (i.open ? "" : " done") },
      h("input", { type: "checkbox", checked: !i.open, onchange: () => { i.open = !i.open; save(); again(); } }),
      h("span", {}, i.text), h("span", { class: "muted small" }, i.date))),
    h("h3", { class: "build-sub" }, "Deliveries"),
    h("div", { class: "build-log-form" }, delDate, delivery, h("button", { class: "pill-btn", onclick: () => { if (delivery.value.trim()) { p.deliveries.push({ date: delDate.value || today(), text: delivery.value.trim() }); p.deliveries.sort((a, b) => a.date.localeCompare(b.date)); save(); again(); } } }, "Add")),
    ...p.deliveries.filter((d) => d.date >= addDays(today(), -1)).map((d) => h("div", { class: "work-check" }, h("span", { class: "muted small" }, fmtDate(d.date)), h("span", {}, d.text))),
    h("div", { class: "pro-actions" }, h("button", { class: "pill-btn", onclick: report }, "Download today's report")),
  );
}
