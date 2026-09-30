// Field Network on the map: a mining equipment, technology or services
// company's customers, machines, people and market. One screen with five
// ways to see the business: the fleet (what's down, due, ending warranty,
// near replacement), service (jobs, who to send and how long it takes to get
// there, which sites are beyond the promised response and where a new base
// helps most, parts), sites (altitude, climate, grid, ports and a
// battery-electric screen, filled in for every customer), the market (every
// mine in the world scored for fit, and the pipeline), and risk (exposure by
// commodity and country, hazards near customers, conflict minerals).
import type { App } from "../../app";
import { airports as loadAirports } from "../../data/infra";
import { recentQuakes } from "../../data/quakes";
import { naturalEvents } from "../../live/news";
import { commodity } from "../../content/minerals";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { parseCsv } from "../office/model";
import { days, fmt, kmBetween, kmText, today } from "../kit/ops";
import { ageBadge, arcFlow, empty, field, frame, hoursText, input, kpis, lines, list, OpsMap, row, select, title } from "../kit/ui";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { usd, usdShort } from "../mining/model";
import { conditionsFor, MONTHS, wetNow, type Conditions } from "./conditions";
import { demoCompany } from "./demo";
import { fit, quickHours, worldMines, type Mine } from "./market";
import {
  bestBase, coverage, dispatch, exposure, travel as travelFn, fleetHealth, hoursNow, jobQueue, lifeLeft, partSource, pipeline, serviceDue, STAGE_ODDS,
  type Account, type Airport, type Asset, type Company, type Job, type JobKind, type OppStage,
} from "./network";

const store = new ListStore<Company>("atlas.pro.services.v1");
const current = () => store.all()[0];
const save = (c: Company) => store.save(c);
let map: OpsMap | null = null;
type View = "fleet" | "service" | "sites" | "market" | "risk";
let view: View = "fleet";
let ctxRef: WorkCtx | null = null;

// ---- What loads in the background ------------------------------------------------------------------

let airports: Airport[] = [];
const conds = new Map<string, Conditions>();
let mines: Mine[] | null = null;
let hazards: { title: string; lon: number; lat: number; km: number; site: string }[] | null = null;

function redraw() { const c = current(); if (c && ctxRef) { draw(ctxRef.app, c); home(ctxRef, c); } }
let loading = false;
function loadAll(c: Company) {
  if (loading) return;
  loading = true;
  void loadAirports().then((a) => { airports = a.filter((x) => x.type !== "small" || x.rank <= 9); redraw(); }).catch(() => {});
  let n = 0;
  for (const a of c.accounts) void conditionsFor(a).then((x) => { conds.set(a.id, x); if (++n % 3 === 0 || n === c.accounts.length) redraw(); }).catch(() => {});
}
const wet = (a: Account) => wetNow(conds.get(a.id));

// ---- The map ---------------------------------------------------------------------------------------

const STATUS = { down: "#ff453a", overdue: "#ff9f0a", ok: "#30d158" };

function draw(app: App, c: Company) {
  map ??= new OpsMap(app, "pro:services", "#ff9f0a");
  const t = today(), fs: WorkFeature[] = [], flows = [];
  const byAcc = (id: string) => c.assets.filter((a) => a.account === id);
  const depots = () => c.depots.forEach((d) => fs.push({ id: d.id, kind: "point", pts: [[d.lon, d.lat]], color: "#bf5af2", label: `🏭 ${d.name}` }));
  if (view === "fleet") {
    for (const a of c.accounts) {
      const ms = byAcc(a.id), down = ms.some((m) => m.status === "down"), overdue = ms.some((m) => serviceDue(m, t).overdue);
      fs.push({ id: a.id, kind: "point", pts: [[a.lon, a.lat]], color: down ? STATUS.down : overdue ? STATUS.overdue : STATUS.ok, label: `${a.site} · ${ms.length}` });
    }
    depots();
  } else if (view === "service") {
    const cov = coverage(c, airports, wet);
    for (const r of cov) fs.push({ id: r.a.id, kind: "point", pts: [[r.a.lon, r.a.lat]], color: r.within ? STATUS.ok : STATUS.down, label: `${r.a.site} · ${r.trip ? `${Math.round(r.trip.hours)} h` : "…"}` });
    for (const tc of c.techs) fs.push({ id: tc.id, kind: "point", pts: [[tc.lon + 0.05, tc.lat + 0.05]], color: tc.available ? "#0a84ff" : "#8e8e93" });
    depots();
    for (const { j } of jobQueue(c, t)) {
      const tc = c.techs.find((x) => x.id === j.tech), a = c.accounts.find((x) => x.id === j.account);
      if (tc && a) { const f = arcFlow(`job${j.id}`, tc, a, "#0a84ff", 0.6); fs.push(f.line); flows.push(f.flow); }
    }
    const b = airports.length ? bestBase(c, airports) : null;
    if (b) fs.push({ id: "bestbase", kind: "point", pts: [[b.at.lon, b.at.lat]], color: "#ffd60a", label: `＋ New base? ${b.at.name}` });
  } else if (view === "sites") {
    for (const a of c.accounts) {
      const x = conds.get(a.id);
      const s = x?.electric.score ?? 50;
      fs.push({ id: a.id, kind: "point", pts: [[a.lon, a.lat]], color: !x ? "#8e8e93" : s >= 70 ? "#30d158" : s >= 45 ? "#ffd60a" : "#ff9f0a", label: `${a.site}${x ? ` · ${fmt(x.alt)} m` : ""}` });
    }
  } else if (view === "market") {
    for (const m of topProspects(c).slice(0, 250)) fs.push({ id: `m${m.m.id}`, kind: "point", pts: [[m.m.lon, m.m.lat]], color: m.f.score >= 80 ? "#30d158" : m.f.score >= 60 ? "#ffd60a" : "#8e8e93" });
    for (const a of c.accounts) fs.push({ id: a.id, kind: "point", pts: [[a.lon, a.lat]], color: "#ff375f", label: a.site });
    for (const o of c.opps.filter((x) => x.prospect && x.stage !== "lost")) fs.push({ id: o.id, kind: "point", pts: [[o.prospect!.lon, o.prospect!.lat]], color: "#0a84ff", label: `${o.prospect!.name} · ${o.product}` });
    depots();
  } else {
    for (const a of c.accounts) fs.push({ id: a.id, kind: "point", pts: [[a.lon, a.lat]], color: conds.get(a.id)?.conflict ? "#ff453a" : "#ff9f0a", label: a.site });
    for (const [i, x] of (hazards ?? []).entries()) fs.push({ id: `hz${i}`, kind: "point", pts: [[x.lon, x.lat]], color: "#ff453a", label: `${x.title} · ${kmText(x.km)} from ${x.site}` });
  }
  map.draw(`Field network · ${c.name}`, fs, flows);
}

