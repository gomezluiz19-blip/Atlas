// Work › Plan: trips, events, business sites, policy zones and infrastructure
// proposals, drawn on the map with the numbers each kind of plan needs.
import { airports, fuelOf, formatMw, nearby, nearestLine, ports, powerPlants, railways, roads } from "../data/infra";
import { elevation } from "../data/elevation";
import { forecast } from "../data/openmeteo";
import { riverLines } from "../data/worldData";
import { MINES } from "../content/minerals";
import { inlineChart, stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { drawOnMap } from "./draw";
import { along, areaM2, crossings, fmtArea, fmtDist, fmtHours, pathLength, type LonLat } from "./geo";
import { WorkLayer } from "./layer";
import { circle, countInside, legs, lengthInside, MODES, PLAN_TYPES, profileStats, type Plan, type PlanItem, type PlanType, type TravelMode } from "./planModel";
import { ListStore, download, newId } from "./store";
import type { WorkCtx } from "./hub";

const store = new ListStore<Plan>("atlas.work.plans.v1");
let layer: WorkLayer | null = null;

const km = (m: number) => fmtDist(m);
const letter = (i: number) => String.fromCharCode(65 + (i % 26));

function features(p: Plan, extra: import("./layer").WorkFeature[] = []) {
  const color = PLAN_TYPES[p.type].color;
  const pts = p.items.filter((i) => i.kind === "point");
  return [
    ...(p.type === "trip" && pts.length > 1 ? [{ id: "route", kind: "line" as const, pts: pts.map((s) => s.pts[0]), color, dashed: p.mode === "fly" }] : []),
    ...extra,
    ...p.items.filter((i) => i.kind !== "point").map((i) => ({ id: i.id, kind: i.kind, pts: i.pts, color, label: i.name, fill: 0.22 })),
    ...pts.map((i, k) => ({ id: i.id, kind: "point" as const, pts: i.pts, color, label: p.type === "trip" ? `${k + 1}. ${i.name}` : p.type === "business" ? `${letter(k)} · ${i.name}` : i.name })),
  ];
}

function focus(ctx: WorkCtx, p: Plan) {
  const all = p.items.flatMap((i) => i.pts);
  if (!all.length) return;
  const lon = all.reduce((s, q) => s + q[0], 0) / all.length, lat = all.reduce((s, q) => s + q[1], 0) / all.length;
  const r = Math.max(800, ...all.map((q) => pathLength([[lon, lat], q])));
  void flyToPlace(ctx.app.globe, { name: p.name, lon, lat, radius: r * 1.4 });
}

export function openPlans(ctx: WorkCtx) {
  layer?.clear();
  const types = Object.keys(PLAN_TYPES) as PlanType[];
  ctx.show("Plan", ctx.home,
    h("p", { class: "mp-intro" }, "Plan on the map: pick what kind of plan, then place its stops, sites, zones or routes."),
    h("div", { class: "work-types" }, ...types.map((t) =>
      h("button", { class: "work-type", style: `--c:${PLAN_TYPES[t].color}`, onclick: () => {
        const p: Plan = { id: newId(), type: t, name: `New ${PLAN_TYPES[t].label.toLowerCase()} plan`, created: Date.now(), items: [], checklist: [], mode: t === "trip" ? "drive" : undefined };
        store.save(p);
        openPlan(ctx, p.id);
      } }, h("strong", {}, PLAN_TYPES[t].label), h("span", {}, PLAN_TYPES[t].about)))),
    store.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Your plans"),
      h("div", { class: "list" }, ...store.all().map((p) =>
        h("button", { class: "list-row", onclick: () => openPlan(ctx, p.id) },
          h("span", { class: "dot big", style: `background:${PLAN_TYPES[p.type].color}` }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name), h("span", { class: "list-sub" }, `${PLAN_TYPES[p.type].label} · ${p.items.length} item${p.items.length === 1 ? "" : "s"}`)),
          h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
  );
}

export function openPlan(ctx: WorkCtx, id: string) {
  const p = store.get(id);
  if (!p) return openPlans(ctx);
  const cfg = PLAN_TYPES[p.type];
  layer ??= new WorkLayer(ctx.app, "work:plan", p.name, cfg.color);
  const save = (patch: Partial<Plan> = {}) => { Object.assign(p, patch); store.save(p); };
  const redraw = (extra: import("./layer").WorkFeature[] = []) => layer!.set(features(p, extra), `Plan · ${p.name}`);
  const analysis = h("div", { class: "work-analysis" });

  const addItem = async (kind: PlanItem["kind"], name: string) => {
    ctx.hide();
    const n = p.items.filter((i) => i.name.startsWith(name)).length + 1;
    const pts = await drawOnMap(ctx.app, kind, cfg.color, kind === "point" ? `Tap where the ${name.toLowerCase()} is` : kind === "line" ? "Tap along the route" : "Tap around the edge of the zone");
    ctx.unhide();
    if (!pts) return openPlan(ctx, p.id);
    p.items.push({ id: newId(), kind, pts, name: n > 1 || kind !== "point" || name === "Stop" || name === "Site" ? `${name} ${n}` : name });
    save();
    openPlan(ctx, p.id);
  };

  const itemRow = (it: PlanItem, i: number) =>
    h("div", { class: "list-row static work-item" },
      h("span", { class: "work-badge", style: `background:${cfg.color}` }, p.type === "trip" ? String(p.items.filter((x) => x.kind === "point").indexOf(it) + 1) : p.type === "business" ? letter(p.items.filter((x) => x.kind === "point").indexOf(it)) : it.kind === "area" ? "▢" : it.kind === "line" ? "∿" : "•"),
      h("span", { class: "list-text" },
        h("input", { class: "mp-label", value: it.name, "aria-label": "Name", onchange: (e: Event) => { it.name = (e.target as HTMLInputElement).value || it.name; save(); redraw(); } }),
        h("span", { class: "list-sub" },
          it.kind === "line" ? km(pathLength(it.pts)) : it.kind === "area" ? fmtArea(areaM2(it.pts)) : `${it.pts[0][1].toFixed(4)}, ${it.pts[0][0].toFixed(4)}`,
          p.type === "trip" ? h("input", { type: "date", class: "work-date", value: it.date ?? "", onchange: (e: Event) => { it.date = (e.target as HTMLInputElement).value || undefined; save(); } }) : "")),
      p.type === "trip" && i > 0 ? h("button", { class: "icon-btn", "aria-label": "Move up", title: "Move up", onclick: () => { const k = p.items.indexOf(it); [p.items[k - 1], p.items[k]] = [p.items[k], p.items[k - 1]]; save(); openPlan(ctx, p.id); } }, "↑") : "",
      h("button", { class: "icon-btn", "aria-label": `Remove ${it.name}`, onclick: () => { p.items = p.items.filter((x) => x !== it); save(); openPlan(ctx, p.id); } }, "✕"));

  const checklist = () => {
    const input = h("input", { class: "pro-url", placeholder: "Add a to-do and press Enter", onkeydown: (e: Event) => {
      const v = (e.target as HTMLInputElement).value.trim();
      if ((e as KeyboardEvent).key === "Enter" && v) { p.checklist.push({ text: v, done: false }); save(); openPlan(ctx, p.id); }
    } });
    return h("section", { class: "group" }, h("h2", { class: "group-title" }, "Checklist"),
      p.checklist.length ? h("div", { class: "work-checklist" }, ...p.checklist.map((c) =>
        h("label", { class: "work-check" + (c.done ? " done" : "") },
          h("input", { type: "checkbox", checked: c.done, onchange: () => { c.done = !c.done; save(); openPlan(ctx, p.id); } }), h("span", {}, c.text),
          h("button", { class: "link-btn", onclick: (e: Event) => { e.preventDefault(); p.checklist = p.checklist.filter((x) => x !== c); save(); openPlan(ctx, p.id); } }, "Remove")))) : "",
      input);
  };

  ctx.show(cfg.label, () => openPlans(ctx),
    h("input", { class: "mp-name", value: p.name, "aria-label": "Plan name", onchange: (e: Event) => { save({ name: (e.target as HTMLInputElement).value || p.name }); redraw(); } }),
    h("p", { class: "muted small" }, cfg.about),
    p.type === "trip" ? h("label", { class: "mp-field" }, h("span", {}, "Getting around"),
      h("select", { onchange: (e: Event) => { save({ mode: (e.target as HTMLSelectElement).value as TravelMode }); openPlan(ctx, p.id); } },
        ...(Object.keys(MODES) as TravelMode[]).map((m) => h("option", { value: m, selected: p.mode === m }, MODES[m].label)))) : "",
    p.type === "event" ? h("label", { class: "mp-field" }, h("span", {}, "Expected attendees"),
      h("input", { type: "number", min: 0, value: p.attendees ?? "", onchange: (e: Event) => { save({ attendees: parseInt((e.target as HTMLInputElement).value, 10) || undefined }); openPlan(ctx, p.id); } })) : "",
    h("div", { class: "chips wrap" }, ...cfg.add.map((a) => h("button", { class: "chip", onclick: () => void addItem(a.kind, a.name) }, `+ ${a.label}`))),
    p.items.length ? h("div", { class: "list" }, ...p.items.map(itemRow)) : h("p", { class: "muted small" }, "Nothing placed yet."),
    analysis,
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Notes"),
      h("textarea", { class: "mp-notes", rows: 3, placeholder: "Ideas, contacts, budget…", onchange: (e: Event) => save({ notes: (e.target as HTMLTextAreaElement).value }) }, p.notes ?? "")),
    checklist(),
    h("div", { class: "mp-foot" },
      h("span", {}, "Saved in this browser."),
      h("button", { class: "link-btn", onclick: () => focus(ctx, p) }, "Show on map"),
      h("button", { class: "link-btn", onclick: () => download(`${p.name}.json`, JSON.stringify(p, null, 2)) }, "Export"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete ${p.name}?`)) { store.remove(p.id); layer?.clear(); openPlans(ctx); } } }, "Delete")),
  );
  redraw();
  void analyse(p, analysis, redraw);
}

// ---- Analysis per kind of plan ------------------------------------------------------------

async function analyse(p: Plan, box: HTMLElement, redraw: (extra?: import("./layer").WorkFeature[]) => void) {
  const pts = p.items.filter((i) => i.kind === "point");
  const section = (title: string, ...c: (Node | string)[]) => h("section", { class: "group" }, h("h2", { class: "group-title" }, title), ...c);
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Working it out…");
  box.replaceChildren(loading);
  try {
    if (p.type === "trip") {
      if (pts.length < 2) { box.replaceChildren(h("p", { class: "muted small" }, "Add at least two stops to see distances and travel times.")); return; }
      const ls = legs(pts, p.mode ?? "drive");
      const total = ls.reduce((s, l) => s + l.route, 0), hours = ls.reduce((s, l) => s + l.hours, 0);
      const weather = h("div");
      box.replaceChildren(section("The route",
        h("div", { class: "mp-stat" }, h("strong", {}, `${km(total)} · ${fmtHours(hours)}`), h("span", {}, `${MODES[p.mode ?? "drive"].label}, about ${Math.round((MODES[p.mode ?? "drive"].detour - 1) * 100)}% longer than straight lines, at typical speeds`)),
        stats(...ls.map((l, i) => [`${i + 1} → ${i + 2}: ${l.to.name}`, `${km(l.route)} · ${fmtHours(l.hours)}`] as [string, string])),
        h("button", { class: "link-btn", onclick: async () => {
          weather.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Checking the forecast…"));
          const rows = await Promise.all(pts.map(async (s) => {
            const f = await forecast(s.pts[0][0], s.pts[0][1]).catch(() => null);
            if (!f) return [s.name, "Unavailable"] as [string, string];
            const d = Math.max(0, s.date ? f.daily.time.indexOf(s.date) : 0);
            if (s.date && f.daily.time.indexOf(s.date) < 0) return [s.name, "Beyond the 7-day forecast"] as [string, string];
            return [`${s.name}${s.date ? ` (${s.date})` : ""}`, `${Math.round(f.daily.temperature_2m_min[d])}–${Math.round(f.daily.temperature_2m_max[d])} °C · ${f.daily.precipitation_probability_max[d] ?? "?"}% rain`] as [string, string];
          }));
          weather.replaceChildren(stats(...rows));
        } }, "Weather at each stop"), weather));
    } else if (p.type === "event") {
      const venue = pts[0];
      if (!venue) { box.replaceChildren(h("p", { class: "muted small" }, "Place the venue to see how far people can come from.")); return; }
      const v = venue.pts[0];
      // Reach rings at typical urban driving speed (30 km/h door to door).
      const rings = [15, 30, 60].map((min) => ({ min, r: (30 * 1000 * min) / 60 / 1.3 }));
      redraw(rings.map((x, i) => ({ id: `ring${i}`, kind: "area" as const, pts: circle(v, x.r), color: PLAN_TYPES.event.color, fill: 0.06 * (3 - i), dashed: true })));
      const [aps, prt, rail] = await Promise.all([airports(), ports(), railways()]);
      const ap = nearby(aps, v[0], v[1], 2000, 1)[0], rl = nearestLine(rail, v[0], v[1], 200);
      const parking = p.attendees ? Math.ceil(p.attendees / 2.5) : 0;
      box.replaceChildren(section("Reach and access",
        h("p", { class: "muted small" }, "Dashed rings: roughly 15, 30 and 60 minutes by car in town. Real travel depends on roads and traffic."),
        stats(
          ap ? ["Nearest airport", `${ap.name} · ${km(ap.km * 1000)}`] : null,
          ["Nearest main railway", rl ? km(rl.km * 1000) : "Over 200 km"],
          nearby(prt, v[0], v[1], 200, 1)[0] ? ["Nearest seaport", `${nearby(prt, v[0], v[1], 200, 1)[0].name}`] : null,
          p.attendees ? ["Parking if everyone drives", `about ${parking.toLocaleString()} spaces (2.5 people per car)`] : null,
        )));
    } else if (p.type === "business") {
      if (!pts.length) { box.replaceChildren(h("p", { class: "muted small" }, "Add candidate sites to compare them.")); return; }
      const [aps, prt, rail, rds, plants] = await Promise.all([airports(), ports(), railways(), roads(), powerPlants()]);
      const rows = pts.map((s, i) => {
        const [lon, lat] = s.pts[0];
        const ap = nearby(aps, lon, lat, 3000, 1)[0], pt = nearby(prt, lon, lat, 3000, 1)[0];
        const rl = nearestLine(rail, lon, lat, 300), hw = nearestLine(rds, lon, lat, 300, (l) => l.attrs[0] === "M");
        const power = nearby(plants, lon, lat, 50).reduce((a, x) => a + x.mw, 0);
        return { name: `${letter(i)} · ${s.name}`, ap: ap?.km, pt: pt?.km, rl: rl?.km, hw: hw?.km, power };
      });
      const cell = (v: number | undefined, best: number) => h("td", { class: v !== undefined && v === best ? "best" : "" }, v === undefined ? "—" : km(v * 1000));
      const best = (k: "ap" | "pt" | "rl" | "hw") => Math.min(...rows.map((r) => r[k] ?? Infinity));
      box.replaceChildren(section("Compare sites",
        h("div", { class: "work-table-wrap" }, h("table", { class: "work-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Site"), h("th", {}, "Airport"), h("th", {}, "Seaport"), h("th", {}, "Railway"), h("th", {}, "Highway"), h("th", {}, "Power ≤50 km"))),
          h("tbody", {}, ...rows.map((r) => h("tr", {}, h("th", {}, r.name), cell(r.ap, best("ap")), cell(r.pt, best("pt")), cell(r.rl, best("rl")), cell(r.hw, best("hw")),
            h("td", { class: r.power === Math.max(...rows.map((x) => x.power)) && r.power > 0 ? "best" : "" }, r.power ? formatMw(r.power) : "—")))))),
        h("p", { class: "fineprint" }, "Straight-line distances to the nearest airport, seaport, main railway and major highway (Natural Earth), and power-plant capacity within 50 km (WRI). Best in each column is highlighted.")));
    } else if (p.type === "policy") {
      const zones = p.items.filter((i) => i.kind === "area");
      if (!zones.length) { box.replaceChildren(h("p", { class: "muted small" }, "Draw a zone to see what falls inside it.")); return; }
      const [plants, prt, aps, rail, rds] = await Promise.all([powerPlants(), ports(), airports(), railways(), roads()]);
      box.replaceChildren(...zones.map((z) => {
        const pw = countInside(z.pts, plants, (x) => x.mw);
        const mix = new Map<string, number>();
        for (const x of plants) if (countInside(z.pts, [x]).count) mix.set(fuelOf(x.fuel).label, (mix.get(fuelOf(x.fuel).label) ?? 0) + x.mw);
        return section(z.name, stats(
          ["Area", fmtArea(areaM2(z.pts))],
          ["Power plants", pw.count ? `${pw.count} · ${formatMw(pw.total ?? 0)}` : "None mapped"],
          mix.size ? ["Largest source", [...mix.entries()].sort((a, b) => b[1] - a[1])[0][0]] : null,
          ["Main railways", km(lengthInside(z.pts, rail))],
          ["Major roads", km(lengthInside(z.pts, rds))],
          ["Seaports", String(countInside(z.pts, prt).count)],
          ["Airports", String(countInside(z.pts, aps).count)],
          ["Landmark mines", String(countInside(z.pts, MINES).count)],
        ));
      }), h("p", { class: "fineprint" }, "World datasets (Natural Earth, WRI power plants, Atlas mines): good for regions, too coarse for single streets. For local detail, pair with Built › Overview."));
    } else {
      const routes = p.items.filter((i) => i.kind === "line");
      if (!routes.length) { box.replaceChildren(h("p", { class: "muted small" }, "Draw a proposed route to see its length, terrain and what it crosses.")); return; }
      const [rivers, rail, rds] = await Promise.all([riverLines(), railways(), roads()]);
      const riverShapes = rivers.map((r) => {
        let w = 180, s = 90, e = -180, n = -90;
        for (let i = 0; i < r.pts.length; i += 2) { w = Math.min(w, r.pts[i]); e = Math.max(e, r.pts[i]); s = Math.min(s, r.pts[i + 1]); n = Math.max(n, r.pts[i + 1]); }
        return { xy: r.pts as ArrayLike<number>, bbox: [w, s, e, n] as [number, number, number, number] };
      });
      const parts = await Promise.all(routes.map(async (r) => {
        const len = pathLength(r.pts);
        const zoom = len > 200_000 ? 9 : len > 20_000 ? 11 : 13;
        const samples = along(r.pts, 80);
        const elev = await elevation.sample(samples as [number, number][], zoom).catch(() => null);
        const prof = elev ? profileStats(r.pts, Array.from(elev)) : null;
        return section(r.name,
          stats(
            ["Length", km(len)],
            prof ? ["Elevation", `${Math.round(prof.min)}–${Math.round(prof.max)} m`] : null,
            prof ? ["Total climb", `${Math.round(prof.climb)} m up, ${Math.round(prof.descent)} m down`] : null,
            prof ? ["Steepest stretch", `${prof.steepest.toFixed(1)}%${prof.steepest > 8 ? " (too steep for rail; tough for trucks)" : prof.steepest > 4 ? " (steep for rail)" : ""}`] : null,
            ["Crosses major rivers", String(crossings(r.pts, riverShapes))],
            ["Crosses main railways", String(crossings(r.pts, rail))],
            ["Crosses major highways", String(crossings(r.pts, rds.filter((x) => x.attrs[0] === "M")))],
          ),
          prof ? inlineChart({ x: prof.dist, y: prof.elev }, { xLabel: "Distance", yLabel: "Elevation (m)", xFormat: (v) => km(v), yFormat: (v) => `${Math.round(v)} m` }, 150) : "");
      }));
      box.replaceChildren(...parts, h("p", { class: "fineprint" }, "Terrain from open elevation tiles along the drawn line. Crossings count Natural Earth's major rivers, main railways and highways; smaller streams and roads aren't included."));
    }
  } catch (e) {
    box.replaceChildren(h("p", { class: "error" }, `Couldn't finish the analysis: ${(e as Error).message}`));
  }
}

export type { LonLat };
