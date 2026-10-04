// TV mode: Terreno for a screen across the room. The panels go, the type gets
// big, and it plays by itself: the Earth live (wind and planes moving), a run
// of great places, the world's markets, and your own place as a hologram. A
// QR code in the corner pairs a phone, then steps aside. The phone is a
// controller: its orb spins the Earth (drag), zooms (pinch) and picks what's in
// the middle (tap); its ring moves through an on-screen menu; its keyboard
// types into a big search bar on the TV with suggestions as you go. Commands
// pause the playlist for a minute so the person driving stays in charge.
// Escape (or Exit on the remote) leaves.
import { Cartesian2, Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4 } from "cesium";
import { wake } from "../globe/motion";
import qrcode from "qrcode-generator";
import type { App } from "../app";
import { closeSpace } from "../delight/spaces";
import { earthNow } from "../delight/pulse";
import { EXCHANGES, session } from "../finance/model";
import { h } from "../ui/dom";
import { searchPlaces } from "../place/places";
import { flyToPlace, geocode } from "../ui/search";
import { hostDirect, listen, newCode, remoteUrl, send, type Cmd } from "./link";
import { activeScope, back as spatialBack, clearFocus, ensureFocus, move } from "./spatial";

/** The on-screen menu the remote's ring moves through. */
const MENU: { id: string; icon: string; label: string }[] = [
  { id: "search", icon: "⌕", label: "Search" },
  { id: "trip", icon: "✈️", label: "Plan a trip" },
  { id: "trips", icon: "🧳", label: "My trips" },
  { id: "myplace", icon: "🏠", label: "My place" },
  { id: "work", icon: "💼", label: "Work" },
  { id: "scene:live", icon: "🌍", label: "Live Earth" },
  { id: "scene:places", icon: "🏔", label: "Great places" },
  { id: "scene:markets", icon: "📈", label: "Markets" },
  { id: "lens:slice", icon: "⛰", label: "Cut open" },
  { id: "lens:block", icon: "🧊", label: "3D block" },
  { id: "lens:day", icon: "☀️", label: "A day" },
  { id: "holo", icon: "◎", label: "Hologram" },
  { id: "wind", icon: "💨", label: "Wind" },
  { id: "exit", icon: "⏻", label: "Exit" },
];

const SCENE_MS = 26_000, HOLD_MS = 60_000;
export const SCENES = [
  { id: "live", label: "Live Earth" },
  { id: "places", label: "Great places" },
  { id: "markets", label: "Markets" },
  { id: "home", label: "Home" },
] as const;

const PLACES = [
  { name: "Mount Fuji", sub: "Japan's highest mountain, 3,776 m", lon: 138.7274, lat: 35.3606, radius: 9000 },
  { name: "Grand Canyon", sub: "1,800 m deep, cut by the Colorado over 6 million years", lon: -112.1129, lat: 36.1069, radius: 12000 },
  { name: "Machu Picchu", sub: "An Inca citadel 2,430 m up in the Andes", lon: -72.5450, lat: -13.1631, radius: 2500 },
  { name: "Venice", sub: "118 islands, 400 bridges, sinking a few millimetres a year", lon: 12.3358, lat: 45.4371, radius: 4000 },
  { name: "Mount Everest", sub: "8,849 m: the top of the world", lon: 86.9250, lat: 27.9881, radius: 14000 },
];

let active: { exit(): void } | null = null;
export const inTv = () => !!active;

