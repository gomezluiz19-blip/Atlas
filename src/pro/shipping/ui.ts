// Freight Desk on the map: a forwarder's or shipper's cargo at sea. Every
// shipment on its sea route with the ship where it is now, when it really
// arrives against what was promised, and what to do about it. Five ways to
// look: the board (what needs attention), routes (chokepoints, and what
// closing one does to your cargo), ports (what's arriving where and the wait
// to berth), carbon (per shipment and customer, the EU ETS bill, and what
// slowing down saves) and risk (warning areas, sanctions, ships gone quiet,
// rough seas ahead).
import type { App } from "../../app";
import { getJson } from "../../data/http";
import { ports as loadPorts } from "../../data/infra";
import { balticShips, BALTIC, shipsWorldwide, streamShips, type Track } from "../../live/traffic";
import { h } from "../../ui/dom";
import { flyToPlace } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { parseCsv } from "../office/model";
import { fmt, today } from "../kit/ops";
import { empty, field, frame, input, kpis, lines, list, OpsMap, row, select, title } from "../kit/ui";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { usd, usdShort } from "../mining/model";
import {
  anchoredNear, arrivalsByPort, attention, co2, customerUpdate, daysBetween, demurrage, DOCS, eta, etsCost, risks, slowSteam, STAGES, tooBigForPanama, VESSEL_TYPES, voyage, WARNING_AREAS, whatIf,
  type Desk, type Eta, type Port, type Shipment, type Stage, type Vessel, type VesselType,
} from "./model";
import { findPort, PORTS } from "./ports";
import { along, CHOKEPOINTS, NM, NODES, seaDays, splitRoute } from "./sea";
import { demoDesk } from "./demo";

const store = new ListStore<Desk>("atlas.pro.shipping.v1");
const current = () => store.all()[0];
const save = (d: Desk) => store.save(d);
let map: OpsMap | null = null;
type View = "board" | "routes" | "ports" | "carbon" | "risk";
let view: View = "board";
let focusChoke: string | null = null;
let extraPorts: Port[] = [];
void loadPorts().then((ps) => { extraPorts = ps.map((p) => ({ name: p.name, lon: p.lon, lat: p.lat, country: "" })); }).catch(() => {});

const C = { ok: "#0a84ff", late: "#ff453a", risk: "#ff9f0a", done: "#8e8e93", port: "#5e5ce6", alt: "#ff9f0a", early: "#30d158" };
const nm = (km: number) => `${fmt(Math.round(km / NM))} nm`;
const tco2 = (t: number) => (t >= 100 ? `${fmt(Math.round(t))} t` : `${fmt(t, 1)} t`);
const eur = (v: number) => `€${v >= 10_000 ? `${fmt(Math.round(v / 1000))}k` : fmt(Math.round(v))}`;
const vesselOf = (d: Desk, s: Shipment) => d.vessels.find((v) => v.id === s.vessel);
const statusColor = (e: Eta, worst: number) => (worst >= 3 || e.late >= 7 ? C.late : worst >= 2 || e.late >= 3 ? C.risk : C.ok);
const lateText = (e: Eta) => (e.basis === "arrived" ? (e.late > 0 ? `arrived ${e.late} d late` : "arrived") : e.late > 0 ? `${e.late} d late` : e.late < 0 ? `${-e.late} d early` : "on time");

// ---- The map ---------------------------------------------------------------------------------------

function draw(app: App, d: Desk, only?: Shipment) {
  map ??= new OpsMap(app, "pro:shipping", "#0a84ff");
  const now = Date.now(), fs: WorkFeature[] = [];
  const ports = new Map<string, Port>();
  const items = only ? [{ s: only, e: eta(d, only, now), f: risks(d, only, eta(d, only, now), today()) }] : attention(d, now);
  for (const { s, e, f } of items) {
    ports.set(s.origin.name, s.origin); ports.set(s.dest.name, s.dest); if (s.via) ports.set(s.via.name, s.via);
    if (!e.route) continue;
    const worst = f[0]?.level ?? 0;
    const col = view === "routes" ? (focusChoke && e.route.chokepoints.includes(focusChoke) ? C.risk : "#64748b") : statusColor(e, worst);
    const [behind, ahead] = splitRoute(e.route.pts, e.doneKm);
    if (e.doneKm > 1) fs.push({ id: `b${s.id}`, kind: "line", pts: behind, color: C.done, dashed: true, solid: true });
    if (e.leftKm > 1) fs.push({ id: `a${s.id}`, kind: "line", pts: ahead, color: col, solid: true });
    const v = vesselOf(d, s);
    const label = view === "carbon" ? `${s.ref} · ${tco2(co2(s, e.route.km, v))} CO₂` : `${s.ref} · ${lateText(e)}`;
    if (e.basis === "live" || e.basis === "estimated" || only) fs.push({ id: `v${s.id}`, kind: "point", pts: [e.at], color: col, label: `${VESSEL_TYPES[v?.type ?? "container"].emoji} ${label}` });
    if (view === "routes" && focusChoke && e.route.chokepoints.includes(focusChoke)) {
      const alt = voyage(s, [...d.closed, focusChoke], v);
      if (alt) fs.push({ id: `alt${s.id}`, kind: "line", pts: splitRoute(alt.pts, Math.min(e.doneKm, alt.km))[1], color: C.alt, dashed: true, solid: true });
    }
  }
  if (view === "routes") for (const [id, c] of Object.entries(CHOKEPOINTS)) {
    const [a] = c.edges[0].split("-"), n = NODES[a], used = items.filter((x) => x.e.route?.chokepoints.includes(id)).length;
    fs.push({ id: `c${id}`, kind: "point", pts: [[n[0], n[1]]], color: d.closed.includes(id) ? C.late : used ? C.risk : "#8e8e93", label: `${d.closed.includes(id) ? "⛔ " : ""}${c.label}${used ? ` · ${used}` : ""}` });
  }
  if (view === "risk") for (const a of WARNING_AREAS) { const [w, s, e, n] = a.box; fs.push({ id: `w${a.id}`, kind: "area", pts: [[w, s], [e, s], [e, n], [w, n]], color: C.late, fill: 0.15 }); }
  const arrivals = arrivalsByPort(d, now);
  for (const p of ports.values()) {
    const arr = arrivals.find((x) => x.port.name === p.name)?.items.length ?? 0, wait = d.waits[p.name]?.days;
    fs.push({ id: `p${p.name}`, kind: "point", pts: [[p.lon, p.lat]], color: C.port, label: view === "ports" || only ? `⚓ ${p.name}${arr ? ` · ${arr} arriving` : ""}${wait ? ` · ${wait} d wait` : ""}` : undefined });
  }
  map.draw(only ? only.ref : d.name, fs);
}

