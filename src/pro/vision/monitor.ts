// Watches one camera feed, on this device, a couple of times a second:
// motion (always; no model needed), and people, vehicles and bikes when the
// detector (COCO-SSD, a small TensorFlow.js model) loads. From these come
// counts, a heatmap of where people spend time, entries and exits across a
// line, time in named zones, and "moments": when something happened, with a
// small picture, and for a recorded clip the second it happened at.
// Frames never leave the browser.
import type { Device } from "../../myplaces/store";
import { Analyzer, fromCoco, type Detection, type Tick } from "./analytics";
import { linkKind } from "./connect";
import { MotionMeter } from "./motion";

type Model = { detect(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, max?: number, minScore?: number): Promise<{ class: string; score: number; bbox: [number, number, number, number] }[]> };

let modelP: Promise<Model> | null = null;
/** Loads the detector once, preferring the GPU. */
export function loadDetector(): Promise<Model> {
  modelP ??= (async () => {
    const tf = await import("@tensorflow/tfjs-core");
    await Promise.all([import("@tensorflow/tfjs-backend-webgl"), import("@tensorflow/tfjs-backend-cpu"), import("@tensorflow/tfjs-converter")]);
    if (!(await tf.setBackend("webgl").catch(() => false))) await tf.setBackend("cpu");
    await tf.ready();
    const coco = await import("@tensorflow-models/coco-ssd");
    return coco.load({ base: "lite_mobilenet_v2" }) as Promise<Model>;
  })();
  modelP.catch(() => (modelP = null));
  return modelP;
}

export type FeedKind = "webcam" | "link" | "file" | "screen";

export interface Moment {
  /** Wall-clock time, ms. */
  at: number;
  /** For a recorded clip: the second in the clip. */
  t?: number;
  label: string;
  people?: number;
  /** A small picture of the moment (a data URL), kept only on this device. */
  thumb?: string;
}

export interface ClipSummary { duration: number; done: boolean; peak: number; peakT: number; entered: number; exited: number; moments: number; readings: number; moving: number }

export interface MonitorState {
  status: "starting" | "loading-model" | "running" | "error" | "stopped";
  /** "people": the detector is running; "motion": motion only (the model couldn't load). */
  mode?: "people" | "motion";
  error?: string;
  detections: Detection[];
  tick?: Tick;
  activity: number;
  /** The last few minutes of activity (0..1), one value per reading. */
  activityHistory: number[];
  moments: Moment[];
  clip?: ClipSummary;
  kind?: FeedKind;
}

/** A feed as something the detector can read. */
async function openFeed(kind: FeedKind, value: string | File): Promise<{ el: HTMLVideoElement | HTMLImageElement; refresh?: () => Promise<void>; stop: () => void }> {
  if (kind === "webcam") {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false });
    const v = document.createElement("video");
    Object.assign(v, { srcObject: stream, muted: true, playsInline: true, autoplay: true });
    await v.play();
    return { el: v, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  }
  if (kind === "screen") {
    // Another window or tab (the camera's own app or website), shared by the person into Atlas.
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (c: object) => Promise<MediaStream> };
    if (!md.getDisplayMedia) throw new Error("this browser can't share another window (try a computer with Chrome, Edge, Firefox or Safari)");
    const stream = await md.getDisplayMedia({ video: { frameRate: 15 }, audio: false, preferCurrentTab: false, selfBrowserSurface: "exclude" });
    const v = document.createElement("video");
    Object.assign(v, { srcObject: stream, muted: true, playsInline: true, autoplay: true });
    await v.play();
    return { el: v, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  }
  if (kind === "file") {
    const url = URL.createObjectURL(value as File);
    const v = document.createElement("video");
    Object.assign(v, { src: url, muted: true, playsInline: true, loop: true, autoplay: true, controls: false });
    await v.play().catch((e) => { throw new Error(/NotSupported|decode|format/i.test(String(e)) ? "this browser can't play that video format (try an MP4)" : String(e)); });
    return { el: v, stop: () => { v.pause(); URL.revokeObjectURL(url); } };
  }
  const url = String(value);
  // A still image link (a camera's snapshot URL) is refreshed each reading.
  if (/\.(jpe?g|png|webp)(\?|$)|snapshot|still|image/i.test(url)) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const load = () => new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("the image couldn't be loaded"));
      img.src = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    });
    await load();
    return { el: img, refresh: load, stop: () => {} };
  }
  // WebRTC (go2rtc, MediaMTX, Scrypted…): offer to receive video, post it, play the answer. About a second behind live.
  if (linkKind(url) === "webrtc") return openWebRtc(url);
  // An MJPEG stream (many IP cameras): an image that keeps updating itself.
  if (/mjpe?g|\.cgi|\/stream|faststream|videostream/i.test(url)) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("the stream couldn't be opened")); img.src = url; });
    return { el: img, stop: () => { img.src = ""; } };
  }
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  Object.assign(v, { muted: true, playsInline: true, autoplay: true, loop: true });
  let hls: { destroy(): void } | null = null;
  // HLS (.m3u8): Safari plays it natively; elsewhere hls.js is fetched the first time it's needed.
  if (/\.m3u8(\?|$)/i.test(url) && !v.canPlayType("application/vnd.apple.mpegurl")) {
    const Hls = await loadHls();
    const player = new Hls({ lowLatencyMode: true });
    player.loadSource(url);
    player.attachMedia(v);
    hls = player;
  } else v.src = url;
  await v.play();
  return { el: v, stop: () => { hls?.destroy(); v.pause(); v.removeAttribute("src"); v.load(); } };
}