let scored: { key: string; rows: { m: Mine; f: ReturnType<typeof fit> }[] } | null = null;
function topProspects(c: Company) {
  if (!mines) return [];
  const key = `${c.id}:${mines.length}:${c.accounts.length}:${c.techs.length}:${c.depots.length}`;
  if (scored?.key !== key) {
    const taken = (m: Mine) => c.accounts.some((a) => kmBetween(a, m) < 5);
    scored = { key, rows: mines.filter((m) => !taken(m)).map((m) => ({ m, f: fit(c, m, quickHours(c, m)) })).sort((a, b) => b.f.score - a.f.score) };
  }
  return scored.rows;
}

// ---- Screens ---------------------------------------------------------------------------------------

export function openServices(ctx: WorkCtx) {
  ctxRef = ctx;
  const c = current();
  if (!c) return start(ctx);
  loadAll(c);
  draw(ctx.app, c);
  home(ctx, c);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your company's name" }) as HTMLInputElement;
  ctx.show("Field Network", ctx.home,
    h("p", {}, "For companies that sell to and service mines: every customer site with its conditions filled in (altitude and engine derating, climate and wet season, grid, ports and airports), your machines there and when each needs service, your technicians and how long they really take to reach a remote site, jobs and who to send, parts, where a new base helps most, every mine in the world scored as a prospect, your pipeline, and the risks across it all."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save({ id: newId(), name: name.value.trim() || "My company", vertical: "mining", offer: { types: [], methods: ["open pit", "underground"], commodities: [] }, accounts: [], assets: [], techs: [], depots: [], jobs: [], opps: [], slaHours: 24, created: Date.now() }); openServices(ctx); } }, "Start"),
    h("button", { class: "pill-btn", onclick: () => { const c = demoCompany(); save(c); view = "fleet"; loading = false; openServices(ctx); frame(ctx.app, c.name, c.accounts); } }, "Or try a demo: a mining equipment company with machines at 12 mines"));
}