// ---- Start -------------------------------------------------------------------------------------------

export function openShipping(ctx: WorkCtx) {
  const d = current();
  if (!d) return start(ctx);
  draw(ctx.app, d);
  home(ctx, d);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your company's name" }) as HTMLInputElement;
  ctx.show("Freight Desk", ctx.home,
    h("p", {}, "For freight forwarders, shipping agents and companies that ship: every shipment on its sea route with the ship where it is now, when it really arrives against what you promised, the wait at the port, free time and demurrage, what closing Suez, the Red Sea or Panama does to your cargo, the carbon and the EU ETS bill, and the risks on the way."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save({ id: newId(), name: name.value.trim() || "My freight desk", created: Date.now(), customers: [], vessels: [], shipments: [], waits: {}, closed: [], euaPrice: 70 }); openShipping(ctx); } }, "Start"),
    h("button", { class: "pill-btn", onclick: () => { const d = demoDesk(); save(d); view = "board"; openShipping(ctx); frame(ctx.app, d.name, d.shipments.map((s) => s.dest), 2_000_000); } }, "Or try a demo: a forwarder with 16 shipments at sea"));
}

function home(ctx: WorkCtx, d: Desk) {
  const { app } = ctx;
  const now = Date.now(), t = today(), att = attention(d, now);
  const atSea = att.filter((x) => x.e.basis === "live" || x.e.basis === "estimated");
  const late = att.filter((x) => x.e.late >= 3);
  const soon = att.filter((x) => x.e.basis !== "arrived" && daysBetween(t, x.e.eta) <= 7);
  const dem = d.shipments.reduce((n, s) => n + demurrage(s, t).cost, 0);
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), onclick: () => { view = id; draw(app, d); home(ctx, d); } }, label);
  ctx.show("Freight Desk", ctx.home,
    h("input", { class: "mp-name", value: d.name, "aria-label": "Company name", onchange: (e: Event) => { d.name = (e.target as HTMLInputElement).value || d.name; save(d); } }),
    kpis([String(atSea.length), "shipments at sea"], [String(late.length), "running late (3 d+)", late.length > 0], [String(soon.length), "arriving this week"], [dem ? usdShort(dem) : "$0", "demurrage accruing", dem > 0]),
    h("div", { class: "chips wrap" }, tab("board", "Board"), tab("routes", "Routes"), tab("ports", "Ports"), tab("carbon", "Carbon"), tab("risk", "Risk")),
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => shipmentScreen(ctx, d, null) }, "+ Shipment"),
      h("button", { class: "pill-btn", onclick: () => void refreshLive(ctx, d) }, "Live positions"),
      h("button", { class: "pill-btn", onclick: () => importScreen(ctx, d) }, "Import / export")),
    view === "board" ? board(ctx, d, att) : view === "routes" ? routesPanel(ctx, d) : view === "ports" ? portsPanel(ctx, d) : view === "carbon" ? carbonPanel(ctx, d) : riskPanel(ctx, d, att),
    h("div", { class: "mp-foot" }, h("span", {}, d.demo ? "A demo desk: its customers, ships and shipments are made up; the ports and lanes are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${d.name}?`)) { store.remove(d.id); map?.clear(); openShipping(ctx); } } }, "Remove")),
    note("Sea routes are the shortest way through a graph of straits, canals and capes (great-circle legs), within a few percent of published port-to-port distances; ships over about 15,000 TEU can't use Panama. Where a ship is comes from its last live AIS position if there's a recent one (Digitraffic in the Baltic, or AISStream through Atlas's edge), otherwise from when it sailed and its speed. Carbon uses typical well-to-wake factors per TEU-km or tonne-km scaled by the square of speed: an estimate, not a certified account."));
}

// ---- Board -------------------------------------------------------------------------------------------

