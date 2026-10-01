// Build Pro on the map: a builder's or contractor's sites. The portfolio
// first (what's late, over budget, weather-blocked or due), then each
// project: its schedule with the critical path, the weather against the plan
// (which days each kind of work can go ahead, and what past years say about
// the months ahead), the money (earned value), and the site (people on it,
// deliveries and where they come from, neighbours in earshot, permits,
// inspections and questions to the designer).
import { openSpace } from "../../delight/spaces";
import type { App } from "../../app";
import { climateDays, siteWeather } from "../../data/openmeteo";
import { elementPoint, overpass } from "../../data/overpass";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { fmt, ring } from "../kit/ops";
import { arcFlow, empty, field, frame, input, kpis, lines, list, OpsMap, row, select, title } from "../kit/ui";
import { downloadCsv, printReport } from "../kit/report";
import { usd, usdShort } from "../mining/model";
import { MONTHS } from "../services/conditions";
import { demoFirm } from "./demo";
import {
  addDays, daysBetween, deliveryClashes, earnedValue, forecastFinish, haulHours, headcount, kmBetween, isoDay, lostDaysByMonth, noiseAt, projectFlags, schedule, WEATHER, weatherClashes, windows, workable,
  type Day, type Firm, type Project, type Receptor, type Task, type Weather,
} from "./model";

const store = new ListStore<Firm>("atlas.pro.build.v1");
const current = () => store.all()[0];
const save = (f: Firm) => store.save(f);
let map: OpsMap | null = null;
type Tab = "schedule" | "weather" | "money" | "site";
let tab: Tab = "schedule";
const today = () => isoDay(Date.now());

// ---- What loads in the background ------------------------------------------------------------------

const forecasts = new Map<string, Day[]>();
const history = new Map<string, Awaited<ReturnType<typeof climateDays>>>();
const receptors = new Map<string, Receptor[]>();
let refresh = () => {};
function loadWeather(f: Firm) {
  for (const p of f.projects) if (!forecasts.has(p.id)) {
    forecasts.set(p.id, []);
    void siteWeather(p.lon, p.lat).then((d) => { forecasts.set(p.id, d); refresh(); }).catch(() => forecasts.delete(p.id));
  }
}
const fc = (p: Project) => forecasts.get(p.id) ?? [];

async function loadNeighbours(p: Project) {
  if (receptors.has(p.id)) return;
  receptors.set(p.id, []);
  const q = `[out:json][timeout:20];(nwr(around:300,${p.lat},${p.lon})[amenity~"^(school|kindergarten|hospital|clinic|nursing_home|place_of_worship)$"];nwr(around:300,${p.lat},${p.lon})[building~"^(residential|apartments|house|detached|terrace)$"];);out center tags;`;
  try {
    const els = await overpass(q);
    const out: Receptor[] = [];
    for (const e of els) {
      const pt = elementPoint(e);
      if (!pt) continue;
      const a = e.tags?.amenity ?? "", kind: Receptor["kind"] = /school|kinder/.test(a) ? "school" : /hospital|clinic/.test(a) ? "hospital" : a === "nursing_home" ? "care" : a === "place_of_worship" ? "worship" : "homes";
      const m = Math.round(kmBetween(p, { lon: pt[0], lat: pt[1] }) * 1000);
      out.push({ name: e.tags?.name ?? (kind === "homes" ? "Homes" : kind), kind, lon: pt[0], lat: pt[1], m });
    }
    receptors.set(p.id, out.sort((a, b) => a.m - b.m));
  } catch { receptors.delete(p.id); }
  refresh();
}

// ---- The map ---------------------------------------------------------------------------------------

function worst(p: Project) { return projectFlags(p, today(), fc(p))[0]?.level ?? 0; }
const statusColor = (lvl: number) => (lvl >= 3 ? "#ff453a" : lvl === 2 ? "#ff9f0a" : "#30d158");

