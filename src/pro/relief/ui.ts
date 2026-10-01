// Relief Pipeline on the map: a humanitarian supply chain from the port to
// the people. Five ways to look: the pipeline (when each place runs out of
// each thing, and the last day to send more), stock (what's where, and how
// full), access (which roads, rivers and air links are open, slow or cut,
// the rains, incidents, and who can only be reached by air), moves (what's
// on the way, and planning the next one by the fastest, cheapest or
// ground-only route) and a sitrep to print.
import { openSpace } from "../../delight/spaces";
import type { App } from "../../app";
import { climateDays } from "../../data/openmeteo";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { fmt } from "../kit/ops";
import { empty, field, frame, input, kpis, lines, list, OpsMap, row, select, title } from "../kit/ui";
import { downloadCsv, printReport } from "../kit/report";
import { usd } from "../mining/model";
import { MONTHS, summarise } from "../services/conditions";
import {
  breaks, cutOff, daysBetween, fill, HUB_KINDS, isoDay, ITEMS, itemOf, kmBetween, legDays, legIncidents, legWet, MODES, overdue, planMove, preposition,
  type Hub, type HubKind, type Item, type Leg, type Mode, type Network,
} from "./model";
import { demoNetwork } from "./demo";

const store = new ListStore<Network>("atlas.pro.relief.v1");
const current = () => store.all()[0];
const save = (n: Network) => store.save(n);
let map: OpsMap | null = null;
type View = "pipeline" | "stock" | "access" | "moves" | "sitrep";
let view: View = "pipeline";
const today = () => isoDay(Date.now());
const month = () => new Date().getUTCMonth();
const hubOf = (n: Network, id: string) => n.hubs.find((x) => x.id === id);
const LEVEL = { 3: "#ff453a", 2: "#ff9f0a", 1: "#30d158" } as const;
const qty = (item: Item, q: number) => `${fmt(q, q < 10 ? 1 : 0)} ${item.unit === "t" ? "t" : `${item.unit}s`}`;
const daysText = (d: number) => (Number.isFinite(d) ? `${fmt(d, d < 10 ? 1 : 0)} days` : "no way through");

// ---- The map ---------------------------------------------------------------------------------------

function legColor(n: Network, l: Leg): { color: string; dashed: boolean } {
  const days = legDays(n, l, month());
  if (!Number.isFinite(days)) return { color: "#ff453a", dashed: true };
  if (l.mode === "air") return { color: "#64d2ff", dashed: true };
  if (l.status === "slow" || legIncidents(n, l, today()).length || (l.mode === "road" && legWet(n, l, month()))) return { color: "#ff9f0a", dashed: false };
  return { color: l.mode === "river" ? "#0a84ff" : "#30d158", dashed: false };
}

function draw(app: App, n: Network, focus?: { path?: string[] }) {
  map ??= new OpsMap(app, "pro:relief", "#30d158");
  const fs: WorkFeature[] = [], t = today();
  const worst = new Map<string, number>();
  for (const b of breaks(n, t)) worst.set(b.hub.id, Math.max(worst.get(b.hub.id) ?? 0, b.level));
  for (const l of n.legs) {
    const a = hubOf(n, l.from), b = hubOf(n, l.to);
    if (!a || !b) continue;
    const c = legColor(n, l);
    const on = focus?.path && focus.path.some((id, i) => i > 0 && ((focus.path![i - 1] === l.from && id === l.to) || (focus.path![i - 1] === l.to && id === l.from)));
    fs.push({ id: l.id, kind: "line", pts: [[a.lon, a.lat], [b.lon, b.lat]], color: focus?.path ? (on ? "#ff9f0a" : "#8e8e93") : c.color, dashed: c.dashed, solid: true });
  }
  if (view === "moves" && !focus) for (const m of n.moves.filter((x) => x.status !== "delivered")) {
    const a = hubOf(n, m.from), b = hubOf(n, m.to);
    if (a && b) fs.push({ id: `m${m.id}`, kind: "line", pts: [[a.lon, a.lat], [b.lon, b.lat]], color: m.status === "delayed" || m.arrives < t ? "#ff453a" : "#bf5af2", solid: true });
  }
  for (const i of n.incidents.filter((x) => daysBetween(x.date, t) <= 14)) fs.push({ id: `i${i.id}`, kind: "point", pts: [[i.lon, i.lat]], color: "#ff453a", label: view === "access" ? `⚠️ ${i.text.slice(0, 40)}` : undefined });
  for (const hb of n.hubs) {
    const k = HUB_KINDS[hb.kind], w = worst.get(hb.id);
    const f = fill(hb);
    const label = view === "stock" ? `${k.emoji} ${hb.name} · ${fmt(f.tonnes)} t${hb.capacity ? ` (${Math.round(f.share * 100)}%)` : ""}` : `${k.emoji} ${hb.name}`;
    fs.push({ id: hb.id, kind: "point", pts: [[hb.lon, hb.lat]], color: view === "pipeline" && w ? LEVEL[w as 1 | 2 | 3] : k.color, label });
  }
  map.draw(n.name, fs);
}

