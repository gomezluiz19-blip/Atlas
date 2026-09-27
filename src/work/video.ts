// Work › Video: records the globe as a video, with a title, captions and
// narration (microphone and/or a music or voice-over file), in widescreen,
// square or vertical. Presentations can be recorded as flying tours with their
// slide captions. A clean view hides the controls for streaming with OBS or
// any screen-capture tool.
import type { App } from "../app";
import { yearLabel } from "../data/history";
import { h } from "../ui/dom";
import type { WorkCtx } from "./hub";
import { decks, orbit, play } from "./present";
import type { Slide } from "./presentModel";
import { SHAPES, clock, coverCrop, outputSize, pickMime, wrap, type Shape } from "./videoModel";

interface Settings { shape: Shape; title: string; caption: string; mic: boolean; credits: boolean }
const settings: Settings = { shape: "wide", title: "", caption: "", mic: false, credits: true };
let music: File | null = null;

/** Draws the globe plus titles into a canvas every frame and records it. */
class Recording {
  readonly out = document.createElement("canvas");
  slide: Slide | null = null;
  private recorder!: MediaRecorder;
  private chunks: Blob[] = [];
  private offFrame = () => {};
  private cleanup: (() => void)[] = [];
  readonly started = performance.now();
  ext = "webm";

  constructor(private app: App, private s: Settings) {}

  async start(): Promise<void> {
    const format = pickMime((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
    if (!format) throw new Error("This browser can't record video. Try Chrome, Edge or Firefox.");
    this.ext = format.ext;
    const scene = this.app.globe.viewer.scene, src = scene.canvas;
    const { w, h: hh } = outputSize(this.s.shape, src.width, src.height);
    this.out.width = w;
    this.out.height = hh;
    const g = this.out.getContext("2d")!;
    const credits = mapCredits(this.app);
    this.offFrame = scene.postRender.addEventListener(() => this.draw(g, src, credits));

    const stream = this.out.captureStream(30);
    // Sound: the microphone and a music file, mixed.
    const audio: MediaStreamTrack[] = [];
    if (this.s.mic || music) {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      this.cleanup.push(() => void ac.close());
      if (this.s.mic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          ac.createMediaStreamSource(mic).connect(dest);
          this.cleanup.push(() => mic.getTracks().forEach((t) => t.stop()));
        } catch {
          this.app.toast("No microphone (permission was refused or there isn't one). Recording without narration.", 6000);
        }
      }
      if (music) {
        const el = new Audio(URL.createObjectURL(music));
        el.loop = true;
        const node = ac.createMediaElementSource(el);
        const gain = ac.createGain();
        gain.gain.value = this.s.mic ? 0.35 : 1;
        node.connect(gain).connect(dest);
        void el.play();
        this.cleanup.push(() => { el.pause(); URL.revokeObjectURL(el.src); });
      }
      audio.push(...dest.stream.getAudioTracks());
    }
    this.recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...audio]), { mimeType: format.mime, videoBitsPerSecond: 8_000_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        this.offFrame();
        this.cleanup.forEach((f) => f());
        resolve(new Blob(this.chunks, { type: this.recorder.mimeType }));
      };
      if (this.recorder.state !== "inactive") this.recorder.stop();
    });
  }

  private draw(g: CanvasRenderingContext2D, src: HTMLCanvasElement, credits: string) {
    const { width: w, height: hh } = this.out;
    const c = coverCrop(src.width, src.height, w, hh);
    g.drawImage(src, c.sx, c.sy, c.sw, c.sh, 0, 0, w, hh);
    const u = Math.min(w, hh) / 1080, pad = 48 * u;
    const font = (weight: number, px: number) => `${weight} ${Math.round(px * u)}px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
    g.textBaseline = "top";
    if (this.s.title) {
      g.font = font(700, 64);
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 16 * u;
      g.fillStyle = "#fff";
      wrap(this.s.title, w - 2 * pad, (t) => g.measureText(t).width, 2).forEach((l, i) => g.fillText(l, pad, pad + i * 74 * u));
      g.shadowBlur = 0;
    }
    // Lower third: the slide in a tour, else the caption.
    const heading = this.slide?.title ?? "", body = this.slide ? this.slide.text : this.s.caption;
    const chip = this.slide?.year !== undefined ? yearLabel(this.slide.year) : "";
    if (heading || body) {
      const bw = Math.min(w - 2 * pad, 1100 * u), ip = 28 * u;
      g.font = font(700, 44);
      const hl = heading ? wrap(heading, bw - 2 * ip, (t) => g.measureText(t).width, 2) : [];
      g.font = font(400, 32);
      const bl = body ? wrap(body, bw - 2 * ip, (t) => g.measureText(t).width, 4) : [];
      const chipH = chip ? 48 * u : 0;
      const bh = ip * 2 + chipH + hl.length * 54 * u + bl.length * 42 * u;
      const x = pad, y = hh - pad - 30 * u - bh;
      g.fillStyle = "rgba(12,16,24,0.72)";
      g.beginPath();
      g.roundRect(x, y, bw, bh, 22 * u);
      g.fill();
      let cy = y + ip;
      if (chip) {
        g.font = font(700, 26);
        const cw = g.measureText(chip).width + 28 * u;
        g.fillStyle = "#e0b050";
        g.beginPath();
        g.roundRect(x + ip, cy, cw, 38 * u, 19 * u);
        g.fill();
        g.fillStyle = "#1a1300";
        g.fillText(chip, x + ip + 14 * u, cy + 6 * u);
        cy += chipH;
      }
      g.fillStyle = "#fff";
      g.font = font(700, 44);
      for (const l of hl) { g.fillText(l, x + ip, cy); cy += 54 * u; }
      g.fillStyle = "rgba(255,255,255,0.88)";
      g.font = font(400, 32);
      for (const l of bl) { g.fillText(l, x + ip, cy); cy += 42 * u; }
    }
    if (this.s.credits && credits) {
      g.font = font(400, 17);
      g.fillStyle = "rgba(255,255,255,0.78)";
      g.textAlign = "right";
      g.textBaseline = "bottom";
      g.shadowColor = "rgba(0,0,0,0.7)";
      g.shadowBlur = 4 * u;
      g.fillText(`Made with Atlas · ${credits}`.slice(0, 180), w - 16 * u, hh - 12 * u);
      g.shadowBlur = 0;
      g.textAlign = "left";
    }
  }
}

/** The credits of the map layers on screen, as plain text. */
function mapCredits(app: App): string {
  const out = new Set<string>();
  const layers = app.globe.viewer.imageryLayers;
  for (let i = 0; i < layers.length; i++) {
    const l = layers.get(i);
    const html = l.show && l.ready !== false ? l.imageryProvider?.credit?.html : undefined;
    if (html) out.add(new DOMParser().parseFromString(html, "text/html").body.textContent!.trim());
  }
  return [...out].filter(Boolean).join(" · ");
}

const fileName = (ext: string) => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `atlas-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
};

