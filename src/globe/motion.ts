// How the globe moves and when it draws. Left alone, a 3D globe redraws 60
// times a second even when nothing on it changes, which heats phones and
// drains batteries. Here it draws on demand instead:
//   - at full rate whenever anything moves: the camera, a touch or the
//     mouse, an animation (flows, traffic, satellites, city life, a lens);
//   - otherwise a slow heartbeat (a few frames a second), so nothing can go
//     stale.
// While the camera is moving it streams slightly coarser terrain and, on a
// device that can't keep up, renders at a lower resolution, sharpening both
// again the moment it settles. And the camera itself gets a calmer feel:
// gentler wheel steps, longer glides, no diving into the ground. How hard all
// of it works is fitted to the device (quality.ts), and a device that keeps
// dropping frames is stepped down a tier, there and then and on its next visit.
import type { Scene, Viewer } from "cesium";
import { currentQuality, learnSlow, qualityFor, readSignals, type Quality } from "./quality";

type Pred = () => boolean;
const wants: Pred[] = [];
let transient = 0;
let activeUntil = 0;
const raf0: (cb: FrameRequestCallback) => number = typeof window !== "undefined" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

/** Keeps the globe drawing at full rate while `active()` is true. */
export function demand(active: Pred) { wants.push(active); }

/** Asks for full-rate drawing for a moment (after a change the globe can't see). */
export function wake(ms = 600) { activeUntil = Math.max(activeUntil, performance.now() + ms); }

const ambients = new Set<unknown>();
let ambientTimer = 0;
/**
 * Gentle background motion (a pulsing alert, a swinging crane, a throbbing incident): while any is on, the
 * globe redraws about 20 times a second, never at the full rate and never while the tab is hidden.
 */
export function ambient(scene: Scene, key: unknown, on: boolean) {
  if (on) ambients.add(key); else ambients.delete(key);
  if (ambients.size && !ambientTimer) ambientTimer = setInterval(() => { if (typeof document === "undefined" || !document.hidden) scene.requestRender(); }, 50) as unknown as number;
  else if (!ambients.size && ambientTimer) { clearInterval(ambientTimer); ambientTimer = 0; }
}

type Ev = { addEventListener(fn: (...a: never[]) => void, scope?: unknown): () => void; __raw?: Ev["addEventListener"] };
/**
 * Runs `fn` every frame, as `scene.preRender` would, without counting as an
 * animation; it asks for frames only while `active()` is true. For permanent
 * per-frame work that is usually idle.
 */
export function everyFrame(scene: Scene, fn: () => void, active: Pred): () => void {
  const ev = scene.preRender as unknown as Ev;
  const add = ev.__raw ?? ev.addEventListener.bind(ev);
  demand(active);
  return add(fn as (...a: never[]) => void);
}

export interface MotionStats { mode: "full" | "idle"; fps: number; scale: number; transient: number; why: string; tier: string }
export const stats: MotionStats = { mode: "full", fps: 0, scale: 1, transient: 0, why: "", tier: "" };

let q: Quality = currentQuality();
let applyTo: Viewer | null = null;
/** The quality in force. */
export const quality = () => q;

/** Puts a quality's settings on the globe. */
export function setQuality(next: Quality) {
  q = next;
  stats.tier = q.tier;
  const v = applyTo;
  if (!v) return;
  // Sharp on high-density screens without rendering 9x the pixels on 3x phones.
  v.useBrowserRecommendedResolution = false;
  const dpr = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
  v.resolutionScale = q.pixelRatio / dpr;
  v.scene.globe.maximumScreenSpaceError = q.sse;
  v.scene.globe.tileCacheSize = q.tileCache;
  v.scene.postProcessStages.fxaa.enabled = q.fxaa;
  v.scene.requestRender();
}