// ---- Start and home ----------------------------------------------------------------------------------

export function openRelief(ctx: WorkCtx) {
  const n = current();
  if (!n) return start(ctx);
  draw(ctx.app, n);
  home(ctx, n);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your operation's name" }) as HTMLInputElement;
  ctx.show("Relief Pipeline", ctx.home,
    h("p", {}, "For humanitarian logisticians: your ports, hubs, warehouses and distribution points, and the roads, rivers and air links between them. See when each place runs out of each thing and the last day to send more, what the rains and incidents have cut, who can only be reached by air, what's on the way, and the fastest, cheapest or ground-only way to move the next load."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save({ id: newId(), name: name.value.trim() || "My operation", created: Date.now(), hubs: [], legs: [], moves: [], incidents: [] }); openRelief(ctx); } }, "Start"),
    h("button", { class: "pill-btn", onclick: () => { const n = demoNetwork(); save(n); view = "pipeline"; openRelief(ctx); frame(ctx.app, n.name, n.hubs.filter((x) => x.kind !== "port"), 50_000); } }, "Or try a demo: Mombasa to South Sudan in the rains"));
}

function home(ctx: WorkCtx, n: Network) {
  const { app } = ctx;
  const t = today(), bs = breaks(n, t), cut = cutOff(n, month()), late = overdue(n, t);
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), onclick: () => { view = id; draw(app, n); home(ctx, n); } }, label);
  ctx.show("Relief Pipeline", ctx.home,
    h("input", { class: "mp-name", value: n.name, "aria-label": "Operation name", onchange: (e: Event) => { n.name = (e.target as HTMLInputElement).value || n.name; save(n); } }),
    kpis(
      [String(bs.filter((b) => b.level === 3).length), "gaps too late to prevent", bs.some((b) => b.level === 3)],
      [String(bs.filter((b) => b.level === 2).length), "must go out this week", bs.some((b) => b.level === 2)],
      [String(cut.length), "places cut off by ground", cut.length > 0],
      [String(late.length), "consignments overdue", late.length > 0]),
    h("div", { class: "chips wrap" }, tab("pipeline", "Pipeline"), tab("stock", "Stock"), tab("access", "Access"), tab("moves", "Moves"), tab("sitrep", "Sitrep")),
    view === "pipeline" ? pipelinePanel(ctx, n) : view === "stock" ? stockPanel(ctx, n) : view === "access" ? accessPanel(ctx, n) : view === "moves" ? movesPanel(ctx, n) : sitrepPanel(n),
    h("div", { class: "mp-foot" }, h("span", {}, n.demo ? "A demo operation: its stocks, people, consignments and incidents are made up; the places and the rainy season are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${n.name}?`)) { store.remove(n.id); map?.clear(); openRelief(ctx); } } }, "Remove")),
    note("Travel times use typical speeds (road 35 km/h for 10 hours a day, half that in the wet season; barges 8 km/h; aircraft 350 km/h) over the straight line with a detour factor, plus handling and the delays you set. Rations follow a common general ration (cereals 400 g, pulses 60 g, oil 25 g a person a day). Wet seasons come from ten years of ERA5 rainfall (months over 100 mm). Costs and carbon are rough defaults; set your own rates."));
}

// ---- Pipeline ----------------------------------------------------------------------------------------

function pipelinePanel(ctx: WorkCtx, n: Network) {
  const t = today(), bs = breaks(n, t);
  if (!bs.length) return empty("Add distribution points with the people they serve to see when each runs out.");
  const r = (b: ReturnType<typeof breaks>[number]) => row({ color: LEVEL[b.level] }, `${b.hub.name}: ${b.item.name} · ${b.cover < 1 ? "out now" : `${fmt(b.cover)} days left`}`,
    `${qty(b.item, b.stock)} in stock${b.coming ? ` + ${qty(b.item, b.coming)} coming` : ""} · uses ${qty(b.item, b.perDay)} a day · runs out ${b.runsOut}` +
    (b.path && b.source ? ` · from ${b.source.name}${b.opens ? ` once the way opens (${b.opens})` : ""}, ${daysText(b.path.days)} by ${[...new Set(b.path.modes)].map((m) => MODES[m].label.toLowerCase()).join(" + ")}: ${b.level === 3 ? (b.opens ? "opens too late to prevent a gap" : "too late to prevent a gap") : `send by ${b.sendBy}`}` : " · no way in for months: open an air link or a new route"),
    () => moveScreen(ctx, n, { item: b.item.id, to: b.hub.id, from: b.source?.id, qty: Math.ceil(b.perDay * 30) }));
  const urgent = bs.filter((b) => b.level >= 2), ok = bs.filter((b) => b.level === 1);
  const pre = n.hubs.filter((x) => x.kind === "point").map((x) => ({ x, p: preposition(n, x, t) })).filter((y) => y.p && y.p.need.some((z) => z.short > 0));
  return h("div", {},
    h("p", { class: "muted small" }, "When each distribution point runs out of each thing, counting what's on the way, and the last day to send more from the nearest place that has it. Tap to plan the move."),
    urgent.length ? h("div", {}, title(`Act now · ${urgent.length}`), list(...urgent.map(r))) : lines("✓ Nothing needs to go out this week."),
    pre.length ? h("div", {}, title("Before the roads close"), list(...pre.map(({ x, p }) => row("🌧️", `${x.name}: ${p!.starts <= t ? "wet season now" : `rains from ${p!.starts}`}, ${p!.months} month${p!.months === 1 ? "" : "s"}`,
      `Short for the season: ${p!.need.filter((z) => z.short > 0).map((z) => qty(z.item, z.short) + " " + z.item.name.toLowerCase()).join(", ")}`, () => moveScreen(ctx, n, { to: x.id, item: p!.need.find((z) => z.short > 0)!.item.id, qty: Math.ceil(p!.need.find((z) => z.short > 0)!.short) }))))) : "",
    ok.length ? h("details", {}, h("summary", { class: "group-title" }, `Covered · ${ok.length}`), list(...ok.map(r))) : "");
}

// ---- Stock -------------------------------------------------------------------------------------------

function stockPanel(ctx: WorkCtx, n: Network) {
  return h("div", {},
    h("button", { class: "pill-btn", onclick: () => void addHub(ctx, n) }, "+ Place"),
    ...(["port", "hub", "field", "point"] as HubKind[]).map((k) => {
      const hs = n.hubs.filter((x) => x.kind === k);
      if (!hs.length) return "";
      return h("div", {}, title(`${HUB_KINDS[k].label}s · ${hs.length}`), list(...hs.map((x) => {
        const f = fill(x);
        return row({ color: HUB_KINDS[k].color }, x.name, `${fmt(f.tonnes)} t${x.capacity ? ` of ${fmt(x.capacity)} t (${Math.round(f.share * 100)}%)` : ""}${x.people ? ` · serves ${fmt(x.people)} people` : ""} · ${ITEMS.filter((i) => (x.stock[i.id] ?? 0) > 0).map((i) => `${i.name.toLowerCase()} ${qty(i, x.stock[i.id])}`).join(", ") || "empty"}`, () => hubScreen(ctx, n, x));
      })));
    }));
}

async function addHub(ctx: WorkCtx, n: Network) {
  const q = prompt("Where? A town, an airstrip or coordinates (lat, lon)");
  if (!q) return;
  const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  let lon: number, lat: number, name = q;
  if (m) { lat = Number(m[1]); lon = Number(m[2]); }
  else { const [g] = await geocode(q).catch(() => []); if (!g) { ctx.app.toast("Couldn't find that place.", 2500); return; } lon = g.lon; lat = g.lat; name = g.name.split(",")[0]; }
  const x: Hub = { id: newId(), name, kind: "point", lon, lat, stock: {} };
  n.hubs.push(x); save(n); hubScreen(ctx, n, x);
}

function hubScreen(ctx: WorkCtx, n: Network, x: Hub) {
  const back = () => { draw(ctx.app, n); openRelief(ctx); };
  void flyToPlace(ctx.app.globe, { name: x.name, lon: x.lon, lat: x.lat, radius: 60_000 });
  const t = today(), bs = breaks(n, t).filter((b) => b.hub.id === x.id), pre = preposition(n, x, t);
  const links = n.legs.filter((l) => l.from === x.id || l.to === x.id);
  const other = n.hubs.filter((y) => y.id !== x.id);
  const newLeg = { to: other[0]?.id ?? "", mode: "road" as Mode };
  ctx.show(x.name, back,
    h("button", { class: "pill-btn holo-go", onclick: () => void hubHologram(ctx.app, n, x) }, "◎ Hologram"),
    field("Name", input(x.name, (v) => { x.name = v; save(n); })),
    field("Kind", select<HubKind>(x.kind, Object.entries(HUB_KINDS).map(([k, v]) => [k as HubKind, v.label]), (v) => { x.kind = v; save(n); hubScreen(ctx, n, x); })),
    field("Capacity (t)", input(x.capacity ?? "", (v) => { x.capacity = Number(v) || undefined; save(n); }, { type: "number", min: 0 })),
    field("People served", input(x.people ?? "", (v) => { x.people = Number(v) || undefined; save(n); hubScreen(ctx, n, x); }, { type: "number", min: 0 })),
    title("Stock"),
    ...ITEMS.map((i) => field(`${i.name} (${i.unit === "t" ? "t" : `${i.unit}s`})`, input(x.stock[i.id] ?? 0, (v) => { x.stock[i.id] = Math.max(0, Number(v) || 0); save(n); }, { type: "number", min: 0, style: "width:90px" }))),
    field("RUTF cartons a day", input(x.use?.rutf ?? "", (v) => { x.use = { ...(x.use ?? {}), rutf: Number(v) || 0 }; if (!v) delete x.use.rutf; save(n); }, { type: "number", min: 0 })),
    bs.length ? h("div", {}, title("Runs out"), list(...bs.map((b) => row({ color: LEVEL[b.level] }, `${b.item.name}: ${b.runsOut}`, `${fmt(b.cover)} days · ${b.sendBy ? `send by ${b.sendBy} from ${b.source?.name}` : "no source can reach it"}`)))) : "",
    title("Rainy season"),
    h("div", { class: "chips wrap" }, ...MONTHS.map((m, i) => h("button", { class: "chip" + (x.wet?.includes(i) ? " on" : ""), onclick: () => { x.wet = x.wet?.includes(i) ? x.wet.filter((k) => k !== i) : [...(x.wet ?? []), i].sort((a, b) => a - b); save(n); hubScreen(ctx, n, x); } }, m))),
    h("button", { class: "link-btn", onclick: () => void fillWet(ctx, n, [x]).then(() => hubScreen(ctx, n, x)) }, "Fill in from ten years of rainfall"),
    pre ? lines(`${pre.starts <= t ? "In the wet season now" : `Rains from ${pre.starts}`}: ${pre.months} months without a dry-season road. Needs ${pre.need.map((z) => `${qty(z.item, z.units)} ${z.item.name.toLowerCase()}${z.short ? ` (short ${qty(z.item, z.short)})` : ""}`).join(", ")}.`) : "",
    title("Routes from here"),
    links.length ? list(...links.map((l) => { const o = hubOf(n, l.from === x.id ? l.to : l.from); return row(MODES[l.mode].emoji, `${MODES[l.mode].label} to ${o?.name}`, `${fmt(l.km)} km · ${daysText(legDays(n, l, month()))} now · ${l.status}${l.dryOnly ? " · dry season only" : ""}`, () => legScreen(ctx, n, l, () => hubScreen(ctx, n, x))); })) : empty("Not linked to anywhere yet."),
    other.length ? h("div", { class: "row" },
      select(newLeg.to, other.map((y) => [y.id, y.name] as [string, string]), (v) => { newLeg.to = v; }),
      select<Mode>(newLeg.mode, Object.entries(MODES).map(([k, v]) => [k as Mode, v.label]), (v) => { newLeg.mode = v; }),
      h("button", { class: "pill-btn", onclick: () => { const o = hubOf(n, newLeg.to)!; n.legs.push({ id: newId(), from: x.id, to: o.id, mode: newLeg.mode, km: kmBetween(x, o), status: "open" }); save(n); hubScreen(ctx, n, x); } }, "+ Route")) : "",
    h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${x.name} and its routes?`)) { n.hubs = n.hubs.filter((y) => y.id !== x.id); n.legs = n.legs.filter((l) => l.from !== x.id && l.to !== x.id); save(n); back(); } } }, "Remove this place"));
}

async function fillWet(ctx: WorkCtx, n: Network, hs: Hub[]) {
  ctx.app.toast(`Reading ten years of rainfall for ${hs.length} place${hs.length === 1 ? "" : "s"}…`, 2500);
  let k = 0;
  await Promise.all(hs.map(async (x) => { const c = summarise(await climateDays(x.lon, x.lat, 10).catch(() => [])); if (c) { x.wet = c.wetMonths; k++; } }));
  save(n);
  ctx.app.toast(k ? `Rainy seasons filled in for ${k}.` : "No rainfall records came back.", 2500);
}

// ---- Access ------------------------------------------------------------------------------------------

function legScreen(ctx: WorkCtx, n: Network, l: Leg, back: () => void) {
  const a = hubOf(n, l.from), b = hubOf(n, l.to), inc = legIncidents(n, l, today());
  draw(ctx.app, n, { path: [l.from, l.to] });
  ctx.show(`${a?.name} – ${b?.name}`, () => { draw(ctx.app, n); back(); },
    kpis([daysText(legDays(n, l, month())), "to get through now"], [`${fmt(l.km * MODES[l.mode].detour)} km`, MODES[l.mode].label.toLowerCase()], [usd(l.km * MODES[l.mode].detour * (l.usdPerTkm ?? MODES[l.mode].usdPerTkm)), "a tonne"], [String(inc.length), "incidents, 14 days", inc.length > 0]),
    h("div", { class: "chips wrap" }, ...(["open", "slow", "cut"] as const).map((s) => h("button", { class: "chip" + (l.status === s ? " on" : ""), onclick: () => { l.status = s; save(n); legScreen(ctx, n, l, back); } }, s === "open" ? "Open" : s === "slow" ? "Slow (escorts, detours)" : "Cut"))),
    l.mode === "road" ? h("label", { class: "list-row" }, h("input", { type: "checkbox", checked: !!l.dryOnly, onchange: () => { l.dryOnly = !l.dryOnly; save(n); legScreen(ctx, n, l, back); } }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, "Dry season only (impassable in the rains)"))) : "",
    field("Delay: checkpoints, border (days)", input(l.delayDays ?? 0, (v) => { l.delayDays = Math.max(0, Number(v) || 0); save(n); }, { type: "number", min: 0, step: 0.5 })),
    field(l.mode === "air" ? "Flights a day" : l.mode === "river" ? "Barges a day" : "Trucks a day", input(l.perDay ?? "", (v) => { l.perDay = Number(v) || undefined; save(n); }, { type: "number", min: 0 })),
    field("Tonnes each", input(l.tonnesEach ?? "", (v) => { l.tonnesEach = Number(v) || undefined; save(n); }, { type: "number", min: 0 })),
    field("Rate ($ per tonne-km)", input(l.usdPerTkm ?? MODES[l.mode].usdPerTkm, (v) => { l.usdPerTkm = Number(v) || undefined; save(n); }, { type: "number", min: 0, step: 0.01 })),
    field("Note", input(l.note ?? "", (v) => { l.note = v || undefined; save(n); })),
    inc.length ? lines(...inc.map((i) => `⚠️ ${i.date}: ${i.text}`)) : "",
    h("button", { class: "link-btn danger", onclick: () => { n.legs = n.legs.filter((x) => x.id !== l.id); save(n); draw(ctx.app, n); back(); } }, "Remove this route"));
}

function accessPanel(ctx: WorkCtx, n: Network) {
  const t = today(), m = month(), cut = cutOff(n, m);
  const rank = (l: Leg) => (!Number.isFinite(legDays(n, l, m)) ? 0 : l.status === "slow" || legIncidents(n, l, t).length ? 1 : 2);
  const name = (l: Leg) => `${hubOf(n, l.from)?.name} – ${hubOf(n, l.to)?.name}`;
  const inc = [...n.incidents].sort((a, b) => b.date.localeCompare(a.date));
  return h("div", {},
    h("p", { class: "muted small" }, `Which routes are open this month (${MONTHS[m]}), slow or cut: by you, by the rains on dry-season roads, or near a recent incident. Tap a route to change it; everything downstream follows.`),
    cut.length ? h("div", {}, title(`Cut off by ground · ${cut.length}`), list(...cut.map(({ h: x, any }) => row({ color: any ? "#64d2ff" : "#ff453a" }, x.name, any ? "Air only this month" : "No way in at all this month", () => hubScreen(ctx, n, x))))) : lines("✓ Every place can be reached by road or river."),
    title("Routes"),
    list(...[...n.legs].sort((a, b) => rank(a) - rank(b)).map((l) => {
      const d = legDays(n, l, m), c = legColor(n, l), i = legIncidents(n, l, t);
      const why = !Number.isFinite(d) ? (l.status === "cut" ? "cut" : "closed in the rains") : [l.status === "slow" ? "slow" : "", l.mode === "road" && legWet(n, l, m) ? "wet season: half speed" : "", i.length ? `${i.length} incident${i.length === 1 ? "" : "s"} nearby` : ""].filter(Boolean).join(" · ") || "open";
      return row({ color: c.color }, `${MODES[l.mode].emoji} ${name(l)}`, `${daysText(d)} · ${why}${l.note ? ` · ${l.note}` : ""}`, () => legScreen(ctx, n, l, () => openRelief(ctx)));
    })),
    title("Incidents"),
    h("button", { class: "pill-btn", onclick: () => void addIncident(ctx, n) }, "+ Report an incident"),
    inc.length ? list(...inc.map((i) => row({ color: i.severity === 3 ? "#ff453a" : "#ff9f0a" }, i.text, `${i.date} · ${daysBetween(i.date, t)} days ago`, () => void flyToPlace(ctx.app.globe, { name: i.text, lon: i.lon, lat: i.lat, radius: 20_000 })))) : empty("None reported."),
    h("button", { class: "link-btn", onclick: () => void fillWet(ctx, n, n.hubs).then(() => openRelief(ctx)) }, "Fill in every place's rainy season from ten years of rainfall"));
}

async function addIncident(ctx: WorkCtx, n: Network) {
  const text = prompt("What happened?");
  if (!text) return;
  const where = prompt("Where? A town, or coordinates (lat, lon)");
  if (!where) return;
  const m = where.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  let lon: number, lat: number;
  if (m) { lat = Number(m[1]); lon = Number(m[2]); } else { const [g] = await geocode(where).catch(() => []); if (!g) { ctx.app.toast("Couldn't find that place.", 2500); return; } lon = g.lon; lat = g.lat; }
  n.incidents.push({ id: newId(), date: today(), text, lon, lat, severity: 3 });
  save(n); openRelief(ctx);
}

// ---- Moves -------------------------------------------------------------------------------------------

function movesPanel(ctx: WorkCtx, n: Network) {
  const t = today(), open = n.moves.filter((m) => m.status !== "delivered").sort((a, b) => a.arrives.localeCompare(b.arrives));
  const done = n.moves.filter((m) => m.status === "delivered");
  return h("div", {},
    h("button", { class: "primary-btn", onclick: () => moveScreen(ctx, n, {}) }, "Plan a move"),
    title(`On the way · ${open.length}`),
    open.length ? list(...open.map((m) => {
      const i = itemOf(m.item)!, late = m.arrives < t;
      return row({ color: late || m.status === "delayed" ? "#ff453a" : "#bf5af2" }, `${qty(i, m.qty)} ${i.name.toLowerCase()} → ${hubOf(n, m.to)?.name}`,
        `from ${hubOf(n, m.from)?.name} · left ${m.left} · ${late ? `due ${m.arrives}, ${daysBetween(m.arrives, t)} days overdue` : `due ${m.arrives}`}${m.status === "delayed" ? " · delayed" : ""}`, undefined,
        h("button", { class: "pill-btn", onclick: (e: Event) => { e.stopPropagation(); m.status = "delivered"; const to = hubOf(n, m.to); if (to) to.stock[m.item] = (to.stock[m.item] ?? 0) + m.qty; save(n); openRelief(ctx); } }, "Arrived"));
    })) : empty("Nothing on the way."),
    done.length ? h("details", {}, h("summary", { class: "group-title" }, `Delivered · ${done.length}`), list(...done.map((m) => row("✓", `${qty(itemOf(m.item)!, m.qty)} ${itemOf(m.item)!.name.toLowerCase()} → ${hubOf(n, m.to)?.name}`, `left ${m.left}`)))) : "");
}

function moveScreen(ctx: WorkCtx, n: Network, pre: { item?: string; qty?: number; from?: string; to?: string }) {
  const t = today();
  const st = { item: pre.item ?? "cereal", qty: pre.qty ?? 100, from: pre.from ?? n.hubs.find((x) => x.kind === "hub")?.id ?? n.hubs[0]?.id ?? "", to: pre.to ?? n.hubs.find((x) => x.kind === "point")?.id ?? "" };
  const out = h("div", {});
  const render = () => {
    out.replaceChildren();
    const item = itemOf(st.item)!;
    const opts = [["Fastest", {}], ["Cheapest", { cheapest: true }], ["By ground only", { noAir: true }]] as const;
    const plans = opts.map(([label, o]) => ({ label, p: planMove(n, item, st.qty, st.from, st.to, t, o) }));
    const fastest = plans[0].p;
    if (fastest) draw(ctx.app, n, { path: fastest.path.hubs });
    const have = hubOf(n, st.from)?.stock[st.item] ?? 0;
    out.append(
      have < st.qty ? lines(`⚠️ ${hubOf(n, st.from)?.name} has only ${qty(item, have)}.`) : "",
      ...plans.map(({ label, p }, k) => k > 0 && p && plans[0].p && p.path.hubs.join() === plans[0].p.path.hubs.join() && p.path.modes.join() === plans[0].p.path.modes.join() ? lines(`${label}: the same way.`) : h("div", {}, title(label), p ? lines(
        `${p.path.hubs.map((id) => hubOf(n, id)?.name).join(" → ")} (${[...new Set(p.path.modes)].map((m) => MODES[m].label.toLowerCase()).join(", ")})`,
        `Arrives ${p.arrives} · ${daysText(p.path.days)} on the way · ${fmt(p.tonnes, 1)} t in ${p.trips.map((k, i) => `${k} ${p.path.legs[i].mode === "air" ? "flight" : p.path.legs[i].mode === "river" ? "barge" : "truck"}${k === 1 ? "" : "s"}`).join(", then ")}`,
        `About ${usd(p.usd)} · ${fmt(p.co2, 1)} t CO₂`) : lines("No way through this month."))),
      fastest ? h("button", { class: "primary-btn", onclick: () => {
        n.moves.push({ id: newId(), item: st.item, qty: st.qty, from: st.from, to: st.to, path: fastest.path.hubs, left: t, arrives: fastest.arrives, status: "moving" });
        const f = hubOf(n, st.from); if (f) f.stock[st.item] = Math.max(0, (f.stock[st.item] ?? 0) - st.qty);
        save(n); view = "moves"; draw(ctx.app, n); openRelief(ctx);
      } }, "Send it (the fastest way)") : "");
  };
  ctx.show("Plan a move", () => { draw(ctx.app, n); openRelief(ctx); },
    field("What", select(st.item, ITEMS.map((i) => [i.id, i.name] as [string, string]), (v) => { st.item = v; render(); })),
    field("How much", input(st.qty, (v) => { st.qty = Math.max(0, Number(v) || 0); render(); }, { type: "number", min: 0 })),
    field("From", select(st.from, n.hubs.map((x) => [x.id, x.name] as [string, string]), (v) => { st.from = v; render(); })),
    field("To", select(st.to, n.hubs.map((x) => [x.id, x.name] as [string, string]), (v) => { st.to = v; render(); })),
    out);
  render();
}

// ---- Sitrep ------------------------------------------------------------------------------------------

function sitrepPanel(n: Network) {
  const t = today(), bs = breaks(n, t), cut = cutOff(n, month());
  const tonnes = n.hubs.reduce((s, x) => s + fill(x).tonnes, 0), moving = n.moves.filter((m) => m.status !== "delivered");
  return h("div", {},
    kpis([`${fmt(tonnes)} t`, "in stock"], [`${fmt(moving.reduce((s, m) => s + m.qty * (itemOf(m.item)?.t ?? 0), 0))} t`, "on the way"], [String(n.hubs.filter((x) => x.kind === "point").length), "distribution points"], [fmt(n.hubs.reduce((s, x) => s + (x.people ?? 0), 0)), "people served"]),
    lines(`${bs.filter((b) => b.level === 3).length} pipeline breaks can't be prevented by sending now; ${bs.filter((b) => b.level === 2).length} must go out this week.`,
      cut.length ? `Cut off by ground: ${cut.map((c) => `${c.h.name}${c.any ? " (air only)" : " (no access)"}`).join(", ")}.` : "Every place reachable by ground.",
      `${n.incidents.filter((i) => daysBetween(i.date, t) <= 14).length} incidents in the last 14 days.`),
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => sitrep(n) }, "Print the logistics sitrep"),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${n.name} stock ${t}`, ["place", "kind", ...ITEMS.map((i) => `${i.name} (${i.unit})`), "people"], n.hubs.map((x) => [x.name, HUB_KINDS[x.kind].label, ...ITEMS.map((i) => x.stock[i.id] ?? 0), x.people ?? ""])) }, "Stock (CSV)"),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${n.name} pipeline ${t}`, ["place", "item", "stock", "coming", "per day", "days left", "runs out", "source", "lead days", "send by"], bs.map((b) => [b.hub.name, b.item.name, b.stock, b.coming, fmt(b.perDay, 2), fmt(b.cover, 1), b.runsOut, b.source?.name ?? "", b.path ? fmt(b.path.days, 1) : "", b.sendBy ?? ""])) }, "Pipeline (CSV)")));
}

