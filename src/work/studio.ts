// Make › Video as a studio: the globe on a monitor in the middle, framed to
// the video's shape, with everything for making the film around it. Shots on
// the left (save a view, play them in order, record them), the look and camera
// moves on the right, and the soundtrack, caption and record button below.
// What's on the monitor is what's recorded, place names included.
import { BoundingSphere, Cartesian3, EasingFunction, HeadingPitchRange, Math as CesiumMath } from "cesium";
import { glide, groundAt } from "../globe/controls";
import { LOOKS } from "../globe/looks";
import { h } from "../ui/dom";
import type { WorkCtx } from "./hub";
import { decks, orbit, play } from "./present";
import { ListStore, newId } from "./store";
import { clock, SHAPES, type Shape } from "./videoModel";
import { cleanView, fileName, getMusic, Recording, setMusic, settings } from "./video";

interface Shot { id: string; name: string; caption: string; pos: [number, number, number]; heading: number; pitch: number; roll: number; secs: number; thumb?: string }
const shots = new ListStore<Shot>("atlas.studio.shots.v1");
const RATIO: Record<Exclude<Shape, "screen">, number> = { wide: 16 / 9, square: 1, tall: 9 / 16 };

interface Take { url: string; ext: string; secs: number; size: number; name: string }
const takes: Take[] = [];

