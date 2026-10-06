// Social work on the map (see model.ts): "Find support" for anyone, and Social Work Pro for the people who
// give it. Both ask a few plain questions first, then show the same Earth: what's around a place, how far.
import type { App } from "../../app";
import { overpass } from "../../data/overpass";
import { estimateMinutes, fmtMin } from "../../travel/reach";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { empty, field, frame, kpis, list, OpsMap, row, title } from "../kit/ui";
import {
  areaOf, checkInText, due, FOCI, gaps, HELP_WAYS, helpLines, needOf, NEEDS, needsFor, needsQuery, nearestFirst, newPractice, planDay, referralSheet,
  referralsFor, safeLabel, toResources, visits, WORK_MODES, type Client, type Contact, type Focus, type HelpWay, type Named, type NeedId, type Practice,
  type Priority, type Resource, type Spot, type WorkMode,
} from "./model";

const KEY = "atlas.pro.social.v1";
let map: OpsMap | null = null;
const opsMap = (app: App) => (map ??= new OpsMap(app, "social", "#b8496a"));

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const kmText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
const chip = (label: string, on: boolean, toggle: () => void) => h("button", { class: "chip sw-chip" + (on ? " on" : ""), "aria-pressed": String(on), onclick: toggle }, label);

/** Places around a point that meet some needs (OpenStreetMap). */
async function around(c: Spot, km: number, needs: NeedId[]): Promise<Resource[]> {
  return toResources(await overpass(needsQuery(c, km * 1000, needs)));
}

/** Where you are, asking the browser. */
const whereIAm = () => new Promise<Named>((ok, no) => navigator.geolocation.getCurrentPosition((p) => ok({ lon: p.coords.longitude, lat: p.coords.latitude, name: "where you are" }), no, { timeout: 9000, maximumAge: 120_000 }));

/** Choose a place: where you are, the chosen place, your places, a tap on the map, or an address. */
function placePicker(ctx: WorkCtx, app: App, go: (p: Named) => void, prompt = "Or type an address or town"): HTMLElement {
  const mine = (() => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as Named[]).slice(0, 3); } catch { return []; } })();
  const box = h("input", { class: "pro-url", placeholder: prompt }) as HTMLInputElement;
  const find = async () => {
    const q = box.value.trim(); if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (r) go({ lon: r.lon, lat: r.lat, name: r.name }); else app.toast("Couldn't find that place. Try adding the town.", 4000);
  };
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") void find(); });
  return h("div", { class: "sw-picker" },
    h("div", { class: "row-btns" },
      h("button", { class: "chip", onclick: () => whereIAm().then(go).catch(() => app.toast("Couldn't get your location. Allow it in the browser, or type an address.", 5000)) }, "Where I am"),
      app.place ? h("button", { class: "chip", onclick: () => go({ lon: app.place!.lon, lat: app.place!.lat, name: app.place!.name?.title ?? "the chosen place" }) }, app.place.name?.title ?? "The chosen place") : "",
      ...mine.map((p) => h("button", { class: "chip", onclick: () => go(p) }, p.name)),
      h("button", { class: "chip", onclick: () => { ctx.hide(); app.pickOnce("Tap the place", (p) => { ctx.unhide(); go({ lon: p.lon, lat: p.lat, name: "the spot you tapped" }); }, () => ctx.unhide()); } }, "Tap the map")),
    h("div", { class: "po-add" }, box, h("button", { class: "pill-btn", onclick: () => void find() }, "Go")));
}

/** The lines to call, the urgent ones marked. */
const linesBlock = (p: Spot, all = true) => {
  const ls = helpLines(p).filter((l) => all || l.urgent);
  return h("div", { class: "sw-lines" }, ...ls.map((l) => h("a", { class: "sw-line" + (l.urgent ? " urgent" : ""), href: l.href, target: l.href.startsWith("http") ? "_blank" : "_self", rel: "noopener" },
    h("strong", {}, l.label), h("small", {}, l.how))));
};

