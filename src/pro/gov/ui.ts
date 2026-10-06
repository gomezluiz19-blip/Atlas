// City Ops: a city government's whole estate on the globe. Every facility as a
// glowing floor-by-floor model in its agency's colour (or its condition),
// closed ones pulsing; capital projects rising with ghost floors still to
// build; live incidents throbbing on the map; a day of 311 as a heat map you
// can play hour by hour; coverage gaps where a service is thin. Mayor's desk
// (the morning brief and the whole city at a glance), each agency (people,
// facilities, condition, repairs, coverage), capital projects, 311, and bids
// for vendors. Links out to Politics Pro for elected offices and Field Ops
// for community organisations.
import { CallbackProperty, Cartesian3, Color, ColorMaterialProperty, CustomDataSource, NearFarScalar, VerticalOrigin } from "cesium";
import type { App } from "../../app";
import { Massing, type MassBuilding } from "../../enterprise/massing";
import { ambient, wake } from "../../globe/motion";
import { makeTappable } from "../../globe/pickables";
import { h } from "../../ui/dom";
import { loadJson, saveJson } from "../../util/storage";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { openDataImporter } from "../kit/opendata";
import { teamCard, teamSync } from "../kit/team";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { kpis, list, row, title } from "../kit/ui";
import { demoCity } from "./demo";
import { canvasUrl } from "../../ui/canvasUrl";
import { iconPin } from "../../ui/glyph";
import {
  agencyStats, CONDITION_COLOR, CONDITION_LABEL, COVERAGE_KM, coverageGaps, cityKpis, daysBetween, facilitiesFromCsv, facilitiesFromRows, facilityFlags, from311, fromFacDb, heatCells, isoDay, money, morningBrief, projectStatus, topTypes,
  type Agency, type City, type Facility, type FacilityKind, type Incident, type Project,
} from "./model";

const KEY = "atlas.pro.city.v1";
const load = () => loadJson<City | null>(KEY, null, (v) => !!v && Array.isArray((v as City).facilities));
// A day of live 311 can be big: if the city doesn't fit, keep it without the requests rather than not at all.
const save = (c: City) => { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return saveJson(KEY, { ...c, requests: [] }); } };
type Tab = "desk" | "agencies" | "projects" | "311" | "bids";
const TABS: [Tab, string][] = [["desk", "Mayor's desk"], ["agencies", "Agencies"], ["projects", "Projects"], ["311", "311"], ["bids", "Bids"]];
const INCIDENT_EMOJI: Record<Incident["kind"], string> = { fire: "🔥", "water main": "💧", power: "⚡", collision: "🚑", flooding: "🌊", building: "🏚️", police: "🚓", weather: "⛈️" };
const KIND_LABEL: Record<FacilityKind, string> = { firehouse: "Firehouse", precinct: "Precinct", school: "School", hospital: "Hospital", library: "Library", garage: "Garage", park: "Recreation center", shelter: "Shelter", plant: "Treatment plant", yard: "Yard", office: "Office", other: "Facility" };
const RAG = { red: "#c4513a", amber: "#d19a2e", green: "#5b9467" };
const S311 = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
const FACDB = "https://data.cityofnewyork.us/resource/ji82-xba5.json";
const heatColor = (t: number) => t > 0.66 ? "#c4513a" : t > 0.33 ? "#d19a2e" : "#e1b843";

let mass: Massing | null = null, projMass: Massing | null = null, live: CustomDataSource | null = null;

