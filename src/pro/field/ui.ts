// Field Ops: a programme on the map. One screen for the programme (people
// served, who is too far from each service, incidents, deliveries due) and
// three ways to see it: coverage (communities within reach of water, health,
// schooling or food, and where one more site would reach the most people),
// the supply lines as living streams, and natural hazards and earthquakes
// near the people it serves.
import type { App } from "../../app";
import { recentQuakes } from "../../data/quakes";
import { naturalEvents } from "../../live/news";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { addDays, dueSoon, fmt, issueQueue, kmText, moodOf, moveFacts, ring, today, type Party } from "../kit/ops";
import { ageBadge, empty, field, frame, hoursText, input, issueScreen, kpis, lines, list, moveScreen, OpsMap, partyScreen, row, siteAdder, stream, title } from "../kit/ui";
import { demoProgramme } from "./demo";
import { donorReport, importCommunities, planBlock, responsePanel, suppliesPanel, walkText } from "./mneUi";
import { gapMatrix, stockCover } from "./mne";
import { bestNextSite, defaultReach, gaps, hazardsNear, needsTally, PARTY_KINDS, SERVICES, SITE_KINDS, type Community, type Programme, type Service } from "./model";

const programmes = new ListStore<Programme>("atlas.pro.field.v1");
const current = () => programmes.all()[0];
const save = (p: Programme) => programmes.save(p);
let map: OpsMap | null = null;
type View = "coverage" | "response" | "supplies" | "supply" | "hazards";
let view: View = "coverage";
let service: Service = "health";
const K = (k: string) => SITE_KINDS[k as keyof typeof SITE_KINDS];
type Hazard = { x: { lon: number; lat: number; title: string; kind: string }; km: number };
let hazards: { for: string; list: Hazard[] } | null = null;

function draw(app: App, p: Programme) {
  map ??= new OpsMap(app, "pro:field", "#5b9467");
  const fs: WorkFeature[] = [], flows = [];
  if (view === "coverage") {
    const sv = SERVICES[service], g = gaps(p, service), best = bestNextSite(p, service);
    for (const s of p.sites.filter((x) => x.kind === sv.site)) fs.push({ id: `r${s.id}`, kind: "area", pts: ring(s.lon, s.lat, p.reach[service]), color: sv.color, fill: 0.12 }, { id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: sv.color, label: `${sv.emoji} ${s.name}` });
    for (const r of g.rows) fs.push({ id: r.c.id, kind: "point", pts: [[r.c.lon, r.c.lat]], color: r.covered ? "#5b9467" : "#c4513a", label: `${r.c.name} · ${fmt(r.c.people)}${r.covered ? "" : ` · ${Number.isFinite(r.km) ? kmText(r.km) : "none"}`}` });
    if (best) fs.push({ id: "best", kind: "line", pts: [...ring(best.at.lon, best.at.lat, p.reach[service]), ring(best.at.lon, best.at.lat, p.reach[service])[0]], color: "#e1b843", dashed: true });
  } else if (view === "supply") {
    const byId = new Map(p.sites.map((s) => [s.id, s]));
    const biggest = Math.max(1, ...p.moves.filter((m) => m.kind === "goods").map((m) => m.amount));
    for (const m of p.moves) { const a = byId.get(m.from), b = byId.get(m.to); if (!a || !b) continue; const s = stream(a, b, m, m.kind === "goods" ? biggest : m.amount); fs.push(s.line); flows.push(s.flow); }
    for (const s of p.sites) fs.push({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: "#5b9467", label: `${K(s.kind)?.emoji ?? "•"} ${s.name}` });
  } else if (view === "response" || view === "supplies") {
    const gm = gapMatrix(p, p.activities ?? []);
    for (const r of gm.rows) { const missing = r.cells.filter((x) => x.gap).map((x) => x.sector); fs.push({ id: r.c.id, kind: "point", pts: [[r.c.lon, r.c.lat]], color: missing.length ? "#c4513a" : "#5b9467", label: `${r.c.name}${missing.length ? ` · no ${missing.join(", ").toLowerCase()}` : ""}` }); }
    if (view === "supplies") for (const { s, weeks } of stockCover(p.stock ?? [])) { const site = p.sites.find((x) => x.id === s.site); if (site) fs.push({ id: `st${s.id}`, kind: "point", pts: [[site.lon + 0.01, site.lat + 0.01]], color: weeks < 2 ? "#c4513a" : weeks < 4 ? "#d19a2e" : "#5b9467", label: `${s.item} · ${Number.isFinite(weeks) ? `${weeks.toFixed(1)} wk` : "—"}` }); }
  } else {
    for (const c of p.communities) fs.push({ id: c.id, kind: "point", pts: [[c.lon, c.lat]], color: "#8c8f87", label: c.name });
    for (const [i, r] of (hazards?.list ?? []).entries()) fs.push({ id: `h${i}`, kind: "point", pts: [[r.x.lon, r.x.lat]], color: "#d19a2e", label: `${r.x.title} · ${kmText(r.km)}` });
  }
  map.draw(`Programme · ${p.name}`, fs, flows);
}