function home(ctx: WorkCtx, c: Company) {
  const { app } = ctx;
  const t = today(), fh = fleetHealth(c, t), q = jobQueue(c, t), pl = pipeline(c.opps);
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), onclick: () => {
    view = id; draw(app, c); home(ctx, c);
    if (id === "market" && !mines) void worldMines().then((m) => { mines = m; redraw(); }).catch(() => { mines = []; redraw(); });
    if (id === "risk" && !hazards) void loadHazards(c);
    if (id === "market") frame(app, c.name, [...c.accounts, ...c.depots], 2_000_000); else frame(app, c.name, c.accounts);
  } }, label);
  ctx.show("Field Network", ctx.home,
    h("input", { class: "mp-name", value: c.name, "aria-label": "Company name", onchange: (e: Event) => { c.name = (e.target as HTMLInputElement).value || c.name; save(c); } }),
    kpis(
      [`${Math.round(fh.availability * 100)}%`, `of ${fh.total} machines running`, fh.down.length > 0],
      [String(q.filter((x) => x.j.priority === 1).length), "breakdowns open", q.some((x) => x.j.priority === 1)],
      [String(fh.overdue.length + fh.dueSoon.length), "services due this week", fh.overdue.length > 0],
      [usdShort(pl.weighted), "weighted pipeline"]),
    h("div", { class: "chips wrap" }, tab("fleet", "Fleet"), tab("service", "Service"), tab("sites", "Sites"), tab("market", "Market"), tab("risk", "Risk")),
    h("div", { class: "row" }, h("button", { class: "pill-btn", onclick: () => serviceReport(c) }, "Monthly report"), h("button", { class: "pill-btn", onclick: () => importScreen(ctx, c) }, "Import")),
    view === "fleet" ? fleetPanel(ctx, c) : view === "service" ? servicePanel(ctx, c) : view === "sites" ? sitesPanel(ctx, c) : view === "market" ? marketPanel(ctx, c) : riskPanel(ctx, c),
    h("div", { class: "mp-foot" }, h("span", {}, c.demo ? "A demo company: its machines, people, jobs and deals are made up; the mines and places are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${c.name}?`)) { store.remove(c.id); map?.clear(); openServices(ctx); } } }, "Remove")),
    note("Travel is estimated: road 1.35× the straight line at 65 km/h, or a flight between the nearest airports (with check-in, and a connection or charter for small airports), driving half as slow again in a site's wet months. Site conditions come from Terrarium elevation, ten years of ERA5 climate (Open-Meteo), and bundled power station, port and airport data. Derating is a rule of thumb; use the OEM's curve."));
}

// ---- Fleet -----------------------------------------------------------------------------------------

function assetLine(c: Company, a: Asset, t: string) {
  const acc = c.accounts.find((x) => x.id === a.account), due = serviceDue(a, t);
  return `${acc?.site ?? "?"} · ${fmt(hoursNow(a, t))} h · ${due.overdue ? `service ${fmt(-due.hoursLeft)} h overdue` : `service in ${fmt(due.hoursLeft)} h (${Math.round(due.daysLeft)} d)`}`;
}

function fleetPanel(ctx: WorkCtx, c: Company) {
  const t = today(), fh = fleetHealth(c, t);
  const r = (a: Asset, badge?: HTMLElement) => row({ color: a.status === "down" ? STATUS.down : serviceDue(a, t).overdue ? STATUS.overdue : STATUS.ok }, `${a.type} ${a.serial}`, assetLine(c, a, t), () => assetScreen(ctx, c, a), badge);
  return h("div", {},
    lines(
      `${fh.total} machines at ${c.accounts.length} sites; ${fh.down.length} down, ${c.assets.filter((a) => a.status === "standby").length} on standby.`,
      fh.overdue.length ? `⚠️ ${fh.overdue.length} past their service interval.` : "",
      fh.warrantyEnding.length ? `💼 ${fh.warrantyEnding.length} ${fh.warrantyEnding.length === 1 ? "warranty ends" : "warranties end"} within 90 days: offer a service contract.` : "",
      fh.replaceSoon.length ? `💼 ${fh.replaceSoon.length} machines reach the end of their design life within two years: replacement deals to start now.` : ""),
    fh.down.length ? h("div", {}, title("Down now"), list(...fh.down.map((x) => r(x.a)))) : "",
    fh.overdue.length + fh.dueSoon.length ? h("div", {}, title("Service due"), list(...[...fh.overdue, ...fh.dueSoon].sort((a, b) => a.due.hoursLeft - b.due.hoursLeft).map((x) => r(x.a, ageBadge(Math.abs(Math.round(x.due.daysLeft)), x.due.overdue ? "late" : "days", x.due.overdue))))) : "",
    fh.warrantyEnding.length ? h("div", {}, title("Warranty ending"), list(...fh.warrantyEnding.map((x) => r(x.a, ageBadge(days(t, x.a.warrantyUntil!), "days"))))) : "",
    fh.replaceSoon.length ? h("div", {}, title("Near end of life"), list(...fh.replaceSoon.map((x) => r(x.a, ageBadge(Math.max(0, Math.round(x.life!.years * 12)), "months"))))) : "",
    title("Customers"),
    list(...c.accounts.map((a) => { const ms = c.assets.filter((m) => m.account === a.id); return row("⛏", a.site, `${a.name} · ${ms.length} machines${ms.some((m) => m.status === "down") ? " · one down" : ""}`, () => accountScreen(ctx, c, a)); })),
    accountAdder(ctx, c));
}

function assetScreen(ctx: WorkCtx, c: Company, a: Asset) {
  const t = today(), due = serviceDue(a, t), life = lifeLeft(a, t), acc = c.accounts.find((x) => x.id === a.account)!;
  ctx.show(`${a.type} ${a.serial}`, () => openServices(ctx),
    lines(`${a.model} at ${acc.site}, installed ${a.installed}.`, `${fmt(hoursNow(a, t))} hours (about ${a.perDay} a day).`,
      due.overdue ? `⚠️ Service ${fmt(-due.hoursLeft)} hours overdue.` : `Next service in ${fmt(due.hoursLeft)} hours, about ${Math.round(due.daysLeft)} days.`,
      life ? `${Math.round(life.used * 100)}% of its design life used; about ${life.years.toFixed(1)} years left at this rate.` : "",
      a.warrantyUntil ? `Warranty until ${a.warrantyUntil}.` : ""),
    field("Status", select(a.status, [["running", "Running"], ["standby", "Standby"], ["down", "Down"]], (v) => { a.status = v; save(c); })),
    field("Hours now", input(Math.round(hoursNow(a, t)), (v) => { a.hours = Number(v) || a.hours; a.asOf = t; save(c); }, { type: "number", min: 0 })),
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => { a.hours = hoursNow(a, t); a.asOf = t; a.lastService = a.hours; save(c); assetScreen(ctx, c, a); } }, "Serviced today"),
      h("button", { class: "pill-btn", onclick: () => { c.jobs.push({ id: newId(), account: a.account, asset: a.id, kind: a.status === "down" ? "breakdown" : "scheduled service", priority: a.status === "down" ? 1 : 2, opened: t, status: "open" }); save(c); view = "service"; openServices(ctx); } }, "Open a job")));
}

// ---- Service ---------------------------------------------------------------------------------------