// Unlabelled: a cluster of names over a neighbourhood is unreadable; the list says what each is.
const pinsOf = (rs: Resource[]): WorkFeature[] => rs.map((r) => ({ id: r.id, kind: "point", pts: [[r.lon, r.lat]], color: needOf(r.need).color }));
// The area served, as a crisp outline (a filled area this size smears into the map tiles).
const ring = (c: Spot, km: number): WorkFeature => ({ id: "area", kind: "line", color: "#b8496a", solid: true,
  pts: Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [c.lon + (Math.cos(a) * km) / (111.32 * Math.cos((c.lat * Math.PI) / 180)), c.lat + (Math.sin(a) * km) / 110.57] as [number, number]; }) });

// ---- Find support: for anyone --------------------------------------------------------------------------

const ASK: NeedId[] = ["food", "shelter", "mental", "health", "family", "older", "benefits"];
const ALSO: NeedId[] = ["school", "library", "community", "parks"];

export function openFindSupport(ctx: WorkCtx, app: App) {
  const want = new Set<NeedId>(), also = new Set<NeedId>(["school", "parks"]);
  let way: HelpWay = "in-person";
  const asks = h("div", { class: "row-btns sw-asks" }), alsoRow = h("div", { class: "row-btns" }), ways = h("div", { class: "sw-ways" });
  const draw = () => {
    asks.replaceChildren(...ASK.map((id) => chip(needOf(id).ask, want.has(id), () => { want.has(id) ? want.delete(id) : want.add(id); draw(); })));
    alsoRow.replaceChildren(...ALSO.map((id) => chip(needOf(id).label, also.has(id), () => { also.has(id) ? also.delete(id) : also.add(id); draw(); })));
    ways.replaceChildren(...HELP_WAYS.map((w) => h("button", { class: "sw-way" + (w.id === way ? " on" : ""), "aria-pressed": String(w.id === way), onclick: () => { way = w.id; draw(); } }, h("strong", {}, w.label), h("small", {}, w.hint))));
  };
  draw();
  ctx.show("Find support", ctx.home,
    h("p", { class: "sc-lede" }, "Help near you, and the places that go with it: schools, parks, libraries and public programmes. Nothing you choose here is saved or sent."),
    title("What do you need?"), asks, h("p", { class: "muted small" }, "Leave it blank to see everything."),
    title("How would you like help?"), ways,
    title("Also show"), alsoRow,
    title("Where?"), placePicker(ctx, app, (p) => void results(ctx, app, p, [...want], [...also], way)));
}

async function results(ctx: WorkCtx, app: App, p: Named, want: NeedId[], also: NeedId[], way: HelpWay, km = 5) {
  const asked = want.length ? want : ASK;
  const status = h("p", { class: "muted small" }, `Looking within ${km} km of ${p.name}…`);
  const body = h("div", {});
  const again = () => openFindSupport(ctx, app);
  ctx.show("Find support", again, status, body);
  void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: km * 900 });
  // Online or at home: the lines lead, before anything to travel to.
  if (way !== "in-person") body.append(title(way === "online" ? "Reach help from anywhere" : "Help that comes to you"), linesBlock(p),
    way === "at-home" ? h("p", { class: "muted small" }, "Home visits, meals and care at home are usually arranged through the offices below or by calling 211 where it exists.") : "");
  try {
    const shown = new Set<NeedId>([...asked, ...also]);
    const rs = nearestFirst((await around(p, km, [...shown])).filter((r) => shown.has(r.need)), p, asked);
    status.textContent = "";
    opsMap(app).draw("Support near you", [{ id: "here", kind: "point", pts: [[p.lon, p.lat]], color: "#ffffff", label: p.name }, ...pinsOf(rs)]);
    const counts = asked.map((id) => ({ id, n: rs.filter((r) => r.need === id).length, near: rs.find((r) => r.need === id) }));
    body.append(
      title(`Within ${km} km`),
      h("div", { class: "sw-counts" }, ...counts.map(({ id, n, near }) => h("div", { class: "sw-count", style: `--c:${needOf(id).color}` },
        h("strong", {}, String(n)), h("span", {}, needOf(id).label), h("small", {}, near ? `nearest ${kmText(near.km)}` : "none mapped")))),
      rs.length ? list(...rs.slice(0, 30).map((r) => row({ color: needOf(r.need).color }, r.name,
        [needOf(r.need).label, kmText(r.km), r.km <= 3 ? `${fmtMin(estimateMinutes(p, r, "walk"))} walk` : `${fmtMin(estimateMinutes(p, r, "drive"))} drive`, r.hours ? "hours listed" : ""].filter(Boolean).join(" · "),
        () => detail(ctx, app, r, () => void results(ctx, app, p, want, also, way, km))))) : empty("Nothing like that is mapped this close."),
      counts.some((c) => !c.n) && km < 25 ? h("button", { class: "pill-btn", onclick: () => void results(ctx, app, p, want, also, way, km * 3) }, `Look further (${km * 3} km)`) : "",
      way === "in-person" ? h("div", {}, title("If it can't wait"), linesBlock(p, false), h("details", { class: "about-data" }, h("summary", {}, "More lines to call"), linesBlock(p))) : "",
      h("p", { class: "fineprint" }, "From OpenStreetMap, mapped by volunteers: a service may be missing or have moved. Call before you go."));
  } catch {
    status.textContent = "Couldn't reach OpenStreetMap just now. The lines below work any time.";
    if (way === "in-person") body.append(linesBlock(p));
  }
}