function show(app: App, p: Programme) {
  if (view === "supply") frame(app, p.name, p.sites);
  else frame(app, p.name, [...p.communities, ...(view === "hazards" ? (hazards?.list ?? []).map((r) => r.x) : [])], 20_000);
}

async function lookHazards(ctx: WorkCtx, p: Programme) {
  if (hazards?.for === p.id) return;
  const [ev, qs] = await Promise.all([naturalEvents().catch(() => []), recentQuakes().catch(() => [])]);
  const all = [...ev.map((e) => ({ lon: e.lon, lat: e.lat, title: e.title, kind: e.kind })), ...qs.map((q) => ({ lon: q.lon, lat: q.lat, title: `M${q.mag.toFixed(1)} earthquake`, kind: "earthquakes" }))];
  hazards = { for: p.id, list: hazardsNear(all, p, 400) };
  if (current()?.id === p.id && view === "hazards") { draw(ctx.app, p); home(ctx, p); }
}

export function openField(ctx: WorkCtx) {
  const p = current();
  if (!p) return start(ctx);
  draw(ctx.app, p);
  home(ctx, p);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your programme's name" }) as HTMLInputElement;
  ctx.show("Field Ops", ctx.home,
    h("p", {}, "Run a humanitarian or development programme on the map: the communities you serve and what they need, your warehouses, clinics, water points and schools, who is too far from each, where one more site would reach the most people, the supply lines that feed it all, incidents, deliveries, and natural hazards nearby."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save({ id: newId(), name: name.value.trim() || "My programme", sites: [], communities: [], moves: [], parties: [], incidents: [], deliveries: [], reach: defaultReach(), created: Date.now() }); openField(ctx); } }, "Start the programme"),
    h("button", { class: "pill-btn", onclick: () => { const p = demoProgramme(); save(p); view = "coverage"; openField(ctx); show(ctx.app, p); } }, "Or try a demo: water, health and schooling in Turkana, Kenya"));
}