/** The QR code for a link, as an SVG string. */
function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function enterTv(app: App, given?: string) {
  if (active) return active;
  const code = given || newCode();
  const viewer = app.globe.viewer, cam = viewer.camera;
  document.body.classList.add("tv-mode");
  const title = h("h1", { class: "tv-title" }), sub = h("p", { class: "tv-sub" });
  const clock = h("div", { class: "tv-clock" });
  const dots = h("div", { class: "tv-dots" }, ...SCENES.map((s) => h("span", { "data-id": s.id }, s.label)));
  const link = remoteUrl(code);
  const pair = h("div", { class: "tv-pair" },
    h("div", { class: "tv-qr", html: qrSvg(link) }),
    h("div", {}, h("small", {}, "Use your phone as the remote"), h("strong", {}, code), h("small", { class: "tv-url" }, link.replace(/^https?:\/\//, "").replace(/#.*/, ""))));
  const menuEl = h("div", { class: "tv-menu", "aria-hidden": "true" }, ...MENU.map((m) => h("div", { class: "tv-tile", "data-id": m.id }, h("span", { class: "tv-tile-icon" }, m.icon), h("span", {}, m.label))));
  const searchText = h("span", { class: "tv-search-text" }), searchList = h("div", { class: "tv-search-list" });
  const searchEl = h("div", { class: "tv-search", "aria-hidden": "true" }, h("div", { class: "tv-search-bar" }, h("span", { class: "tv-search-icon" }, "⌕"), searchText, h("i", { class: "tv-caret" })), searchList);
  const chip = h("div", { class: "tv-chip" }, "📱 Remote connected");
  const el = h("div", { class: "tv", role: "region", "aria-label": "Terreno TV" },
    h("div", { class: "tv-brand" }, "TERRENO", h("span", {}, "TV")), clock, pair, chip,
    h("div", { class: "tv-caption" }, title, sub), dots, menuEl, searchEl);
  document.body.append(el);

  let scene = 0, timer = 0, holdUntil = 0, spin: (() => void) | null = null, windOn = false, step = 0;
  const say = (t: string, s = "") => {
    title.textContent = t; sub.textContent = s;
    el.querySelector(".tv-caption")!.classList.remove("in"); void (el.querySelector(".tv-caption") as HTMLElement).offsetWidth; el.querySelector(".tv-caption")!.classList.add("in");
    send(code, "state", { t: "state", scene: SCENES[scene].id, title: t, sub: s });
  };
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  tick();
  const clockTimer = window.setInterval(tick, 15_000);
  const stopSpin = () => { spin?.(); spin = null; };
  const startSpin = () => { stopSpin(); spin = viewer.scene.preRender.addEventListener(() => cam.rotate(Cartesian3.UNIT_Z, -0.00045)); };
  const setWind = (on: boolean) => { if (on !== windOn) { app.actions.get("wind:toggle")?.run(); windOn = on; } };
  const cleanScene = () => { stopSpin(); closeSpace(); app.actions.get("live:planes")?.stop?.(); setWind(false); };

  async function show(i: number) {
    scene = (i + SCENES.length) % SCENES.length;
    dots.querySelectorAll("span").forEach((d) => d.classList.toggle("on", d.getAttribute("data-id") === SCENES[scene].id));
    cleanScene();
    const id = SCENES[scene].id;
    if (id === "live") {
      cam.flyTo({ destination: Cartesian3.fromDegrees(-20 + Math.random() * 60, 25, 16_000_000), duration: 3 });
      setWind(true); app.actions.get("live:planes")?.run();
      startSpin();
      say("Right now on Earth", "Wind and every plane in the sky, live");
      void earthNow().then((lines) => { if (SCENES[scene].id === "live" && lines[0]) say("Right now on Earth", lines[0].text); });
    } else if (id === "places") {
      const p = PLACES[step++ % PLACES.length];
      void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: p.radius });
      say(p.name, p.sub);
      window.setTimeout(() => { if (SCENES[scene].id === "places") startSpinAround(p); }, 4500);
    } else if (id === "markets") {
      const now = new Date(), open = EXCHANGES.filter((e) => session(e, now).state === "open");
      cam.flyTo({ destination: Cartesian3.fromDegrees(open[0]?.lon ?? 0, 30, 18_000_000), duration: 3 });
      startSpin();
      say(open.length ? `${open.length} stock markets trading now` : "The world's markets are closed",
        open.length ? open.map((e) => e.city).join(" · ") : `Next to open: ${EXCHANGES.map((e) => ({ e, s: session(e, now) })).sort((a, b) => a.s.next - b.s.next)[0].e.city}`);
    } else {
      const home = (() => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { id: string; name: string }[])[0]; } catch { return undefined; } })();
      if (!home) { void show(scene + 1); return; }
      app.actions.get("myplace:boot")?.run(home.id);
      say(home.name, "Home, live: the weather, the day's brief and your place in 3D");
    }
  }
  /** A slow circle around a place, looking down at it. */
  function startSpinAround(p: { lon: number; lat: number; radius: number }) {
    stopSpin();
    let heading = cam.heading;
    const target = Cartesian3.fromDegrees(p.lon, p.lat, 0);
    spin = viewer.scene.preRender.addEventListener(() => { heading += 0.0016; cam.lookAt(target, new HeadingPitchRange(heading, CesiumMath.toRadians(-32), p.radius * 2.2)); });
    const unlook = spin;
    spin = () => { unlook(); cam.lookAtTransform(Matrix4.IDENTITY); };
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (Date.now() >= holdUntil && !activeScope()) void show(scene + 1); schedule(); }, SCENE_MS); };

  // ---- The remote: paired, then steering ----
  let connected = false, lastHeard = 0, chipTimer = 0, closeDirect: (() => void) | null = null;
  const heard = () => {
    lastHeard = Date.now();
    if (connected) return;
    connected = true;
    pair.classList.add("gone");
    chip.classList.add("on"); clearTimeout(chipTimer); chipTimer = window.setTimeout(() => chip.classList.remove("on"), 3200);
  };
  // A remote gone quiet for a while: show the code again for the next one.
  const quietTimer = window.setInterval(() => { if (connected && Date.now() - lastHeard > 75_000) { connected = false; pair.classList.remove("gone"); } }, 10_000);

  let menuOpen = false, focus = 0, menuTimer = 0;
  const drawMenu = () => {
    menuEl.classList.toggle("on", menuOpen);
    menuEl.querySelectorAll(".tv-tile").forEach((t, i) => t.classList.toggle("focus", i === focus));
    (menuEl.children[focus] as HTMLElement | undefined)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    clearTimeout(menuTimer);
    if (menuOpen) menuTimer = window.setTimeout(() => { menuOpen = false; drawMenu(); }, 9000);
  };
  // While a phone is driving, whatever screen opens (a Work panel, the hologram, a lens) gets the focus ring at once.
  const focusTimer = window.setInterval(() => { if (!connected || menuOpen || searchOpen) return; const s = activeScope(); if (s) ensureFocus(s); }, 700);
  /** Puts away open Work panels and the trips shelf, so a new scene starts clean. */
  const closeWork = () => {
    document.querySelector(".tv-trips")?.remove();
    void import("../travel/playTrip").then((m) => m.clearTrip());
    document.querySelectorAll<HTMLElement>(".work-panel:not([hidden]) button[aria-label='Close']").forEach((b) => b.click());
    clearFocus();
  };
  let searchOpen = false, query = "", hits: { name: string; detail: string; lon: number; lat: number; radius: number }[] = [], pickAt = 0;
  const drawSearch = () => {
    searchEl.classList.toggle("on", searchOpen);
    searchText.textContent = query || "Type on your phone…";
    searchText.classList.toggle("empty", !query);
    searchList.replaceChildren(...hits.map((x, i) => h("div", { class: "tv-hit" + (i === pickAt ? " focus" : "") }, h("strong", {}, x.name), h("small", {}, x.detail))));
    if (searchOpen) send(code, "state", { t: "suggest", q: query, items: hits.map((x) => x.name), focus: pickAt });
  };
  const openSearch = (open: boolean) => { searchOpen = open; if (open) { menuOpen = false; drawMenu(); query = ""; hits = []; pickAt = 0; } drawSearch(); };

  async function flyTo(q: string, hit?: { name: string; detail: string; lon: number; lat: number; radius: number }) {
    cleanScene();
    openSearch(false);
    say(`Finding ${q}…`);
    // Terreno's own named places first (mountains, rivers, cities, landmarks), then any address.
    const local = hit ?? searchPlaces(q, 1)[0];
    const r = local ? { name: local.name, detail: local.detail, lon: local.lon, lat: local.lat, radius: local.radius } : (await geocode(q, null).catch(() => []))[0];
    if (!r) { say(`Couldn't find ${q}`); return; }
    app.select({ lon: r.lon, lat: r.lat, height: 0 }, { title: r.name, context: r.detail ?? "" });
    void flyToPlace(app.globe, { name: r.name, lon: r.lon, lat: r.lat, radius: r.radius || 6000 });
    say(r.name, r.detail ?? "");
  }
  /** Whatever is in the middle of the screen becomes the chosen place, and the camera leans in. */
  function chooseMiddle() {
    stopSpin();
    const c = viewer.canvas, p = app.globe.pick(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
    if (!p) return;
    app.select(p);
    zoomBy(1.8);
    say("Here", `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? "N" : "S"}, ${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? "E" : "W"}`);
    window.setTimeout(() => { const t = app.place?.name?.title; if (t) say(t, app.place?.name?.context ?? ""); }, 1800);
  }
  function activate(id: string) {
    menuOpen = false; drawMenu();
    if (id === "search") { openSearch(true); return; }
    if (id === "trip") { send(code, "state", { t: "form", kind: "trip" }); say("Plan a trip", "Fill it in on your phone: where, when and who"); return; }
    if (id === "trips") { showTrips(); return; }
    if (id !== "trip" && id !== "holo" && !id.startsWith("lens:")) closeWork();
    if (id === "myplace") { holdUntil = Date.now() + 20 * 60_000; const i = SCENES.findIndex((x) => x.id === "home"); void show(i); return; }
    if (id === "work") { holdUntil = Date.now() + 20 * 60_000; cleanScene(); app.actions.get("mode:work")?.run(); say("Work", "Tools for your industry, on the map"); return; }
    if (id.startsWith("scene:")) { const i = SCENES.findIndex((x) => x.id === id.slice(6)); if (i >= 0) void show(i); return; }
    void onCmd(id.startsWith("lens:") ? { t: "lens", id: id.slice(5) } : ({ t: id } as Cmd));
  }
  /** The orb: drag spins the Earth under you, at a pace that suits the height. */
  function pan(dx: number, dy: number) {
    stopSpin();
    const k = Math.min(0.9, (cam.positionCartographic.height / 6.371e6) * 0.75 + 0.0002);
    cam.rotateLeft(dx * k);
    cam.rotateDown(dy * k);
    wake(800);
  }
  function zoomBy(f: number) {
    stopSpin();
    const hgt = cam.positionCartographic.height, target = Math.min(30_000_000, Math.max(250, hgt / f));
    if (target < hgt) cam.zoomIn(hgt - target); else cam.zoomOut(target - hgt);
    wake(800);
  }

  // ---- Driving Terreno's own screens: press, type into fields, plan and play trips ----
  let editing: HTMLInputElement | HTMLTextAreaElement | null = null;
  function pressFocused(scope: HTMLElement) {
    const el = ensureFocus(scope);
    if (!el) return;
    if (el instanceof HTMLInputElement && /^(text|search|date|number|time|email|url|tel|)$/.test(el.type) || el instanceof HTMLTextAreaElement) {
      editing = el;
      const kind = el instanceof HTMLInputElement && /^(date|number|time)$/.test(el.type) ? (el.type as "date" | "number" | "time") : "text";
      const label = el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? "Type";
      send(code, "state", { t: "input", kind, label, value: el.value });
      return;
    }
    if (el instanceof HTMLSelectElement) { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event("change", { bubbles: true })); return; }
    el.click();
    // The screen may have changed under the focus: find a new spot a moment later.
    window.setTimeout(() => { const s2 = activeScope(); if (s2) ensureFocus(s2); }, 450);
  }
  async function planTrip(c: Extract<Cmd, { t: "trip" }>) {
    holdUntil = Date.now() + 20 * 60_000;
    cleanScene();
    say(`Planning ${c.to}…`, "The way there, the time change, the weather and where to stay");
    const find = async (q: string) => { const l = searchPlaces(q, 1)[0]; if (l) return { name: l.name, lon: l.lon, lat: l.lat }; const g = (await geocode(q, null).catch(() => []))[0]; return g ? { name: g.name, lon: g.lon, lat: g.lat } : null; };
    const to = await find(c.to);
    if (!to) { say(`Couldn't find ${c.to}`); return; }
    const from = c.from ? await find(c.from) : null;
    app.actions.get("travel:plan")?.run(JSON.stringify({ to, from: from ?? undefined, depart: c.depart, back: c.back, people: c.people }));
    say(to.name, "Use the ring to look through the plan; ▶ Play the trip flies it");
  }
  /** Your saved trips as big cards; pick one and it plays on the globe. */
  function showTrips() {
    document.querySelector(".tv-trips")?.remove();
    const trips = (() => { try { return JSON.parse(localStorage.getItem("atlas.work.journeys.v1") ?? "[]") as import("../work/journeyModel").Journey[]; } catch { return []; } })();
    const box = h("div", { class: "tv-trips" }, h("h2", {}, "🧳 My trips"));
    if (!trips.length) box.append(h("p", {}, "No trips yet. Plan one: press ☰ on the remote and choose Plan a trip."));
    for (const j of trips.slice(-8).reverse()) {
      const stops = j.steps.map((st) => (st.kind === "move" ? st.to.name : st.place.name)).filter((n, i, a) => a.indexOf(n) === i);
      box.append(h("button", { class: "tv-trip", onclick: () => { box.remove(); clearFocus(); cleanScene(); holdUntil = Date.now() + 20 * 60_000; void import("../travel/playTrip").then((m) => m.playTrip(app, j)); } },
        h("strong", {}, j.name), h("small", {}, `${j.start} · from ${j.origin?.name ?? "home"} · ${stops.join(" → ")}`), h("span", {}, "▶ Play")));
    }
    el.append(box);
    menuOpen = false; drawMenu();
    ensureFocus(box);
  }
  // Steps of a playing trip (or anything else that captions itself) become the TV's big titles.
  const onCaption = (e: Event) => { e.preventDefault(); const d = (e as CustomEvent<{ title: string; sub: string }>).detail; say(d.title, d.sub); };
  window.addEventListener("atlas:caption", onCaption);

  const onCmd = async (c: Cmd) => {
    heard();
    if (c.t === "ping") return;
    if (c.t === "rtc-offer") { closeDirect?.(); closeDirect = hostDirect(code, c.sdp, (m) => void onCmd(m)); return; }
    holdUntil = Date.now() + HOLD_MS;
    switch (c.t) {
      case "hello": send(code, "state", { t: "state", scene: SCENES[scene].id, title: title.textContent ?? "", sub: sub.textContent ?? "" }); return;
      case "pan": pan(c.dx, c.dy); return;
      case "zoom": zoomBy(c.f); return;
      case "dpad": {
        const scope = !menuOpen && !searchOpen ? activeScope() : null;
        if (scope) { move(scope, c.dir); return; }
        if (searchOpen) { if (hits.length) { pickAt = (pickAt + (c.dir === "down" ? 1 : c.dir === "up" ? -1 : 0) + hits.length) % hits.length; drawSearch(); } return; }
        if (!menuOpen) { menuOpen = true; drawMenu(); return; }
        if (c.dir === "left" || c.dir === "right") { focus = (focus + (c.dir === "right" ? 1 : -1) + MENU.length) % MENU.length; drawMenu(); }
        else if (c.dir === "down") { menuOpen = false; drawMenu(); }
        return;
      }
      case "menu": menuOpen = !menuOpen; if (searchOpen) openSearch(false); drawMenu(); return;
      case "select": {
        const scope = !menuOpen && !searchOpen ? activeScope() : null;
        if (scope) { pressFocused(scope); return; }
        if (searchOpen) { const x = hits[pickAt]; if (x) void flyTo(x.name, x); else if (query) void flyTo(query); return; }
        if (menuOpen) { activate(MENU[focus].id); return; }
        chooseMiddle(); return;
      }
      case "set": {
        const el = editing;
        if (!el || !el.isConnected) return;
        el.value = c.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (c.done) { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); editing = null; }
        return;
      }
      case "trip": void planTrip(c); return;
      case "back":
        if (searchOpen) { openSearch(false); return; }
        if (menuOpen) { menuOpen = false; drawMenu(); return; }
        { const scope = activeScope(); if (scope?.classList.contains("tv-trips")) { scope.remove(); clearFocus(); return; } if (scope && spatialBack(scope)) return; }
        app.actions.get("lens:close")?.run(); closeSpace(); return;
      case "search": openSearch(c.open); return;
      case "type":
        if (!searchOpen) openSearch(true);
        query = c.q; pickAt = 0;
        hits = query.trim().length >= 2 ? searchPlaces(query, 5).map((x) => ({ name: x.name, detail: x.detail, lon: x.lon, lat: x.lat, radius: x.radius })) : [];
        drawSearch(); return;
      case "pick": { const x = hits[c.i]; if (x) void flyTo(x.name, x); return; }
      case "next": void show(scene + 1); return;
      case "scene": { const i = SCENES.findIndex((x) => x.id === c.id); if (i >= 0) void show(i); return; }
      case "exit": self.exit(); return;
      case "wind": setWind(!windOn); say(windOn ? "Wind on" : "Wind off", "The wind now, over the whole view"); return;
      case "fly": void flyTo(c.q); return;
      case "lens": stopSpin(); app.actions.get(`lens:${c.id}`)?.run(); say(title.textContent ?? "", ({ slice: "Cut open: the rock layers inside", block: "Lifted out as a 3D block", day: "A day passing, with its real shadows" } as Record<string, string>)[c.id] ?? ""); return;
      case "holo": stopSpin(); app.actions.get("space:boot")?.run(); say(title.textContent ?? "", "As a hologram"); return;
    }
  };
  const unlisten = listen<Cmd>(code, "cmd", (c) => void onCmd(c));
  // A keyboard works too (a laptop on HDMI): arrows move, Enter picks, Escape leaves.
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") { if (menuOpen || searchOpen) void onCmd({ t: "back" }); else self.exit(); return; }
    const dir = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const)[e.key as "ArrowUp"];
    if (dir) { e.preventDefault(); void onCmd({ t: "dpad", dir }); } else if (e.key === "Enter") void onCmd({ t: "select" });
  };
  addEventListener("keydown", keys);

  const self = {
    exit() {
      clearTimeout(timer); clearInterval(clockTimer); clearInterval(quietTimer); clearInterval(focusTimer); unlisten(); closeDirect?.(); removeEventListener("keydown", keys);
      window.removeEventListener("atlas:caption", onCaption); clearFocus();
      cleanScene(); app.actions.get("lens:close")?.run();
      el.remove(); document.body.classList.remove("tv-mode");
      if (location.hash.startsWith("#/tv")) history.replaceState(null, "", location.pathname + location.search);
      active = null;
    },
  };
  active = self;
  void show(0);
  schedule();
  return self;
}