function shipmentRow(ctx: WorkCtx, d: Desk, x: { s: Shipment; e: Eta; f: { level: number; text: string }[] }) {
  const { s, e, f } = x, v = vesselOf(d, s), worst = f[0]?.level ?? 0;
  const where = e.basis === "planned" ? `sails ${s.etd}` : e.basis === "arrived" ? `at ${s.dest.name}` : `${Math.round((e.doneKm / Math.max(1, e.doneKm + e.leftKm)) * 100)}% of the way`;
  return row({ color: statusColor(e, worst) }, `${s.ref} · ${s.cargo}`, `${s.origin.name} → ${s.dest.name} · ${v?.name ?? "no ship yet"} · ${where} · ETA ${e.eta} (${lateText(e)})${f[0] ? ` · ${f[0].level >= 2 ? "⚠️ " : ""}${f[0].text.split(":")[0]}` : ""}`, () => shipmentScreen(ctx, d, s));
}

function board(ctx: WorkCtx, d: Desk, att: ReturnType<typeof attention>) {
  if (!d.shipments.length) return h("div", {}, empty("No shipments yet. Add one, or import a spreadsheet of bookings."));
  const need = att.filter((x) => (x.f[0]?.level ?? 0) >= 2), rest = att.filter((x) => (x.f[0]?.level ?? 0) < 2);
  const done = d.shipments.filter((s) => s.stage === "delivered");
  const byCust = new Map<string, number>();
  for (const x of att) byCust.set(x.s.customer, (byCust.get(x.s.customer) ?? 0) + 1);
  return h("div", {},
    need.length ? h("div", {}, title(`Needs a look · ${need.length}`), list(...need.map((x) => shipmentRow(ctx, d, x)))) : "",
    rest.length ? h("div", {}, title(`On track · ${rest.length}`), list(...rest.map((x) => shipmentRow(ctx, d, x)))) : "",
    title("Customers"),
    list(...[...byCust].sort((a, b) => b[1] - a[1]).map(([c, n]) => row("👤", c, `${n} open shipment${n === 1 ? "" : "s"} · tap for a status report`, () => customerReport(d, c)))),
    done.length ? h("details", {}, h("summary", { class: "group-title" }, `Delivered · ${done.length}`), list(...done.map((s) => row({ color: C.done }, `${s.ref} · ${s.cargo}`, `${s.origin.name} → ${s.dest.name} · ${s.ata ?? s.eta}`, () => shipmentScreen(ctx, d, s))))) : "");
}

// ---- Routes ------------------------------------------------------------------------------------------

function routesPanel(ctx: WorkCtx, d: Desk) {
  const open = attention(d);
  const uses = (id: string) => open.filter((x) => x.e.route?.chokepoints.includes(id));
  const chip = (id: string) => h("button", { class: "chip" + (focusChoke === id ? " on" : ""), onclick: () => { focusChoke = focusChoke === id ? null : id; draw(ctx.app, d); home(ctx, d); } }, `${d.closed.includes(id) ? "⛔ " : ""}${CHOKEPOINTS[id].label} · ${uses(id).length}`);
  const c = focusChoke ? CHOKEPOINTS[focusChoke] : null;
  const w = focusChoke ? whatIf(d, focusChoke) : [];
  const addDays = w.reduce((n, x) => n + x.addDays, 0), addT = w.reduce((n, x) => n + x.addCo2, 0);
  return h("div", {},
    h("p", { class: "muted small" }, "The chokepoints your open shipments pass, and how many use each. Pick one to see what closing it would do; mark it closed and every ETA, route and carbon figure follows."),
    h("div", { class: "chips wrap" }, ...Object.keys(CHOKEPOINTS).sort((a, b) => uses(b).length - uses(a).length).map(chip)),
    c && focusChoke ? h("div", {},
      title(`If the ${c.label} closed`),
      lines(c.note, w.length ? `${w.length} of your open shipments would reroute: ${fmt(addDays, 0)} ship-days and ${tco2(addT)} of CO₂ more in all (orange on the map).` : "None of your open shipments pass it.", w.some((x) => x.stuck) ? "⛔ Some would have no way through." : null),
      w.length ? list(...w.map((x) => row({ color: x.stuck ? C.late : C.alt }, `${x.s.ref} · ${x.s.origin.name} → ${x.s.dest.name}`, x.stuck ? "No sea route" : `+${nm(x.addKm)} · +${fmt(x.addDays, 1)} days · +${tco2(x.addCo2)} CO₂`, () => shipmentScreen(ctx, d, x.s)))) : "",
      h("button", { class: d.closed.includes(focusChoke) ? "pill-btn" : "primary-btn", onclick: () => { const id = focusChoke!; d.closed = d.closed.includes(id) ? d.closed.filter((x) => x !== id) : [...d.closed, id]; save(d); draw(ctx.app, d); home(ctx, d); } },
        d.closed.includes(focusChoke) ? `Reopen the ${c.label}` : `Treat the ${c.label} as closed`)) : "",
    d.closed.length ? lines(`Treated as closed: ${d.closed.map((x) => CHOKEPOINTS[x].label).join(", ")}.`) : "",
    d.vessels.some(tooBigForPanama) ? lines(`${d.vessels.filter(tooBigForPanama).map((v) => v.name).join(", ")} ${d.vessels.filter(tooBigForPanama).length === 1 ? "is" : "are"} too big for the Panama Canal's locks, so ${d.vessels.filter(tooBigForPanama).length === 1 ? "it goes" : "they go"} the long way.`) : "");
}

// ---- Ports -------------------------------------------------------------------------------------------