export function initMotion(viewer: Viewer) {
  const scene = viewer.scene, camera = viewer.camera;
  applyTo = viewer;
  setQuality(q);
  // On battery and running low: ease off until it's charging again.
  type Battery = EventTarget & { level: number; charging: boolean };
  void (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then((b) => {
    const check = () => setQuality(!b.charging && b.level < 0.2 ? qualityFor("low", readSignals()) : currentQuality());
    if (!b.charging && b.level < 0.2) check();
    b.addEventListener("levelchange", check);
    b.addEventListener("chargingchange", check);
  }).catch(() => {});
  scene.requestRenderMode = true;
  // The real clock ticking doesn't redraw; a lens jumping the time by more than a minute does.
  scene.maximumRenderTimeChange = 60;

  // Anything added to preRender after this point is an animation while it's attached.
  const ev = scene.preRender as unknown as Ev;
  const raw = ev.addEventListener.bind(ev);
  ev.__raw = raw;
  ev.addEventListener = (fn, scope) => {
    transient++;
    const off = raw(fn, scope);
    let done = false;
    return () => { if (!done) { done = true; transient--; } off(); };
  };

  // Input: full rate while touching, scrolling or typing, and a little after.
  const nudge = () => wake(1200);
  for (const t of ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"]) addEventListener(t, nudge, { passive: true, capture: true });
  addEventListener("resize", () => { wake(800); scene.requestRender(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { wake(800); scene.requestRender(); } });

  // ---- Camera feel ----
  const c = scene.screenSpaceCameraController;
  // Long, smooth glides; short ones for people who've asked their device for less motion.
  const calm = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  c.inertiaSpin = calm ? 0.6 : 0.92;
  c.inertiaTranslate = calm ? 0.6 : 0.92;
  c.inertiaZoom = calm ? 0.5 : 0.86;
  c.zoomFactor = 4;
  c.minimumZoomDistance = 25;
  c.maximumZoomDistance = 45_000_000;

  // ---- While moving: coarser terrain, and lower resolution if frames are slow ----
  let moving = false, slow = 0, sharp = q.sse, baseScale = viewer.resolutionScale, struggled = 0, dropped = false;
  // Frosted-glass panels blur whatever's behind them; over a globe redrawing every frame that blur is
  // recomputed every frame too, the single biggest cost on many GPUs. While the camera moves the panels turn
  // a touch more opaque instead, and the frost returns when it stops.
  let glassTimer = 0;
  const body = typeof document !== "undefined" ? document.body : null;
  camera.moveStart.addEventListener(() => { clearTimeout(glassTimer); body?.classList.add("globe-moving"); });
  camera.moveEnd.addEventListener(() => { clearTimeout(glassTimer); glassTimer = window.setTimeout(() => body?.classList.remove("globe-moving"), 180); });
  camera.moveStart.addEventListener(() => {
    moving = true; dropped = false;
    sharp = q.sse; baseScale = viewer.resolutionScale;
    scene.globe.maximumScreenSpaceError = sharp * q.movingSse;
  });
  camera.moveEnd.addEventListener(() => {
    moving = false; slow = 0;
    scene.globe.maximumScreenSpaceError = sharp;
    if (viewer.resolutionScale !== baseScale) viewer.resolutionScale = baseScale;
    stats.scale = 1;
    // Struggling on three separate moves: this device wants a lighter globe.
    if (dropped && ++struggled >= 3 && q.tier !== "low") { struggled = 0; setQuality(qualityFor(learnSlow(q.tier), readSignals())); }
    wake(1500);
    scene.requestRender();
  });
  let lastFrame = 0, frames = 0, fpsAt = performance.now();
  scene.postRender.addEventListener(() => {
    const now = performance.now();
    frames++;
    if (now - fpsAt > 1000) { stats.fps = frames; frames = 0; fpsAt = now; }
    if (moving && lastFrame) {
      // A run of slow frames (under ~40 fps) while moving: render at lower resolution until it settles.
      if (now - lastFrame > 25) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 12 && viewer.resolutionScale === baseScale) { viewer.resolutionScale = baseScale * q.movingScale; stats.scale = q.movingScale; dropped = true; }
    }
    lastFrame = now;
  });

  // ---- The pacer: full rate when anything moves, a heartbeat otherwise ----
  let beat = 0;
  const loop = (now: number) => {
    const pi = wants.findIndex((p) => { try { return p(); } catch { return false; } });
    const why = transient > 0 ? "animation" : now < activeUntil ? "input" : pi >= 0 ? `layer ${pi}` : "";
    const animating = why !== "";
    stats.mode = animating ? "full" : "idle";
    stats.why = why;
    stats.transient = transient;
    if (animating) scene.requestRender();
    else if (now - beat > q.heartbeat) { beat = now; scene.requestRender(); }
    raf0(loop);
  };
  raf0(loop);
  if (import.meta.env?.DEV) (window as unknown as { __motion?: MotionStats }).__motion = stats;
}