/** Plays a WebRTC stream by WHEP: post an offer to receive video, set the answer that comes back. */
async function openWebRtc(url: string): Promise<{ el: HTMLVideoElement; stop: () => void }> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.addTransceiver("video", { direction: "recvonly" });
  const v = document.createElement("video");
  Object.assign(v, { muted: true, playsInline: true, autoplay: true });
  pc.ontrack = (e) => { if (!v.srcObject) v.srcObject = e.streams[0] ?? new MediaStream([e.track]); };
  await pc.setLocalDescription(await pc.createOffer());
  // Wait briefly for ICE candidates so the offer carries them (many bridges don't trickle).
  await new Promise<void>((res) => { if (pc.iceGatheringState === "complete") res(); else { pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && res()); setTimeout(res, 1500); } });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: pc.localDescription!.sdp });
  if (!r.ok) { pc.close(); throw new Error(`the WebRTC link answered ${r.status}`); }
  await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
  await new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error("no video arrived over WebRTC")), 8000); v.onloadeddata = () => { clearTimeout(t); res(); }; });
  await v.play();
  return { el: v, stop: () => { pc.close(); v.srcObject = null; } };
}

type HlsCtor = new (o?: object) => { loadSource(u: string): void; attachMedia(v: HTMLVideoElement): void; destroy(): void };
let hlsP: Promise<HlsCtor> | null = null;
function loadHls(): Promise<HlsCtor> {
  hlsP ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
    s.onload = () => { const H = (window as unknown as { Hls?: HlsCtor }).Hls; if (H) res(H); else rej(new Error("hls.js didn't load")); };
    s.onerror = () => rej(new Error("couldn't load the HLS player"));
    document.head.append(s);
  });
  hlsP.catch(() => (hlsP = null));
  return hlsP;
}

const EVERY_MS = 500;

export class CameraMonitor {
  readonly analyzer = new Analyzer();
  readonly motion = new MotionMeter();
  state: MonitorState = { status: "stopped", detections: [], activity: 0, activityHistory: [], moments: [] };
  el: HTMLVideoElement | HTMLImageElement | null = null;
  private feed: Awaited<ReturnType<typeof openFeed>> | null = null;
  private timer = 0;
  private listeners = new Set<() => void>();
  private thumbCanvas = document.createElement("canvas");

  constructor(readonly camera: Device) {
    if (camera.line) this.analyzer.setLine(camera.line);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: Partial<MonitorState>) {
    this.state = { ...this.state, ...s };
    this.listeners.forEach((fn) => fn());
  }

  /** Jumps a recorded clip to a second (for a moment). */
  seek(t: number) {
    if (this.el instanceof HTMLVideoElement && this.state.kind === "file") { this.el.currentTime = t; void this.el.play(); }
  }