/** One place: what it offers, how to reach it, and its hours and contacts. */
function detail(ctx: WorkCtx, app: App, r: Resource, back: () => void, extra?: HTMLElement) {
  void flyToPlace(app.globe, { name: r.name, lon: r.lon, lat: r.lat, radius: 500 });
  const rows: [string, string, string?][] = [
    ["What", needOf(r.need).label], ...(r.address ? [["Address", r.address] as [string, string]] : []),
    ...(r.hours ? [["Hours", r.hours] as [string, string]] : []),
    ...(r.phone ? [["Phone", r.phone, `tel:${r.phone.replace(/[^\d+]/g, "")}`] as [string, string, string]] : []),
    ...(r.website ? [["Website", r.website.replace(/^https?:\/\/(www\.)?/, ""), r.website] as [string, string, string]] : []),
  ];
  ctx.show(r.name, back,
    h("dl", { class: "vn-details" }, ...rows.flatMap(([k, v, href]) => [h("dt", {}, k), h("dd", {}, href ? h("a", { href, target: href.startsWith("tel:") ? "_self" : "_blank", rel: "noopener" }, v) : v)])),
    h("div", { class: "row-btns" },
      h("button", { class: "pill-btn primary", onclick: () => { app.select({ lon: r.lon, lat: r.lat, height: 0 }, { title: r.name, context: r.address ?? needOf(r.need).label }); ctx.close(); } }, "Open its card"),
      matchMedia("(pointer: coarse)").matches ? h("button", { class: "pill-btn", onclick: () => { app.select({ lon: r.lon, lat: r.lat, height: 0 }, { title: r.name, context: r.address ?? "" }); app.actions.get("wayfind:guide")?.run(); } }, "Guide me there") : ""),
    extra ?? "");
}

// ---- Social Work Pro: the worksite -----------------------------------------------------------------------

