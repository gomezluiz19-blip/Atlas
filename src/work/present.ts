// Work › Present: presentations made of places. Each slide is a view of the
// globe with a caption, and can show the world's borders in a past year (for
// history projects) and any map layers. Play them one by one, or as a tour
// that flies from place to place and slowly circles each one.
import { Cartesian2, Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, Rectangle } from "cesium";
import type { App } from "../app";
import { HISTORY_CREDIT, HistoryLayer, YEARS, nearestYear, polityColor as polityColorCss, yearLabel, type Polity } from "../data/history";
import { h } from "../ui/dom";
import type { WorkCtx } from "./hub";
import { deckFromJson, slideSeconds, type Deck, type Slide, type SlideCamera } from "./presentModel";
import { ListStore, download, newId } from "./store";

const store = new ListStore<Deck>("atlas.work.decks.v1");
export const decks = () => store.all();
export const saveDeck = (d: Deck) => store.save(d);

// ---- The borders layer, shared by the explorer and the player ------------------

let history: HistoryLayer | null = null;
export function borders(app: App): HistoryLayer {
  if (!history) history = new HistoryLayer(app.globe.viewer);
  return history;
}

/** Shows (or, with null, hides) historical borders, and lists them on the canvas. */
export async function showYear(app: App, year: number | null): Promise<Polity[]> {
  const layer = borders(app);
  if (year === null) {
    await layer.show(null);
    app.canvas.drop("work:borders");
    return [];
  }
  const list = await layer.show(year);
  app.canvas.put({
    id: "work:borders", label: `Borders in ${yearLabel(year)}`, color: "#e0b050", scope: "world", pinned: true,
    show: (on) => layer.setVisible(on),
    remove: () => void showYear(app, null),
  }, true);
  return list;
}

// ---- Views ------------------------------------------------------------------------

/** The current camera, and a small picture of what's on screen. */
export function captureView(app: App): Promise<{ camera: SlideCamera; thumb?: string }> {
  const { viewer } = app.globe;
  const cam = viewer.camera, c = cam.positionCartographic;
  const camera: SlideCamera = { lon: CesiumMath.toDegrees(c.longitude), lat: CesiumMath.toDegrees(c.latitude), height: c.height, heading: cam.heading, pitch: cam.pitch, roll: cam.roll };
  return new Promise((resolve) => {
    const scene = viewer.scene;
    // The WebGL canvas can only be read in the frame it was drawn.
    const off = scene.postRender.addEventListener(() => {
      off();
      let thumb: string | undefined;
      try {
        const src = scene.canvas, w = 320, hgt = Math.round((w * src.height) / src.width);
        const out = document.createElement("canvas");
        out.width = w;
        out.height = hgt;
        out.getContext("2d")!.drawImage(src, 0, 0, w, hgt);
        thumb = out.toDataURL("image/jpeg", 0.72);
      } catch {
        /* a map layer without CORS: keep the view, skip the picture */
      }
      resolve({ camera, thumb });
    });
    scene.requestRender();
  });
}

export function flyToView(app: App, v: SlideCamera, duration = 2.5): Promise<void> {
  return new Promise((resolve) => {
    app.globe.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(v.lon, v.lat, v.height),
      orientation: { heading: v.heading, pitch: v.pitch, roll: v.roll },
      duration,
      complete: () => resolve(),
      cancel: () => resolve(),
    });
  });
}