/** Cast: put Terreno on the TV so that the phone stays free to be the remote. */
export function openCast(app: App) {
  document.querySelector(".cast-sheet")?.remove();
  const code = newCode();
  const base = location.href.replace(/#.*$/, "");
  const tvLink = new URL(`#/tv/${code}`, base).href, shortTv = new URL("tv/", base).href.replace(/^https?:\/\//, "");
  const close = () => sheet.remove();
  const canPresent = typeof (window as unknown as { PresentationRequest?: unknown }).PresentationRequest === "function";
  const phone = matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 600;
  const status = h("p", { class: "muted small" });
  const codeBox = h("input", { class: "pro-url cast-code", placeholder: "Code on the TV", maxlength: "6", autocapitalize: "characters", "aria-label": "Code on the TV" }) as HTMLInputElement;
  const toRemote = (c: string) => { location.href = remoteUrl(c); };
  const sheet = h("div", { class: "cast-sheet", role: "dialog", "aria-label": "Show Terreno on a TV" },
    h("button", { class: "cast-x", "aria-label": "Close", onclick: close }, "✕"),
    h("h2", {}, "📺 Terreno on a TV"),
    h("p", { class: "muted" }, "The TV runs Terreno on its own and your phone becomes the controller: spin the Earth, zoom, search, open lenses."),
    canPresent ? h("div", { class: "cast-step" },
      h("strong", {}, "Cast it"),
      h("p", {}, "Pick a Chromecast or Google TV. The TV loads Terreno by itself and this screen turns into the remote."),
      h("button", { class: "primary-btn", onclick: async () => {
        try {
          const Req = (window as unknown as { PresentationRequest: new (urls: string[]) => { start(): Promise<unknown> } }).PresentationRequest;
          await new Req([tvLink]).start();
          status.textContent = "On the TV. Opening the remote…";
          window.setTimeout(() => toRemote(code), 900);
        } catch { status.textContent = "No TV picked, or this TV can only mirror. Use one of the ways below."; }
      } }, "Cast to a TV")) : "",
    h("div", { class: "cast-step" },
      h("strong", {}, canPresent ? "Or open it on the TV" : "Open it on the TV"),
      h("p", {}, "On the TV's web browser, or a laptop plugged into the TV, go to ", h("code", {}, shortTv), ". Then scan its code with your phone, or type it here:"),
      h("div", { class: "build-log-form" }, codeBox, h("button", { class: "pill-btn", onclick: () => { const c = codeBox.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (c.length === 6) toRemote(c); else status.textContent = "The code on the TV has six letters and numbers."; } }, "Be the remote"))),
    phone ? h("p", { class: "cast-note" }, "Mirroring (AirPlay, Screen Mirroring, Cast screen) shows this phone's own screen on the TV, so it can't be the remote at the same time. Use it to show things off; for the controller, the TV needs to run Terreno itself.") : "",
    h("div", { class: "cast-options" },
      phone ? "" : h("button", { class: "pill-btn", onclick: () => { close(); enterTv(app, code); } }, "TV mode on this screen"),
      phone ? "" : h("a", { class: "pill-btn", href: remoteUrl(code), target: "_blank", rel: "noopener" }, "Open its remote")),
    status);
  document.body.append(sheet);
}
