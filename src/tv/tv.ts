// TV mode: Terreno for a screen across the room. The panels go, the type gets big, and it plays by itself.
// A screen is for someone: a living room, a classroom, an operations room, a lobby or a meeting room. The
// first time, the TV asks what it's for (one question, remembered), and that room decides what plays by
// itself and which tools the remote reaches for:
//   Home: the Earth live, great places, markets, your place as a hologram, trips.
//   Classroom: lessons with the teacher's notes on their phone, a class quiz with the answers on the phone,
//     Where in the world?, the time machine, a pointer, spotlight and pen, and a timer the room can read.
//   Operations: every site you run with its time and weather, hazards near them, world clocks, Work tools.
//   Lobby: a welcome with the weather and time here, great places, clocks.
//   Meeting room: present from your phone, point, draw, time the meeting, search anywhere.
// A QR code pairs a phone, which becomes the remote: its orb spins the Earth, its ring moves through the
// menu, its keyboard types into the TV, its pad steers the pointer, and it hands the TV what's on the phone
// (lessons, quizzes, sites). Commands pause the playlist so whoever's driving stays in charge. Escape leaves.
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
import { TEMPLATES, deckFromJson, type Deck } from "../work/presentModel";
import { validQuiz, type Quiz } from "../work/quizModel";
import { fromQuiz, hostQuiz, starterQuiz, timeMachine, whereIn, type QuizHost } from "./classroom";
import { hostDirect, listen, newCode, remoteUrl, send, type Cmd } from "./link";
import { antiBurn, Countdown, Ink, stayAwake, type InkMode } from "./overlays";
import { allSites, joiner, menuFor, mergeSites, ROOMS, roomOf, SCENE_LABELS, TOOLS, type Room, type SceneId, type WallSite } from "./rooms";
import { activeScope, back as spatialBack, clearFocus, ensureFocus, move } from "./spatial";
import { clocksScene, hazardsScene, sitesScene, welcomeScene, type Welcome } from "./wall";

const SCENE_MS = 26_000, HOLD_MS = 60_000, LONG_HOLD = 20 * 60_000;
const ROOM_KEY = "atlas.tv.room", WELCOME_KEY = "atlas.tv.welcome";

const PLACES = [
  { name: "Mount Fuji", sub: "Japan's highest mountain, 3,776 m", lon: 138.7274, lat: 35.3606, radius: 9000 },
  { name: "Grand Canyon", sub: "1,800 m deep, cut by the Colorado over 6 million years", lon: -112.1129, lat: 36.1069, radius: 12000 },
  { name: "Machu Picchu", sub: "An Inca citadel 2,430 m up in the Andes", lon: -72.5450, lat: -13.1631, radius: 2500 },
  { name: "Venice", sub: "118 islands, 400 bridges, sinking a few millimetres a year", lon: 12.3358, lat: 45.4371, radius: 4000 },
  { name: "Mount Everest", sub: "8,849 m: the top of the world", lon: 86.9250, lat: 27.9881, radius: 14000 },
];