const load = (): Practice[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const store = (ps: Practice[]) => { try { localStorage.setItem(KEY, JSON.stringify(ps)); } catch { /* storage full: the kit warns */ } };
const saveOne = (p: Practice) => store([p, ...load().filter((x) => x.id !== p.id)]);

export function openSocialPro(ctx: WorkCtx, app: App) {
  const p = load()[0];
  if (p) practiceHome(ctx, app, p); else setup(ctx, app);
}

/** The first questions: how you work, with whom, from where, and how far. */
function setup(ctx: WorkCtx, app: App, was?: Practice) {
  let mode: WorkMode = was?.mode ?? "mix", areaKm = was?.areaKm ?? 15, base: Named | undefined = was?.base;
  const focus = new Set<Focus>(was?.focus ?? []);
  const name = h("input", { class: "pro-url", placeholder: "Practice, team or agency (optional)", value: was?.name ?? "" }) as HTMLInputElement;
  const modes = h("div", { class: "sw-ways" }), foci = h("div", { class: "row-btns" }), baseLine = h("p", { class: "muted small" }), areaRow = h("div", { class: "row-btns" });
  const draw = () => {
    modes.replaceChildren(...WORK_MODES.map((m) => h("button", { class: "sw-way" + (m.id === mode ? " on" : ""), "aria-pressed": String(m.id === mode), onclick: () => { mode = m.id; draw(); } }, h("strong", {}, m.label), h("small", {}, m.hint))));
    foci.replaceChildren(...FOCI.map((f) => chip(f.label, focus.has(f.id), () => { focus.has(f.id) ? focus.delete(f.id) : focus.add(f.id); draw(); })));
    baseLine.textContent = base ? `Base: ${base.name}` : mode === "tele" ? "Optional: where you're licensed or the area you cover, for referrals." : "Your office, clinic or school, or where your day starts.";
    areaRow.replaceChildren(...[5, 10, 15, 25, 50].map((k) => chip(`${k} km`, k === areaKm, () => { areaKm = k; draw(); })));
    areaRow.hidden = !visits(mode);
  };
  draw();
  ctx.show(was ? "Your worksite" : "Set up your worksite", was ? () => practiceHome(ctx, app, was) : ctx.home,
    h("p", { class: "sc-lede" }, "Four questions, then your worksite: your caseload on the map, visit days planned and timed, a referral list, and the gaps. Everything stays on this device."),
    title("How do you see people?"), modes,
    title("Who do you work with?"), foci,
    title("Where are you based?"), baseLine, placePicker(ctx, app, (b) => { base = b; draw(); }, "Address of your office or clinic"),
    title("How far do you travel?"), areaRow,
    title("Name"), name,
    h("button", { class: "primary-btn sw-go", onclick: () => {
      if (mode !== "tele" && !base) { app.toast("Add your base first: your office, clinic, or where your day starts.", 4500); return; }
      const fresh = newPractice({ name: name.value, mode, focus: [...focus], base, areaKm });
      const p: Practice = was ? { ...was, name: fresh.name, mode, focus: [...focus], base, areaKm } : fresh;
      saveOne(p); practiceHome(ctx, app, p);
    } }, was ? "Save" : "Set up my worksite"));
}

/** The worksite: who's due, the caseload, the area's resources and the gaps. */
function practiceHome(ctx: WorkCtx, app: App, p: Practice, resources?: Resource[]) {
  const save = () => saveOne(p);
  const home = () => practiceHome(ctx, app, p, resources);
  const week = addDays(today(), 7);
  const dueSoon = due(p.clients, week), urgent = p.clients.filter((c) => c.priority === "urgent").length;
  const gapRows = resources ? gaps(p.clients, resources, visits(p.mode) ? 5 : 3).filter((g) => g.far) : [];
  const drawMap = () => {
    const f: WorkFeature[] = [];
    if (p.base) { f.push({ id: "base", kind: "point", pts: [[p.base.lon, p.base.lat]], color: "#ffffff", label: p.base.name }); if (visits(p.mode)) f.push(ring(p.base, p.areaKm)); }
    for (const c of p.clients) f.push({ id: c.id, kind: "point", pts: [[c.lon, c.lat]], color: c.priority === "urgent" ? "#c4513a" : c.priority === "soon" ? "#d19a2e" : "#4c9ac9", label: c.label });
    opsMap(app).draw(p.name, [...f, ...pinsOf(resources ?? [])]);
  };
  drawMap();
  if (p.base) frame(app, p.name, [p.base, ...p.clients], visits(p.mode) ? p.areaKm * 1150 : 2500);
  const mode = WORK_MODES.find((m) => m.id === p.mode)!;
  ctx.show(p.name, ctx.home,
    h("p", { class: "sc-lede" }, `${mode.label}${p.base ? ` · from ${p.base.name}` : ""}${visits(p.mode) ? ` · ${p.areaKm} km` : ""}${p.focus.length ? ` · ${p.focus.map((f) => FOCI.find((x) => x.id === f)!.label).join(", ")}` : ""}`),
    kpis([String(p.clients.length), "on your caseload"], [String(dueSoon.length), "due this week", dueSoon.length > 0], [String(urgent), "urgent", urgent > 0],
      [resources ? String(gapRows.reduce((n, g) => n + g.far, 0)) : "–", "far from what they need", gapRows.length > 0]),
    visits(p.mode) && p.base ? h("button", { class: "primary-btn sw-go", onclick: () => dayPlanner(ctx, app, p, home) }, "Plan a visit day") : "",
    title("Caseload"),
    p.clients.length ? list(...[...p.clients].sort((a, b) => (a.next ?? "9") < (b.next ?? "9") ? -1 : 1).map((c) => row({ color: c.priority === "urgent" ? "#c4513a" : c.priority === "soon" ? "#d19a2e" : "#4c9ac9" }, c.label,
      [c.area, c.contact === "home" ? "home visits" : c.contact === "office" ? "at the office" : "telehealth", c.next ? `next ${c.next}` : ""].filter(Boolean).join(" · "), () => clientScreen(ctx, app, p, c, resources, home))))
      : empty("No one yet. Add people with initials or a case code: never a full name."),
    h("button", { class: "pill-btn", onclick: () => clientScreen(ctx, app, p, null, resources, home) }, "Add someone"),
    title("Around your worksite"),
    resources ? h("div", {},
      h("div", { class: "sw-counts" }, ...needsFor(p.focus).map((id) => { const n = resources.filter((r) => r.need === id).length; return h("div", { class: "sw-count", style: `--c:${needOf(id).color}` }, h("strong", {}, String(n)), h("span", {}, needOf(id).label)); })),
      gapRows.length ? h("div", {}, title("Gaps"), list(...gapRows.map((g) => row({ color: needOf(g.need).color }, `${g.far} of ${g.of} far from ${needOf(g.need).label.toLowerCase()}`, `More than ${visits(p.mode) ? 5 : 3} km from the nearest one mapped`)))) : "",
      title(`Referral list · ${p.referrals.length}`),
      p.referrals.length ? list(...p.referrals.map((r) => row({ color: needOf(r.need).color }, r.name, needOf(r.need).label, () => detail(ctx, app, r, home, h("button", { class: "pill-btn", onclick: () => { p.referrals = p.referrals.filter((x) => x.id !== r.id); save(); home(); } }, "Remove from the referral list")))))
        : empty("Save places from the list below to refer people to."),
      title("Nearby"),
      list(...nearestFirst(resources, p.base ?? resources[0]).slice(0, 25).map((r) => row({ color: needOf(r.need).color }, r.name, `${needOf(r.need).label} · ${kmText(r.km)}`,
        () => detail(ctx, app, r, home, p.referrals.some((x) => x.id === r.id) ? empty("On your referral list.") : h("button", { class: "pill-btn primary", onclick: () => { p.referrals.push(r); save(); app.toast(`${r.name} added to your referral list`, 2500); home(); } }, "Add to my referral list"))))))
      : h("button", { class: "pill-btn", onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement, c = p.base ?? p.clients[0];
        if (!c) { app.toast("Add your base or someone on your caseload first.", 4000); return; }
        b.disabled = true; b.textContent = "Looking around…";
        try { practiceHome(ctx, app, p, await around(c, Math.min(visits(p.mode) ? p.areaKm : 5, 20), needsFor(p.focus))); }
        catch { b.disabled = false; b.textContent = "Couldn't reach OpenStreetMap. Try again"; }
      } }, "Find food banks, shelters, clinics and more around you"),
    title("Your worksite"),
    h("div", { class: "row-btns" },
      h("button", { class: "pill-btn", onclick: () => setup(ctx, app, p) }, "Change how you work"),
      h("button", { class: "pill-btn", onclick: () => { if (confirm(`Delete ${p.name} and its caseload from this device?`)) { store(load().filter((x) => x.id !== p.id)); opsMap(app).clear(); setup(ctx, app); } } }, "Delete")),
    h("p", { class: "fineprint" }, "Your caseload stays in this browser. Use initials or case codes; areas, not addresses, appear in anything you share."));
}

