// The journey editor: a trip as a story of steps ("Fly to Manila", "Taxi to the
// Peninsula", "3 nights at the Peninsula", "Train to Baguio"), each with its own
// way of getting there, stays holding their own stops, typed in plain words.
// Used by Plan › Trip and Teach › Field trips.
import type { App } from "../app";
import { copyText } from "../app";
import { forecast } from "../data/openmeteo";
import { h } from "../ui/dom";
import { flyToPlace, geocode, type SearchResult } from "../ui/search";
import { fmtDist, fmtHours, metres, type LonLat } from "./geo";
import type { WorkCtx } from "./hub";
import type { WorkFeature } from "./layer";
import {
  autoName, dateOf, guessMode, MODE_IDS, MODES, parseSteps, timeline, timeOf, whereAfter,
  type Draft, type Journey, type Mode, type MoveRow, type Spot, type StayRow, type StayStep, type Step,
} from "./journeyModel";
import { newId } from "./store";
import { iconFor, labelled } from "../ui/glyph";
import { animateLeg } from "./tripPlay";

export interface JourneyHost {
  ctx: WorkCtx;
  journey: Journey;
  /** Saves the journey and draws it again. */
  save(): void;
  /** Rebuilds the whole screen. */
  rerender(): void;
  /** Short outings (field trips): stays in hours, ground travel only. */
  short?: boolean;
  /** What the start is called ("Home", "School", "Venue"). */
  originLabel?: string;
}

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, opts);
const when = (min: number) => `${dayFmt(dateOf(min))}, ${timeOf(min)}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Names given automatically (so they keep updating until someone types their own). */
const autoNamed = new Map<string, string>();

/** Which step is open for editing, and where new steps go (kept across re-renders). */
const ui = { open: "" as string, insertAt: -1, journey: "" };

// ---- The map ------------------------------------------------------------------------------------

/** A great-circle arc, split where it crosses the date line so it never wraps round the world. */
export function arc(a: LonLat, b: LonLat, n = 48): LonLat[][] {
  const rad = Math.PI / 180, toV = ([lon, lat]: LonLat) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const A = toV(a), B = toV(b);
  const d = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (d < 1e-6) return [[a, b]];
  const pts: LonLat[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    pts.push([Math.atan2(y, x) / rad, Math.atan2(z, Math.hypot(x, y)) / rad]);
  }
  const parts: LonLat[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (Math.abs(q[0] - p[0]) > 180) {
      const edge = p[0] > 0 ? 180 : -180, q2 = q[0] + (p[0] > 0 ? 360 : -360), f = (edge - p[0]) / (q2 - p[0]), lat = p[1] + (q[1] - p[1]) * f;
      parts[parts.length - 1].push([edge, lat]);
      parts.push([[-edge, lat]]);
    }
    parts[parts.length - 1].push(q);
  }
  return parts;
}

const ORIGIN_EMOJI: Record<string, string> = { School: "🏫", Venue: "🎪", Home: "🏠" };
const originEmoji = (label = "Home") => ORIGIN_EMOJI[label] ?? "🏠";

export function journeyFeatures(j: Journey, originLabel = "Home"): WorkFeature[] {
  const t = timeline(j), out: WorkFeature[] = [];
  const pt = (s: Spot): LonLat => [s.lon, s.lat];
  for (const r of t.rows) {
    if (r.step.kind !== "move" || !("from" in r) || !r.from) continue;
    const m = MODES[r.step.mode];
    const lines = r.step.mode === "fly" || r.km > 300 ? arc(pt(r.from), pt(r.step.to)) : [[pt(r.from), pt(r.step.to)]];
    lines.forEach((pts, i) => out.push({ id: `${r.step.id}-${i}`, kind: "line", pts, color: m.color, dashed: r.step.mode === "fly" || r.step.mode === "ferry" }));
  }
  if (j.origin) out.push({ id: "origin", kind: "point", pts: [pt(j.origin)], color: "#8e8e93", label: `${originEmoji(originLabel)} ${j.origin.name}` });
  for (const s of j.steps) {
    if (s.kind === "stay") {
      out.push({ id: s.id, kind: "point", pts: [pt(s.place)], color: "#ff375f", label: `${s.nights ? "🛏️" : "📍"} ${s.place.name}` });
      for (const v of s.visits) if (v.spot) out.push({ id: v.id, kind: "point", pts: [pt(v.spot)], color: "#ff9f0a", label: v.name });
    } else if (!j.steps.some((x) => x.kind === "stay" && Math.abs(x.place.lon - s.to.lon) < 1e-4 && Math.abs(x.place.lat - s.to.lat) < 1e-4)) {
      out.push({ id: s.id, kind: "point", pts: [pt(s.to)], color: MODES[s.mode].color, label: s.to.name });
    }
  }
  return out;
}

/** Halfway along the great circle. */
export function midpoint(a: LonLat, b: LonLat): LonLat {
  const rad = Math.PI / 180;
  const v = ([lon, lat]: LonLat) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const A = v(a), B = v(b), x = A[0] + B[0], y = A[1] + B[1], z = A[2] + B[2];
  if (Math.hypot(x, y, z) < 1e-9) return a;
  return [Math.atan2(y, x) / rad, Math.atan2(z, Math.hypot(x, y)) / rad];
}

/** Frames two places (or one) on the map; resolves when the camera has had time to get there. */
function frame(app: App, a: Spot, b?: Spot, name = a.name): Promise<void> {
  if (!b) { void flyToPlace(app.globe, { name, lon: a.lon, lat: a.lat, radius: 2500 }); return new Promise((r) => setTimeout(r, 2300)); }
  const mid = midpoint([a.lon, a.lat], [b.lon, b.lat]);
  const d = metres([a.lon, a.lat], [b.lon, b.lat]);
  void flyToPlace(app.globe, { name, lon: mid[0], lat: mid[1], radius: Math.max(1500, Math.min(7_000_000, d * 0.6)) });
  return new Promise((r) => setTimeout(r, 2300));
}

export function frameJourney(app: App, j: Journey) {
  const pts = [j.origin, ...j.steps.map((s) => (s.kind === "move" ? s.to : s.place))].filter(Boolean) as Spot[];
  if (!pts.length) return;
  let w = 180, e = -180, s = 90, n = -90;
  for (const p of pts) { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  // Trips that cross the Pacific: frame the short way round.
  let lon = (w + e) / 2, span = e - w;
  if (span > 180) { const shifted = pts.map((p) => (p.lon < 0 ? p.lon + 360 : p.lon)); const w2 = Math.min(...shifted), e2 = Math.max(...shifted); lon = ((w2 + e2) / 2 + 540) % 360 - 180; span = e2 - w2; }
  const radius = Math.max(1500, Math.min(7_000_000, Math.hypot(span * 111_000 * Math.cos(((s + n) / 2) * Math.PI / 180), (n - s) * 111_000) / 2));
  void flyToPlace(app.globe, { name: j.name, lon, lat: (s + n) / 2, radius });
}

let playing = 0;
/** Flies through the trip step by step, lighting up each card as it goes. */
export async function playJourney(app: App, j: Journey, onStep: (i: number) => void) {
  const run = ++playing;
  const t = timeline(j);
  if (j.origin) { onStep(-1); await frame(app, j.origin); }
  for (let i = 0; i < t.rows.length && run === playing; i++) {
    const r = t.rows[i];
    onStep(i);
    if (r.step.kind === "move") {
      const from = (r as MoveRow).from;
      await frame(app, from ?? r.step.to, from ? r.step.to : undefined, r.step.to.name);
      if (run !== playing) break;
      // The vehicle travels the leg while its route draws in.
      if (from) await animateLeg(app, from, r.step.to, r.step.mode, () => run === playing);
      if (run !== playing) break;
      await frame(app, r.step.to);
    } else {
      await frame(app, r.step.place);
      await new Promise((res) => setTimeout(res, 700));
    }
  }
  if (run === playing) { onStep(-2); frameJourney(app, j); }
}
export const stopPlaying = () => { playing++; };

// ---- Plain words to steps -----------------------------------------------------------------------

interface Resolved { step?: Step; origin?: Spot; date?: string; visit?: { stay: StayStep; name: string; spot: Spot; day?: number }; label: string; alts: SearchResult[]; pick: number; draft: Draft }

const toSpot = (r: SearchResult, typed: string): Spot => ({ name: /\d/.test(r.name) && typed.length < 40 ? typed.replace(/\b\w/g, (c) => c.toUpperCase()) : r.name, detail: r.detail, lon: r.lon, lat: r.lat });

async function resolve(j: Journey, drafts: Draft[], insertAt: number, short: boolean): Promise<Resolved[]> {
  const out: Resolved[] = [];
  let here = whereAfter(j, insertAt < 0 ? j.steps.length : insertAt);
  let lastStay: StayStep | null = (() => { const before = j.steps.slice(0, insertAt < 0 ? j.steps.length : insertAt); const s = before[before.length - 1]; return s?.kind === "stay" ? s : null; })();
  const find = async (q: string, bias: Spot | null) => (await geocode(q, bias ? { lat: bias.lat, lon: bias.lon } : null).catch(() => [])).slice(0, 4);
  for (const d of drafts) {
    if (d.kind === "origin") {
      const alts = await find(d.query, null);
      if (!alts.length) { out.push({ label: `Couldn't find “${d.query}”`, alts, pick: -1, draft: d }); continue; }
      const origin = toSpot(alts[0], d.query);
      out.push({ origin, date: d.date, label: `Start from ${origin.name}${d.date ? ` on ${dayFmt(d.date)}` : ""}`, alts, pick: 0, draft: d });
      here = origin;
    } else if (d.kind === "move") {
      let to: Spot | null = null, alts: SearchResult[] = [];
      if (d.home) to = j.origin;
      else { alts = await find(d.query, d.mode === "fly" ? null : here); if (alts[0]) to = toSpot(alts[0], d.query); }
      if (!to) { out.push({ label: d.home ? "Where's home? Add where the trip starts first." : `Couldn't find “${d.query}”`, alts, pick: -1, draft: d }); continue; }
      const km = here ? metres([here.lon, here.lat], [to.lon, to.lat]) / 1000 : 0;
      const mode: Mode = d.mode ?? (short ? (km > 2 ? "bus" : "walk") : guessMode(km));
      const step: Step = { id: newId(), kind: "move", mode, to, at: d.at };
      out.push({ step, label: `${MODES[mode].emoji} ${MODES[mode].verb} to ${to.name}`, alts, pick: 0, draft: d });
      here = to; lastStay = null;
    } else if (d.kind === "stay") {
      let place = here, alts: SearchResult[] = [];
      if (d.query) { alts = await find(d.query, here); place = alts[0] ? toSpot(alts[0], d.query) : null; }
      if (!place) { out.push({ label: d.query ? `Couldn't find “${d.query}”` : "Say where: “stay 3 nights in Manila”", alts, pick: -1, draft: d }); continue; }
      const step: StayStep = { id: newId(), kind: "stay", place, visits: [], label: d.label, ...(d.hours || short ? { hours: d.hours ?? (d.nights ?? 2) } : { nights: d.nights ?? 1 }) };
      out.push({ step, label: d.label ? `🗓️ ${d.label} · ${fmtHours(step.hours ?? 1)}` : `${step.nights ? "🛏️" : "📍"} ${step.nights ? plural(step.nights, "night") : fmtHours(step.hours ?? 1)} at ${place.name}`, alts, pick: 0, draft: d });
      here = place; lastStay = step;
    } else {
      const alts = await find(d.query, lastStay?.place ?? here);
      if (!alts[0]) { out.push({ label: `Couldn't find “${d.query}”`, alts, pick: -1, draft: d }); continue; }
      const spot = toSpot(alts[0], d.query);
      if (lastStay?.nights) {
        out.push({ visit: { stay: lastStay, name: spot.name, spot, day: d.day }, label: `📍 ${spot.name}, during ${plural(lastStay.nights, "night")} at ${lastStay.place.name}`, alts, pick: 0, draft: d });
      } else {
        // Not during a stay: a stop of its own (a short stay there).
        const km = here ? metres([here.lon, here.lat], [spot.lon, spot.lat]) / 1000 : 0;
        const steps: Step[] = [];
        if (here && km > 0.3) steps.push({ id: newId(), kind: "move", mode: short ? (km > 2 ? "bus" : "walk") : guessMode(km), to: spot });
        const stay: StayStep = { id: newId(), kind: "stay", place: spot, hours: d.hours ?? 1.5, visits: [] };
        for (const s of steps) out.push({ step: s, label: `${MODES[(s as { mode: Mode }).mode].emoji} ${MODES[(s as { mode: Mode }).mode].verb} to ${spot.name}`, alts: [], pick: -1, draft: d });
        out.push({ step: stay, label: `📍 ${stay.hours} h at ${spot.name}`, alts, pick: 0, draft: d });
        here = spot; lastStay = stay;
      }
    }
  }
  return out;
}