  private thumb(el: CanvasImageSource): string {
    const c = this.thumbCanvas;
    c.width = 192; c.height = 108;
    c.getContext("2d", { willReadFrequently: true })!.drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  private moment(m: Omit<Moment, "at">, el: CanvasImageSource) {
    const moments = [{ ...m, at: Date.now(), thumb: this.thumb(el) }, ...this.state.moments].slice(0, 60);
    this.set({ moments });
  }

  async start(kind: FeedKind, value: string | File) {
    this.stop();
    this.motion.resetHeat();
    this.analyzer.tracks = [];
    this.analyzer.history = [];
    this.analyzer.setLine(this.camera.line ?? null);
    this.set({ status: "starting", error: undefined, detections: [], moments: [], activityHistory: [], clip: undefined, kind, mode: undefined });
    try {
      this.feed = await openFeed(kind, value);
      this.el = this.feed.el;
      this.set({ status: "loading-model" });
      // A recorded clip waits at the start while the detector loads, so the whole clip is watched.
      const clipEl = kind === "file" && this.el instanceof HTMLVideoElement ? this.el : null;
      clipEl?.pause();
      // The detector if it loads within a few seconds; motion alone if not (offline, blocked, old device).
      const model = await Promise.race([loadDetector(), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]).catch(() => null);
      if (clipEl) { clipEl.currentTime = 0; await clipEl.play().catch(() => {}); }
      this.set({ status: "running", mode: model ? "people" : "motion" });
      const frame = document.createElement("canvas");
      const win: { start: number; best: { activity: number; t?: number; thumb: string } | null } = { start: Date.now(), best: null };
      let lastPeople = 0, lastArrival = 0, lastT = -1, entered = 0, exited = 0;
      const loop = async () => {
        if (this.state.status !== "running" || !this.feed) return;
        try {
          if (!document.hidden) {
            await this.feed.refresh?.();
            const el = this.feed.el;
            const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth, hh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
            if (!w || !hh) { this.timer = window.setTimeout(loop, EVERY_MS); return; }
            // Work on a copy of the frame at a known size (capped at 640 px wide for speed).
            const k = Math.min(1, 640 / w);
            frame.width = Math.round(w * k); frame.height = Math.round(hh * k);
            frame.getContext("2d")!.drawImage(el, 0, 0, frame.width, frame.height);
            const t = el instanceof HTMLVideoElement && kind === "file" ? el.currentTime : undefined;
            // A recorded clip that has looped: the first pass is the summary.
            if (t !== undefined && lastT >= 0 && t + 1 < lastT && this.state.clip && !this.state.clip.done) this.set({ clip: { ...this.state.clip, done: true } });
            const m = this.motion.measure(frame);
            const dets = model ? fromCoco(await model.detect(frame, 30, 0.4), frame.width, frame.height) : [];
            const tick = this.analyzer.update(dets, Date.now());
            const firstPass = !this.state.clip?.done;
            if (firstPass) {
              if (model) for (const d of dets) if (d.kind === "person") this.motion.addPoint(d.box[0] + d.box[2] / 2, d.box[1] + d.box[3]);
              if (!model) this.motion.addCells(m.cells);
              const people = tick.counts.person;
              // Moments: someone arriving in view, crossing the line, or (motion only) movement after quiet.
              if (model && people > lastPeople && Date.now() - lastArrival > 4000) {
                lastArrival = Date.now();
                this.moment({ t, people, label: people === 1 ? "Someone came into view" : `${people} people in view` }, frame);
              }
              if (tick.entered > entered) this.moment({ t, people, label: "Someone came in" }, frame);
              if (tick.exited > exited) this.moment({ t, people, label: "Someone went out" }, frame);
              if (!model) {
                // Moments, motion only: every ten seconds, the busiest frame of those ten seconds
                // (if anything much moved), so a busy clip leaves a trail of pictures to jump between.
                if (!win.best || m.activity > win.best.activity) win.best = { activity: m.activity, t, thumb: this.thumb(frame) };
                if (Date.now() - win.start >= 10_000) {
                  const b = win.best;
                  if (b && b.activity > 0.015) this.set({ moments: [{ at: Date.now(), t: b.t, thumb: b.thumb, label: b.activity > 0.06 ? "A busy moment" : "Movement" }, ...this.state.moments].slice(0, 60) });
                  win.start = Date.now(); win.best = null;
                }
              }
              entered = tick.entered; exited = tick.exited; lastPeople = people;
              if (t !== undefined && el instanceof HTMLVideoElement) {
                const c = this.state.clip ?? { duration: el.duration, done: false, peak: 0, peakT: 0, entered: 0, exited: 0, moments: 0, readings: 0, moving: 0 };
                const busy = model ? people : Math.round(m.activity * 100);
                const moving = model ? people > 0 : m.activity >= 0.01;
                this.set({ clip: { ...c, duration: el.duration, peak: Math.max(c.peak, busy), peakT: busy > c.peak ? t : c.peakT, entered: tick.entered, exited: tick.exited, moments: this.state.moments.length, readings: c.readings + 1, moving: c.moving + (moving ? 1 : 0) } });
              }
            }
            lastT = t ?? -1;
            this.set({ detections: dets, tick, activity: m.activity, activityHistory: [...this.state.activityHistory, model ? tick.counts.person : m.activity].slice(-240) });
          }
        } catch (e) {
          const msg = /secur|taint|cross.?origin/i.test(String(e))
            ? "This feed can be shown but not analysed here: the camera's server doesn't allow it (CORS). The edge proxy or the camera's own analytics can send counts instead."
            : `The feed stopped: ${(e as Error).message}`;
          this.set({ status: "error", error: msg });
          return;
        }
        this.timer = window.setTimeout(loop, EVERY_MS);
      };
      void loop();
    } catch (e) {
      const m = (e as Error).message || String(e);
      this.set({ status: "error", error: /permission|notallowed/i.test(m) ? "Camera access wasn't allowed." : `Couldn't open the feed: ${m}` });
    }
  }

  stop() {
    clearTimeout(this.timer);
    this.feed?.stop();
    this.feed = null;
    this.el = null;
    if (this.state.status !== "stopped") this.set({ status: "stopped", detections: [] });
  }
}