function servicePanel(ctx: WorkCtx, c: Company) {
  const t = today(), q = jobQueue(c, t);
  if (!airports.length) return h("p", { class: "muted small" }, "Loading airports for travel times…");
  const cov = coverage(c, airports, wet), out = cov.filter((r) => !r.within);
  const b = bestBase(c, airports);
  const covered = (d: (typeof c.depots)[number]) => (d.stock ?? []).map((s) => ({ s, weeks: s.perMonth > 0 ? (s.qty / s.perMonth) * 4.345 : Infinity })).sort((x, y) => x.weeks - y.weeks);
  return h("div", {},
    lines(
      `${cov.length - out.length} of ${cov.length} sites can be reached within their promised response time.`,
      ...(() => { const free = coverage(c, airports, wet, true).filter((r) => !r.within && cov.find((x) => x.a.id === r.a.id)?.within); return free.length ? [`Right now, with who's free: ${free.map((r) => `${r.a.site} ${r.trip ? `${Math.round(r.trip.hours)} h` : "no one free"}`).join(", ")} beyond the promise.`] : []; })(),
      out.length ? `⚠️ Beyond it: ${out.map((r) => `${r.a.site} (${Math.round(r.trip?.hours ?? 0)} h against ${r.sla} h${wet(r.a) ? ", wet season" : ""})`).join(", ")}.` : "",
      b ? `💡 A base at ${b.at.name} would bring ${b.machines} more machines within their response time (${b.accounts.map((a) => a.site).join(", ")}).` : ""),
    b ? h("button", { class: "pill-btn", onclick: () => { c.depots.push({ id: newId(), name: `Service centre, ${b.at.name} (planned)`, kind: "service centre", lon: b.at.lon, lat: b.at.lat }); save(c); openServices(ctx); } }, "Plan that base") : "",
    title("Jobs"),
    q.length ? list(...q.map(({ j, age }) => {
      const a = c.accounts.find((x) => x.id === j.account)!, tc = c.techs.find((x) => x.id === j.tech), best = dispatch(c, j, airports, wet(a))[0];
      return row({ color: j.priority === 1 ? STATUS.down : j.priority === 2 ? STATUS.overdue : "#8e8e93" }, `${j.kind[0].toUpperCase() + j.kind.slice(1)} · ${a.site}`,
        tc ? `${tc.name} assigned · ${j.status}` : best ? `Send ${best.t.name}: ${hoursText(best.trip.hours)} (${best.trip.how})${best.t.available ? "" : ", busy"}` : "No one with the skill", () => jobScreen(ctx, c, j), ageBadge(age, "days", j.priority === 1 && age > 1));
    })) : empty("No open jobs."),
    h("button", { class: "link-btn", onclick: () => jobScreen(ctx, c, null) }, "+ A job"),
    title("Technicians"),
    list(...c.techs.map((tc) => row({ color: tc.available ? "#0a84ff" : "#8e8e93" }, tc.name, `${tc.base} · ${tc.skills.join(", ")} · ${tc.available ? "available" : "on a job"}`, () => { tc.available = !tc.available; save(c); openServices(ctx); }))),
    title("Parts"),
    list(...c.depots.filter((d) => d.stock?.length).flatMap((d) => covered(d).map(({ s, weeks }) => row({ color: weeks < 4 ? STATUS.down : weeks < 8 ? STATUS.overdue : STATUS.ok }, `${s.part} · ${d.name}`, `${fmt(s.qty)} in stock · ${fmt(s.perMonth, 1)} a month · ${Number.isFinite(weeks) ? `${weeks.toFixed(1)} weeks` : "not moving"}`,
      () => { const v = prompt(`How many ${s.part} at ${d.name}?`, String(s.qty)); if (v !== null && Number.isFinite(Number(v))) { s.qty = Math.max(0, Number(v)); save(c); openServices(ctx); } })))));
}

function jobScreen(ctx: WorkCtx, c: Company, j: Job | null) {
  const t = today(), fresh = !j;
  const x: Job = j ?? { id: newId(), account: c.accounts[0]?.id ?? "", kind: "breakdown", priority: 1, opened: t, status: "open" };
  const a = c.accounts.find((y) => y.id === x.account);
  const options = a && airports.length ? dispatch(c, x, airports, wet(a)) : [];
  const part = x.part && a ? partSource(c, x.part, a, airports) : null;
  ctx.show(fresh ? "A job" : `${x.kind} · ${a?.site ?? ""}`, () => openServices(ctx),
    field("Site", select(x.account, c.accounts.map((y) => [y.id, y.site] as [string, string]), (v) => { x.account = v; x.asset = undefined; })),
    field("Machine", select(x.asset ?? "", [["", "—"], ...c.assets.filter((y) => y.account === x.account).map((y) => [y.id, `${y.type} ${y.serial}`] as [string, string])], (v) => (x.asset = v || undefined))),
    field("Kind", select(x.kind, (["breakdown", "scheduled service", "commissioning", "inspection", "training", "upgrade"] as JobKind[]).map((k) => [k, k] as [JobKind, string]), (v) => (x.kind = v))),
    field("Priority", select(String(x.priority) as "1" | "2" | "3", [["1", "Urgent"], ["2", "Normal"], ["3", "Low"]], (v) => (x.priority = Number(v) as 1 | 2 | 3))),
    field("Part needed", input(x.part ?? "", (v) => (x.part = v || undefined), { placeholder: "e.g. Hydraulic pump" })),
    !fresh && options.length ? h("div", {}, title("Who to send"), list(...options.slice(0, 5).map((o) => row({ color: o.t.available ? "#0a84ff" : "#8e8e93" }, o.t.name,
      `${hoursText(o.trip.hours)} · ${o.trip.how}${o.t.available ? "" : " · on another job"}${a && wet(a) ? " · wet season" : ""}`,
      () => { x.tech = o.t.id; x.status = "assigned"; o.t.available = false; save(c); openServices(ctx); }, x.tech === o.t.id ? h("span", { class: "chip on" }, "Sent") : undefined)))) : "",
    part ? lines(`📦 ${x.part}: nearest in stock at ${part.d.name}, ${hoursText(part.trip.hours)} away (${part.trip.how}).`) : x.part ? lines(`📦 No depot has ${x.part} in stock: order from the factory.`) : "",
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => { if (fresh) c.jobs.push(x); save(c); openServices(ctx); } }, fresh ? "Open the job" : "Save"),
      !fresh ? h("button", { class: "pill-btn", onclick: () => { x.status = "on site"; save(c); openServices(ctx); } }, "On site") : "",
      !fresh ? h("button", { class: "pill-btn", onclick: () => { x.status = "done"; x.closed = t; const tc = c.techs.find((y) => y.id === x.tech); if (tc) tc.available = true; const m = c.assets.find((y) => y.id === x.asset); if (m && x.kind === "breakdown") m.status = "running"; save(c); openServices(ctx); } }, "Done") : ""));
}

// ---- Sites -----------------------------------------------------------------------------------------

