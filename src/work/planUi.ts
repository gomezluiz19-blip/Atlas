// Work › Plan: trips, events, business sites, policy zones and infrastructure
// proposals, drawn on the map with the numbers each kind of plan needs.
import { airports, fuelOf, formatMw, nearby, nearestLine, ports, powerPlants, railways, roads } from "../data/infra";
import { elevation } from "../data/elevation";
import { riverLines } from "../data/worldData";
import { MINES } from "../content/minerals";
import { inlineChart, stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { drawOnMap } from "./draw";
import { along, areaM2, crossings, fmtArea, fmtDist, pathLength, type LonLat } from "./geo";
import { WorkLayer } from "./layer";
import { circle, countInside, lengthInside, PLAN_TYPES, profileStats, type Plan, type PlanItem, type PlanType } from "./planModel";
import { ListStore, download, newId } from "./store";
import type { WorkCtx } from "./hub";
import { addFromText, copyJourney, frameJourney, highlight, journeyEditor, journeyFeatures, playJourney, stopPlaying } from "./journey";
import { MODES as JMODES, type Journey, type Mode } from "./journeyModel";

const store = new ListStore<Plan>("atlas.work.plans.v1");
const trips = new ListStore<Journey>("atlas.work.journeys.v1");
let layer: WorkLayer | null = null;
let tripLayer: WorkLayer | null = null;

/** Older trip plans (stops with one way of travelling for all) become step-by-step trips. */
function migrateTrips() {
  for (const p of store.all().filter((x) => x.type === "trip")) {
    const stops = p.items.filter((i) => i.kind === "point");
    const spot = (i: PlanItem) => ({ name: i.name, lon: i.pts[0][0], lat: i.pts[0][1] });
    const mode: Mode = p.mode === "transit" ? "train" : p.mode && p.mode in JMODES ? (p.mode as Mode) : "drive";
    const j: Journey = { id: p.id, name: p.name, start: stops.find((s) => s.date)?.date ?? new Date().toISOString().slice(0, 10), time: "09:00", origin: stops[0] ? spot(stops[0]) : null, created: p.created, notes: p.notes, checklist: p.checklist,
      steps: stops.slice(1).map((s) => ({ id: s.id, kind: "move" as const, mode, to: spot(s), note: s.note })) };
    trips.save(j);
    store.remove(p.id);
  }
}

/** A trip typed anywhere ("fly to Manila, stay 3 nights, train to Baguio"): made, then opened. */
export async function tripFromText(ctx: WorkCtx, text: string) {
  const j: Journey = { id: newId(), name: "New trip", start: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), time: "09:00", origin: null, steps: [], created: Date.now() };
  ctx.show("Trip", () => openPlans(ctx), h("div", { class: "loading" }, h("div", { class: "spinner" }), "Planning it: finding the places…"));
  const { missed } = await addFromText(j, text);
  trips.save(j);
  openTrip(ctx, j.id);
  // Watch it play out: each leg travelled in turn, then the whole trip framed.
  void playJourney(ctx.app, j, () => {});
  if (missed.length) ctx.app.toast(`${missed.join(". ")}. Add it in the trip.`, 6000);
}