function draw(app: App, f: Firm, focus?: Project) {
  map ??= new OpsMap(app, "pro:build", "#ff9f0a");
  const fs: WorkFeature[] = [], flows = [];
  const t = today();
  for (const p of focus ? [focus] : f.projects) {
    fs.push({ id: p.id, kind: "point", pts: [[p.lon, p.lat]], color: statusColor(worst(p)), label: `🏗 ${p.name}` });
    for (const d of p.deliveries.filter((x) => x.status !== "delivered" && x.lon !== undefined && daysBetween(t, x.date) <= 7 && daysBetween(t, x.date) >= 0)) {
      const a = arcFlow(d.id, { lon: d.lon!, lat: d.lat! }, p, "#ff9f0a", Math.min(1, d.trucks / 10));
      fs.push(a.line); flows.push(a.flow);
      if (focus) fs.push({ id: `s${d.id}`, kind: "point", pts: [[d.lon!, d.lat!]], color: "#bf5af2", label: `🚚 ${d.supplier}` });
    }
    if (focus && tab === "site") {
      fs.push({ id: `r${p.id}`, kind: "area", pts: ring(p.lon, p.lat, 0.3), color: "#ff9f0a", fill: 0.06 });
      for (const r of (receptors.get(p.id) ?? []).filter((x) => x.kind !== "homes")) fs.push({ id: `n${r.name}${r.lon}`, kind: "point", pts: [[r.lon, r.lat]], color: "#ff375f", label: `${r.kind === "school" ? "🏫" : r.kind === "hospital" ? "🏥" : r.kind === "care" ? "🧓" : "⛪"} ${r.name} · ${noiseAt(r.m)} dB` });
    }
  }
  map.draw(focus ? focus.name : f.name, fs, flows);
}

// ---- Portfolio ---------------------------------------------------------------------------------------

export function openBuildPro(ctx: WorkCtx) {
  const f = current();
  if (!f) return start(ctx);
  loadWeather(f);
  refresh = () => { const g = current(); if (g && !openProjectId) { draw(ctx.app, g); home(ctx, g); } else if (g && openProjectId) { const p = g.projects.find((x) => x.id === openProjectId); if (p) projectScreen(ctx, g, p, false); } };
  openProjectId = null;
  draw(ctx.app, f);
  home(ctx, f);
}
let openProjectId: string | null = null;

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your company's name" }) as HTMLInputElement;
  ctx.show("Build Pro", ctx.home,
    h("p", {}, "For builders and contractors running sites: every project's schedule with its critical path, the weather against the plan (pours, crane lifts, roofing, finishes, earthworks), the money as earned value, deliveries and where they come from, the neighbours in earshot, permits, inspections and open questions, and a report for the client."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save({ id: newId(), name: name.value.trim() || "My company", created: Date.now(), projects: [] }); openBuildPro(ctx); } }, "Start"),
    h("button", { class: "pill-btn", onclick: () => { const f = demoFirm(); save(f); openBuildPro(ctx); frame(ctx.app, f.name, f.projects, 8000); } }, "Or try a demo: a contractor with four sites around Austin"));
}