function sitesPanel(ctx: WorkCtx, c: Company) {
  const ready = c.accounts.filter((a) => conds.has(a.id));
  if (!ready.length) return h("p", { class: "muted small" }, "Reading altitude, ten years of climate, and the nearest grid, port and airport for each site…");
  const high = ready.filter((a) => conds.get(a.id)!.derate > 0).sort((a, b) => conds.get(b.id)!.alt - conds.get(a.id)!.alt);
  const wetting = ready.filter((a) => wet(a));
  const best = [...ready].sort((a, b) => conds.get(b.id)!.electric.score - conds.get(a.id)!.electric.score);
  return h("div", {},
    lines(
      high.length ? `⛰ ${high.length} ${high.length === 1 ? "site is" : "sites are"} high enough to derate diesels: ${high.slice(0, 4).map((a) => `${a.site} ${fmt(conds.get(a.id)!.alt)} m (−${Math.round(conds.get(a.id)!.derate)}%)`).join(", ")}.` : "",
      wetting.length ? `🌧 In the wet season now: ${wetting.map((a) => a.site).join(", ")}: expect slower roads and plan parts ahead.` : "",
      best[0] ? `🔋 Most ready for battery-electric: ${best.slice(0, 3).map((a) => `${a.site} (${conds.get(a.id)!.electric.score})`).join(", ")}.` : ""),
    list(...c.accounts.map((a) => {
      const x = conds.get(a.id);
      if (!x) return row("⏳", a.site, "Reading conditions…");
      const cl = x.climate;
      return row({ color: x.electric.score >= 70 ? "#30d158" : x.electric.score >= 45 ? "#ffd60a" : "#ff9f0a" }, a.site,
        [`${fmt(x.alt)} m${x.derate ? ` (−${Math.round(x.derate)}% diesel)` : ""}`, cl ? `${Math.round(cl.coldest)} to ${Math.round(cl.hottest)} °C` : "", cl?.wetMonths.length ? `wet ${cl.wetMonths.map((m) => MONTHS[m]).join(", ")}` : cl ? "dry year-round" : "",
          x.grid ? `grid ${kmText(x.grid.km)}` : "", x.airport ? `${x.airport.iata} ${kmText(x.airport.km)}` : "", `electric ${x.electric.score}`].filter(Boolean).join(" · "),
        () => accountScreen(ctx, c, a));
    })));
}

// ---- Market ----------------------------------------------------------------------------------------

function marketPanel(ctx: WorkCtx, c: Company) {
  const pl = pipeline(c.opps), most = Math.max(1, ...pl.stages.map((s) => s.value));
  const rows = topProspects(c);
  const acc = (id?: string) => c.accounts.find((a) => a.id === id);
  return h("div", {},
    lines(`${pl.open} open deals worth ${usd(pl.value)}; ${usd(pl.weighted)} weighted by stage.${pl.winRate !== null ? ` Win rate ${Math.round(pl.winRate * 100)}%.` : ""}`),
    h("div", { class: "fn-stages" }, ...pl.stages.filter((s) => s.stage !== "lost").map((s) => h("div", {}, h("span", {}, s.stage), h("i", { style: `width:${(s.value / most) * 100}%` }), h("small", {}, `${s.n} · ${usdShort(s.value)}`)))),
    title("Deals"),
    list(...[...c.opps].filter((o) => o.stage !== "lost").sort((a, b) => a.close.localeCompare(b.close)).map((o) => row({ color: o.stage === "won" ? "#30d158" : "#0a84ff" }, `${o.product} · ${acc(o.account)?.site ?? o.prospect?.name ?? ""}`,
      `${o.stage} · ${usd(o.value)} · closes ${o.close} · ${Math.round(STAGE_ODDS[o.stage] * 100)}%`, () => oppStage(ctx, c, o.id)))),
    title("Prospects: every mine, scored"),
    !mines ? h("p", { class: "muted small" }, "Loading the world's mines (Atlas's list and Wikidata)…") :
      h("div", {},
        lines(`${fmt(mines.length)} mines known; ${fmt(rows.filter((r) => r.f.score >= 80).length)} are a strong fit (${c.offer.commodities.slice(0, 5).join(", ")}; ${c.offer.methods.join(" or ")}).`,
          `${fmt(rows.filter((r) => r.f.score >= 60 && r.f.why.some((w) => w.includes("new base"))).length)} good fits are too far from any base to service: where a new base would open a market.`),
        list(...rows.slice(0, 25).map((r) => row({ color: r.f.score >= 80 ? "#30d158" : r.f.score >= 60 ? "#ffd60a" : "#8e8e93" }, `${r.m.name} · ${r.f.score}`, [r.m.country, r.m.commodities.map((x) => commodity(x)?.name ?? x).join(", "), r.m.operator, r.f.why.join("; ")].filter(Boolean).join(" · "),
          () => prospectScreen(ctx, c, r.m, r.f))))));
}

function oppStage(ctx: WorkCtx, c: Company, id: string) {
  const o = c.opps.find((x) => x.id === id)!;
  ctx.show(o.product, () => openServices(ctx),
    field("Stage", select(o.stage, (Object.keys(STAGE_ODDS) as OppStage[]).map((s) => [s, s] as [OppStage, string]), (v) => { o.stage = v; save(c); })),
    field("Value (USD)", input(o.value, (v) => { o.value = Number(v) || o.value; save(c); }, { type: "number", min: 0 })),
    field("Closes", input(o.close, (v) => { o.close = v || o.close; save(c); }, { type: "date" })),
    h("button", { class: "primary-btn", onclick: () => openServices(ctx) }, "Done"));
}