export function openTrip(ctx: WorkCtx, id: string) {
  const j = trips.get(id);
  if (!j) return openPlans(ctx);
  tripLayer ??= new WorkLayer(ctx.app, "work:trip-plan", j.name, PLAN_TYPES.trip.color);
  const draw = () => tripLayer!.set(journeyFeatures(j), `Trip · ${j.name}`);
  const again = () => openTrip(ctx, id);
  const editor = journeyEditor({ ctx, journey: j, save: () => { trips.save(j); draw(); }, rerender: again });
  const playBtn = h("button", { class: "pill-btn jr-play", disabled: !j.steps.length, onclick: () => {
    if (playBtn.dataset.on) { stopPlaying(); delete playBtn.dataset.on; playBtn.textContent = "▶ Play the trip"; highlight(editor, -2); return; }
    playBtn.dataset.on = "1"; playBtn.textContent = "■ Stop";
    void playJourney(ctx.app, j, (i) => { highlight(editor, i); if (i === -2) { delete playBtn.dataset.on; playBtn.textContent = "▶ Play the trip"; } });
  } }, "▶ Play the trip");
  j.checklist ??= [];
  const todo = h("input", { class: "pro-url", placeholder: "Add a to-do and press Enter: passport, visa, adapter…", onkeydown: (e: Event) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if ((e as KeyboardEvent).key === "Enter" && v) { j.checklist!.push({ text: v, done: false }); trips.save(j); again(); }
  } });
  ctx.show("Trip", () => { stopPlaying(); openPlans(ctx); },
    h("input", { class: "mp-name", value: j.name, "aria-label": "Trip name", onchange: (e: Event) => { j.name = (e.target as HTMLInputElement).value || j.name; trips.save(j); draw(); } }),
    j.steps.length ? h("div", { class: "jr-actions" }, playBtn,
      h("button", { class: "pill-btn", onclick: () => frameJourney(ctx.app, j) }, "Whole trip"),
      h("button", { class: "pill-btn", onclick: () => void copyJourney(ctx.app, j) }, "Copy itinerary")) : h("p", { class: "muted small" }, "Tell it the trip the way you'd say it. Each step can travel its own way, and stays hold their own stops."),
    editor,
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Packing and to-dos"),
      j.checklist.length ? h("div", { class: "work-checklist" }, ...j.checklist.map((c) =>
        h("label", { class: "work-check" + (c.done ? " done" : "") },
          h("input", { type: "checkbox", checked: c.done, onchange: () => { c.done = !c.done; trips.save(j); again(); } }), h("span", {}, c.text),
          h("button", { class: "link-btn", onclick: (e: Event) => { e.preventDefault(); j.checklist = j.checklist!.filter((x) => x !== c); trips.save(j); again(); } }, "Remove")))) : "",
      todo),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Notes"),
      h("textarea", { class: "mp-notes", rows: 3, placeholder: "Ideas, contacts, budget…", onchange: (e: Event) => { j.notes = (e.target as HTMLTextAreaElement).value; trips.save(j); } }, j.notes ?? "")),
    h("div", { class: "mp-foot" },
      h("span", {}, "Saved in this browser."),
      h("button", { class: "link-btn", onclick: () => download(`${j.name}.json`, JSON.stringify(j, null, 2)) }, "Export"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete ${j.name}?`)) { trips.remove(j.id); tripLayer?.clear(); openPlans(ctx); } } }, "Delete")));
  draw();
}

const km = (m: number) => fmtDist(m);
const letter = (i: number) => String.fromCharCode(65 + (i % 26));

function features(p: Plan, extra: import("./layer").WorkFeature[] = []) {
  const color = PLAN_TYPES[p.type].color;
  const pts = p.items.filter((i) => i.kind === "point");
  return [
    ...(p.type === "trip" && pts.length > 1 ? [{ id: "route", kind: "line" as const, pts: pts.map((s) => s.pts[0]), color, dashed: p.mode === "fly" }] : []),
    ...extra,
    ...(p.type === "event" && p.program?.steps.length ? journeyFeatures(p.program, "Venue").filter((f) => f.id !== "origin") : []),
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
  tripLayer?.clear();
  migrateTrips();
  const types = Object.keys(PLAN_TYPES) as PlanType[];
  ctx.show("Plan", ctx.home,
    h("p", { class: "mp-intro" }, "Plan on the map: pick what kind of plan, then place its stops, sites, zones or routes."),
    h("div", { class: "work-types" }, ...types.map((t) =>
      h("button", { class: "work-type", style: `--c:${PLAN_TYPES[t].color}`, onclick: () => {
        if (t === "trip") {
          const j: Journey = { id: newId(), name: "New trip", start: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), time: "09:00", origin: null, steps: [], created: Date.now() };
          trips.save(j);
          return openTrip(ctx, j.id);
        }
        const p: Plan = { id: newId(), type: t, name: `New ${PLAN_TYPES[t].label.toLowerCase()} plan`, created: Date.now(), items: [], checklist: [] };
        store.save(p);
        openPlan(ctx, p.id);
      } }, h("strong", {}, PLAN_TYPES[t].label), h("span", {}, PLAN_TYPES[t].about)))),
    store.all().length || trips.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Your plans"),
      h("div", { class: "list" }, ...trips.all().map((j) =>
        h("button", { class: "list-row", onclick: () => openTrip(ctx, j.id) },
          h("span", { class: "dot big", style: `background:${PLAN_TYPES.trip.color}` }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, j.name), h("span", { class: "list-sub" }, `Trip · ${j.steps.map((s) => (s.kind === "move" ? JMODES[s.mode].emoji : s.nights ? "🛏️" : "📍")).join(" ") || "no steps yet"}`)),
          h("span", { class: "chev", html: "&rsaquo;" }))), ...store.all().map((p) =>
        h("button", { class: "list-row", onclick: () => openPlan(ctx, p.id) },
          h("span", { class: "dot big", style: `background:${PLAN_TYPES[p.type].color}` }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name), h("span", { class: "list-sub" }, `${PLAN_TYPES[p.type].label} · ${p.items.length} item${p.items.length === 1 ? "" : "s"}`)),
          h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
  );
}

export function openPlan(ctx: WorkCtx, id: string) {
  const p = store.get(id);
  if (!p) return trips.get(id) ? openTrip(ctx, id) : openPlans(ctx);
  const cfg = PLAN_TYPES[p.type];
  layer ??= new WorkLayer(ctx.app, "work:plan", p.name, cfg.color);
  const save = (patch: Partial<Plan> = {}) => { Object.assign(p, patch); store.save(p); };
  const redraw = (extra: import("./layer").WorkFeature[] = []) => layer!.set(features(p, extra), `Plan · ${p.name}`);
  const analysis = h("div", { class: "work-analysis" });
  // Events: the day's programme, starting at the venue.
  let program: HTMLElement | string = "";
  if (p.type === "event") {
    const venue = p.items.find((i) => i.kind === "point");
    const spot = venue ? { name: venue.name, lon: venue.pts[0][0], lat: venue.pts[0][1] } : null;
    const j = (p.program ??= { id: `${p.id}-day`, name: p.name, start: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), time: "18:00", origin: spot, steps: [], created: Date.now() });
    if (spot && (!j.origin || j.origin.name === spot.name || !j.steps.length)) j.origin = spot;
    program = h("section", { class: "group" }, h("h2", { class: "group-title" }, "The day, step by step"),
      h("p", { class: "muted small" }, "“Doors and drinks for an hour, talks for 2 hours, walk to dinner at Manam, dinner for 2 hours.” Each part gets its times; walks and rides between places are timed too."),
      journeyEditor({ ctx, journey: j, short: true, originLabel: "Venue", save: () => { save(); redraw(); }, rerender: () => openPlan(ctx, p.id) }),
      j.steps.length ? h("button", { class: "link-btn", onclick: () => void copyJourney(ctx.app, j, true) }, "Copy the running order") : "");
  }

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
    p.type === "event" ? h("label", { class: "mp-field" }, h("span", {}, "Expected attendees"),
      h("input", { type: "number", min: 0, value: p.attendees ?? "", onchange: (e: Event) => { save({ attendees: parseInt((e.target as HTMLInputElement).value, 10) || undefined }); openPlan(ctx, p.id); } })) : "",
    h("div", { class: "chips wrap" }, ...cfg.add.map((a) => h("button", { class: "chip", onclick: () => void addItem(a.kind, a.name) }, `+ ${a.label}`))),
    p.items.length ? h("div", { class: "list" }, ...p.items.map(itemRow)) : h("p", { class: "muted small" }, "Nothing placed yet."),
    program,
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
    if (p.type === "event") {
      const venue = pts[0];
      if (!venue) { box.replaceChildren(h("p", { class: "muted small" }, "Place the venue to see how far people can come from.")); return; }
      const v = venue.pts[0];
      // Reach rings for the way people will come, at typical door-to-door speeds in town.
      const REACH = { walk: { label: "On foot", emoji: "🚶", kmh: 4.8, color: "#8e8e93" }, bike: { label: "By bike", emoji: "🚲", kmh: 14, color: "#34c759" }, transit: { label: "Bus or train", emoji: "🚌", kmh: 18, color: "#ff9f0a" }, drive: { label: "By car", emoji: "🚗", kmh: 30, color: PLAN_TYPES.event.color } } as const;
      const how = (p.mode && p.mode in REACH ? p.mode : "drive") as keyof typeof REACH;
      const rm = REACH[how];
      const rings = [15, 30, 60].map((min) => ({ min, r: (rm.kmh * 1000 * min) / 60 / 1.3 }));
      redraw(rings.map((x, i) => ({ id: `ring${i}`, kind: "area" as const, pts: circle(v, x.r), color: rm.color, fill: 0.06 * (3 - i), dashed: true })));
      const pickHow = h("div", { class: "chips wrap" }, ...(Object.keys(REACH) as (keyof typeof REACH)[]).map((k) =>
        h("button", { class: `chip${k === how ? " on" : ""}`, "aria-pressed": String(k === how), onclick: () => { p.mode = k; store.save(p); void analyse(p, box, redraw); } }, `${REACH[k].emoji} ${REACH[k].label}`)));
      const [aps, prt, rail] = await Promise.all([airports(), ports(), railways()]);
      const ap = nearby(aps, v[0], v[1], 2000, 1)[0], rl = nearestLine(rail, v[0], v[1], 200);
      const parking = p.attendees ? Math.ceil(p.attendees / 2.5) : 0;
      box.replaceChildren(section("Reach and access",
        h("p", { class: "muted small" }, "How will people come? The dashed rings show roughly 15, 30 and 60 minutes that way."),
        pickHow,
        h("p", { class: "muted small" }, `${rm.emoji} 15 min ≈ ${km(rings[0].r)}, 30 min ≈ ${km(rings[1].r)}, an hour ≈ ${km(rings[2].r)} in a straight line. Real travel depends on streets, stops and traffic.`),
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