const PRIORITY: [Priority, string][] = [["routine", "Routine"], ["soon", "Soon"], ["urgent", "Urgent"]];
const CONTACT: [Contact, string][] = [["home", "Home visits"], ["office", "At the office"], ["tele", "Telehealth"]];

/** Add or edit someone on the caseload: a label, roughly where, how you meet, what they need, when next. */
function clientScreen(ctx: WorkCtx, app: App, p: Practice, c: Client | null, resources: Resource[] | undefined, back: () => void) {
  const d: Client = c ? { ...c, needs: [...c.needs] } : { id: `c${Date.now().toString(36)}`, label: "", area: "", lon: NaN, lat: NaN, contact: p.mode === "tele" ? "tele" : p.mode === "site" ? "office" : "home", priority: "routine", needs: [], next: addDays(today(), 7), minutes: 45 };
  const label = h("input", { class: "pro-url", placeholder: "Initials or case code", value: d.label }) as HTMLInputElement;
  const where = h("input", { class: "pro-url", placeholder: d.area ? `${d.area} (set)` : "Their address or neighbourhood" }) as HTMLInputElement;
  const whereNote = h("p", { class: "muted small" }, Number.isFinite(d.lon) ? `Mapped in ${d.area}.` : "The address stays on this device; only the area shows.");
  const needs = h("div", { class: "row-btns" });
  const drawNeeds = () => needs.replaceChildren(...NEEDS.filter((n) => !["parks", "library"].includes(n.id)).map((n) => chip(n.label, d.needs.includes(n.id), () => { d.needs = d.needs.includes(n.id) ? d.needs.filter((x) => x !== n.id) : [...d.needs, n.id]; drawNeeds(); })));
  drawNeeds();
  const sel = <T extends string>(v: T, opts: [T, string][], set: (x: T) => void) => h("select", { class: "pro-url", onchange: (e: Event) => set((e.target as HTMLSelectElement).value as T) }, ...opts.map(([k, l]) => h("option", { value: k, selected: k === v }, l)));
  const next = h("input", { class: "pro-url", type: "date", value: d.next ?? "" }) as HTMLInputElement;
  const mins = h("input", { class: "pro-url", type: "number", min: "10", step: "5", value: String(d.minutes) }) as HTMLInputElement;
  const sheet = h("div", {});
  if (c && Number.isFinite(c.lon)) {
    const refs = referralsFor(c, p.referrals, resources ?? []);
    const text = referralSheet(c, refs, p.name);
    sheet.append(title("Referrals"), h("pre", { class: "sw-sheet" }, text),
      h("div", { class: "row-btns" },
        h("button", { class: "pill-btn", onclick: () => void navigator.clipboard?.writeText(text).then(() => app.toast("Copied", 2000)).catch(() => app.toast("Couldn't copy here.", 3000)) }, "Copy"),
        h("button", { class: "pill-btn", onclick: () => { const w = window.open("", "_blank"); if (w) { w.document.title = `Referrals · ${c.label}`; const pre = w.document.createElement("pre"); pre.style.cssText = "font:14px/1.5 system-ui;white-space:pre-wrap;padding:24px"; pre.textContent = text; w.document.body.append(pre); w.print(); } } }, "Print")),
      resources ? "" : empty("Load what's around your worksite to fill in the nearest places."));
  }
  ctx.show(c ? c.label : "Add someone", back,
    field("Label", label), h("p", { class: "muted small" }, "Full names are cut to initials."),
    field("Where", where), whereNote,
    field("How you meet", sel(d.contact, CONTACT, (v) => (d.contact = v))),
    field("Priority", sel(d.priority, PRIORITY, (v) => (d.priority = v))),
    title("What they need"), needs,
    field("Next contact", next), field("Minutes a visit takes", mins),
    h("div", { class: "row-btns" },
      h("button", { class: "primary-btn", onclick: async () => {
        d.label = safeLabel(label.value);
        if (!d.label) { app.toast("Give them initials or a case code.", 3500); return; }
        const q = where.value.trim();
        if (q) {
          const [r] = await geocode(q, p.base ?? null).catch(() => []);
          if (!r) { app.toast("Couldn't find that address. Try adding the town.", 4000); return; }
          // Keep the area (the neighbourhood or town), not the street address.
          d.lon = r.lon; d.lat = r.lat; d.area = areaOf(r.name, r.detail);
        }
        if (!Number.isFinite(d.lon)) { app.toast("Add where they are (an address or neighbourhood).", 4000); return; }
        d.next = next.value || undefined; d.minutes = Math.max(10, Number(mins.value) || 45);
        p.clients = c ? p.clients.map((x) => (x.id === c.id ? d : x)) : [...p.clients, d];
        saveOne(p); back();
      } }, c ? "Save" : "Add"),
      c ? h("button", { class: "pill-btn", onclick: () => { if (confirm(`Remove ${c.label} from your caseload?`)) { p.clients = p.clients.filter((x) => x.id !== c.id); saveOne(p); back(); } } }, "Remove") : ""),
    sheet);
}