function prospectScreen(ctx: WorkCtx, c: Company, m: Mine, f: ReturnType<typeof fit>) {
  const product = h("input", { class: "pro-url", placeholder: "What you'd sell: 4 drill rigs…" }) as HTMLInputElement;
  const value = h("input", { class: "pro-url po-unit", type: "number", placeholder: "USD" }) as HTMLInputElement;
  const trip = airports.length ? travel0(c, m) : null;
  ctx.show(m.name, () => openServices(ctx),
    lines([m.country, m.operator, m.method, m.commodities.map((x) => commodity(x)?.name ?? x).join(", ")].filter(Boolean).join(" · "), `Fit ${f.score}: ${f.why.join("; ")}.`,
      trip ? `From ${trip.from}: ${hoursText(trip.trip.hours)} (${trip.trip.how}).` : ""),
    h("button", { class: "link-btn", onclick: () => void flyToPlace(ctx.app.globe, { name: m.name, lon: m.lon, lat: m.lat, radius: 6000 }) }, "Show it"),
    title("Open a deal"), h("div", { class: "po-add" }, product, value, h("button", { class: "pill-btn", onclick: () => {
      if (!product.value.trim()) return;
      c.opps.push({ id: newId(), product: product.value.trim(), value: Number(value.value) || 0, stage: "lead", close: new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10), prospect: { name: m.name, lon: m.lon, lat: m.lat, country: m.country, commodity: m.commodities[0] } });
      save(c); openServices(ctx);
    } }, "Add")),
    h("button", { class: "pill-btn", onclick: () => { c.accounts.push({ id: newId(), name: m.operator ?? `${m.name} customer`, site: m.name, lon: m.lon, lat: m.lat, country: m.country, commodity: m.commodities[0], method: m.method, stage: "production" }); save(c); loading = false; openServices(ctx); } }, "It's a customer now"));
}

function travel0(c: Company, p: { lon: number; lat: number }) {
  let best: { from: string; trip: ReturnType<typeof travelFn> } | null = null;
  for (const b of [...c.techs.map((t) => ({ name: t.base, lon: t.lon, lat: t.lat })), ...c.depots]) { const trip = travelFn(b, p, airports); if (!best || trip.hours < best.trip.hours) best = { from: b.name, trip }; }
  return best;
}

// ---- Risk ------------------------------------------------------------------------------------------

async function loadHazards(c: Company) {
  const [ev, qs] = await Promise.all([naturalEvents().catch(() => []), recentQuakes().catch(() => [])]);
  const all = [...ev.map((e) => ({ title: e.title, lon: e.lon, lat: e.lat })), ...qs.filter((q) => q.mag >= 4).map((q) => ({ title: `M${q.mag.toFixed(1)} earthquake`, lon: q.lon, lat: q.lat }))];
  hazards = all.flatMap((x) => { const near = c.accounts.map((a) => ({ a, km: kmBetween(a, x) })).sort((p, q) => p.km - q.km)[0]; return near && near.km <= 300 ? [{ ...x, km: near.km, site: near.a.site }] : []; }).sort((a, b) => a.km - b.km);
  redraw();
}

function riskPanel(_ctx: WorkCtx, c: Company) {
  const ex = exposure(c), flagged = c.accounts.filter((a) => conds.get(a.id)?.conflict);
  const bars = (xs: { k: string; share: number; n: number }[]) => h("div", { class: "fo-inds" }, ...xs.slice(0, 6).map((x) => h("div", { class: "fo-ind" }, h("span", {}, `${commodity(x.k)?.name ?? x.k} · ${x.n} machines`), h("span", { class: "fo-bar" }, h("i", { style: `width:${x.share * 100}%;background:#ff9f0a` })), h("small", {}, `${Math.round(x.share * 100)}%`))));
  return h("div", {},
    lines(
      ex.commodity[0] ? `${Math.round(ex.commodity[0].share * 100)}% of the installed base digs ${commodity(ex.commodity[0].k)?.name.toLowerCase() ?? ex.commodity[0].k}: a price fall there hits service hours and new orders together.` : "",
      ex.country[0] ? `${Math.round(ex.country[0].share * 100)}% is in ${ex.country[0].k}.` : "",
      flagged.length ? `⚠️ Conflict-minerals due diligence (3TG in a Dodd-Frank covered country): ${flagged.map((a) => a.site).join(", ")}.` : "No customers mine tin, tantalum, tungsten or gold in a Dodd-Frank covered country."),
    title("By commodity"), bars(ex.commodity),
    title("By country"), bars(ex.country),
    title("Natural events and earthquakes within 300 km"),
    hazards === null ? h("p", { class: "muted small" }, "Checking NASA's natural events and this week's earthquakes…") :
      hazards.length ? list(...hazards.map((x) => row({ color: STATUS.down }, x.title, `${kmText(x.km)} from ${x.site}`))) : empty("None near any customer."));
}

// ---- Accounts: the brief ---------------------------------------------------------------------------

function accountScreen(ctx: WorkCtx, c: Company, a: Account) {
  const t = today(), x = conds.get(a.id), ms = c.assets.filter((m) => m.account === a.id);
  const trips = airports.length ? [...c.techs.map((tc) => ({ name: `${tc.name} (${tc.base})`, trip: travelFn(tc, a, airports, wet(a)) }))].sort((p, q) => p.trip.hours - q.trip.hours).slice(0, 3) : [];
  ctx.show(a.site, () => openServices(ctx),
    h("p", { class: "muted small" }, [a.name, a.country, commodity(a.commodity ?? "")?.name, a.method, `respond within ${a.slaHours ?? c.slaHours} h`].filter(Boolean).join(" · ")),
    x ? conditionsBlock(x) : h("p", { class: "muted small" }, "Reading the site's conditions…"),
    title(`Machines (${ms.length})`),
    list(...ms.map((m) => row({ color: m.status === "down" ? STATUS.down : serviceDue(m, t).overdue ? STATUS.overdue : STATUS.ok }, `${m.type} ${m.serial}`, assetLine(c, m, t), () => assetScreen(ctx, c, m)))),
    trips.length ? h("div", {}, title("Getting there"), list(...trips.map((p) => row("🧰", p.name, `${hoursText(p.trip.hours)} · ${p.trip.how}`)))) : "",
    (a.contacts ?? []).length ? h("div", {}, title("People"), list(...a.contacts!.map((p) => row("👤", p.name, [p.role, p.email, p.phone].filter(Boolean).join(" · "))))) : "",
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => void flyToPlace(ctx.app.globe, { name: a.site, lon: a.lon, lat: a.lat, radius: 6000 }) }, "Show the site"),
      h("button", { class: "pill-btn", onclick: () => accountBrief(c, a, trips) }, "Visit brief")));
}