function home(ctx: WorkCtx, f: Firm) {
  const t = today();
  const all = f.projects.map((p) => ({ p, flags: projectFlags(p, t, fc(p)), ev: earnedValue(p, t), ff: forecastFinish(p, t) }));
  const clashes = f.projects.reduce((n, p) => n + weatherClashes(p, fc(p), t).length, 0);
  const soon = f.projects.flatMap((p) => p.deliveries.filter((d) => d.status !== "delivered" && daysBetween(t, d.date) >= 0 && daysBetween(t, d.date) <= 1));
  ctx.show("Build Pro", ctx.home,
    h("input", { class: "mp-name", value: f.name, "aria-label": "Company name", onchange: (e: Event) => { f.name = (e.target as HTMLInputElement).value || f.name; save(f); } }),
    kpis([usdShort(f.projects.reduce((s, p) => s + p.value, 0)), `on ${f.projects.length} sites`], [String(all.filter((x) => x.ff.late > 0).length), "finishing late", all.some((x) => x.ff.late > 0)], [String(clashes), "weather clashes, 10 days", clashes > 0], [String(soon.length), "deliveries today and tomorrow"]),
    h("div", { class: "row" }, h("button", { class: "pill-btn", onclick: () => void addProject(ctx, f) }, "+ Project"), h("button", { class: "pill-btn", onclick: () => exportAll(f) }, "Export (CSV)")),
    title("Sites"),
    f.projects.length ? list(...all.sort((a, b) => (b.flags[0]?.level ?? 0) - (a.flags[0]?.level ?? 0)).map(({ p, flags, ev, ff }) =>
      row({ color: statusColor(flags[0]?.level ?? 0) }, p.name, `${Math.round(ev.done * 100)}% done (${Math.round(ev.planned * 100)}% planned) · finish ${ff.finish}${ff.late > 0 ? ` (${ff.late} d late)` : ""} · CPI ${ev.cpi.toFixed(2)}${flags[0] ? ` · ${flags[0].text}` : ""}`, () => { openProjectId = p.id; tab = "schedule"; projectScreen(ctx, f, p); }))) : empty("No projects yet. Add one by its address."),
    h("div", { class: "mp-foot" }, h("span", {}, f.demo ? "A demo company: its projects, suppliers, money and people are made up; the places are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${f.name}?`)) { store.remove(f.id); map?.clear(); openBuildPro(ctx); } } }, "Remove")),
    note("Schedules use the critical path method on working days (weekends off). Weather rules: pours need under 2 mm of rain and 5–32 °C; crane lifts stop at gusts of 60 km/h or wind of 40 km/h; roofing needs under 1 mm and gusts under 50 km/h; exterior finishes need dry and 10 °C; earthworks stop at 10 mm. Forecasts from Open-Meteo, past years from ERA5. Noise is a rough 85 dB at 10 m, falling 6 dB per doubling of distance."));
}

async function addProject(ctx: WorkCtx, f: Firm) {
  const q = prompt("The site's address");
  if (!q) return;
  const [g] = await geocode(q).catch(() => []);
  if (!g) { ctx.app.toast("Couldn't find that address.", 3000); return; }
  const t = today();
  const p: Project = { id: newId(), name: g.name.split(",")[0], client: "", kind: "commercial", lon: g.lon, lat: g.lat, address: g.name, value: 0, start: t, finish: addDays(t, 365), cost: 0, tasks: [], deliveries: [], permits: [], rfis: [], log: [{ at: t, text: "Project set up" }] };
  f.projects.push(p); save(f); loadWeather(f);
  openProjectId = p.id; tab = "schedule"; projectScreen(ctx, f, p);
}

// ---- One project -------------------------------------------------------------------------------------

function projectScreen(ctx: WorkCtx, f: Firm, p: Project, fly = true) {
  const t = today(), ev = earnedValue(p, t), ff = forecastFinish(p, t), flags = projectFlags(p, t, fc(p));
  draw(ctx.app, f, p);
  if (fly) void flyToPlace(ctx.app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 700 });
  if (tab === "site") void loadNeighbours(p);
  if (tab === "weather" && !history.has(p.id)) { history.set(p.id, []); void climateDays(p.lon, p.lat, 10).then((x) => { history.set(p.id, x); refresh(); }).catch(() => history.delete(p.id)); }
  const setTab = (x: Tab) => h("button", { class: "chip" + (tab === x ? " on" : ""), onclick: () => { tab = x; projectScreen(ctx, f, p, false); } }, x === "schedule" ? "Schedule" : x === "weather" ? "Weather" : x === "money" ? "Money" : "Site");
  ctx.show(p.name, () => { openProjectId = null; draw(ctx.app, f); home(ctx, f); },
    h("p", { class: "muted small" }, `${p.client || "Client not set"} · ${p.kind} · ${usd(p.value)} · ${p.start} to ${p.finish}`),
    kpis([`${Math.round(ev.done * 100)}%`, `done, ${Math.round(ev.planned * 100)}% planned`, ev.spi < 0.9], [ff.finish, ff.late > 0 ? `${ff.late} working days late` : "on time", ff.late > 0], [ev.cpi.toFixed(2), "CPI (under 1 is over budget)", ev.cpi < 0.95], [String(flags.filter((x) => x.level >= 2).length), "things to act on", flags.some((x) => x.level >= 3)]),
    flags.length ? lines(...flags.slice(0, 6).map((x) => `${x.level >= 3 ? "⛔" : "⚠️"} ${x.text}`)) : lines("✓ Nothing flagged."),
    h("div", { class: "chips wrap" }, setTab("schedule"), setTab("weather"), setTab("money"), setTab("site")),
    tab === "schedule" ? schedulePanel(ctx, f, p) : tab === "weather" ? weatherPanel(p) : tab === "money" ? moneyPanel(ctx, f, p) : sitePanel(ctx, f, p),
    h("div", { class: "row" },
      h("button", { class: "pill-btn holo-go", onclick: () => void siteHologram(ctx.app, p) }, "◎ Hologram"),
      h("button", { class: "primary-btn", onclick: () => ownerReport(f, p) }, "Client report"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${p.name}?`)) { f.projects = f.projects.filter((x) => x.id !== p.id); save(f); openBuildPro(ctx); } } }, "Remove project")),
    title("Project"),
    field("Name", input(p.name, (v) => { p.name = v; save(f); })),
    field("Client", input(p.client, (v) => { p.client = v; save(f); })),
    field("Contract value ($)", input(p.value, (v) => { p.value = Number(v) || 0; save(f); }, { type: "number", min: 0 })),
    field("Start", input(p.start, (v) => { p.start = v; save(f); }, { type: "date" })),
    field("Contract finish", input(p.finish, (v) => { p.finish = v; save(f); }, { type: "date" })));
}

function schedulePanel(ctx: WorkCtx, f: Firm, p: Project) {
  // Bars on the plan as set (no progress), filled by what's done; float and the critical path from today.
  const t = today(), s = schedule({ ...p, tasks: p.tasks.map((x) => ({ ...x, progress: 0 })) }, p.start), now = schedule(p, t > p.start ? t : p.start);
  if (!p.tasks.length) return h("div", {},
    empty("No tasks yet. Start from a typical sequence, then adjust."),
    h("button", { class: "pill-btn", onclick: () => { p.tasks = templateTasks(p); save(f); projectScreen(ctx, f, p, false); } }, "Add a typical building sequence"));
  const total = Math.max(1, s.days);
  const bars = h("div", { class: "bp-gantt" }, ...s.slots.map((x) => {
    const live = now.slots.find((y) => y.task.id === x.task.id)!;
    const task = p.tasks.find((y) => y.id === x.task.id)!;
    return h("button", { class: "bp-row" + (live.critical ? " crit" : ""), onclick: () => taskScreen(ctx, f, p, task) },
      h("span", { class: "bp-name" }, `${WEATHER[x.task.weather].emoji} ${x.task.name}`),
      h("span", { class: "bp-track" }, h("i", { style: `left:${(x.es / total) * 100}%;width:${Math.max(0.8, ((x.ef - x.es) / total) * 100)}%` }, h("b", { style: `width:${Math.round(task.progress * 100)}%` }))),
      h("span", { class: "bp-meta" }, task.progress >= 1 ? "done" : live.critical ? "critical" : `${live.float} d float`));
  }));
  return h("div", {},
    h("p", { class: "muted small" }, `Bars on the baseline from ${p.start}, filled as work is done; red is the critical path from today. ${now.cycle ? "⚠️ Some tasks wait on each other in a loop: check the links." : ""}`),
    bars,
    lines(`Forecast finish ${now.finish}${forecastFinish(p, t).late > 0 ? `, ${forecastFinish(p, t).late} working days after the contract date` : ""}.`, `Critical now: ${forecastFinish(p, t).critical.join(" → ") || "nothing left"}.`),
    h("button", { class: "pill-btn", onclick: () => { const x: Task = { id: newId(), name: "New task", trade: "General", days: 5, after: [], weather: "none", progress: 0, budget: 0, crew: 4 }; p.tasks.push(x); save(f); taskScreen(ctx, f, p, x); } }, "+ Task"));
}

/** A typical sequence for a new building project, sized to its contract value. */
function templateTasks(p: Project): Task[] {
  const rows: [string, string, string, number, string[], Weather, number][] = [
    ["mob", "Mobilise", "General", 5, [], "none", 0.02], ["earth", "Earthworks", "Civils", 15, ["mob"], "earth", 0.05], ["found", "Foundations", "Concrete", 20, ["earth"], "pour", 0.1],
    ["frame", "Structure", "Structure", 45, ["found"], "crane", 0.25], ["roof", "Roof", "Roofing", 12, ["frame"], "roof", 0.06], ["env", "Envelope", "Facade", 30, ["frame"], "crane", 0.14],
    ["mep", "MEP", "MEP", 40, ["frame"], "none", 0.17], ["int", "Interiors", "Finishes", 45, ["env", "mep", "roof"], "none", 0.15], ["ext", "External works", "Civils", 15, ["env"], "earth", 0.04], ["hand", "Handover", "General", 5, ["int", "ext"], "none", 0.02],
  ];
  return rows.map(([id, name, trade, days, after, weather, share]) => ({ id, name, trade, days, after, weather, progress: 0, budget: Math.round(p.value * 0.85 * share), crew: 8 }));
}

function taskScreen(ctx: WorkCtx, f: Firm, p: Project, x: Task) {
  const back = () => projectScreen(ctx, f, p, false);
  const others = p.tasks.filter((o) => o.id !== x.id);
  ctx.show(x.name, back,
    field("Name", input(x.name, (v) => { x.name = v; save(f); })),
    field("Trade", input(x.trade, (v) => { x.trade = v; save(f); })),
    field("Working days", input(x.days, (v) => { x.days = Math.max(0, Number(v) || 0); save(f); }, { type: "number", min: 0 })),
    field("Done (%)", input(Math.round(x.progress * 100), (v) => { x.progress = Math.min(1, Math.max(0, (Number(v) || 0) / 100)); save(f); }, { type: "number", min: 0, max: 100, step: 5 })),
    field("Weather it needs", select<Weather>(x.weather, Object.entries(WEATHER).map(([k, w]) => [k as Weather, w.label]), (v) => { x.weather = v; save(f); })),
    x.weather !== "none" ? h("p", { class: "muted small" }, `Goes ahead with ${WEATHER[x.weather].rule}.`) : "",
    field("Budget ($)", input(x.budget, (v) => { x.budget = Number(v) || 0; save(f); }, { type: "number", min: 0 })),
    field("Crew", input(x.crew ?? 0, (v) => { x.crew = Number(v) || 0; save(f); }, { type: "number", min: 0 })),
    field("Not before", input(x.notBefore ?? "", (v) => { x.notBefore = v || undefined; save(f); }, { type: "date" })),
    title("Waits for"),
    h("div", { class: "chips wrap" }, ...others.map((o) => h("button", { class: "chip" + (x.after.includes(o.id) ? " on" : ""), onclick: () => { x.after = x.after.includes(o.id) ? x.after.filter((k) => k !== o.id) : [...x.after, o.id]; save(f); taskScreen(ctx, f, p, x); } }, o.name))),
    h("button", { class: "primary-btn", onclick: back }, "Done"),
    h("button", { class: "link-btn danger", onclick: () => { p.tasks = p.tasks.filter((o) => o.id !== x.id); for (const o of p.tasks) o.after = o.after.filter((k) => k !== x.id); save(f); back(); } }, "Remove task"));
}

function weatherPanel(p: Project) {
  const days = fc(p), t = today();
  if (!days.length) return empty("Loading the forecast…");
  const w = windows(days), clashes = weatherClashes(p, days, t);
  const kinds = Object.keys(w) as (keyof typeof w)[];
  const hist = history.get(p.id) ?? [];
  return h("div", {},
    h("p", { class: "muted small" }, "The next ten days for each kind of weather-sensitive work: a dot is a day it can go ahead."),
    h("div", { class: "bp-wx", style: `grid-template-columns:minmax(0,1.6fr) repeat(${days.length},minmax(0,1fr))` },
      h("span", {}), ...days.map((d) => h("span", { class: "bp-wx-day" }, new Date(d.date + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "narrow", day: "numeric" }))),
      ...kinds.flatMap((k) => [h("span", { class: "bp-wx-kind" }, `${WEATHER[k].emoji} ${WEATHER[k].label}`), ...w[k].map((c) => h("span", { class: "bp-wx-cell " + (c.ok ? "ok" : "no"), title: c.why ?? "Good" }, c.ok ? "●" : "×"))])),
    clashes.length ? h("div", {}, title("Planned work the weather rules out"), list(...clashes.map((c) => row({ color: c.slot.critical ? "#ff453a" : "#ff9f0a" }, `${c.slot.task.name} · ${c.date}`, `${c.why}${c.next ? ` · next good day ${c.next}` : " · no good day in the forecast"}${c.slot.critical ? " · on the critical path" : ` · ${c.slot.float} days float`}`)))) : lines("✓ Nothing planned in the next ten days that the weather rules out."),
    title("What past years say"),
    hist.length ? h("div", {}, ...(["pour", "earth", "paint"] as const).map((k) => {
      const lost = lostDaysByMonth(k, hist), max = Math.max(1, ...lost);
      return h("div", {}, h("p", { class: "small" }, `${WEATHER[k].emoji} ${WEATHER[k].label}: working days lost a month`),
        h("div", { class: "fn-climate" }, ...lost.map((v, i) => h("span", { title: `${MONTHS[i]}: ${v} days` }, h("i", { style: `height:${(v / max) * 100}%;background:#ff9f0a` }), h("small", {}, MONTHS[i][0])))));
    }), h("p", { class: "muted small" }, "From ten years of daily ERA5 weather here: build these into the programme as weather days.")) : empty("Loading ten years of weather…"));
}

