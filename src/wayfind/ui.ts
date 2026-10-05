// The wayfinder: Terreno telling you what you're passing and guessing where you're going, the way a good
// guide (or a good game) does. Three pieces on screen, one model underneath (./model.ts):
//   - The compass ribbon, top centre: your heading, and the landmarks ahead as tiles on the ribbon, with the
//     place you seem to be making for picked out in cobalt. Tap a tile to go there.
//   - The passing card: as you glide over the globe (or walk, drive or fly with Guide on), the thing you're
//     passing gets a card: its name, the one line worth knowing, which side it's on. Each one counts toward
//     the places you've found.
//   - The guess: move steadily toward one of your places (home, a saved place, a recent search, today's plan)
//     and Terreno asks if that's where you're going, and offers to take you.
// Guide (the arrow in the map controls) follows your phone's GPS: a chase camera behind you, the same cards
// for what you pass at street level (from Wikipedia), and turn-by-turn to wherever it guessed or you chose.
// On the TV, the same cards become lower thirds while it flies between places.
import "./wayfind.css";
import { CallbackProperty, Cartesian3, Cartographic, Color, EasingFunction, HeightReference, Math as CesiumMath, PolylineDashMaterialProperty, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { groundAt } from "../globe/controls";
import { summaryByName } from "../data/wikipedia";
import { h } from "../ui/dom";
import { FEATURE_COLOR, PIGMENT } from "../content/kindColor";
import { myCandidates } from "./candidates";
import { aheadOf, bearing, compassPoint, distanceText, etaText, guessDestination, km, motionOf, offset, paceOf, passingNow, ribbonX, scaleFor, sideText, turnFrom, type Candidate, type Fix, type Guess, type LL, type Pace, type Poi, type Sighting } from "./model";
import { allPois, basePois, nearbyWiki } from "./pois";
import { fetchRoute, progress, type Route } from "./route";

const FOUND = "atlas.wayfind.found";
const FOV = 160;
/** The pigment a kind of place is drawn in on the ribbon and its card. */
export const KIND_COLOR: Record<string, string> = {
  ...FEATURE_COLOR, heritage: PIGMENT.naples, architecture: PIGMENT.madder, art: PIGMENT.violet, sport: PIGMENT.sage, food: PIGMENT.ochre, wiki: PIGMENT.stone,
};
const colorOf = (p: Poi) => KIND_COLOR[p.kind] ?? "#b8496a";
const PACE_WORD: Record<Pace, string> = { still: "Standing", walk: "Walking", run: "Running", cycle: "Cycling", drive: "Driving", rail: "By train", fly: "Flying" };
const navSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.8 19.5 21 12 16.8 4.5 21z"/></svg>';

function loadFound(): string[] { try { const v = JSON.parse(localStorage.getItem(FOUND) ?? "[]"); return Array.isArray(v) ? v.slice(-5000) : []; } catch { return []; } }

export interface Wayfinder {
  /** Fires when a card shows (the TV hands it to the remote). */
  onPassing?: (s: Sighting) => void;
  /** The arrow for the map controls. */
  guideButton: HTMLButtonElement;
  /** Starts guidance to a place (from a place card, or the remote). */
  guideTo(to: Candidate): void;
}

let current: Wayfinder | null = null;
/** The wayfinder, once main has installed it (TV mode listens to it). */
export const wayfinder = () => current;

export function installWayfinder(app: App, root: HTMLElement): Wayfinder {
  const viewer = app.globe.viewer, cam = viewer.camera;
  const found = new Set(loadFound()), told = new Set<string>(found);
  const remember = (id: string) => { if (found.has(id)) return; found.add(id); try { localStorage.setItem(FOUND, JSON.stringify([...found].slice(-5000))); } catch { /* full */ } };

  let pois: Poi[] = basePois();
  void allPois().then((p) => { pois = p; });
  let wiki: Poi[] = [], wikiAt: LL | null = null;
  const refreshWiki = (at: LL, radiusM: number) => {
    if (wikiAt && km(wikiAt, at) < Math.max(0.8, radiusM / 4000)) return;
    wikiAt = at;
    void nearbyWiki(at, radiusM).then((w) => { wiki = w; });
  };

  // ---- The compass ribbon ----
  const ticks = h("canvas", { class: "wf-ticks", "aria-hidden": "true" });
  const marks = h("div", { class: "wf-marks" });
  const readout = h("span", { class: "wf-read" });
  const ribbon = h("div", { class: "wf-compass", role: "group", "aria-label": "Compass: what's ahead" }, ticks, marks, h("i", { class: "wf-caret" }), readout);
  // ---- The passing card, the guess, the guide bar ----
  const card = h("aside", { class: "wf-pass", role: "status", "aria-live": "polite", hidden: true });
  const guessEl = h("div", { class: "wf-guess", hidden: true });
  const bar = h("div", { class: "wf-bar", hidden: true });
  const recentre = h("button", { class: "wf-recentre", hidden: true, onclick: () => { free = 0; recentre.hidden = true; if (here) chase(here, true); } }, "Recentre");
  root.append(ribbon, card, guessEl, bar, recentre);

  const drawTicks = (heading: number) => {
    const w = ticks.clientWidth, hgt = ticks.clientHeight, k = devicePixelRatio || 1;
    if (!w) return;
    if (ticks.width !== Math.round(w * k)) { ticks.width = Math.round(w * k); ticks.height = Math.round(hgt * k); }
    const g = ticks.getContext("2d");
    if (!g) return;
    const ink = getComputedStyle(ribbon).color;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, hgt);
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    const start = Math.ceil((heading - FOV / 2) / 5) * 5;
    for (let d = start; d <= heading + FOV / 2; d += 5) {
      const x = ((d - heading) / FOV + 0.5) * w, n = ((d % 360) + 360) % 360;
      const edge = Math.min(1, Math.min(x, w - x) / (w * 0.18));
      g.globalAlpha = 0.25 + 0.75 * edge;
      g.fillStyle = ink;
      const major = n % 45 === 0, mid = n % 15 === 0;
      g.fillRect(Math.round(x), hgt - (major ? 9 : mid ? 6 : 3.5), major ? 1.5 : 1, major ? 9 : mid ? 6 : 3.5);
      if (major) {
        g.font = `${n % 90 === 0 ? 700 : 600} ${n % 90 === 0 ? 11 : 9.5}px ${getComputedStyle(document.body).getPropertyValue("--font") || "sans-serif"}`;
        g.fillStyle = n === 0 ? "#c4513a" : ink;
        g.fillText(compassPoint(n), x, hgt - 12);
      }
    }
    g.globalAlpha = 1;
  };
  let shownAhead = "";
  const drawMarks = (ahead: Sighting[], guess: Guess | null) => {
    const key = ahead.map((s) => `${s.poi.id}:${Math.round(s.rel)}:${Math.round(s.km)}`).join("|") + (guess ? `#${guess.c.id}:${Math.round(guess.rel)}` : "");
    if (key === shownAhead) return;
    shownAhead = key;
    const els: HTMLElement[] = [];
    // The ones nearest the middle carry their names, as long as the names don't run into each other.
    const short = (n: string) => (n.length > 26 ? `${n.slice(0, 25).trimEnd()}…` : n);
    const W = ribbon.clientWidth || 380, half = (n: string) => (short(n).length * 6.6) / 2 + 6;
    const named = new Set<string>(), taken: [x: number, half: number][] = [];
    if (guess) { const x = ribbonX(guess.rel, FOV); if (x !== null) taken.push([x * W, half(guess.c.name)]); }
    for (const s of [...ahead].sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel))) {
      const x = ribbonX(s.rel, FOV);
      if (named.size >= 2 || x === null || Math.abs(s.rel) > FOV * 0.4) continue;
      const px = x * W, hw = half(s.poi.name);
      if (taken.some(([tx, th]) => Math.abs(tx - px) < th + hw)) continue;
      named.add(s.poi.id); taken.push([px, hw]);
    }
    for (const s of ahead) {
      const x = ribbonX(s.rel, FOV);
      if (x === null) continue;
      els.push(h("button", { class: "wf-mark" + (named.has(s.poi.id) ? " named" : ""), style: `left:${(x * 100).toFixed(2)}%;--c:${colorOf(s.poi)}`, title: `${s.poi.name} · ${distanceText(s.km)}`,
        onclick: () => look(s.poi) }, h("i"), named.has(s.poi.id) ? h("span", {}, short(s.poi.name), h("small", {}, distanceText(s.km))) : ""));
    }
    if (guess) {
      const x = ribbonX(guess.rel, FOV);
      if (x !== null) els.push(h("button", { class: "wf-mark dest named", style: `left:${(x * 100).toFixed(2)}%`, title: guess.c.name, onclick: () => goTo(guess.c) },
        h("i"), h("span", {}, short(guess.c.name), h("small", {}, distanceText(guess.km)))));
    }
    marks.replaceChildren(...els);
  };

  const look = (p: Poi) => app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.where ?? p.line.slice(0, 60) });

  // ---- The card ----
  let cardTimer = 0, cardAt = 0;
  const showCard = (s: Sighting, moving: boolean) => {
    told.add(s.poi.id);
    remember(s.poi.id);
    cardAt = Date.now();
    const n = String(found.size).padStart(3, "0");
    card.style.setProperty("--c", colorOf(s.poi));
    card.replaceChildren(
      h("div", { class: "wf-pass-k" }, h("i", { class: "wf-tile" }), h("span", {}, moving ? `Passing · ${distanceText(s.km)} ${sideText(s.rel)}` : `Nearby · ${distanceText(s.km)}`)),
      h("strong", {}, s.poi.name),
      s.poi.line ? h("p", {}, s.poi.line) : "",
      h("div", { class: "wf-pass-row" },
        h("button", { class: "wf-look", onclick: () => { look(s.poi); hideCard(); } }, "Look"),
        h("span", { class: "wf-found", title: "Places you've found" }, `No. ${n} found`),
        h("button", { class: "wf-x", "aria-label": "Dismiss", onclick: () => hideCard() }, "×")),
      h("i", { class: "wf-timer" }));
    // A listing or a street-level find gets Wikipedia's first lines, when they come.
    if (s.poi.kind === "wiki" || s.poi.id.startsWith("i:whc-")) void richer(s.poi).then((line) => {
      const p = card.querySelector("p");
      if (line && p && card.querySelector("strong")?.textContent === s.poi.name) p.textContent = line;
    });
    card.hidden = false;
    card.classList.remove("out"); void card.offsetWidth; card.classList.add("in");
    clearTimeout(cardTimer);
    cardTimer = window.setTimeout(hideCard, document.body.classList.contains("tv-mode") ? 12_000 : 9000);
    wf.onPassing?.(s);
  };
  const lines = new Map<string, Promise<string | null>>();
  /** The first sentence or two of the place's Wikipedia article, cut at a sentence. */
  const richer = (p: Poi) => {
    let hit = lines.get(p.id);
    if (!hit) {
      hit = summaryByName([p.name]).then((sum) => {
        const text = sum?.extract?.replace(/\s*\([^)]*\)/g, "").trim();
        if (!text) return null;
        const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
        let out = "";
        for (const x of sentences) { if ((out + x).length > 200 && out) break; out += x; }
        return out.trim();
      }).catch(() => null);
      lines.set(p.id, hit);
    }
    return hit;
  };
  const hideCard = () => { clearTimeout(cardTimer); if (card.hidden) return; card.classList.remove("in"); card.classList.add("out"); window.setTimeout(() => { if (card.classList.contains("out")) card.hidden = true; }, 260); };
  card.addEventListener("pointerenter", () => clearTimeout(cardTimer));
  card.addEventListener("pointerleave", () => { if (!card.hidden) cardTimer = window.setTimeout(hideCard, 4000); });

  // ---- The guess ----
  const notThere = new Map<string, number>();
  let guessing: Guess | null = null, guessSeen = "", guessCount = 0;
  const showGuess = (g: Guess | null) => {
    if (!g || (notThere.get(g.c.id) ?? 0) > Date.now()) { if (guessing && !guiding) { guessing = null; guessEl.hidden = true; } return; }
    // A guess shows once it has held for a moment, so a passing swipe doesn't ask.
    if (g.c.id !== guessSeen) { guessSeen = g.c.id; guessCount = 0; }
    if (++guessCount < 3 || guessing?.c.id === g.c.id && !guessEl.hidden) { if (guessing?.c.id === g.c.id) update(g); return; }
    guessing = g;
    const why = g.c.why === "home" ? "Heading home?" : g.c.why === "plan" ? "On your way?" : "Heading for";
    guessEl.replaceChildren(
      h("span", { class: "wf-guess-k" }, why),
      h("strong", {}, g.c.name),
      h("span", { class: "wf-guess-d" }, `${distanceText(g.km)}${g.eta && guiding ? ` · ${etaText(g.eta)}` : ""}`),
      h("button", { class: "wf-go", onclick: () => goTo(g.c) }, guiding ? "Guide me" : "Take me"),
      h("button", { class: "wf-no", "aria-label": "Not there", onclick: () => { notThere.set(g.c.id, Date.now() + 15 * 60_000); guessEl.hidden = true; guessing = null; } }, "Not there"));
    guessEl.hidden = false;
    function update(x: Guess) { const d = guessEl.querySelector(".wf-guess-d"); if (d) d.textContent = `${distanceText(x.km)}${x.eta && guiding ? ` · ${etaText(x.eta)}` : ""}`; }
  };
  const goTo = (c: Candidate) => {
    guessEl.hidden = true; guessing = null;
    if (guiding) { wf.guideTo(c); return; }
    app.select({ lon: c.lon, lat: c.lat, height: 0 }, { title: c.name, context: c.why === "home" ? "Home" : "" });
  };

  // ---- Following the camera (web and TV) ----
  const track: Fix[] = [];
  let dragging = false, dragEnd = 0, lastTick = 0, cands: Candidate[] = myCandidates(), candsAt = Date.now();
  viewer.canvas.addEventListener("pointerdown", () => { dragging = true; if (guiding) { free = Date.now(); recentre.hidden = false; } });
  addEventListener("pointerup", () => { if (dragging) { dragging = false; dragEnd = Date.now(); } });
  const quiet = () => document.body.classList.contains("studio") || document.body.classList.contains("presenting") || document.body.classList.contains("clean") || document.body.classList.contains("st-recording");

  viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (now - lastTick < 220) return;
    lastTick = now;
    const heading = CesiumMath.toDegrees(cam.heading);
    const alt = app.globe.cameraHeight();
    const far = alt > 2_600_000 || quiet();
    ribbon.classList.toggle("off", far);
    readout.textContent = `${compassPoint(heading)} ${String(Math.round((heading + 360) % 360)).padStart(3, "0")}°`;
    if (far) { if (!guiding) { guessEl.hidden = true; guessing = null; } return; }
    drawTicks(heading);
    if (guiding) return; // GPS drives the rest.
    const g = groundAt(viewer);
    if (!g) return;
    const c = Cartographic.fromCartesian(g), at = { lon: CesiumMath.toDegrees(c.longitude), lat: CesiumMath.toDegrees(c.latitude) };
    const t = Date.now();
    const lastFix = track[track.length - 1];
    if (!lastFix || km(lastFix, at) > 1e-3) track.push({ ...at, t, alt });
    while (track.length > 40 || (track.length && t - track[0].t > 8000)) track.shift();
    const sc = scaleFor(alt);
    if (alt < 7000) refreshWiki(at, Math.min(10_000, Math.max(1500, sc.rangeKm * 400)));
    const pool = alt < 7000 ? [...pois, ...wiki] : pois;
    const m = motionOf(track, 2500, sc.reachKm * 0.05);
    // The ribbon looks the way the camera looks; the card and guess go the way the view is moving.
    if (Date.now() - candsAt > 20_000) { cands = myCandidates(); candsAt = Date.now(); }
    const steering = dragging || Date.now() - dragEnd < 1500;
    const guess = m && steering ? guessDestination(at, m, cands, { reachKm: sc.rangeKm * 1.6, hour: new Date().getHours(), minKm: sc.reachKm }) : null;
    drawMarks(aheadOf(at, heading, pool, { rangeKm: sc.rangeKm, coneDeg: FOV / 2, minWeight: sc.minWeight, limit: 7 }), guess ?? guessing);
    if (steering) showGuess(guess);
    if (m && Date.now() - cardAt > 6500 && !closeTo(app.place, at, sc.reachKm)) {
      const s = passingNow(at, m.heading, pool, sc.reachKm, told, sc.minWeight);
      if (s) showCard(s, true);
    }
  });
  const closeTo = (p: { lon: number; lat: number } | null, at: LL, r: number) => !!p && km(p, at) < r * 0.5;

  // ---- Guide: your phone's GPS ----
  let guiding = false, watch = -1, free = 0, here: (LL & { heading: number | null }) | null = null, pace: Pace = "still", lastChase = 0;
  const gps: Fix[] = [];
  let puck: Entity | null = null, line: Entity | null = null, route: Route | null = null, target: Candidate | null = null, routedAt = 0;
  let wake: { release(): Promise<void> } | null = null;
  const guideButton = h("button", { class: "map-ctl wf-guide-btn", title: "Guide: follow me and tell me what I pass", "aria-label": "Guide", "aria-pressed": "false", html: navSvg, onclick: () => (guiding ? stopGuide() : startGuide()) });

  const puckImage = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(47,88,200,.18)"; g.beginPath(); g.moveTo(32, 2); g.lineTo(48, 30); g.lineTo(16, 30); g.closePath(); g.fill();
    g.beginPath(); g.arc(32, 32, 11, 0, Math.PI * 2); g.fillStyle = "#f5f2eb"; g.fill();
    g.beginPath(); g.arc(32, 32, 7.5, 0, Math.PI * 2); g.fillStyle = "#2f58c8"; g.fill();
    return c.toDataURL();
  })();

  function chase(p: LL & { heading: number | null }, now = false) {
    if (free && Date.now() - free < 20_000) return;
    if (free) { free = 0; recentre.hidden = true; }
    if (!now && Date.now() - lastChase < 900) return;
    lastChase = Date.now();
    const height = { still: 420, walk: 380, run: 450, cycle: 600, drive: 1300, rail: 2600, fly: 9000 }[pace];
    if (p.heading === null) {
      cam.flyTo({ destination: Cartesian3.fromDegrees(p.lon, p.lat, height * 1.6), orientation: { heading: cam.heading, pitch: CesiumMath.toRadians(-90), roll: 0 }, duration: now ? 1.2 : 0.9, easingFunction: EasingFunction.QUADRATIC_OUT });
      return;
    }
    const pitch = 34, back = offset(p, p.heading + 180, height / Math.tan(CesiumMath.toRadians(pitch)) / 1000);
    cam.flyTo({ destination: Cartesian3.fromDegrees(back.lon, back.lat, height), orientation: { heading: CesiumMath.toRadians(p.heading), pitch: CesiumMath.toRadians(-pitch), roll: 0 }, duration: now ? 1.4 : 0.95, easingFunction: now ? EasingFunction.QUADRATIC_IN_OUT : EasingFunction.LINEAR_NONE });
  }

  function onFix(pos: GeolocationPosition) {
    const c = pos.coords, t = pos.timestamp || Date.now();
    if (c.accuracy > 120 && gps.length) return; // a wild fix: wait for a better one
    gps.push({ lon: c.longitude, lat: c.latitude, t });
    while (gps.length > 60 || (gps.length && t - gps[0].t > 45_000)) gps.shift();
    const m = motionOf(gps, 25_000, 0.012);
    const kmh = c.speed !== null && c.speed >= 0 ? c.speed * 3.6 : m?.speedKmh ?? 0;
    pace = paceOf(kmh);
    const heading = pace === "still" ? null : c.heading !== null && !Number.isNaN(c.heading) && kmh > 4 ? c.heading : m?.heading ?? null;
    here = { lon: c.longitude, lat: c.latitude, heading };
    if (!puck) puck = viewer.entities.add({ position: new CallbackProperty(() => here ? Cartesian3.fromDegrees(here.lon, here.lat) : Cartesian3.ZERO, false) as unknown as Cartesian3,
      billboard: { image: puckImage, width: 44, height: 44, verticalOrigin: VerticalOrigin.CENTER, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
        rotation: new CallbackProperty(() => (here?.heading ?? null) === null ? 0 : cam.heading - CesiumMath.toRadians(here!.heading!), false) } });
    chase(here);
    // What you're passing at street level.
    const reach = pace === "walk" || pace === "still" || pace === "run" ? 0.35 : pace === "cycle" ? 0.7 : pace === "drive" ? 2.5 : 25;
    refreshWiki(here, pace === "drive" ? 8000 : 3000);
    const pool = [...pois, ...wiki];
    if (Date.now() - cardAt > 15_000) { const s = passingNow(here, heading, pool, reach, told, 1); if (s) showCard(s, pace !== "still"); }
    // Where you're going: a guess while there's no target; turn-by-turn once there is.
    if (target) void steer();
    else if (m) showGuess(guessDestination(here, m, myCandidates(), { hour: new Date().getHours() }));
    drawBar();
  }

  async function steer() {
    if (!here || !target) return;
    const arrive = pace === "drive" || pace === "rail" ? 0.12 : 0.04;
    if (km(here, target) < arrive) { app.toast(`You're at ${target.name}.`, 4000); clearTarget(); return; }
    const prog = route ? progress(route, here) : null;
    if ((!route || (prog && prog.offKm > 0.08)) && Date.now() - routedAt > 20_000) {
      routedAt = Date.now();
      const r = await fetchRoute(here, target, pace === "still" ? "walk" : pace);
      if (r && target) { route = r; drawLine(r.shape); }
      else if (target) drawLine([here, target]);
    }
  }
  function drawLine(pts: LL[]) {
    if (line) viewer.entities.remove(line);
    line = viewer.entities.add({ polyline: { positions: pts.map((p) => Cartesian3.fromDegrees(p.lon, p.lat)), width: 6, clampToGround: true,
      material: route ? Color.fromCssColorString("#2f58c8").withAlpha(0.9) : new PolylineDashMaterialProperty({ color: Color.fromCssColorString("#2f58c8"), dashLength: 18 }) } });
    viewer.scene.requestRender();
  }
  function clearTarget() { target = null; route = null; if (line) { viewer.entities.remove(line); line = null; } drawBar(); }

  /** The instrument along the bottom while guiding: pace and heading, or the next turn and what's left. */
  function drawBar() {
    if (!guiding) { bar.hidden = true; return; }
    const kids: (Node | string)[] = [];
    if (target && here) {
      const prog = route ? progress(route, here) : null;
      const left = prog ? prog.leftKm : km(here, target);
      const min = route && prog && route.km ? (route.minutes * left) / route.km : null;
      kids.push(h("div", { class: "wf-bar-main" },
        h("small", {}, prog?.next ? `In ${distanceText(prog.toNextKm)}` : `To ${target.name}`),
        h("strong", {}, prog?.next ? prog.next.text : here.heading !== null ? `${target.name}, ${sideText(turnFrom(here.heading, bearing(here, target)))}` : target.name)),
        h("div", { class: "wf-bar-fig" }, h("strong", {}, distanceText(left)), h("small", {}, min !== null ? etaText(min) : "")),
        h("button", { class: "wf-bar-x", "aria-label": "Stop guiding there", onclick: () => clearTarget() }, "×"));
    } else {
      kids.push(h("div", { class: "wf-bar-main" }, h("small", {}, "Guide"), h("strong", {}, here ? PACE_WORD[pace] : "Finding you…")),
        h("div", { class: "wf-bar-fig" }, h("strong", {}, here?.heading != null ? compassPoint(here.heading) : "·"), h("small", {}, `${String(found.size).padStart(3, "0")} found`)),
        h("button", { class: "wf-bar-x", "aria-label": "Stop Guide", onclick: () => stopGuide() }, "×"));
    }
    bar.replaceChildren(...kids);
    bar.hidden = false;
  }

  function startGuide() {
    if (!navigator.geolocation) { app.toast("This device can't share where it is.", 3500); return; }
    guiding = true;
    guideButton.setAttribute("aria-pressed", "true");
    document.body.classList.add("wf-guiding");
    drawBar();
    // On a phone the map comes first while guiding: the place card folds down out of the way.
    if (innerWidth <= 820) app.sheet.el.classList.add("collapsed");
    let warned = false;
    watch = navigator.geolocation.watchPosition(onFix, (e) => {
      if (e.code === 1) { app.toast("Guide needs your location. Allow it in the browser to use Guide.", 4500); stopGuide(); return; }
      if (!here && !warned) { warned = true; app.toast("Still finding where you are…", 3500); }
    },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 });
    void (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((w) => { wake = w; }).catch(() => {});
  }
  function stopGuide() {
    guiding = false;
    guideButton.setAttribute("aria-pressed", "false");
    document.body.classList.remove("wf-guiding");
    if (watch >= 0) navigator.geolocation.clearWatch(watch);
    watch = -1;
    if (puck) { viewer.entities.remove(puck); puck = null; }
    clearTarget();
    bar.hidden = true; recentre.hidden = true; guessEl.hidden = true;
    void wake?.release().catch(() => {}); wake = null;
    gps.length = 0; here = null;
  }

  const wf: Wayfinder = {
    guideButton,
    guideTo(to: Candidate) {
      target = to; route = null; routedAt = 0;
      if (!guiding) startGuide();
      drawBar();
      void steer();
    },
  };
  current = wf;
  return wf;
}