/** Slowly circles the point in the middle of the screen; returns a stop function. */
export function orbit(app: App, secondsPerTurn = 90): () => void {
  const { scene, camera } = app.globe.viewer;
  const c = scene.canvas;
  const ray = camera.getPickRay(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
  const target = ray && scene.globe.pick(ray, scene);
  if (!target) return () => {};
  const range = Cartesian3.distance(camera.positionWC, target);
  const pitch = Math.min(camera.pitch, -0.2);
  let heading = camera.heading, last = performance.now(), stopped = false;
  const remove = scene.preRender.addEventListener(() => {
    const now = performance.now();
    heading += ((now - last) / 1000) * ((2 * Math.PI) / secondsPerTurn);
    last = now;
    camera.lookAt(target, new HeadingPitchRange(heading, pitch, range));
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    remove();
    camera.lookAtTransform(Matrix4.IDENTITY);
    scene.canvas.removeEventListener("pointerdown", stop);
  };
  scene.canvas.addEventListener("pointerdown", stop);
  return stop;
}

/** Map layers switched on right now (so a slide can bring them back). */
const layersOn = (app: App) => [...app.actions].filter(([id, a]) => !id.startsWith("work:borders:") && a.isOn?.()).map(([id]) => id);

// ---- Playing a deck ------------------------------------------------------------------

export interface PlayOptions {
  /** Advance by itself and circle each place. */
  tour?: boolean;
  start?: number;
  /** Called when each slide appears (Video uses it for captions). */
  onSlide?(s: Slide, i: number): void;
  /** Classroom tools: bigger text, a pen to draw over the globe, notes and a timer. */
  teach?: boolean;
  /** Stories this one leads on to, offered on the last slide. */
  next?: { title: string; go(): void }[];
}

/** A see-through layer to draw on over the globe while teaching. */
function penLayer() {
  const c = h("canvas", { class: "pen-layer" }) as HTMLCanvasElement;
  const g = c.getContext("2d")!;
  let on = false, down = false, color = "#ff3b30";
  const size = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; g.scale(devicePixelRatio, devicePixelRatio); };
  size();
  addEventListener("resize", size);
  c.addEventListener("pointerdown", (e) => { if (!on) return; down = true; g.beginPath(); g.moveTo(e.clientX, e.clientY); c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointermove", (e) => {
    if (!down) return;
    g.lineTo(e.clientX, e.clientY);
    g.strokeStyle = color; g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
    g.stroke();
  });
  c.addEventListener("pointerup", () => (down = false));
  return {
    el: c,
    toggle(v = !on) { on = v; c.classList.toggle("on", on); return on; },
    color(v: string) { color = v; },
    clear() { g.clearRect(0, 0, c.width, c.height); },
    dispose() { removeEventListener("resize", size); },
  };
}

/** Plays a deck full screen; resolves when it ends or is closed. */
export function play(app: App, deck: Deck, opts: PlayOptions = {}): { done: Promise<void>; close(): void; step(dir: 1 | -1): void } {
  let i = -1, stopOrbit = () => {}, timer = 0, closed = false, token = 0, paused = false;
  const prevYear = borders(app).year;
  const card = h("div", { class: "present-card" });
  const counter = h("span", { class: "present-count" });
  const pauseBtn = h("button", { class: "present-btn", "aria-label": "Pause" }, "❚❚");
  // Teaching tools.
  const pen = opts.teach ? penLayer() : null;
  const notes = h("div", { class: "present-notes", hidden: true });
  const clock = h("span", { class: "present-clock", title: "Time since you started" }, "0:00");
  const t0 = performance.now();
  const clockTimer = opts.teach ? window.setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000) : 0;
  const penBtn = h("button", { class: "present-btn", "aria-label": "Draw on the screen", title: "Draw (D)", onclick: () => penBtn.classList.toggle("on", pen!.toggle()) }, "✎");
  const colours = h("span", { class: "present-colours" }, ...["#ff3b30", "#ffd60a", "#30d158", "#ffffff"].map((c) =>
    h("button", { class: "present-swatch", style: `background:${c}`, "aria-label": "Pen colour", onclick: () => { pen!.color(c); if (!penBtn.classList.contains("on")) penBtn.click(); } })));
  const notesBtn = h("button", { class: "present-btn", "aria-label": "Show my notes", title: "Notes (N)", onclick: () => { notes.hidden = !notes.hidden; notesBtn.classList.toggle("on", !notes.hidden); } }, "🗒");
  const root = h("div", { class: "present" + (opts.teach ? " teach" : ""), role: "dialog", "aria-label": deck.name },
    pen ? pen.el : "",
    card, notes,
    h("div", { class: "present-bar" },
      h("button", { class: "present-btn", "aria-label": "Previous slide", onclick: () => go(i - 1) }, "‹"),
      counter,
      h("button", { class: "present-btn", "aria-label": "Next slide", onclick: () => go(i + 1) }, "›"),
      opts.tour ? pauseBtn : "",
      opts.teach ? penBtn : "", opts.teach ? colours : "", opts.teach ? h("button", { class: "present-btn", "aria-label": "Clear drawing", title: "Clear (C)", onclick: () => pen!.clear() }, "⌫") : "",
      opts.teach ? notesBtn : "", opts.teach ? clock : "",
      h("button", { class: "present-btn", "aria-label": "End presentation", onclick: () => close() }, "✕")));
  let resolveDone = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));

  const schedule = () => {
    clearTimeout(timer);
    if (opts.tour && !paused && i >= 0) timer = window.setTimeout(() => go(i + 1), slideSeconds(deck.slides[i]) * 1000);
  };
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "▶" : "❚❚";
    pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
    schedule();
  });

  const go = async (n: number) => {
    if (closed) return;
    if (n >= deck.slides.length) return opts.tour && !opts.next?.length ? close() : undefined;
    if (n < 0) return;
    i = n;
    const my = ++token;
    const s = deck.slides[i];
    stopOrbit();
    clearTimeout(timer);
    counter.textContent = `${i + 1} / ${deck.slides.length}`;
    pen?.clear();
    notes.replaceChildren(h("strong", {}, "Notes"), h("p", {}, s.notes || "No notes for this slide."));
    const last = i === deck.slides.length - 1;
    card.replaceChildren(
      s.year !== undefined ? h("span", { class: "present-year" }, yearLabel(s.year)) : "",
      h("h2", {}, s.title || deck.name),
      s.text ? h("p", {}, s.text) : "",
      last && opts.next?.length ? h("div", { class: "present-next" }, h("small", {}, "Continue with"),
        ...opts.next.map((n) => h("button", { class: "present-next-btn", onclick: () => { close(); n.go(); } }, `${n.title} →`))) : "");
    card.classList.remove("in");
    void card.offsetWidth;
    card.classList.add("in");
    opts.onSlide?.(s, i);
    void showYear(app, s.year ?? null).catch(() => app.toast("Couldn't load the borders for that year. Check the connection.", 5000));
    for (const id of s.layers ?? []) {
      const a = app.actions.get(id);
      if (a && !a.isOn?.()) a.run();
    }
    await flyToView(app, s.camera, i === 0 && n === 0 ? 2 : 3);
    if (my !== token || closed) return;
    // Slides from a template get their picture the first time they're shown.
    if (!s.thumb) void captureView(app).then((v) => { if (v.thumb && store.get(deck.id)) { s.thumb = v.thumb; store.save(deck); } });
    if (s.orbit || opts.tour) stopOrbit = orbit(app, s.orbit ? 70 : 140);
    schedule();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); void go(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); void go(i - 1); }
    else if (e.key === "Escape") close();
    else if (opts.teach && (e.target as HTMLElement).tagName !== "INPUT") {
      if (e.key === "d" || e.key === "D") penBtn.click();
      else if (e.key === "n" || e.key === "N") notesBtn.click();
      else if (e.key === "c" || e.key === "C") pen!.clear();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stopOrbit();
    clearTimeout(timer);
    removeEventListener("keydown", onKey);
    clearInterval(clockTimer);
    pen?.dispose();
    root.remove();
    document.body.classList.remove("presenting");
    void showYear(app, prevYear).catch(() => {});
    resolveDone();
  };
  addEventListener("keydown", onKey);
  document.body.classList.add("presenting");
  document.body.append(root);
  void go(opts.start ?? 0);
  return { done, close, step: (dir) => void go(i + dir) };
}

