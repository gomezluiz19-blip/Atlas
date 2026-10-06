// Mining Pro: a mine on the map, and its licence to operate. One screen for
// the mine (what the year is worth, open grievances, permits running out) and
// four ways to see it: the value chain from pit to smelter as living streams,
// the communities around it with rings and grievances, who lives downhill of
// the tailings dam, and this week's earthquakes nearby.
import { openSpace } from "../../delight/spaces";
import type { App } from "../../app";
import { COMMODITIES, commodity, MINES } from "../../content/minerals";
import { elevation } from "../../data/elevation";
import { populationPoints } from "../../data/people";
import { recentQuakes } from "../../data/quakes";
import { h } from "../../ui/dom";
import { flyToPlace } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { addDays, dueSoon, fmt, issueQueue, kmBetween, kmText, moodCounts, moodOf, moveFacts, ring, today, type Dated, type Party } from "../kit/ops";
import { ageBadge, empty, field, frame, hoursText, input, kpis, lines, list, moveScreen, OpsMap, partyScreen, row, select, siteAdder, stream, title } from "../kit/ui";
import { demoMine } from "./demo";
import { zoomForSpacing } from "../../analysis/profile";
import { downstream, flowPath, gistmClass, pathKm, stageOf, sla } from "./social";
import { boardReport, coldLines, commitmentsPanel, grievancePanel, grievanceScreen } from "./grievanceUi";
import { downhill, economics, mainSite, PARTY_KINDS, PERMIT_KINDS, quakesNear, SITE_KINDS, townsNear, usd, usdShort, type Economics, type Mine } from "./model";

const mines = new ListStore<Mine>("atlas.pro.mines.v1");
const current = () => mines.all()[0];
const save = (m: Mine) => mines.save(m);
let map: OpsMap | null = null;
type View = "chain" | "community" | "grievances" | "tailings" | "hazards";
let view: View = "chain";
const K = (k: string) => SITE_KINDS[k as keyof typeof SITE_KINDS];

/** What the async looks found, kept so redraws don't refetch. */
type Flow = { path: [number, number][]; down: { name: string; people?: number; along: number; km: number }[]; par: number; partial: boolean; km: number };
const found: { flow?: Flow | null; towns?: ReturnType<typeof townsNear>; below?: ReturnType<typeof downhill<{ lon: number; lat: number; people: number; km: number; name?: string }>>; quakes?: ReturnType<typeof quakesNear<{ lon: number; lat: number; mag: number; place: string; time: number }>>; for?: string } = {};