/** Floating controls while recording (not part of the video). */
function recordingBar(app: App, rec: Recording, onStop: () => void, live = true) {
  const time = h("span", { class: "rec-time" }, "0:00");
  const tick = setInterval(() => (time.textContent = clock(performance.now() - rec.started)), 500);
  let stopOrbit: (() => void) | null = null;
  const circle = h("button", { class: "pill-btn", onclick: () => {
    if (stopOrbit) { stopOrbit(); stopOrbit = null; circle.classList.remove("on"); }
    else { stopOrbit = orbit(app, 60); circle.classList.add("on"); }
  } }, "Circle here");
  const caption = h("input", { class: "rec-caption", value: settings.caption, placeholder: "Caption (shown in the video)", "aria-label": "Caption", oninput: (e: Event) => (settings.caption = (e.target as HTMLInputElement).value) });
  const bar = h("div", { class: "rec-bar", role: "toolbar", "aria-label": "Recording" },
    h("span", { class: "rec-dot", "aria-hidden": "true" }), time,
    live ? caption : "", live ? circle : "",
    h("button", { class: "primary-btn rec-stop", onclick: () => finish() }, "Stop"));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(tick);
    stopOrbit?.();
    bar.remove();
    onStop();
  };
  document.body.append(bar);
  return finish;
}

function result(ctx: WorkCtx, blob: Blob, ext: string, seconds: number) {
  const url = URL.createObjectURL(blob);
  const name = fileName(ext);
  ctx.show("Your video", () => openVideo(ctx),
    h("video", { class: "rec-preview", src: url, controls: true, playsinline: true }),
    h("p", { class: "muted small" }, `${clock(seconds * 1000)} · ${(blob.size / 1e6).toFixed(1)} MB · ${ext.toUpperCase()}`),
    h("div", { class: "pro-actions" },
      h("a", { class: "primary-btn", href: url, download: name }, "Download"),
      h("button", { class: "pill-btn", onclick: () => openVideo(ctx) }, "Record another")),
    h("p", { class: "muted small" }, "The map imagery's credits are written in the corner of the video. Keep them when you share it."));
  // The panel may be closed after a tour; bring it back to show the result.
  ctx.unhide();
  ctx.open();
}

