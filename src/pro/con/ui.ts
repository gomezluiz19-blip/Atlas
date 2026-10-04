// Construction Pro's screens: one region's construction for every side of it.
// The sites rise on the globe floor by floor (grey frame, brick or glass as the
// facade goes on, blue as it's fitted out, ghosts for floors still to come,
// cranes on the ones going up) and a time slider plays the region's year.
// Contractor: your jobs, ahead or behind, crews and safety. Union: which sites
// need your craft now and soon, who's signatory, visits, safety, and today's
// route with turn-by-turn directions. Supplier: what the region will need
// month by month and which sites to call. Planner: the pipeline, live NYC DOB
// permits, and your own lists.
import type { App } from "../../app";
import { Massing, type MassBuilding } from "../../enterprise/massing";
import { h } from "../../ui/dom";
import { loadJson, saveJson } from "../../util/storage";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { WorkLayer, type WorkFeature } from "../../work/layer";
import { openDataImporter } from "../kit/opendata";
import { teamCard, teamSync } from "../kit/team";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { kpis, list, row, title } from "../kit/ui";
import { demoRegion } from "./demo";
import {
  addDays, daysBetween, demand, directionsUrl, floorsUp, fromDobPermits, isoDay, MATERIALS, masonryEstimate, peakWorkers, pipeline, routePlan, sitesFromCsv, sitesFromRows, STAGE_COLOR, STAGES, stageAt, stageDates,
  tradeWindows, unionFlags, variance, windowsFor, type Flag, type Kind, type Material, type SafetyNote, type Site, type Stage, type UnionStatus,
} from "./model";

type Role = "contractor" | "union" | "supplier" | "planner";
interface Region { name: string; sites: Site[]; role: Role; craft: string; base: { name: string; lon: number; lat: number }; demo?: boolean }
const KEY = "atlas.pro.con.v1";
const load = () => loadJson<Region | null>(KEY, null, (v) => !!v && Array.isArray((v as Region).sites));
const save = (r: Region) => saveJson(KEY, r);

const ROLES: [Role, string, string][] = [["contractor", "Contractor", "🦺"], ["union", "Union", "✊"], ["supplier", "Supplier", "🚚"], ["planner", "Planner", "📐"]];
const CRAFTS = ["Bricklayers", "Ironworkers", "Carpenters", "Concrete / cement masons", "Electricians", "Plumbers & pipefitters", "Sheet metal workers", "Glaziers", "Roofers", "Operating engineers", "Laborers", "Painters", "Elevator constructors"];
const UNION_COLOR: Record<UnionStatus, string> = { union: "#30d158", mixed: "#ff9f0a", "open shop": "#ff453a", unknown: "#8e8e93" };
const UNION_LABEL: Record<UnionStatus, string> = { union: "Union", mixed: "Mixed", "open shop": "Open shop", unknown: "Unknown" };
const FACADE: Record<NonNullable<Site["masonry"]>, string> = { brick: "#b4533a", block: "#a8a39a", stone: "#d6c7a4", none: "#7fb4d6" };
const FRAME = "#c7c7cc", FITTED = "#64d2ff";
const usd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e8 ? `$${Math.round(n / 1e6)}M` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const DOB = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json";

let mass: Massing | null = null, route: WorkLayer | null = null;