function draw(app: App, m: Mine) {
  map ??= new OpsMap(app, "pro:mining", "#9a7552");
  const at = mainSite(m);
  const fs: WorkFeature[] = [], flows = [];
  const byId = new Map(m.sites.map((s) => [s.id, s]));
  if (view === "chain") {
    const biggest = Math.max(1, ...m.moves.filter((x) => x.kind === "goods").map((x) => x.amount));
    for (const mv of m.moves) { const a = byId.get(mv.from), b = byId.get(mv.to); if (!a || !b) continue; const s = stream(a, b, mv, mv.kind === "goods" ? biggest : mv.amount); fs.push(s.line); flows.push(s.flow); }
    for (const s of m.sites) fs.push({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: s.kind === "community" ? "#8b5fa8" : "#9a7552", label: `${K(s.kind)?.emoji ?? "•"} ${s.name}` });
  } else if (at) {
    for (const s of m.sites.filter((x) => ["pit", "underground", "plant", "tailings", "waste", "camp"].includes(x.kind))) fs.push({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: "#9a7552", label: `${K(s.kind)?.emoji ?? "•"} ${s.name}` });
    if (view === "community") {
      for (const km of [10, 25, 50]) fs.push({ id: `r${km}`, kind: "line", pts: [...ring(at.lon, at.lat, km), ring(at.lon, at.lat, km)[0]], color: "#8b5fa8", dashed: true });
      for (const t of found.towns ?? []) fs.push({ id: `t${t.lon},${t.lat}`, kind: "point", pts: [[t.lon, t.lat]], color: "#8c8f87", label: `${fmt(t.people)} people` });
      for (const p of m.parties.filter((x) => x.lon !== undefined)) fs.push({ id: p.id, kind: "point", pts: [[p.lon!, p.lat!]], color: moodOf(p.mood).color, label: p.name.replace(/ \(demo\)/, "") });
      for (const i of issueQueue(m.issues, today())) { const s = i.site ? byId.get(i.site) : undefined, p = m.parties.find((x) => x.id === i.party); const pt = p?.lon !== undefined ? [p.lon, p.lat!] : s ? [s.lon, s.lat] : null; if (pt) fs.push({ id: `i${i.id}`, kind: "point", pts: [[pt[0] + 0.004, pt[1] + 0.003]], color: "#c4513a" }); }
    } else if (view === "tailings") {
      const dam = m.sites.find((s) => s.kind === "tailings");
      if (dam && found.flow) {
        const f = found.flow;
        fs.push({ id: "path", kind: "line", pts: f.path, color: "#c4513a" });
        const byName = new Map(f.down.map((d) => [d.name, d]));
        for (const p of flowPlaces(m)) { const d = byName.get(p.name); if (d) fs.push({ id: `dn${p.name}`, kind: "point", pts: [[p.lon, p.lat]], color: "#c4513a", label: `${p.name.replace(/ \(demo\)/, "")} · ${kmText(d.along)} down` }); }
      } else if (dam && found.below) {
        for (const t of found.below.places) fs.push({ id: `b${t.lon},${t.lat}`, kind: "point", pts: [[t.lon, t.lat]], color: "#c4513a", label: `${t.name ? t.name.replace(/ \(demo\)/, "") : `${fmt(t.people)} people`} · ${Math.round(t.drop)} m below` });
      }
    } else {
      fs.push({ id: "q300", kind: "line", pts: [...ring(at.lon, at.lat, 300), ring(at.lon, at.lat, 300)[0]], color: "#d19a2e", dashed: true });
      for (const q of found.quakes ?? []) fs.push({ id: `q${q.lon},${q.lat}`, kind: "point", pts: [[q.lon, q.lat]], color: q.mag >= 5 ? "#c4513a" : "#d19a2e", label: `M${q.mag.toFixed(1)} · ${kmText(q.km)}` });
    }
  }
  map.draw(`Mine · ${m.name}`, fs, flows);
}

function show(app: App, m: Mine) {
  const at = mainSite(m);
  if (!at) return;
  if (view === "chain") frame(app, m.name, m.sites);
  else void flyToPlace(app.globe, { name: m.name, lon: at.lon, lat: at.lat, radius: view === "hazards" ? 320_000 : view === "community" ? 55_000 : 32_000 });
}

/** The async looks: towns around, who's downhill of the dam, quakes nearby. */
async function look(ctx: WorkCtx, m: Mine) {
  const at = mainSite(m);
  if (!at || found.for === m.id + view) return;
  found.for = m.id + view;
  if (view === "community" || view === "tailings") found.towns ??= townsNear(await populationPoints().catch(() => []), at, 50);
  if (view === "tailings") {
    const dam = m.sites.find((s) => s.kind === "tailings");
    if (dam) {
      // Towns from the map data, and the communities the mine has mapped itself (people not counted).
      const mapped = [...m.parties.filter((p) => p.lon !== undefined && ["community", "landholder", "leader"].includes(p.kind)).map((p) => ({ lon: p.lon!, lat: p.lat! , name: p.name })),
        ...m.sites.filter((s) => s.kind === "community").map((s) => ({ lon: s.lon, lat: s.lat, name: s.name }))]
        .map((c) => ({ ...c, people: 0, km: kmBetween(dam, c) })).filter((c) => c.km <= 30);
      const near: { lon: number; lat: number; people: number; km: number; name?: string }[] = [...townsNear(await populationPoints().catch(() => []), dam, 30), ...mapped];
      const hs = await elevation.sample([[dam.lon, dam.lat], ...near.map((t) => [t.lon, t.lat] as [number, number])], 11).catch(() => null);
      found.below = hs ? downhill(hs[0], near, Array.from(hs.slice(1))) : undefined;
      found.flow = await traceFlow(m, dam, near).catch(() => null);
    }
  }
  if (view === "hazards") found.quakes = quakesNear(await recentQuakes().catch(() => []), at, 300);
  if (current()?.id === m.id) { draw(ctx.app, m); home(ctx, m); }
}