function home(ctx: WorkCtx, p: Programme) {
  const { app } = ctx;
  const t = today();
  const people = p.communities.reduce((s, c) => s + c.people, 0);
  const worst = (Object.keys(SERVICES) as Service[]).map((s) => ({ s, g: gaps(p, s) })).sort((a, b) => b.g.missed - a.g.missed)[0];
  const q = issueQueue(p.incidents, t), due = dueSoon(p.deliveries, t, 14);
  const late = due.filter((d) => d.left < 0);
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), onclick: () => { view = id; draw(app, p); home(ctx, p); show(app, p); if (id === "hazards") void lookHazards(ctx, p); } }, label);
  ctx.show("Field Ops", ctx.home,
    h("input", { class: "mp-name", value: p.name, "aria-label": "Programme name", onchange: (e: Event) => { p.name = (e.target as HTMLInputElement).value || p.name; save(p); } }),
    kpis(
      [fmt(people), "people served"],
      [worst ? fmt(worst.g.missed) : "—", worst ? `too far from ${SERVICES[worst.s].label.toLowerCase()}` : "beyond reach", !!worst?.g.missed, () => { if (worst) { service = worst.s; view = "coverage"; draw(app, p); home(ctx, p); } }],
      [String(q.length), "open incidents", q.some((x) => x.severity === 3)],
      [String(late.length || due.length), late.length ? "deliveries late" : "due in 14 days", late.length > 0]),
    h("div", { class: "chips wrap" }, tab("coverage", "Coverage"), tab("response", "Response (4W)"), tab("supplies", "Supplies"), tab("supply", "Supply lines"), tab("hazards", "Hazards nearby")),
    h("button", { class: "pill-btn", onclick: () => donorReport(p) }, "Donor report"),
    view === "coverage" ? coveragePanel(ctx, p) : view === "supply" ? supplyPanel(ctx, p) :
    view === "response" ? responsePanel(ctx, p, () => save(p), () => openField(ctx)) :
    view === "supplies" ? suppliesPanel(p, () => save(p), () => openField(ctx)) :
      hazards?.for === p.id ? h("div", {}, lines(hazards.list.length ? `${hazards.list.length} natural events and earthquakes within 400 km of the people you serve.` : "No open natural events or recent earthquakes within 400 km."),
        list(...hazards.list.slice(0, 8).map((r) => row({ color: "#d19a2e" }, r.x.title, `${r.x.kind.replace(/([A-Z])/g, " $1").toLowerCase()} · ${kmText(r.km)} from the nearest community or site`, () => void flyToPlace(app.globe, { name: r.x.title, lon: r.x.lon, lat: r.x.lat, radius: 60_000 }))))) : h("p", { class: "muted small" }, "Checking NASA's natural events and this week's earthquakes…"),
    title("Incidents"),
    q.length ? list(...q.map((i) => row({ color: i.severity === 3 ? "#c4513a" : i.severity === 2 ? "#d19a2e" : "#8c8f87" }, i.title, [i.status === "waiting" ? "waiting on someone" : "", i.stale ? "no update in 2 weeks" : ""].filter(Boolean).join(" · ") || (i.site ? p.sites.find((s) => s.id === i.site)?.name ?? "" : ""),
      () => issueScreen(ctx, i, p.parties, p.sites, (x) => { Object.assign(p.incidents.find((y) => y.id === x.id)!, x); save(p); openField(ctx); }, () => openField(ctx), "incident"), ageBadge(i.age, "days", i.stale)))) : empty("No open incidents."),
    h("button", { class: "link-btn", onclick: () => issueScreen(ctx, null, p.parties, p.sites, (x) => { p.incidents.push(x); save(p); openField(ctx); }, () => openField(ctx), "incident") }, "+ An incident"),
    title("Deliveries and deadlines"),
    due.length ? list(...due.map((d) => row(d.left < 0 ? "⏰" : d.kind === "report" ? "📝" : "📦", d.title, d.left < 0 ? `${-d.left} ${d.left === -1 ? "day" : "days"} late` : d.left === 0 ? "Today" : `In ${d.left} days · ${d.date}`,
      () => { if (confirm(`Mark "${d.title}" done?`)) { p.deliveries = p.deliveries.filter((x) => x.id !== d.id); save(p); openField(ctx); } }, ageBadge(Math.abs(d.left), d.left < 0 ? "late" : "days", d.left < 0)))) : empty("Nothing due in the next two weeks."),
    deliveryAdder(ctx, p),
    title("People you work with"),
    list(...p.parties.map((x) => row({ color: moodOf(x.mood).color }, x.name, `${PARTY_KINDS[x.kind as keyof typeof PARTY_KINDS]?.label ?? x.kind} · ${moodOf(x.mood).label}${x.log[0] ? ` · ${x.log[0].text}` : ""}`, () => partyEdit(ctx, p, x)))),
    partyAdder(ctx, p),
    h("div", { class: "mp-foot" }, h("span", {}, p.demo ? "A demo programme: its figures and incidents are made up; the towns and routes are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${p.name}?`)) { programmes.remove(p.id); map?.clear(); openField(ctx); } } }, "Remove")),
    note("Distances are straight lines; real journeys on foot or by road are longer, so treat the reach as a first cut. Natural events are NASA EONET's open events; earthquakes are the USGS feed for the past week."));
}

function coveragePanel(ctx: WorkCtx, p: Programme) {
  const sv = SERVICES[service], g = gaps(p, service), best = bestNextSite(p, service);
  const chip = (s: Service) => h("button", { class: "chip" + (s === service ? " on" : ""), style: s === service ? `--c:${SERVICES[s].color}` : "", onclick: () => { service = s; draw(ctx.app, p); home(ctx, p); } }, `${SERVICES[s].emoji} ${SERVICES[s].label}`);
  const needs = needsTally(p).find((x) => x.s === service)?.people ?? 0;
  return h("div", {},
    h("div", { class: "chips wrap" }, ...(Object.keys(SERVICES) as Service[]).map(chip)),
    lines(
      `${fmt(g.reached)} people live within ${p.reach[service]} km of a ${sv.site === "distribution" ? "distribution point" : K(sv.site)?.label.toLowerCase()}; ${fmt(g.missed)} live further.`,
      needs ? `Communities asking for ${sv.label.toLowerCase()}: ${fmt(needs)} people.` : "",
      best ? `💡 A new ${K(sv.site)?.label.toLowerCase() ?? "site"} at ${best.at.name} would bring ${fmt(best.people)} more people within ${p.reach[service]} km${best.reaches.length > 1 ? ` (${best.reaches.map((c) => c.name).join(", ")})` : ""}.` : g.missed ? "" : "Everyone is within reach."),
    field("Too far is", input(p.reach[service], (v) => { p.reach[service] = Math.max(0.5, Number(v) || p.reach[service]); save(p); draw(ctx.app, p); openField(ctx); }, { type: "number", min: 0.5, step: 0.5, title: "kilometres" })),
    title("Beyond reach"),
    g.out.length ? list(...g.out.map((r) => row({ color: "#c4513a" }, r.c.name, `${fmt(r.c.people)} people · ${Number.isFinite(r.km) ? `${kmText(r.km)} (${walkText(r.km)}) to ${r.site?.name}` : "no site yet"}`, () => communityScreen(ctx, p, r.c)))) : empty("No one."),
    best ? h("button", { class: "pill-btn", onclick: () => { p.sites.push({ id: newId(), name: `${K(sv.site)?.label ?? "Site"}, ${best.at.name} (planned)`, kind: sv.site, lon: best.at.lon, lat: best.at.lat }); save(p); draw(ctx.app, p); openField(ctx); } }, `Plan the ${K(sv.site)?.label.toLowerCase() ?? "site"} at ${best.at.name}`) : "",
    best ? planBlock(p, service, (ats) => { for (const at of ats) p.sites.push({ id: newId(), name: `${K(sv.site)?.label ?? "Site"}, ${at.name} (planned)`, kind: sv.site, lon: at.lon, lat: at.lat }); save(p); draw(ctx.app, p); openField(ctx); }) : "",
    title("Communities"),
    list(...[...p.communities].sort((a, b) => b.people - a.people).map((c) => row("🏘", c.name, `${fmt(c.people)} people · needs ${c.needs.map((n) => SERVICES[n].label.toLowerCase()).join(", ") || "not recorded"}`, () => communityScreen(ctx, p, c)))),
    communityAdder(ctx, p),
    h("button", { class: "link-btn", onclick: () => void importCommunities(ctx, p, () => save(p), () => { draw(ctx.app, p); openField(ctx); }) }, "Import communities (Kobo, ODK or a spreadsheet)"),
    title("Sites"),
    list(...p.sites.map((s) => row(K(s.kind)?.emoji ?? "•", s.name, K(s.kind)?.label ?? s.kind, () => void flyToPlace(ctx.app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 3000 })))),
    siteAdder(ctx, SITE_KINDS, (s) => { p.sites.push(s); save(p); draw(ctx.app, p); openField(ctx); }));
}

