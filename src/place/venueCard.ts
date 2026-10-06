// A venue's card: what it is, how long it takes to get there, and the details people look up (hours, grades,
// phone, website, the weather there now). Three actions, not ten; the area's deeper readings wait behind one
// button. See src/place/venue.ts for what counts as a venue.
import type { App, Place } from "../app";
import { weatherText } from "../analysis/climate";
import { getJson, viaEdge } from "../data/http";
import { forecast } from "../data/openmeteo";
import { asyncBlock, section } from "../themes/common";
import { estimateMinutes, fmtMin, matrixUrl, parseMatrix, REACH_IDS, REACH_MODES, type MatrixResponse, type ReachMode } from "../travel/reach";
import { h } from "../ui/dom";
import { labelled } from "../ui/glyph";
import { metres } from "../work/geo";
import { detailsFrom, type Category, type Venue } from "./venue";

type Spot = { lon: number; lat: number };

/** What it is and where, with the three things people do next. */
export function venueHead(app: App, _place: Place, venue: Venue): HTMLElement {
  const phone = matchMedia("(pointer: coarse)").matches;
  // The address is already the card's subtitle; this says what it is.
  return h("div", { class: "pg-head vn-head" },
    h("p", { class: "vn-kind" }, venue.label),
    h("div", { class: "pg-actions" },
      phone ? h("button", { class: "pg-btn holo-go", title: "Turn-by-turn from where you are", onclick: () => app.actions.get("wayfind:guide")?.run() }, ...labelled("🧭 Guide me there", 15)) : null,
      h("button", { class: `pg-btn${phone ? "" : " holo-go"}`, title: "The building and the streets around it in 3D", onclick: () => app.actions.get("space:boot")?.run() }, ...labelled("◎ See it in 3D", 15)),
      h("button", { class: "pg-btn", title: "Save it for a daily brief, travel times and its weather", onclick: () => app.actions.get("place:save")?.run() }, ...labelled("🏠 Add to My Place", 15))));
}

/** The saved home, if there is one (a pure read of the stored list). */
function savedHome(): (Spot & { name: string }) | null {
  try {
    const all = JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { kind?: string; name: string; lon: number; lat: number }[];
    const home = all.find((p) => p.kind === "home") ?? null;
    return home && Number.isFinite(home.lon) ? { name: home.name, lon: home.lon, lat: home.lat } : null;
  } catch { return null; }
}

/** Where you are, without asking: only if the browser already allows it. */
async function hereIfAllowed(): Promise<Spot | null> {
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (perm?.state !== "granted") return null;
  } catch { return null; }
  return askHere().catch(() => null);
}
const askHere = () => new Promise<Spot>((ok, no) => navigator.geolocation.getCurrentPosition((p) => ok({ lon: p.coords.longitude, lat: p.coords.latitude }), no, { timeout: 8000, maximumAge: 120_000 }));