export function openMining(ctx: WorkCtx) {
  const m = current();
  if (!m) return start(ctx);
  draw(ctx.app, m);
  home(ctx, m);
  void look(ctx, m);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Start from a known mine, or name yours", list: "mp-mines" }) as HTMLInputElement;
  const known = h("datalist", { id: "mp-mines" }, ...MINES.map((x) => h("option", { value: x.name }, `${x.country} · ${x.goods.join(", ")}`)));
  const go = () => {
    const q = name.value.trim();
    const k = MINES.find((x) => x.name.toLowerCase() === q.toLowerCase());
    if (!k) { ctx.app.toast("Pick a mine from the list, or try the demo. (You can add your own pit as a site after.)", 4500); return; }
    const c = commodity(k.goods[0]);
    const m: Mine = {
      id: newId(), name: k.name, commodity: k.goods[0], country: k.country, created: Date.now(),
      sites: [{ id: newId(), name: `${k.name} ${k.kind === "underground" ? "mine" : "pit"}`, kind: k.kind === "underground" ? "underground" : "pit", lon: k.lon, lat: k.lat }],
      moves: [], parties: [], issues: [], permits: [],
      econ: c?.group === "precious" ? { oreMt: 5, grade: 1.5, gradeUnit: "g/t", recovery: 90, payable: 99, price: 2400, costPerT: 45 } : { oreMt: 20, grade: 0.6, gradeUnit: "%", recovery: 88, payable: 96, price: 9500, costPerT: 25 },
    };
    save(m); view = "chain"; openMining(ctx); show(ctx.app, m);
  };
  ctx.show("Mining Pro", ctx.home,
    h("p", {}, "Run a mine on the map: pit to port, what the year is worth, and the people downhill of the dam."),
    name, known,
    h("button", { class: "primary-btn", onclick: go }, "Start"),
    h("button", { class: "pill-btn", onclick: () => { const m = demoMine(); save(m); view = "chain"; openMining(ctx); show(ctx.app, m); } }, "Or try a demo: a copper mine in Zambia"));
}