function portsPanel(ctx: WorkCtx, d: Desk) {
  const arr = arrivalsByPort(d, Date.now(), 30);
  if (!arr.length) return empty("Nothing arriving in the next 30 days.");
  return h("div", {},
    h("p", { class: "muted small" }, "What's arriving where in the next 30 days, and how long ships are waiting to berth: from your agents, or counted live from ships at anchor where there's AIS coverage. The wait goes into every ETA there."),
    ...arr.map((g) => {
      const w = d.waits[g.port.name];
      const inp = input(w?.days ?? 0, (v) => { const n = Math.max(0, Number(v) || 0); if (n) d.waits[g.port.name] = { days: n, source: "your report", asOf: today() }; else delete d.waits[g.port.name]; save(d); draw(ctx.app, d); home(ctx, d); }, { type: "number", min: 0, step: 0.5, style: "width:70px" });
      return h("div", {},
        title(`⚓ ${g.port.name} · ${g.items.length} arriving`),
        list(...g.items.sort((a, b) => a.eta.localeCompare(b.eta)).map(({ s, eta: e }) => row({ color: C.ok }, `${e} · ${s.ref}`, `${s.cargo} · ${vesselOf(d, s)?.name ?? ""}`, () => shipmentScreen(ctx, d, s)))),
        field("Waiting to berth (days)", inp),
        h("p", { class: "muted small" }, w ? `From ${w.source}, ${w.asOf}.` : "No wait reported."),
        canCount(g.port) ? h("button", { class: "link-btn", onclick: () => void countAnchored(ctx, d, g.port) }, "Count ships at anchor now (live AIS)") : "");
    }));
}

const inBaltic = (p: { lon: number; lat: number }) => p.lon >= BALTIC[0] && p.lon <= BALTIC[2] && p.lat >= BALTIC[1] && p.lat <= BALTIC[3];
const canCount = (p: Port) => inBaltic(p) || shipsWorldwide();

async function liveAround(lon: number, lat: number, deg: number, seconds = 15): Promise<Track[]> {
  const box: [number, number, number, number] = [lon - deg, lat - deg * 0.6, lon + deg, lat + deg * 0.6];
  if (inBaltic({ lon, lat })) return balticShips(box);
  if (!shipsWorldwide()) return [];
  return new Promise((res) => {
    const got = new Map<string, Track>();
    const stop = streamShips(box, (t) => got.set(t.id, t), () => {});
    setTimeout(() => { stop(); res([...got.values()]); }, seconds * 1000);
  });
}

async function countAnchored(ctx: WorkCtx, d: Desk, p: Port) {
  ctx.app.toast(`Listening for ships near ${p.name}…`, 3000);
  const tracks = await liveAround(p.lon, p.lat, 0.6).catch(() => []);
  const n = anchoredNear(tracks, p);
  // A rough read: ships at anchor over the berths' daily turnover (about 8 a day at a big port).
  ctx.app.toast(`${n} ships at anchor or stopped within 40 km of ${p.name} (of ${tracks.length} seen).`, 5000);
  if (n) { d.waits[p.name] = { days: Math.round((n / 8) * 2) / 2, source: `${n} ships at anchor (live AIS)`, asOf: today() }; save(d); openShipping(ctx); }
}

// ---- Live positions ----------------------------------------------------------------------------------

async function refreshLive(ctx: WorkCtx, d: Desk) {
  const sailing = d.shipments.filter((s) => s.stage === "sailing");
  const ships = d.vessels.filter((v) => v.mmsi && sailing.some((s) => s.vessel === v.id));
  if (!ships.length) { ctx.app.toast("Add an MMSI to a ship at sea (on the ship's screen) to follow it live. Without one, positions are worked out from when it sailed.", 6000); return; }
  let found = 0;
  for (const v of ships) {
    const s = sailing.find((x) => x.vessel === v.id)!, e = eta(d, s);
    const tr = (await liveAround(e.at[0], e.at[1], 4, 12).catch(() => [])).find((t) => t.mmsi === v.mmsi);
    if (tr) { v.last = { lon: tr.lon, lat: tr.lat, t: tr.t, knots: tr.speed / 0.514444, status: tr.status, source: inBaltic(tr) ? "Digitraffic AIS" : "AISStream" }; found++; }
  }
  save(d);
  ctx.app.toast(found ? `Updated ${found} of ${ships.length} ships from live AIS.` : shipsWorldwide() ? "None of your ships were heard near where they should be." : "Live AIS here needs Atlas's edge (it holds an AISStream key); the Baltic works without it.", 6000);
  openShipping(ctx);
}

// ---- Carbon ------------------------------------------------------------------------------------------