/** Walk, bike and drive from you (or home) to here: live times where the router answers, estimates where not. */
export function gettingThere(app: App, place: Place): HTMLElement {
  const tiles = Object.fromEntries(REACH_IDS.map((m) => {
    const time = h("strong", {}, "…"), sub = h("small", {}, REACH_MODES[m].label);
    return [m, { el: h("div", { class: "vn-mode", "data-mode": m }, time, sub), time, sub }];
  })) as unknown as Record<ReachMode, { el: HTMLElement; time: HTMLElement; sub: HTMLElement }>;
  const from = h("p", { class: "vn-from muted small" });
  const pick = h("div", { class: "vn-pick" });
  const grid = h("div", { class: "vn-modes" }, ...REACH_IDS.map((m) => tiles[m].el));
  const box = section("Getting there", from, grid, pick,
    h("button", { class: "link-btn", onclick: () => app.actions.get("reach:open")?.run() }, "How far you can get from here ›"));
  const token = app.token;

  const show = async (o: Spot, label: string, source: "here" | "home") => {
    if (!app.isCurrent(token)) return;
    offer(source);
    const km = metres([o.lon, o.lat], [place.lon, place.lat]) / 1000;
    if (km < 0.05) { from.textContent = "You're here."; grid.hidden = true; return; }
    grid.hidden = false;
    from.textContent = `From ${label} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
    for (const m of REACH_IDS) { tiles[m].time.textContent = "…"; tiles[m].el.classList.remove("best", "est"); }
    const live = await Promise.all(REACH_IDS.map((m) => getJson<MatrixResponse>("Valhalla", matrixUrl(o, [place], m), undefined, 12_000).then((r) => parseMatrix(r, 1)[0]).catch(() => null)));
    if (!app.isCurrent(token)) return;
    const mins = REACH_IDS.map((m, i) => live[i] ?? estimateMinutes(o, place, m));
    const best = REACH_IDS[mins.indexOf(Math.min(...mins.map((x) => x ?? Infinity)))];
    REACH_IDS.forEach((m, i) => {
      const t = tiles[m];
      // A walk of hours isn't a way to get there; say so instead of a number.
      t.time.textContent = m === "walk" && (mins[i] ?? 0) > 180 ? "Too far" : `${live[i] === null ? "~" : ""}${fmtMin(mins[i])}`;
      t.el.classList.toggle("est", live[i] === null);
      t.el.classList.toggle("best", m === best && km < 400);
    });
  };

  const home = savedHome();
  // Only the other way to measure from: where you are, or your saved home.
  function offer(current: "here" | "home" | null) {
    pick.replaceChildren(
      current !== "here" ? h("button", { class: "pill-btn", onclick: () => { from.textContent = "Finding you…"; askHere().then((o) => void show(o, "where you are", "here")).catch(() => { from.textContent = "Couldn't get your location. Allow it in the browser, or save your home in My Place."; }); } }, "From where I am") : "",
      home && current !== "home" ? h("button", { class: "pill-btn", onclick: () => void show(home, home.name, "home") }, `From ${home.name}`) : "");
  }
  offer(null);
  grid.hidden = true;
  from.textContent = "How long it takes on foot, by bike and by car.";
  void hereIfAllowed().then((o) => {
    if (o) void show(o, "where you are", "here");
    else if (home) void show(home, home.name, "home");
  });
  return box;
}

interface Lookup { extratags?: Record<string, string> | null }

/** The details the map knows (hours, grades, phone, website…) and the weather there now. */
export function venueDetails(app: App, place: Place, body: HTMLElement) {
  const venue = (place.feature as { venue?: Category } | undefined)?.venue;
  asyncBlock(app, body, "", async () => {
    const [tags, wx] = await Promise.all([
      venue?.osm ? getJson<Lookup[]>("OpenStreetMap", viaEdge(`https://nominatim.openstreetmap.org/lookup?osm_ids=${venue.osm}&format=jsonv2&extratags=1`), undefined, 12_000).then((r) => r[0]?.extratags ?? {}).catch(() => ({})) : Promise.resolve({}),
      forecast(place.lon, place.lat).catch(() => null),
    ]);
    const rows = detailsFrom(tags as Record<string, string>);
    if (wx) { const w = weatherText(wx.current.weather_code); rows.push({ label: "Weather now", value: `${Math.round(wx.current.temperature_2m)}° · ${w.text}` }); }
    if (!rows.length) return [];
    return [section("Details", h("dl", { class: "vn-details" }, ...rows.flatMap((r) => [
      h("dt", {}, r.label),
      h("dd", {}, r.href ? h("a", { href: r.href, target: r.href.startsWith("tel:") ? "_self" : "_blank", rel: "noopener" }, r.value) : r.value)])))];
  });
}

/** The area's deeper readings (ground, climate, history, news…), behind one button. */
export function moreAboutArea(fill: (into: HTMLElement) => void): HTMLElement {
  const into = h("div", { class: "vn-more", hidden: true });
  const btn = h("button", { class: "vn-more-btn", onclick: () => { btn.remove(); into.hidden = false; fill(into); } }, "More about this area");
  return h("div", {}, btn, into);
}