function home(ctx: WorkCtx, m: Mine) {
  const { app } = ctx;
  const t = today();
  const e = economics(m.econ), q = issueQueue(m.issues, t), due = dueSoon(m.permits, t, 120);
  const urgent = due.filter((d) => d.left <= 30);
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), onclick: () => { view = id; found.for = undefined; draw(app, m); home(ctx, m); show(app, m); void look(ctx, m); } }, label);
  const com = commodity(m.commodity);
  const byId = new Map(m.sites.map((s) => [s.id, s]));
  ctx.show("Mining Pro", ctx.home,
    h("input", { class: "mp-name", value: m.name, "aria-label": "Mine name", onchange: (ev: Event) => { m.name = (ev.target as HTMLInputElement).value || m.name; save(m); } }),
    h("p", { class: "muted small" }, [com?.name, m.country].filter(Boolean).join(" · ")),
    kpis(
      [usdShort(e.revenue), "revenue a year"],
      [usdShort(e.margin), "margin a year", e.margin < 0],
      [String(q.length), "open grievances", m.issues.some((g) => stageOf(g) !== "closed" && (sla(g, t).lateAck || sla(g, t).lateResponse)), () => { view = "grievances"; draw(app, m); home(ctx, m); }],
      [String(urgent.length), "permits due in 30 d", urgent.length > 0, () => permitsScreen(ctx, m)]),
    h("div", { class: "chips wrap" }, tab("chain", "Value chain"), tab("community", "Communities"), tab("grievances", "Grievances"), tab("tailings", "Tailings"), tab("hazards", "Earthquakes")),
    h("div", { class: "row" },
      h("button", { class: "pill-btn holo-go", onclick: () => void mineHologram(app, m) }, "◎ Hologram"),
      h("button", { class: "pill-btn", onclick: () => boardReport(m, tailingsSummary()) }, "Board report")),
    view === "chain" ? h("div", {},
      lines(...chainLines(m)),
      title("What moves"),
      m.moves.length ? list(...m.moves.map((mv) => { const a = byId.get(mv.from), b = byId.get(mv.to); if (!a || !b) return h("span", {}); const f = moveFacts(mv, a, b);
        return row({ color: mv.kind === "goods" ? "#d19a2e" : mv.kind === "people" ? "#3563d6" : mv.kind === "money" ? "#5b9467" : "#8b5fa8" }, `${mv.what}: ${a.name.split(",")[0]} → ${b.name.split(",")[0]}`,
          [`${fmt(mv.amount)} ${mv.unit} a ${mv.per}`, mv.mode !== "digital" ? `${kmText(f.km)} · ${hoursText(f.hours)}` : "", f.co2t ? `${fmt(f.co2t)} t CO₂/yr` : ""].filter(Boolean).join(" · "),
          () => moveScreen(ctx, m.sites, SITE_KINDS, mv, () => { save(m); openMining(ctx); }, (x) => { m.moves = m.moves.filter((y) => y !== x); save(m); openMining(ctx); }, () => openMining(ctx))); })) : empty("Add the pit, the plant, a port and a buyer, then what moves between them."),
      m.sites.length >= 2 ? h("button", { class: "link-btn", onclick: () => moveScreen(ctx, m.sites, SITE_KINDS, null, (x) => { m.moves.push(x); save(m); openMining(ctx); }, () => {}, () => openMining(ctx)) }, "+ Something that moves") : "") :
    view === "community" ? h("div", {},
      found.towns ? lines(...[10, 25, 50].map((km) => { const ts = found.towns!.filter((x) => x.km <= km); return `Within ${km} km: ${ts.length} ${ts.length === 1 ? "town" : "towns"}, ${fmt(ts.reduce((s, x) => s + x.people, 0))} people.`; }),
        found.towns[0] ? `Nearest town: ${kmText(found.towns[0].km)} away, ${fmt(found.towns[0].people)} people.` : "No mapped towns within 50 km (villages may not be in the data).") : h("p", { class: "muted small" }, "Finding the towns around…"),
      h("div", { class: "pol-legend" }, ...moodCounts(m.parties).filter((x) => x.n).map((x) => h("span", {}, h("i", { style: `background:${x.color}` }), `${x.label} ${x.n}`))),
      coldLines(m),
      list(...m.parties.map((p) => row({ color: moodOf(p.mood).color }, p.name, `${PARTY_KINDS[p.kind as keyof typeof PARTY_KINDS]?.label ?? p.kind} · ${moodOf(p.mood).label}${p.log[0] ? ` · ${p.log[0].text}` : ""}`, () => partyEdit(ctx, m, p)))),
      partyAdder(ctx, m),
      commitmentsPanel(ctx, m, () => save(m), () => openMining(ctx))) :
    view === "grievances" ? grievancePanel(ctx, m, () => save(m), () => openMining(ctx)) :
    view === "tailings" ? h("div", {},
      !m.sites.some((s) => s.kind === "tailings") ? empty("Add the tailings dam as a site to see who lives downhill of it.") :
      found.flow ? tailingsLines(found.flow) :
      found.below ? lines(
        found.below.places.length ? `${found.below.places.length} ${found.below.places.length === 1 ? "place lies" : "places lie"} lower than the dam within 30 km${found.below.people ? `, with ${fmt(found.below.people)} people in the towns among them` : ""}${found.below.places.some((x) => x.name) ? `: ${found.below.places.filter((x) => x.name).map((x) => x.name!.replace(/ \(demo\)/, "")).join(", ")}` : ""}.` : "No mapped towns or communities lower than the dam within 30 km.",
        found.below.nearest ? `Nearest: ${kmText(found.below.nearest.km)} away and ${Math.round(found.below.nearest.drop)} m below the dam.` : "",
        "Lower ground isn't the whole story: a failure follows valleys and rivers. Use it to decide where warning sirens, drills and evacuation routes matter first.") : h("p", { class: "muted small" }, "Comparing heights around the dam…")) :
    h("div", {},
      found.quakes ? lines(
        found.quakes.length ? `${found.quakes.length} ${found.quakes.length === 1 ? "earthquake" : "earthquakes"} of magnitude 2.5+ within 300 km this week; strongest M${found.quakes[0].mag.toFixed(1)}, ${kmText(found.quakes[0].km)} away.` : "No earthquakes of magnitude 2.5+ within 300 km this week.",
        found.quakes.some((x) => x.mag >= 5 && x.km < 100) ? "⚠️ A magnitude 5+ within 100 km: inspect the tailings dam and pit walls." : "") : h("p", { class: "muted small" }, "Checking this week's earthquakes…")),
    title("What a year is worth"),
    econPanel(ctx, m),
    view !== "grievances" ? h("div", {}, title("Grievances"),
      q.length ? list(...q.slice(0, 3).map((i) => issueRow(ctx, m, i))) : empty("No open grievances."),
      h("div", { class: "row" }, h("button", { class: "link-btn", onclick: () => grievanceScreen(ctx, m, null, () => save(m), () => openMining(ctx)) }, "+ Log a grievance"),
        h("button", { class: "link-btn", onclick: () => { view = "grievances"; draw(app, m); home(ctx, m); } }, "The register"))) : "",
    title("Permits"),
    due.length ? list(...due.map((d) => permitRow(ctx, m, d))) : empty("Nothing due in the next four months."),
    h("button", { class: "link-btn", onclick: () => permitsScreen(ctx, m) }, "All permits"),
    title("Sites"),
    list(...m.sites.map((s) => row(K(s.kind)?.emoji ?? "•", s.name, [K(s.kind)?.label ?? s.kind, s.people ? `${fmt(s.people)} people` : ""].filter(Boolean).join(" · "), () => void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 2500 })))),
    siteAdder(ctx, SITE_KINDS, (s) => { m.sites.push(s); save(m); found.for = undefined; openMining(ctx); }),
    h("div", { class: "mp-foot" }, h("span", {}, m.demo ? "A demo mine: the mine, people and figures are made up; the towns, ports and corridors are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${m.name}?`)) { mines.remove(m.id); map?.clear(); openMining(ctx); } } }, "Remove")),
    note("Towns and their populations are from Natural Earth (larger places only; villages are often missing). Heights are from the Terrarium elevation tiles. Earthquakes are the USGS feed for the past week. Carbon uses common per tonne-km factors. Economics are a simple one-year view: no capital, tax or discounting."));
}