function carbonPanel(ctx: WorkCtx, d: Desk) {
  const year = new Date().getFullYear(), price = d.euaPrice ?? 70;
  const rowsData = d.shipments.map((s) => { const v = vesselOf(d, s), r = voyage(s, d.closed, v), km = r?.km ?? 0, t = co2(s, km, v); return { s, v, km, t, ets: etsCost(s, t, price, year) }; });
  const total = rowsData.reduce((n, x) => n + x.t, 0), etsT = rowsData.reduce((n, x) => n + x.ets.eur, 0);
  const byCust = new Map<string, number>();
  for (const x of rowsData) byCust.set(x.s.customer, (byCust.get(x.s.customer) ?? 0) + x.t);
  const sailing = d.shipments.filter((s) => s.stage === "sailing").map((s) => ({ s, e: eta(d, s), v: vesselOf(d, s) })).filter((x) => x.v);
  const save10 = sailing.map((x) => { const k = x.v!.knots; const t = co2(x.s, x.e.leftKm, x.v); return slowSteam(x.e.leftKm, t, k, Math.max(10, k - 2)); });
  return h("div", {},
    kpis([tco2(total), "CO₂, all shipments"], [eur(etsT), `EU ETS for ${year}`], [tco2(save10.reduce((n, x) => n + x.saved, 0)), "saved at sea by sailing 2 kn slower"], [`+${fmt(save10.reduce((n, x) => Math.max(n, x.addDays), 0), 1)} d`, "the longest it adds"]),
    field("EU allowance price (€/t)", input(price, (v) => { d.euaPrice = Math.max(0, Number(v) || 0); save(d); home(ctx, d); }, { type: "number", min: 0, style: "width:80px" })),
    lines(`Shipping into, out of and within the EU and EEA pays for its emissions under the EU ETS: ${year <= 2024 ? "40%" : year === 2025 ? "70%" : "all"} of them for ${year}, counting half of a voyage to or from outside Europe and all of one within it.`),
    title("By customer"),
    list(...[...byCust].sort((a, b) => b[1] - a[1]).map(([c, t]) => row("🌿", c, `${tco2(t)} CO₂ · ${Math.round((t / Math.max(1e-9, total)) * 100)}%`, () => customerReport(d, c)))),
    title("By shipment"),
    list(...rowsData.sort((a, b) => b.t - a.t).map((x) => row({ color: x.ets.eur ? "#30d158" : C.done }, `${x.s.ref} · ${tco2(x.t)} CO₂`, `${x.s.origin.name} → ${x.s.dest.name} · ${nm(x.km)} · ${VESSEL_TYPES[x.v?.type ?? "container"].label.toLowerCase()}${x.ets.eur ? ` · EU ETS ${eur(x.ets.eur)}` : ""}`, () => shipmentScreen(ctx, d, x.s)))));
}

// ---- Risk --------------------------------------------------------------------------------------------

const seas = new Map<string, { max: number; day: string } | null>();
function riskPanel(ctx: WorkCtx, d: Desk, att: ReturnType<typeof attention>) {
  const flagged = att.filter((x) => x.f.length);
  const areas = WARNING_AREAS.map((a) => ({ a, n: att.filter((x) => x.f.some((f) => f.text.includes(a.label))).length })).filter((x) => x.n);
  return h("div", {},
    h("p", { class: "muted small" }, "Areas with standing security warnings (red on the map), sanctioned countries on a route, ships that have gone quiet, delays, free time running out, papers not done, and the sea state ahead."),
    areas.length ? h("div", {}, title("Warning areas on your routes"), list(...areas.map(({ a, n }) => row("🛡️", `${a.label} · ${n} shipment${n === 1 ? "" : "s"}`, a.why, () => void flyToPlace(ctx.app.globe, { name: a.label, lon: (a.box[0] + a.box[2]) / 2, lat: (a.box[1] + a.box[3]) / 2, radius: 900_000 }))))) : "",
    title(`Every flag · ${flagged.reduce((n, x) => n + x.f.length, 0)}`),
    flagged.length ? list(...flagged.flatMap((x) => x.f.map((f) => row({ color: f.level >= 3 ? C.late : f.level === 2 ? C.risk : C.done }, x.s.ref, f.text, () => shipmentScreen(ctx, d, x.s))))) : empty("Nothing flagged."),
    title("Seas ahead"),
    h("button", { class: "pill-btn", onclick: () => void checkSeas(ctx, d) }, "Check wave heights along each ship's next five days"),
    ...att.filter((x) => seas.has(x.s.id)).map((x) => { const w = seas.get(x.s.id); return lines(w ? `${x.s.ref}: waves up to ${fmt(w.max, 1)} m (${w.day})${w.max >= 5 ? " ⚠️ heavy weather" : w.max >= 3.5 ? ", rough" : ""}.` : `${x.s.ref}: no forecast.`); }));
}

async function checkSeas(ctx: WorkCtx, d: Desk) {
  const sailing = d.shipments.filter((s) => s.stage === "sailing");
  ctx.app.toast(`Checking the sea state for ${sailing.length} ships…`, 2500);
  await Promise.all(sailing.map(async (s) => {
    const e = eta(d, s), v = vesselOf(d, s), knots = v?.knots ?? 15;
    const ahead = e.route ? along(e.route.pts, e.doneKm + Math.min(e.leftKm, knots * NM * 24 * 2.5)).p : e.at;
    try {
      const r = await getJson<{ daily?: { time: string[]; wave_height_max: (number | null)[] } }>("Open-Meteo Marine", `https://marine-api.open-meteo.com/v1/marine?latitude=${ahead[1].toFixed(2)}&longitude=${ahead[0].toFixed(2)}&daily=wave_height_max&forecast_days=5&timezone=UTC`);
      const hs = r.daily?.wave_height_max ?? [], i = hs.reduce((b: number, x, k) => ((x ?? -1) > (hs[b] ?? -1) ? k : b), 0);
      seas.set(s.id, hs.length && hs[i] !== null ? { max: hs[i]!, day: r.daily!.time[i] } : null);
    } catch { seas.set(s.id, null); }
  }));
  openShipping(ctx);
}

// ---- One shipment ------------------------------------------------------------------------------------

function portInput(p: Port | undefined, set: (p: Port) => void, placeholder: string) {
  const el = h("input", { class: "pro-url", value: p ? p.name : "", placeholder, list: "fd-ports" }) as HTMLInputElement;
  el.onchange = () => { const f = findPort(el.value, extraPorts); if (f) { set(f); el.value = f.name; } else el.style.borderColor = "#ff453a"; };
  return el;
}