export function openCityOps(ctx: WorkCtx, app: App, view?: string) {
  mass ??= new Massing(app, "city:facilities", "City facilities", "#5160c2", "🏛️");
  projMass ??= new Massing(app, "city:projects", "Capital projects", "#d19a2e", "🏗️");
  if (!live) { live = new CustomDataSource("city-live"); void app.globe.viewer.dataSources.add(live); }
  const today = isoDay();
  let C = load();
  let tab: Tab = TABS.some(([t]) => t === view) ? view as Tab : "desk";
  let colourBy: "agency" | "condition" = "agency";
  let onlyAgency: string | null = null;
  let playing = 0;

  // Shared with the team when this workspace is linked (pro/kit/team.ts); otherwise only on this device.
  const bound = { title: () => C?.name ?? "City", get: () => C, set: (b: unknown) => { C = b as City; save(C!); }, reload: () => home() };
  const sync = teamSync(app, KEY, bound);
  const persist = () => { if (C) { save(C); sync.changed(); } };
  const stop = () => { if (playing) clearInterval(playing); playing = 0; };
  const clearLive = () => { live!.entities.removeAll(); ambient(app.globe.viewer.scene, live, false); };
  const leave = () => { stop(); mass?.clear(); projMass?.clear(); clearLive(); app.canvas.drop("city:live"); ctx.home(); };
  const agency = (id: string) => C!.agencies.find((a) => a.id === id);

  // ---- On the globe ----
  function drawFacilities(focus?: Facility) {
    if (!C) return;
    const fs = C.facilities.filter((f) => !onlyAgency || f.agency === onlyAgency);
    const bs: MassBuilding[] = fs.map((f) => {
      const col = colourBy === "agency" ? agency(f.agency)?.color ?? "#8c8f87" : CONDITION_COLOR[f.condition];
      return { id: f.id, lon: f.lon, lat: f.lat, w: f.w, d: f.d, bearing: f.bearing, floors: f.floors, floorH: f.kind === "office" ? 4 : 3.8, floorColor: () => col,
        pulse: f.status !== "open" ? "#c4513a" : undefined, dot: focus || tab === "311" ? undefined : col, label: focus?.id === f.id || (onlyAgency && fs.length < 30) ? f.name : undefined, onTap: () => facilityPage(f) };
    });
    mass!.draw(bs, onlyAgency ? `${agency(onlyAgency)?.short} facilities` : `${C.name}: facilities`, false);
  }
  function drawProjects(focus?: Project) {
    if (!C) return;
    projMass!.draw(C.projects.map((p) => {
      const st = projectStatus(p, today), built = Math.max(p.progress > 0 ? 1 : 0, Math.round(p.floors * p.progress));
      return { id: p.id, lon: p.lon, lat: p.lat, w: p.w, d: p.d, bearing: 29, floors: p.floors, floorH: p.kind === "building" ? 4 : 2, floorColor: () => RAG[st.level], ghostFrom: p.kind === "building" ? built : undefined,
        crane: p.kind === "building" && p.progress > 0.08 && p.progress < 0.85 && p.floors >= 3, label: focus?.id === p.id ? p.name : undefined, dot: focus || tab === "311" ? undefined : RAG[st.level], onTap: () => projectPage(p) };
    }), "Capital projects", false);
  }
  function drawIncidents() {
    if (!C) return;
    const born = performance.now();
    for (const i of C.incidents.filter((x) => x.status !== "closed")) {
      const col = Color.fromCssColorString(i.severity >= 3 ? "#c4513a" : i.severity === 2 ? "#d19a2e" : "#e1b843");
      const base = 120 + i.severity * 90;
      // A steady ring that breathes in brightness: only its colour changes, so no geometry is rebuilt per frame.
      const pulse = () => 0.5 + 0.5 * Math.sin((performance.now() - born) / 300);
      live!.entities.add({ position: Cartesian3.fromDegrees(i.lon, i.lat), ellipse: { semiMajorAxis: base, semiMinorAxis: base,
        material: new ColorMaterialProperty(new CallbackProperty(() => col.withAlpha(0.18 + 0.32 * pulse()), false)) } });
      const e = live!.entities.add({ position: Cartesian3.fromDegrees(i.lon, i.lat), billboard: { image: canvasUrl(`gov|${i.kind}|${i.severity}`, () => iconPin(INCIDENT_EMOJI[i.kind], col.toCssHexString(), 44)) as never, verticalOrigin: VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(2000, 0.75, 80_000, 0.45) } });
      makeTappable(e, () => incidentPage(i));
    }
    wake(800);
    ambient(app.globe.viewer.scene, live, C.incidents.some((x) => x.status !== "closed"));
    app.canvas.put({ id: "city:live", label: "🚨 Incidents and 311", color: "#c4513a", scope: "world", pinned: true, show: (v) => { live!.show = v; wake(600); }, remove: () => clearLive() }, true);
  }
  function drawHeat(from?: number, to?: number, type?: string) {
    if (!C) return;
    const rs = type ? C.requests.filter((r) => r.type === type) : C.requests;
    const cells = heatCells(rs, 0.7, from, to), max = Math.max(1, ...cells.map((c) => c.n));
    for (const c of cells) {
      const t = c.n / max;
      live!.entities.add({ position: Cartesian3.fromDegrees(c.lon, c.lat), point: { pixelSize: 8 + t * 26, color: Color.fromCssColorString(heatColor(t)).withAlpha(0.25 + t * 0.5), outlineWidth: 0, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(3000, 1.3, 90_000, 0.5) } });
    }
    wake(400);
  }
  function drawGaps(kind: FacilityKind, maxKm: number) {
    const gaps = coverageGaps(C!, kind, maxKm);
    // Each gap a soft magenta patch about a grid cell across, so together they read as areas.
    const gc = Color.fromCssColorString("#b8496a").withAlpha(0.38);
    for (const g of gaps) live!.entities.add({ position: Cartesian3.fromDegrees(g.lon, g.lat), ellipse: { semiMajorAxis: 420, semiMinorAxis: 420, material: gc } });
    wake(400);
    return gaps;
  }
  function frameCity() {
    if (!C) return;
    const pts = C.facilities.length ? C.facilities : [{ lon: C.lon, lat: C.lat }];
    const lons = pts.map((f) => f.lon), lats = pts.map((f) => f.lat);
    void flyToPlace(app.globe, { name: C.name, lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, radius: Math.max(3000, Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) * 58_000) });
  }

  // ---- Start ----
  function start() {
    mass!.clear(); projMass!.clear(); clearLive();
    const name = h("input", { class: "pro-url", placeholder: "Your city or county", "aria-label": "City" }) as HTMLInputElement;
    ctx.show("City Ops", leave,
      h("p", { class: "mp-intro" }, "Run a city from the map: every facility in 3D, projects rising, incidents live, and where service is thin."),
      h("button", { class: "primary-btn", onclick: () => { C = demoCity(today); persist(); home(); } }, "Open the New York City demo"),
      h("h3", { class: "group-title" }, "Or start your own"),
      h("div", { class: "pf-add con-base" }, name, h("button", { class: "pill-btn", onclick: async () => {
        const g = (await geocode(name.value).catch(() => []))[0];
        if (!g) { app.toast("Couldn't find that place."); return; }
        C = { id: `c${Date.now()}`, name: name.value || g.name, lon: g.lon, lat: g.lat, agencies: [{ id: "city", name: "City", short: "City", color: "#5160c2", emoji: "🏛️", budget: 0, headcount: 0, vacancies: 0, overtime: 0, head: "" }], facilities: [], projects: [], incidents: [], requests: [], bids: [] };
        persist(); home();
      } }, "Create")),
      h("p", { class: "fineprint" }, "The demo's agencies, facilities, projects and incidents are invented and placed near real neighbourhoods; budgets and headcounts are illustrative. Live 311 and the city's facilities database load from NYC Open Data."));
  }

  // ---- Home: tabs ----
  function home() {
    if (!C) return start();
    stop(); clearLive(); onlyAgency = null;
    drawFacilities(); drawProjects(); drawIncidents();
    frameCity();
    const body = h("div", { class: "con-body" });
    const tabs = h("div", { class: "segmented con-tabs gov-tabs", role: "tablist" }, ...TABS.map(([id, label]) => h("button", { role: "tab", "aria-selected": String(id === tab), onclick: (e: Event) => {
      const was = tab; tab = id; tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); stop(); clearLive(); drawIncidents();
      if ((was === "311") !== (id === "311")) { drawFacilities(); drawProjects(); } // 311's heat reads better without the facility dots
      render();
    } }, label)));
    function render() { body.replaceChildren(...(tab === "desk" ? desk() : tab === "agencies" ? agencies() : tab === "projects" ? projects() : tab === "311" ? three11() : bids())); }
    render();
    ctx.show(C.name, leave, C.demo ? h("p", { class: "gov-demo" }, "Demo city: invented facilities, people and incidents near real neighbourhoods. Figures are illustrative.") : "", tabs, body,
      h("div", { class: "edu-actions gov-links" },
        h("button", { class: "pill-btn", onclick: () => app.actions.get("work:office")?.run() }, "🏛️ Elected offices: Politics Pro"),
        h("button", { class: "pill-btn", onclick: () => app.actions.get("work:field")?.run() }, "🤝 Community organisations: Field Ops"),
        C.demo && !sync.link ? h("button", { class: "link-btn danger", onclick: () => { localStorage.removeItem(KEY); C = null; start(); } }, "Remove the demo") : ""),
      teamCard(app, sync, bound));
  }

  // ---- Mayor's desk ----
  function desk(): (HTMLElement | string)[] {
    const k = cityKpis(C!, today), brief = morningBrief(C!, today);
    const go = (b: (typeof brief)[number]) => {
      if (!b.go) return;
      if (b.go.kind === "incident") { const i = C!.incidents.find((x) => x.id === b.go!.id); if (i) incidentPage(i); }
      else if (b.go.kind === "project") { const p = C!.projects.find((x) => x.id === b.go!.id); if (p) projectPage(p); }
      else if (b.go.kind === "agency" && b.go.id) agencyPage(b.go.id);
      else if (b.go.kind === "311") { tab = "311"; home(); }
    };
    return [
      h("div", { class: "gov-hello" }, h("small", {}, new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })), h("strong", {}, "Good morning. Here's the city.")),
      kpis([money(k.budget), "operating budget"], [k.headcount.toLocaleString(), "workforce"], [`${Math.round((k.vacancies / Math.max(1, k.headcount)) * 100)}%`, "positions vacant", k.vacancies / Math.max(1, k.headcount) > 0.06],
        [String(k.incidents), "incidents now", k.incidents > 0, () => { const i = C!.incidents.find((x) => x.status === "active"); if (i) incidentPage(i); }],
        [k.requests.toLocaleString(), "311 today", false, () => { tab = "311"; home(); }], [String(k.facilities), "facilities"], [String(k.poor), "in poor condition", k.poor > 0],
        [money(k.capital), "capital program"], [String(k.late), "projects in the red", k.late > 0, () => { tab = "projects"; home(); }]),
      title("The morning brief"),
      brief.length ? h("div", { class: "edu-flags" }, ...brief.map((b) => h("button", { class: `edu-flag ${b.level}`, onclick: () => go(b) }, h("i", {}), b.text))) : h("p", { class: "edu-ok" }, "✓ A quiet morning."),
      h("div", { class: "edu-actions" }, h("button", { class: "pill-btn", onclick: () => briefReport() }, "Print the morning brief")),
      title("Agencies"),
      h("div", { class: "gov-agencies" }, ...C!.agencies.map((a) => agencyTile(a))),
      title("Show on the map"),
      h("div", { class: "segmented gov-colour", role: "tablist", "aria-label": "Colour the map by" }, ...(["agency", "condition"] as const).map((v) => h("button", { role: "tab", "aria-selected": String(v === colourBy), onclick: (e: Event) => { colourBy = v; (e.currentTarget as HTMLElement).parentElement!.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); drawFacilities(); } }, v === "agency" ? "Colour by agency" : "Colour by condition"))),
      h("div", { class: "edu-legend" }, ...[1, 2, 3, 4, 5].map((n) => h("span", { style: `--c:${CONDITION_COLOR[n]}` }, h("i", {}), CONDITION_LABEL[n]))),
    ];
  }
  function agencyTile(a: Agency) {
    const s = agencyStats(C!, a.id);
    return h("button", { class: "gov-agency", style: `--c:${a.color}`, onclick: () => agencyPage(a.id) },
      h("span", { class: "gov-agency-top" }, h("span", {}, a.emoji), h("strong", {}, a.short), s.poor.length || s.closed.length ? h("i", { class: "gov-dot" }) : ""),
      h("small", {}, `${money(a.budget)} · ${a.headcount.toLocaleString()} people`),
      h("small", {}, `${s.facilities.length} facilities · ${s.staffing}% staffed`),
      h("span", { class: "gov-cond" }, ...[1, 2, 3, 4, 5].map((n) => h("i", { style: `flex:${s.facilities.filter((f) => f.condition === n).length || 0.001};background:${CONDITION_COLOR[n]}` }))));
  }

  // ---- Agencies ----
  function agencies(): (HTMLElement | string)[] {
    return [h("p", { class: "ec-note" }, "Pick an agency to see its people, every facility it runs, their condition and repairs, and where its service is thin."), h("div", { class: "gov-agencies" }, ...C!.agencies.map((a) => agencyTile(a))),
      title("Bring in facilities"),
      h("div", { class: "edu-form" }, h("p", { class: "muted small" }, "CSV with name, lat, lon and any of: agency, kind, borough, floors, staff, condition (1–5)."),
        h("button", { class: "pill-btn", onclick: async () => { const t = await pickFile(".csv,text/csv"); if (!t) return; const fs = facilitiesFromCsv(t, C!.agencies); C!.facilities.push(...fs); persist(); app.toast(`Added ${fs.length} facilities`); home(); } }, "Import a CSV")),
      (() => {
        const ag = h("select", { class: "pro-url", "aria-label": "Agency for imported facilities" }, ...C!.agencies.map((a) => h("option", { value: a.id }, `${a.emoji} ${a.name}`))) as HTMLSelectElement;
        return h("div", { class: "od-agency" }, h("label", { class: "od-field" }, h("span", {}, "Import as facilities of"), ag),
          openDataImporter(app, { roles: ["name", "address", "type", "status"], what: "facilities", onImport: (rows, map) => { C!.facilities.push(...facilitiesFromRows(rows, map, ag.value)); persist(); home(); } }));
      })()];
  }

  function agencyPage(id: string) {
    const a = agency(id); if (!a) return;
    stop(); clearLive(); drawIncidents();
    onlyAgency = id; drawFacilities();
    const s = agencyStats(C!, id);
    const fs = s.facilities.slice().sort((x, y) => facilityFlags(y).length - facilityFlags(x).length || x.condition - y.condition);
    if (fs.length) { const lons = fs.map((f) => f.lon), lats = fs.map((f) => f.lat); void flyToPlace(app.globe, { name: a.name, lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, radius: Math.max(2500, Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) * 58_000) }); }
    const kinds = [...new Set(fs.map((f) => f.kind))].filter((k) => COVERAGE_KM[k]);
    const gapOut = h("p", { class: "muted small" });
    const msg = h("p", { class: "muted small" });
    const back = () => { onlyAgency = null; home(); };
    ctx.show(`${a.emoji} ${a.name}`, back,
      h("p", { class: "edu-sub" }, `${a.short} · led by ${a.head || "—"}`),
      kpis([money(a.budget), "budget"], [a.headcount.toLocaleString(), "people"], [`${Math.round((a.vacancies / Math.max(1, a.headcount)) * 100)}%`, "vacant", a.vacancies / Math.max(1, a.headcount) > 0.08], [`${Math.round(a.overtime * 100)}%`, "overtime share"],
        [String(fs.length), "facilities"], [`${s.avgCondition}`, "average condition (1–5)", s.avgCondition < 3], [`${s.staffing}%`, "facility staffing", s.staffing < 88], [String(s.workOrders), "open work orders"]),
      s.requests ? h("p", { class: "ec-note" }, `${s.requests} 311 requests routed to ${a.short} today, ${s.openRequests} open.`) : "",
      kinds.length ? h("div", {}, title("Coverage"), h("div", { class: "edu-actions" }, ...kinds.map((k) => h("button", { class: "pill-btn", onclick: () => {
        clearLive(); drawIncidents();
        const g = drawGaps(k, COVERAGE_KM[k]!);
        gapOut.textContent = g.length ? `${g.length} spots (magenta) are farther than ${COVERAGE_KM[k]} km from the nearest ${KIND_LABEL[k].toLowerCase()}: about ${Math.round(g.length * 0.64)} km² to look at for the next one. A rough straight-line check, not response times.` : `Everywhere near the city's facilities is within ${COVERAGE_KM[k]} km of a ${KIND_LABEL[k].toLowerCase()}.`;
      } }, `Gaps: ${KIND_LABEL[k].toLowerCase()}s`))), gapOut) : "",
      title("Facilities"),
      fs.length ? list(...fs.map((f) => { const fl = facilityFlags(f); return row({ color: CONDITION_COLOR[f.condition] }, f.name, `${KIND_LABEL[f.kind]} · ${f.borough || "—"} · ${f.staff}/${f.authorized || "?"} staff · ${fl[0] ?? "no issues"}`, () => facilityPage(f), fl.length ? h("span", { class: "con-badge now" }, String(fl.length)) : undefined); })) : h("p", { class: "muted small" }, "No facilities yet."),
      C!.id.startsWith("nyc") ? h("div", { class: "edu-form" }, h("strong", {}, "The real ones, from NYC's Facilities Database"), h("button", { class: "pill-btn", onclick: async () => {
        msg.textContent = "Loading…";
        try {
          const rows = await fetch(`${FACDB}?overabbrev=${encodeURIComponent(a.short === "H+H" ? "HHC" : a.short === "Libraries" ? "NYPL" : a.short.toUpperCase())}&$limit=800`).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
          const got = fromFacDb(rows, a.id);
          if (!got.length) { msg.textContent = "None came back."; return; }
          C!.facilities = C!.facilities.filter((f) => !(f.agency === a.id && f.source === "demo")).concat(got); persist(); agencyPage(id);
        } catch { msg.textContent = "Couldn't reach NYC Open Data."; }
      } }, "Load real facilities"), msg) : "",
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${a.short}-facilities.csv`, ["Name", "Kind", "Borough", "Lead", "Staff", "Authorized", "Condition", "Built", "Work orders", "Status", "Lat", "Lon"], fs.map((f) => [f.name, f.kind, f.borough, f.lead ?? "", f.staff, f.authorized, f.condition, f.built, f.workOrders, f.status, f.lat, f.lon])) }, "Facilities CSV"));
  }

  function facilityPage(f: Facility) {
    const a = agency(f.agency);
    stop();
    onlyAgency = f.agency; drawFacilities(f);
    void flyToPlace(app.globe, { name: f.name, lon: f.lon, lat: f.lat, radius: 160 + f.floors * 12 + Math.max(f.w, f.d) });
    const fl = facilityFlags(f);
    const change = () => { persist(); facilityPage(f); };
    const cond = h("select", { class: "pro-url", "aria-label": "Condition" }, ...[1, 2, 3, 4, 5].map((n) => h("option", { value: String(n), selected: n === f.condition }, `${n} · ${CONDITION_LABEL[n]}`))) as HTMLSelectElement;
    cond.addEventListener("change", () => { f.condition = Number(cond.value); change(); });
    const status = h("select", { class: "pro-url", "aria-label": "Status" }, ...(["open", "partial", "closed"] as const).map((v) => h("option", { value: v, selected: v === f.status }, v === "partial" ? "Partly open" : v[0].toUpperCase() + v.slice(1)))) as HTMLSelectElement;
    status.addEventListener("change", () => { f.status = status.value as Facility["status"]; change(); });
    const note = h("input", { class: "pro-url", value: f.note ?? "", placeholder: "Note: why it's closed, what's being fixed", "aria-label": "Note" }) as HTMLInputElement;
    note.addEventListener("change", () => { f.note = note.value || undefined; change(); });
    const staffIn = h("input", { class: "pro-url", type: "number", value: String(f.staff), "aria-label": "Staff" }) as HTMLInputElement;
    staffIn.addEventListener("change", () => { f.staff = Math.max(0, Number(staffIn.value) || 0); change(); });
    ctx.show(f.name, () => agencyPage(f.agency),
      h("p", { class: "edu-sub" }, `${a?.emoji ?? ""} ${a?.short ?? ""} · ${KIND_LABEL[f.kind]}${f.borough ? ` · ${f.borough}` : ""}${f.built ? ` · built ${f.built}` : ""}`),
      fl.length ? h("div", { class: "edu-flags" }, ...fl.map((t) => h("div", { class: `edu-flag ${/Closed|Poor/.test(t) ? "now" : "soon"}` }, h("i", {}), t))) : h("p", { class: "edu-ok" }, "✓ Open, staffed and in good shape."),
      kpis([CONDITION_LABEL[f.condition], "condition", f.condition <= 2], [`${f.staff}/${f.authorized || "?"}`, "staff", f.authorized > 0 && f.staff / f.authorized < 0.85], [String(f.workOrders), "work orders", f.workOrders >= 12], [String(f.floors), `floor${f.floors > 1 ? "s" : ""}`]),
      f.lead ? h("div", { class: "con-who" }, h("span", {}, h("small", {}, "In charge"), f.lead), h("span", {}, h("small", {}, "Agency head"), a?.head ?? "—")) : "",
      f.authorized ? h("div", { class: "gov-staffbar" }, h("i", { style: `width:${Math.min(100, (f.staff / f.authorized) * 100)}%` }), h("small", {}, `${Math.round((f.staff / f.authorized) * 100)}% of authorized positions filled`)) : "",
      title("Work orders"),
      h("div", { class: "edu-actions" }, h("button", { class: "pill-btn", onclick: () => { f.workOrders++; change(); } }, "+ Open one"), h("button", { class: "pill-btn", onclick: () => { f.workOrders = Math.max(0, f.workOrders - 1); change(); } }, "✓ Close one")),
      title("Update"),
      h("div", { class: "edu-form" }, h("div", { class: "md-two" }, status, cond), note, h("div", { class: "con-prog" }, h("span", {}, "Staff on roll"), staffIn)),
      h("div", { class: "edu-actions" },
        h("a", { class: "pill-btn", href: `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`, target: "_blank", rel: "noopener" }, "Directions"),
        h("a", { class: "pill-btn", href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${f.lat},${f.lon}`, target: "_blank", rel: "noopener" }, "Street view")));
  }

  // ---- Incidents ----
  function incidentPage(i: Incident) {
    stop();
    void flyToPlace(app.globe, { name: i.text, lon: i.lon, lat: i.lat, radius: 900 });
    const mins = Math.round((Date.now() - Date.parse(i.time)) / 60_000);
    const near = C!.facilities.map((f) => ({ f, km: Math.hypot((f.lon - i.lon) * 84.4, (f.lat - i.lat) * 110.6) })).sort((a, b) => a.km - b.km);
    const nearest = (k: FacilityKind) => near.find((x) => x.f.kind === k);
    ctx.show(`${INCIDENT_EMOJI[i.kind]} Incident`, () => home(),
      h("p", { class: "gov-incident" }, i.text),
      kpis([`${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`}`, "since reported"], [["", "Minor", "Serious", "Major"][i.severity], "severity", i.severity >= 3], [i.status, "status"]),
      h("p", { class: "ec-note" }, `Agencies: ${i.agencies.join(", ")}`),
      title("Closest city facilities"),
      list(...(["firehouse", "precinct", "hospital", "shelter", "school"] as FacilityKind[]).map((k) => nearest(k)).filter(Boolean).map((x) => row({ color: agency(x!.f.agency)?.color ?? "#8c8f87" }, x!.f.name, `${KIND_LABEL[x!.f.kind]} · ${x!.km.toFixed(1)} km · ${x!.f.status === "open" ? "open" : x!.f.status}`, () => facilityPage(x!.f)))),
      h("div", { class: "edu-actions" },
        i.status === "active" ? h("button", { class: "pill-btn", onclick: () => { i.status = "contained"; persist(); clearLive(); drawIncidents(); incidentPage(i); } }, "Mark contained") : "",
        h("button", { class: "pill-btn", onclick: () => { i.status = "closed"; persist(); clearLive(); drawIncidents(); home(); } }, "Close")));
  }

  // ---- Capital projects ----
  function projects(): (HTMLElement | string)[] {
    const ps = C!.projects.map((p) => ({ p, s: projectStatus(p, today) })).sort((a, b) => ["red", "amber", "green"].indexOf(a.s.level) - ["red", "amber", "green"].indexOf(b.s.level));
    const total = ps.reduce((s, x) => s + x.p.budget, 0), eac = ps.reduce((s, x) => s + x.s.eac, 0);
    return [
      kpis([String(ps.length), "projects"], [money(total), "budgeted"], [money(eac), "forecast at completion", eac > total * 1.02], [String(ps.filter((x) => x.s.level === "red").length), "in the red", true]),
      h("div", { class: "edu-legend" }, ...(["green", "amber", "red"] as const).map((k) => h("span", { style: `--c:${RAG[k]}` }, h("i", {}), k === "green" ? "On track" : k === "amber" ? "Watch" : "In trouble")), h("span", { class: "con-ghost" }, h("i", {}), "Still to build")),
      ...ps.map(({ p, s }) => h("button", { class: "con-job", onclick: () => projectPage(p) },
        h("div", { class: "con-job-head" }, h("strong", {}, p.name), h("span", { class: `con-var ${s.level === "red" ? "bad" : s.level === "green" ? "good" : ""}` }, s.slipWeeks < 0 ? `${-s.slipWeeks} wk late` : s.slipWeeks > 0 ? `${s.slipWeeks} wk early` : "On time")),
        h("span", { class: "gov-prog" }, h("i", { style: `width:${p.progress * 100}%;background:${RAG[s.level]}` }), h("b", { style: `left:${s.planned * 100}%` })),
        h("small", {}, `${agency(p.agency)?.short ?? ""} · ${Math.round(p.progress * 100)}% built vs ${Math.round(s.planned * 100)}% planned · ${money(p.spent)} of ${money(p.budget)}${s.overrun ? ` · forecast ${money(s.overrun)} over` : ""}`))),
    ];
  }
  function projectPage(p: Project) {
    stop();
    drawProjects(p);
    void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 220 + Math.max(p.w, p.d) * 1.4 + p.floors * 14 });
    const s = projectStatus(p, today);
    const prog = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(p.progress * 100)), "aria-label": "Progress" }) as HTMLInputElement;
    const pl = h("strong", {}, `${Math.round(p.progress * 100)}%`);
    prog.addEventListener("input", () => { p.progress = Number(prog.value) / 100; pl.textContent = `${prog.value}%`; drawProjects(p); });
    prog.addEventListener("change", () => { persist(); projectPage(p); });
    const spent = h("input", { class: "pro-url", type: "number", value: String(p.spent), "aria-label": "Spent" }) as HTMLInputElement;
    spent.addEventListener("change", () => { p.spent = Math.max(0, Number(spent.value) || 0); persist(); projectPage(p); });
    const related = C!.bids.filter((b) => b.project === p.id);
    ctx.show(p.name, () => { tab = "projects"; home(); },
      h("p", { class: "edu-sub" }, `${agency(p.agency)?.emoji ?? ""} ${agency(p.agency)?.name ?? ""} · ${p.borough}`),
      h("div", { class: `gov-rag ${s.level}` }, s.level === "red" ? "In trouble" : s.level === "amber" ? "Watch" : "On track"),
      kpis([`${Math.round(p.progress * 100)}%`, "built"], [`${Math.round(s.planned * 100)}%`, "planned by today"], [s.slipWeeks < 0 ? `${-s.slipWeeks} wk` : "0", "late", s.slipWeeks <= -3],
        [money(p.budget), "budget"], [money(p.spent), "spent"], [money(s.eac), "forecast at completion", s.overrun > 0]),
      h("span", { class: "gov-prog big" }, h("i", { style: `width:${p.progress * 100}%;background:${RAG[s.level]}` }), h("b", { style: `left:${s.planned * 100}%` })),
      h("div", { class: "con-strip-ends" }, h("small", {}, p.start), h("small", {}, `finish ${p.finish}`)),
      h("p", { class: "fineprint" }, "Forecast at completion assumes the rest costs what the work so far has (spent ÷ progress). The marker is where the plan says it should be today."),
      title("Update"),
      h("div", { class: "edu-form" }, h("div", { class: "con-prog" }, h("span", {}, "Progress"), prog, pl), h("div", { class: "con-prog" }, h("span", {}, "Spent ($)"), spent)),
      related.length ? h("div", {}, title("Bids"), list(...related.map((b) => row("📄", b.title, `${money(b.value)} · ${b.status} · ${b.bidders} bidders · due ${b.due}`)))) : "");
  }

  // ---- 311 ----
  function three11(): (HTMLElement | string)[] {
    const rs = C!.requests;
    let type: string | undefined;
    const now = Date.now(), from0 = now - 24 * 3_600_000;
    const label = h("strong", {}, "The last 24 hours");
    const slider = h("input", { type: "range", min: "3", max: "24", step: "1", value: "24", "aria-label": "Hour" }) as HTMLInputElement;
    const msg = h("p", { class: "muted small" });
    const show = () => {
      clearLive(); drawIncidents();
      const hr = Number(slider.value);
      if (hr >= 24 && !playing) { label.textContent = "The last 24 hours"; drawHeat(undefined, undefined, type); return; }
      const to = from0 + hr * 3_600_000;
      label.textContent = `${new Date(to - 3 * 3_600_000).toLocaleTimeString(undefined, { hour: "numeric" })} to ${new Date(to).toLocaleTimeString(undefined, { hour: "numeric" })}`;
      drawHeat(to - 3 * 3_600_000, to, type);
    };
    slider.addEventListener("input", show);
    const play = h("button", { class: "pill-btn", onclick: () => {
      if (playing) { stop(); play.textContent = "▶ Play the day"; return; }
      play.textContent = "❚❚ Pause";
      let hr = 3;
      playing = window.setInterval(() => { hr = hr >= 24 ? 3 : hr + 1; slider.value = String(hr); show(); }, 700);
    } }, "▶ Play the day");
    const top = topTypes(rs, 8), max = Math.max(1, ...top.map((t) => t[1]));
    const typeBtns = h("div", { class: "gov-types" }, ...top.map(([t, n]) => h("button", { class: "gov-type", onclick: (e: Event) => {
      type = type === t ? undefined : t;
      typeBtns.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget && !!type));
      show();
    } }, h("span", {}, t), h("i", { style: `width:${(n / max) * 100}%` }), h("small", {}, String(n)))));
    setTimeout(show, 0);
    return [
      kpis([rs.length.toLocaleString(), "requests, 24 h"], [rs.filter((r) => r.status === "open").length.toLocaleString(), "still open"], [String(new Set(rs.map((r) => r.agency)).size), "agencies"]),
      h("div", { class: "con-time" }, h("div", { class: "con-time-head" }, h("span", {}, "Heat for "), label, play), slider, h("div", { class: "con-time-ends" }, h("small", {}, "24 hours ago"), h("small", {}, "Now"))),
      title("What people are calling about"),
      h("p", { class: "muted small" }, "Tap one to map only that."),
      typeBtns,
      C!.id.startsWith("nyc") ? h("div", { class: "edu-form" }, h("strong", {}, "Live from NYC Open Data"), h("p", { class: "muted small" }, "The last 24 hours of 311 service requests (up to 5,000)."), h("button", { class: "pill-btn", onclick: async () => {
        msg.textContent = "Loading 311…";
        const since = new Date(Date.now() - 24 * 3_600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
        try {
          const rows = await fetch(`${S311}?$where=${encodeURIComponent(`created_date > '${since}'`)}&$select=unique_key,created_date,complaint_type,agency,latitude,longitude,status,borough&$limit=5000&$order=${encodeURIComponent("created_date DESC")}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
          const got = from311(rows);
          if (!got.length) { msg.textContent = "Nothing came back."; return; }
          C!.requests = got; persist(); tab = "311"; home();
        } catch { msg.textContent = "Couldn't reach NYC Open Data."; }
      } }, "Load live 311"), msg) : "",
      h("button", { class: "pill-btn", onclick: () => downloadCsv("311.csv", ["Created", "Type", "Agency", "Status", "Borough", "Lat", "Lon"], rs.map((r) => [r.created, r.type, r.agency, r.status, r.borough ?? "", r.lat, r.lon])) }, "311 CSV"),
    ];
  }

  // ---- Bids: for vendors and procurement ----
  function bids(): (HTMLElement | string)[] {
    const open = C!.bids.filter((b) => b.status === "open").sort((a, b) => a.due.localeCompare(b.due));
    const rest = C!.bids.filter((b) => b.status !== "open");
    const bidRow = (b: City["bids"][number]) => {
      const days = daysBetween(today, b.due), a = agency(b.agency), p = C!.projects.find((x) => x.id === b.project);
      return row({ color: a?.color ?? "#8c8f87" }, b.title, `${a?.short ?? ""} · ${money(b.value)} · ${b.bidders} bidder${b.bidders === 1 ? "" : "s"} · ${b.status === "open" ? `closes ${b.due}` : b.status}`, p ? () => projectPage(p) : undefined,
        b.status === "open" ? h("span", { class: `con-badge ${days <= 7 ? "now" : "soon"}` }, days <= 0 ? "Today" : `${days} d`) : undefined);
    };
    return [
      kpis([String(open.length), "open bids"], [money(open.reduce((s, b) => s + b.value, 0)), "open value"], [String(open.filter((b) => daysBetween(today, b.due) <= 7).length), "close this week"]),
      h("p", { class: "ec-note" }, "For vendors: what the city is buying, by agency, and where the work is. For procurement: what's out, how many are bidding, and what closes when."),
      title("Open"), open.length ? list(...open.map(bidRow)) : h("p", { class: "muted small" }, "Nothing open."),
      rest.length ? h("div", {}, title("Evaluating and awarded"), list(...rest.map(bidRow))) : "",
      h("button", { class: "pill-btn", onclick: () => downloadCsv("bids.csv", ["Title", "Agency", "Value", "Due", "Status", "Bidders"], C!.bids.map((b) => [b.title, agency(b.agency)?.short ?? "", b.value, b.due, b.status, b.bidders])) }, "Bids CSV"),
    ];
  }

  function briefReport() {
    const k = cityKpis(C!, today), brief = morningBrief(C!, today);
    printReport(`${C!.name}: morning brief`, new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }), [
      { heading: "The city", kpis: [[String(k.incidents), "incidents now"], [k.requests.toLocaleString(), "311 today"], [String(k.poor), "facilities in poor condition"], [String(k.late), "projects in the red"]] },
      { heading: "To know this morning", lines: brief.map((b) => `${b.level === "now" ? "NOW · " : ""}${b.text}`) },
      { heading: "Agencies", table: { head: ["Agency", "Budget", "People", "Vacant", "Facilities", "Avg condition", "Staffing"], rows: C!.agencies.map((a) => { const s = agencyStats(C!, a.id); return [a.name, money(a.budget), a.headcount, `${Math.round((a.vacancies / Math.max(1, a.headcount)) * 100)}%`, s.facilities.length, s.avgCondition, `${s.staffing}%`]; }) } },
      { heading: "Capital projects", table: { head: ["Project", "Agency", "Built", "Planned", "Budget", "Forecast"], rows: C!.projects.map((p) => { const s = projectStatus(p, today); return [p.name, agency(p.agency)?.short ?? "", `${Math.round(p.progress * 100)}%`, `${Math.round(s.planned * 100)}%`, money(p.budget), money(s.eac)]; }) } },
    ], "Made with Terreno. Demo figures are illustrative.");
  }

  if (C) home(); else start();
}