export function openConstruction(ctx: WorkCtx, app: App, role?: string) {
  mass ??= new Massing(app, "con:sites", "Construction sites", "#ff9f0a", "🏗️");
  route ??= new WorkLayer(app, "con:route", "Site visits", "#0a84ff");
  const today = isoDay();
  let R = load();
  if (R && ROLES.some(([id]) => id === role)) R.role = role as Role;
  let day = today;
  let playing = 0;

  // Shared with the team when this workspace is linked (pro/kit/team.ts); otherwise only on this device.
  const bound = { title: () => R?.name ?? "Region", get: () => R, set: (b: unknown) => { R = b as Region; save(R!); }, reload: () => home() };
  const sync = teamSync(app, KEY, bound);
  const persist = () => { if (R) { save(R); sync.changed(); } };
  const stop = () => { if (playing) cancelAnimationFrame(playing); playing = 0; };
  const leave = () => { stop(); mass?.clear(); route?.clear(); ctx.home(); };

  /** What a role cares about on a site, for the pulse on the globe. */
  function alertOf(s: Site): string | undefined {
    if (!R) return;
    if (R.role === "union") return unionFlags(s, day, R.craft).some((f) => f.level === "now") ? "#ff453a" : undefined;
    if (R.role === "contractor") return s.mine && (variance(s, day) <= -2 || s.safety.some((x) => daysBetween(x.date, day) <= 30)) ? "#ff453a" : undefined;
    if (R.role === "supplier") { const st = stageAt(s, day); return st.status === "under way" && ["foundation", "structure", "envelope"].includes(st.stage) ? "#ffcc00" : undefined; }
    return s.start > day && daysBetween(day, s.start) <= 120 ? "#bf5af2" : undefined;
  }

  /** Each site's dot from far out: union status for the union, the stage for everyone else. */
  function dotOf(s: Site): string {
    if (R!.role === "union") return UNION_COLOR[s.union];
    const st = stageAt(s, day);
    return st.status === "not started" ? "#bf5af2" : st.status === "done" ? "#5e5ce6" : STAGE_COLOR[st.stage];
  }

  /** The region on the globe as it stands on `day`. */
  function draw(focus?: Site, rise = true) {
    if (!R) return;
    const bs: MassBuilding[] = R.sites.map((s) => {
      const up = floorsUp(s, day), st = stageAt(s, day), done = st.status === "done";
      const facade = FACADE[s.masonry ?? "none"];
      const built = done ? s.stories : up.built;
      return {
        id: s.id, lon: s.lon, lat: s.lat, w: s.footprint.w, d: s.footprint.d, bearing: s.footprint.bearing, floors: Math.max(1, s.stories), floorH: s.kind === "civil" ? 2.5 : 3.4,
        floorColor: (i) => done || i < up.fitted ? (s.masonry === "none" ? FITTED : facade) : i < up.clad ? facade : FRAME,
        ghostFrom: done ? undefined : built,
        label: focus ? (focus.id === s.id ? s.name : undefined) : R!.role === "contractor" && !s.mine ? undefined : s.name,
        pulse: alertOf(s),
        crane: !done && (st.stage === "structure" || st.stage === "envelope") && s.stories >= 4,
        dot: focus ? undefined : dotOf(s),
        onTap: () => sitePage(s),
      };
    });
    mass!.draw(bs, R.name, rise);
  }

  function frameRegion() {
    if (!R?.sites.length) return;
    const lons = R.sites.map((s) => s.lon), lats = R.sites.map((s) => s.lat);
    void flyToPlace(app.globe, { name: R.name, lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, radius: Math.max(1500, Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) * 62_000) });
  }

  // ---- No region yet ----
  function start() {
    mass!.clear(); route!.clear();
    ctx.show("Construction Pro", leave,
      h("p", { class: "mp-intro" }, "Every site in your region, rising on the map: what stage each is at, the trades it needs and when, who's signatory, the bricks and crews a facade takes, what the region will buy month by month, and the jobs coming next. For contractors in the trailer, organizers and business agents, suppliers and planners."),
      h("div", { class: "con-roles start" }, ...ROLES.map(([id, label, emoji]) => h("button", { class: "con-role-card", onclick: () => { R = { name: "DMV construction (demo)", sites: demoRegion(today), role: id, craft: "Bricklayers", base: { name: "Union hall (demo), Lanham MD", lon: -76.8619, lat: 38.9687 }, demo: true }; persist(); home(); } },
        h("span", {}, emoji), h("strong", {}, label), h("small", {}, id === "contractor" ? "Your jobs, schedule, crews, safety" : id === "union" ? "Sites needing your craft, signatories, today's route" : id === "supplier" ? "Material demand and who to call" : "Pipeline, permits and starts")))),
      h("p", { class: "fineprint" }, "Opens a demo region of two dozen made-up sites around DC, Maryland and Virginia. Every company name and union status in it is invented. Then bring your own: NYC DOB permits live, a CSV, or sites by address."));
  }

  // ---- The region ----
  function home() {
    if (!R) return start();
    stop();
    route!.clear();
    draw();
    frameRegion();
    const body = h("div", { class: "con-body" });
    const roles = h("div", { class: "segmented con-tabs", role: "tablist" }, ...ROLES.map(([id, label, emoji]) => h("button", { role: "tab", "aria-selected": String(id === R!.role), onclick: (e: Event) => {
      R!.role = id; persist(); roles.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); draw(undefined, false); render();
    } }, `${emoji} ${label}`)));
    function render() { body.replaceChildren(...(R!.role === "union" ? union() : R!.role === "contractor" ? contractor() : R!.role === "supplier" ? supplier() : planner())); }
    render();
    ctx.show(R.name, leave,
      R.demo ? h("p", { class: "con-demo" }, "Demo region: invented sites, companies and union statuses around the DMV.") : "",
      roles, timeMachine(() => render()), legend(), body,
      h("div", { class: "edu-actions" },
        h("button", { class: "pill-btn", onclick: () => regionReport() }, "Print the region report"),
        h("button", { class: "pill-btn", onclick: () => downloadCsv("sites.csv", ["Site", "Address", "Kind", "Stories", "Value", "Owner", "GC", "Start", "Finish", "Stage", "Union", "Lat", "Lon"], R!.sites.map((s) => [s.name, s.address, s.kind, s.stories, s.value, s.owner, s.gc, s.start, s.finish, stageAt(s, today).stage, s.union, s.lat, s.lon])) }, "Sites CSV"),
        R.demo && !sync.link ? h("button", { class: "link-btn danger", onclick: () => { localStorage.removeItem(KEY); R = null; start(); } }, "Remove the demo") : ""),
      teamCard(app, sync, bound));
  }

  /** Scrub or play the region a year back and two years ahead. */
  function timeMachine(after: () => void) {
    const min = -365, max = 730;
    const label = h("strong", {}, day === today ? "Today" : new Date(day).toLocaleDateString(undefined, { month: "short", year: "numeric" }));
    const slider = h("input", { type: "range", min: String(min), max: String(max), step: "7", value: String(daysBetween(today, day)), "aria-label": "Date" }) as HTMLInputElement;
    let t = 0;
    const set = (n: number, rest = false) => {
      day = addDays(today, n);
      label.textContent = n === 0 ? "Today" : new Date(day).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      draw(undefined, false);
      clearTimeout(t); if (rest) t = window.setTimeout(after, 150);
    };
    slider.addEventListener("input", () => set(Number(slider.value), true));
    const play = h("button", { class: "pill-btn", onclick: () => {
      if (playing) { stop(); play.textContent = "▶ Play"; after(); return; }
      let n = Number(slider.value) >= max ? min : Number(slider.value), last = 0;
      play.textContent = "❚❚ Pause";
      const step = (ts: number) => {
        if (ts - last > 90) { last = ts; n += 14; slider.value = String(n); set(n); }
        if (n >= max) { stop(); play.textContent = "▶ Play"; after(); return; }
        playing = requestAnimationFrame(step);
      };
      playing = requestAnimationFrame(step);
    } }, "▶ Play");
    return h("div", { class: "con-time" }, h("div", { class: "con-time-head" }, h("span", {}, "The region on "), label, play,
      h("button", { class: "link-btn", onclick: () => { stop(); play.textContent = "▶ Play"; slider.value = "0"; set(0); after(); } }, "Today")), slider,
      h("div", { class: "con-time-ends" }, h("small", {}, "A year ago"), h("small", {}, "Two years ahead")));
  }

  const legend = () => h("div", { class: "edu-legend" }, ...[["Frame", FRAME], ["Brick", FACADE.brick], ["Stone", FACADE.stone], ["Glass", FACADE.none], ["Fitted out", FITTED]].map(([t, c]) => h("span", { style: `--c:${c}` }, h("i", {}), t)), h("span", { class: "con-ghost" }, h("i", {}), "Still to build"));

  // ---- Union: organizers and business agents ----
  function union(): (HTMLElement | string)[] {
    const craft = h("select", { class: "pro-url", "aria-label": "Your craft" }, ...CRAFTS.map((c) => h("option", { value: c, selected: c === R!.craft }, c))) as HTMLSelectElement;
    craft.addEventListener("change", () => { R!.craft = craft.value; persist(); draw(undefined, false); home(); });
    const rows = R!.sites.map((s) => ({ s, f: unionFlags(s, day, R!.craft), win: windowsFor(s, R!.craft) })).filter((x) => x.win.length && x.win[x.win.length - 1].end >= day);
    const until = (x: (typeof rows)[number]) => { const w = x.win.find((y) => y.end >= day); return w ? daysBetween(day, w.start) : Infinity; };
    const now = rows.filter((x) => until(x) <= 0);
    const soon = rows.filter((x) => until(x) > 0 && until(x) <= 90);
    const brick = R!.craft === "Bricklayers";
    const upcomingDays = brick ? rows.filter((x) => x.s.masonry !== "none").reduce((a, x) => a + masonryEstimate(x.s).masonDays, 0) : 0;
    const order = (xs: typeof rows) => xs.sort((a, b) => ["now", "soon", "fyi"].indexOf(a.f[0]?.level ?? "fyi") - ["now", "soon", "fyi"].indexOf(b.f[0]?.level ?? "fyi") || a.s.name.localeCompare(b.s.name));
    const siteRow = (x: (typeof rows)[number]) => { const { s, f } = x; return row({ color: UNION_COLOR[s.union] }, s.name, `${UNION_LABEL[s.union]} · ${stageAt(s, day).stage} · ${f[0]?.text ?? "nothing pressing"}`, () => sitePage(s), h("span", { class: `con-badge ${until(x) <= 0 ? "now" : until(x) <= 90 ? "soon" : ""}` }, until(x) <= 0 ? "Now" : until(x) <= 90 ? `${until(x)} d` : "—")) };
    const baseIn = h("input", { class: "pro-url", value: R!.base.name, "aria-label": "Starting from" }) as HTMLInputElement;
    const out = h("div", { class: "con-route" });
    const plan = (sites: Site[]) => {
      if (!sites.length) { out.replaceChildren(h("p", { class: "muted small" }, "No sites to visit.")); return; }
      const p = routePlan(sites.slice(0, 9), R!.base);
      const feats: WorkFeature[] = [{ id: "route", kind: "line", pts: [[R!.base.lon, R!.base.lat], ...p.order.map((s) => [s.lon, s.lat] as [number, number])], color: "#0a84ff", solid: true },
        { id: "base", kind: "point", pts: [[R!.base.lon, R!.base.lat]], color: "#0a84ff", label: "Start" }];
      route!.set(feats, "Today's site visits");
      out.replaceChildren(
        h("p", { class: "ec-note" }, `${p.order.length} sites · about ${p.km} km · ${Math.floor(p.minutes / 60)} h ${p.minutes % 60} min with 25 minutes at each gate.`),
        h("ol", { class: "con-stops" }, ...p.order.map((s) => h("li", {}, h("button", { class: "link-btn", onclick: () => sitePage(s) }, s.name), h("small", {}, ` ${s.address}`)))),
        h("a", { class: "primary-btn", href: directionsUrl(R!.base, p.order), target: "_blank", rel: "noopener" }, "Open turn-by-turn directions"));
    };
    return [
      h("div", { class: "con-craft" }, h("span", {}, "Your craft"), craft),
      kpis([String(now.length), "need you now", now.length > 0], [String(soon.length), "in the next 90 days"], [String(rows.filter((x) => x.s.union !== "union").length), "not fully union"],
        brick ? [upcomingDays.toLocaleString(), "mason-days of facade ahead"] : [String(rows.length), "sites with your work"]),
      h("div", { class: "edu-legend" }, ...(Object.keys(UNION_COLOR) as UnionStatus[]).map((u) => h("span", { style: `--c:${UNION_COLOR[u]}` }, h("i", {}), UNION_LABEL[u]))),
      title(`Needs ${R!.craft.toLowerCase()} now`),
      now.length ? list(...order(now).map(siteRow)) : h("p", { class: "muted small" }, "Nothing this week."),
      title("Coming up"),
      soon.length ? list(...order(soon).map(siteRow)) : h("p", { class: "muted small" }, "Nothing in the next 90 days."),
      title("Today's route"),
      h("div", { class: "edu-form" }, h("div", { class: "pf-add con-base" }, baseIn, h("button", { class: "pill-btn", onclick: async () => {
        const g = (await geocode(baseIn.value).catch(() => []))[0];
        if (g) { R!.base = { name: baseIn.value, lon: g.lon, lat: g.lat }; persist(); app.toast(`Starting from ${g.name}`); } else app.toast("Couldn't find that place.");
      } }, "Set start")),
        h("div", { class: "edu-actions" },
          h("button", { class: "pill-btn", onclick: () => plan(order(now).map((x) => x.s)) }, "Sites that need us now"),
          h("button", { class: "pill-btn", onclick: () => plan(rows.filter((x) => x.f.some((f) => /visit|Never/.test(f.text))).map((x) => x.s)) }, "Not visited in 30 days"),
          h("button", { class: "pill-btn", onclick: () => plan(rows.filter((x) => x.s.union !== "union").map((x) => x.s)) }, "Non-union sites")), out),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${R!.craft.toLowerCase().replace(/\W+/g, "-")}-sites.csv`, ["Site", "Address", "Union", "Stage", "Window from", "Window to", "GC", "Flags", "Last visit"], rows.map(({ s, f, win }) => [s.name, s.address, s.union, stageAt(s, day).stage, win[0].start, win[win.length - 1].end, s.gc, f.map((x) => x.text).join("; "), s.visits[s.visits.length - 1]?.date ?? ""])) }, "Export for the hall (CSV)"),
    ];
  }

  // ---- Contractor: the trailer ----
  function contractor(): (HTMLElement | string)[] {
    const mine = R!.sites.filter((s) => s.mine);
    if (!mine.length) return [h("p", { class: "muted small" }, "None of these sites are marked as yours. Open a site and tap \"This is our job\"."), list(...R!.sites.slice(0, 8).map((s) => row({ color: STAGE_COLOR[stageAt(s, day).stage] }, s.name, `${s.gc} · ${stageAt(s, day).stage}`, () => sitePage(s))))];
    const active = mine.filter((s) => stageAt(s, day).status === "under way");
    const crews = active.reduce((a, s) => a + peakWorkers(s), 0);
    const behind = mine.filter((s) => variance(s, day) <= -2);
    const safety = mine.flatMap((s) => s.safety.filter((x) => daysBetween(x.date, day) <= 60).map((x) => ({ s, x })));
    return [
      kpis([String(active.length), "jobs under way"], [usd(mine.reduce((a, s) => a + s.value, 0)), "contract value"], [String(crews), "on site at peak"], [String(behind.length), "behind by 2+ weeks", behind.length > 0], [String(safety.length), "safety notes, 60 days", safety.length > 0]),
      title("Our jobs"),
      ...mine.map((s) => {
        const st = stageAt(s, day), v = variance(s, day), up = floorsUp(s, day);
        return h("button", { class: "con-job", onclick: () => sitePage(s) },
          h("div", { class: "con-job-head" }, h("strong", {}, s.name), h("span", { class: `con-var ${v <= -2 ? "bad" : v >= 1 ? "good" : ""}` }, v === 0 ? "On plan" : v > 0 ? `${v} wk ahead` : `${-v} wk behind`)),
          stageStrip(s), h("small", {}, `${cap(st.stage)} · ${Math.round(st.overall * 100)}% · ${up.built}/${s.stories} floors up · ${peakWorkers(s)} workers · finish ${s.finish}`));
      }),
      safety.length ? h("div", {}, title("Safety"), list(...safety.map(({ s, x }) => row({ color: x.kind === "stop-work order" || x.kind === "incident" ? "#ff453a" : "#ff9f0a" }, `${cap(x.kind)} · ${s.name}`, `${x.date} · ${x.text}`, () => sitePage(s))))) : "",
      h("div", { class: "edu-actions" }, h("button", { class: "pill-btn", onclick: () => app.actions.get("work:buildpro")?.run() }, "Daily logs, RFIs and punch lists in Build Pro"),
        h("button", { class: "pill-btn", onclick: () => printReport("Our jobs", `${R!.name} · ${day}`, [
          { heading: "Portfolio", kpis: [[String(active.length), "under way"], [usd(mine.reduce((a, s) => a + s.value, 0)), "value"], [String(crews), "workers at peak"], [String(behind.length), "behind"]] },
          { heading: "Jobs", table: { head: ["Job", "Stage", "Done", "Variance (wk)", "Floors up", "Finish"], rows: mine.map((s) => [s.name, stageAt(s, day).stage, `${Math.round(stageAt(s, day).overall * 100)}%`, variance(s, day), `${floorsUp(s, day).built}/${s.stories}`, s.finish]) } },
          { heading: "Safety, 60 days", lines: safety.map(({ s, x }) => `${x.date} · ${s.name} · ${x.kind}: ${x.text}`) },
        ]) }, "Print for the owner's meeting")),
    ];
  }

  // ---- Supplier and services ----
  function supplier(): (HTMLElement | string)[] {
    let mat: Material = "brick";
    const box = h("div", { class: "con-body" });
    const d = demand(R!.sites, day, 6);
    const tabs = h("div", { class: "segmented con-tabs", role: "tablist", "aria-label": "Material" }, ...(Object.keys(MATERIALS) as Material[]).map((m) => h("button", { role: "tab", "aria-selected": String(m === mat), onclick: (e: Event) => { mat = m; tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); paint(); } }, MATERIALS[m].label)));
    function paint() {
      const tot = d.totals[mat], max = Math.max(1, ...tot), unit = MATERIALS[mat].unit;
      const leads = d.bySite.filter((x) => x.m === mat).sort((a, b) => b.qty - a.qty);
      box.replaceChildren(
        kpis([tot.reduce((a, b) => a + b, 0).toLocaleString(), `${unit}, next 6 months`], [String(leads.length), "sites buying"], [tot[0].toLocaleString(), `${unit} this month`]),
        h("div", { class: "con-bars" }, ...d.months.map((m, i) => h("div", { class: "con-bar" }, h("small", {}, tot[i].toLocaleString()), h("i", { style: `height:${(tot[i] / max) * 100}%` }), h("span", {}, new Date(`${m}-15`).toLocaleDateString(undefined, { month: "short" }))))),
        title("Who to call"),
        leads.length ? list(...leads.slice(0, 12).map((x) => row({ color: STAGE_COLOR[stageAt(x.s, day).stage] }, x.s.name, `${x.qty.toLocaleString()} ${unit} from ${x.when} · ${x.s.gc} · ${kmFromBase(x.s)} km from your yard`, () => sitePage(x.s)))) : h("p", { class: "muted small" }, "No site needs this in the next six months."),
        h("button", { class: "pill-btn", onclick: () => downloadCsv(`${mat}-leads.csv`, ["Site", "Address", "Quantity", "Unit", "From", "GC", "Owner", "Lat", "Lon"], leads.map((x) => [x.s.name, x.s.address, x.qty, unit, x.when, x.s.gc, x.s.owner, x.s.lat, x.s.lon])) }, "Leads CSV"));
    }
    paint();
    return [h("p", { class: "ec-note" }, "Rules of thumb per square metre of floor and facade, spread over the stages that use each material. Sites pulsing yellow are in foundation, frame or facade now."), tabs, box,
      h("button", { class: "pill-btn", onclick: () => app.actions.get("work:services:construction")?.run() }, "Plant hire and services network")];
  }
  const kmFromBase = (s: Site) => Math.round(Math.hypot((s.lon - R!.base.lon) * 86.6, (s.lat - R!.base.lat) * 110.6));

  // ---- Planner ----
  function planner(): (HTMLElement | string)[] {
    const p = pipeline(R!.sites, day);
    const keys: (Stage | "not started" | "done")[] = ["not started", ...STAGES, "done"];
    const maxV = Math.max(1, ...[...p.by.values()].map((x) => x.value));
    const msg = h("p", { class: "muted small" });
    const boro = h("select", { class: "pro-url", "aria-label": "Borough" }, ...["Any borough", "MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "STATEN ISLAND"].map((b) => h("option", { value: b.startsWith("Any") ? "" : b }, cap(b.toLowerCase())))) as HTMLSelectElement;
    const addQ = h("input", { class: "pro-url", placeholder: "Site address", "aria-label": "Address" }) as HTMLInputElement;
    const addN = h("input", { class: "pro-url", placeholder: "Name", "aria-label": "Name" }) as HTMLInputElement;
    const addK = h("select", { class: "pro-url", "aria-label": "Kind" }, ...(["residential", "mixed-use", "commercial", "institutional", "industrial", "civil"] as Kind[]).map((k) => h("option", { value: k }, cap(k)))) as HTMLSelectElement;
    const addF = h("input", { class: "pro-url", type: "number", value: "6", min: "1", max: "120", "aria-label": "Stories" }) as HTMLInputElement;
    const take = (sites: Site[], from: string) => {
      const fresh = sites.filter((s) => !R!.sites.some((x) => x.id === s.id));
      if (R!.demo && fresh.length) { R!.demo = false; R!.name = from === "NYC DOB" ? "New York City permits" : "My region"; R!.sites = []; }
      R!.sites.push(...fresh); persist(); msg.textContent = `Added ${fresh.length} sites from ${from}.`; home();
    };
    return [
      kpis([String(R!.sites.length), "sites"], [usd(p.value), "pipeline value"], [String(p.startingSoon.length), "start in 120 days"], [String(R!.sites.filter((s) => stageAt(s, day).status === "under way").length), "under way"]),
      title("The pipeline by stage"),
      h("div", { class: "con-pipe" }, ...keys.filter((k) => p.by.get(k)).map((k) => { const e = p.by.get(k)!; return h("div", { class: "con-pipe-row" }, h("span", {}, cap(k)), h("span", { class: "con-pipe-bar" }, h("i", { style: `width:${(e.value / maxV) * 100}%;background:${k in STAGE_COLOR ? STAGE_COLOR[k as Stage] : k === "done" ? "#5e5ce6" : "#bf5af2"}` })), h("small", {}, `${e.n} · ${usd(e.value)}`)); })),
      title("Starting soon"),
      p.startingSoon.length ? list(...p.startingSoon.map((s) => row({ color: "#bf5af2" }, s.name, `Starts ${s.start} · ${s.stories} stories · ${usd(s.value)} · ${s.gc}`, () => sitePage(s)))) : h("p", { class: "muted small" }, "Nothing starts in the next 120 days."),
      title("Bring in sites"),
      h("div", { class: "edu-form" },
        h("strong", {}, "New York City: DOB permits, live"),
        h("p", { class: "muted small" }, "New buildings and major alterations from NYC Open Data's DOB Permit Issuance."),
        h("div", { class: "md-two" }, boro, h("button", { class: "pill-btn", onclick: async () => {
          msg.textContent = "Loading permits…";
          const where = `job_type in('NB','A1')${boro.value ? ` AND borough='${boro.value}'` : ""}`;
          try {
            const rows = await fetch(`${DOB}?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(":id DESC")}&$limit=300`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
            const sites = fromDobPermits(rows, today);
            if (!sites.length) { msg.textContent = "No permits came back."; return; }
            take(sites, "NYC DOB");
          } catch { msg.textContent = "Couldn't reach NYC Open Data. Check the connection."; }
        } }, "Load permits")), msg),
      openDataImporter(app, { roles: ["name", "address", "date", "type", "value", "owner", "contractor", "status", "stories"], what: "permits as sites", onImport: (rows, map, label) => take(sitesFromRows(rows, map, today, "import", label), label) }),
      h("div", { class: "edu-form" },
        h("strong", {}, "A spreadsheet"),
        h("p", { class: "muted small" }, "CSV with name, lat, lon and any of: address, stories, start, finish, value, kind, gc, owner, union."),
        h("button", { class: "pill-btn", onclick: async () => { const t = await pickFile(".csv,text/csv"); if (t) take(sitesFromCsv(t, today), "your CSV"); } }, "Import a CSV")),
      h("div", { class: "edu-form" },
        h("strong", {}, "One site"),
        addN, addQ, h("div", { class: "md-two" }, addK, addF),
        h("button", { class: "pill-btn", onclick: async () => {
          const g = (await geocode(addQ.value).catch(() => []))[0];
          if (!g) { app.toast("Couldn't find that address."); return; }
          const stories = Math.max(1, Number(addF.value) || 4);
          take([{ id: `m${Date.now()}`, name: addN.value || g.name, address: addQ.value, lon: g.lon, lat: g.lat, kind: addK.value as Kind, owner: "", gc: "", value: stories * 2_000 * 4_000, stories,
            footprint: { w: 40, d: 28, bearing: 0 }, start: today, finish: addDays(today, 360 + stories * 45), union: "unknown", trades: [], visits: [], safety: [], source: "manual" }], "the address");
        } }, "Add the site")),
    ];
  }

  // ---- A site ----
  function stageStrip(s: Site) {
    const ds = stageDates(s), total = Math.max(1, daysBetween(s.start, s.finish)), at = Math.max(0, Math.min(1, daysBetween(s.start, day) / total));
    return h("div", { class: "con-strip", title: "Stages, start to finish" }, ...ds.map((d) => h("i", { style: `flex:${Math.max(1, daysBetween(d.start, d.end))};background:${STAGE_COLOR[d.stage]}`, title: `${cap(d.stage)}: ${d.start} to ${d.end}` })), h("b", { style: `left:${at * 100}%` }));
  }

  function sitePage(s: Site) {
    if (!R) return;
    stop();
    draw(s, false);
    void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 140 + s.stories * 14 });
    const st = stageAt(s, day), up = floorsUp(s, day), est = masonryEstimate(s);
    const flags: Flag[] = unionFlags(s, day, R.craft);
    const change = () => { persist(); sitePage(s); };
    const wins = tradeWindows(s), t0 = Date.parse(s.start), span = Math.max(1, Date.parse(s.finish) - t0), atX = Math.max(0, Math.min(1, (Date.parse(day) - t0) / span));
    const trades = [...new Set(wins.map((w) => w.trade))];
    const vNote = h("input", { class: "pro-url", placeholder: "What you saw at the gate", "aria-label": "Visit notes" }) as HTMLInputElement;
    const vWorkers = h("input", { class: "pro-url", type: "number", placeholder: "Workers", "aria-label": "Workers on site" }) as HTMLInputElement;
    const vMembers = h("input", { class: "pro-url", type: "number", placeholder: "Members", "aria-label": "Members on site" }) as HTMLInputElement;
    const sKind = h("select", { class: "pro-url", "aria-label": "Kind" }, ...["complaint", "incident", "OSHA inspection", "stop-work order"].map((k) => h("option", { value: k }, cap(k)))) as HTMLSelectElement;
    const sText = h("input", { class: "pro-url", placeholder: "What and where", "aria-label": "Safety note" }) as HTMLInputElement;
    const tName = h("select", { class: "pro-url", "aria-label": "Trade" }, ...CRAFTS.map((c) => h("option", { value: c }, c))) as HTMLSelectElement;
    const tWho = h("input", { class: "pro-url", placeholder: "Contractor", "aria-label": "Contractor" }) as HTMLInputElement;
    const tSig = h("select", { class: "pro-url", "aria-label": "Signatory" }, ...[["unknown", "Signatory?"], ["yes", "Signatory"], ["no", "Non-signatory"]].map(([v, t]) => h("option", { value: v }, t))) as HTMLSelectElement;
    const prog = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(st.overall * 100)), "aria-label": "Progress" }) as HTMLInputElement;
    const progLabel = h("strong", {}, `${Math.round(st.overall * 100)}%`);
    prog.addEventListener("input", () => { s.progress = Number(prog.value) / 100; progLabel.textContent = `${prog.value}%`; draw(s, false); });
    prog.addEventListener("change", () => change());
    const unionSel = h("select", { class: "pro-url", "aria-label": "Union status" }, ...(Object.keys(UNION_LABEL) as UnionStatus[]).map((u) => h("option", { value: u, selected: u === s.union }, UNION_LABEL[u]))) as HTMLSelectElement;
    unionSel.addEventListener("change", () => { s.union = unionSel.value as UnionStatus; change(); });

    ctx.show(s.name, () => home(),
      h("p", { class: "edu-sub" }, `${s.address} · ${cap(s.kind)} · ${s.stories} stor${s.stories === 1 ? "y" : "ies"} · ${usd(s.value)}${s.public ? " · public" : ""}`),
      h("div", { class: "con-who" }, h("span", {}, h("small", {}, "Owner"), s.owner || "—"), h("span", {}, h("small", {}, "General contractor"), s.gc || "—"), h("span", {}, h("small", {}, "Union status"), h("span", {}, h("i", { style: `background:${UNION_COLOR[s.union]}` }), UNION_LABEL[s.union])), s.permit ? h("span", {}, h("small", {}, "Permit"), s.permit) : ""),
      flags.length ? h("div", { class: "edu-flags" }, ...flags.map((f) => h("div", { class: `edu-flag ${f.level}` }, h("i", {}), f.text))) : "",
      h("p", { class: "con-now" }, h("i", { style: `background:${STAGE_COLOR[st.stage]}` }), st.status === "under way" ? `${cap(st.stage)}, ${Math.round(st.within * 100)}% through it` : cap(st.status), s.mine ? ` · ${variance(s, day) === 0 ? "on plan" : variance(s, day) > 0 ? `${variance(s, day)} weeks ahead` : `${-variance(s, day)} weeks behind`}` : ""),
      kpis([`${Math.round(st.overall * 100)}%`, "complete"], [`${up.built}/${s.stories}`, "floors up"], [`${up.clad}`, "floors clad"], [String(peakWorkers(s)), "workers at peak"]),
      stageStrip(s),
      h("div", { class: "con-strip-ends" }, h("small", {}, s.start), h("small", {}, s.finish)),
      title("Trades and when they're on site"),
      h("div", { class: "con-gantt" }, ...trades.map((t) => h("div", { class: `con-g-row ${t.toLowerCase().startsWith(R!.craft.toLowerCase()) ? "mine" : ""}` }, h("span", {}, t),
        h("span", { class: "con-g-track" }, ...wins.filter((w) => w.trade === t).map((w) => h("i", { style: `left:${((Date.parse(w.start) - t0) / span) * 100}%;width:${Math.max(1, ((Date.parse(w.end) - Date.parse(w.start)) / span) * 100)}%;background:${STAGE_COLOR[w.stage]}`, title: `${w.start} to ${w.end}` })), h("b", { style: `left:${atX * 100}%` }))))),
      s.masonry !== "none" ? h("div", {}, title("The masonry"), kpis([`${est.area.toLocaleString()} m²`, `${s.masonry ?? "masonry"} facade`], [`${Math.round(est.bricks / 1000).toLocaleString()}K`, "bricks or block equivalents"], [est.masonDays.toLocaleString(), "mason-days"], [`${est.crewWeeks}`, "weeks for a crew of 8"]),
        h("p", { class: "fineprint" }, "Planning figures: about 60 modular bricks a square metre and 500 laid per mason a day; the masonry share of the facade is typical for this kind of building.")) : "",
      title("Contractors on site"),
      s.trades.length ? list(...s.trades.map((t) => h("div", { class: "edu-person" }, h("div", {}, h("strong", {}, t.contractor), h("small", {}, `${t.trade}${t.workers ? ` · ${t.workers} workers` : ""}`)),
        h("button", { class: `con-sig ${t.signatory}`, onclick: () => { t.signatory = t.signatory === "yes" ? "no" : t.signatory === "no" ? "unknown" : "yes"; change(); } }, t.signatory === "yes" ? "Signatory" : t.signatory === "no" ? "Non-signatory" : "Unknown")))) : h("p", { class: "muted small" }, "None recorded yet."),
      h("div", { class: "edu-form" }, h("div", { class: "md-two" }, tName, tSig), tWho, h("button", { class: "pill-btn", onclick: () => { if (!tWho.value.trim()) return; s.trades.push({ trade: tName.value, contractor: tWho.value.trim(), signatory: tSig.value as never }); change(); } }, "Add a contractor")),
      title("Visits"),
      s.visits.length ? list(...s.visits.slice().reverse().map((v) => h("div", { class: "edu-person" }, h("div", {}, h("strong", {}, `${v.date} · ${v.by}`), h("small", {}, `${v.notes}${v.workers ? ` · ${v.workers} on site` : ""}${v.members !== undefined ? `, ${v.members} members` : ""}`))))) : h("p", { class: "muted small" }, "No visits logged."),
      h("div", { class: "edu-form" }, vNote, h("div", { class: "md-two" }, vWorkers, vMembers), h("button", { class: "pill-btn", onclick: () => { s.visits.push({ date: today, by: "Me", notes: vNote.value.trim() || "Visited", workers: Number(vWorkers.value) || undefined, members: vMembers.value ? Number(vMembers.value) : undefined }); change(); } }, "Log today's visit")),
      title("Safety"),
      s.safety.length ? list(...s.safety.map((x: SafetyNote) => row({ color: x.kind === "stop-work order" || x.kind === "incident" ? "#ff453a" : "#ff9f0a" }, cap(x.kind), `${x.date} · ${x.text}`))) : h("p", { class: "muted small" }, "Nothing recorded."),
      h("div", { class: "edu-form" }, h("div", { class: "md-two" }, sKind, sText), h("button", { class: "pill-btn", onclick: () => { if (!sText.value.trim()) return; s.safety.unshift({ date: today, kind: sKind.value as SafetyNote["kind"], text: sText.value.trim() }); change(); } }, "Add a safety note"),
        h("a", { class: "link-btn", href: "https://www.osha.gov/workers/file-complaint", target: "_blank", rel: "noopener" }, "File a complaint with OSHA")),
      title("Update"),
      h("div", { class: "edu-form" }, h("div", { class: "con-prog" }, h("span", {}, "Progress"), prog, progLabel), h("div", { class: "con-prog" }, h("span", {}, "Union status"), unionSel),
        h("button", { class: "pill-btn", onclick: () => { s.mine = !s.mine; change(); } }, s.mine ? "Not our job" : "This is our job")),
      h("div", { class: "edu-actions" },
        h("a", { class: "pill-btn", href: directionsUrl(R.base, [s]), target: "_blank", rel: "noopener" }, "Directions"),
        h("a", { class: "pill-btn", href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.lat},${s.lon}`, target: "_blank", rel: "noopener" }, "Street view"),
        h("button", { class: "link-btn danger", onclick: () => { R!.sites = R!.sites.filter((x) => x !== s); persist(); home(); } }, "Remove the site")));
  }

  function regionReport() {
    const p = pipeline(R!.sites, day), d = demand(R!.sites, day, 6);
    printReport(R!.name, `Region report · ${day}`, [
      { heading: "The region", kpis: [[String(R!.sites.length), "sites"], [usd(p.value), "pipeline"], [String(p.startingSoon.length), "starting in 120 days"], [String(R!.sites.filter((s) => s.union === "union").length), "union sites"]] },
      { heading: "Sites", table: { head: ["Site", "Stage", "Done", "Stories", "Value", "GC", "Union"], rows: R!.sites.map((s) => [s.name, stageAt(s, day).stage, `${Math.round(stageAt(s, day).overall * 100)}%`, s.stories, usd(s.value), s.gc, s.union]) } },
      { heading: `${R!.craft}: needed now`, lines: R!.sites.filter((s) => unionFlags(s, day, R!.craft).some((f) => f.level === "now")).map((s) => `${s.name}: ${unionFlags(s, day, R!.craft)[0].text}`) },
      { heading: "Materials, next 6 months", table: { head: ["Material", ...d.months], rows: (Object.keys(MATERIALS) as Material[]).map((m) => [`${MATERIALS[m].label} (${MATERIALS[m].unit})`, ...d.totals[m]]) } },
    ], "Made with Terreno. Demo figures are rules of thumb.");
  }

  if (R) home(); else start();
}