function conditionsBlock(x: Conditions) {
  const cl = x.climate;
  return h("div", {},
    h("div", { class: "po-kpis" },
      h("div", { class: "po-kpi" }, h("strong", {}, `${fmt(x.alt)} m`), h("span", {}, `air ${Math.round(x.density * 100)}% of sea level`)),
      h("div", { class: "po-kpi" + (x.derate ? " alert" : "") }, h("strong", {}, x.derate ? `−${Math.round(x.derate)}%` : "0%"), h("span", {}, "diesel power (rule of thumb)")),
      h("div", { class: "po-kpi" }, h("strong", { style: "font-size:17px" }, cl ? `${Math.round(cl.recordLow)}° / ${Math.round(cl.recordHigh)}°` : "—"), h("span", {}, "record low and high, 10 y")),
      h("div", { class: "po-kpi" }, h("strong", {}, String(x.electric.score)), h("span", {}, "battery-electric readiness"))),
    cl ? h("div", { class: "fn-climate" }, ...cl.months.map((m, i) => h("span", { title: `${MONTHS[i]}: ${Math.round(m.rain)} mm, ${Math.round(m.tmin)}–${Math.round(m.tmax)} °C` }, h("i", { style: `height:${Math.min(100, m.rain / 3)}%` }), h("small", {}, MONTHS[i][0])))) : "",
    lines(
      cl ? `${Math.round(cl.annualRain)} mm of rain a year${cl.wetMonths.length ? `; wet ${cl.wetMonths.map((m) => MONTHS[m]).join(", ")}` : ", no month over 100 mm"}. Monthly means from ${Math.round(cl.coldest)} °C to ${Math.round(cl.hottest)} °C.` : "",
      x.grid ? `Nearest large power station: ${x.grid.plant.name} (${fmt(x.grid.plant.mw)} MW, ${x.grid.plant.fuel.toLowerCase()}), ${kmText(x.grid.km)}.` : "",
      x.port ? `Nearest port: ${x.port.name}, ${kmText(x.port.km)}.` : "", x.airport ? `Nearest airport: ${x.airport.name} (${x.airport.iata}), ${kmText(x.airport.km)}.` : "",
      `Battery-electric: ${x.electric.reasons.join("; ")}.`,
      x.conflict ? "⚠️ 3TG in a Dodd-Frank covered country: conflict-minerals due diligence applies." : ""));
}

function accountBrief(c: Company, a: Account, trips: { name: string; trip: { hours: number; how: string } }[]) {
  const t = today(), x = conds.get(a.id), ms = c.assets.filter((m) => m.account === a.id);
  printReport(`${a.site}: visit brief`, `${a.name} · ${[a.country, commodity(a.commodity ?? "")?.name, a.method].filter(Boolean).join(" · ")} · ${t}`, [
    { heading: "The site", lines: x ? [`${fmt(x.alt)} m; air ${Math.round(x.density * 100)}% of sea level; diesel derating about ${Math.round(x.derate)}%.`,
      x.climate ? `Monthly means ${Math.round(x.climate.coldest)} to ${Math.round(x.climate.hottest)} °C; records ${Math.round(x.climate.recordLow)} to ${Math.round(x.climate.recordHigh)} °C; ${Math.round(x.climate.annualRain)} mm a year${x.climate.wetMonths.length ? `, wet ${x.climate.wetMonths.map((m) => MONTHS[m]).join(", ")}` : ""}.` : "",
      x.grid ? `Grid: ${x.grid.plant.name}, ${fmt(x.grid.plant.mw)} MW, ${kmText(x.grid.km)}.` : "", `Battery-electric readiness ${x.electric.score}: ${x.electric.reasons.join("; ")}.`].filter(Boolean) : ["Conditions not loaded."] },
    { heading: "Our machines", table: { head: ["Machine", "Serial", "Hours", "Next service", "Status"], rows: ms.map((m) => { const d = serviceDue(m, t); return [m.type, m.serial, fmt(hoursNow(m, t)), d.overdue ? `${fmt(-d.hoursLeft)} h overdue` : `in ${fmt(d.hoursLeft)} h`, m.status]; }) } },
    { heading: "Open jobs", lines: c.jobs.filter((j) => j.account === a.id && j.status !== "done").map((j) => `${j.kind} (opened ${j.opened})${j.notes ? `: ${j.notes}` : ""}`) },
    { heading: "Deals", lines: c.opps.filter((o) => o.account === a.id && o.stage !== "lost").map((o) => `${o.product}: ${o.stage}, ${usd(o.value)}, closes ${o.close}`) },
    { heading: "Getting there", lines: trips.map((p) => `${p.name}: ${hoursText(p.trip.hours)} (${p.trip.how})`) },
    { heading: "People", lines: (a.contacts ?? []).map((p) => [p.name, p.role, p.email, p.phone].filter(Boolean).join(" · ")) },
  ]);
}

// ---- Reports and imports ---------------------------------------------------------------------------