function chainLines(m: Mine) {
  const byId = new Map(m.sites.map((s) => [s.id, s]));
  const goods = m.moves.flatMap((mv) => { const a = byId.get(mv.from), b = byId.get(mv.to); return a && b && mv.kind === "goods" ? [{ mv, a, b, f: moveFacts(mv, a, b) }] : []; });
  const tkm = goods.reduce((s, x) => s + (x.f.tonnes ?? 0) * x.f.km, 0), co2 = m.moves.reduce((s, mv) => { const a = byId.get(mv.from), b = byId.get(mv.to); return a && b ? s + moveFacts(mv, a, b).co2t : s; }, 0);
  const ports = m.sites.filter((s) => s.kind === "port");
  const out = [`${fmt(tkm / 1e6, 1)} million tonne-km a year; ${fmt(co2)} t CO₂ from moving things.`];
  // Each export route to the smelter: distance, time and carbon per tonne of concentrate.
  for (const p of ports) {
    const legs: typeof goods = [];
    let at = p.id;
    for (let guard = 0; guard < 6; guard++) { const leg = goods.find((x) => x.mv.to === at && /concentrate/i.test(x.mv.what)); if (!leg) break; legs.unshift(leg); at = leg.mv.from; }
    const onward = goods.find((x) => x.mv.from === p.id);
    if (onward) legs.push(onward);
    if (legs.length < 2) continue;
    const km = legs.reduce((s, x) => s + x.f.km, 0), hours = legs.reduce((s, x) => s + x.f.hours, 0), co2PerT = legs.reduce((s, x) => s + (x.f.co2t / Math.max(1, x.f.tonnes ?? 1)) * 1000, 0);
    out.push(`Via ${p.name.replace(/^Port of /, "")}: ${kmText(km)}, about ${hoursText(hours)} and ${fmt(co2PerT)} kg CO₂ per tonne to the smelter.`);
  }
  return out;
}

