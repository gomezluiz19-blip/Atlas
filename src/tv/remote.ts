// The phone remote for Terreno TV, a controller rather than a list of buttons.
//   The deck: a big rounded square with a trackball orb inside it. The orb is a
//     wireframe globe that rolls under your thumb in any direction while the
//     Earth on the TV turns with it; flick and it coasts, pinch to zoom, tap to
//     pick what's in the middle, double-tap to dive in, hold for the menu.
//     The square's four edges are up, down, left, right through the TV's menu.
//   Keys down both sides: back, menu, zoom; search, voice, OK, next.
//   Search: the orb gives way to a search bar and the keyboard; what you type
//     appears big on the TV letter by letter, with suggestions on both.
//   Voice: say where to go; the TV shows your words as you speak them.
// A page of its own (no globe), so it opens instantly on a phone.
import "./remote.css";
import { TEMPLATES } from "../work/presentModel";
import { validQuiz } from "../work/quizModel";
import { cleanCode, joinTv, type Cmd, type State, type ToolItem } from "./link";
import { edgeDir, IDENTITY, sphereLines, turn, type M3 } from "./orbGrid";
import { allSites, clockText } from "./rooms";
import { formatHash } from "../data/locationParse";
import { installEmojiGuard } from "../ui/noEmoji";
import { markSvg } from "../ui/brand";

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
const root = document.getElementById("remote")!;

function pairScreen(note = "") {
  const input = $("input", { inputmode: "text", autocapitalize: "characters", autocomplete: "off", maxlength: "6", placeholder: "••••••", "aria-label": "Code on the TV" }) as HTMLInputElement;
  const go = $("button", { class: "r-primary" }, "Connect");
  const connect = () => { const c = cleanCode(input.value); if (c.length === 6) { location.hash = c; start(c); } else input.classList.add("shake"); };
  go.addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  input.addEventListener("animationend", () => input.classList.remove("shake"));
  root.replaceChildren($("div", { class: "r-pair" },
    (() => { const m = $("div", { class: "r-mark" }); m.innerHTML = markSvg({ size: 76, background: null, grout: "#141613" }); return m; })(),
    $("div", { class: "r-brand" }, "TERRENO", $("span", {}, "Remote")),
    $("p", {}, "Scan the code on the TV with your camera, or type it here."), input, go, note ? $("p", { class: "r-note" }, note) : ""));
}