function moneyPanel(ctx: WorkCtx, f: Firm, p: Project) {
  const ev = earnedValue(p, today()), max = Math.max(ev.bac, ev.eac, 1);
  const bar = (label: string, v: number, color: string) => h("div", { class: "bp-money" }, h("span", {}, label), h("span", { class: "bp-money-bar" }, h("i", { style: `width:${(v / max) * 100}%;background:${color}` })), h("strong", {}, usdShort(v)));
  return h("div", {},
    bar("Budget at completion", ev.bac, "#8e8e93"), bar("Planned value (should be done)", ev.pv, "#0a84ff"), bar("Earned value (done)", ev.ev, "#30d158"), bar("Actual cost", ev.ac, ev.ac > ev.ev ? "#ff453a" : "#30d158"), bar("Forecast at completion", ev.eac, ev.eac > ev.bac ? "#ff453a" : "#30d158"),
    lines(`Cost performance ${ev.cpi.toFixed(2)}: every dollar spent has earned ${ev.cpi.toFixed(2)} of work.`, `Schedule performance ${ev.spi.toFixed(2)}: ${Math.round(ev.spi * 100)}% of the work planned by now is done.`,
      ev.overrun > 0 ? `At this rate the job costs ${usd(ev.eac)}, ${usd(ev.overrun)} over budget.` : `At this rate the job comes in ${usd(-ev.overrun)} under budget.`,
      p.rfis.some((r) => r.cost) ? `Open questions with a price: ${usd(p.rfis.filter((r) => r.status === "open").reduce((s, r) => s + (r.cost ?? 0), 0))} of possible variations.` : null),
    field("Spent to date ($)", input(p.cost, (v) => { p.cost = Number(v) || 0; save(f); projectScreen(ctx, f, p, false); }, { type: "number", min: 0 })));
}