function econPanel(ctx: WorkCtx, m: Mine) {
  const e = economics(m.econ);
  const set = (k: keyof Economics) => (v: string) => { (m.econ as unknown as Record<string, number | string>)[k] = k === "gradeUnit" ? v : Number(v) || 0; save(m); openMining(ctx); };
  const perOz = m.econ.gradeUnit === "g/t";
  return h("div", {},
    lines(
      `${fmt(e.contained)} ${e.unit} of ${commodity(m.commodity)?.name.toLowerCase() ?? "metal"} in the ore, ${fmt(e.recovered)} ${e.unit} recovered.`,
      `Revenue ${usd(e.revenue)}, cost ${usd(e.cost)}: margin ${usd(e.margin)} (${fmt(e.perTOre, 1)} USD a tonne of ore).`,
      `Breaks even at ${fmt(e.breakeven)} USD per ${perOz ? "ounce" : "tonne"}, against ${fmt(m.econ.price)} now.`),
    h("details", {}, h("summary", { class: "link-btn" }, "Change the numbers"),
      field("Commodity", select(m.commodity, COMMODITIES.map((c) => [c.id, c.name] as [string, string]), (v) => { m.commodity = v; save(m); openMining(ctx); })),
      field("Ore a year", input(m.econ.oreMt, set("oreMt"), { type: "number", step: "any", min: 0, title: "million tonnes" })),
      field("Grade", input(m.econ.grade, set("grade"), { type: "number", step: "any", min: 0 })),
      field("Grade unit", select(m.econ.gradeUnit, [["%", "% metal"], ["g/t", "grams a tonne"]], set("gradeUnit"))),
      field("Recovery %", input(m.econ.recovery, set("recovery"), { type: "number", min: 0, max: 100 })),
      field("Payable %", input(m.econ.payable, set("payable"), { type: "number", min: 0, max: 100 })),
      field(perOz ? "Price $/oz" : "Price $/t", input(m.econ.price, set("price"), { type: "number", min: 0 })),
      field("Cost $/t ore", input(m.econ.costPerT, set("costPerT"), { type: "number", step: "any", min: 0 }))));
}

function issueRow(ctx: WorkCtx, m: Mine, i: ReturnType<typeof issueQueue>[number]) {
  const p = m.parties.find((x) => x.id === i.party);
  return row({ color: i.severity === 3 ? "#c4513a" : i.severity === 2 ? "#d19a2e" : "#8c8f87" }, i.title, [p?.name, i.status === "waiting" ? "waiting on someone" : "", i.stale ? "no update in 2 weeks" : ""].filter(Boolean).join(" · "),
    () => grievanceScreen(ctx, m, m.issues.find((y) => y.id === i.id) ?? null, () => save(m), () => openMining(ctx)), ageBadge(i.age, "days", i.stale));
}

function permitRow(ctx: WorkCtx, m: Mine, d: Dated & { left: number }) {
  return row(d.left < 0 ? "⛔️" : d.left <= 30 ? "⚠️" : "📄", d.title, d.left < 0 ? `Expired ${-d.left} days ago` : `Expires ${d.date}`, () => permitsScreen(ctx, m), ageBadge(Math.abs(d.left), d.left < 0 ? "days ago" : "days", d.left <= 30));
}

