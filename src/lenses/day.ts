// A day here: one day passes over the place in half a minute. The sun rises
// and sets where it really does, each slope brightens as it turns to face
// it, ridges throw real shadows across the valleys (worked out from the
// ground itself), the light warms at dawn and dusk, and night falls. Pick
// midsummer or midwinter and watch the same valley in a different light;
// the summit catches first light before the valley floor, and the panel
// says by how much.
import { note } from "../themes/common";
import { CallbackProperty, Color, CustomDataSource, ImageMaterialProperty, JulianDate, Rectangle, ClassificationType, HeadingPitchRange, BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { h } from "../ui/dom";
import { clock, hoursText, sunDay, sunDayStart, sunPosition, sunlight, type Dem, type SunDay } from "../delight/sun";
import { offset } from "./slice";
import type { Lens } from "./types";

const N = 140;

async function groundGrid(lon: number, lat: number, R: number): Promise<{ dem: Dem; bbox: [number, number, number, number] }> {
  const [, north] = offset(lon, lat, 0, R), [, south] = offset(lon, lat, 180, R), [east] = offset(lon, lat, 90, R), [west] = offset(lon, lat, 270, R);
  const pts: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([west + ((east - west) * i) / (N - 1), north - ((north - south) * j) / (N - 1)]);
  const cell = (2 * R) / (N - 1);
  const z = await elevation.sample(pts, Math.min(13, zoomForSpacing(cell, lat)));
  return { dem: { z, n: N, cell }, bbox: [west, south, east, north] };
}

/** The first (or last) minute of the day a single spot is in sunlight. */
function lightAt(dem: Dem, k: number, day: number, lat: number, lon: number, from: number, to: number, step: number): number | null {
  const one = new Float32Array(dem.n * dem.n);
  for (let m = from; step > 0 ? m <= to : m >= to; m += step) {
    const p = sunPosition(day + m * 60_000, lat, lon);
    if (p.alt <= 0) continue;
    // Only the one spot matters; sunlight() fills the grid, which is fine at this size once per few minutes.
    if (sunlight(dem, p.alt, p.az, one)[k] > 0) return m;
  }
  return null;
}

/** The sky's arc across the day: altitude by minute, the sun where it is now. */
function dial(day: number, lat: number, lon: number, info: SunDay): { el: SVGSVGElement; set(m: number): void } {
  const W = 320, H = 96, mid = 64;
  const X = (m: number) => (m / 1440) * W;
  const Y = (alt: number) => mid - (alt / 90) * (mid - 6);
  const pts: string[] = [];
  for (let m = 0; m <= 1440; m += 10) pts.push(`${X(m).toFixed(1)},${Y(sunPosition(day + m * 60_000, lat, lon).alt).toFixed(1)}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "day-dial");
  const gold = info.golden.map(([a, b]) => `<rect x="${X(a)}" y="0" width="${X(b) - X(a)}" height="${H - 14}" fill="rgba(255,176,74,0.16)"/>`).join("");
  svg.innerHTML = `<defs><linearGradient id="dd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff" stop-opacity="0.35"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="${mid}" width="${W}" height="${H - 14 - mid}" fill="rgba(20,30,60,0.35)"/>${gold}
    <polyline points="${pts.join(" ")}" fill="none" stroke="#ffb04a" stroke-width="2"/>
    <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="currentColor" stroke-opacity="0.35"/>
    ${[0, 6, 12, 18, 24].map((hh) => `<text x="${Math.min(W - 12, Math.max(0, X(hh * 60) - 6))}" y="${H - 2}" class="day-tick">${hh}:00</text>`).join("")}
    <circle class="day-sun" r="7" fill="#ffd36e" stroke="#fff" stroke-width="2"/>`;
  const sun = svg.querySelector(".day-sun")!;
  return { el: svg, set(m) { const a = sunPosition(day + m * 60_000, lat, lon).alt; sun.setAttribute("cx", String(X(m))); sun.setAttribute("cy", String(Y(a))); sun.setAttribute("opacity", a > -1 ? "1" : "0.35"); } };
}

export const dayLens: Lens = {
  id: "day",
  label: "A day here",
  icon: "🌅",
  blurb: "A day passing in half a minute: sunrise, real shadows, golden hour, night",
  score: (s) => (s.kind === "sea" || s.kind === "lake" ? 0 : s.relief > 250 ? 0.95 : s.relief > 60 ? 0.7 : 0.45),
  async open(host, s) {
    const { app } = host, viewer = app.globe.viewer;
    const R = Math.max(2500, Math.min(20_000, s.radius * 1.3));
    host.title("A day here", s.name);
    host.body.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading the ground…"));
    const { dem, bbox } = await groundGrid(s.lon, s.lat, R);
    // The light, drawn into a canvas draped over the ground (two canvases, so the texture refreshes).
    const small = document.createElement("canvas");
    small.width = small.height = N;
    const sctx = small.getContext("2d")!;
    const img = sctx.createImageData(N, N);
    const bufs = [document.createElement("canvas"), document.createElement("canvas")];
    for (const b of bufs) b.width = b.height = 512;
    let cur = 0;
    const light = new Float32Array(N * N);
    // Feathered edges, so the light blends into the land around it.
    const edge = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const f = (v: number) => Math.min(1, Math.min(v, N - 1 - v) / (N * 0.14));
      const e = Math.min(f(i), f(j));
      edge[j * N + i] = e * e * (3 - 2 * e);
    }
    const paint = (alt: number, az: number) => {
      sunlight(dem, alt, az, light);
      const night = alt < -6, twilight = alt < 0;
      const low = Math.max(0, 1 - Math.max(0, alt) / 10);
      for (let k = 0; k < N * N; k++) {
        const L = light[k], o = k * 4;
        if (night) { img.data[o] = 12; img.data[o + 1] = 18; img.data[o + 2] = 48; img.data[o + 3] = 150; continue; }
        if (twilight) { const t = (alt + 6) / 6; img.data[o] = 40 + 60 * t; img.data[o + 1] = 40 + 20 * t; img.data[o + 2] = 90; img.data[o + 3] = 120 - 40 * t; continue; }
        // Shadow: cool and deep; sun: warm at dawn and dusk, clear at midday.
        const shade = Math.pow(1 - L, 1.3);
        const warm = L * low;
        img.data[o] = Math.round(20 * shade + 255 * warm);
        img.data[o + 1] = Math.round(28 * shade + 160 * warm);
        img.data[o + 2] = Math.round(64 * shade + 80 * warm);
        img.data[o + 3] = Math.round(Math.min(230, 150 * shade + 70 * warm));
      }
      for (let k = 0; k < N * N; k++) img.data[k * 4 + 3] = Math.round(img.data[k * 4 + 3] * edge[k]);
      sctx.putImageData(img, 0, 0);
      cur = 1 - cur;
      const c = bufs[cur].getContext("2d")!;
      c.clearRect(0, 0, 512, 512);
      c.imageSmoothingEnabled = true;
      c.drawImage(small, 0, 0, 512, 512);
    };
    const ds = new CustomDataSource("lens-day");
    void viewer.dataSources.add(ds);
    ds.entities.add({ rectangle: { coordinates: Rectangle.fromDegrees(...bbox), classificationType: ClassificationType.TERRAIN,
      material: new ImageMaterialProperty({ image: new CallbackProperty(() => bufs[cur], false), transparent: true, color: Color.WHITE }) } });
    // The wider world lit to match, and the view from low and to the side.
    const g = viewer.scene.globe, clk = viewer.clock;
    const saved = { lighting: g.enableLighting, time: JulianDate.clone(clk.currentTime), animate: clk.shouldAnimate, fades: [g.lightingFadeOutDistance, g.lightingFadeInDistance] as const };
    g.enableLighting = true;
    // Cesium turns sunlight off close up; keep it on so night falls over the whole view.
    g.lightingFadeOutDistance = 1;
    g.lightingFadeInDistance = 2;
    viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(s.lon, s.lat, s.elevation), 1), { offset: new HeadingPitchRange(CesiumMath.toRadians(s.lat >= 0 ? 0 : 180), CesiumMath.toRadians(-24), R * 2.4), duration: 2 });

    // The day: today, or a solstice or equinox.
    const year = new Date().getUTCFullYear();
    const north = s.lat >= 0;
    const DAYS: [string, number][] = [["Today", Date.now()], [north ? "Midsummer" : "Midwinter", Date.UTC(year, 5, 21, 12)], ["Equinox", Date.UTC(year, 2, 20, 12)], [north ? "Midwinter" : "Midsummer", Date.UTC(year, 11, 21, 12)]];
    let day = sunDayStart(Date.now(), s.lon), info = sunDay(day, s.lat, s.lon), minute = Math.max(0, (info.sunrise ?? 360) - 50), playing = true, raf = 0, last = performance.now(), painted = -99;
    const big = h("strong", { class: "day-clock" }), sub = h("span", { class: "day-sub" });
    const facts = h("div", { class: "day-facts" });
    const firsts = h("p", { class: "day-first" });
    const dialBox = h("div", {});
    let d = dial(day, s.lat, s.lon, info);
    const slider = h("input", { type: "range", min: 0, max: 1439, step: 1, value: minute, class: "day-slider", "aria-label": "Time of day" }) as HTMLInputElement;
    const playBtn = h("button", { class: "tb-btn tb-play", "aria-label": "Play or pause the day" }) as HTMLButtonElement;
    const setPlay = (on: boolean) => { playing = on; playBtn.innerHTML = on ? "❚❚" : "▶"; last = performance.now(); if (on) loop(); };
    playBtn.addEventListener("click", () => setPlay(!playing));
    slider.addEventListener("input", () => { setPlay(false); minute = Number(slider.value); frame(true); });
    const describe = () => {
      facts.replaceChildren(...(info.kind === "polar-day" ? [h("span", {}, h("b", {}, "The sun never sets"), " today")] : info.kind === "polar-night" ? [h("span", {}, h("b", {}, "The sun never rises"), " today")] : [
        h("span", {}, "Sunrise ", h("b", {}, clock(info.sunrise ?? 0))), h("span", {}, "Sunset ", h("b", {}, clock(info.sunset ?? 0))), h("span", {}, "Daylight ", h("b", {}, hoursText(info.length))),
        info.golden.length ? h("span", {}, "Golden hour ", h("b", {}, info.golden.slice(0, 2).map(([a, b]) => `${clock(a)}–${clock(b)}`).join(", "))) : "",
      ]), h("span", {}, "Sun at noon ", h("b", {}, `${Math.round(info.noonAlt)}° up`)));
      // First light: the highest ground against the lowest.
      firsts.textContent = "";
      if (info.kind !== "normal") return;
      let hi = 0, lo = 0;
      for (let k = 0; k < dem.z.length; k++) { if (dem.z[k] > dem.z[hi]) hi = k; if (dem.z[k] < dem.z[lo]) lo = k; }
      if (dem.z[hi] - dem.z[lo] < 80) return;
      const noon = Math.round(((info.sunrise ?? 0) + (info.sunset ?? 1440)) / 2);
      const a = lightAt(dem, hi, day, s.lat, s.lon, (info.sunrise ?? 0) - 10, noon, 2), b = lightAt(dem, lo, day, s.lat, s.lon, (info.sunrise ?? 0) - 10, noon, 2);
      const a2 = lightAt(dem, hi, day, s.lat, s.lon, (info.sunset ?? 1440) + 10, noon, -2), b2 = lightAt(dem, lo, day, s.lat, s.lon, (info.sunset ?? 1440) + 10, noon, -2);
      const parts: string[] = [];
      if (a !== null && b !== null && b - a >= 4) parts.push(`The highest ground here catches first light at ${clock(a)}, the valley floor not until ${clock(b)}: ${b - a} minutes later.`);
      if (a2 !== null && b2 !== null && a2 - b2 >= 4) parts.push(`In the evening the valley falls into shadow at ${clock(b2)}; the heights keep the sun until ${clock(a2)}.`);
      firsts.textContent = parts.join(" ");
    };
    const chips = h("div", { class: "fl-chips" }, ...DAYS.map(([label, t]) => h("button", { class: `fl-chip${label === "Today" ? " on" : ""}`, style: "--c:#ffb04a", onclick: (e: Event) => {
      day = sunDayStart(t, s.lon); info = sunDay(day, s.lat, s.lon);
      d = dial(day, s.lat, s.lon, info); dialBox.replaceChildren(d.el);
      chips.querySelectorAll(".fl-chip").forEach((c) => c.classList.toggle("on", c === e.currentTarget));
      describe(); frame(true);
    } }, label)));
    const frame = (force = false) => {
      const t = day + minute * 60_000;
      const p = sunPosition(t, s.lat, s.lon);
      big.textContent = clock(minute);
      sub.textContent = p.alt < -6 ? "Night" : p.alt < 0 ? "Twilight" : p.alt < 6 ? "Golden hour" : `Sun ${Math.round(p.alt)}° up, in the ${["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(p.az / 45) % 8]}`;
      slider.value = String(Math.round(minute));
      d.set(minute);
      clk.currentTime = JulianDate.fromDate(new Date(t));
      if (force || Math.abs(minute - painted) >= 3) { paint(p.alt, p.az); painted = minute; }
    };
    const loop = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame((now) => {
        if (!playing || !host.body.isConnected) return;
        const p = sunPosition(day + minute * 60_000, s.lat, s.lon);
        // An hour every 1.3 seconds, slowing through dawn and dusk.
        const rate = Math.abs(p.alt) < 8 ? 0.45 : p.alt < -8 ? 2.2 : 1;
        minute = (minute + ((now - last) / 1300) * 60 * rate) % 1440;
        last = now;
        frame();
        loop();
      });
    };
    host.onClose(() => {
      cancelAnimationFrame(raf);
      viewer.dataSources.remove(ds, true);
      g.enableLighting = saved.lighting;
      [g.lightingFadeOutDistance, g.lightingFadeInDistance] = saved.fades;
      clk.currentTime = saved.time;
      clk.shouldAnimate = saved.animate;
    });
    dialBox.append(d.el);
    host.body.replaceChildren(
      h("div", { class: "day-top" }, playBtn, h("div", { class: "day-now" }, big, sub)),
      dialBox, slider, chips, facts, firsts,
      note("Sun time (the sun is highest at 12:00). Shadows are worked out from the ground's shape (Terrain Tiles on AWS); clouds and trees aren't included."));
    describe();
    frame(true);
    setPlay(true);
  },
};
