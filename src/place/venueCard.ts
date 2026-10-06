// A venue's card, laid out the way people expect from a maps app: what it is and whether it's open, four
// actions (Directions, Save, Nearby, Share), then the address, hours, phone and website, how to get there,
// photos and videos taken around it, other ways to see it, and every Terreno theme along the bottom.
// See src/place/venue.ts for what counts as a venue and src/place/around.ts for the pure pieces.
import { Cartesian3, Color, CustomDataSource, HeightReference, Rectangle } from "cesium";
import type { App, Place } from "../app";
import { weatherText } from "../analysis/climate";
import { getJson, viaEdge } from "../data/http";
import { forecast } from "../data/openmeteo";
import { overpass } from "../data/overpass";
import { section } from "../themes/common";
import { estimateMinutes, fmtMin, matrixUrl, parseMatrix, REACH_IDS, REACH_MODES, type MatrixResponse, type ReachMode } from "../travel/reach";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { metres } from "../work/geo";
import { fetchRoute, type Route } from "../wayfind/route";
import {
  addressLine, appleDirections, commonsNearUrl, googleDirections, mediaFrom, NEARBY, nearbyFrom, nearbyQuery, openNow, streetView,
  type CommonsResponse, type Media, type NearbyKind, type NearbyPlace, type TravelMode,
} from "./around";
import { detailsFrom, hoursText, venueOf, type Category, type Venue } from "./venue";

type Spot = { lon: number; lat: number };

const isPhone = () => matchMedia("(pointer: coarse)").matches;
const words = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const distText = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

/** The saved home, if there is one (a pure read of the stored list). */
function saved(): { kind?: string; name: string; lon: number; lat: number }[] {
  try { return JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]"); } catch { return []; }
}
function savedHome(): (Spot & { name: string }) | null {
  const home = saved().find((p) => p.kind === "home") ?? null;
  return home && Number.isFinite(home.lon) ? { name: home.name, lon: home.lon, lat: home.lat } : null;
}
const isSaved = (p: Spot) => saved().some((s) => Number.isFinite(s.lon) && metres([s.lon, s.lat], [p.lon, p.lat]) < 40);

/** Where you are, without asking: only if the browser already allows it. */
async function hereIfAllowed(): Promise<Spot | null> {
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (perm?.state !== "granted") return null;
  } catch { return null; }
  return askHere().catch(() => null);
}
const askHere = () => new Promise<Spot>((ok, no) => navigator.geolocation.getCurrentPosition((p) => ok({ lon: p.coords.longitude, lat: p.coords.latitude }), no, { timeout: 8000, maximumAge: 120_000 }));

/** A layer of the map that belongs to this place and goes when another place is chosen. */
function placeLayer(app: App, id: string, label: string, color: string): CustomDataSource {
  const viewer = app.globe.viewer;
  const old = viewer.dataSources.getByName(id)[0];
  if (old) viewer.dataSources.remove(old, true);
  const ds = new CustomDataSource(id);
  void viewer.dataSources.add(ds);
  app.canvas.put({ id, label, color, scope: "place", pinned: false, show: (v) => { ds.show = v; viewer.scene.requestRender(); }, remove: () => { viewer.dataSources.remove(ds, true); viewer.scene.requestRender(); } }, true);
  return ds;
}

interface Lookup { extratags?: Record<string, string> | null; address?: Record<string, string> | null }