function sitePanel(ctx: WorkCtx, f: Firm, p: Project) {
  const t = today(), hc = headcount(p, t, 20), peak = Math.max(1, ...hc.map((x) => x.people));
  const rs = receptors.get(p.id);
  const sensitive = (rs ?? []).filter((r) => r.kind !== "homes"), homes = (rs ?? []).filter((r) => r.kind === "homes");
  const dels = [...p.deliveries].filter((d) => d.status !== "delivered").sort((a, b) => a.date.localeCompare(b.date));
  const dc = deliveryClashes(p, fc(p));
  return h("div", {},
    title(`People on site · peak ${peak}`),
    h("div", { class: "fn-climate" }, ...hc.map((x) => h("span", { title: `${x.date}: ${x.people} (${x.trades.join(", ")})` }, h("i", { style: `height:${(x.people / peak) * 100}%;background:#0a84ff` }), h("small", {}, x.date.slice(8))))),
    title("Deliveries"),
    dc.length ? lines(...dc.map((c) => `⚠️ ${c.a.what}${c.b ? ` and ${c.b.what}` : ""}: ${c.why}`)) : "",
    dels.length ? list(...dels.map((d) => row({ color: d.crane ? "#ff9f0a" : "#bf5af2" }, `${d.date}${d.window ? ` ${d.window}` : ""} · ${d.what}`, `${d.supplier}${d.lon !== undefined ? ` · about ${fmt(haulHours(p, { lon: d.lon, lat: d.lat! }), 1)} h by road` : ""} · ${d.trucks} truck${d.trucks === 1 ? "" : "s"}${d.crane ? " · needs the crane" : ""}`, undefined,
      h("button", { class: "pill-btn", onclick: (e: Event) => { e.stopPropagation(); d.status = "delivered"; p.log.push({ at: t, text: `Delivered: ${d.what}` }); save(f); projectScreen(ctx, f, p, false); } }, "Arrived")))) : empty("No deliveries booked."),
    h("button", { class: "pill-btn", onclick: () => void addDelivery(ctx, f, p) }, "+ Delivery"),
    title("Neighbours within 300 m"),
    !rs ? empty("Looking…") : lines(
      `${homes.length} homes or blocks of flats; ${sensitive.length} schools, clinics, care homes or places of worship.`,
      ...sensitive.slice(0, 6).map((r) => `${r.name}: ${r.m} m, about ${noiseAt(r.m)} dB from heavy plant`),
      `Working hours: ${p.hours ?? "not set"}. Tell the neighbours before noisy or out-of-hours work.`),
    title("Permits and inspections"),
    p.permits.length ? list(...[...p.permits].sort((a, b) => a.date.localeCompare(b.date)).map((x) => row({ color: x.status === "pending" ? (x.date < t ? "#ff453a" : daysBetween(t, x.date) <= 14 ? "#ff9f0a" : "#8e8e93") : "#30d158" }, x.title, `${x.date} · ${x.status}`, undefined,
      x.status === "pending" ? h("button", { class: "pill-btn", onclick: (e: Event) => { e.stopPropagation(); x.status = x.kind === "permit" ? "issued" : "passed"; save(f); projectScreen(ctx, f, p, false); } }, x.kind === "permit" ? "Issued" : "Passed") : undefined))) : empty("None recorded."),
    title("Questions to the designer"),
    p.rfis.length ? list(...p.rfis.map((r) => row({ color: r.status === "open" ? (daysBetween(r.opened, t) > 7 ? "#ff9f0a" : "#0a84ff") : "#30d158" }, r.title, `opened ${r.opened} (${daysBetween(r.opened, t)} days)${r.cost ? ` · could cost ${usd(r.cost)}` : ""}${r.days ? `, ${r.days} days` : ""} · ${r.status}`, undefined,
      r.status === "open" ? h("button", { class: "pill-btn", onclick: (e: Event) => { e.stopPropagation(); r.status = "answered"; save(f); projectScreen(ctx, f, p, false); } }, "Answered") : undefined))) : empty("None open."),
    h("button", { class: "pill-btn", onclick: () => { const q = prompt("The question"); if (q) { p.rfis.push({ id: newId(), title: q, opened: t, status: "open" }); save(f); projectScreen(ctx, f, p, false); } } }, "+ Question"));
}

