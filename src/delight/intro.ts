// The opening, in under four seconds: the printer's registration marks find the corners of the screen, the
// dome of tesserae falls into place, the horizon is drawn over it, the name settles from wide to its own
// spacing, and a readout says where the sun stands overhead right now. Then the dark opens through the dome
// onto the real Earth, composed on that sun: a crescent over the night side's cities turning into the day
// over your part of the world. Then a line on what's happening on the planet now. Return visits get the
// short cut. Any key or tap skips.
import { Cartesian3, EasingFunction } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import "./intro.css";
import { chime } from "./sound";
import { domeTiles } from "../ui/brand";
import { subsolar } from "../globe/finish";
import { earthNow, type PulseLine } from "./pulse";


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
  // The opening (styles in intro.css): the printer's registration marks, the dome's tesserae falling into
  // place, the horizon drawn over them, the name settling from wide to its own spacing, and a readout of where
  // the sun stands right now. Then the dark opens through the dome onto the real Earth.
  const sunNow = subsolar(new Date());
  const tiles = domeTiles(32, 43, 19).map((t, i) => {
    const a = (i * 137.5) % 360, r = 26 + (i % 3) * 9;
    return `<path d="${t.d}" fill="${t.fill}" stroke="#0b0d0a" stroke-width="1.2" stroke-linejoin="round" style="--i:${i};--dx:${(Math.cos((a * Math.PI) / 180) * r).toFixed(1)}px;--dy:${(Math.sin((a * Math.PI) / 180) * r - 18).toFixed(1)}px;--r:${((i % 2 ? 1 : -1) * (14 + i * 5)) % 60}deg"/>`;
  }).join("");
  const markSvgEl = `<svg class="op-mark" viewBox="0 0 64 64" aria-hidden="true">${tiles}<path class="op-arc" d="M8,41 A24,24 0 0 1 56,41" fill="none" stroke="#ece8de" stroke-width="1.4" stroke-linecap="round" pathLength="1"/><path class="op-base" d="M6,44.2 H58" stroke="#ece8de" stroke-width="1.4" stroke-linecap="round" pathLength="1"/></svg>`;
  const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? pos : neg}`;
  const utc = new Date().toISOString().slice(11, 16);
  const mark = h("div", { class: "op-center" },
    h("div", { class: "op-mark-wrap", html: markSvgEl }),
    h("div", { class: "op-word", "aria-label": "Terreno" }, "TERRENO"),
    h("div", { class: "op-read", "aria-hidden": "true" },
      h("span", {}, "The whole Earth, live"),
      h("span", { class: "op-sun" }, `Sun overhead ${fmt(sunNow.lat, "N", "S")}, ${fmt(sunNow.lon, "E", "W")} · ${utc} UTC`)));
  const skipBtn = h("button", { class: "op-skip" }, "Skip");
  const veil = h("div", { class: "op" + (opts.full ? " full" : ""), role: "presentation" },
    ...["tl", "tr", "bl", "br"].map((c) => h("i", { class: `op-tick op-tick-${c}`, "aria-hidden": "true" })), mark, skipBtn);
  document.body.append(veil);
  const skip = { on: false };
  const doSkip = () => { skip.on = true; };
  skipBtn.addEventListener("click", doSkip);
  addEventListener("keydown", doSkip, { once: true });
  veil.addEventListener("pointerdown", doSkip);

  // The Earth waits behind the black: far out, lit by the real sun, cities glowing at night.
  // (Cesium fades sunlight and the night side out as you come closer; keep both at full strength here.)
  const g = viewer.scene.globe;
  const fades = { lo: g.lightingFadeOutDistance, li: g.lightingFadeInDistance };
  if (opts.home) {
    app.looks?.preview("space");
    Object.assign(g, { lightingFadeOutDistance: 1e6, lightingFadeInDistance: 3e6 });
    // The first frame is composed on the real sun: the camera sits past the evening terminator, so the Earth
    // opens as a lit crescent over the night side's cities, then turns into the day over your part of the world.
    cam.setView({ destination: Cartesian3.fromDegrees(sunNow.lon + 112, sunNow.lat * 0.4, 46_000_000) });
  }
  const pulse = earthNow();

  if (!reduced) {
    // Marks, tiles, horizon, name, readout (intro.css); a return visit gets the short cut.
    requestAnimationFrame(() => veil.classList.add("on"));
    await wait(opts.full ? 3700 : 1500, skip);
  }
  // Fade up on the Earth as the camera settles in.
  veil.classList.add("on", "out");
  chime("open");
  if (opts.home) cam.flyTo({ destination: Cartesian3.fromDegrees(opts.home.lon, opts.home.lat * 0.8, 14_000_000), duration: reduced ? 0 : 5.6, easingFunction: EasingFunction.QUINTIC_IN_OUT });
  opts.onReveal?.();
  setTimeout(() => veil.remove(), 1700);
  removeEventListener("keydown", doSkip);
  showPulse(app, await pulse);
  if (!opts.home) return;
  // Back to the theme's own look once the person starts exploring.
  const settle = () => {
    Object.assign(g, { lightingFadeOutDistance: fades.lo, lightingFadeInDistance: fades.li });
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
    if (l.kind === "news") app.actions.get("news:open")?.run();
    close();
  });
  (document.getElementById("ui") ?? document.body).append(pill);
  show();
  const cycle = window.setInterval(() => { i = (i + 1) % lines.length; show(); }, 5200);
  const close = () => { clearInterval(cycle); pill.classList.add("gone"); setTimeout(() => pill.remove(), 400); };
  setTimeout(close, Math.max(12_000, lines.length * 5200 + 1000));
}
