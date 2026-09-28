// Arriving somewhere should feel like arriving. The camera comes in at an
// angle rather than straight down, the name is set large over the map for a
// moment with the one fact worth knowing, and the view slowly circles the
// place until you touch the map.
import { BoundingSphere, Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4 } from "cesium";
import type { App } from "../app";
import { elevation } from "../data/elevation";
import { h } from "../ui/dom";
import { freeArea } from "../ui/search";
import { chime } from "./sound";

let stopOrbit: (() => void) | null = null;
let card: HTMLElement | null = null;

/** Stops the slow circling (on any touch of the map, a new flight, or a new place). */
export function stopArriving() {
  stopOrbit?.();
  stopOrbit = null;
}

export interface Arrival {
  name: string;
  /** "Mountain · Japan". */
  kicker: string;
  lon: number;
  lat: number;
  /** Metres to frame. */
  radius: number;
  /** The fact to show now, or one that arrives later. */
  fact?: string | Promise<string | null>;
}

export async function arrive(app: App, a: Arrival) {
  stopArriving();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { viewer } = app.globe, cam = viewer.camera, canvas = viewer.scene.canvas;
  const ground = await Promise.race([
    elevation.sample([[a.lon, a.lat]], 10).then((v) => Math.max(0, v[0] ?? 0)).catch(() => 0),
    new Promise<number>((r) => setTimeout(() => r(0), 150)),
  ]);
  const center = Cartesian3.fromDegrees(a.lon, a.lat, ground * app.globe.state.exaggeration);
  // Big things (seas, deserts, rivers) are seen from high up and less tilted.
  const range = Math.max(900, a.radius * 3.2);
  const pitch = CesiumMath.toRadians(a.radius > 200_000 ? -62 : a.radius > 20_000 ? -45 : -32);
  const heading0 = CesiumMath.toRadians(-18);
  cam.cancelFlight();
  // The opening's "Right now" line gives way to the place.
  const pulse = document.querySelector(".pulse");
  if (pulse) { pulse.classList.add("gone"); setTimeout(() => pulse.remove(), 400); }
  showCard(app, a);
  chime("arrive");
  cam.flyToBoundingSphere(new BoundingSphere(center, 1), {
    offset: new HeadingPitchRange(heading0, pitch, range),
    duration: reduced ? 0 : 2.6,
    complete: () => { if (!reduced) orbit(app, center, heading0, pitch, range); },
  });
  const stopOnTouch = () => { stopArriving(); hideCard(); canvas.removeEventListener("pointerdown", stopOnTouch); canvas.removeEventListener("wheel", stopOnTouch); };
  canvas.addEventListener("pointerdown", stopOnTouch);
  canvas.addEventListener("wheel", stopOnTouch, { passive: true });
}

/** Circles the place slowly, keeping it in the middle of the map you can see. */
function orbit(app: App, center: Cartesian3, heading: number, pitch: number, range: number) {
  const cam = app.globe.viewer.camera;
  let raf = 0, last = performance.now(), on = true;
  // Keep the place in the free part of the screen (beside the page, not under it).
  const pad = freeArea(app.globe.viewer.scene.canvas);
  const w = app.globe.viewer.scene.canvas.clientWidth || innerWidth;
  const shift = (pad.left - pad.right) / 2 / Math.max(1, w);
  const start = last;
  const tick = (now: number) => {
    if (!on) return;
    heading += ((now - last) / 1000) * CesiumMath.toRadians(2.2);
    last = now;
    cam.lookAt(center, new HeadingPitchRange(heading, pitch, range));
    // Ease the place across into the open part of the map (the camera steps left, the place moves right).
    const ease = Math.min(1, (now - start) / 1400);
    if (shift) cam.moveLeft(shift * range * 1.1 * (ease * ease * (3 - 2 * ease)));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  stopOrbit = () => { on = false; cancelAnimationFrame(raf); cam.lookAtTransform(Matrix4.IDENTITY); };
  // A long orbit becomes wallpaper: settle after half a minute.
  setTimeout(() => { if (on) stopArriving(); }, 30_000);
}

function showCard(app: App, a: Arrival) {
  hideCard(true);
  const fact = h("p", { class: "arrival-fact" });
  const el = h("div", { class: "arrival", role: "status", "aria-live": "polite" },
    a.kicker ? h("p", { class: "arrival-kicker" }, a.kicker) : "",
    h("h2", { class: "arrival-name" }, a.name),
    fact);
  const pad = freeArea(app.globe.viewer.scene.canvas);
  el.style.left = `calc(${pad.left}px + (100vw - ${pad.left + pad.right}px) / 2)`;
  el.addEventListener("click", () => hideCard());
  (document.getElementById("ui") ?? document.body).append(el);
  card = el;
  const setFact = (t: string | null | undefined) => { if (t && card === el) { fact.textContent = t; fact.classList.add("on"); } };
  if (typeof a.fact === "string") setFact(a.fact);
  else a.fact?.then(setFact).catch(() => {});
  requestAnimationFrame(() => el.classList.add("on"));
  setTimeout(() => { if (card === el) hideCard(); }, 6500);
}

function hideCard(now = false) {
  const el = card;
  card = null;
  if (!el) return;
  if (now) { el.remove(); return; }
  el.classList.remove("on");
  setTimeout(() => el.remove(), 700);
}