let active: { exit(): void } | null = null;
export const inTv = () => !!active;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const list = <T>(k: string): T[] => { try { const v = JSON.parse(read(k) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

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
  let room: Room = roomOf(read(ROOM_KEY));
  const title = h("h1", { class: "tv-title" }), sub = h("p", { class: "tv-sub" });
  const clock = h("div", { class: "tv-clock" });
  const roomChip = h("span", { class: "tv-room-chip" });
  const dots = h("div", { class: "tv-dots" });
  const link = remoteUrl(code);
  const pair = h("div", { class: "tv-pair" },
    h("div", { class: "tv-qr", html: qrSvg(link) }),
    h("div", {}, h("small", {}, "Use your phone as the remote"), h("strong", {}, code), h("small", { class: "tv-url" }, link.replace(/^https?:\/\//, "").replace(/#.*/, ""))));
  const menuEl = h("div", { class: "tv-menu", "aria-hidden": "true" });
  const searchText = h("span", { class: "tv-search-text" }), searchList = h("div", { class: "tv-search-list" });
  const searchEl = h("div", { class: "tv-search", "aria-hidden": "true" }, h("div", { class: "tv-search-bar" }, h("span", { class: "tv-search-icon" }, "⌕"), searchText, h("i", { class: "tv-caret" })), searchList);
  const chip = h("div", { class: "tv-chip" }, "📱 Remote connected");
  const board = h("aside", { class: "tv-board" }), clocksEl = h("div", { class: "tv-clocks" }), welcomeEl = h("div", { class: "tv-welcome" });
  const modeTag = h("div", { class: "tv-mode-tag" });
  const ink = new Ink(), countdown = new Countdown();
  const caption = h("div", { class: "tv-caption" }, title, sub);
  const el = h("div", { class: "tv", role: "region", "aria-label": "Terreno TV" },
    ink.el,
    h("div", { class: "tv-brand" }, "TERRENO", h("span", {}, "TV"), roomChip), clock, pair, chip,
    welcomeEl, board, clocksEl, caption, dots, countdown.el, modeTag, menuEl, searchEl);
  document.body.append(el);
  const sleepless = stayAwake(), unburn = antiBurn(el);
  const welcomeInput = h("input", { type: "text", class: "tv-hidden-input", "aria-label": "Welcome message" }) as HTMLInputElement;
  el.append(welcomeInput);

  let scene = 0, timer = 0, holdUntil = 0, spin: (() => void) | null = null, windOn = false, step = 0, stopScene: (() => void) | null = null;
  let shared: WallSite[] = [];
  const sites = () => mergeSites(allSites(read), shared);
  const playlist = (): SceneId[] => room.scenes;
  const say = (t: string, s = "") => {
    title.textContent = t; sub.textContent = s;
    caption.classList.toggle("empty", !t && !s);
    caption.classList.remove("in"); void caption.offsetWidth; caption.classList.add("in");
    send(code, "state", { t: "state", scene: playlist()[scene] ?? "", title: t || room.label, sub: s });
  };
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  tick();
  const clockTimer = window.setInterval(tick, 15_000);
  const stopSpin = () => { spin?.(); spin = null; };
  const startSpin = () => { stopSpin(); spin = viewer.scene.preRender.addEventListener(() => cam.rotate(Cartesian3.UNIT_Z, -0.00045)); };
  const setWind = (on: boolean) => { if (on !== windOn) { app.actions.get("wind:toggle")?.run(); windOn = on; } };
  const cleanScene = () => { stopScene?.(); stopScene = null; stopSpin(); closeSpace(); app.actions.get("live:planes")?.stop?.(); setWind(false); };
  const wallCtx = () => ({ app, say, board, sites: sites(), alive: () => !!active });

  /** Whether a scene has anything to show on this screen right now. */
  const playable = (id: SceneId) => id === "home" ? list<{ id: string }>("atlas.myplaces.v1").length > 0 : id === "sites" ? sites().length > 0 : true;

  function drawRoom() {
    roomChip.textContent = `${room.icon} ${room.label}`;
    dots.replaceChildren(...playlist().map((id) => h("span", { "data-id": id }, SCENE_LABELS[id])));
    menuRows = menuFor(room); focus = { r: 0, c: 0 };
    menuEl.replaceChildren(...menuRows.map((row, r) => h("div", { class: "tv-menu-row" },
      h("span", { class: "tv-menu-label" }, r === 0 ? `${room.icon} ${room.label}` : ""),
      ...row.map((m) => h("div", { class: "tv-tile", "data-id": m.id }, h("span", { class: "tv-tile-icon" }, m.icon), h("span", {}, m.label))))));
  }

  async function show(i: number, auto = false) {
    const ids = playlist();
    scene = (i + ids.length) % ids.length;
    // Playing by itself, a scene with nothing to show steps aside (no saved home, no sites yet).
    if (auto) for (let k = 0; k < ids.length && !playable(ids[scene]); k++) scene = (scene + 1) % ids.length;
    const id = ids[scene];
    dots.querySelectorAll("span").forEach((d) => d.classList.toggle("on", d.getAttribute("data-id") === id));
    cleanScene();
    runScene(id);
  }
  function runScene(id: SceneId) {
    if (id === "live") {
      cam.flyTo({ destination: Cartesian3.fromDegrees(-20 + Math.random() * 60, 25, 16_000_000), duration: 3 });
      setWind(true); app.actions.get("live:planes")?.run();
      startSpin();
      say("Right now on Earth", "Wind and every plane in the sky, live");
      void earthNow().then((lines) => { if (playlist()[scene] === "live" && lines[0]) say("Right now on Earth", lines[0].text); });
    } else if (id === "places") {
      const p = PLACES[step++ % PLACES.length];
      void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: p.radius });
      say(p.name, p.sub);
      window.setTimeout(() => { if (playlist()[scene] === "places") startSpinAround(p); }, 4500);
    } else if (id === "markets") {
      const now = new Date(), open = EXCHANGES.filter((e) => session(e, now).state === "open");
      cam.flyTo({ destination: Cartesian3.fromDegrees(open[0]?.lon ?? 0, 30, 18_000_000), duration: 3 });
      startSpin();
      say(open.length ? `${open.length} stock markets trading now` : "The world's markets are closed",
        open.length ? open.map((e) => e.city).join(" · ") : `Next to open: ${EXCHANGES.map((e) => ({ e, s: session(e, now) })).sort((a, b) => a.s.next - b.s.next)[0].e.city}`);
    } else if (id === "home") {
      const home = list<{ id: string; name: string }>("atlas.myplaces.v1")[0];
      if (!home) { say("My place", "Save your home in My Place first, then it plays here"); return; }
      app.actions.get("myplace:boot")?.run(home.id);
      say(home.name, "Home, live: the weather, the day's brief and your place in 3D");
    } else if (id === "wherein") {
      stopScene = whereIn(app, say);
    } else if (id === "sites") {
      stopScene = sitesScene(wallCtx());
    } else if (id === "hazards") {
      stopScene = hazardsScene(wallCtx());
    } else if (id === "clocks") {
      stopScene = clocksScene(wallCtx(), clocksEl);
    } else if (id === "welcome") {
      stopScene = welcomeScene(wallCtx(), welcomeEl, welcome());
    }
  }
  const welcome = (): Welcome => {
    try { const w = JSON.parse(read(WELCOME_KEY) ?? "null") as Welcome | null; if (w?.text) return w; } catch { /* first time */ }
    const home = list<{ name: string; lon: number; lat: number }>("atlas.myplaces.v1")[0];
    return { text: "Welcome", place: home ? { name: home.name, lon: home.lon, lat: home.lat } : undefined };
  };
  /** A slow circle around a place, looking down at it. */
  function startSpinAround(p: { lon: number; lat: number; radius: number }) {
    stopSpin();
    let heading = cam.heading;
    const target = Cartesian3.fromDegrees(p.lon, p.lat, 0);
    spin = viewer.scene.preRender.addEventListener(() => { heading += 0.0016; cam.lookAt(target, new HeadingPitchRange(heading, CesiumMath.toRadians(-32), p.radius * 2.2)); });
    const unlook = spin;
    spin = () => { unlook(); cam.lookAtTransform(Matrix4.IDENTITY); };
  }
  const busy = () => !!(quiz || deck || machine || chooser || ink.mode);
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (Date.now() >= holdUntil && !activeScope() && !busy()) void show(scene + 1, true); schedule(); }, SCENE_MS); };

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

  /** Tells the phone this room's tools (and what the TV itself has saved), so its palette matches the screen. */
  const sendTools = () => send(code, "state", {
    t: "tools", room: room.id, label: room.label, mode: ink.mode,
    items: room.tools.map((id) => TOOLS[id]).filter(Boolean).map(({ id, icon, label, about }) => ({ id, icon, label, about })),
    rooms: ROOMS.map(({ id, icon, label, who }) => ({ id, icon, label, who })),
    decks: list<Deck>("atlas.work.decks.v1").map((d) => ({ id: d.id, name: d.name })),
    quizzes: list<Quiz>("atlas.work.quizzes.v1").map((q) => ({ id: q.id, name: q.title })),
  });

  let menuOpen = false, focus = { r: 0, c: 0 }, menuTimer = 0, menuRows = menuFor(room);
  const drawMenu = () => {
    menuEl.classList.toggle("on", menuOpen);
    menuEl.querySelectorAll(".tv-menu-row").forEach((row, r) => row.querySelectorAll(".tv-tile").forEach((t, c) => t.classList.toggle("focus", r === focus.r && c === focus.c)));
    menuEl.querySelectorAll<HTMLElement>(".tv-tile.focus")[0]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    clearTimeout(menuTimer);
    if (menuOpen) menuTimer = window.setTimeout(() => { menuOpen = false; drawMenu(); }, 12_000);
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

  // ---- Rooms: what this screen is for ----
  let chooser: HTMLElement | null = null, chooserTimer = 0;
  function chooseRoom(first = false) {
    chooser?.remove();
    menuOpen = false; drawMenu();
    chooser = h("div", { class: "tv-sheet tv-rooms", role: "dialog", "aria-label": "What's this screen for?" },
      h("header", {}, h("h2", {}, "What's this screen for?"), h("p", {}, "Pick one and the screen sets itself up for it. You can change it any time from the menu.")),
      h("div", { class: "tv-room-grid" }, ...ROOMS.map((r) => h("button", { class: "tv-room" + (r.id === room.id && !first ? " current" : ""), onclick: () => setRoom(r.id) },
        h("span", { class: "tv-room-icon" }, r.icon), h("strong", {}, r.label), h("em", {}, r.who), h("small", {}, r.about)))),
      first ? h("p", { class: "tv-sheet-note" }, "Nobody here? In a minute it starts as Home.") : "",
      h("button", { class: "tv-sheet-x", "aria-label": "Close", onclick: () => closeChooser() }, "✕"));
    el.append(chooser);
    ensureFocus(chooser);
    clearTimeout(chooserTimer);
    if (first) chooserTimer = window.setTimeout(() => { if (chooser) setRoom("home"); }, 60_000);
  }
  const closeChooser = () => { clearTimeout(chooserTimer); chooser?.remove(); chooser = null; clearFocus(); if (!read(ROOM_KEY)) write(ROOM_KEY, room.id); };
  function setRoom(id: string) {
    room = roomOf(id);
    write(ROOM_KEY, room.id);
    closeChooser(); stopTools();
    drawRoom(); sendTools();
    holdUntil = 0;
    void show(0);
    say(`${room.icon} ${room.label}`, room.about);
  }

  // ---- Tools: lessons, quizzes, the time machine, ink, timers ----
  let quiz: QuizHost | null = null, deck: { step(dir: 1 | -1): void; close(): void } | null = null, machine: ReturnType<typeof timeMachine> | null = null, picker: HTMLElement | null = null;
  function stopTools() {
    quiz?.close(); quiz = null;
    deck?.close(); deck = null;
    machine?.close(); machine = null;
    picker?.remove(); picker = null;
    setInk(null);
  }
  function setInk(mode: InkMode | null) {
    ink.set(mode);
    modeTag.textContent = mode === "pointer" ? "🔴 Pointer" : mode === "spotlight" ? "🔦 Spotlight" : mode === "pen" ? "✎ Pen: draw on your phone" : "";
    modeTag.classList.toggle("on", !!mode);
    if (mode) stopSpin();
    sendTools();
  }
  /** A list to choose from on the TV itself (for a keyboard, or a remote's ring). */
  function pick(titleText: string, items: { label: string; sub?: string; go(): void }[]) {
    picker?.remove();
    menuOpen = false; drawMenu();
    picker = h("div", { class: "tv-sheet tv-pick", role: "dialog", "aria-label": titleText },
      h("header", {}, h("h2", {}, titleText)),
      h("div", { class: "tv-pick-list" }, ...items.map((x) => h("button", { class: "tv-pick-row", onclick: () => { picker?.remove(); picker = null; clearFocus(); x.go(); } }, h("strong", {}, x.label), x.sub ? h("small", {}, x.sub) : ""))),
      h("button", { class: "tv-sheet-x", "aria-label": "Close", onclick: () => { picker?.remove(); picker = null; clearFocus(); } }, "✕"));
    el.append(picker);
    ensureFocus(picker);
  }
  const templateDeck = (name: string): Deck | null => {
    const t = TEMPLATES.find((x) => x.name === name);
    return t ? { id: `tpl-${name}`, name: t.name, created: 0, slides: t.slides.map((s, i) => ({ ...s, id: `s${i}` })) } : null;
  };
  const deckById = (id: string) => (id.startsWith("tpl:") ? templateDeck(id.slice(4)) : list<Deck>("atlas.work.decks.v1").find((d) => d.id === id) ?? null);
  async function playDeck(d: Deck, teach: boolean) {
    stopTools(); cleanScene(); closeWork();
    holdUntil = Date.now() + LONG_HOLD;
    const pres = await import("../work/present");
    const sendSlide = (i: number) => {
      const s = d.slides[i], next = d.slides[i + 1];
      send(code, "state", { t: "present", deck: d.name, i, n: d.slides.length, title: s.title, notes: s.notes ?? "", next: next ? next.title : "" });
      say("", "");
    };
    const run = pres.play(app, d, { teach, onSlide: (_s, i) => sendSlide(i) });
    deck = run;
    void run.done.then(() => { if (deck === run) deck = null; send(code, "state", { t: "panel", kind: "none" }); holdUntil = Date.now() + HOLD_MS; say(room.label, "Back to the playlist in a minute"); });
  }
  async function startQuiz(q: { title: string; questions: ReturnType<typeof starterQuiz>["questions"]; seconds: number }) {
    stopTools(); cleanScene(); closeWork();
    holdUntil = Date.now() + LONG_HOLD;
    const pres = await import("../work/present");
    say("", "");
    // The host reports its first question as it's made, so `quiz` is set by the time anything else asks.
    let host: QuizHost | null = null;
    host = hostQuiz(app, q, {
      fly: (v) => void pres.flyToView(app, v, 2.5),
      year: (y) => void pres.showYear(app, y).catch(() => {}),
      onChange: () => { if (host && quiz === host) send(code, "state", { t: "quiz", ...host.state }); },
      onEnd: () => { if (quiz === host) quiz = null; send(code, "state", { t: "panel", kind: "none" }); holdUntil = Date.now() + HOLD_MS; },
    });
    quiz = host;
    el.append(host.el);
    send(code, "state", { t: "quiz", ...host.state });
  }
  async function startMachine() {
    stopTools(); cleanScene(); closeWork();
    holdUntil = Date.now() + LONG_HOLD;
    const pres = await import("../work/present");
    cam.flyTo({ destination: Cartesian3.fromDegrees(20, 35, 12_000_000), duration: 2.5 });
    machine = timeMachine(say, (y) => pres.showYear(app, y));
  }
  function editWelcome() {
    const w = welcome();
    welcomeInput.value = w.text;
    editing = welcomeInput;
    send(code, "state", { t: "input", kind: "text", label: "Welcome message", value: w.text });
    say("Welcome message", "Type it on your phone. Search for this screen's place first to show its weather.");
  }
  welcomeInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const here = app.place ? { name: app.place.name?.title ?? "Here", lon: app.place.lon, lat: app.place.lat } : welcome().place;
    write(WELCOME_KEY, JSON.stringify({ text: welcomeInput.value.trim() || "Welcome", place: here } satisfies Welcome));
    const i = playlist().indexOf("welcome");
    if (i >= 0) void show(i); else say(welcomeInput.value, "Saved for the lobby's welcome screen");
  });

  function activate(id: string, arg?: string) {
    menuOpen = false; drawMenu();
    if (id === "search") { openSearch(true); return; }
    if (id === "trip") { send(code, "state", { t: "form", kind: "trip" }); say("Plan a trip", "Fill it in on your phone: where, when and who"); return; }
    if (id === "trips") { showTrips(); return; }
    if (id === "room") { chooseRoom(); return; }
    if (id === "exit") { self.exit(); return; }
    if (id === "pointer" || id === "spotlight" || id === "pen") { setInk(ink.mode === id ? null : id); return; }
    if (id === "ink-clear") { ink.clear(); return; }
    if (id === "timer") {
      if (arg) { countdown.start(Number(arg)); return; }
      pick("Timer", [1, 2, 3, 5, 10, 15, 30].map((m) => ({ label: `${m} minute${m === 1 ? "" : "s"}`, go: () => countdown.start(m * 60) })).concat(countdown.running ? [{ label: "Stop the timer", go: () => countdown.start(0) }] : []));
      return;
    }
    if (id === "lesson" || id === "present") {
      const teach = id === "lesson";
      if (arg) { const d = deckById(arg); if (d) void playDeck(d, teach); return; }
      pick(teach ? "Lessons" : "Present", [
        ...list<Deck>("atlas.work.decks.v1").map((d) => ({ label: d.name, sub: `${d.slides.length} slides`, go: () => void playDeck(d, teach) })),
        ...TEMPLATES.map((t) => ({ label: t.name, sub: `Ready-made · ${t.about}`, go: () => void playDeck(templateDeck(t.name)!, teach) })),
      ]);
      return;
    }
    if (id === "quiz") {
      const saved = list<Quiz>("atlas.work.quizzes.v1").filter(validQuiz);
      if (arg) { const s = saved.find((x) => x.id === arg); const q = arg === "starter" ? starterQuiz() : s ? fromQuiz(s) : null; if (q) void startQuiz(q); return; }
      pick("Class quiz", [{ label: "Capitals and famous places", sub: "Ready-made · 8 questions, 20 seconds each", go: () => void startQuiz(starterQuiz()) },
        ...saved.map((q) => ({ label: q.title, sub: `${q.questions.length} questions`, go: () => void startQuiz(fromQuiz(q)) }))]);
      return;
    }
    if (id === "timemachine") { void startMachine(); return; }
    if (id === "welcome") { editWelcome(); return; }
    if (id === "wherein" || id === "sites" || id === "hazards" || id === "clocks") {
      stopTools(); closeWork(); holdUntil = Date.now() + HOLD_MS * 3;
      const i = playlist().indexOf(id as SceneId);
      if (i >= 0) void show(i); else { cleanScene(); runScene(id as SceneId); }
      return;
    }
    if (id !== "holo" && !id.startsWith("lens:")) { stopTools(); closeWork(); }
    if (id === "myplace") { holdUntil = Date.now() + LONG_HOLD; cleanScene(); runScene("home"); return; }
    if (id === "work") { holdUntil = Date.now() + LONG_HOLD; cleanScene(); app.actions.get("mode:work")?.run(); say("Work", "Tools for your industry, on the map"); return; }
    if (id.startsWith("scene:")) { const s = id.slice(6) as SceneId, i = playlist().indexOf(s); if (i >= 0) void show(i); else { cleanScene(); runScene(s); } return; }
    void onCmd(id.startsWith("lens:") ? { t: "lens", lens: id.slice(5) } : ({ t: id } as Cmd));
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
    holdUntil = Date.now() + LONG_HOLD;
    stopTools(); cleanScene();
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
    const trips = list<import("../work/journeyModel").Journey>("atlas.work.journeys.v1");
    const box = h("div", { class: "tv-trips" }, h("h2", {}, "🧳 My trips"));
    if (!trips.length) box.append(h("p", {}, "No trips yet. Plan one: press ☰ on the remote and choose Plan a trip."));
    for (const j of trips.slice(-8).reverse()) {
      const stops = j.steps.map((st) => (st.kind === "move" ? st.to.name : st.place.name)).filter((n, i, a) => a.indexOf(n) === i);
      box.append(h("button", { class: "tv-trip", onclick: () => { box.remove(); clearFocus(); cleanScene(); holdUntil = Date.now() + LONG_HOLD; void import("../travel/playTrip").then((m) => m.playTrip(app, j)); } },
        h("strong", {}, j.name), h("small", {}, `${j.start} · from ${j.origin?.name ?? "home"} · ${stops.join(" → ")}`), h("span", {}, "▶ Play")));
    }
    el.append(box);
    menuOpen = false; drawMenu();
    ensureFocus(box);
  }
  // Steps of a playing trip (or anything else that captions itself) become the TV's big titles.
  const onCaption = (e: Event) => { e.preventDefault(); const d = (e as CustomEvent<{ title: string; sub: string }>).detail; say(d.title, d.sub); };
  window.addEventListener("atlas:caption", onCaption);

  const join = joiner();
  /** Something the phone handed over from its own Terreno. */
  function take(kind: "sites" | "deck" | "quiz", data: unknown) {
    if (kind === "sites" && Array.isArray(data)) {
      shared = mergeSites(shared, (data as WallSite[]).filter((s) => s && typeof s.name === "string" && Number.isFinite(s.lon) && Number.isFinite(s.lat)).slice(0, 80));
      activate("sites");
    } else if (kind === "deck") {
      const d = deckFromJson(data, () => Math.random().toString(36).slice(2, 10));
      if (d) void playDeck(d, room.id === "classroom"); else say("That lesson couldn't be read", "Try opening it on the phone and sending it again");
    } else if (kind === "quiz") {
      if (validQuiz(data)) void startQuiz(fromQuiz(data)); else say("That quiz couldn't be read", "Try opening it on the phone and sending it again");
    }
  }

  const onCmd = async (c: Cmd) => {
    heard();
    if (c.t === "ping") return;
    if (c.t === "rtc-offer") { closeDirect?.(); closeDirect = hostDirect(code, c.sdp, (m) => void onCmd(m)); return; }
    if (c.t === "part") { const whole = join(c.key, c.i, c.n, c.data); if (whole) { try { void onCmd(JSON.parse(whole) as Cmd); } catch { /* garbled */ } } return; }
    holdUntil = Math.max(holdUntil, Date.now() + HOLD_MS);
    const sheet = chooser ?? picker;
    switch (c.t) {
      case "hello":
        send(code, "state", { t: "state", scene: playlist()[scene] ?? "", title: title.textContent || room.label, sub: sub.textContent ?? "" });
        sendTools();
        if (quiz) send(code, "state", { t: "quiz", ...quiz.state });
        return;
      case "pan": if (ink.mode) return; pan(c.dx, c.dy); return;
      case "zoom": zoomBy(c.f); return;
      case "point": ink.move(c.x, c.y, c.down); return;
      case "point-end": ink.lift(); return;
      case "dpad": {
        if (searchOpen) { if (hits.length) { pickAt = (pickAt + (c.dir === "down" ? 1 : c.dir === "up" ? -1 : 0) + hits.length) % hits.length; drawSearch(); } return; }
        if (menuOpen) {
          if (c.dir === "left" || c.dir === "right") { const row = menuRows[focus.r]; focus.c = (focus.c + (c.dir === "right" ? 1 : -1) + row.length) % row.length; }
          else if (c.dir === "up") focus = { r: Math.max(0, focus.r - 1), c: 0 };
          else if (focus.r < menuRows.length - 1) focus = { r: focus.r + 1, c: 0 };
          else menuOpen = false;
          drawMenu(); return;
        }
        if (sheet) { move(sheet, c.dir); return; }
        if (quiz) { if (c.dir === "right") quiz.go(1); else if (c.dir === "left") quiz.go(-1); return; }
        if (deck) { if (c.dir === "right" || c.dir === "down") deck.step(1); else deck.step(-1); return; }
        if (machine) { if (c.dir === "right" || c.dir === "up") machine.step(1); else machine.step(-1); return; }
        const scope = activeScope();
        if (scope) { move(scope, c.dir); return; }
        menuOpen = true; drawMenu(); return;
      }
      case "menu": menuOpen = !menuOpen; if (searchOpen) openSearch(false); drawMenu(); return;
      case "select": {
        if (searchOpen) { const x = hits[pickAt]; if (x) void flyTo(x.name, x); else if (query) void flyTo(query); return; }
        if (menuOpen) { const m = menuRows[focus.r]?.[focus.c]; if (m) activate(m.id); return; }
        if (sheet) { pressFocused(sheet); return; }
        if (quiz) { quiz.press(); return; }
        if (deck) { deck.step(1); return; }
        const scope = activeScope();
        if (scope) { pressFocused(scope); return; }
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
        if (chooser) { closeChooser(); return; }
        if (picker) { picker.remove(); picker = null; clearFocus(); return; }
        if (ink.mode) { setInk(null); return; }
        if (quiz) { quiz.close(); return; }
        if (deck) { deck.close(); return; }
        if (machine) { machine.close(); machine = null; say(room.label, ""); return; }
        { const scope = activeScope(); if (scope?.classList.contains("tv-trips")) { scope.remove(); clearFocus(); return; } if (scope && spatialBack(scope)) return; }
        app.actions.get("lens:close")?.run(); closeSpace(); return;
      case "search": openSearch(c.open); return;
      case "type":
        if (!searchOpen) openSearch(true);
        query = c.q; pickAt = 0;
        hits = query.trim().length >= 2 ? searchPlaces(query, 5).map((x) => ({ name: x.name, detail: x.detail, lon: x.lon, lat: x.lat, radius: x.radius })) : [];
        drawSearch(); return;
      case "pick": { const x = hits[c.i]; if (x) void flyTo(x.name, x); return; }
      case "next": stopTools(); void show(scene + 1, true); return;
      case "scene": { const i = playlist().indexOf(c.scene as SceneId); if (i >= 0) void show(i); else activate(`scene:${c.scene}`); return; }
      case "room": setRoom(c.room); return;
      case "tool": activate(c.tool, c.arg); return;
      case "timer": countdown.start(c.seconds); return;
      case "slide": deck?.step(c.dir); return;
      case "quiz":
        if (!quiz) return;
        if (c.act === "reveal") quiz.reveal(); else if (c.act === "next") quiz.go(1); else if (c.act === "prev") quiz.go(-1); else quiz.close();
        return;
      case "share": take(c.kind, c.data); return;
      case "exit": self.exit(); return;
      case "wind": setWind(!windOn); say(windOn ? "Wind on" : "Wind off", "The wind now, over the whole view"); return;
      case "fly": void flyTo(c.q); return;
      case "lens": stopSpin(); app.actions.get(`lens:${c.lens}`)?.run(); say(title.textContent ?? "", ({ slice: "Cut open: the rock layers inside", block: "Lifted out as a 3D block", day: "A day passing, with its real shadows" } as Record<string, string>)[c.lens] ?? ""); return;
      case "holo": stopSpin(); app.actions.get("space:boot")?.run(); say(title.textContent ?? "", "As a hologram"); return;
    }
  };
  const unlisten = listen<Cmd>(code, "cmd", (c) => void onCmd(c));
  // A keyboard works too (a laptop on HDMI): arrows move, Enter picks, M opens the menu, Escape goes back or leaves.
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.tagName === "INPUT" && e.target !== document.body) return;
    if (document.body.classList.contains("presenting") && deck && /^Arrow|^Page| /.test(e.key)) return; // the deck's own keys
    if (e.key === "Escape") { if (menuOpen || searchOpen || chooser || picker || quiz || deck || machine || ink.mode) void onCmd({ t: "back" }); else self.exit(); return; }
    if (e.key === "m" || e.key === "M") { void onCmd({ t: "menu" }); return; }
    const dir = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const)[e.key as "ArrowUp"];
    if (dir) { e.preventDefault(); void onCmd({ t: "dpad", dir }); } else if (e.key === "Enter") void onCmd({ t: "select" });
  };
  addEventListener("keydown", keys);
  // A mouse on a laptop: the pointer follows it while a pointer tool is on.
  const mouse = (e: PointerEvent) => { if (ink.mode && ink.mode !== "pen") ink.move(e.clientX / innerWidth, e.clientY / innerHeight); };
  addEventListener("pointermove", mouse);

  const self = {
    exit() {
      clearTimeout(timer); clearInterval(clockTimer); clearInterval(quietTimer); clearInterval(focusTimer); clearTimeout(chooserTimer); unlisten(); closeDirect?.();
      removeEventListener("keydown", keys); removeEventListener("pointermove", mouse);
      window.removeEventListener("atlas:caption", onCaption); clearFocus();
      stopTools(); cleanScene(); app.actions.get("lens:close")?.run();
      ink.dispose(); countdown.dispose(); sleepless(); unburn();
      el.remove(); document.body.classList.remove("tv-mode");
      if (location.hash.startsWith("#/tv")) history.replaceState(null, "", location.pathname + location.search);
      active = null;
    },
  };
  active = self;
  drawRoom();
  if (read(ROOM_KEY)) { void show(0); say(`${room.icon} ${room.label}`, room.about); } else { void show(0); chooseRoom(true); }
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
