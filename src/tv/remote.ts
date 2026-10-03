// The phone remote for Atlas TV, a controller rather than a list of buttons.
//   The orb: a pearly sphere you hold like a trackball. Drag to spin the
//     Earth on the TV (its meridians turn under your thumb), flick and it
//     coasts, pinch to zoom, tap to pick what's in the middle, double-tap to
//     dive in, press and hold for the menu.
//   The ring around it: up, down, left, right through the TV's menu.
//   Search: the orb gives way to a search bar and the keyboard; what you type
//     appears big on the TV letter by letter, with suggestions on both.
//   Voice: say where to go; the TV shows your words as you speak them.
// A page of its own (no globe), so it opens instantly on a phone.
import "./remote.css";
import { cleanCode, joinTv, type Cmd, type State } from "./link";

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const NS = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };
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
    $("div", { class: "r-orb-mini" }),
    $("div", { class: "r-brand" }, "ATLAS ", $("span", {}, "REMOTE")),
    $("p", {}, "Scan the code on the TV with your camera, or type it here."), input, go, note ? $("p", { class: "r-note" }, note) : ""));
}

function start(code: string) {
  let title = "Connecting…", sub = `TV ${code}`;
  const titleEl = $("strong", {}, title), subEl = $("small", {}, sub), link = $("span", { class: "r-link-state" }, "");
  const tv = joinTv(code, (s: State) => {
    if (s.t === "state") { title = s.title || "Atlas"; sub = s.sub ?? ""; titleEl.textContent = title; subEl.textContent = sub; root.classList.add("live"); }
    if (s.t === "suggest") { showSuggestions(s.items, s.focus); if (!root.classList.contains("typing") && !s.q) enterTyping(false); }
  });
  const cmd = (c: Cmd) => tv.send(c);
  window.setInterval(() => { cmd({ t: "ping" }); link.textContent = tv.direct ? "⚡ direct" : "via relay"; }, 4000);

  // ---- The orb and its ring ----
  const orbLines = $("div", { class: "r-orb-lines" });
  const orb = $("div", { class: "r-orb", role: "application", "aria-label": "Drag to spin the Earth, pinch to zoom, tap to pick" }, orbLines, $("div", { class: "r-orb-shine" }));
  const ring = svg("svg", { viewBox: "0 0 200 200", class: "r-ring", "aria-hidden": "true" });
  const segs: Record<string, SVGPathElement> = {};
  const DIRS = [["up", -90], ["right", 0], ["down", 90], ["left", 180]] as const;
  for (const [dir, a] of DIRS) {
    const r0 = 74, r1 = 98, s = ((a - 38) * Math.PI) / 180, e = ((a + 38) * Math.PI) / 180, P = (r: number, t: number) => `${100 + r * Math.cos(t)},${100 + r * Math.sin(t)}`;
    const path = svg("path", { d: `M${P(r1, s)} A${r1},${r1} 0 0 1 ${P(r1, e)} L${P(r0, e)} A${r0},${r0} 0 0 0 ${P(r0, s)} Z`, class: "r-seg" }) as SVGPathElement;
    const m = ((a) * Math.PI) / 180, cx = 100 + 86 * Math.cos(m), cy = 100 + 86 * Math.sin(m);
    const chev = svg("path", { d: "M-5,-3 L0,3 L5,-3", transform: `translate(${cx},${cy}) rotate(${a - 90})`, class: "r-chev" });
    segs[dir] = path;
    ring.append(path, chev);
  }
  const press = (dir: "up" | "down" | "left" | "right") => { buzz(10); segs[dir].classList.add("hit"); setTimeout(() => segs[dir].classList.remove("hit"), 180); cmd({ t: "dpad", dir }); };
  ring.addEventListener("pointerdown", (e) => {
    const r = ring.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.36) return; // the orb's own area
    const a = (Math.atan2(y, x) * 180) / Math.PI;
    press(a > -135 && a <= -45 ? "up" : a > -45 && a <= 45 ? "right" : a > 45 && a <= 135 ? "down" : "left");
  });
  const hint = $("p", { class: "r-hint" }, "Drag to spin · pinch to zoom · tap to pick");
  const pad = $("div", { class: "r-pad" }, ring, orb);

  // Gestures: one finger spins, two pinch, a quick touch picks, hold opens the menu.
  const pts = new Map<number, { x: number; y: number }>();
  let last = { x: 0, y: 0, t: 0 }, vel = { x: 0, y: 0 }, travelled = 0, downAt = 0, lastTap = 0, pinch0 = 0, holdTimer = 0, coast = 0, rot = { x: 0, y: 0 }, tick = 0;
  const size = () => orb.getBoundingClientRect().width || 240;
  const spinLines = (dx: number, dy: number) => { rot.x += dx * 120; rot.y += dy * 120; orbLines.style.backgroundPosition = `${rot.x}px ${rot.y}px, ${rot.x}px 0, 0 ${rot.y}px`; };
  orb.addEventListener("pointerdown", (e) => {
    orb.setPointerCapture(e.pointerId);
    cancelAnimationFrame(coast);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    root.classList.add("touched");
    orb.classList.add("held");
    if (pts.size === 1) {
      last = { x: e.clientX, y: e.clientY, t: performance.now() }; vel = { x: 0, y: 0 }; travelled = 0; downAt = performance.now();
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => { if (travelled < 8) { buzz(30); orb.classList.add("pulse"); setTimeout(() => orb.classList.remove("pulse"), 500); cmd({ t: "menu" }); travelled = 999; } }, 520);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); clearTimeout(holdTimer);
    }
  });
  orb.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0 && Math.abs(d / pinch0 - 1) > 0.04) { cmd({ t: "zoom", f: d / pinch0 }); orb.style.transform = `scale(${Math.min(1.15, Math.max(0.88, d / pinch0))})`; pinch0 = d; travelled = 999; }
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
    if (pts.size) return;
    orb.classList.remove("held");
    clearTimeout(holdTimer);
    const quick = performance.now() - downAt < 260 && travelled < 8;
    if (quick) {
      const now = performance.now();
      ripple();
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
  orb.addEventListener("pointerup", up);
  orb.addEventListener("pointercancel", up);
  const ripple = () => { const r = $("i", { class: "r-ripple" }); orb.append(r); r.addEventListener("animationend", () => r.remove()); };

  // ---- Buttons under the orb ----
  const roundBtn = (label: string, icon: string, fn: () => void) => { const b = $("button", { class: "r-round", "aria-label": label }, $("span", {}, icon), $("small", {}, label)); b.addEventListener("click", () => { buzz(8); fn(); }); return b; };
  const searchBtn = roundBtn("Search", "⌕", () => enterTyping(true));
  const voiceBtn = roundBtn("Voice", "🎙", () => listenVoice());
  const buttons = $("div", { class: "r-buttons" },
    roundBtn("Back", "‹", () => cmd({ t: "back" })), roundBtn("Menu", "☰", () => cmd({ t: "menu" })), searchBtn, voiceBtn);

  // ---- Typing: the orb gives way to a search bar and the keyboard ----
  const field = $("input", { type: "text", enterkeyhint: "go", autocapitalize: "words", placeholder: "Where to?", autocomplete: "off", "aria-label": "Search on the TV" }) as HTMLInputElement;
  const closeType = $("button", { class: "r-type-x", "aria-label": "Close search" }, "✕");
  const sugg = $("div", { class: "r-sugg" });
  const typeBar = $("div", { class: "r-type" }, $("span", { class: "r-type-icon" }, "⌕"), field, closeType);
  let typed = 0;
  field.addEventListener("input", () => { clearTimeout(typed); typed = window.setTimeout(() => cmd({ t: "type", q: field.value }), 90); });
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); cmd({ t: "select" }); leaveTyping(false); } });
  closeType.addEventListener("click", () => leaveTyping(true));
  function enterTyping(tellTv: boolean) {
    root.classList.add("typing");
    field.value = ""; sugg.replaceChildren();
    field.focus();
    if (tellTv) cmd({ t: "search", open: true });
  }
  function leaveTyping(tellTv: boolean) {
    root.classList.remove("typing");
    field.blur();
    if (tellTv) cmd({ t: "search", open: false });
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

  // ---- More: a different TV, exit ----
  const more = $("details", { class: "r-more" }, $("summary", { "aria-label": "More" }, "⋯"),
    $("div", {}, (() => { const b = $("button", {}, "Next in the playlist ▶"); b.addEventListener("click", () => cmd({ t: "next" })); return b; })(),
      (() => { const b = $("button", {}, "💨 Wind on the TV"); b.addEventListener("click", () => cmd({ t: "wind" })); return b; })(),
      (() => { const b = $("button", {}, "◎ Hologram of this place"); b.addEventListener("click", () => cmd({ t: "holo" })); return b; })(),
      (() => { const b = $("button", {}, "Exit TV mode"); b.addEventListener("click", () => cmd({ t: "exit" })); return b; })(),
      (() => { const b = $("button", {}, "Connect a different TV"); b.addEventListener("click", () => { tv.close(); location.hash = ""; root.className = ""; pairScreen(); }); return b; })()));

  root.replaceChildren(
    $("header", { class: "r-now" }, $("span", { class: "r-live" }), $("div", {}, $("small", {}, "On the TV ", link), titleEl, subEl), more),
    $("div", { class: "r-stage" }, pad, hint, buttons),
    $("div", { class: "r-typing" }, typeBar, sugg));
  cmd({ t: "hello" });
  setTimeout(() => { if (!root.classList.contains("live")) { titleEl.textContent = "Waiting for the TV…"; subEl.textContent = `Is the TV showing code ${code}?`; cmd({ t: "hello" }); } }, 4000);
}

const initial = cleanCode(location.hash.slice(1));
if (initial.length === 6) start(initial); else pairScreen();