function shipmentScreen(ctx: WorkCtx, d: Desk, s0: Shipment | null) {
  const fresh = !s0;
  const t = today();
  const s: Shipment = s0 ?? { id: newId(), ref: `S-${String(d.shipments.length + 1).padStart(4, "0")}`, customer: d.customers[0]?.name ?? "", cargo: "", origin: PORTS[0], dest: PORTS.find((p) => p.code === "NLRTM")!, stage: "booked", etd: t, eta: t, docs: DOCS.map((text) => ({ text, done: false })), log: [], freeDays: 5, demurrage: 150 };
  const back = () => { draw(ctx.app, d); openShipping(ctx); };
  const persist = () => { if (!d.shipments.includes(s)) d.shipments.push(s); save(d); };
  const again = () => shipmentScreen(ctx, d, d.shipments.includes(s) ? s : null);
  const e = eta(d, s), v = vesselOf(d, s), f = risks(d, s, e, t);
  if (!fresh) {
    draw(ctx.app, d, s);
    if (e.route) frame(ctx.app, s.ref, e.route.pts.map(([lon, lat]) => ({ lon, lat })), 200_000);
  }
  const km = e.route?.km ?? 0, knots = v?.knots ?? VESSEL_TYPES[v?.type ?? "container"].knots, t0 = co2(s, km, v);
  const ets = etsCost(s, t0, d.euaPrice ?? 70, new Date().getFullYear()), dm = demurrage(s, t);
  const update = customerUpdate(d, s, e);
  let slow = Math.max(8, knots - 2);
  const slowOut = h("span", { class: "muted small" });
  const slowCalc = () => { const r = slowSteam(e.leftKm, co2(s, e.leftKm, v), knots, slow); slowOut.textContent = `At ${slow} kn: ${tco2(r.saved)} CO₂ less, ${fmt(r.addDays, 1)} days more.`; };
  slowCalc();
  const datalist = h("datalist", { id: "fd-ports" }, ...PORTS.map((p) => h("option", { value: p.name }, `${p.code} · ${p.country}`)));
  ctx.show(fresh ? "New shipment" : s.ref, back,
    datalist,
    !fresh ? h("div", {},
      kpis([e.eta, `ETA (${e.basis === "live" ? `from AIS, ${e.quietHours ?? 0} h ago` : e.basis === "estimated" ? "worked out from sailing" : e.basis})`], [lateText(e), `promised ${s.eta}`, e.late >= 3], [nm(km), `${fmt(seaDays(km, knots), 1)} days at ${knots} kn`], [tco2(t0), ets.eur ? `CO₂ · EU ETS ${eur(ets.eur)}` : "CO₂"]),
      h("div", { class: "chips wrap" }, ...STAGES.map((st) => h("button", { class: "chip" + (s.stage === st.id ? " on" : ""), onclick: () => { setStage(s, st.id, t); persist(); again(); } }, st.label))),
      f.length ? lines(...f.map((x) => `${x.level >= 3 ? "⛔" : x.level === 2 ? "⚠️" : "•"} ${x.text}`)) : lines("✓ Nothing flagged."),
      e.route ? lines(`Route: ${[s.origin.name, ...e.route.via.filter((x) => /Strait|Canal|Cape|Bab|Bosporus|Passage|Danish|Horn|Skagerrak/.test(x) || x === s.via?.name), s.dest.name].join(" → ")}.`,
        e.wait ? `Ships are waiting about ${e.wait} days to berth at ${s.dest.name} (${d.waits[s.dest.name]?.source}).` : null,
        s.via ? `Transhipment at ${s.via.name} (about 3 days).` : null,
        dm.endsOn ? `Free time at ${s.dest.name} ${dm.daysOver ? `ended ${dm.endsOn}: ${dm.daysOver} days of demurrage so far, about ${usd(dm.cost)}` : `ends ${dm.endsOn}`}.` : null,
        v?.last ? `Last position ${new Date(v.last.t).toISOString().slice(0, 16).replace("T", " ")} UTC from ${v.last.source}${v.last.status ? `, ${v.last.status.toLowerCase()}` : ""}.` : null) : "",
      e.leftKm > 0 && e.basis !== "planned" ? h("div", {}, title("Slow down?"), h("input", { type: "range", min: 8, max: knots, step: 0.5, value: slow, oninput: (ev: Event) => { slow = Number((ev.target as HTMLInputElement).value); slowCalc(); } }), slowOut) : "",
      title("Update for the customer"),
      h("p", { class: "fd-update" }, update),
      h("button", { class: "pill-btn", onclick: () => { void navigator.clipboard?.writeText(update); ctx.app.toast("Copied.", 1500); } }, "Copy"),
      title("Papers"),
      h("div", { class: "list" }, ...s.docs.map((x) => h("label", { class: "list-row" }, h("input", { type: "checkbox", checked: x.done, onchange: () => { x.done = !x.done; persist(); } }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.text))))),
      title("Log"),
      list(...[...s.log].reverse().map((m) => row("•", m.text, m.at))),
      (() => { const inp = h("input", { class: "pro-url", placeholder: "Add a note: customs cleared, rolled to next sailing…" }) as HTMLInputElement; inp.onchange = () => { if (inp.value.trim()) { s.log.push({ at: t, text: inp.value.trim() }); persist(); again(); } }; return inp; })()) : "",
    title("Details"),
    field("Reference", input(s.ref, (x) => { s.ref = x; })),
    field("Customer", customerPick(d, s)),
    field("Cargo", input(s.cargo, (x) => { s.cargo = x; }, { placeholder: "What and how much" })),
    field("From", portInput(s.origin, (p) => { s.origin = p; }, "Port or UN/LOCODE")),
    field("Via", portInput(s.via, (p) => { s.via = p; }, "Transhipment port (optional)")),
    field("To", portInput(s.dest, (p) => { s.dest = p; }, "Port or UN/LOCODE")),
    field("Ship", select(s.vessel ?? "", [["", "Not yet assigned"], ...d.vessels.map((x) => [x.id, x.name] as [string, string]), ["+", "+ Add a ship…"]], (x) => { if (x === "+") vesselScreen(ctx, d, null, s); else s.vessel = x || undefined; })),
    v ? h("button", { class: "link-btn", onclick: () => vesselScreen(ctx, d, v, s) }, `About ${v.name}`) : "",
    field("Sails", input(s.etd, (x) => { s.etd = x; }, { type: "date" })),
    field("Promised arrival", input(s.eta, (x) => { s.eta = x; }, { type: "date" })),
    field("Sailed", input(s.atd ?? "", (x) => { s.atd = x || undefined; }, { type: "date" })),
    field("Arrived", input(s.ata ?? "", (x) => { s.ata = x || undefined; }, { type: "date" })),
    field("TEU", input(s.teu ?? "", (x) => { s.teu = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("Containers", input(s.containers ?? "", (x) => { s.containers = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("Tonnes", input(s.tonnes ?? "", (x) => { s.tonnes = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("Cargo value ($)", input(s.value ?? "", (x) => { s.value = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("Incoterm", select((s.incoterm ?? "") as string, ["", "EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"].map((x) => [x, x || "—"] as [string, string]), (x) => { s.incoterm = x || undefined; })),
    field("HS code", input(s.hs ?? "", (x) => { s.hs = x || undefined; })),
    field("Free days at port", input(s.freeDays ?? 5, (x) => { s.freeDays = Number(x) || 0; }, { type: "number", min: 0 })),
    field("Demurrage ($/box/day)", input(s.demurrage ?? 150, (x) => { s.demurrage = Number(x) || 0; }, { type: "number", min: 0 })),
    h("button", { class: "primary-btn", onclick: () => { persist(); again(); } }, fresh ? "Add the shipment" : "Save"),
    !fresh ? h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${s.ref}?`)) { d.shipments = d.shipments.filter((x) => x.id !== s.id); save(d); back(); } } }, "Remove the shipment") : "");
}

function setStage(s: Shipment, st: Stage, t: string) {
  s.stage = st;
  const label = STAGES.find((x) => x.id === st)!.label;
  if (st === "sailing" && !s.atd) s.atd = t;
  if ((st === "arrived" || st === "delivered") && !s.ata) s.ata = t;
  s.log.push({ at: t, text: label });
}

function customerPick(d: Desk, s: Shipment) {
  const el = h("input", { class: "pro-url", value: s.customer, placeholder: "Customer", list: "fd-cust" }) as HTMLInputElement;
  el.onchange = () => { s.customer = el.value.trim(); if (s.customer && !d.customers.some((c) => c.name === s.customer)) d.customers.push({ id: newId(), name: s.customer }); };
  return h("span", {}, el, h("datalist", { id: "fd-cust" }, ...d.customers.map((c) => h("option", { value: c.name }))));
}

// ---- A ship ------------------------------------------------------------------------------------------

function vesselScreen(ctx: WorkCtx, d: Desk, v0: Vessel | null, from?: Shipment) {
  const v: Vessel = v0 ?? { id: newId(), name: "", type: "container", knots: 16 };
  const back = () => (from ? shipmentScreen(ctx, d, d.shipments.includes(from) ? from : null) : openShipping(ctx));
  const pos = h("input", { class: "pro-url", placeholder: "Position from the carrier's tracking: lat, lon" }) as HTMLInputElement;
  ctx.show(v0 ? v.name : "New ship", back,
    field("Name", input(v.name, (x) => { v.name = x; })),
    field("Type", select<VesselType>(v.type, Object.entries(VESSEL_TYPES).map(([k, x]) => [k as VesselType, x.label]), (x) => { v.type = x; })),
    field("Speed (knots)", input(v.knots, (x) => { v.knots = Number(x) || v.knots; }, { type: "number", min: 5, max: 26, step: 0.5 })),
    field("TEU", input(v.teu ?? "", (x) => { v.teu = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("Deadweight (t)", input(v.dwt ?? "", (x) => { v.dwt = Number(x) || undefined; }, { type: "number", min: 0 })),
    field("IMO", input(v.imo ?? "", (x) => { v.imo = x || undefined; })),
    field("MMSI", input(v.mmsi ?? "", (x) => { v.mmsi = x.replace(/\D/g, "") || undefined; })),
    field("Flag", input(v.flag ?? "", (x) => { v.flag = x || undefined; })),
    field("Operator", input(v.operator ?? "", (x) => { v.operator = x || undefined; })),
    h("p", { class: "muted small" }, "With an MMSI, Live positions finds the ship on AIS near where it should be. Or paste a position from the carrier's tracking page."),
    pos,
    tooBigForPanama(v) ? lines("Too big for the Panama Canal's locks: routes avoid it.") : "",
    h("button", { class: "primary-btn", onclick: () => {
      const m = pos.value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (m) v.last = { lat: Number(m[1]), lon: Number(m[2]), t: Date.now(), knots: v.knots, source: "entered by hand" };
      if (!v.name.trim()) v.name = "Unnamed ship";
      if (!d.vessels.includes(v)) d.vessels.push(v);
      if (from && !from.vessel) from.vessel = v.id;
      save(d); back();
    } }, "Save"));
}

// ---- Reports, import and export ----------------------------------------------------------------------

function customerReport(d: Desk, customer: string) {
  const now = Date.now(), t = today(), year = new Date().getFullYear();
  const mine = d.shipments.filter((s) => s.customer === customer);
  const rowsData = mine.map((s) => { const e = eta(d, s, now), v = vesselOf(d, s), c = co2(s, e.route?.km ?? 0, v); return { s, e, v, c }; });
  printReport(`${customer}: shipments`, `${d.name} · ${t}`, [
    { heading: "Summary", kpis: [[String(mine.filter((s) => s.stage !== "delivered").length), "open"], [String(rowsData.filter((x) => x.e.basis !== "arrived" && x.e.late >= 3).length), "late 3 d+"], [String(mine.filter((s) => s.stage === "delivered").length), "delivered"], [tco2(rowsData.reduce((n, x) => n + x.c, 0)), "CO₂"]] },
    { heading: "Shipments", table: { head: ["Ref", "Cargo", "From", "To", "Ship", "Status", "ETA", "Against promise", "CO₂ (t)"], rows: rowsData.map(({ s, e, v, c }) => [s.ref, s.cargo, s.origin.name, s.dest.name, v?.name ?? "", STAGES.find((x) => x.id === s.stage)!.label, e.eta, lateText(e), fmt(c, 1)]) } },
    { heading: "Updates", lines: rowsData.filter((x) => x.s.stage !== "delivered").map((x) => customerUpdate(d, x.s, x.e)) },
    { heading: "Carbon", lines: [`Estimated tank-to-wake and upstream CO₂ from distance, cargo and ship type, ${year}. Typical factors, not a certified account.`] },
  ]);
}

function importScreen(ctx: WorkCtx, d: Desk) {
  ctx.show("Import and export", () => openShipping(ctx),
    h("p", {}, "Bring in bookings from a spreadsheet or your TMS export. Columns are matched loosely: reference, customer, cargo, origin, destination (port names or UN/LOCODEs), vessel, etd, eta, teu, containers, tonnes."),
    h("button", { class: "pill-btn", onclick: () => void importShipments(ctx, d) }, "Import shipments (CSV)"),
    h("button", { class: "pill-btn", onclick: () => exportShipments(d) }, "Export every shipment (CSV)"));
}

const col = (r: Record<string, string>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(r)) if (k.toLowerCase().replace(/[^a-z]/g, "") === n && r[k]) return r[k]; return ""; };

async function importShipments(ctx: WorkCtx, d: Desk) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  let n = 0, skipped = 0;
  for (const r of parseCsv(text)) {
    const o = findPort(col(r, "origin", "from", "pol", "portofloading"), extraPorts), de = findPort(col(r, "destination", "to", "pod", "portofdischarge"), extraPorts);
    if (!o || !de) { skipped++; continue; }
    const vname = col(r, "vessel", "ship", "vesselname");
    let v = vname ? d.vessels.find((x) => x.name.toLowerCase() === vname.toLowerCase()) : undefined;
    if (vname && !v) { v = { id: newId(), name: vname, type: "container", knots: 16 }; d.vessels.push(v); }
    const etd = col(r, "etd", "departure", "sails") || today(), eta0 = col(r, "eta", "arrival") || etd;
    const customer = col(r, "customer", "shipper", "consignee", "client");
    if (customer && !d.customers.some((c) => c.name === customer)) d.customers.push({ id: newId(), name: customer });
    d.shipments.push({ id: newId(), ref: col(r, "reference", "ref", "booking", "bookingnumber", "bl", "shipment") || `S-${d.shipments.length + 1}`, customer, cargo: col(r, "cargo", "commodity", "description", "goods"),
      origin: o, dest: de, vessel: v?.id, stage: col(r, "status", "stage").toLowerCase().includes("sail") ? "sailing" : "booked", etd, eta: eta0,
      teu: Number(col(r, "teu")) || undefined, containers: Number(col(r, "containers", "boxes")) || undefined, tonnes: Number(col(r, "tonnes", "weight", "tons")) || undefined,
      docs: DOCS.map((x) => ({ text: x, done: false })), log: [{ at: today(), text: "Imported" }], freeDays: 5, demurrage: 150 });
    n++;
  }
  save(d);
  ctx.app.toast(`${n} shipments added${skipped ? `; ${skipped} skipped (port not recognised)` : ""}.`, 4000);
  openShipping(ctx);
}

function exportShipments(d: Desk) {
  const now = Date.now();
  downloadCsv(`${d.name} shipments ${today()}`, ["reference", "customer", "cargo", "origin", "destination", "vessel", "status", "etd", "promised eta", "estimated eta", "days late", "distance nm", "co2 t"],
    d.shipments.map((s) => { const e = eta(d, s, now), v = vesselOf(d, s); return [s.ref, s.customer, s.cargo, s.origin.name, s.dest.name, v?.name, s.stage, s.etd, s.eta, e.eta, e.late, Math.round((e.route?.km ?? 0) / NM), fmt(co2(s, e.route?.km ?? 0, v), 1)]; }));
}