function apply(j: Journey, items: Resolved[], insertAt: number) {
  let at = insertAt < 0 ? j.steps.length : insertAt;
  for (const r of items) {
    if (r.origin) { j.origin = r.origin; if (r.date) j.start = r.date; }
    if (r.step) j.steps.splice(at++, 0, r.step);
    if (r.visit) {
      const { stay, name, spot, day } = r.visit;
      // Without a day: the first full day with the fewest stops.
      const n = stay.nights ?? 0, counts = Array.from({ length: n + 1 }, (_, d) => stay.visits.filter((v) => v.day === d).length);
      const best = day ?? (n >= 1 ? counts.slice(1).indexOf(Math.min(...counts.slice(1))) + 1 : 0);
      stay.visits.push({ id: newId(), name, spot, day: Math.min(n, best) });
    }
  }
}

/** Adds steps typed in plain words, taking the first match for each place. */
export async function addFromText(j: Journey, text: string, short = false): Promise<{ added: number; missed: string[] }> {
  const drafts = parseSteps(text);
  const got = await resolve(j, drafts, -1, short);
  const ok = got.filter((p) => p.step || p.origin || p.visit);
  apply(j, ok, -1);
  if (/^(new trip|class field trip)$/i.test(j.name)) { const n = autoName(j); if (n) { j.name = n; autoNamed.set(j.id, n); } }
  return { added: ok.length, missed: got.filter((p) => !(p.step || p.origin || p.visit)).map((p) => p.label) };
}