function sitrep(n: Network) {
  const t = today(), m = month(), bs = breaks(n, t), cut = cutOff(n, m);
  printReport(`${n.name}: logistics situation report`, `${t}`, [
    { heading: "Summary", kpis: [[String(bs.filter((b) => b.level === 3).length), "unavoidable breaks"], [String(bs.filter((b) => b.level === 2).length), "send this week"], [String(cut.length), "cut off by ground"], [String(overdue(n, t).length), "consignments overdue"]] },
    { heading: "Pipeline", table: { head: ["Place", "Item", "Days left", "Runs out", "Send by", "From"], rows: bs.filter((b) => b.level >= 2).map((b) => [b.hub.name, b.item.name, fmt(b.cover, 1), b.runsOut, b.sendBy ?? "no route", b.source?.name ?? ""]) } },
    { heading: "Access", lines: [
      ...cut.map((c) => `${c.h.name}: ${c.any ? "air only" : "no access"} this month.`),
      ...n.legs.filter((l) => !Number.isFinite(legDays(n, l, m)) || l.status === "slow").map((l) => `${hubOf(n, l.from)?.name} – ${hubOf(n, l.to)?.name} (${MODES[l.mode].label.toLowerCase()}): ${Number.isFinite(legDays(n, l, m)) ? "slow" : l.status === "cut" ? "cut" : "closed in the rains"}${l.note ? `, ${l.note}` : ""}.`),
    ] },
    { heading: "Stock", table: { head: ["Place", ...ITEMS.map((i) => i.name)], rows: n.hubs.map((x) => [x.name, ...ITEMS.map((i) => fmt(x.stock[i.id] ?? 0))]) } },
    { heading: "On the way", table: { head: ["Item", "Quantity", "From", "To", "Due", "Status"], rows: n.moves.filter((x) => x.status !== "delivered").map((x) => [itemOf(x.item)!.name, fmt(x.qty), hubOf(n, x.from)?.name ?? "", hubOf(n, x.to)?.name ?? "", x.arrives, x.arrives < t ? "overdue" : x.status]) } },
    { heading: "Incidents, last 14 days", lines: n.incidents.filter((i) => daysBetween(i.date, t) <= 14).map((i) => `${i.date}: ${i.text}`) },
  ]);
}