function start(code: string) {
  let title = "Connecting…", sub = `TV ${code}`;
  const titleEl = $("strong", {}, title), subEl = $("small", {}, sub), link = $("span", { class: "r-link-state" }, "");
  const tv = joinTv(code, (s: State) => {
    if (s.t === "state") { title = s.title || "Terreno"; sub = s.sub ?? ""; titleEl.textContent = title; subEl.textContent = sub; root.classList.add("live"); }
    if (s.t === "suggest") { if (editing) return; showSuggestions(s.items, s.focus); if (!root.classList.contains("typing") && !s.q) enterTyping(false); }
    if (s.t === "input") editField(s.kind, s.label, s.value);
    if (s.t === "form" && s.kind === "trip") tripSheet();
    if (s.t === "tools") { tools = s; drawTools(); }
    if (s.t === "present") presenter(s);
    if (s.t === "quiz") quizHost(s);
    if (s.t === "panel") closePanel();
    if (s.t === "cam") { camNow = s; showCam(s); openHere.disabled = false; }
    if (s.t === "passing") showPassing(s);
  });
  let camNow: Extract<State, { t: "cam" }> | null = null;
  try { localStorage.setItem("atlas.tv.code", JSON.stringify({ code, at: Date.now() })); } catch { /* private mode */ }
  const cmd = (c: Cmd) => tv.send(c);
  let tools: Extract<State, { t: "tools" }> | null = null;
  window.setInterval(() => { cmd({ t: "ping" }); link.textContent = tv.direct ? "Direct" : "Relay"; link.classList.toggle("direct", tv.direct); }, 4000);

  // ---- The pad: the whole width of the phone, an instrument rather than a toy ----
  // Drag anywhere to roll the Earth (flick and it coasts). Tap an edge for up, down, left or right through the
  // TV's menus; tap the middle for OK, twice to dive in; hold for the menu. Two fingers: pinch to zoom, twist
  // to turn the view, slide up or down together to tilt toward the horizon. The orb in the middle is a globe
  // drawn in the pigments that rolls with your thumb; the corners read out where the TV's camera is.
  const grid = $("canvas", { class: "r-orb-grid", "aria-hidden": "true" }) as HTMLCanvasElement;
  const orb = $("div", { class: "r-orb", "aria-hidden": "true" }, grid);
  const chev = (dir: string) => $("span", { class: `r-edge r-edge-${dir}`, "aria-hidden": "true" });
  const edges: Record<string, HTMLElement> = { up: chev("up"), right: chev("right"), down: chev("down"), left: chev("left") };
  const corner = (pos: string) => $("span", { class: `r-hud r-hud-${pos}` }, $("small", {}), $("b", {}, "—"));
  const hud = { tl: corner("tl"), tr: corner("tr"), bl: corner("bl"), br: corner("br") };
  const label = (el: HTMLElement, k: string, v: string) => { el.querySelector("small")!.textContent = k; el.querySelector("b")!.textContent = v; };
  label(hud.tl, "LAT", "—"); label(hud.tr, "LON", "—"); label(hud.bl, "ALT", "—"); label(hud.br, "HDG", "—");
  const pad = $("div", { class: "r-pad", role: "application", "aria-label": "Drag to roll the Earth, pinch to zoom, twist to turn, tap the edges to move through menus, tap the middle for OK" },
    ...["tl", "tr", "bl", "br"].map((c) => $("i", { class: `r-tick r-tick-${c}` })),
    ...Object.values(hud), ...Object.values(edges), orb, $("p", { class: "r-hint" }, "Roll · pinch · twist"));
  const press = (dir: "up" | "down" | "left" | "right") => { buzz(10); edges[dir].classList.add("hit"); setTimeout(() => edges[dir].classList.remove("hit"), 180); cmd({ t: "dpad", dir }); };
  /** The TV's camera, read out in the pad's corners. */
  const showCam = (c: Extract<State, { t: "cam" }>) => {
    label(hud.tl, "LAT", `${Math.abs(c.lat).toFixed(3)}° ${c.lat >= 0 ? "N" : "S"}`);
    label(hud.tr, "LON", `${Math.abs(c.lon).toFixed(3)}° ${c.lon >= 0 ? "E" : "W"}`);
    label(hud.bl, "ALT", c.alt >= 100_000 ? `${Math.round(c.alt / 1000).toLocaleString("en")} km` : c.alt >= 1000 ? `${(c.alt / 1000).toFixed(1)} km` : `${Math.round(c.alt)} m`);
    const hd = ((c.heading % 360) + 360) % 360;
    label(hud.br, "HDG", `${String(Math.round(hd)).padStart(3, "0")}° ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(hd / 45) % 8]}`);
  };

  // The orb's grid: near side bright, far side a ghost; the equator and prime meridian picked out; a bezel of
  // degree ticks around it that turns with the ball.
  let ball: M3 = turn(turn(IDENTITY, 0.08, 0), 0, -0.12);
  const draw = () => {
    const w = orb.clientWidth || 200, k = devicePixelRatio || 1;
    if (grid.width !== Math.round(w * k)) { grid.width = grid.height = Math.round(w * k); }
    const g = grid.getContext("2d");
    if (!g) return;
    const c = w / 2, r = c * 0.8;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, w);
    g.lineCap = "round";
    // The bezel: a tick every 10°, longer every 30°, north in terracotta, turning with the ball's yaw.
    const yaw = Math.atan2(ball[6], ball[8]);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + yaw - Math.PI / 2, long = i % 3 === 0;
      g.strokeStyle = i === 0 ? "rgba(217,128,93,.95)" : `rgba(236,232,222,${long ? 0.42 : 0.2})`;
      g.lineWidth = i === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(c + Math.cos(a) * (c - 2), c + Math.sin(a) * (c - 2)); g.lineTo(c + Math.cos(a) * (c - (long ? 9 : 5)), c + Math.sin(a) * (c - (long ? 9 : 5))); g.stroke();
    }
    g.strokeStyle = "rgba(236,232,222,.14)"; g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, r + 0.5, 0, Math.PI * 2); g.stroke();
    for (const line of sphereLines(ball, 20, 72)) {
      const hot = line.kind !== "grid";
      for (let i = 1; i < line.pts.length; i++) {
        const a = line.pts[i - 1], b = line.pts[i], z = (a.z + b.z) / 2, near = z > 0;
        const rgb = line.kind === "equator" ? "220,174,76" : line.kind === "meridian" ? "217,128,93" : "143,168,242";
        g.strokeStyle = near ? `rgba(${rgb},${(hot ? 0.6 : 0.2) + z * (hot ? 0.35 : 0.45)})` : `rgba(${rgb},.06)`;
        g.lineWidth = near ? (hot ? 1.6 : 1) : 0.8;
        g.beginPath(); g.moveTo(c + a.x * r, c + a.y * r); g.lineTo(c + b.x * r, c + b.y * r); g.stroke();
      }
    }
  };
  new ResizeObserver(draw).observe(orb);
  // Left alone, the ball drifts slowly, so the remote looks alive on the coffee table.
  let idleAt = 0, idleRaf = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const idle = () => {
    idleRaf = 0;
    if (document.hidden || reduce) return;
    if (performance.now() - idleAt > 2500) { ball = turn(ball, 0.0009, 0); draw(); }
    idleRaf = requestAnimationFrame(idle);
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !idleRaf) idleRaf = requestAnimationFrame(idle); });
  idleRaf = requestAnimationFrame(idle);

  // Gestures on the whole pad.
  const pts = new Map<number, { x: number; y: number }>();
  let last = { x: 0, y: 0, t: 0 }, vel = { x: 0, y: 0 }, travelled = 0, downAt = 0, downXY = { x: 0, y: 0 }, lastTap = 0, holdTimer = 0, coast = 0, tick = 0;
  let two: { d: number; a: number; my: number } | null = null;
  const size = () => Math.min(pad.clientWidth, pad.clientHeight) || 300;
  const spinLines = (dx: number, dy: number) => { idleAt = performance.now(); ball = turn(ball, dx, dy); draw(); };
  const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2 }; };
  pad.addEventListener("pointerdown", (e) => {
    pad.setPointerCapture(e.pointerId);
    cancelAnimationFrame(coast);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    root.classList.add("touched");
    pad.classList.add("held");
    if (pts.size === 1) {
      last = { x: e.clientX, y: e.clientY, t: performance.now() }; vel = { x: 0, y: 0 }; travelled = 0; downAt = performance.now(); downXY = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => { if (travelled < 8) { buzz(30); pad.classList.add("pulse"); setTimeout(() => pad.classList.remove("pulse"), 500); cmd({ t: "menu" }); travelled = 999; } }, 520);
    } else if (pts.size === 2) { two = pair(); clearTimeout(holdTimer); travelled = 999; }
  });
  pad.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && two) {
      const now = pair();
      const f = now.d / two.d, da = ((now.a - two.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dy = (now.my - two.my) / size();
      if (Math.abs(f - 1) > 0.035) { cmd({ t: "zoom", f }); two.d = now.d; orb.style.transform = `scale(${Math.min(1.12, Math.max(0.9, f))})`; }
      if (Math.abs(da) > 0.02 || Math.abs(dy) > 0.01) { cmd({ t: "orbit", turn: -da, tilt: dy * 1.6 }); two.a = now.a; two.my = now.my; spinLines(-da * 0.3, 0); if ((tick += Math.abs(da)) > 0.2) { tick = 0; buzz(3); } }
      return;
    }
    const now = performance.now(), dx = (e.clientX - last.x) / size(), dy = (e.clientY - last.y) / size(), dt = Math.max(1, now - last.t);
    travelled += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    if (travelled < 6) return;
    clearTimeout(holdTimer);
    vel = { x: (dx / dt) * 16, y: (dy / dt) * 16 };
    last = { x: e.clientX, y: e.clientY, t: now };
    cmd({ t: "pan", dx, dy });
    spinLines(dx, dy);
    if ((tick += Math.hypot(dx, dy)) > 0.18) { tick = 0; buzz(3); }
  });
  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    orb.style.transform = "";
    if (pts.size) { two = null; return; }
    two = null;
    pad.classList.remove("held");
    clearTimeout(holdTimer);
    const quick = performance.now() - downAt < 260 && travelled < 8;
    if (quick) {
      // An edge is a direction; anywhere else is OK.
      const r = pad.getBoundingClientRect(), x = (downXY.x - r.left) / r.width, y = (downXY.y - r.top) / r.height;
      const band = 0.17;
      if (x < band || x > 1 - band || y < band || y > 1 - band) { press(edgeDir(x - 0.5, y - 0.5)); return; }
      const now = performance.now();
      ripple(downXY.x - r.left, downXY.y - r.top);
      if (now - lastTap < 320) { buzz(14); cmd({ t: "zoom", f: 2.6 }); lastTap = 0; } else { buzz(10); lastTap = now; window.setTimeout(() => { if (lastTap === now) cmd({ t: "select" }); }, 300); }
      return;
    }
    // A flick keeps the Earth turning a moment, slowing like a real globe.
    if (Math.hypot(vel.x, vel.y) > 0.004 && travelled < 900) {
      const step = () => {
        vel = { x: vel.x * 0.92, y: vel.y * 0.92 };
        if (Math.hypot(vel.x, vel.y) < 0.0008) return;
        cmd({ t: "pan", dx: vel.x, dy: vel.y }); spinLines(vel.x, vel.y);
        coast = requestAnimationFrame(step);
      };
      coast = requestAnimationFrame(step);
    }
  };
  pad.addEventListener("pointerup", up);
  pad.addEventListener("pointercancel", up);
  const ripple = (x: number, y: number) => { const r = $("i", { class: "r-ripple" }); r.style.left = `${x}px`; r.style.top = `${y}px`; pad.append(r); r.addEventListener("animationend", () => r.remove()); };

  // ---- Under the pad: a zoom fader, then four keys ----
  // Drag the fader to zoom smoothly (it springs back to the middle); tap either end for a step.
  const knob = $("i", { class: "r-fader-knob" });
  const fader = $("div", { class: "r-fader", role: "slider", "aria-label": "Zoom: drag right to come closer, left to pull back", "aria-valuenow": "0", "aria-valuemin": "-1", "aria-valuemax": "1", tabindex: "0" },
    $("span", { class: "r-fader-end" }, "−"), $("span", { class: "r-fader-track" }, $("small", {}, "ZOOM"), knob), $("span", { class: "r-fader-end" }, "+"));
  let fx0 = 0, fLast = 0, fRaf = 0, fPos = 0;
  const fadeLoop = () => { if (Math.abs(fPos) > 0.04) cmd({ t: "zoom", f: Math.exp(fPos * 0.09) }); fRaf = requestAnimationFrame(fadeLoop); };
  fader.addEventListener("pointerdown", (e) => {
    const r = fader.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.16 || x > 0.84) { buzz(8); cmd({ t: "zoom", f: x < 0.5 ? 1 / 1.6 : 1.6 }); return; }
    fader.setPointerCapture(e.pointerId); fx0 = e.clientX; fLast = 0; fader.classList.add("on"); fRaf = requestAnimationFrame(fadeLoop);
  });
  fader.addEventListener("pointermove", (e) => {
    if (!fader.classList.contains("on")) return;
    const span = fader.clientWidth * 0.32;
    fPos = Math.max(-1, Math.min(1, (e.clientX - fx0) / span));
    knob.style.transform = `translateX(${fPos * span * 0.9}px)`;
    if (Math.abs(fPos - fLast) > 0.25) { fLast = fPos; buzz(3); }
  });
  const fadeEnd = () => { fader.classList.remove("on"); cancelAnimationFrame(fRaf); fPos = 0; knob.style.transform = ""; };
  fader.addEventListener("pointerup", fadeEnd); fader.addEventListener("pointercancel", fadeEnd);
  fader.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") cmd({ t: "zoom", f: 1.6 }); if (e.key === "ArrowLeft") cmd({ t: "zoom", f: 1 / 1.6 }); });

  const ICON: Record<string, string> = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    menu: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    voice: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  };
  const svg = (k: string) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const key = (label: string, icon: string, fn: () => void, cls = "") => {
    const b = $("button", { class: `r-key ${cls}`, "aria-label": label }, $("span", { class: "r-key-icon" }), $("small", {}, label));
    b.querySelector(".r-key-icon")!.innerHTML = svg(icon);
    b.addEventListener("click", () => { buzz(8); fn(); });
    return b;
  };
  const keys = $("div", { class: "r-keys" },
    key("Back", "back", () => cmd({ t: "back" })), key("Menu", "menu", () => cmd({ t: "menu" })),
    key("Search", "search", () => enterTyping(true)), key("Voice", "voice", () => listenVoice(), "r-key-voice"));
  const deck = $("div", { class: "r-deck" }, pad, fader, keys);

  // ---- Typing: the orb gives way to a search bar and the keyboard ----
  const field = $("input", { type: "text", enterkeyhint: "go", autocapitalize: "words", placeholder: "Where to?", autocomplete: "off", "aria-label": "Search on the TV" }) as HTMLInputElement;
  const closeType = $("button", { class: "r-type-x", "aria-label": "Close search" }, "✕");
  const sugg = $("div", { class: "r-sugg" });
  const typeBar = $("div", { class: "r-type" }, $("span", { class: "r-type-icon" }, "⌕"), field, closeType);
  const typeIcon = typeBar.querySelector<HTMLElement>(".r-type-icon")!;
  const doneBtn = $("button", { class: "r-type-done" }, "Done");
  typeBar.insertBefore(doneBtn, closeType);
  // `editing`: the keyboard is filling a field on the TV (a Work tool's "To", a date), not searching.
  let typed = 0, editing = false;
  const sendField = (done: boolean) => cmd({ t: "set", value: field.value, done });
  field.addEventListener("input", () => {
    clearTimeout(typed);
    typed = window.setTimeout(() => (editing ? sendField(false) : cmd({ t: "type", q: field.value })), 90);
  });
  field.addEventListener("change", () => { if (editing && field.type !== "text") sendField(false); });
  const finish = () => {
    clearTimeout(typed);
    if (editing) { sendField(true); leaveTyping(false); return; }
    cmd({ t: "select" }); leaveTyping(false);
  };
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(); } });
  doneBtn.addEventListener("click", () => { buzz(10); finish(); });
  closeType.addEventListener("click", () => leaveTyping(!editing));
  function enterTyping(tellTv: boolean) {
    editing = false;
    field.type = "text"; field.placeholder = "Where to?"; typeIcon.textContent = "⌕";
    root.classList.add("typing"); root.classList.remove("editing");
    field.value = ""; sugg.replaceChildren();
    field.focus();
    if (tellTv) cmd({ t: "search", open: true });
  }
  /** The TV's focus is on a field: the keyboard (or the phone's own date/time picker) fills it live. */
  function editField(kind: "text" | "date" | "number" | "time", label: string, value: string) {
    editing = true;
    field.type = kind; field.placeholder = label; field.value = value; typeIcon.textContent = kind === "date" ? "📅" : kind === "time" ? "🕒" : kind === "number" ? "#" : "✎";
    field.setAttribute("aria-label", label);
    sugg.replaceChildren($("p", { class: "r-edit-label" }, `Filling “${label}” on the TV`));
    root.classList.add("typing", "editing");
    field.focus();
    try { if (kind !== "text") (field as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* needs a gesture */ }
  }
  function leaveTyping(tellTv: boolean) {
    root.classList.remove("typing", "editing");
    field.blur();
    if (tellTv) cmd({ t: "search", open: false });
    editing = false;
  }

  // ---- Plan a trip: a few fields on the phone, the whole plan on the TV ----
  function tripSheet() {
    root.querySelector(".r-sheet")?.remove();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const day = (n: number) => iso(new Date(Date.now() + n * 864e5));
    const input = (attrs: Record<string, string>) => $("input", { autocomplete: "off", ...attrs }) as HTMLInputElement;
    const to = input({ type: "text", placeholder: "Lisbon, Kyoto, the Grand Canyon…", autocapitalize: "words", enterkeyhint: "next" });
    const from = input({ type: "text", placeholder: "Home", autocapitalize: "words", enterkeyhint: "next" });
    const depart = input({ type: "date", value: day(21), min: day(0) });
    const back = input({ type: "date", value: day(26), min: day(0) });
    let people = 2;
    const count = $("strong", {}, "2");
    const step = (d: number) => { const b = $("button", { type: "button", class: "r-step" }, d > 0 ? "+" : "−"); b.addEventListener("click", () => { buzz(6); people = Math.max(1, Math.min(9, people + d)); count.textContent = String(people); }); return b; };
    depart.addEventListener("change", () => { back.min = depart.value; if (back.value < depart.value) back.value = iso(new Date(new Date(depart.value).getTime() + 5 * 864e5)); });
    const go = $("button", { class: "r-primary", type: "submit" }, "Plan it on the TV ✈");
    const x = $("button", { class: "r-type-x", type: "button", "aria-label": "Close" }, "✕");
    const row = (label: string, el: Node) => $("label", { class: "r-field" }, $("span", {}, label), el);
    const form = $("form", { class: "r-sheet" },
      $("header", {}, $("h2", {}, "✈ Plan a trip"), x),
      row("To", to), row("From", from),
      $("div", { class: "r-two" }, row("Leave", depart), row("Back", back)),
      $("div", { class: "r-field r-people" }, $("span", {}, "Travellers"), $("div", {}, step(-1), count, step(1))),
      go, $("p", { class: "r-sheet-note" }, "The TV lays out the journey: the flight or drive, the days, and a ▶ to fly it."));
    const close = () => { form.classList.add("out"); setTimeout(() => form.remove(), 300); };
    x.addEventListener("click", close);
    to.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); from.focus(); } });
    from.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!to.value.trim()) { to.classList.add("shake"); to.focus(); return; }
      buzz(16);
      cmd({ t: "trip", to: to.value.trim(), from: from.value.trim() || undefined, depart: depart.value, back: back.value, people });
      close();
    });
    to.addEventListener("animationend", () => to.classList.remove("shake"));
    root.append(form);
    to.focus();
  }
  function showSuggestions(items: string[], focus: number) {
    sugg.replaceChildren(...items.map((name, i) => {
      const b = $("button", { class: "r-sugg-row" + (i === focus ? " focus" : "") }, $("span", {}, "📍"), name);
      b.addEventListener("click", () => { buzz(10); cmd({ t: "pick", i }); leaveTyping(false); });
      return b;
    }));
  }

  // ---- Voice: say it, and the TV shows your words as you speak ----
  function listenVoice() {
    type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void; start(): void };
    const R = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;
    if (!R) { enterTyping(true); return; }
    const rec = new R();
    rec.lang = navigator.language || "en-US"; rec.interimResults = true;
    root.classList.add("listening");
    cmd({ t: "search", open: true });
    let said = "";
    rec.onresult = (e) => {
      said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      cmd({ t: "type", q: said });
      if (e.results[e.results.length - 1].isFinal) cmd({ t: "fly", q: said });
    };
    rec.onend = () => root.classList.remove("listening");
    rec.onerror = () => { root.classList.remove("listening"); cmd({ t: "search", open: false }); };
    rec.start();
  }

  // ---- The room's tools: a strip the TV fills in, so the phone always matches the screen ----
  const strip = $("div", { class: "r-tools", role: "toolbar", "aria-label": "Tools for this screen" });
  function drawTools() {
    if (!tools) return;
    strip.replaceChildren(...tools.items.map((t) => {
      const on = tools!.mode === t.id;
      const b = $("button", { class: "r-tool" + (on ? " on" : ""), "aria-pressed": String(on) }, $("span", {}, t.icon), $("small", {}, t.label));
      b.addEventListener("click", () => { buzz(8); toolPress(t); });
      return b;
    }));
    root.classList.toggle("has-tools", tools.items.length > 0);
    if (tools.mode) inkPad(tools.mode); else if (panel?.classList.contains("r-ink")) closePanel();
  }
  /** Some tools need the phone first (what to present, how long a timer); the rest go straight to the TV. */
  function toolPress(t: ToolItem) {
    if (t.id === "lesson" || t.id === "present") lessonSheet(t.id);
    else if (t.id === "quiz") quizSheet();
    else if (t.id === "timer") timerSheet();
    else if (t.id === "sites") shareSites();
    else if (t.id === "search") enterTyping(true);
    else if (t.id === "trip") tripSheet();
    else cmd({ t: "tool", tool: t.id });
  }
  const mine = <T>(k: string): T[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

  /** A sheet of choices sliding up over the remote. */
  function sheet(titleText: string, note: string, rows: { label: string; sub?: string; icon?: string; go(): void }[]) {
    root.querySelector(".r-sheet")?.remove();
    const x = $("button", { class: "r-type-x", type: "button", "aria-label": "Close" }, "✕");
    const box = $("div", { class: "r-sheet", role: "dialog", "aria-label": titleText },
      $("header", {}, $("h2", {}, titleText), x),
      note ? $("p", { class: "r-sheet-note" }, note) : "",
      $("div", { class: "r-list" }, ...rows.map((r) => {
        const b = $("button", { class: "r-list-row" }, r.icon ? $("span", { class: "r-list-icon" }, r.icon) : "", $("div", {}, $("strong", {}, r.label), r.sub ? $("small", {}, r.sub) : ""));
        b.addEventListener("click", () => { buzz(10); close(); r.go(); });
        return b;
      })));
    const close = () => { box.classList.add("out"); setTimeout(() => box.remove(), 300); };
    x.addEventListener("click", close);
    root.append(box);
  }
  function lessonSheet(kind: "lesson" | "present") {
    const decks = mine<{ id: string; name: string; slides: { thumb?: string }[] }>("atlas.work.decks.v1");
    const send = (d: { slides: { thumb?: string }[] }) => cmd({ t: "share", kind: "deck", data: { ...d, slides: d.slides.map((s) => ({ ...s, thumb: undefined })) } });
    sheet(kind === "lesson" ? "📖 Lessons" : "🎞 Present", "Your notes and the next slide show here on your phone; the room sees the slides.", [
      ...decks.map((d) => ({ icon: "📱", label: d.name, sub: `${d.slides.length} slides · on this phone`, go: () => send(d) })),
      ...(tools?.decks ?? []).map((d) => ({ icon: "📺", label: d.name, sub: "Saved on the TV", go: () => cmd({ t: "tool", tool: kind, arg: d.id }) })),
      ...TEMPLATES.map((t) => ({ icon: "✨", label: t.name, sub: `Ready-made · ${t.about}`, go: () => cmd({ t: "tool", tool: kind, arg: `tpl:${t.name}` }) })),
    ]);
  }
  function quizSheet() {
    const quizzes = mine<unknown>("atlas.work.quizzes.v1").filter(validQuiz);
    sheet("❓ Class quiz", "Questions show big on the TV; the answers show only here, until you reveal them.", [
      { icon: "✨", label: "Capitals and famous places", sub: "Ready-made · 8 questions, 20 seconds each", go: () => cmd({ t: "tool", tool: "quiz", arg: "starter" }) },
      ...quizzes.map((q) => ({ icon: "📱", label: q.title, sub: `${q.questions.length} questions · on this phone`, go: () => cmd({ t: "share", kind: "quiz", data: q }) })),
      ...(tools?.quizzes ?? []).map((q) => ({ icon: "📺", label: q.name, sub: "Saved on the TV", go: () => cmd({ t: "tool", tool: "quiz", arg: q.id }) })),
    ]);
  }
  function timerSheet() {
    sheet("⏱ Timer", "A countdown the whole room can see, with a chime at the end.", [
      ...[1, 2, 3, 5, 10, 15, 30].map((m) => ({ label: `${m} minute${m === 1 ? "" : "s"}`, go: () => cmd({ t: "timer", seconds: m * 60 }) })),
      { label: "Stop the timer", go: () => cmd({ t: "timer", seconds: 0 }) },
    ]);
  }
  function roomSheet() {
    if (!tools) return;
    sheet("This screen is for…", "The TV sets itself up for the room: what plays by itself, and the tools here.",
      tools.rooms.map((r) => ({ icon: r.icon, label: r.label + (r.id === tools!.room ? " ✓" : ""), sub: r.who, go: () => cmd({ t: "room", room: r.id }) })));
  }
  /** Hands the TV every site from the Pro tools on this phone. */
  function shareSites() {
    const sites = allSites((k) => localStorage.getItem(k));
    if (sites.length) cmd({ t: "share", kind: "sites", data: sites });
    else cmd({ t: "tool", tool: "sites" });
  }

  // ---- Panels over the orb: the ink pad, the presenter's view, the quiz host's view ----
  let panel: HTMLElement | null = null;
  function showPanel(p: HTMLElement) { panel?.remove(); panel = p; root.append(p); root.classList.add("paneled"); }
  function closePanel() { panel?.remove(); panel = null; root.classList.remove("paneled"); }

  /** Pointer, spotlight or pen: the pad is the TV's screen, shrunk; your thumb is the dot. */
  function inkPad(mode: string) {
    if (panel?.dataset.mode === mode) return;
    const pad = $("div", { class: "r-inkpad", role: "application", "aria-label": "Move your thumb to point on the TV" }, $("span", {}, mode === "pen" ? "Draw here" : mode === "spotlight" ? "Move the spotlight" : "Point"));
    const done = $("button", { class: "r-primary" }, "Done");
    const clear = $("button", { class: "r-ghost" }, "Clear drawing");
    const p = $("div", { class: "r-panel r-ink" }, $("p", { class: "r-panel-k" }, mode === "pen" ? "✎ Pen" : mode === "spotlight" ? "🔦 Spotlight" : "🔴 Pointer"), pad, $("div", { class: "r-row" }, mode === "pen" ? clear : "", done));
    p.dataset.mode = mode;
    const at = (e: PointerEvent) => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    let down = false;
    pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); down = true; const q = at(e); pad.style.setProperty("--x", `${q.x * 100}%`); pad.style.setProperty("--y", `${q.y * 100}%`); cmd({ t: "point", ...q, down: mode === "pen" }); pad.classList.add("touch"); });
    let lastSent = 0;
    pad.addEventListener("pointermove", (e) => {
      if (!down) return;
      // Through the relay, strokes are thinned to a few points a second (it limits how often it's used).
      if (mode === "pen" && !tv.direct && Date.now() - lastSent < 250) return;
      lastSent = Date.now();
      const q = at(e); pad.style.setProperty("--x", `${q.x * 100}%`); pad.style.setProperty("--y", `${q.y * 100}%`); cmd({ t: "point", ...q, down: mode === "pen" }); });
    const up = () => { down = false; pad.classList.remove("touch"); cmd({ t: "point-end" }); };
    pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up);
    done.addEventListener("click", () => { buzz(10); cmd({ t: "tool", tool: mode }); closePanel(); });
    clear.addEventListener("click", () => { buzz(8); cmd({ t: "tool", tool: "ink-clear" }); });
    showPanel(p);
  }

  let presentStart = 0, presentTimer = 0;
  function presenter(s: Extract<State, { t: "present" }>) {
    if (!panel?.classList.contains("r-present")) {
      presentStart = Date.now();
      const elapsed = $("span", { class: "r-elapsed" }, "0:00");
      clearInterval(presentTimer);
      presentTimer = window.setInterval(() => { elapsed.textContent = clockText((Date.now() - presentStart) / 1000); }, 1000);
      const prev = $("button", { class: "r-big r-prev", "aria-label": "Previous slide" }, "‹");
      const next = $("button", { class: "r-big r-next", "aria-label": "Next slide" }, "Next ›");
      const end = $("button", { class: "r-ghost" }, "End");
      prev.addEventListener("click", () => { buzz(10); cmd({ t: "slide", dir: -1 }); });
      next.addEventListener("click", () => { buzz(14); cmd({ t: "slide", dir: 1 }); });
      end.addEventListener("click", () => { cmd({ t: "back" }); closePanel(); });
      showPanel($("div", { class: "r-panel r-present" },
        $("div", { class: "r-panel-top" }, $("p", { class: "r-panel-k" }), elapsed),
        $("h3", { class: "r-slide-title" }), $("div", { class: "r-notes" }), $("p", { class: "r-up-next" }),
        $("div", { class: "r-row" }, prev, next), end));
    }
    const p = panel!;
    p.querySelector(".r-panel-k")!.textContent = `${s.deck} · ${s.i + 1} of ${s.n}`;
    p.querySelector(".r-slide-title")!.textContent = s.title;
    p.querySelector(".r-notes")!.textContent = s.notes || "No notes for this slide.";
    p.querySelector(".r-up-next")!.textContent = s.next ? `Next: ${s.next}` : "Last slide";
  }

  let quizTimer = 0;
  function quizHost(s: Extract<State, { t: "quiz" }>) {
    if (!panel?.classList.contains("r-quiz")) {
      const reveal = $("button", { class: "r-big r-next" }, "Reveal");
      const prev = $("button", { class: "r-big r-prev", "aria-label": "Previous question" }, "‹");
      const end = $("button", { class: "r-ghost" }, "End the quiz");
      reveal.addEventListener("click", () => { buzz(14); cmd({ t: "quiz", act: reveal.dataset.next ? "next" : "reveal" }); });
      prev.addEventListener("click", () => { buzz(10); cmd({ t: "quiz", act: "prev" }); });
      end.addEventListener("click", () => { cmd({ t: "quiz", act: "end" }); closePanel(); });
      showPanel($("div", { class: "r-panel r-quiz" },
        $("div", { class: "r-panel-top" }, $("p", { class: "r-panel-k" }), $("span", { class: "r-elapsed" })),
        $("h3", { class: "r-slide-title" }),
        $("div", { class: "r-answer" }, $("small", {}, "Answer · only you can see this"), $("strong", {})),
        $("div", { class: "r-row" }, prev, reveal), end));
    }
    const p = panel!;
    p.querySelector(".r-panel-k")!.textContent = `${s.title} · ${s.i + 1} of ${s.n}`;
    p.querySelector(".r-slide-title")!.textContent = s.prompt;
    p.querySelector(".r-answer strong")!.textContent = s.answer;
    const btn = p.querySelector<HTMLElement>(".r-next")!;
    btn.textContent = s.revealed ? (s.i + 1 < s.n ? "Next question ›" : "Finish") : "Reveal";
    if (s.revealed) btn.dataset.next = "1"; else delete btn.dataset.next;
    const left = p.querySelector(".r-elapsed")!;
    clearInterval(quizTimer);
    if (s.ends && !s.revealed) quizTimer = window.setInterval(() => { left.textContent = clockText((s.ends - Date.now()) / 1000); }, 250);
    else left.textContent = "";
  }

  // ---- More: a different TV, exit ----
  const more = $("details", { class: "r-more" }, $("summary", { "aria-label": "More" }, "⋯"),
    $("div", {}, (() => { const b = $("button", {}, "▦ This screen is for…"); b.addEventListener("click", () => { (b.closest("details") as HTMLDetailsElement).open = false; roomSheet(); }); return b; })(),
      (() => { const b = $("button", {}, "✈ Plan a trip"); b.addEventListener("click", () => { (b.closest("details") as HTMLDetailsElement).open = false; tripSheet(); }); return b; })(),
      (() => { const b = $("button", {}, "Next in the playlist ▶"); b.addEventListener("click", () => cmd({ t: "next" })); return b; })(),
      (() => { const b = $("button", {}, "💨 Wind on the TV"); b.addEventListener("click", () => cmd({ t: "wind" })); return b; })(),
      (() => { const b = $("button", {}, "◎ Hologram of this place"); b.addEventListener("click", () => cmd({ t: "holo" })); return b; })(),
      (() => { const b = $("button", {}, "Exit TV mode"); b.addEventListener("click", () => cmd({ t: "exit" })); return b; })(),
      (() => { const b = $("button", {}, "Connect a different TV"); b.addEventListener("click", () => { tv.close(); location.hash = ""; root.className = ""; pairScreen(); }); return b; })()));

  // ---- Phone and TV together: take the TV's view with you, keep what it passed ----
  /** Terreno on this phone, at a place or the TV's own view. */
  const appLink = (place?: { lon: number; lat: number }) => new URL(`./${formatHash(place ? { place: { lon: place.lon, lat: place.lat } } : camNow ? { camera: { lon: camNow.lon, lat: camNow.lat, height: camNow.alt, heading: camNow.heading, pitch: camNow.pitch } } : {})}`, location.href).href;
  const openHere = $("button", { class: "r-open", "aria-label": "Open the TV's view in Terreno on this phone", disabled: "" }, "Open here") as HTMLButtonElement;
  openHere.addEventListener("click", () => { buzz(10); location.href = appLink(); });
  const passBox = $("div", { class: "r-pass", hidden: "" });
  let passTimer = 0;
  function showPassing(s: Extract<State, { t: "passing" }>) {
    const open = $("a", { class: "r-pass-open", href: appLink(s) }, "Open on phone");
    passBox.style.setProperty("--c", s.color);
    passBox.replaceChildren($("p", { class: "r-pass-k" }, $("i"), "Passing on the TV"), $("strong", {}, s.name), s.line ? $("p", { class: "r-pass-line" }, s.line) : "", open);
    passBox.hidden = false;
    passBox.classList.remove("in"); void passBox.offsetWidth; passBox.classList.add("in");
    buzz(6);
    clearTimeout(passTimer);
    passTimer = window.setTimeout(() => { passBox.hidden = true; }, 15_000);
  }

  root.replaceChildren(
    $("header", { class: "r-now" },
      $("div", { class: "r-now-k" }, $("span", { class: "r-live" }), $("small", {}, "On the TV"), link, openHere, more),
      titleEl, subEl),
    passBox,
    strip,
    $("div", { class: "r-stage" }, deck),
    $("div", { class: "r-typing" }, typeBar, sugg));
  cmd({ t: "hello" });
  setTimeout(() => { if (!root.classList.contains("live")) { titleEl.textContent = "Waiting for the TV…"; subEl.textContent = `Is the TV showing code ${code}?`; cmd({ t: "hello" }); } }, 4000);
}

installEmojiGuard();
const initial = cleanCode(location.hash.slice(1));
if (initial.length === 6) start(initial); else pairScreen();
