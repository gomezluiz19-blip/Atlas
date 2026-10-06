// The business network on the map: sites and partners where they are, and
// what moves between them drawn as living streams (goods orange, people blue,
// money green, data purple), thicker and busier for bigger flows, arcing off
// the globe for long hops. Each flow says how far, how long and how much
// carbon; the whole network sums up at the top.
import type { App } from "../../app";
import { FlowOverlay } from "../../globe/flow";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { arc } from "../../work/journey";
import { WorkLayer, type WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { demoNetwork } from "./demo";
import {
  blankNetwork, duration, FLOW_KINDS, flowFacts, MODES, networkFacts, NODE_KINDS,
  type Flow, type FlowKind, type Mode, type NodeKind, type Per, type Network,
} from "./model";

const nets = new ListStore<Network>("atlas.pro.networks.v1");
let layer: WorkLayer | null = null;
let streams: FlowOverlay | null = null;
const current = () => nets.all()[0];
const save = (n: Network) => nets.save(n);
const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });
const kmText = (km: number) => (km >= 100 ? `${fmt(km)} km` : `${fmt(km, 1)} km`);

/** The network on the globe: nodes, the routes between them, and the moving streams along them. */
function draw(app: App, n: Network) {
  layer ??= new WorkLayer(app, "pro:network", n.name, "#d19a2e");
  streams ??= new FlowOverlay(app.globe.viewer, { maxHeight: Number.POSITIVE_INFINITY, maxDrops: 2600 });
  const byId = new Map(n.nodes.map((x) => [x.id, x]));
  const fs: WorkFeature[] = n.nodes.map((x) => ({ id: x.id, kind: "point", pts: [[x.lon, x.lat]], color: NODE_KINDS[x.kind].ours ? "#d19a2e" : "#8c8f87", label: `${NODE_KINDS[x.kind].emoji} ${x.name}` }));
  const lines = [];
  const biggest = Math.max(1, ...n.flows.map((f) => f.amount));
  for (const f of n.flows) {
    const a = byId.get(f.from), b = byId.get(f.to);
    if (!a || !b) continue;
    const pts = arc([a.lon, a.lat], [b.lon, b.lat], 64).flat() as [number, number][];
    const k = FLOW_KINDS[f.kind];
    fs.push({ id: f.id, kind: "line", pts, color: k.color, dashed: f.mode === "digital" });
    const km = flowFacts(f, a, b).km || 1;
    // Bigger flows: more and larger drops; every stream crosses its leg in about six seconds.
    const weight = 0.4 + Math.log10(1 + (f.amount / biggest) * 9);
    lines.push({ pts, color: k.color, speed: Math.max(20, (km * 1000) / 6), density: Math.max(4, (40 * weight) / Math.max(1, km / 20)), size: 1.6 + weight * 1.4, arc: Math.min(400_000, km * 40) });
  }
  layer.set(fs, `Business · ${n.name}`);
  streams.set(lines);
  streams.show(true);
}

function frame(app: App, n: Network) {
  if (!n.nodes.length) return;
  let w = 180, e = -180, s = 90, no = -90;
  for (const x of n.nodes) { w = Math.min(w, x.lon); e = Math.max(e, x.lon); s = Math.min(s, x.lat); no = Math.max(no, x.lat); }
  const r = Math.max(3000, Math.min(7_000_000, Math.hypot((e - w) * 111_000 * Math.cos(((s + no) / 2) * Math.PI / 180), (no - s) * 111_000) / 2));
  void flyToPlace(app.globe, { name: n.name, lon: (w + e) / 2, lat: (s + no) / 2, radius: r });
}

export function openNetwork(ctx: WorkCtx) {
  const n = current();
  if (!n) return start(ctx);
  draw(ctx.app, n);
  home(ctx, n);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your business's name" }) as HTMLInputElement;
  ctx.show("Business network", ctx.home,
    h("p", {}, "Your business as it really runs: sites, suppliers and customers, and what moves between them."),
    name,
    h("button", { class: "primary-btn", onclick: () => { save(blankNetwork(name.value.trim() || "My business")); openNetwork(ctx); } }, "Start mapping"),
    h("button", { class: "pill-btn", onclick: () => { const n = demoNetwork(); save(n); openNetwork(ctx); frame(ctx.app, n); } }, "Or try a demo: a coffee roaster"));
}