function permitsScreen(ctx: WorkCtx, m: Mine) {
  const t = today();
  const what = h("input", { class: "pro-url", placeholder: "Permit or licence" }) as HTMLInputElement;
  const when = h("input", { class: "pro-url", type: "date", value: addDays(t, 365) }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...PERMIT_KINDS.map((k) => h("option", { value: k }, k))) as HTMLSelectElement;
  ctx.show("Permits", () => openMining(ctx),
    list(...dueSoon(m.permits, t, 100_000).map((d) => h("div", { class: "row" }, permitRow(ctx, m, d),
      h("button", { class: "link-btn", onclick: () => { const v = prompt("New expiry date (YYYY-MM-DD)", addDays(d.date, 365)); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { m.permits.find((x) => x.id === d.id)!.date = v; save(m); permitsScreen(ctx, m); } } }, "Renewed")))),
    h("div", { class: "po-add" }, what, when, kind, h("button", { class: "pill-btn", onclick: () => { if (!what.value.trim()) return; m.permits.push({ id: newId(), title: what.value.trim(), date: when.value, kind: kind.value }); save(m); permitsScreen(ctx, m); } }, "Add")));
}

function partyAdder(ctx: WorkCtx, m: Mine) {
  const name = h("input", { class: "pro-url", placeholder: "A community, leader, regulator, NGO…" }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...Object.entries(PARTY_KINDS).map(([k, v]) => h("option", { value: k }, `${v.emoji} ${v.label}`))) as HTMLSelectElement;
  return h("div", { class: "po-add" }, name, kind, h("button", { class: "pill-btn", onclick: () => { const v = name.value.trim(); if (!v) return; m.parties.push({ id: newId(), name: v, kind: kind.value, mood: "neutral", log: [] }); save(m); openMining(ctx); } }, "Add"));
}

function partyEdit(ctx: WorkCtx, m: Mine, p: Party) {
  partyScreen(ctx, p, PARTY_KINDS, () => save(m), () => { m.parties = m.parties.filter((x) => x !== p); save(m); openMining(ctx); }, () => openMining(ctx));
}

// ---- Tailings: the flow path ---------------------------------------------------------------------

const GRID = 81, HALF_KM = 20;

/** Every place that could be downstream: towns, mapped communities and the mine's own camp and villages. */
function flowPlaces(m: Mine) {
  const towns = (found.towns ?? []).map((t) => ({ name: `${fmt(t.people)} people (town)`, lon: t.lon, lat: t.lat, people: t.people as number | undefined }));
  const mapped = m.parties.filter((p) => p.lon !== undefined && ["community", "landholder", "leader"].includes(p.kind)).map((p) => ({ name: p.name, lon: p.lon!, lat: p.lat!, people: undefined as number | undefined }));
  const own = m.sites.filter((s) => ["camp", "community", "office"].includes(s.kind) || s.people).filter((s) => s.kind !== "tailings").map((s) => ({ name: s.name, lon: s.lon, lat: s.lat, people: s.people }));
  return [...towns, ...mapped, ...own];
}

/** The steepest way down from the dam over a 40 km square of elevation, and who lives within 2 km of it. */
async function traceFlow(m: Mine, dam: { lon: number; lat: number }, _near: unknown): Promise<Flow | null> {
  const step = (2 * HALF_KM) / (GRID - 1), kx = 111.32 * Math.cos((dam.lat * Math.PI) / 180), ky = 110.54;
  const pts: [number, number][] = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) pts.push([dam.lon + (-HALF_KM + i * step) / kx, dam.lat + (HALF_KM - j * step) / ky]);
  const hs = await elevation.sample(pts, Math.min(13, zoomForSpacing(step * 1000, dam.lat)));
  const c = (GRID - 1) / 2;
  const cells = flowPath(hs, GRID, [c, c]);
  const path = cells.map(([i, j]) => pts[j * GRID + i]);
  found.towns ??= townsNear(await populationPoints().catch(() => []), dam, 50);
  const down = downstream(flowPlaces(m), path, 2);
  const par = down.reduce((s, d) => s + (d.p.people ?? 0), 0);
  return { path, down: down.map((d) => ({ name: d.p.name, people: d.p.people, along: d.along, km: d.km })), par, partial: down.some((d) => d.p.people === undefined), km: pathKm(path) };
}

