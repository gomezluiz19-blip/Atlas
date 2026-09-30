// Live traffic on the globe: every plane and ship as a small icon pointing
// the way it's going, gliding between reports. Planes fly at their real
// height (coloured by it: yellow near the ground, blue climbing, white at
// cruise). Tap one for its card: who and what it is, where it's going, its
// height, speed and climb, the trail it has flown and the path ahead. Follow
// puts the camera behind it and keeps it there.
import {
  BillboardCollection, Cartesian3, Color, Material, Math as CesiumMath, NearFarScalar, PolylineCollection,
  type Billboard, type Polyline,
} from "cesium";
import type { App } from "../app";
import { makeTappable } from "../globe/pickables";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { advance, balticShips, BALTIC, pathAhead, planesAround, planesEverywhere, routeOf, shipsWorldwide, streamShips, type Track, type TrackKind } from "./traffic";

const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">${body}</svg>`)}`;
const PLANE = svg('<path d="M12 1.6c.8 0 1.35.72 1.35 1.65V9l7.9 4.4v2.1l-7.9-2.45v4.8l2.3 1.75v1.65L12 20.35l-3.65.9V19.6l2.3-1.75v-4.8L2.75 15.5v-2.1L10.65 9V3.25c0-.93.55-1.65 1.35-1.65z" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="0.9" stroke-linejoin="round"/>');
const HELI = svg('<circle cx="12" cy="11" r="3.4" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="0.9"/><path d="M12 14.4v7M9.5 21.4h5M3 11h18M12 2v18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M3 11h18M12 2v18" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>');
const SHIP = svg('<path d="M12 1.8l4.3 6.4v12.6a1.6 1.6 0 0 1-1.6 1.6H9.3a1.6 1.6 0 0 1-1.6-1.6V8.2z" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="0.9" stroke-linejoin="round"/>');
const STILL = svg('<circle cx="12" cy="12" r="5.5" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="1"/>');