function home(ctx: WorkCtx, n: Network) {
  const { app } = ctx;
  const facts = networkFacts(n);
  const kinds = (Object.keys(FLOW_KINDS) as FlowKind[]).filter((k) => n.flows.some((f) => f.kind === k));
  ctx.show("Business network", ctx.home,
    h("input", { class: "mp-name", value: n.name, "aria-label": "Business name", onchange: (e: Event) => { n.name = (e.target as HTMLInputElement).value || n.name; save(n); } }),
    h("div", { class: "po-kpis" },
      h("div", { class: "po-kpi" }, h("strong", {}, String(facts.sites)), h("span", {}, "sites")),
      h("div", { class: "po-kpi" }, h("strong", {}, String(facts.partners)), h("span", {}, "partners")),
      h("div", { class: "po-kpi" }, h("strong", {}, String(n.flows.length)), h("span", {}, "flows")),
      h("div", { class: "po-kpi" }, h("strong", {}, facts.co2t ? fmt(facts.co2t, facts.co2t < 10 ? 1 : 0) : "—"), h("span", {}, "t CO₂ a year"))),
    kinds.length ? h("div", { class: "pol-legend" }, ...kinds.map((k) => h("span", {}, h("i", { style: `background:${FLOW_KINDS[k].color}` }), FLOW_KINDS[k].label))) : "",
    h("div", { class: "row" }, h("button", { class: "pill-btn", onclick: () => frame(app, n) }, "See it all")),
    facts.longest || facts.heaviest.length ? h("div", { class: "now-here" }, h("ul", { class: "now-lines" },
      facts.longest ? h("li", {}, `Longest leg: ${facts.longest.f.what} from ${facts.longest.a.name.split(",")[0]} to ${facts.longest.b.name.split(",")[0]}, ${kmText(facts.longest.x.km)} by ${MODES[facts.longest.f.mode].label.toLowerCase()}.`) : "",
      facts.slowest ? h("li", {}, `Slowest: ${facts.slowest.f.what} takes about ${duration(facts.slowest.x.hours)} door to door.`) : "",
      facts.tkm ? h("li", {}, `${fmt(facts.tkm)} tonne-km of goods a year.`) : "",
      ...facts.heaviest.map((r) => h("li", {}, `${r.f.what} ${r.a.name.split(",")[0]} → ${r.b.name.split(",")[0]}: ${fmt(r.x.co2t!, 1)} t CO₂ a year (${MODES[r.f.mode].label.toLowerCase()}).`)))) : "",
    h("h2", { class: "group-title" }, "What moves"),
    n.flows.length ? h("div", { class: "list" }, ...facts.flows.map(({ f, a, b, x }) => h("button", { class: "list-row", onclick: () => flowScreen(ctx, n, f) },
      h("span", { class: "dot", style: `background:${FLOW_KINDS[f.kind].color}` }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, `${f.what}: ${a.name.split(",")[0]} → ${b.name.split(",")[0]}`),
        h("span", { class: "list-sub" }, [`${fmt(f.amount, 1)} ${f.unit} a ${f.per}`, MODES[f.mode].label, f.mode !== "digital" ? `${kmText(x.km)} · ${duration(x.hours)}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" })))) : h("p", { class: "muted small" }, "Add two places, then what moves between them."),
    n.nodes.length >= 2 ? h("button", { class: "link-btn", onclick: () => flowScreen(ctx, n, null) }, "+ Something that moves") : "",
    h("h2", { class: "group-title" }, "Places"),
    h("div", { class: "list" }, ...n.nodes.map((x) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: x.name, lon: x.lon, lat: x.lat, radius: 2500 }) },
      h("span", { class: "story-mini-emoji" }, NODE_KINDS[x.kind].emoji),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.name), h("span", { class: "list-sub" }, [NODE_KINDS[x.kind].label, x.people ? `${x.people} people` : "", n.flows.filter((f) => f.from === x.id || f.to === x.id).length + " flows"].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" })))),
    nodeAdder(ctx, n),
    h("div", { class: "mp-foot" }, h("span", {}, n.demo ? "A demo business: made up." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${n.name}?`)) { nets.remove(n.id); layer?.clear(); streams?.set([]); openNetwork(ctx); } } }, "Remove")),
    note("Distances are great-circle distances stretched by a typical detour for each way of moving; times add typical handling (ports two days, air cargo six hours). Carbon uses common per tonne-km and per passenger-km factors, so read it as an estimate for comparing options."));
}