function supplyPanel(ctx: WorkCtx, p: Programme) {
  const byId = new Map(p.sites.map((s) => [s.id, s]));
  const rows = p.moves.flatMap((m) => { const a = byId.get(m.from), b = byId.get(m.to); return a && b ? [{ m, a, b, f: moveFacts(m, a, b) }] : []; });
  const longest = rows.filter((r) => r.m.mode !== "digital").sort((x, y) => y.f.hours - x.f.hours)[0];
  return h("div", {},
    lines(
      longest ? `Longest leg: ${longest.m.what} from ${longest.a.name} to ${longest.b.name}, ${kmText(longest.f.km)}, about ${hoursText(longest.f.hours)}.` : "",
      `${fmt(rows.reduce((s, r) => s + (r.f.tonnes ?? 0), 0))} t of goods a year moved; ${fmt(rows.reduce((s, r) => s + r.f.co2t, 0), 1)} t CO₂.`),
    rows.length ? list(...rows.map((r) => row({ color: r.m.kind === "goods" ? "#d19a2e" : r.m.kind === "people" ? "#3563d6" : "#8b5fa8" }, `${r.m.what}: ${r.a.name.split(",")[0]} → ${r.b.name.split(",")[0]}`,
      [`${fmt(r.m.amount)} ${r.m.unit} a ${r.m.per}`, r.m.mode !== "digital" ? `${kmText(r.f.km)} · ${hoursText(r.f.hours)}` : ""].filter(Boolean).join(" · "),
      () => moveScreen(ctx, p.sites, SITE_KINDS, r.m, () => { save(p); openField(ctx); }, (x) => { p.moves = p.moves.filter((y) => y !== x); save(p); openField(ctx); }, () => openField(ctx), "Medicines, rations, staff…")))) : empty("Add a warehouse and where supplies go."),
    p.sites.length >= 2 ? h("button", { class: "link-btn", onclick: () => moveScreen(ctx, p.sites, SITE_KINDS, null, (x) => { p.moves.push(x); save(p); openField(ctx); }, () => {}, () => openField(ctx), "Medicines, rations, staff…") }, "+ A supply line") : "");
}