/** Planes by height: yellow low, orange climbing, blue in between, near-white at cruise. */
const ALT_STOPS: [number, [number, number, number]][] = [[0, [255, 214, 10]], [3000, [255, 159, 10]], [7000, [90, 200, 250]], [11000, [229, 246, 255]]];
export function altitudeColor(m: number): string {
  if (m <= ALT_STOPS[0][0]) return `rgb(${ALT_STOPS[0][1].join(",")})`;
  for (let i = 1; i < ALT_STOPS.length; i++) {
    const [a, ca] = ALT_STOPS[i - 1], [b, cb] = ALT_STOPS[i];
    if (m <= b) { const k = (m - a) / (b - a); return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`; }
  }
  return `rgb(${ALT_STOPS[ALT_STOPS.length - 1][1].join(",")})`;
}
export const SHIP_COLORS: Record<string, string> = {
  Cargo: "#30d158", Tanker: "#ff453a", Passenger: "#0a84ff", Fishing: "#ff9f0a", Tug: "#bf5af2", Service: "#bf5af2",
  "Sailing and pleasure": "#64d2ff", Military: "#8e8e93", "High-speed craft": "#ffd60a", Vessel: "#d1d1d6",
};
const colorOf = (t: Track) => (t.kind === "ship" ? SHIP_COLORS[t.group] ?? "#d1d1d6" : t.ground ? "#8e8e93" : altitudeColor(t.alt));

interface Entry { track: Track; bb: Billboard; key: object; trail: { lon: number; lat: number; alt: number }[]; nudge: { lon: number; lat: number; alt: number; t0: number } | null; missed: number; source: string }

const compass = (d: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((d % 360) + 360) % 360) / 45) % 8];
const ft = (m: number) => Math.round(m / 0.3048 / 100) * 100;
const SQUAWK: Record<string, string> = { "7500": "Hijack code", "7600": "Radio failure", "7700": "Emergency" };

export function createTraffic(app: App) {
  const scene = app.globe.viewer.scene, camera = app.globe.viewer.camera;
  const bbs = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
  const lines = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  const entries = new Map<string, Entry>();
  const on: Record<TrackKind, boolean> = { plane: false, ship: false };
  const source: Record<TrackKind, string> = { plane: "", ship: "" };
  const note: Record<TrackKind, string> = { plane: "", ship: "" };
  let selected: string | null = null, following: string | null = null, lastTarget: Cartesian3 | null = null;
  let trailLine: Polyline | null = null, aheadLine: Polyline | null = null;
  const timers: Record<TrackKind, number> = { plane: 0, ship: 0 };
  let stopStream: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** Routes by callsign (asked once a session). */
  const routes = new Map<string, ReturnType<typeof routeOf>>();
  const changed = () => listeners.forEach((f) => f());

  // ---- The card ----
  const card = h("section", { class: "tr-card", hidden: true, role: "dialog", "aria-label": "Aircraft or vessel" });
  (document.getElementById("ui") ?? document.body).append(card);
  let cardTimer = 0;

  const view = (): [number, number, number, number] | null => {
    const r = camera.computeViewRectangle();
    if (!r) return null;
    const d = CesiumMath.toDegrees;
    let w = d(r.west), e = d(r.east);
    if (e < w) { w = -180; e = 180; }
    return [w, d(r.south), e, d(r.north)];
  };
  const height = () => camera.positionCartographic.height;

  // ---- Keeping the craft ----
  const upsert = (list: Track[], kind: TrackKind, src: string, replace: boolean) => {
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.id);
      const e = entries.get(t.id);
      if (e) {
        // Where it was drawn a moment ago, so the correction to the new report is eased in, not jumped.
        const now = Date.now(), was = shown(e, now), will = advance(t, now);
        e.nudge = { lon: was.lon - will.lon, lat: was.lat - will.lat, alt: was.alt - will.alt, t0: now };
        if (Math.abs(e.nudge.lon) > 0.5 || Math.abs(e.nudge.lat) > 0.5) e.nudge = null;
        if (e.track.t !== t.t) e.trail.push({ lon: t.lon, lat: t.lat, alt: t.alt });
        if (e.trail.length > 240) e.trail.shift();
        e.track = { ...e.track, ...t };
        e.missed = 0;
        e.source = src;
        styleOf(e);
      } else if (entries.size < 8000) {
        const key = { traffic: t.id };
        const bb = bbs.add({
          position: Cartesian3.fromDegrees(t.lon, t.lat, t.alt), image: iconOf(t), width: t.kind === "ship" ? 20 : 26, height: t.kind === "ship" ? 20 : 26,
          alignedAxis: Cartesian3.UNIT_Z, rotation: -CesiumMath.toRadians(t.heading), color: Color.fromCssColorString(colorOf(t)),
          scaleByDistance: new NearFarScalar(4e3, 1.5, 9e6, 0.32), eyeOffset: new Cartesian3(0, 0, t.kind === "ship" ? -200 : 0), id: key,
        });
        const ent: Entry = { track: t, bb, key, trail: [{ lon: t.lon, lat: t.lat, alt: t.alt }], nudge: null, missed: 0, source: src };
        entries.set(t.id, ent);
        makeTappable(key, () => select(t.id));
      }
    }
    if (replace)
      for (const [id, e] of entries)
        if (e.track.kind === kind && !seen.has(id) && ++e.missed >= 2 && id !== following) remove(id);
    source[kind] = src;
    report(kind);
  };
  const remove = (id: string) => {
    const e = entries.get(id);
    if (!e) return;
    bbs.remove(e.bb);
    entries.delete(id);
    if (selected === id) closeCard();
  };
  const clearKind = (kind: TrackKind) => { for (const [id, e] of entries) if (e.track.kind === kind) remove(id); };
  const iconOf = (t: Track) => (t.kind === "ship" ? (t.speed < 0.5 ? STILL : SHIP) : t.group === "Helicopter" ? HELI : PLANE);
  const styleOf = (e: Entry) => {
    const img = iconOf(e.track);
    if (e.bb.image !== img) e.bb.image = img;
    e.bb.color = Color.fromCssColorString(colorOf(e.track));
    e.bb.scale = e.track.id === selected ? 1.6 : 1;
  };
  const shown = (e: Entry, now: number) => {
    const p = advance(e.track, now);
    if (e.nudge) {
      const k = 1 - (now - e.nudge.t0) / 2500;
      if (k <= 0) e.nudge = null;
      else return { lon: p.lon + e.nudge.lon * k, lat: p.lat + e.nudge.lat * k, alt: p.alt + e.nudge.alt * k };
    }
    return p;
  };

  // ---- Every frame: move them on ----
  scene.preRender.addEventListener(() => {
    if (!entries.size || document.hidden) return;
    const now = Date.now();
    for (const e of entries.values()) {
      const p = shown(e, now);
      e.bb.position = Cartesian3.fromDegrees(p.lon, p.lat, e.track.kind === "ship" ? 2 : p.alt, undefined, e.bb.position);
      e.bb.rotation = -CesiumMath.toRadians(e.track.heading);
    }
    if (following) {
      const e = entries.get(following);
      if (!e) { following = null; return; }
      const cur = Cartesian3.clone(e.bb.position);
      if (lastTarget) camera.position = Cartesian3.add(camera.position, Cartesian3.subtract(cur, lastTarget, new Cartesian3()), new Cartesian3());
      lastTarget = cur;
    }
    if (selected) drawPaths();
  });

  const toCart = (p: { lon: number; lat: number; alt: number }, ship: boolean) => Cartesian3.fromDegrees(p.lon, p.lat, ship ? 3 : p.alt);
  let pathsAt = 0;
  const drawPaths = () => {
    const now = Date.now();
    if (now - pathsAt < 500) return;
    pathsAt = now;
    const e = selected ? entries.get(selected) : null;
    if (!e) return;
    const ship = e.track.kind === "ship";
    const here = shown(e, now);
    const trail = [...e.trail, here].map((p) => toCart(p, ship));
    const ahead = pathAhead({ ...e.track, ...here }, now, ship ? 1200 : 240, ship ? 60 : 10).map((p) => toCart(p, ship));
    if (!trailLine) trailLine = lines.add({ width: 3, material: Material.fromType("Color", { color: Color.WHITE.withAlpha(0.85) }) });
    if (!aheadLine) aheadLine = lines.add({ width: 2.5, material: Material.fromType(Material.PolylineDashType, { color: Color.fromCssColorString("#5ac8fa"), dashLength: 14 }) });
    if (trail.length > 1) { trailLine.positions = trail; trailLine.show = true; } else trailLine.show = false;
    aheadLine.positions = ahead;
    aheadLine.show = !e.track.ground && e.track.speed > 0.5;
  };

  // ---- Fetching ----
  const pollPlanes = async () => {
    if (!on.plane) return;
    clearTimeout(timers.plane);
    const v = view(), high = height() > 3_500_000;
    try {
      if (high || !v) {
        const r = await planesEverywhere();
        note.plane = "";
        upsert(r.tracks, "plane", r.source, true);
      } else {
        const lon = (v[0] + v[2]) / 2, lat = (v[1] + v[3]) / 2;
        const km = Math.min(460, Math.hypot((v[2] - v[0]) * 111 * Math.cos((lat * Math.PI) / 180), (v[3] - v[1]) * 111) / 2);
        const r = await planesAround(lon, lat, km);
        note.plane = km >= 460 ? "Showing planes within 460 km of the middle of the view" : "";
        upsert(r.tracks, "plane", r.source, true);
      }
    } catch {
      note.plane = high ? "Zoom in to a region to see its planes" : "Couldn't reach the live flight networks just now";
      report("plane");
    }
    if (on.plane) timers.plane = window.setTimeout(() => void pollPlanes(), high ? 30_000 : 10_000);
  };
  const pollShips = async () => {
    if (!on.ship) return;
    clearTimeout(timers.ship);
    const v = view();
    if (!v) return;
    if (shipsWorldwide()) {
      stopStream?.();
      clearKind("ship");
      stopStream = streamShips(v, (t) => upsert([t], "ship", "AISStream", false), (e) => { note.ship = e; report("ship"); });
      source.ship = "AISStream";
      note.ship = "";
      report("ship");
      return;
    }
    const inBaltic = v[0] < BALTIC[2] && v[2] > BALTIC[0] && v[1] < BALTIC[3] && v[3] > BALTIC[1];
    if (!inBaltic) {
      clearKind("ship");
      note.ship = "Live ships are open in the Baltic (Finland's Digitraffic). Elsewhere they need an AISStream key on Atlas's edge.";
      report("ship");
    } else {
      try {
        upsert(await balticShips(v), "ship", "Digitraffic", true);
        note.ship = "";
      } catch {
        note.ship = "Couldn't reach Digitraffic just now";
        report("ship");
      }
    }
    if (on.ship) timers.ship = window.setTimeout(() => void pollShips(), 30_000);
  };
  let moveTimer = 0;
  camera.moveEnd.addEventListener(() => {
    clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => { if (on.plane) void pollPlanes(); if (on.ship) void pollShips(); }, 700);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (on.plane) void pollPlanes(); if (on.ship) void pollShips(); } });

  const count = (kind: TrackKind) => [...entries.values()].filter((e) => e.track.kind === kind).length;
  const report = (kind: TrackKind) => {
    if (!on[kind]) return;
    const n = count(kind);
    app.canvas.put({
      id: `live:${kind}`, label: `${kind === "plane" ? "Planes" : "Ships"} · ${n ? `${n.toLocaleString()} live` : note[kind] ? "none here" : "finding…"}`,
      color: kind === "plane" ? "#5ac8fa" : "#30d158", scope: "world", pinned: true,
      show: (v) => { for (const e of entries.values()) if (e.track.kind === kind) e.bb.show = v; },
      remove: () => set(kind, false),
    }, true);
    changed();
  };

  const set = (kind: TrackKind, value: boolean) => {
    if (on[kind] === value) return;
    on[kind] = value;
    if (value) {
      report(kind);
      void (kind === "plane" ? pollPlanes() : pollShips());
    } else {
      clearTimeout(timers[kind]);
      if (kind === "ship") { stopStream?.(); stopStream = null; }
      clearKind(kind);
      app.canvas.drop(`live:${kind}`);
      changed();
    }
  };

  // ---- Selecting, the card and following ----
  const select = (id: string) => {
    const prev = selected ? entries.get(selected) : null;
    selected = id;
    if (prev) styleOf(prev);
    const e = entries.get(id);
    if (!e) return;
    styleOf(e);
    pathsAt = 0;
    renderCard(e);
  };
  const closeCard = () => {
    const e = selected ? entries.get(selected) : null;
    selected = null;
    following = null;
    lastTarget = null;
    if (e) styleOf(e);
    if (trailLine) trailLine.show = false;
    if (aheadLine) aheadLine.show = false;
    card.hidden = true;
    clearInterval(cardTimer);
  };
  const follow = (id: string) => {
    const e = entries.get(id);
    if (!e) return;
    const ship = e.track.kind === "ship";
    const now = Date.now(), p = shown(e, now);
    // Behind it and above, looking the way it's going.
    const back = advance({ ...e.track, ...p, t: now, heading: (e.track.heading + 180) % 360, speed: ship ? 2500 : 16_000, climb: 0 }, now + 1000, 2);
    following = null;
    lastTarget = null;
    camera.flyTo({
      destination: Cartesian3.fromDegrees(back.lon, back.lat, (ship ? 0 : p.alt) + (ship ? 1800 : 7000)),
      orientation: { heading: CesiumMath.toRadians(e.track.heading), pitch: CesiumMath.toRadians(ship ? -35 : -22), roll: 0 },
      duration: 2.2,
      complete: () => { following = id; lastTarget = null; renderCard(entries.get(id)!); },
    });
  };

  const renderCard = (e: Entry) => {
    const t = e.track, ship = t.kind === "ship";
    const route = h("p", { class: "tr-route" });
    const stats = h("dl", { class: "tr-stats" });
    const age = h("p", { class: "fineprint" });
    const live = () => {
      const cur = entries.get(t.id);
      if (!cur) { closeCard(); return; }
      const k = cur.track, p = shown(cur, Date.now());
      const rows: [string, string][] = ship
        ? [["Speed", `${(k.speed / 0.514444).toFixed(1)} kn · ${(k.speed * 3.6).toFixed(0)} km/h`], ["Heading", `${compass(k.heading)} (${Math.round(k.heading)}°)`], ["Status", k.status ?? "—"], ["Going to", k.destination ?? "—"]]
        : [["Height", k.ground ? "On the ground" : `${ft(p.alt).toLocaleString()} ft · ${Math.round(p.alt).toLocaleString()} m`], ["Speed", `${Math.round(k.speed / 0.514444)} kn · ${Math.round(k.speed * 3.6)} km/h`],
          ["Heading", `${compass(k.heading)} (${Math.round(k.heading)}°)`], ["Climb", Math.abs(k.climb) < 1.3 ? "Level" : `${k.climb > 0 ? "Climbing" : "Descending"} ${Math.abs(Math.round(k.climb * 196.85 / 100) * 100).toLocaleString()} ft/min`]];
      stats.replaceChildren(...rows.flatMap(([a, b]) => [h("dt", {}, a), h("dd", {}, b)]));
      const s = Math.max(0, Math.round((Date.now() - k.t) / 1000));
      age.textContent = `Live from ${cur.source} · last report ${s < 2 ? "just now" : s < 120 ? `${s} s ago` : `${Math.round(s / 60)} min ago`}; drawn moving on since.`;
    };
    const emergency = t.squawk && SQUAWK[t.squawk];
    card.replaceChildren(
      h("div", { class: "tr-head" },
        h("span", { class: "tr-dot", style: `background:${colorOf(t)}` }),
        h("div", { class: "tr-title" }, h("strong", {}, t.label), h("span", {}, ship ? [t.group, t.length ? `${t.length} m long` : ""].filter(Boolean).join(" · ") : [t.operator, t.typeName ?? t.type, t.reg].filter(Boolean).join(" · ") || t.group)),
        h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: closeCard })),
      emergency ? h("p", { class: "tr-alert" }, `Squawking ${t.squawk}: ${emergency}`) : "",
      route, stats,
      h("div", { class: "tr-actions" },
        following === t.id
          ? h("button", { class: "pill-btn", onclick: () => { following = null; lastTarget = null; renderCard(e); } }, "Stop following")
          : h("button", { class: "pill-btn primary", onclick: () => follow(t.id) }, ship ? "Follow this ship" : "Follow this flight"),
        h("button", { class: "pill-btn", onclick: () => { const p = shown(e, Date.now()); camera.flyTo({ destination: Cartesian3.fromDegrees(p.lon, p.lat, (ship ? 0 : p.alt) + (ship ? 6000 : 40_000)), duration: 1.6 }); } }, "Look from above"),
        h("button", { class: "pill-btn", title: "A link that opens Atlas following it", onclick: () => void share(e) }, "Share")),
      age,
      h("p", { class: "fineprint" }, ship ? "The white line is where it has been; blue dashes, where it will be in 20 minutes at this speed." : "The white line is where it has flown; blue dashes, where it will be in 4 minutes on this heading."));
    card.hidden = false;
    live();
    clearInterval(cardTimer);
    cardTimer = window.setInterval(live, 1000);
    if (!ship) void (routes.get(t.callsign ?? "") ?? routes.set(t.callsign ?? "", routeOf(t).catch(() => null)).get(t.callsign ?? "")!).then((r) => {
      if (r && selected === t.id) route.textContent = `${r.from.code} ${r.from.city ?? r.from.name}  →  ${r.to.code} ${r.to.city ?? r.to.name}`;
    }).catch(() => {});
    else if (t.destination) route.textContent = `Bound for ${t.destination}`;
    if (t.mmsi) route.title = `MMSI ${t.mmsi}`;
  };
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !card.hidden) closeCard(); });

  /** A link that opens Atlas on this craft, following it. */
  const share = async (e: Entry) => {
    const p = shown(e, Date.now());
    const link = `${location.origin}${location.pathname}#follow=${e.track.id}@${p.lon.toFixed(3)},${p.lat.toFixed(3)}`;
    const title = e.track.kind === "ship" ? `${e.track.label} at sea, live` : `Flight ${e.track.label}, live`;
    try {
      if (navigator.share) await navigator.share({ title, url: link });
      else { await navigator.clipboard.writeText(link); app.toast("Link copied: it opens Atlas following this, live.", 3500); }
    } catch { /* cancelled */ }
  };
  /** Opens a shared craft: its kind on, the camera there, then follows it once it's seen. */
  const openShared = (id: string, lon: number, lat: number) => {
    const kind: TrackKind = id.startsWith("s:") ? "ship" : "plane";
    camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, kind === "plane" ? 250_000 : 40_000), duration: 2 });
    set(kind, true);
    let tries = 0;
    const wait = window.setInterval(() => {
      if (entries.has(id)) { clearInterval(wait); select(id); follow(id); }
      else if (++tries > 40) { clearInterval(wait); app.toast(kind === "plane" ? "That flight isn't being seen right now; it may have landed." : "That ship isn't reporting right now.", 5000); }
    }, 1000);
  };

  return {
    set,
    isOn: (kind: TrackKind) => on[kind],
    count,
    note: (kind: TrackKind) => note[kind],
    source: (kind: TrackKind) => source[kind],
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Every craft being shown (for "what's overhead" and the task robot). */
    tracks: () => [...entries.values()].map((e) => ({ ...e.track, ...shown(e, Date.now()) })),
    select,
    openShared,
  };
}

export type Traffic = ReturnType<typeof createTraffic>;