function nodeAdder(ctx: WorkCtx, n: Network): HTMLElement {
  const input = h("input", { class: "pro-url", placeholder: "Add a place: an address, city or port" }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...(Object.keys(NODE_KINDS) as NodeKind[]).map((k) => h("option", { value: k }, `${NODE_KINDS[k].emoji} ${NODE_KINDS[k].label}`))) as HTMLSelectElement;
  const add = async () => {
    const q = input.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (!r) { ctx.app.toast("Couldn't find that place. Try adding the town or country.", 4000); return; }
    n.nodes.push({ id: newId(), name: q, kind: kind.value as NodeKind, lon: r.lon, lat: r.lat, address: r.detail });
    save(n); openNetwork(ctx);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void add(); });
  return h("div", { class: "po-add" }, input, kind, h("button", { class: "pill-btn", onclick: () => void add() }, "Add"));
}

function flowScreen(ctx: WorkCtx, n: Network, f: Flow | null) {
  const fresh = !f;
  const x: Flow = f ?? { id: newId(), from: n.nodes[0]?.id ?? "", to: n.nodes[1]?.id ?? "", what: "", kind: "goods", amount: 1, unit: "t", per: "month", mode: "truck" };
  const sel = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) =>
    h("label", { class: "po-field" }, h("span", {}, label), h("select", { onchange: (e: Event) => set((e.target as HTMLSelectElement).value as T) }, ...options.map(([v, l]) => h("option", { value: v, selected: v === value }, l))));
  const nodes = n.nodes.map((y) => [y.id, `${NODE_KINDS[y.kind].emoji} ${y.name}`] as [string, string]);
  const facts = h("p", { class: "muted small" });
  const update = () => {
    const a = n.nodes.find((y) => y.id === x.from), b = n.nodes.find((y) => y.id === x.to);
    if (!a || !b) return;
    const r = flowFacts(x, a, b);
    facts.textContent = x.mode === "digital" ? "Moves instantly." : `${kmText(r.km)} on the way, about ${duration(r.hours)} door to door${r.co2t ? `; ${fmt(r.co2t, 1)} t CO₂ a year` : ""}.`;
  };
  update();
  ctx.show(fresh ? "Something that moves" : x.what, () => openNetwork(ctx),
    h("label", { class: "po-field" }, h("span", {}, "What"), h("input", { value: x.what, placeholder: "Green coffee, baristas, payments…", onchange: (e: Event) => { x.what = (e.target as HTMLInputElement).value.trim(); } })),
    sel("Kind", x.kind, (Object.keys(FLOW_KINDS) as FlowKind[]).map((k) => [k, FLOW_KINDS[k].label]), (v) => { x.kind = v; x.unit = v === "people" ? "people" : v === "money" ? "USD" : v === "data" ? "orders" : "t"; update(); }),
    sel("From", x.from, nodes, (v) => { x.from = v; update(); }),
    sel("To", x.to, nodes, (v) => { x.to = v; update(); }),
    h("label", { class: "po-field" }, h("span", {}, "How much"), h("input", { type: "number", min: 0, step: "any", value: x.amount, onchange: (e: Event) => { x.amount = Number((e.target as HTMLInputElement).value) || 0; update(); } }),
      h("input", { class: "po-unit", value: x.unit, onchange: (e: Event) => { x.unit = (e.target as HTMLInputElement).value.trim() || x.unit; update(); } })),
    sel("Every", x.per, (["day", "week", "month", "year"] as Per[]).map((p) => [p, p]), (v) => { x.per = v; update(); }),
    sel("By", x.mode, (Object.keys(MODES) as Mode[]).map((m) => [m, MODES[m].label]), (v) => { x.mode = v; update(); }),
    facts,
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => { if (!x.what || !x.from || !x.to || x.from === x.to) { ctx.app.toast("Name it, and pick two different places.", 3500); return; } if (fresh) n.flows.push(x); save(n); openNetwork(ctx); } }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { n.flows = n.flows.filter((y) => y !== x); save(n); openNetwork(ctx); } }, "Remove") : ""));
}