// ---- Screens ---------------------------------------------------------------------------

/** Stories open on the library: find one to use or remix, or make your own. */
export function openPresent(ctx: WorkCtx) {
  void import("../stories/ui").then((m) => m.openLibrary(ctx));
}

/** Opens a presentation file someone sent (the older way to share). */
export function openFile(ctx: WorkCtx) {
  const fileIn = h("input", { type: "file", accept: ".json,application/json", onchange: async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    try {
      const d = deckFromJson(JSON.parse(await f.text()), newId);
      if (!d) throw new Error();
      store.save(d);
      openDeck(ctx, d.id);
    } catch {
      ctx.app.toast("That file isn't an Terreno story or presentation.", 5000);
    }
  } }) as HTMLInputElement;
  fileIn.click();
}

/** Starts a story from one of the ready-made topics. */
export function fromTemplate(ctx: WorkCtx, name: string, slides: Omit<Slide, "id">[]) {
  const d: Deck = { id: newId(), name, created: Date.now(), slides: slides.map((x) => ({ ...x, id: newId() })) };
  store.save(d);
  openDeck(ctx, d.id);
}

export function openDeck(ctx: WorkCtx, id: string) {
  const d = store.get(id);
  if (!d) return openPresent(ctx);
  const { app } = ctx;
  const save = () => store.save(d);
  const again = () => openDeck(ctx, id);
  const publish = h("div");
  void import("../stories/ui").then((m) => publish.replaceWith(m.publishSection(ctx, d, again)));
  const addSlide = async () => {
    const { camera, thumb } = await captureView(app);
    const year = borders(app).year ?? undefined;
    d.slides.push({ id: newId(), title: (year !== undefined ? `The world in ${yearLabel(year)}` : `Slide ${d.slides.length + 1}`), text: "", camera, thumb, year, layers: layersOn(app) });
    save();
    again();
  };
  const yearSelect = (s: Slide) =>
    h("select", { "aria-label": "Borders", onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      s.year = v === "" ? undefined : Number(v);
      save();
      void showYear(app, s.year ?? null);
    } },
      h("option", { value: "", selected: s.year === undefined }, "No borders"),
      ...YEARS.map((y) => h("option", { value: String(y), selected: s.year === y }, `Borders ${yearLabel(y)}`)));

  const slideRow = (s: Slide, k: number) =>
    h("div", { class: "present-slide" },
      h("button", { class: "present-thumb", title: "Go to this view", onclick: () => { void flyToView(app, s.camera); void showYear(app, s.year ?? null); } },
        s.thumb ? h("img", { src: s.thumb, alt: "" }) : h("span", {}, String(k + 1)),
        h("span", { class: "present-num" }, String(k + 1))),
      h("div", { class: "present-fields" },
        h("input", { class: "mp-label", value: s.title, placeholder: "Title", "aria-label": "Slide title", onchange: (e: Event) => { s.title = (e.target as HTMLInputElement).value; save(); } }),
        h("textarea", { class: "mp-notes", rows: 2, placeholder: "What to say about this place", "aria-label": "Slide text", onchange: (e: Event) => { s.text = (e.target as HTMLTextAreaElement).value; save(); } }, s.text),
        h("textarea", { class: "mp-notes present-notes-input", rows: 1, placeholder: "Presenter notes (only shown when you ask)", "aria-label": "Presenter notes", onchange: (e: Event) => { s.notes = (e.target as HTMLTextAreaElement).value || undefined; save(); } }, s.notes ?? ""),
        h("div", { class: "present-opts" },
          yearSelect(s),
          h("label", { class: "present-check" }, h("input", { type: "checkbox", checked: !!s.orbit, onchange: (e: Event) => { s.orbit = (e.target as HTMLInputElement).checked || undefined; save(); } }), "Circle"),
          s.layers?.length ? h("span", { class: "muted small", title: s.layers.map((l) => app.actions.get(l)?.label ?? l).join(", ") }, `${s.layers.length} layer${s.layers.length === 1 ? "" : "s"}`) : ""),
        h("div", { class: "present-actions" },
          h("button", { class: "link-btn", onclick: async () => { const v = await captureView(app); s.camera = v.camera; s.thumb = v.thumb ?? s.thumb; s.layers = layersOn(app); save(); again(); } }, "Use current view"),
          k > 0 ? h("button", { class: "link-btn", onclick: () => { [d.slides[k - 1], d.slides[k]] = [d.slides[k], d.slides[k - 1]]; save(); again(); } }, "Move up") : "",
          h("button", { class: "link-btn danger", onclick: () => { d.slides.splice(k, 1); save(); again(); } }, "Delete"))));

  ctx.show("Story", () => openPresent(ctx),
    h("input", { class: "mp-name", value: d.name, "aria-label": "Story name", onchange: (e: Event) => { d.name = (e.target as HTMLInputElement).value || d.name; save(); } }),
    h("p", { class: "muted small" }, "Move the globe to what you want to show (turn on borders or layers too), then add it as a slide."),
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: () => void addSlide() }, "+ Add this view as a slide"),
      h("button", { class: "chip", onclick: () => openBorders(ctx, d.id) }, "Borders through time")),
    d.slides.length ? h("div", { class: "present-slides" }, ...d.slides.map(slideRow)) : h("p", { class: "muted small" }, "No slides yet."),
    d.slides.length ? h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => { ctx.close(); void play(app, d).done.then(() => ctx.unhide()); } }, "Play slides"),
      h("button", { class: "pill-btn", onclick: () => { ctx.close(); play(app, d, { tour: true }); } }, "Play as a tour"),
      h("button", { class: "pill-btn", title: "Bigger text, a pen to draw on the globe, your notes and a timer", onclick: () => { ctx.close(); play(app, d, { teach: true }); } }, "Teach with it")) : "",
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => download(`${d.name.replace(/[^\w -]+/g, "").trim() || "presentation"}.atlas.json`, JSON.stringify(d)) }, "Save as a file"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${d.name}"?`)) { store.remove(d.id); openPresent(ctx); } } }, "Delete story")),
    publish,
    h("p", { class: "muted small" }, "While playing: arrow keys or the buttons move between places; Esc ends it. ", HISTORY_CREDIT, "."),
  );
}