async function record(ctx: WorkCtx, deckId?: string) {
  const { app } = ctx;
  const rec = new Recording(app, settings);
  try {
    await rec.start();
  } catch (e) {
    app.toast((e as Error).message, 6000);
    return;
  }
  ctx.close();
  const t0 = performance.now();
  const end = async () => {
    const blob = await rec.stop();
    result(ctx, blob, rec.ext, (performance.now() - t0) / 1000);
  };
  const deck = deckId ? decks().find((d) => d.id === deckId) : undefined;
  if (deck) {
    const show = play(app, deck, { tour: true, onSlide: (s) => (rec.slide = s) });
    const stop = recordingBar(app, rec, () => { show.close(); void end(); }, false);
    void show.done.then(stop);
  } else recordingBar(app, rec, () => void end());
}

/** Hides every control so only the globe shows, for streaming or screen capture. */
export function cleanView(app: App) {
  document.body.classList.add("clean");
  const back = h("button", { class: "clean-exit", "aria-label": "Show controls", title: "Show controls (Esc)" }, "Show controls");
  const exit = () => {
    document.body.classList.remove("clean");
    back.remove();
    removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && exit();
  back.addEventListener("click", exit);
  addEventListener("keydown", onKey);
  document.body.append(back);
  app.toast("Clean view: controls hidden. Press Esc or the corner button to bring them back.", 4000);
}

export function openVideo(ctx: WorkCtx) {
  const { app } = ctx;
  const supported = typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
  const field = (label: string, input: HTMLElement) => h("label", { class: "mp-field" }, h("span", {}, label), input);
  const all = decks().filter((d) => d.slides.length);
  const deckPick = h("select", { "aria-label": "Presentation" }, ...all.map((d) => h("option", { value: d.id }, d.name))) as HTMLSelectElement;
  const musicIn = h("input", { type: "file", accept: "audio/*", onchange: (e: Event) => (music = (e.target as HTMLInputElement).files?.[0] ?? null) }) as HTMLInputElement;

  ctx.show("Video", ctx.home,
    h("p", { class: "mp-intro" }, "Record the globe as you move it: fly somewhere, circle a mountain, switch layers on. Add a title and captions, and narrate with your microphone or a sound file."),
    supported ? "" : h("p", { class: "pro-warn" }, "This browser can't record video. Try Chrome, Edge or Firefox; the clean view below still works for streaming."),
    field("Shape", h("select", { onchange: (e: Event) => (settings.shape = (e.target as HTMLSelectElement).value as Shape) },
      ...(Object.keys(SHAPES) as Shape[]).map((k) => h("option", { value: k, selected: settings.shape === k }, SHAPES[k].label)))),
    field("Title", h("input", { value: settings.title, placeholder: "Optional, shown at the top", oninput: (e: Event) => (settings.title = (e.target as HTMLInputElement).value) })),
    field("Caption", h("input", { value: settings.caption, placeholder: "Optional; you can change it while recording", oninput: (e: Event) => (settings.caption = (e.target as HTMLInputElement).value) })),
    h("label", { class: "present-check" }, h("input", { type: "checkbox", checked: settings.mic, onchange: (e: Event) => (settings.mic = (e.target as HTMLInputElement).checked) }), "Narrate with the microphone"),
    field("Music or voice-over", musicIn),
    h("label", { class: "present-check" }, h("input", { type: "checkbox", checked: settings.credits, onchange: (e: Event) => (settings.credits = (e.target as HTMLInputElement).checked) }), "Write the map credits in the corner"),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", disabled: !supported, onclick: () => void record(ctx) }, "● Start recording")),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Record a presentation"),
      all.length
        ? h("div", { class: "pro-actions" }, deckPick, h("button", { class: "pill-btn", disabled: !supported, onclick: () => void record(ctx, deckPick.value) }, "Record as a tour"))
        : h("p", { class: "muted small" }, "Make a presentation in Present, then record it here as a flying tour with its captions.")),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Streaming"),
      h("p", { class: "muted small" }, "For live streams, share this window in OBS, Zoom or Meet and switch to the clean view so only the globe shows."),
      h("button", { class: "pill-btn", onclick: () => { ctx.close(); cleanView(app); } }, "Clean view")),
  );
}