function communityScreen(ctx: WorkCtx, p: Programme, c: Community) {
  ctx.show(c.name, () => openField(ctx),
    field("People", input(c.people, (v) => { c.people = Math.max(0, Number(v) || 0); save(p); }, { type: "number", min: 0 })),
    h("div", { class: "chips wrap" }, ...(Object.keys(SERVICES) as Service[]).map((s) => h("button", { class: "chip" + (c.needs.includes(s) ? " on" : ""), onclick: () => { c.needs = c.needs.includes(s) ? c.needs.filter((x) => x !== s) : [...c.needs, s]; save(p); communityScreen(ctx, p, c); } }, `${SERVICES[s].emoji} Needs ${SERVICES[s].label.toLowerCase()}`))),
    lines(...(Object.keys(SERVICES) as Service[]).map((s) => { const r = gaps(p, s).rows.find((x) => x.c.id === c.id)!; return `${SERVICES[s].emoji} ${SERVICES[s].label}: ${Number.isFinite(r.km) ? `${kmText(r.km)} to ${r.site?.name}` : "no site yet"}${r.covered ? "" : " (too far)"}`; })),
    field("Notes", input(c.notes ?? "", (v) => { c.notes = v || undefined; save(p); })),
    h("button", { class: "link-btn", onclick: () => void flyToPlace(ctx.app.globe, { name: c.name, lon: c.lon, lat: c.lat, radius: 8000 }) }, "Show on the map"),
    h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${c.name}?`)) { p.communities = p.communities.filter((x) => x !== c); save(p); openField(ctx); } } }, "Remove"));
}

function communityAdder(ctx: WorkCtx, p: Programme) {
  const where = h("input", { class: "pro-url", placeholder: "A village, town or camp" }) as HTMLInputElement;
  const n = h("input", { class: "pro-url po-unit", type: "number", min: 1, placeholder: "People" }) as HTMLInputElement;
  const go = async () => {
    const q = where.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (!r) { ctx.app.toast("Couldn't find that place. Try adding the district or country.", 4000); return; }
    p.communities.push({ id: newId(), name: q, lon: r.lon, lat: r.lat, people: Number(n.value) || 1000, needs: [] });
    save(p); draw(ctx.app, p); openField(ctx);
  };
  return h("div", { class: "po-add" }, where, n, h("button", { class: "pill-btn", onclick: () => void go() }, "Add"));
}

function deliveryAdder(ctx: WorkCtx, p: Programme) {
  const what = h("input", { class: "pro-url", placeholder: "A delivery, report or deadline" }) as HTMLInputElement;
  const when = h("input", { class: "pro-url", type: "date", value: addDays(today(), 7) }) as HTMLInputElement;
  return h("div", { class: "po-add" }, what, when, h("button", { class: "pill-btn", onclick: () => { if (!what.value.trim()) return; p.deliveries.push({ id: newId(), title: what.value.trim(), date: when.value, kind: /report/i.test(what.value) ? "report" : "delivery" }); save(p); openField(ctx); } }, "Add"));
}

function partyAdder(ctx: WorkCtx, p: Programme) {
  const name = h("input", { class: "pro-url", placeholder: "Community leaders, a ministry, a partner, a donor…" }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...Object.entries(PARTY_KINDS).map(([k, v]) => h("option", { value: k }, `${v.emoji} ${v.label}`))) as HTMLSelectElement;
  return h("div", { class: "po-add" }, name, kind, h("button", { class: "pill-btn", onclick: () => { const v = name.value.trim(); if (!v) return; p.parties.push({ id: newId(), name: v, kind: kind.value, mood: "neutral", log: [] }); save(p); openField(ctx); } }, "Add"));
}

function partyEdit(ctx: WorkCtx, p: Programme, x: Party) {
  partyScreen(ctx, x, PARTY_KINDS, () => save(p), () => { p.parties = p.parties.filter((y) => y !== x); save(p); openField(ctx); }, () => openField(ctx));
}