async function addDelivery(ctx: WorkCtx, f: Firm, p: Project) {
  const what = prompt("What's coming?");
  if (!what) return;
  const from = prompt("From which supplier (name and town)?") ?? "";
  const date = prompt("Which day (YYYY-MM-DD)?", addDays(today(), 1)) ?? addDays(today(), 1);
  const [g] = from ? await geocode(from).catch(() => []) : [];
  p.deliveries.push({ id: newId(), what, supplier: from || "Supplier", lon: g?.lon, lat: g?.lat, date, trucks: 1, status: "booked", crane: workable("crane", { date, rain: 0, windMax: 0, gustMax: 0, tmin: 10, tmax: 20 }).ok && /steel|panel|precast|truss|frame|glass/i.test(what) });
  save(f); projectScreen(ctx, f, p, false);
}

// ---- Reports -----------------------------------------------------------------------------------------

function ownerReport(f: Firm, p: Project) {
  const t = today(), ev = earnedValue(p, t), ff = forecastFinish(p, t), s = schedule(p, t > p.start ? t : p.start);
  printReport(`${p.name}: progress report`, `${f.name} for ${p.client || "the client"} · ${t}`, [
    { heading: "Summary", kpis: [[`${Math.round(ev.done * 100)}%`, "complete"], [ff.finish, "forecast finish"], [ff.late > 0 ? `${ff.late} d` : "On time", "against contract"], [ev.cpi.toFixed(2), "cost performance"]] },
    { heading: "Programme", table: { head: ["Task", "Start", "Finish", "Done", "Float"], rows: s.slots.map((x) => [x.task.name, x.start, x.end, `${Math.round(x.task.progress * 100)}%`, x.critical ? "critical" : `${x.float} d`]) } },
    { heading: "Look-ahead: weather", lines: weatherClashes(p, fc(p), t).map((c) => `${c.slot.task.name} ${c.date}: ${c.why}${c.next ? `, next good day ${c.next}` : ""}`).concat(weatherClashes(p, fc(p), t).length ? [] : ["No weather clashes in the next ten days."]) },
    { heading: "Permits and inspections", lines: p.permits.map((x) => `${x.title}: ${x.status}, ${x.date}`) },
    { heading: "Open questions", lines: p.rfis.filter((r) => r.status === "open").map((r) => `${r.title} (opened ${r.opened})`) },
  ]);
}