function tailingsSummary() {
  const f = found.flow;
  if (!f) return undefined;
  const cls = gistmClass(f.partial ? Math.max(f.par, 11) : f.par);
  return { cls: cls.label, par: f.par, partial: f.partial, places: f.down.map((d) => `${d.name.replace(/ \(demo\)/, "")} (${kmText(d.along)})`) };
}

function tailingsLines(f: Flow) {
  const cls = gistmClass(f.partial ? Math.max(f.par, 11) : f.par);
  return h("div", {},
    h("div", { class: "po-kpis" },
      h("div", { class: "po-kpi" }, h("strong", { style: `color:${cls.color}` }, cls.label), h("span", {}, "GISTM consequence (population)")),
      h("div", { class: "po-kpi" }, h("strong", {}, fmt(f.par)), h("span", {}, f.partial ? "people counted (some unknown)" : "people at risk")),
      h("div", { class: "po-kpi" }, h("strong", {}, String(f.down.length)), h("span", {}, "places within 2 km")),
      h("div", { class: "po-kpi" }, h("strong", {}, kmText(f.km)), h("span", {}, "path traced"))),
    lines(
      f.down.length ? `Downstream along the path, nearest first: ${f.down.map((d) => `${d.name.replace(/ \(demo\)/, "")} (${kmText(d.along)} down${d.people ? `, ${fmt(d.people)} people` : ""})`).join("; ")}.` : "No mapped towns, communities or camps within 2 km of the path.",
      f.partial ? "Some communities have no population recorded, so the class is at least High until they're counted." : "",
      "The red line is the steepest way down from the dam on elevation sampled every 500 m: where released tailings would head first. A screening view for siting sirens, drills and evacuation routes, not a dam-break study."));
}

/** The mine as a hologram: the pit, plant, dam and camp on the real ground, the dam ringed by who lives downhill. */
async function mineHologram(app: App, m: Mine) {
  const pit = m.sites.find((s) => s.kind === "pit" || s.kind === "underground") ?? m.sites[0];
  if (!pit) { app.toast("Add the mine's sites first.", 3000); return; }
  const near = m.sites.filter((s) => kmBetween(s, pit) < 8);
  const lon = near.reduce((a, s) => a + s.lon, 0) / near.length, lat = near.reduce((a, s) => a + s.lat, 0) / near.length;
  const span = Math.max(1.2, ...near.map((s) => kmBetween(s, { lon, lat }))) * 2600;
  const colors: Record<string, string> = { pit: "#ffb347", underground: "#ffb347", plant: "#8fa8f2", tailings: "#c4513a", waste: "#9a7552", camp: "#5b9467", airstrip: "#8b5fa8" };
  const e = economics(m.econ), t = today();
  const hl = await openSpace(app, {
    name: m.name, kicker: [commodity(m.commodity)?.name, m.country, "mine"].filter(Boolean).join(" · "), lon, lat, size: Math.min(9000, span), tint: "amber",
    markers: near.map((s) => ({ lon: s.lon, lat: s.lat, color: colors[s.kind] ?? "#ffffff", label: `${SITE_KINDS[s.kind as keyof typeof SITE_KINDS]?.emoji ?? ""} ${s.name.split(",")[0]}`, pulse: s.kind === "tailings", ring: s.kind === "tailings" ? Math.min(3000, span / 4) : undefined, height: span / 25 })),
  });
  hl.setHud([
    { k: "Revenue a year", v: usdShort(e.revenue) }, { k: "Margin", v: usdShort(e.margin) },
    { k: "Open grievances", v: String(issueQueue(m.issues, t).length) }, { k: "Permits due, 30 d", v: String(dueSoon(m.permits, t, 30).length) },
  ], m.sites.some((s) => s.kind === "tailings") ? "The red ring: who lives downhill of the tailings dam" : undefined);
}