function serviceReport(c: Company) {
  const t = today(), fh = fleetHealth(c, t), q = jobQueue(c, t), pl = pipeline(c.opps), cov = airports.length ? coverage(c, airports, wet) : [];
  const site = (id: string) => c.accounts.find((a) => a.id === id)?.site ?? "";
  printReport(`${c.name}: monthly report`, t, [
    { heading: "At a glance", kpis: [[`${Math.round(fh.availability * 100)}%`, "fleet running"], [String(q.length), "open jobs"], [String(fh.overdue.length), "services overdue"], [usd(pl.weighted), "weighted pipeline"]] },
    { heading: "Down and overdue", table: { head: ["Site", "Machine", "Status", "Next service"], rows: [...fh.down, ...fh.overdue].map((r) => [site(r.a.account), `${r.a.type} ${r.a.serial}`, r.a.status, r.due.overdue ? `${fmt(-r.due.hoursLeft)} h overdue` : `in ${fmt(r.due.hoursLeft)} h`]) } },
    { heading: "Open jobs", table: { head: ["Site", "Kind", "Priority", "Days open", "Technician"], rows: q.map(({ j, age }) => [site(j.account), j.kind, j.priority, age, c.techs.find((x) => x.id === j.tech)?.name ?? "—"]) } },
    { heading: "Response coverage", table: { head: ["Site", "From", "Hours", "Promised", "How"], rows: cov.map((r) => [r.a.site, r.from ?? "", r.trip ? Math.round(r.trip.hours) : "—", r.sla, r.trip?.how ?? ""]) } },
    { heading: "Sales triggers", lines: [...fh.warrantyEnding.map((r) => `Warranty ends ${r.a.warrantyUntil}: ${r.a.type} ${r.a.serial} at ${site(r.a.account)}`), ...fh.replaceSoon.map((r) => `End of life in ${r.life!.years.toFixed(1)} years: ${r.a.type} ${r.a.serial} at ${site(r.a.account)}`)] },
    { heading: "Pipeline", table: { head: ["Stage", "Deals", "Value"], rows: pl.stages.map((s) => [s.stage, s.n, usd(s.value)]) } },
  ]);
}

function importScreen(ctx: WorkCtx, c: Company) {
  ctx.show("Import", () => openServices(ctx),
    h("p", {}, "Bring in what you already have. Column names are matched loosely; the usual exports from a CRM, an ERP or a fleet-telemetry system work."),
    h("button", { class: "pill-btn", onclick: () => void importAccounts(ctx, c) }, "Customer sites (name, site, latitude, longitude, country, commodity)"),
    h("button", { class: "pill-btn", onclick: () => void importAssets(ctx, c) }, "Machines (site, type, model, serial, hours, date, service interval, last service)"),
    h("button", { class: "pill-btn", onclick: () => downloadCsv(`${c.name} fleet ${today()}`, ["site", "type", "model", "serial", "hours", "per day", "service every", "last service", "status", "warranty until"], c.assets.map((a) => [c.accounts.find((x) => x.id === a.account)?.site, a.type, a.model, a.serial, Math.round(hoursNow(a, today())), a.perDay, a.serviceEvery, a.lastService, a.status, a.warrantyUntil])) }, "Export the fleet"));
}

const col = (r: Record<string, string>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(r)) if (k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "") && r[k]) return r[k]; return ""; };

async function importAccounts(ctx: WorkCtx, c: Company) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  let n = 0;
  for (const r of parseCsv(text)) {
    const site = col(r, "site", "mine", "location"), name = col(r, "name", "customer", "account", "company") || site;
    let lat = Number(col(r, "latitude", "lat")), lon = Number(col(r, "longitude", "lon", "lng"));
    if (!site) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) { const [g] = await geocode(`${site} ${col(r, "country")}`).catch(() => []); if (!g) continue; lat = g.lat; lon = g.lon; }
    c.accounts.push({ id: newId(), name, site, lat, lon, country: col(r, "country") || undefined, commodity: col(r, "commodity", "product").toLowerCase() || undefined, method: col(r, "method", "mining method") || undefined });
    n++;
  }
  save(c); loading = false; ctx.app.toast(`${n} sites added.`, 3000); openServices(ctx);
}

async function importAssets(ctx: WorkCtx, c: Company) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  let n = 0, skipped = 0;
  for (const r of parseCsv(text)) {
    const site = col(r, "site", "mine", "customer", "account", "location").toLowerCase();
    const a = c.accounts.find((x) => x.site.toLowerCase() === site || x.name.toLowerCase() === site || x.site.toLowerCase().startsWith(site));
    if (!a) { skipped++; continue; }
    const hours = Number(col(r, "hours", "engine hours", "smu", "run hours")) || 0;
    c.assets.push({ id: newId(), account: a.id, type: col(r, "type", "machine type", "category") || "Machine", model: col(r, "model"), serial: col(r, "serial", "serial number", "sn") || newId().slice(0, 6),
      installed: col(r, "installed", "commissioned") || today(), hours, asOf: (col(r, "date", "reading date", "as of") || today()).slice(0, 10), perDay: Number(col(r, "per day", "hours per day", "utilisation")) || 18,
      serviceEvery: Number(col(r, "service every", "service interval", "interval")) || 500, lastService: Number(col(r, "last service", "last service hours")) || hours, lifeHours: Number(col(r, "life", "design life")) || undefined,
      warrantyUntil: col(r, "warranty", "warranty until") || undefined, status: /down|broken/i.test(col(r, "status")) ? "down" : /standby|idle/i.test(col(r, "status")) ? "standby" : "running" });
    n++;
  }
  save(c); ctx.app.toast(`${n} machines added${skipped ? `; ${skipped} rows skipped (site not found: add the site first)` : ""}.`, 4500); openServices(ctx);
}

function accountAdder(ctx: WorkCtx, c: Company) {
  const box = h("input", { class: "pro-url", placeholder: "Add a customer site: a mine from the list, or an address", list: "fn-mines" }) as HTMLInputElement;
  const dl = h("datalist", { id: "fn-mines" }, ...(mines ?? []).slice(0, 400).map((m) => h("option", { value: m.name })));
  const add = async () => {
    const q = box.value.trim();
    if (!q) return;
    const m = (mines ?? []).find((x) => x.name.toLowerCase() === q.toLowerCase());
    const g = m ?? await geocode(q).then(([r]) => (r ? { name: q, lon: r.lon, lat: r.lat } : null)).catch(() => null);
    if (!g) { ctx.app.toast("Couldn't find that site.", 3000); return; }
    c.accounts.push({ id: newId(), name: m?.operator ?? `${g.name} customer`, site: g.name, lon: g.lon, lat: g.lat, country: m?.country, commodity: m?.commodities[0], method: m?.method });
    save(c); loading = false; openServices(ctx);
  };
  return h("div", { class: "po-add" }, box, dl, h("button", { class: "pill-btn", onclick: () => void add() }, "Add"));
}