export function openStudio(ctx: WorkCtx) {
  const { app } = ctx;
  const viewer = app.globe.viewer, camera = viewer.camera, globeEl = document.getElementById("globe")!;
  ctx.close();
  if (settings.shape === "screen") settings.shape = "wide";
  document.body.classList.add("studio");
  const startTheme = app.theme.id;
  let look: string | null = app.looks?.active?.id ?? null;
  let stopMove: (() => void) | null = null;
  let rec: Recording | null = null, recStart = 0, tick = 0;
  let playing = 0;

  // ---- The monitor ------------------------------------------------------------------------------
  const titleOver = h("div", { class: "st-title" });
  const captionOver = h("div", { class: "st-caption" });
  const recBadge = h("div", { class: "st-rec", hidden: true }, h("i", {}), h("span", {}, "0:00"));
  const monitor = h("div", { class: "st-monitor", "aria-label": "What the camera sees" }, h("div", { class: "st-safe" }), titleOver, captionOver, recBadge);
  const overlays = () => {
    titleOver.textContent = settings.title;
    titleOver.hidden = !settings.title;
    captionOver.textContent = settings.caption;
    captionOver.hidden = !settings.caption;
  };

  const place = () => {
    const r = monitor.getBoundingClientRect();
    for (const el of [globeEl, app.labels?.el]) if (el) Object.assign(el.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, right: "auto", bottom: "auto" });
    // Cesium resizes with its container; nudge it now so the frame is right straight away.
    viewer.resize();
    app.labels?.refresh();
  };
  const fit = () => {
    const stage = monitor.parentElement!;
    const W = stage.clientWidth - 24, H = stage.clientHeight - 24, ar = RATIO[settings.shape as keyof typeof RATIO] ?? 16 / 9;
    const w = Math.min(W, H * ar), hh = w / ar;
    monitor.style.width = `${Math.round(w)}px`;
    monitor.style.height = `${Math.round(hh)}px`;
    requestAnimationFrame(place);
  };

  // ---- Shots (left) --------------------------------------------------------------------------------
  const shotList = h("div", { class: "st-shots" });
  const snapshot = () => new Promise<string | undefined>((resolve) => {
    const off = viewer.scene.postRender.addEventListener(() => {
      off();
      try {
        const c = viewer.scene.canvas, t = document.createElement("canvas");
        t.width = 160; t.height = Math.round((160 * c.height) / c.width);
        t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
        resolve(t.toDataURL("image/jpeg", 0.7));
      } catch { resolve(undefined); }
    });
    viewer.scene.requestRender();
  });
  const saveShot = async () => {
    const p = camera.positionWC;
    const shot: Shot = { id: newId(), name: `Shot ${shots.all().length + 1}`, caption: settings.caption, pos: [p.x, p.y, p.z], heading: camera.heading, pitch: camera.pitch, roll: camera.roll, secs: 4, thumb: await snapshot() };
    shots.push(shot);
    renderShots();
  };
  const goTo = (s: Shot, secs = 1.5) => new Promise<void>((resolve) => {
    camera.cancelFlight();
    camera.flyTo({ destination: new Cartesian3(...s.pos), orientation: { heading: s.heading, pitch: s.pitch, roll: s.roll }, duration: secs, easingFunction: EasingFunction.QUADRATIC_IN_OUT, complete: resolve, cancel: resolve });
  });
  const playShots = async (recording = false) => {
    const list = shots.all();
    if (!list.length) { app.toast("Save a shot or two first: frame a view and press “Save this shot”.", 4000); return; }
    const run = ++playing;
    if (recording) await startRec();
    await goTo(list[0], 0.01);
    for (let i = 0; i < list.length && run === playing; i++) {
      const s = list[i];
      settings.caption = s.caption; captionIn.value = s.caption; overlays();
      shotList.querySelectorAll(".st-shot").forEach((el, k) => el.classList.toggle("live", k === i));
      if (i > 0) await goTo(s, s.secs);
      await new Promise((r) => setTimeout(r, 1400));
    }
    shotList.querySelectorAll(".st-shot").forEach((el) => el.classList.remove("live"));
    if (recording && run === playing) await stopRec();
  };
  const renderShots = () => shotList.replaceChildren(
    ...shots.all().map((s, i) => h("div", { class: "st-shot" },
      h("button", { class: "st-thumb", title: "Go to this shot", onclick: () => void goTo(s) }, s.thumb ? h("img", { src: s.thumb, alt: "" }) : h("span", {}, String(i + 1))),
      h("div", { class: "st-shot-body" },
        h("input", { class: "st-shot-name", value: s.name, "aria-label": "Shot name", onchange: (e: Event) => { s.name = (e.target as HTMLInputElement).value || s.name; shots.save(s); } }),
        h("input", { class: "st-shot-cap", value: s.caption, placeholder: "Caption for this shot", "aria-label": "Caption", onchange: (e: Event) => { s.caption = (e.target as HTMLInputElement).value; shots.save(s); } }),
        h("label", { class: "st-secs" }, i ? "Fly in " : "Opens here", i ? h("select", { onchange: (e: Event) => { s.secs = +(e.target as HTMLSelectElement).value; shots.save(s); } },
          ...[2, 3, 4, 6, 8, 12].map((n) => h("option", { value: n, selected: s.secs === n }, `${n} s`))) : "")),
      h("div", { class: "st-shot-tools" },
        i > 0 ? h("button", { class: "icon-btn", "aria-label": "Earlier", title: "Earlier", onclick: () => { const all = shots.all(); [all[i - 1], all[i]] = [all[i], all[i - 1]]; shots.saveAll([...all]); renderShots(); } }, "↑") : "",
        h("button", { class: "icon-btn", "aria-label": `Delete ${s.name}`, onclick: () => { shots.remove(s.id); renderShots(); } }, "✕")))),
    shots.all().length ? "" : h("p", { class: "st-hint" }, "Frame a view on the monitor and save it as a shot. Play the shots and the camera flies between them, captions and all."));

  const deckPick = () => {
    const all = decks().filter((d) => d.slides.length);
    if (!all.length) return h("p", { class: "st-hint" }, "Presentations made in Present can be recorded here as flying tours.");
    const sel = h("select", { "aria-label": "Presentation" }, ...all.map((d) => h("option", { value: d.id }, d.name))) as HTMLSelectElement;
    return h("div", { class: "st-row" }, sel, h("button", { class: "pill-btn", onclick: () => void recordDeck(sel.value) }, "● Record tour"));
  };

  // ---- Look and moves (right) ----------------------------------------------------------------------
  const lookChips = h("div", { class: "st-looks" });
  const renderLooks = () => lookChips.replaceChildren(
    ...[{ id: null as string | null, emoji: "🛰️", name: "Satellite" }, ...Object.values(LOOKS).map((l) => ({ id: l.id as string | null, emoji: l.emoji, name: l.name }))].map((l) =>
      h("button", { class: `st-look${look === l.id ? " on" : ""}`, onclick: () => { look = l.id; app.looks?.preview(l.id); renderLooks(); } }, h("span", {}, l.emoji), h("small", {}, l.name))));
  const move = (label: string, emoji: string, fn: () => (() => void) | void) => h("button", { class: "st-move", onclick: (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    if (stopMove) { stopMove(); stopMove = null; document.querySelectorAll(".st-move.on").forEach((b) => b.classList.remove("on")); if (btn.classList.contains("was")) { btn.classList.remove("was"); return; } }
    const stop = fn();
    if (stop) { stopMove = stop; btn.classList.add("on", "was"); }
  } }, h("span", {}, emoji), h("small", {}, label));
  const target = () => groundAt(viewer);
  const moves = h("div", { class: "st-moves" },
    move("Circle", "🔄", () => orbit(app, 45)),
    move("Drift in", "🔍", () => { const t = target(); if (t) glide(viewer, t, 0.45, 10); }),
    move("Pull back", "🔭", () => { const t = target(); if (t) glide(viewer, t, 3, 7); }),
    move("Tilt up", "🏔️", () => {
      const t = target(); if (!t) return;
      camera.flyToBoundingSphere(new BoundingSphere(t, 1), { offset: new HeadingPitchRange(camera.heading, CesiumMath.toRadians(-18), Cartesian3.distance(camera.positionWC, t) * 0.8), duration: 4, easingFunction: EasingFunction.QUADRATIC_IN_OUT });
    }),
    move("Top down", "⬇️", () => {
      const t = target(); if (!t) return;
      camera.flyToBoundingSphere(new BoundingSphere(t, 1), { offset: new HeadingPitchRange(camera.heading, CesiumMath.toRadians(-89.5), Cartesian3.distance(camera.positionWC, t)), duration: 3 });
    }),
    move("Spin Earth", "🌍", () => {
      const off = viewer.scene.preRender.addEventListener(() => camera.rotate(Cartesian3.UNIT_Z, -0.0025));
      return () => off();
    }));

  // ---- Sound, caption and record (bottom) ----------------------------------------------------------
  const captionIn = h("input", { class: "st-caption-in", value: settings.caption, placeholder: "Caption: shown in the lower third, change it any time", "aria-label": "Caption", oninput: (e: Event) => { settings.caption = (e.target as HTMLInputElement).value; overlays(); } }) as HTMLInputElement;
  const meter = h("i", { class: "st-meter" });
  let meterStop: (() => void) | null = null;
  const listen = async (on: boolean) => {
    meterStop?.(); meterStop = null;
    if (!on) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext(), an = ac.createAnalyser();
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let raf = 0;
      const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); meter.style.setProperty("--l", String(Math.min(1, m / 64))); raf = requestAnimationFrame(loop); };
      loop();
      meterStop = () => { cancelAnimationFrame(raf); s.getTracks().forEach((t) => t.stop()); void ac.close(); meter.style.setProperty("--l", "0"); };
    } catch {
      settings.mic = false; micBtn.classList.remove("on");
      app.toast("No microphone (permission was refused or there isn't one).", 4000);
    }
  };
  const micBtn = h("button", { class: `st-toggle${settings.mic ? " on" : ""}`, title: "Narrate with the microphone", onclick: () => { settings.mic = !settings.mic; micBtn.classList.toggle("on", settings.mic); void listen(settings.mic); } }, "🎙️ Mic", meter);
  const musicName = h("small", {}, getMusic()?.name ?? "");
  const musicIn = h("input", { type: "file", accept: "audio/*", hidden: true, onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0] ?? null; setMusic(f); musicName.textContent = f?.name ?? ""; musicBtn.classList.toggle("on", !!f); } }) as HTMLInputElement;
  const musicBtn = h("button", { class: `st-toggle${getMusic() ? " on" : ""}`, title: "Add music or a voice-over file", onclick: () => musicIn.click() }, "🎵 Music ", musicName);
  const toggle = (label: string, key: "names" | "credits", title: string) => {
    const b = h("button", { class: `st-toggle${settings[key] ? " on" : ""}`, title, onclick: () => { settings[key] = !settings[key]; b.classList.toggle("on", settings[key]); if (key === "names") app.labels?.setVisible(settings.names); } }, label);
    return b;
  };
  const recBtn = h("button", { class: "st-record", "aria-label": "Record", onclick: () => void (rec ? stopRec() : startRec()) }, h("i", {}), h("span", {}, "Record"));
  const takeList = h("div", { class: "st-takes" });
  const renderTakes = () => takeList.replaceChildren(...takes.map((t) => h("div", { class: "st-take" },
    h("video", { src: t.url, muted: true, playsinline: true, preload: "metadata", onmouseenter: (e: Event) => void (e.target as HTMLVideoElement).play().catch(() => {}), onmouseleave: (e: Event) => (e.target as HTMLVideoElement).pause() }),
    h("div", {}, h("strong", {}, clock(t.secs * 1000)), h("small", {}, `${(t.size / 1e6).toFixed(1)} MB`)),
    h("a", { class: "pill-btn", href: t.url, download: t.name }, "Save"))));

  const startRec = async () => {
    if (rec) return;
    const r = new Recording(app, settings);
    try { await r.start(); } catch (e) { app.toast((e as Error).message, 6000); return; }
    rec = r; recStart = performance.now();
    document.body.classList.add("st-recording");
    recBadge.hidden = false;
    recBtn.querySelector("span")!.textContent = "Stop";
    tick = window.setInterval(() => { recBadge.querySelector("span")!.textContent = clock(performance.now() - recStart); }, 500);
  };
  const stopRec = async () => {
    const r = rec;
    if (!r) return;
    rec = null;
    clearInterval(tick);
    const blob = await r.stop();
    document.body.classList.remove("st-recording");
    recBadge.hidden = true;
    recBtn.querySelector("span")!.textContent = "Record";
    takes.unshift({ url: URL.createObjectURL(blob), ext: r.ext, secs: (performance.now() - recStart) / 1000, size: blob.size, name: fileName(r.ext) });
    renderTakes();
    app.toast("Take saved below the monitor. Press Save to download it.", 3500);
  };
  const recordDeck = async (id: string) => {
    const deck = decks().find((d) => d.id === id);
    if (!deck) return;
    await startRec();
    if (!rec) return;
    const r = rec;
    const show = play(app, deck, { tour: true, onSlide: (s) => (r.slide = s) });
    await show.done;
    show.close();
    await stopRec();
  };

  // ---- Frame ---------------------------------------------------------------------------------------
  const shapeBtns = h("div", { class: "st-shapes", role: "radiogroup", "aria-label": "Shape" }, ...(["wide", "square", "tall"] as const).map((k) =>
    h("button", { class: `st-shape${settings.shape === k ? " on" : ""}`, role: "radio", "aria-checked": String(settings.shape === k), title: SHAPES[k].label, onclick: () => {
      settings.shape = k;
      shapeBtns.querySelectorAll(".st-shape").forEach((b, i) => { const on = ["wide", "square", "tall"][i] === k; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
      fit();
    } }, h("i", { class: `st-ar ${k}` }), k === "wide" ? "16:9" : k === "square" ? "1:1" : "9:16")));
  const titleIn = h("input", { class: "st-title-in", value: settings.title, placeholder: "Title of your film (optional)", "aria-label": "Title", oninput: (e: Event) => { settings.title = (e.target as HTMLInputElement).value; overlays(); } });

  const exit = () => {
    playing++;
    stopMove?.();
    meterStop?.();
    if (rec) void stopRec();
    document.body.classList.remove("studio", "st-recording");
    for (const el of [globeEl, app.labels?.el]) if (el) el.removeAttribute("style");
    viewer.resize();
    app.labels?.setVisible(true);
    app.labels?.refresh();
    app.looks?.restore();
    removeEventListener("resize", fit);
    removeEventListener("keydown", onKey);
    root.remove();
    if (app.theme.id !== startTheme) app.setTheme(startTheme);
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
    if (e.key === "Escape" && !rec) exit();
    if (e.key === "r" || e.key === "R") void (rec ? stopRec() : startRec());
    if (e.key === "s" || e.key === "S") void saveShot();
  };

  const root = h("div", { class: "studio-root", role: "dialog", "aria-label": "Video studio" },
    h("header", { class: "st-head" },
      h("strong", { class: "st-brand" }, "🎬 Studio"), titleIn, shapeBtns,
      h("button", { class: "pill-btn", title: "Hide everything but the globe, for streaming", onclick: () => { exit(); cleanView(app); } }, "Stream view"),
      h("button", { class: "primary-btn", onclick: exit }, "Done")),
    h("aside", { class: "st-left" },
      h("section", {}, h("h3", {}, "Shots"),
        h("div", { class: "st-row" },
          h("button", { class: "pill-btn st-save", onclick: () => void saveShot(), title: "Save the view on the monitor (S)" }, "＋ Save this shot"),
          h("button", { class: "pill-btn", onclick: () => void playShots() }, "▶ Play")),
        shotList,
        h("button", { class: "pill-btn st-recshots", onclick: () => void playShots(true) }, "● Record the shots")),
      h("section", {}, h("h3", {}, "Presentations"), deckPick())),
    h("div", { class: "st-stage" }, monitor),
    h("aside", { class: "st-right" },
      h("section", {}, h("h3", {}, "Look"), lookChips),
      h("section", {}, h("h3", {}, "Camera moves"), moves, h("p", { class: "st-hint" }, "Tap a move while recording. Circle and Spin keep going until you tap them again.")),
      h("section", {}, h("h3", {}, "On the picture"), h("div", { class: "st-row wrap" },
        toggle("🏷️ Place names", "names", "Draw the map's place names into the video"),
        toggle("©️ Credits", "credits", "Write the map credits in the corner (keep them when you share)")))),
    h("footer", { class: "st-deck" },
      captionIn, micBtn, musicBtn, musicIn, recBtn),
    h("div", { class: "st-takes-wrap" }, takeList));

  document.body.append(root);
  overlays();
  renderShots();
  renderLooks();
  renderTakes();
  if (settings.mic) void listen(true);
  addEventListener("resize", fit);
  addEventListener("keydown", onKey);
  // On phones the studio scrolls; the globe follows its monitor.
  root.addEventListener("scroll", () => requestAnimationFrame(place), { passive: true });
  requestAnimationFrame(fit);
}