function exportAll(f: Firm) {
  const t = today();
  downloadCsv(`${f.name} projects ${t}`, ["project", "client", "value", "start", "contract finish", "forecast finish", "days late", "done %", "planned %", "CPI", "SPI", "forecast cost"],
    f.projects.map((p) => { const ev = earnedValue(p, t), ff = forecastFinish(p, t); return [p.name, p.client, p.value, p.start, p.finish, ff.finish, ff.late, Math.round(ev.done * 100), Math.round(ev.planned * 100), ev.cpi.toFixed(2), ev.spi.toFixed(2), Math.round(ev.eac)]; }));
}

/** The site as a hologram: the block around it, the site glowing by status, the 300 m earshot ring, and the neighbours who'll hear it. */
async function siteHologram(app: App, p: Project) {
  const t = today(), d0 = fc(p)[0], ev = earnedValue(p, t), ff = forecastFinish(p, t), lvl = worst(p);
  void loadNeighbours(p);
  const markers = () => [
    { lon: p.lon, lat: p.lat, color: statusColor(lvl), label: `${Math.round(ev.done * 100)}% built`, pulse: lvl >= 3, ring: 300, height: 60 },
    ...(receptors.get(p.id) ?? []).filter((r) => r.kind !== "homes").slice(0, 8).map((r) => ({ lon: r.lon, lat: r.lat, color: "#ff375f", label: `${r.name} · ${noiseAt(r.m)} dB`, height: 25 })),
  ];
  const hl = await openSpace(app, { name: p.name, kicker: `Building site · ${p.client || p.kind}`, lon: p.lon, lat: p.lat, size: 760, tint: "amber", markers: markers() });
  const ok = (k: Weather) => (d0 ? (workable(k, d0).ok ? "Go" : `Stop: ${workable(k, d0).why}`) : "…");
  hl.setHud([
    { k: "Crane today", v: ok("crane") }, { k: "Pour today", v: ok("pour") },
    { k: "On site today", v: `${headcount(p, t, 1)[0]?.people ?? 0} people` },
    { k: "Finish", v: ff.late > 0 ? `${ff.finish} (${ff.late} d late)` : ff.finish }, { k: "Cost performance", v: ev.cpi.toFixed(2) },
  ], projectFlags(p, t, fc(p))[0]?.text);
  setTimeout(() => hl.setMarkers(markers()), 4000);
}