/** Everything the card shows, in order. `more` fills "More about this area"; `about` is where a summary goes. */
export function venueCard(app: App, place: Place, venue: Venue, body: HTMLElement): { about: HTMLElement; more: (fill: (into: HTMLElement) => void) => void } {
  const token = app.token;
  const live = () => app.isCurrent(token);
  const name = place.name?.title ?? venue.label;
  const lookup: Promise<Lookup> = (() => {
    const osm = (place.feature as { venue?: Category } | undefined)?.venue?.osm;
    return osm
      ? getJson<Lookup[]>("OpenStreetMap", viaEdge(`https://nominatim.openstreetmap.org/lookup?osm_ids=${osm}&format=jsonv2&extratags=1&addressdetails=1`), undefined, 12_000).then((r) => r[0] ?? {}).catch(() => ({}))
      : Promise.resolve({});
  })();

  // ---- What it is, open now, and the four actions ----
  const status = h("span", { class: "vn-status" });
  const getting = gettingThere(app, place, name);
  const nearby = nearbyPanel(app, place, name);
  const saveBtn = h("button", { class: "vn-act" }) as HTMLButtonElement;
  const drawSave = (on: boolean) => saveBtn.replaceChildren(h("span", { class: "vn-act-icon", html: icons.bookmark }), h("span", {}, on ? "Saved" : "Save"));
  drawSave(isSaved(place));
  saveBtn.classList.toggle("on", isSaved(place));
  saveBtn.onclick = () => {
    if (isSaved(place)) { app.actions.get("mode:place")?.run(); return; }
    app.actions.get("place:save")?.run();
    drawSave(true); saveBtn.classList.add("on");
  };
  const act = (label: string, icon: string, run: () => void, primary = false) =>
    h("button", { class: `vn-act${primary ? " primary" : ""}`, onclick: run }, h("span", { class: "vn-act-icon", html: icon }), h("span", {}, label));
  const share = async () => {
    const url = app.shareLink?.() ?? location.href;
    if (navigator.share && isPhone()) { await navigator.share({ title: name, text: [name, place.name?.context].filter(Boolean).join(", "), url }).catch(() => {}); return; }
    app.sheet.share.click();
  };
  body.append(h("div", { class: "vn-top" },
    h("p", { class: "vn-line" }, h("span", { class: "vn-kind" }, venue.label), status),
    h("div", { class: "vn-acts", role: "toolbar", "aria-label": "Actions" },
      act("Directions", icons.directions, () => getting.directions(), true),
      saveBtn,
      act("Nearby", icons.nearby, () => nearby.toggle()),
      act("Share", icons.share, () => void share()),
      act("3D", icons.cube, () => app.actions.get("space:boot")?.run()))),
    nearby.el);

  // ---- Address, hours, phone, website, and the rest of what the map knows ----
  const info = h("div", { class: "vn-info" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading the details…"));
  body.append(info);
  void Promise.all([lookup, forecast(place.lon, place.lat).catch(() => null)]).then(([l, wx]) => {
    if (!live()) return;
    const tags = (l.extratags ?? {}) as Record<string, string>;
    const rows: HTMLElement[] = [];
    const row = (icon: string, main: Node | string, sub?: Node | string | null, tail?: Node | null) =>
      h("div", { class: "vn-row" }, h("span", { class: "vn-row-icon", html: icon }), h("div", { class: "vn-row-text" }, h("div", {}, main), sub ? h("div", { class: "vn-row-sub" }, sub) : ""), tail ?? "");
    const address = addressLine(l.address) || place.name?.context || "";
    if (address) {
      const copy = h("button", { class: "vn-row-btn", title: "Copy the address", "aria-label": "Copy the address", html: icons.copy, onclick: () => void navigator.clipboard?.writeText(address).then(() => app.toast("Address copied", 1800)).catch(() => {}) });
      rows.push(row(icons.pin, address, null, copy));
    }
    const oh = tags.opening_hours?.trim();
    if (oh) {
      const state = openNow(oh, new Date());
      if (state) status.replaceChildren(h("span", { class: `vn-open ${state.open ? "yes" : "no"}` }, state.open ? "Open" : "Closed"), ` · ${state.next}`);
      rows.push(row(icons.clock, state ? h("span", {}, h("span", { class: `vn-open ${state.open ? "yes" : "no"}` }, state.open ? "Open" : "Closed"), ` · ${state.next}`) : "Hours", hoursText(oh)));
    }
    const phone = (tags.phone ?? tags["contact:phone"])?.trim();
    if (phone) rows.push(row(icons.phone, h("a", { href: `tel:${phone.replace(/[^\d+]/g, "")}` }, phone)));
    const web = (tags.website ?? tags["contact:website"] ?? tags.url)?.trim();
    if (web) rows.push(row(icons.link, h("a", { href: /^https?:/.test(web) ? web : `https://${web}`, target: "_blank", rel: "noopener" }, web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))));
    // The rest (grades, who runs it, access…) as a quiet list; hours, phone and website are already above.
    const rest = detailsFrom(tags).filter((d) => !["Hours", "Phone", "Website"].includes(d.label));
    if (wx) { const w = weatherText(wx.current.weather_code); rest.push({ label: "Weather now", value: `${Math.round(wx.current.temperature_2m)}° · ${w.text}` }); }
    if (!phone && !web && !oh) rows.push(h("p", { class: "vn-missing muted small" }, "The map has no hours, phone or website for this place yet."));
    info.replaceChildren(...rows, rest.length ? h("dl", { class: "vn-details" }, ...rest.flatMap((r) => [h("dt", {}, r.label), h("dd", {}, r.value)])) : "");
  });

  body.append(getting.el);
  const about = h("div", { class: "vn-about" });
  body.append(about);
  body.append(mediaSection(app, place, name));
  body.append(seeDifferently(app, () => nearby.open("parks")));
  const moreSlot = h("div", {});
  body.append(moreSlot, throughEveryTheme(app));
  return { about, more: (fill) => moreSlot.append(moreAboutArea(fill)) };
}

// ---- Getting there ---------------------------------------------------------------------------------

const PACE: Record<ReachMode, "walk" | "cycle" | "drive"> = { walk: "walk", bike: "cycle", drive: "drive" };
const TRAVEL: Record<ReachMode, TravelMode> = { walk: "walk", bike: "bike", drive: "drive" };

/** Walk, bike and drive from you (or home) to here; tap one for the route on the map and its turns. */
export function gettingThere(app: App, place: Place, name = "there"): { el: HTMLElement; directions: () => void } {
  const tiles = Object.fromEntries(REACH_IDS.map((m) => {
    const time = h("strong", {}, "…"), sub = h("small", {}, REACH_MODES[m].label);
    const el = h("button", { class: "vn-mode", "data-mode": m, onclick: () => void route(m) }, time, sub);
    return [m, { el, time, sub }];
  })) as unknown as Record<ReachMode, { el: HTMLElement; time: HTMLElement; sub: HTMLElement }>;
  const from = h("p", { class: "vn-from muted small" });
  const pick = h("div", { class: "vn-pick" });
  const grid = h("div", { class: "vn-modes" }, ...REACH_IDS.map((m) => tiles[m].el));
  const turns = h("div", { class: "vn-route" });
  const out = h("div", { class: "vn-out" },
    h("a", { class: "pill-btn", href: googleDirections(place), target: "_blank", rel: "noopener" }, "Google Maps"),
    h("a", { class: "pill-btn", href: appleDirections(place, name), target: "_blank", rel: "noopener" }, "Apple Maps"),
    h("a", { class: "pill-btn", href: googleDirections(place, "transit"), target: "_blank", rel: "noopener" }, "By transit"));
  const box = section("Getting there", from, grid, turns, pick, out,
    h("button", { class: "link-btn", onclick: () => app.actions.get("reach:open")?.run() }, "How far you can get from here ›"));
  box.classList.add("vn-getting");
  const token = app.token;
  let origin: (Spot & { label: string }) | null = null;
  let best: ReachMode = "drive";

  const show = async (o: Spot, label: string, source: "here" | "home") => {
    if (!app.isCurrent(token)) return;
    origin = { ...o, label };
    offer(source);
    const km = metres([o.lon, o.lat], [place.lon, place.lat]) / 1000;
    if (km < 0.05) { from.textContent = "You're here."; grid.hidden = true; return; }
    grid.hidden = false;
    from.textContent = `From ${label} · ${distText(km)} away`;
    for (const m of REACH_IDS) { tiles[m].time.textContent = "…"; tiles[m].el.classList.remove("best", "est"); }
    const live = await Promise.all(REACH_IDS.map((m) => getJson<MatrixResponse>("Valhalla", matrixUrl(o, [place], m), undefined, 12_000).then((r) => parseMatrix(r, 1)[0]).catch(() => null)));
    if (!app.isCurrent(token)) return;
    const mins = REACH_IDS.map((m, i) => live[i] ?? estimateMinutes(o, place, m));
    best = REACH_IDS[mins.indexOf(Math.min(...mins.map((x) => x ?? Infinity)))];
    REACH_IDS.forEach((m, i) => {
      const t = tiles[m];
      // A walk of hours isn't a way to get there; say so instead of a number.
      t.time.textContent = m === "walk" && (mins[i] ?? 0) > 180 ? "Too far" : `${live[i] === null ? "~" : ""}${fmtMin(mins[i])}`;
      t.el.classList.toggle("est", live[i] === null);
      t.el.classList.toggle("best", m === best && km < 400);
    });
  };

  /** The route for one way of travelling: drawn on the map, with its turns. */
  const route = async (mode: ReachMode) => {
    if (!origin) { directions(); return; }
    for (const m of REACH_IDS) tiles[m].el.classList.toggle("on", m === mode);
    turns.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Finding the way…"));
    const r: Route | null = await fetchRoute(origin, place, PACE[mode]);
    if (!app.isCurrent(token)) return;
    if (!r) {
      turns.replaceChildren(h("p", { class: "muted small" }, "Couldn't find a route just now. ", h("a", { href: googleDirections(place, TRAVEL[mode]), target: "_blank", rel: "noopener" }, "Try Google Maps ›")));
      return;
    }
    drawRoute(app, r, mode);
    const steps = r.steps.filter((s) => s.text);
    const list = h("ol", { class: "vn-steps" }, ...steps.slice(0, 6).map((s) => h("li", {}, h("span", {}, s.text), s.km > 0.01 ? h("small", {}, distText(s.km)) : "")));
    const all: HTMLElement | "" = steps.length > 6 ? h("button", { class: "link-btn", onclick: () => { list.replaceChildren(...steps.map((s) => h("li", {}, h("span", {}, s.text), s.km > 0.01 ? h("small", {}, distText(s.km)) : ""))); (all as HTMLElement).remove(); } }, `All ${steps.length} steps`) : "";
    turns.replaceChildren(
      h("div", { class: "vn-route-head" },
        h("strong", {}, fmtMin(r.minutes)), h("span", { class: "muted" }, ` · ${distText(r.km)} ${REACH_MODES[mode].label.toLowerCase()}`),
        isPhone() ? h("button", { class: "pill-btn primary", onclick: () => app.actions.get("wayfind:guide")?.run() }, "Start") : ""),
      list, all);
  };

  /** Directions: from where you are (asking, if need be), the quickest way, on the map. */
  const directions = () => {
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    if (origin) { void route(best); return; }
    from.textContent = "Finding you…";
    askHere().then(async (o) => { await show(o, "where you are", "here"); void route(best); })
      .catch(() => {
        const home = savedHome();
        if (home) void show(home, home.name, "home").then(() => route(best));
        else from.textContent = "Couldn't get your location. Allow it in the browser, or open the route in Google or Apple Maps below.";
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
  return { el: box, directions };
}

const ROUTE_COLOR: Record<ReachMode, string> = { walk: "#2f8f5b", bike: "#d19a2e", drive: "#3563d6" };

function drawRoute(app: App, r: Route, mode: ReachMode) {
  const ds = placeLayer(app, "venue:route", "Route", ROUTE_COLOR[mode]);
  const pts = r.shape.map((p) => [p.lon, p.lat]).flat();
  ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(pts), width: 6, clampToGround: true, material: Color.fromCssColorString(ROUTE_COLOR[mode]) } });
  const s = r.shape[0];
  ds.entities.add({ position: Cartesian3.fromDegrees(s.lon, s.lat), point: { pixelSize: 11, color: Color.WHITE, outlineColor: Color.fromCssColorString(ROUTE_COLOR[mode]), outlineWidth: 3, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  const lons = r.shape.map((p) => p.lon), lats = r.shape.map((p) => p.lat);
  const pad = Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 0.25, (Math.max(...lons) - Math.min(...lons)) * 0.25);
  app.globe.viewer.camera.flyTo({ destination: Rectangle.fromDegrees(Math.min(...lons) - pad, Math.min(...lats) - pad * 1.6, Math.max(...lons) + pad, Math.max(...lats) + pad), duration: 1.6 });
  app.globe.viewer.scene.requestRender();
}

// ---- Nearby ----------------------------------------------------------------------------------------

/** What's around, by kind: restaurants, coffee, groceries, parks, transit, schools, health, gas. */
function nearbyPanel(app: App, place: Place, selfName: string): { el: HTMLElement; toggle: () => void; open: (id?: NearbyKind["id"]) => void } {
  const token = app.token;
  const list = h("div", { class: "vn-near-list" });
  const chips = h("div", { class: "chips vn-near-chips" });
  const el = h("div", { class: "vn-near", hidden: true }, chips, list);
  let current: NearbyKind["id"] | null = null;
  const draw = () => chips.replaceChildren(...NEARBY.map((k) =>
    h("button", { class: `chip${k.id === current ? " on" : ""}`, "aria-pressed": String(k.id === current), onclick: () => void show(k) }, k.label)));
  const show = async (k: NearbyKind) => {
    current = k.id; draw();
    list.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), `Finding ${k.label.toLowerCase()}…`));
    const wide = k.id === "parks" || k.id === "transit" || k.id === "fuel";
    let found: NearbyPlace[] = [];
    try {
      found = nearbyFrom(await overpass(nearbyQuery(place, k, wide ? 2500 : 1500)), k, place, selfName);
      if (found.length < 3) found = nearbyFrom(await overpass(nearbyQuery(place, k, 6000)), k, place, selfName);
    } catch { found = []; }
    if (!app.isCurrent(token) || current !== k.id) return;
    if (!found.length) { list.replaceChildren(h("p", { class: "muted small" }, `No ${k.label.toLowerCase()} on the map within a few kilometres.`)); pins(app, []); return; }
    const top = found.slice(0, 8);
    pins(app, top);
    list.replaceChildren(...top.map((n, i) => {
      const kind = venueOf({ key: n.key, value: n.value })?.label ?? words(n.value);
      const st = n.tags.opening_hours ? openNow(n.tags.opening_hours, new Date()) : null;
      const walk = estimateMinutes(place, n, "walk");
      return h("button", { class: "list-row vn-near-row", onclick: () => go(n) },
        h("span", { class: "vn-near-n" }, String(i + 1)),
        h("span", { class: "list-text" },
          h("span", { class: "list-title" }, n.name),
          h("span", { class: "list-sub" }, kind, ` · ${distText(n.km)}`, n.km < 3 && walk ? ` · ${fmtMin(walk)} walk` : "",
            st ? h("span", { class: `vn-open ${st.open ? "yes" : "no"}` }, st.open ? " · Open" : " · Closed") : "")),
        h("span", { class: "chev", html: "&rsaquo;" }));
    }), h("p", { class: "fineprint" }, "From OpenStreetMap."));
  };
  const go = (n: NearbyPlace) => {
    void flyToPlace(app.globe, { name: n.name, lon: n.lon, lat: n.lat, radius: 500 });
    const street = [n.tags["addr:housenumber"], n.tags["addr:street"]].filter(Boolean).join(" ");
    app.select({ lon: n.lon, lat: n.lat, height: 0 }, { title: n.name, context: street || `Near ${selfName}` }, { venue: { key: n.key, value: n.value, osm: n.osm } });
  };
  const open = (id: NearbyKind["id"] = current ?? "food") => {
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (id !== current || !list.childElementCount) void show(NEARBY.find((k) => k.id === id)!);
  };
  draw();
  return { el, open, toggle: () => (el.hidden ? open() : (el.hidden = true)) };
}