/** The world's borders in any of 54 years, with a slider, and a search for who ruled where. */
export function openBorders(ctx: WorkCtx, deckId?: string) {
  const { app } = ctx;
  let idx = YEARS.indexOf(nearestYear(borders(app).year ?? 1914));
  let polities: Polity[] = [];
  const label = h("strong", { class: "borders-year" });
  const status = h("p", { class: "muted small" });
  const results = h("div", { class: "list" });
  const slider = h("input", { type: "range", min: 0, max: YEARS.length - 1, step: 1, value: idx, "aria-label": "Year", class: "borders-slider" }) as HTMLInputElement;
  const find = h("input", { class: "pro-url", placeholder: "Find a country or empire in this year", "aria-label": "Find a country or empire" }) as HTMLInputElement;

  const list = () => {
    const q = find.value.trim().toLowerCase();
    const matches = (q ? polities.filter((p) => p.name.toLowerCase().includes(q)) : [...polities].sort((a, b) => b.area - a.area)).slice(0, 8);
    results.replaceChildren(...matches.map((p) =>
      h("button", { class: "list-row", onclick: () => {
        const [w, s, e, n] = p.bbox;
        app.globe.viewer.camera.flyTo({ destination: Rectangle.fromDegrees(w - 2, s - 2, e + 2, n + 2), duration: 2 });
      } },
        h("span", { class: "dot big", style: `background:${polityColorCss(p.name)}` }),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name)),
        h("span", { class: "chev", html: "&rsaquo;" }))));
  };
  const load = async () => {
    const y = YEARS[idx];
    label.textContent = yearLabel(y);
    status.textContent = "Loading borders…";
    try {
      polities = await showYear(app, y);
      if (YEARS[idx] !== y) return;
      status.textContent = `${polities.length} states, empires and peoples mapped. Type a name to find one, or pick from the largest:`;
      list();
    } catch {
      status.textContent = "Couldn't load the borders for this year. Check the connection and try again.";
    }
  };
  let t = 0;
  slider.addEventListener("input", () => {
    idx = Number(slider.value);
    label.textContent = yearLabel(YEARS[idx]);
    clearTimeout(t);
    t = window.setTimeout(() => void load(), 250);
  });
  find.addEventListener("input", list);
  const step = (d: number) => { idx = Math.max(0, Math.min(YEARS.length - 1, idx + d)); slider.value = String(idx); void load(); };
  const target = deckId ? store.get(deckId) : undefined;

  ctx.show("Borders through time", () => (deckId ? openDeck(ctx, deckId) : openPresent(ctx)),
    h("p", { class: "mp-intro" }, "Slide through history to see who ruled where, from the ice age to today."),
    h("div", { class: "borders-head" },
      h("button", { class: "icon-btn", "aria-label": "Earlier", onclick: () => step(-1) }, "‹"), label,
      h("button", { class: "icon-btn", "aria-label": "Later", onclick: () => step(1) }, "›")),
    slider,
    h("div", { class: "borders-scale muted small" }, h("span", {}, yearLabel(YEARS[0])), h("span", {}, yearLabel(YEARS[YEARS.length - 1]))),
    status, find, results,
    h("div", { class: "pro-actions" },
      target
        ? h("button", { class: "primary-btn", onclick: async () => {
            const { camera, thumb } = await captureView(app);
            target.slides.push({ id: newId(), title: `The world in ${yearLabel(YEARS[idx])}`, text: "", camera, thumb, year: YEARS[idx], layers: layersOn(app) });
            store.save(target);
            openDeck(ctx, target.id);
          } }, `Add this to "${target.name}"`)
        : h("button", { class: "primary-btn", onclick: async () => {
            const { camera, thumb } = await captureView(app);
            const d: Deck = { id: newId(), name: `The world in ${yearLabel(YEARS[idx])}`, created: Date.now(), slides: [{ id: newId(), title: `The world in ${yearLabel(YEARS[idx])}`, text: "", camera, thumb, year: YEARS[idx] }] };
            store.save(d);
            openDeck(ctx, d.id);
          } }, "Start a presentation here"),
      h("button", { class: "pill-btn", onclick: () => { void showYear(app, null); ctx.home(); } }, "Borders off")),
    h("p", { class: "muted small" }, "Borders before about 1800 are approximate, and many peoples lived outside any state. ", HISTORY_CREDIT, "."),
  );
  void load();
}