// ---- The editor ------------------------------------------------------------------------------------

export function journeyEditor(host: JourneyHost): HTMLElement {
  const { ctx, journey: j } = host;
  const { app } = ctx;
  if (ui.journey !== j.id) { ui.journey = j.id; ui.open = ""; ui.insertAt = -1; }
  const t = timeline(j);
  const change = () => { host.save(); host.rerender(); };
  const cards: HTMLElement[] = [];

  // Summary: dates, days, distance, and the ways you travel.
  const days = Math.max(1, Math.round((Date.parse(dateOf(t.end)) - Date.parse(dateOf(t.start))) / 86_400_000) + 1);
  const summary = j.steps.length ? h("div", { class: "jr-summary" },
    h("strong", {}, host.short ? `${timeOf(t.start)} – ${timeOf(t.end)}` : `${dayFmt(dateOf(t.start), { day: "numeric", month: "short" })} – ${dayFmt(dateOf(t.end), { day: "numeric", month: "short" })}`),
    h("span", {}, host.short ? fmtHours((t.end - t.start) / 60) : `${plural(days, "day")}${t.nights ? ` · ${plural(t.nights, "night")}` : ""}`),
    t.km ? h("span", {}, fmtDist(t.km * 1000)) : "",
    ...MODE_IDS.filter((m) => t.byMode[m]).map((m) => h("span", { class: "jr-mode-count", style: `--c:${MODES[m].color}`, title: `${MODES[m].label}: ${fmtDist(t.byMode[m]!.km * 1000)}` }, iconFor(MODES[m].emoji, 13), String(t.byMode[m]!.n)))) : "";

  // Start.
  const startInput = h("input", { class: "jr-inline", placeholder: host.short ? "Your school's name or address" : "Where do you start? A city or address", value: j.origin?.name ?? "" }) as HTMLInputElement;
  const findStart = async () => {
    const q = startInput.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (!r) { app.toast("Couldn't find that. Try adding the town or country.", 4000); return; }
    j.origin = toSpot(r, q);
    change();
  };
  startInput.addEventListener("keydown", (e) => { if (e.key === "Enter") void findStart(); });
  startInput.addEventListener("change", () => { if (startInput.value.trim() !== (j.origin?.name ?? "")) void findStart(); });
  const start = h("div", { class: "jr-step jr-start", style: "--c:#8e8e93" },
    h("span", { class: "jr-icon", style: "--c:#8e8e93" }, iconFor(originEmoji(host.originLabel))),
    h("div", { class: "jr-body" },
      h("div", { class: "jr-title" }, host.originLabel === "Venue" ? "Start at " : host.short ? "Leave from " : "Start from ", startInput),
      h("div", { class: "jr-when" },
        h("input", { type: "date", value: j.start, "aria-label": "Start date", onchange: (e: Event) => { j.start = (e.target as HTMLInputElement).value || j.start; change(); } }),
        h("input", { type: "time", value: j.time, "aria-label": "Start time", onchange: (e: Event) => { j.time = (e.target as HTMLInputElement).value || j.time; change(); } }))));

  // Each step.
  const tools = (i: number, s: Step) => h("div", { class: "jr-tools" },
    h("button", { class: "link-btn", onclick: () => void frame(app, ...((): [Spot, Spot?] => { const r = t.rows[i]; return r.step.kind === "move" && (r as MoveRow).from ? [(r as MoveRow).from!, r.step.to] : [s.kind === "move" ? s.to : s.place]; })()) }, "Show on map"),
    h("button", { class: "link-btn", onclick: () => { ui.insertAt = i + 1; ui.open = ""; host.rerender(); } }, "Add a step after"),
    i > 0 ? h("button", { class: "link-btn", onclick: () => { [j.steps[i - 1], j.steps[i]] = [j.steps[i], j.steps[i - 1]]; change(); } }, "Move up") : "",
    h("button", { class: "link-btn danger", onclick: () => { j.steps.splice(i, 1); ui.open = ""; change(); } }, "Remove"));

  const moveCard = (r: MoveRow, i: number) => {
    const s = r.step, m = MODES[s.mode], open = ui.open === s.id;
    return h("div", { class: `jr-step jr-move${open ? " open" : ""}`, style: `--c:${m.color}`, "data-i": i },
      h("button", { class: "jr-icon", title: "Change how you travel", "aria-label": `${m.label}; change how you travel`, onclick: () => { ui.open = open ? "" : s.id; host.rerender(); } }, iconFor(m.emoji)),
      h("div", { class: "jr-body", onclick: (e: Event) => { if ((e.target as HTMLElement).closest("button,input,select")) return; ui.open = open ? "" : s.id; host.rerender(); } },
        h("div", { class: "jr-title" }, `${m.verb} to `, h("b", {}, s.to.name)),
        h("div", { class: "jr-sub" }, r.from ? `${when(r.start)} → ${r.end - r.start >= 1440 || dateOf(r.end) !== dateOf(r.start) ? when(r.end) : timeOf(r.end)} · ${fmtDist(r.km * 1000)} · about ${fmtHours(r.hours)}` : "Add where you start to see times and distances"),
        s.note ? h("div", { class: "jr-note" }, s.note) : "",
        open ? h("div", { class: "jr-edit" },
          h("div", { class: "jr-modes", role: "group", "aria-label": "How you travel" }, ...MODE_IDS.filter((x) => !host.short || x !== "fly").map((x) =>
            h("button", { class: `jr-mode${x === s.mode ? " on" : ""}`, style: `--c:${MODES[x].color}`, title: MODES[x].label, onclick: () => { s.mode = x; change(); } }, iconFor(MODES[x].emoji, 18), h("small", {}, MODES[x].label)))),
          h("div", { class: "jr-fields" },
            h("label", {}, h("span", {}, "Leave at"), h("input", { type: "time", value: s.at ?? "", onchange: (e: Event) => { s.at = (e.target as HTMLInputElement).value || undefined; change(); } })),
            h("label", { class: "grow" }, h("span", {}, s.mode === "fly" ? "Flight, booking" : "Note"), h("input", { value: s.note ?? "", placeholder: s.mode === "fly" ? "PR 101, seat 12A" : s.mode === "train" ? "Coach 4, booking ref" : "Anything to remember", onchange: (e: Event) => { s.note = (e.target as HTMLInputElement).value || undefined; change(); } }))),
          tools(i, s)) : ""));
  };

  const stayCard = (r: StayRow, i: number) => {
    const s = r.step, open = ui.open === s.id, long = !!s.nights;
    const weather = h("div", { class: "jr-weather" });
    const inDays = Math.round((Date.parse(r.days[0]) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
    if (inDays >= 0 && inDays <= 6)
      void forecast(s.place.lon, s.place.lat).then((f) => {
        const k = f.daily.time.indexOf(r.days[0]);
        if (k >= 0) weather.textContent = `${Math.round(f.daily.temperature_2m_min[k])}–${Math.round(f.daily.temperature_2m_max[k])} °C · ${f.daily.precipitation_probability_max[k] ?? 0}% chance of rain`;
      }).catch(() => {});
    const bump = (d: number) => {
      if (long) s.nights = Math.max(1, (s.nights ?? 1) + d);
      else s.hours = Math.max(0.5, (s.hours ?? 1) + d * 0.5);
      if (s.nights) for (const v of s.visits) v.day = Math.min(v.day, s.nights);
      change();
    };
    const stopInput = h("input", { class: "jr-inline", placeholder: long ? "Add a stop: “Intramuros”, “dinner at Manam”" : "Add a stop here" }) as HTMLInputElement;
    const addStop = async () => {
      const raw = stopInput.value.trim();
      if (!raw) return;
      const d = parseSteps(/^(visit|see|stop|explore|tour|lunch|dinner|breakfast|coffee)\b/i.test(raw) ? raw : `visit ${raw}`)[0];
      const q = d && d.kind === "visit" ? d.query : raw;
      stopInput.disabled = true;
      const [res] = await geocode(q, { lat: s.place.lat, lon: s.place.lon }).catch(() => []);
      stopInput.disabled = false;
      if (!res) { app.toast(`Couldn't find “${q}” near ${s.place.name}.`, 4000); return; }
      const far = metres([s.place.lon, s.place.lat], [res.lon, res.lat]) > 300_000;
      if (far) { app.toast(`The closest “${q}” is far from ${s.place.name}; try adding the town.`, 5000); return; }
      apply(j, [{ visit: { stay: s, name: toSpot(res, q).name, spot: toSpot(res, q), day: d && d.kind === "visit" ? d.day : undefined }, label: "", alts: [], pick: 0, draft: d! }], -1);
      ui.open = s.id;
      change();
    };
    stopInput.addEventListener("keydown", (e) => { if (e.key === "Enter") void addStop(); });
    const visitRow = (v: StayStep["visits"][number]) => h("div", { class: "jr-visit" },
      h("button", { class: "jr-visit-name", onclick: () => v.spot && void frame(app, v.spot) }, `📍 ${v.name}`),
      long && s.nights! > 0 ? h("select", { class: "jr-day", "aria-label": "Which day", onchange: (e: Event) => { v.day = +(e.target as HTMLSelectElement).value; change(); } },
        ...r.days.map((_d, k) => h("option", { value: k, selected: v.day === k }, `Day ${k + 1}`))) : "",
      h("button", { class: "icon-btn", "aria-label": `Remove ${v.name}`, onclick: () => { s.visits = s.visits.filter((x) => x !== v); change(); } }, "✕"));
    const byDay = long ? r.days.map((d, k) => ({ d, k, vs: s.visits.filter((v) => v.day === k) })).filter((x) => x.vs.length) : [];
    return h("div", { class: `jr-step jr-stay${open ? " open" : ""}`, style: "--c:#ff375f", "data-i": i },
      h("span", { class: "jr-icon" }, iconFor(long ? "🛏️" : "📍")),
      h("div", { class: "jr-body" },
        !long && s.label
          ? h("div", { class: "jr-title" }, h("b", {}, s.label), ` · ${fmtHours(s.hours ?? 1)}`, h("span", { class: "jr-at" }, ` at ${s.place.name}`))
          : h("div", { class: "jr-title" }, long ? `${plural(s.nights!, "night")} at ` : `${fmtHours(s.hours ?? 1)} at `, h("b", {}, s.place.name)),
        h("div", { class: "jr-sub" }, long ? `${dayFmt(r.days[0])} – ${dayFmt(r.days[r.days.length - 1])} · check out ${timeOf(r.end)}` : `${timeOf(r.start)} – ${timeOf(r.end)}`),
        weather,
        h("div", { class: "jr-stepper" },
          h("button", { class: "icon-btn", "aria-label": long ? "One night fewer" : "Half an hour less", onclick: () => bump(-1) }, "−"),
          h("span", {}, long ? plural(s.nights!, "night") : fmtHours(s.hours ?? 1)),
          h("button", { class: "icon-btn", "aria-label": long ? "One night more" : "Half an hour more", onclick: () => bump(1) }, "+"),
          h("button", { class: "link-btn", onclick: () => { ui.open = open ? "" : s.id; host.rerender(); } }, open ? "Done" : "Edit")),
        long ? h("div", { class: "jr-days" }, ...byDay.map(({ d, k, vs }) => h("div", { class: "jr-day-block" }, h("span", { class: "jr-day-label" }, `Day ${k + 1} · ${dayFmt(d, { weekday: "long" })}`), ...vs.map(visitRow))))
          : h("div", { class: "jr-days" }, ...s.visits.map(visitRow)),
        h("div", { class: "jr-add-stop" }, stopInput),
        s.note && !open ? h("div", { class: "jr-note" }, s.note) : "",
        open ? h("div", { class: "jr-edit" },
          h("div", { class: "jr-fields" }, h("label", { class: "grow" }, h("span", {}, long ? "Hotel, booking" : "Note"), h("input", { value: s.note ?? "", placeholder: long ? "Booking ref, check-in time" : "What happens here", onchange: (e: Event) => { s.note = (e.target as HTMLInputElement).value || undefined; change(); } })),
            h("label", {}, h("span", {}, "Stay"), h("select", { onchange: (e: Event) => { if ((e.target as HTMLSelectElement).value === "nights") { s.nights = Math.max(1, Math.round((s.hours ?? 24) / 24)); delete s.hours; } else { s.hours = 2; delete s.nights; for (const v of s.visits) v.day = 0; } change(); } },
              h("option", { value: "nights", selected: long }, "Nights"), h("option", { value: "hours", selected: !long }, "Hours")))),
          tools(i, s)) : ""));
  };

  const steps = t.rows.map((r, i) => (r.step.kind === "move" ? moveCard(r as MoveRow, i) : stayCard(r as StayRow, i)));
  cards.push(start, ...steps);

  // The composer: say what's next, see it, add it.
  const input = h("input", { class: "jr-input", placeholder: host.originLabel === "Venue" ? "Doors and drinks for an hour, talks for 2 hours, walk to dinner" : j.steps.length ? (host.short ? "Walk to the park, lunch for 1 hour, bus back to school" : "Train to Baguio, stay 2 nights…") : host.short ? "Bus to the Science Museum, stay 3 hours, bus back to school" : "Fly to Manila, taxi to the Peninsula, stay 3 nights", "aria-label": "Add steps in plain words" }) as HTMLInputElement;
  const preview = h("div", { class: "jr-preview", hidden: true });
  let pending: Resolved[] = [];
  const showPreview = () => {
    const ok = pending.filter((p) => p.step || p.origin || p.visit);
    preview.hidden = false;
    preview.replaceChildren(
      ...pending.map((p, k) => h("div", { class: `jr-prev${p.step || p.origin || p.visit ? "" : " bad"}` },
        h("span", { class: "jr-prev-label" }, ...labelled(p.label, 15)),
        p.alts.length > 1 ? h("span", { class: "jr-alts" }, "Not this? ", ...p.alts.map((a, n) => n === p.pick ? "" : h("button", { class: "chip small", onclick: () => {
          const spot = toSpot(a, p.draft.kind !== "stay" ? p.draft.query : p.draft.query ?? a.name);
          if (p.origin) p.origin = spot;
          if (p.step?.kind === "move") p.step.to = spot;
          if (p.step?.kind === "stay") p.step.place = spot;
          if (p.visit) { p.visit.spot = spot; p.visit.name = spot.name; }
          p.pick = n;
          p.label = p.label.replace(/(to|at|from|📍) [^,]+(,|$)/, `$1 ${spot.name}$2`);
          pending[k] = p; showPreview();
        } }, [a.name, a.detail?.split(", ").slice(-1)[0]].filter(Boolean).join(", ")))) : "")),
      h("div", { class: "jr-prev-actions" },
        ok.length ? h("button", { class: "primary-btn", onclick: () => commit() }, ok.length === 1 ? "Add it" : `Add ${ok.length} steps`) : "",
        h("button", { class: "link-btn", onclick: () => { pending = []; preview.hidden = true; } }, "Cancel")));
  };
  const commit = () => {
    const ok = pending.filter((p) => p.step || p.origin || p.visit);
    if (!ok.length) return;
    apply(j, ok, ui.insertAt);
    ui.insertAt = -1;
    if (/^(new trip|class field trip)$/i.test(j.name) || j.name === autoNamed.get(j.id)) { const n = autoName(j); if (n) { j.name = n; autoNamed.set(j.id, n); } }
    pending = [];
    host.save();
    host.rerender();
    // New legs play out as they're added: framed, then travelled.
    const added = new Set(ok.map((p) => p.step?.id).filter(Boolean));
    const legs = timeline(j).rows.filter((r): r is MoveRow => r.step.kind === "move" && added.has(r.step.id) && !!(r as MoveRow).from);
    const last = [...ok].reverse().find((p) => p.step || p.visit);
    if (legs.length) void (async () => {
      const run = ++playing;
      for (const r of legs) {
        if (run !== playing) return;
        await frame(app, r.from!, r.step.to, r.step.to.name);
        if (run !== playing) return;
        await animateLeg(app, r.from!, r.step.to, r.step.mode, () => run === playing);
      }
    })();
    else if (last?.step) void frame(app, last.step.kind === "move" ? last.step.to : last.step.place);
  };
  const understand = async () => {
    const text = input.value.trim();
    if (!text) return;
    if (pending.length && !preview.hidden && input.dataset.for === text) return commit();
    let drafts = parseSteps(text);
    // Just a place: go there (the obvious way), or stop there during a stay.
    if (!drafts.length) drafts = [{ kind: "move", mode: null, query: text }];
    preview.hidden = false;
    preview.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Finding the places…"));
    pending = await resolve(j, drafts, ui.insertAt, !!host.short);
    input.dataset.for = text;
    showPreview();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void understand(); });
  const quick = (label: string, text: string) => h("button", { class: "chip", onclick: () => { input.value = text; input.focus(); input.setSelectionRange(text.length, text.length); } }, ...labelled(label, 14));
  const here = whereAfter(j, ui.insertAt < 0 ? j.steps.length : ui.insertAt);
  const composer = h("div", { class: "jr-compose" },
    ui.insertAt >= 0 && ui.insertAt < j.steps.length ? h("div", { class: "jr-inserting" }, `Adding after step ${ui.insertAt}`, h("button", { class: "link-btn", onclick: () => { ui.insertAt = -1; host.rerender(); } }, "Add at the end instead")) : "",
    h("div", { class: "jr-quick" },
      ...(host.originLabel === "Venue"
        ? [quick("🗓️ Part of the day", "Talks for 1 hour"), quick("🚶 Walk", "Walk to "), quick("🚕 Taxi", "Taxi to "), quick("🚌 Bus", "Bus to "), quick("📍 Stop", "Visit ")]
        : host.short
        ? [quick("🚌 Bus", "Bus to "), quick("🚶 Walk", "Walk to "), quick("🚆 Train", "Train to "), quick("📍 Stop", "Visit "), quick("⏱️ Stay", "Stay 2 hours"), j.origin ? quick("🏫 Back", "Bus back to school") : ""]
        : [quick("✈️ Fly", "Fly to "), quick("🚆 Train", "Train to "), quick("🚗 Drive", "Drive to "), quick("🚕 Taxi", "Taxi to "), quick("🚌 Bus", "Bus to "), quick("⛴️ Ferry", "Ferry to "), quick("🛏️ Stay", here ? `Stay 3 nights` : "Stay 3 nights in "), quick("📍 Stop", "Visit "), j.origin && j.steps.length ? quick("🏠 Home", "Fly home") : ""])),
    h("div", { class: "jr-input-row" }, input, h("button", { class: "pill-btn", onclick: () => void understand() }, "Add")),
    preview);

  const el = h("div", { class: "journey" }, summary, h("div", { class: "jr-list" }, ...cards), composer);
  if (!j.steps.length && !j.origin) queueMicrotask(() => input.focus());
  return el;
}

/** The trip as plain text, to paste into a message. */
export function journeyText(j: Journey, short = false): string {
  const t = timeline(j), lines = [j.name, ""];
  if (j.origin) lines.push(`${short ? "Leave" : "Start"} ${j.origin.name}: ${when(t.start)}`);
  for (const r of t.rows) {
    if (r.step.kind === "move") { const m = r as MoveRow; lines.push(`${MODES[r.step.mode].emoji} ${MODES[r.step.mode].verb} to ${r.step.to.name}: ${when(m.start)} → ${timeOf(m.end)}${m.from ? ` (${fmtDist(m.km * 1000)}, about ${fmtHours(m.hours)})` : ""}${r.step.note ? ` · ${r.step.note}` : ""}`); }
    else {
      const s = r as StayRow, st = r.step;
      lines.push(st.nights ? `🛏️ ${plural(st.nights, "night")} at ${st.place.name}: ${dayFmt(s.days[0])} – ${dayFmt(s.days[s.days.length - 1])}${st.note ? ` · ${st.note}` : ""}` : `📍 ${st.place.name}: ${timeOf(s.start)} – ${timeOf(s.end)}${st.note ? ` · ${st.note}` : ""}`);
      for (const v of [...st.visits].sort((a, b) => a.day - b.day)) lines.push(`   · ${st.nights ? `${dayFmt(s.days[v.day] ?? s.days[0], { weekday: "short", day: "numeric" })}: ` : ""}${v.name}`);
    }
  }
  return lines.join("\n");
}

export async function copyJourney(app: App, j: Journey, short = false) {
  app.toast((await copyText(journeyText(j, short))) ? "Copied the itinerary. Paste it into a message or note." : "Couldn't copy.", 3000);
}

/** Highlights the card for a step while the trip plays (-1: the start; -2: none). */
export function highlight(root: HTMLElement, i: number) {
  root.querySelectorAll(".jr-step.playing").forEach((e) => e.classList.remove("playing"));
  const el = i === -1 ? root.querySelector(".jr-start") : i >= 0 ? root.querySelector(`.jr-step[data-i="${i}"]`) : null;
  if (el) { el.classList.add("playing"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}