/** A visit day: who to see, in what order, when you'll arrive and be back, and a check-in to send. */
function dayPlanner(ctx: WorkCtx, app: App, p: Practice, back: () => void, date = addDays(today(), 0), start = "09:00", picked?: Set<string>) {
  const home = p.clients.filter((c) => c.contact === "home");
  const chosen = picked ?? new Set(due(home, date).map((c) => c.id));
  if (!picked && !chosen.size) home.slice(0, 4).forEach((c) => chosen.add(c.id));
  const plan = planDay(p.base!, home.filter((c) => chosen.has(c.id)), start);
  const dateIn = h("input", { class: "pro-url", type: "date", value: date, onchange: (e: Event) => dayPlanner(ctx, app, p, back, (e.target as HTMLInputElement).value, start) });
  const startIn = h("input", { class: "pro-url", type: "time", value: start, onchange: (e: Event) => dayPlanner(ctx, app, p, back, date, (e.target as HTMLInputElement).value || "09:00", chosen) });
  const path: [number, number][] = [[p.base!.lon, p.base!.lat], ...plan.stops.map((s) => [s.client.lon, s.client.lat] as [number, number]), [p.base!.lon, p.base!.lat]];
  opsMap(app).draw(`${p.name} · visits`, [
    { id: "base", kind: "point", pts: [path[0]], color: "#ffffff", label: p.base!.name },
    ...(plan.stops.length ? [{ id: "route", kind: "line", pts: path, color: "#b8496a", solid: true } as WorkFeature] : []),
    ...plan.stops.map((s, i): WorkFeature => ({ id: s.client.id, kind: "point", pts: [[s.client.lon, s.client.lat]], color: s.client.priority === "urgent" ? "#c4513a" : "#4c9ac9", label: `${i + 1} · ${s.client.label} · ${s.arrive}` })),
  ]);
  if (plan.stops.length) frame(app, "Visit day", path.map(([lon, lat]) => ({ lon, lat })), 2500);
  const text = checkInText(plan, p.name, date);
  ctx.show("Visit day", back,
    h("div", { class: "sw-day-head" }, field("Day", dateIn), field("Leave at", startIn)),
    home.length ? h("div", { class: "row-btns" }, ...home.map((c) => chip(`${c.label}${c.priority === "urgent" ? " · urgent" : ""}`, chosen.has(c.id), () => { chosen.has(c.id) ? chosen.delete(c.id) : chosen.add(c.id); dayPlanner(ctx, app, p, back, date, start, chosen); })))
      : empty("No one on your caseload is seen at home yet."),
    plan.stops.length ? h("div", {},
      kpis([String(plan.stops.length), "visits"], [fmtMin(plan.driveMin), "driving"], [`${plan.km} km`, "in all"], [plan.back, "back at base"]),
      list(...plan.stops.map((s, i) => row({ color: s.client.priority === "urgent" ? "#c4513a" : "#4c9ac9" }, `${i + 1}. ${s.client.label} · ${s.arrive}–${s.leave}`, `${s.client.area} · ${s.driveMin} min drive`, undefined, h("span", {})))),
      title("Check-in"),
      h("pre", { class: "sw-sheet" }, text),
      h("div", { class: "row-btns" },
        h("button", { class: "pill-btn primary", onclick: () => { const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }; if (nav.share) void nav.share({ text }).catch(() => {}); else void navigator.clipboard?.writeText(text).then(() => app.toast("Copied: send it to whoever checks on you", 3000)); } }, "Send to my check-in contact"),
        h("button", { class: "pill-btn", onclick: () => void navigator.clipboard?.writeText(text).then(() => app.toast("Copied", 2000)) }, "Copy")),
      h("p", { class: "fineprint" }, "Times use typical driving speeds; allow for traffic and parking. The check-in shows areas and times, never names or addresses.")) : "");
}