/** A numbered map pin, drawn once per number. */
const pinImages = new Map<number, HTMLCanvasElement>();
function pinImage(n: number): HTMLCanvasElement {
  let c = pinImages.get(n);
  if (c) return c;
  const r = window.devicePixelRatio > 1 ? 2 : 1, size = 26 * r;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2 * r, 0, Math.PI * 2);
  g.fillStyle = "#c4513a"; g.fill(); g.lineWidth = 2 * r; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff"; g.font = `700 ${12 * r}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), size / 2, size / 2 + 0.5 * r);
  pinImages.set(n, c);
  return c;
}

function pins(app: App, list: NearbyPlace[]) {
  const ds = placeLayer(app, "venue:nearby", "Nearby", "#c4513a");
  list.forEach((n, i) => ds.entities.add({
    position: Cartesian3.fromDegrees(n.lon, n.lat),
    billboard: { image: pinImage(i + 1), width: 26, height: 26, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  }));
  app.globe.viewer.scene.requestRender();
}

// ---- Photos and videos -----------------------------------------------------------------------------

/** Photos and videos people have posted around here (Wikimedia Commons), and the street-level view. */
function mediaSection(app: App, place: Place, name: string): HTMLElement {
  const strip = h("div", { class: "vn-media" }, h("div", { class: "vn-media-wait" }));
  const credit = h("p", { class: "fineprint" });
  const box = section("Photos and videos", strip, credit);
  const token = app.token;
  const street = h("a", { class: "vn-tile vn-street", href: streetView(place), target: "_blank", rel: "noopener" }, h("span", { html: icons.eye }), h("span", {}, "Street View"));
  const lead = (place.feature as { notable?: { image?: string } } | undefined)?.notable?.image;
  getJson<CommonsResponse>("Wikimedia Commons", commonsNearUrl(place, 700), undefined, 12_000)
    .then((r) => mediaFrom(r, place)).catch(() => [] as Media[])
    .then((list) => {
      if (!app.isCurrent(token)) return;
      const items = list.slice(0, 14);
      strip.replaceChildren(
        ...(lead ? [h("button", { class: "vn-tile", onclick: () => viewer({ title: name, thumb: lead, full: lead, page: lead, video: false, by: "", km: 0 }) }, h("img", { src: lead.replace(/^http:/, "https:"), alt: name, loading: "lazy" }))] : []),
        ...items.map((m) => h("button", { class: `vn-tile${m.video ? " video" : ""}`, title: m.title, onclick: () => viewer(m) },
          h("img", { src: m.thumb, alt: m.title, loading: "lazy" }), m.video ? h("span", { class: "vn-play", html: icons.play }) : "")),
        street);
      credit.textContent = items.length ? "Photos and videos posted to Wikimedia Commons within about 700 m, nearest first. Tap one to see who took it." : "No photos posted around here yet. Street View shows the street.";
    });
  return box;
}

/** A photo or video, large, with its credit and a link to its page. */
function viewer(m: Media) {
  const close = () => { shade.remove(); removeEventListener("keydown", esc); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  const shade = h("div", { class: "vn-viewer", role: "dialog", "aria-label": m.title, onclick: (e: Event) => { if (e.target === shade) close(); } },
    h("figure", {},
      m.video ? h("video", { src: m.full, controls: true, autoplay: true, playsinline: true }) : h("img", { src: m.full, alt: m.title }),
      h("figcaption", {}, h("span", {}, m.title, m.by ? ` · ${m.by}` : ""), h("a", { href: m.page, target: "_blank", rel: "noopener" }, "Source ›"))),
    h("button", { class: "vn-viewer-close", "aria-label": "Close", html: icons.close, onclick: close }));
  addEventListener("keydown", esc);
  document.body.append(shade);
}

// ---- See it differently, and every theme -----------------------------------------------------------

/** Other ways to see the same place: its nature, parks, the metro, a day of light, the seasons. */
function seeDifferently(app: App, parks: () => void): HTMLElement {
  const run = (id: string) => () => app.actions.get(id)?.run();
  const tile = (label: string, sub: string, icon: string, color: string, go: () => void) =>
    h("button", { class: "vn-way", style: `--c:${color}`, onclick: go }, h("span", { class: "vn-way-icon", html: icon }), h("span", {}, h("strong", {}, label), h("small", {}, sub)));
  return section("See it differently",
    h("div", { class: "vn-ways" },
      tile("Nature", "The woods and green around", icons.tree, "#2f8f5b", run("lens:forest")),
      tile("Parks & rec", "Parks, fields and pools nearby", icons.leaves, "#5b9467", parks),
      tile("Metro", "Lines, stations and trains", icons.train, "#3563d6", run("lens:transit")),
      tile("A day", "Sun and shadow, hour by hour", icons.sun, "#d19a2e", run("lens:day")),
      tile("Seasons", "The year sweeps the planet", icons.sprout, "#8b5fa8", run("rhythms:year"))));
}

/** Every Terreno theme, one tap each, along the bottom. */
function throughEveryTheme(app: App): HTMLElement {
  const themes = app.themes.filter((t) => t.id !== "explore");
  return section("See it through",
    h("div", { class: "vn-themes" }, ...themes.map((t) =>
      h("button", { class: "vn-theme", style: `--c:${t.color}`, onclick: () => app.setTheme(t.id) }, h("span", { class: "vn-theme-icon", html: t.icon }), h("span", {}, t.label)))));
}

/** The area's deeper readings (ground, climate, history, news…), behind one button. */
export function moreAboutArea(fill: (into: HTMLElement) => void): HTMLElement {
  const into = h("div", { class: "vn-more", hidden: true });
  const btn = h("button", { class: "vn-more-btn", onclick: () => { btn.remove(); into.hidden = false; fill(into); } }, "More about this area");
  return h("div", {}, btn, into);
}
