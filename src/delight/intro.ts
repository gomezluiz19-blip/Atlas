// The opening: black, a few words faded in and out like a film's titles, then
// the Earth fades up turning in real sunlight with its cities lit on the night
// side, and a line on what's happening on the planet right now. The full
// titles play on a first visit; after that, just the name. Any key or tap
// skips.
import { Cartesian3, EasingFunction } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import { chime } from "./sound";
import { earthNow, type PulseLine } from "./pulse";

const TITLES = [
  "Every place on Earth has a story.",
  "Its ground. Its weather. Its people. Its past.",
];

export interface IntroOptions {
  /** Where to settle the camera (the viewer's side of the planet); null leaves the camera alone. */
  home: { lon: number; lat: number } | null;
  /** Full titles (a first visit) or just the name. */
  full: boolean;
  /** Called once the Earth is showing. */
  onReveal?: () => void;
}

const wait = (ms: number, skip: { on: boolean }) => new Promise<void>((r) => {
  const t = setTimeout(r, ms);
  const check = setInterval(() => { if (skip.on) { clearTimeout(t); clearInterval(check); r(); } }, 50);
  setTimeout(() => clearInterval(check), ms + 60);
});

export async function playIntro(app: App, opts: IntroOptions) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { viewer } = app.globe, cam = viewer.camera;
  const line = h("p", { class: "intro-line" });
  const mark = h("div", { class: "intro-mark" }, h("span", { class: "intro-word" }, "Atlas"), h("span", { class: "intro-tag" }, "All things Earth"));
  const skipBtn = h("button", { class: "intro-skip" }, "Skip");
  const veil = h("div", { class: "intro", role: "presentation" }, line, mark, skipBtn);
  document.body.append(veil);
  const skip = { on: false };
  const doSkip = () => { skip.on = true; };
  skipBtn.addEventListener("click", doSkip);
  addEventListener("keydown", doSkip, { once: true });
  veil.addEventListener("pointerdown", doSkip);

  // The Earth waits behind the black: far out, lit by the real sun, cities glowing at night.
  // (Cesium fades sunlight and the night side out as you come closer; keep both at full strength here.)
  const g = viewer.scene.globe;
  const fades = { lo: g.lightingFadeOutDistance, li: g.lightingFadeInDistance, no: g.nightFadeOutDistance, ni: g.nightFadeInDistance };
  if (opts.home) {
    app.looks?.preview("space");
    Object.assign(g, { lightingFadeOutDistance: 1e6, lightingFadeInDistance: 3e6, nightFadeOutDistance: 1e6, nightFadeInDistance: 3e6 });
    cam.setView({ destination: Cartesian3.fromDegrees(opts.home.lon - 40, opts.home.lat * 0.5, 30_000_000) });
  }
  const pulse = earthNow();

  if (!reduced) {
    if (opts.full)
      for (const t of TITLES) {
        if (skip.on) break;
        line.textContent = t;
        line.classList.add("on");
        await wait(2300, skip);
        line.classList.remove("on");
        await wait(800, skip);
      }
    if (!skip.on) {
      mark.classList.add("on");
      await wait(opts.full ? 2000 : 1100, skip);
    }
  }
  // Fade up on the Earth as the camera settles in.
  veil.classList.add("out");
  mark.classList.add("on");
  chime("open");
  if (opts.home) cam.flyTo({ destination: Cartesian3.fromDegrees(opts.home.lon, opts.home.lat * 0.8, 14_000_000), duration: reduced ? 0 : 4.2, easingFunction: EasingFunction.QUARTIC_IN_OUT });
  opts.onReveal?.();
  setTimeout(() => veil.remove(), 1600);
  removeEventListener("keydown", doSkip);
  showPulse(app, await pulse);
  if (!opts.home) return;
  // Back to the theme's own look once the person starts exploring.
  const settle = () => {
    Object.assign(g, { lightingFadeOutDistance: fades.lo, lightingFadeInDistance: fades.li, nightFadeOutDistance: fades.no, nightFadeInDistance: fades.ni });
    app.looks?.restore();
    off();
  };
  // The lit Earth stays until the first touch of the map (or a search, a theme, a place).
  const canvas = viewer.scene.canvas;
  const off = () => canvas.removeEventListener("pointerdown", settle);
  canvas.addEventListener("pointerdown", settle, { once: true });
  const prevPlace = app.onPlace;
  app.onPlace = (p) => { app.onPlace = prevPlace; prevPlace?.(p); if (p) settle(); };
}

/** "Right now on Earth": the lines, one after another, each one tap from its place. */
function showPulse(app: App, lines: PulseLine[]) {
  if (!lines.length) return;
  let i = 0;
  const text = h("span", { class: "pulse-text" });
  const pill = h("button", { class: "pulse", title: "Go there" }, h("span", { class: "pulse-dot" }), h("span", { class: "pulse-kicker" }, "Right now"), text);
  const show = () => { text.classList.remove("on"); setTimeout(() => { text.textContent = lines[i].text; text.classList.add("on"); }, 250); };
  pill.addEventListener("click", () => {
    const l = lines[i];
    if (l.lon !== undefined && l.lat !== undefined) app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(l.lon, l.lat, 2_500_000), duration: 2.4 });
    if (l.kind === "quake") app.actions.get("overlay:quakes")?.run();
    if (l.kind === "aurora") app.actions.get("overlay:aurora")?.run();
    if (l.kind === "launch") app.actions.get("space:open")?.run();
    close();
  });
  (document.getElementById("ui") ?? document.body).append(pill);
  show();
  const cycle = window.setInterval(() => { i = (i + 1) % lines.length; show(); }, 5200);
  const close = () => { clearInterval(cycle); pill.classList.add("gone"); setTimeout(() => pill.remove(), 400); };
  setTimeout(close, Math.max(12_000, lines.length * 5200 + 1000));
}