/** A warehouse or distribution point as a hologram, with what's left and what's coming. */
async function hubHologram(app: App, n: Network, x: Hub) {
  const t = today(), bs = breaks(n, t).filter((b) => b.hub.id === x.id), f = fill(x);
  const inc = n.incidents.filter((i) => kmBetween(i, x) < 2);
  const hl = await openSpace(app, {
    name: x.name, kicker: `${HUB_KINDS[x.kind].label}${x.people ? ` · serves ${x.people.toLocaleString()} people` : ""}`, lon: x.lon, lat: x.lat, size: 1400, tint: "green",
    markers: [{ lon: x.lon, lat: x.lat, color: bs.some((b) => b.level === 3) ? "#ff453a" : bs.some((b) => b.level === 2) ? "#ff9f0a" : "#30d158", label: `${fmt(f.tonnes)} t in stock`, pulse: bs.some((b) => b.level === 3), height: 60 },
      ...inc.map((i) => ({ lon: i.lon, lat: i.lat, color: "#ff453a", label: i.text.slice(0, 32), pulse: true }))],
  });
  hl.setHud([
    ...bs.slice(0, 4).map((b) => ({ k: b.item.name, v: b.cover < 1 ? "Out" : `${Math.floor(b.cover)} days left` })),
    ...(x.capacity ? [{ k: "Warehouse", v: `${Math.round(f.share * 100)}% full` }] : []),
  ], bs[0] && bs[0].level >= 2 ? `${bs[0].item.name} runs out ${bs[0].runsOut}` : undefined);
}
