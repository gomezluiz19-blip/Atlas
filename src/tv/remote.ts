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
import { installEmojiGuard } from "../ui/noEmoji";

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
    $("div", { class: "r-orb-mini" }),
    $("div", { class: "r-brand" }, "TERRENO ", $("span", {}, "REMOTE")),
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
  });
  const cmd = (c: Cmd) => tv.send(c);
  let tools: Extract<State, { t: "tools" }> | null = null;
  window.setInterval(() => { cmd({ t: "ping" }); link.textContent = tv.direct ? "⚡ direct" : "via relay"; }, 4000);

  // ---- The deck: a big square, a trackball orb inside it, keys down both sides ----
  // The square's four edges are the d-pad; the orb is a wireframe globe you roll in any direction.
  const grid = $("canvas", { class: "r-orb-grid", "aria-hidden": "true" }) as HTMLCanvasElement;
  const orb = $("div", { class: "r-orb", role: "application", "aria-label": "Drag to spin the Earth, pinch to zoom, tap to pick" }, grid, $("div", { class: "r-orb-shine" }));
  const edges: Record<string, HTMLElement> = {};
  const DIRS = [["up", "▲"], ["right", "▶"], ["down", "▼"], ["left", "◀"]] as const;
  for (const [dir, glyph] of DIRS) edges[dir] = $("span", { class: `r-edge r-edge-${dir}`, "aria-hidden": "true" }, glyph);
  const square = $("div", { class: "r-square" },
    ...["tl", "tr", "bl", "br"].map((c) => $("i", { class: `r-corner r-corner-${c}` })),
    ...Object.values(edges), orb);
  const press = (dir: "up" | "down" | "left" | "right") => { buzz(10); edges[dir].classList.add("hit"); setTimeout(() => edges[dir].classList.remove("hit"), 180); cmd({ t: "dpad", dir }); };
  square.addEventListener("pointerdown", (e) => {
    if (orb.contains(e.target as Node)) return;
    const r = square.getBoundingClientRect();
    press(edgeDir(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)));
  });
  const hint = $("p", { class: "r-hint" }, "Drag to spin · pinch to zoom · tap to pick");
  const readout = $("p", { class: "r-readout", "aria-hidden": "true" });

  // The orb's grid: near side bright, far side a ghost; the equator and prime meridian picked out.
  let ball: M3 = turn(turn(IDENTITY, 0.08, 0), 0, -0.12);
  const draw = () => {
    const w = orb.clientWidth || 200, k = devicePixelRatio || 1;
    if (grid.width !== Math.round(w * k)) { grid.width = grid.height = Math.round(w * k); }
    const g = grid.getContext("2d");
    if (!g) return;
    const r = (w / 2) * 0.96, c = w / 2;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, w);
    g.lineCap = "round";
    for (const line of sphereLines(ball, 20, 72)) {
      const hot = line.kind !== "grid";
      for (let i = 1; i < line.pts.length; i++) {
        const a = line.pts[i - 1], b = line.pts[i], z = (a.z + b.z) / 2;
        const near = z > 0;
        // The pigments: cobalt grid, the equator in ochre, the prime meridian in terracotta.
        const rgb = line.kind === "equator" ? "220,174,76" : line.kind === "meridian" ? "217,128,93" : "143,168,242";
        g.strokeStyle = near ? `rgba(${rgb},${(hot ? 0.6 : 0.22) + z * (hot ? 0.35 : 0.5)})` : `rgba(${rgb},.07)`;
        g.lineWidth = near ? (hot ? 1.6 : 1.1) : 0.8;
        g.beginPath(); g.moveTo(c + a.x * r, c + a.y * r); g.lineTo(c + b.x * r, c + b.y * r); g.stroke();
      }
    }
    // How the ball is turned (it steers the TV's camera; it isn't the TV's own position).
    const yaw = Math.atan2(ball[6], ball[8]) * 180 / Math.PI, pitch = Math.asin(Math.max(-1, Math.min(1, -ball[7]))) * 180 / Math.PI;
    const deg = (v: number, w: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).padStart(w, "0")}°`;
    readout.textContent = `YAW ${deg(yaw, 5)}  PITCH ${deg(pitch, 4)}`;
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

  // Gestures: one finger spins, two pinch, a quick touch picks, hold opens the menu.
  const pts = new Map<number, { x: number; y: number }>();
  let last = { x: 0, y: 0, t: 0 }, vel = { x: 0, y: 0 }, travelled = 0, downAt = 0, lastTap = 0, pinch0 = 0, holdTimer = 0, coast = 0, tick = 0;
  const size = () => orb.getBoundingClientRect().width || 240;
  const spinLines = (dx: number, dy: number) => { idleAt = performance.now(); ball = turn(ball, dx, dy); draw(); };
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

  // ---- Keys down both sides of the square ----
  const key = (label: string, icon: string, fn: () => void, cls = "", short = label) => { const b = $("button", { class: `r-key ${cls}`, "aria-label": label }, $("span", {}, icon), $("small", {}, short)); b.addEventListener("click", () => { buzz(8); fn(); }); return b; };
  const deck = $("div", { class: "r-deck" },
    $("div", { class: "r-rail r-rail-left" },
      key("Back", "‹", () => cmd({ t: "back" })), key("Menu", "☰", () => cmd({ t: "menu" })),
      key("Zoom in", "+", () => cmd({ t: "zoom", f: 1.6 }), "", "In"), key("Zoom out", "−", () => cmd({ t: "zoom", f: 1 / 1.6 }), "", "Out")),
    square,
    $("div", { class: "r-rail r-rail-right" },
      key("Search", "⌕", () => enterTyping(true)), key("Voice", "◉", () => listenVoice(), "r-key-voice"),
      key("OK", "OK", () => cmd({ t: "select" }), "r-key-ok"), key("Next", "⏭", () => cmd({ t: "next" }))));

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

  root.replaceChildren(
    $("header", { class: "r-now" }, $("span", { class: "r-live" }), $("div", {}, $("small", {}, "On the TV ", link), titleEl, subEl), more),
    strip,
    $("div", { class: "r-stage" }, deck, readout, hint),
    $("div", { class: "r-typing" }, typeBar, sugg));
  cmd({ t: "hello" });
  setTimeout(() => { if (!root.classList.contains("live")) { titleEl.textContent = "Waiting for the TV…"; subEl.textContent = `Is the TV showing code ${code}?`; cmd({ t: "hello" }); } }, 4000);
}

installEmojiGuard();
const initial = cleanCode(location.hash.slice(1));
if (initial.length === 6) start(initial); else pairScreen();
