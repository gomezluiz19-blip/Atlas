// Work › Video: the recorder behind the studio (see studio.ts). It draws the
// globe, its place names, a title, captions and the map credits into a video,
// with narration (microphone and/or a music or voice-over file), in
// widescreen, square or vertical. A clean view hides the controls for
// streaming with OBS or any screen-capture tool.
import type { App } from "../app";
import { yearLabel } from "../data/history";
import { h } from "../ui/dom";
import type { WorkCtx } from "./hub";
import type { Slide } from "./presentModel";
import { coverCrop, outputSize, pickMime, wrap, type Shape } from "./videoModel";

export interface Settings { shape: Shape; title: string; caption: string; mic: boolean; credits: boolean; /** Draw the map's place names into the video. */ names: boolean }
export const settings: Settings = { shape: "wide", title: "", caption: "", mic: false, credits: true, names: true };
let music: File | null = null;
export const setMusic = (f: File | null) => { music = f; };
export const getMusic = () => music;

/** Draws the globe plus titles into a canvas every frame and records it. */
export class Recording {
  readonly out = document.createElement("canvas");
  slide: Slide | null = null;
  private recorder!: MediaRecorder;
  private chunks: Blob[] = [];
  private offFrame = () => {};
  private cleanup: (() => void)[] = [];
  readonly started = performance.now();
  ext = "webm";

  constructor(readonly app: App, private s: Settings) {}

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

  /** The HTML place names, drawn where they sit on screen. */
  private drawNames(g: CanvasRenderingContext2D, src: HTMLCanvasElement, c: { sx: number; sy: number; sw: number; sh: number }) {
    const names = this.app.labels?.drawn() ?? [];
    if (!names.length) return;
    const k = src.width / (src.clientWidth || src.width), sc = this.out.width / c.sw;
    const X = (x: number) => (x * k - c.sx) * sc, Y = (y: number) => (y * k - c.sy) * sc, px = k * sc;
    g.save();
    g.textBaseline = "middle";
    g.lineJoin = "round";
    for (const n of names) {
      const x = X(n.x), y = Y(n.y + n.h / 2);
      if (x < -50 || y < -20 || x > this.out.width + 50 || y > this.out.height + 20) continue;
      let tx = x;
      if (n.point) {
        g.beginPath();
        g.arc(x + 5.5 * px, y, 5.5 * px, 0, Math.PI * 2);
        g.fillStyle = n.color; g.fill();
        g.lineWidth = 1.5 * px; g.strokeStyle = "#fff"; g.stroke();
        tx = x + 16 * px;
      }
      g.font = `${n.italic ? "italic " : ""}600 ${Math.round(12.5 * px)}px -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
      g.lineWidth = 3.5 * px; g.strokeStyle = "rgba(0,0,0,0.65)"; g.strokeText(n.name, tx, y);
      g.fillStyle = "#fff"; g.fillText(n.name, tx, y);
      if (n.sub) {
        const w = g.measureText(n.name).width;
        g.font = `500 ${Math.round(11 * px)}px -apple-system, system-ui, sans-serif`;
        g.strokeText(n.sub, tx + w + 5 * px, y); g.fillStyle = "rgba(255,255,255,0.85)"; g.fillText(n.sub, tx + w + 5 * px, y);
      }
    }
    g.restore();
  }

  private draw(g: CanvasRenderingContext2D, src: HTMLCanvasElement, credits: string) {
    const { width: w, height: hh } = this.out;
    const c = coverCrop(src.width, src.height, w, hh);
    g.drawImage(src, c.sx, c.sy, c.sw, c.sh, 0, 0, w, hh);
    const u = Math.min(w, hh) / 1080, pad = 48 * u;
    if (this.s.names) this.drawNames(g, src, c);
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
      g.fillText(`Made with Terreno · ${credits}`.slice(0, 180), w - 16 * u, hh - 12 * u);
      g.shadowBlur = 0;
      g.textAlign = "left";
    }
  }
}

/** The credits of the map layers on screen, as plain text. */
export function mapCredits(app: App): string {
  const out = new Set<string>();
  const layers = app.globe.viewer.imageryLayers;
  for (let i = 0; i < layers.length; i++) {
    const l = layers.get(i);
    const html = l.show && l.ready !== false ? l.imageryProvider?.credit?.html : undefined;
    if (html) out.add(new DOMParser().parseFromString(html, "text/html").body.textContent!.trim());
  }
  return [...out].filter(Boolean).join(" · ");
}

export const fileName = (ext: string) => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `atlas-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
};

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

/** Video opens straight into the studio. */
export function openVideo(ctx: WorkCtx) {
  void import("./studio").then((m) => m.openStudio(ctx));
}
