// A field of work, in three layers (catalog.ts): the field itself, live on the map for anyone; the field's Pro, your
// own work in it as a map you run; and the field's services, every kind of company that serves it, each found on the
// map. The field page shows the three as big cards; the specialist tools (Freight Desk, Mining Pro…) sit under them.
import { Cartesian2, Math as CesiumMath } from "cesium";
import type { WorkCtx } from "../hub";
import { WorkLayer } from "../layer";
import type { Line } from "../workLines";
import { overpass } from "../../data/overpass";
import { h } from "../../ui/dom";
import { haptic } from "../../ui/haptics";
import { categoryQuery, FIELDS, layerNames, searchLink, type Cat } from "./catalog";

/** Pigments for categories on the map, in turn. */
const INKS = ["#9c4a32", "#3563d6", "#5b9467", "#d19a2e", "#8b5fa8", "#4c9ac9", "#b8496a", "#9a7552"];
let layer: WorkLayer | null = null;

interface Found { name: string; lon: number; lat: number; km: number; cat: number; sub?: string }

/** Where the map is looking, and how far round to search (from the camera's height). */
function lookingAt(ctx: WorkCtx): { lon: number; lat: number; radius: number } {
  const v = ctx.app.globe.viewer, c = v.canvas;
  const ray = v.camera.getPickRay(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
  const hit = ray && v.scene.globe.pick(ray, v.scene);
  const g = hit ? v.scene.globe.ellipsoid.cartesianToCartographic(hit) : v.camera.positionCartographic;
  const height = v.camera.positionCartographic.height;
  return { lon: CesiumMath.toDegrees(g.longitude), lat: CesiumMath.toDegrees(g.latitude), radius: Math.round(Math.min(8000, Math.max(800, height * 0.8))) };
}
const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
  Math.hypot((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180), a.lat - b.lat) * 111.2;
const dist = (k: number) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1)} km`);

/** Everything in a set of categories around a spot, named ones nearest first. */
async function findAround(cats: Cat[], at: { lon: number; lat: number; radius: number }): Promise<Found[]> {
  const lists = await Promise.all(cats.map((c, i) => (c.tags ? overpass(categoryQuery(c.tags, at, at.radius, 120)).then((els) => els.map((el) => ({ el, i }))) : Promise.resolve([]))));
  const seen = new Set<string>(), out: Found[] = [];
  for (const { el, i } of lists.flat()) {
    const t = el.tags ?? {}, p = el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : el.center;
    if (!p || !t.name || seen.has(`${el.type}${el.id}`)) continue;
    seen.add(`${el.type}${el.id}`);
    out.push({ name: t.name, lon: p.lon, lat: p.lat, km: km(at, p), cat: i, sub: [t["addr:street"], t.cuisine?.replace(/_/g, " ").replace(/;/g, ", ")].filter(Boolean).join(" · ") || undefined });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** The three layers as big cards, for a field's page (workMap.ts). */
export function fieldLayers(ctx: WorkCtx, line: Line, opts: { openPro: () => void; proLine?: string }): HTMLElement {
  const f = FIELDS[line.id];
  if (!f) return h("div");
  const names = layerNames(line.label);
  const card = (n: number, title: string, about: string, extra: string, onclick: () => void) =>
    h("button", { class: "fl-card", style: `--c:${line.color}`, "data-haptic": "select", onclick },
      h("span", { class: "fl-n" }, String(n)),
      h("span", { class: "fl-text" }, h("strong", {}, title), h("span", {}, about), extra ? h("small", {}, extra) : ""),
      h("span", { class: "wk-chev", "aria-hidden": "true" }, "›"));
  const sample = f.services.cats.slice(0, 4).map((c) => c.label.split(" and ")[0].toLowerCase()).join(", ");
  return h("div", { class: "fl" },
    card(1, names.everyday, f.everyday.about, "Live on the map, for anyone", () => openEveryday(ctx, line)),
    card(2, names.pro, f.pro.about, opts.proLine ?? "Your own work, as a map you run", opts.openPro),
    card(3, names.services, `${f.services.cats.length} kinds of company: ${sample} and more`, "Find them on the map", () => openServices(ctx, line)));
}

// ---- 1. The field, live on the map ----

function openEveryday(ctx: WorkCtx, line: Line) {
  const f = FIELDS[line.id];
  const names = layerNames(line.label);
  layer ??= new WorkLayer(ctx.app, "work-field", names.everyday, line.color);
  let on = new Set(f.everyday.cats.map((_, i) => i));
  let found: Found[] = [];
  const status = h("p", { class: "muted small", "aria-live": "polite" });
  const list = h("div", { class: "fl-list" });
  const draw = () => {
    const shown = found.filter((x) => on.has(x.cat));
    layer!.set(shown.slice(0, 300).map((x, k) => ({ id: `p${k}`, kind: "point" as const, pts: [[x.lon, x.lat]] as [number, number][], color: INKS[x.cat % INKS.length], label: k < 25 ? x.name : undefined,
      tap: () => ctx.app.select({ lon: x.lon, lat: x.lat, height: 0 }, { title: x.name, context: f.everyday.cats[x.cat].label }) })), names.everyday);
    list.replaceChildren(...shown.slice(0, 40).map((x) => h("button", { class: "list-row", onclick: () => ctx.app.select({ lon: x.lon, lat: x.lat, height: 0 }, { title: x.name, context: f.everyday.cats[x.cat].label }) },
      h("i", { class: "dk-dot", style: `--hc:${INKS[x.cat % INKS.length]}` }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.name), h("span", { class: "list-sub" }, [f.everyday.cats[x.cat].label, x.sub].filter(Boolean).join(" · "))),
      h("span", { class: "dk-when" }, dist(x.km)))));
    for (const [i, b] of chipEls.entries()) { b.setAttribute("aria-pressed", String(on.has(i))); b.querySelector("b")!.textContent = String(found.filter((x) => x.cat === i).length || ""); }
  };
  const chipEls = f.everyday.cats.map((c, i) => h("button", { class: "chip fl-chip", style: `--c:${INKS[i % INKS.length]}`, "aria-pressed": "true", onclick: () => {
    on = on.size === f.everyday.cats.length ? new Set([i]) : on.has(i) ? new Set([...on].filter((x) => x !== i)) : new Set([...on, i]);
    if (!on.size) on = new Set(f.everyday.cats.map((_, k) => k));
    draw();
  } }, h("i", {}), c.label, " ", h("b", {})));
  let job = 0;
  const load = async () => {
    const at = lookingAt(ctx), my = ++job;
    status.textContent = `Looking within ${dist(at.radius / 1000)} of the middle of the map…`;
    found = await findAround(f.everyday.cats, at).catch(() => []);
    if (my !== job || !root.isConnected) return;
    status.textContent = found.length ? `${found.length} places within ${dist(at.radius / 1000)}. Move the map and it follows.` : "Nothing mapped here yet. Move the map somewhere busier, or zoom out.";
    draw();
  };
  // Live: when the map stops moving, the view follows it, for as long as this screen is open.
  let t = 0;
  const follow = () => { if (!root.isConnected) { off(); return; } clearTimeout(t); t = window.setTimeout(() => void load(), 900); };
  const off = ctx.app.globe.viewer.camera.moveEnd.addEventListener(follow);
  const root = h("div", { class: "fl-view" },
    h("p", { class: "mp-intro" }, f.everyday.about),
    h("div", { class: "dk-kinds" }, ...chipEls),
    status, list);
  ctx.show(names.everyday, () => { off(); layer?.clear(); ctx.home(); }, root);
  void load();
}

// ---- 3. The field's services ----

function openServices(ctx: WorkCtx, line: Line) {
  const f = FIELDS[line.id];
  const names = layerNames(line.label);
  layer ??= new WorkLayer(ctx.app, "work-field", names.services, line.color);
  const filter = h("input", { class: "pro-url", type: "search", placeholder: `Find a kind of company (e.g. ${f.services.cats[Math.min(7, f.services.cats.length - 1)].label.toLowerCase()})`, "aria-label": "Find a kind of company" }) as HTMLInputElement;
  const found = h("div", { class: "fl-found" });
  const rows = h("div", { class: "fl-services" });
  const open = async (c: Cat, i: number, row: HTMLElement) => {
    haptic("select");
    for (const r of rows.children) r.classList.toggle("on", r === row);
    const at = lookingAt(ctx), radius = Math.max(3000, at.radius * 2);
    if (!c.tags) { found.replaceChildren(h("p", { class: "muted small" }, `${c.label} aren't marked on the open map, so here's a search around where you're looking.`), h("a", { class: "primary-btn", href: searchLink(c, at), target: "_blank", rel: "noopener" }, `Search for ${c.label.toLowerCase()} ›`)); row.after(found); return; }
    found.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), `Finding ${c.label.toLowerCase()}…`));
    row.after(found);
    const list = await findAround([c], { ...at, radius }).catch(() => []);
    layer!.set(list.slice(0, 200).map((x, k) => ({ id: `s${k}`, kind: "point" as const, pts: [[x.lon, x.lat]] as [number, number][], color: INKS[i % INKS.length], label: k < 20 ? x.name : undefined,
      tap: () => ctx.app.select({ lon: x.lon, lat: x.lat, height: 0 }, { title: x.name, context: c.label }) })), `${names.services}: ${c.label}`);
    found.replaceChildren(
      ...(list.length ? list.slice(0, 12).map((x) => h("button", { class: "list-row", onclick: () => ctx.app.select({ lon: x.lon, lat: x.lat, height: 0 }, { title: x.name, context: c.label }) },
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.name), h("span", { class: "list-sub" }, x.sub ?? c.label)), h("span", { class: "dk-when" }, dist(x.km))))
        : [h("p", { class: "muted small" }, `None mapped within ${dist(radius / 1000)}.`)]),
      h("a", { class: "link-btn", href: searchLink(c, at), target: "_blank", rel: "noopener" }, `More ${c.label.toLowerCase()} near here ›`));
  };
  const render = () => {
    const q = filter.value.trim().toLowerCase();
    rows.replaceChildren(...f.services.cats.map((c, i) => ({ c, i })).filter(({ c }) => !q || `${c.label} ${c.q ?? ""}`.toLowerCase().includes(q)).map(({ c, i }) => {
      const row: HTMLElement = h("button", { class: "fl-service", style: `--c:${INKS[i % INKS.length]}`, onclick: () => void open(c, i, row) },
        h("i", {}), h("span", {}, c.label), h("small", {}, c.tags ? "On the map" : "Search"));
      return row;
    }));
  };
  filter.addEventListener("input", render);
  render();
  ctx.show(names.services, () => { layer?.clear(); ctx.home(); },
    h("p", { class: "mp-intro" }, `${f.services.about}. Tap one to see them around where the map is looking.`),
    filter, rows);
}

