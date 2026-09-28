// Runs person/vehicle detection on a camera feed, on this device, about once a
// second. The detector (COCO-SSD, a small TensorFlow.js model) loads only when a
// camera is connected. Frames never leave the browser.
import type { Device } from "../../myplaces/store";
import { Analyzer, fromCoco, type Detection, type Tick } from "./analytics";

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

export type FeedKind = "webcam" | "link" | "file";

export interface MonitorState {
  status: "starting" | "loading-model" | "running" | "error" | "stopped";
  error?: string;
  detections: Detection[];
  tick?: Tick;
}

/** Opens a feed as something the detector can read. */
async function openFeed(kind: FeedKind, value: string | File): Promise<{ el: HTMLVideoElement | HTMLImageElement; refresh?: () => Promise<void>; stop: () => void }> {
  if (kind === "webcam") {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false });
    const v = document.createElement("video");
    Object.assign(v, { srcObject: stream, muted: true, playsInline: true, autoplay: true });
    await v.play();
    return { el: v, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  }
  if (kind === "file") {
    const url = URL.createObjectURL(value as File);
    const v = document.createElement("video");
    Object.assign(v, { src: url, muted: true, playsInline: true, loop: true, autoplay: true });
    await v.play();
    return { el: v, stop: () => { v.pause(); URL.revokeObjectURL(url); } };
  }
  const url = String(value);
  // A still image link (a camera's snapshot URL) is refreshed each time; anything else plays as video.
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
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  Object.assign(v, { src: url, muted: true, playsInline: true, autoplay: true, loop: true });
  await v.play();
  return { el: v, stop: () => { v.pause(); v.removeAttribute("src"); v.load(); } };
}

export class CameraMonitor {
  readonly analyzer = new Analyzer();
  state: MonitorState = { status: "stopped", detections: [] };
  el: HTMLVideoElement | HTMLImageElement | null = null;
  private feed: Awaited<ReturnType<typeof openFeed>> | null = null;
  private timer = 0;
  private listeners = new Set<() => void>();

  constructor(readonly camera: Device) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: Partial<MonitorState>) {
    this.state = { ...this.state, ...s };
    this.listeners.forEach((fn) => fn());
  }

  async start(kind: FeedKind, value: string | File) {
    this.stop();
    this.set({ status: "starting", error: undefined, detections: [] });
    try {
      this.feed = await openFeed(kind, value);
      this.el = this.feed.el;
      this.set({ status: "loading-model" });
      const model = await loadDetector();
      this.set({ status: "running" });
      const frame = document.createElement("canvas");
      const loop = async () => {
        if (this.state.status !== "running" || !this.feed) return;
        try {
          if (!document.hidden) {
            await this.feed.refresh?.();
            const el = this.feed.el;
            const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth, h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
            // Detect on a copy of the frame at a known size (the on-screen element may be scaled),
            // capped at 640 px wide for speed.
            const k = Math.min(1, 640 / Math.max(1, w));
            frame.width = Math.round(w * k);
            frame.height = Math.round(h * k);
            frame.getContext("2d")!.drawImage(el, 0, 0, frame.width, frame.height);
            const dets = fromCoco(await model.detect(frame, 30, 0.4), frame.width, frame.height);
            const tick = this.analyzer.update(dets, Date.now());
            this.set({ detections: dets, tick });
          }
        } catch (e) {
          const msg = /secur|taint|cross.?origin/i.test(String(e))
            ? "This feed can be shown but not analysed here: the camera's server doesn't allow it (CORS). A connector or the camera's own analytics can send counts instead."
            : `The feed stopped: ${(e as Error).message}`;
          this.set({ status: "error", error: msg });
          return;
        }
        this.timer = window.setTimeout(loop, 1000);
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
