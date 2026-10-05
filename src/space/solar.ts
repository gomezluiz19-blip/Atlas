// The solar system view: the Sun, planets at their real positions for any
// date, their orbits, the asteroid belt and the Moon, on a canvas you can turn,
// zoom and run through time. Sizes are exaggerated so the planets can be seen;
// "True distances" puts them at scale, "Compact" squeezes the outer planets in.
import { h } from "../ui/dom";
import { AU_KM, PLANETS, heliocentric, moonPhase, orbitPath, type Planet } from "./astro";

type V3 = [number, number, number];
const DAY = 86_400_000;
const SPEEDS = [{ label: "Pause", days: 0 }, { label: "1 day/s", days: 1 }, { label: "1 week/s", days: 7 }, { label: "1 month/s", days: 30 }, { label: "1 year/s", days: 365 }];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Saturn's ring plane: its pole in ecliptic coordinates (from RA 40.6°, Dec 83.5°). */
const SATURN_POLE: V3 = (() => {
  const ra = (40.6 * Math.PI) / 180, dec = (83.5 * Math.PI) / 180, ε = (23.43928 * Math.PI) / 180;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return [x, y * Math.cos(ε) + z * Math.sin(ε), -y * Math.sin(ε) + z * Math.cos(ε)];
})();

export class SolarSystem {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private time = Date.now();
  private speed = 1;
  private compact = true;
  private yaw = -0.6;
  private pitch = 0.5;
  private dist = 16;
  private target: V3 = [0, 0, 0];
  private focus: string = "sun";
  private anim: { from: { dist: number; target: V3; yaw: number; pitch: number }; to: { dist: number; target: V3 | (() => V3); yaw: number; pitch: number }; t0: number; ms: number; done?: () => void } | null = null;
  private stars: { d: V3; b: number; c: string }[] = [];
  private belt: { a: number; th: number; z: number }[] = [];
  private orbits = new Map<string, { at: number; pts: V3[] }>();
  private raf = 0;
  private last = 0;
  private dateEl = h("span", { class: "solar-date" });
  private info = h("div", { class: "solar-info", hidden: true });
  private hover: string | null = null;
  private screen: { id: string; x: number; y: number; r: number }[] = [];
  onExit?: () => void;

  constructor() {
    this.canvas = h("canvas", { class: "solar-canvas" }) as HTMLCanvasElement;
    this.g = this.canvas.getContext("2d")!;
    const speedBtns = SPEEDS.map((s, i) => h("button", { class: "solar-chip" + (i === 1 ? " on" : ""), onclick: () => { this.speed = s.days; speedBtns.forEach((b, j) => b.classList.toggle("on", j === i)); } }, s.label));
    const scaleBtn = h("button", { class: "solar-chip", title: "Switch between squeezed and true distances", onclick: () => { this.compact = !this.compact; scaleBtn.textContent = this.compact ? "Compact distances" : "True distances"; this.orbits.clear(); if (this.focus === "sun") this.goTo("sun"); } }, "Compact distances");
    this.el = h("div", { class: "solar", role: "dialog", "aria-label": "Solar system" },
      this.canvas,
      h("div", { class: "solar-top" },
        h("div", { class: "solar-title" }, h("strong", {}, "Solar system"), this.dateEl),
        h("div", { class: "solar-controls" }, ...speedBtns,
          h("button", { class: "solar-chip", onclick: () => { this.time = Date.now(); } }, "Now"), scaleBtn),
        h("button", { class: "solar-back", onclick: () => this.close() }, "‹ Back to Earth")),
      h("div", { class: "solar-planets" },
        h("button", { class: "solar-chip", onclick: () => this.goTo("sun") }, "☀️ Sun"),
        ...PLANETS.map((p) => h("button", { class: "solar-chip", style: `--c:${p.color}`, onclick: () => this.goTo(p.id) }, h("i", { class: "solar-dot" }), p.name))),
      this.info,
      h("p", { class: "solar-note" }, "Planet sizes are enlarged to be visible. Positions from JPL orbital elements."));
    // Stars: fixed directions, a few brighter ones, and a band for the Milky Way.
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const band = i < 1200;
      const u = band ? (r() - 0.5) * 0.35 : r() * 2 - 1, th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      let d: V3 = [s * Math.cos(th), s * Math.sin(th), u];
      if (band) d = [d[0], d[1] * 0.5 - d[2] * 0.87, d[1] * 0.87 + d[2] * 0.5]; // tilt the band
      const b = Math.pow(r(), 3);
      this.stars.push({ d, b, c: b > 0.6 ? ["#fff", "#cfe0ff", "#ffe9c4"][i % 3] : "#fff" });
    }
    for (let i = 0; i < 1400; i++) this.belt.push({ a: 2.15 + r() * 1.15, th: r() * Math.PI * 2, z: (r() - 0.5) * 0.15 });
    this.bindInput();
  }

  // ---- Scale and camera --------------------------------------------------------------------

  private scale(p: V3): V3 {
    if (!this.compact) return p;
    const d = Math.hypot(...p);
    if (d === 0) return p;
    const k = (1.7 * Math.sqrt(d)) / d;
    return [p[0] * k, p[1] * k, p[2] * k];
  }

  private planetPos(p: Planet): V3 {
    return this.scale(heliocentric(p, this.time));
  }

  private bodyPos(id: string): V3 {
    if (id === "sun") return [0, 0, 0];
    return this.planetPos(PLANETS.find((p) => p.id === id)!);
  }

  /** World (ecliptic, view units) to screen, and depth. */
  private project(p: V3): { x: number; y: number; z: number } | null {
    const [tx, ty, tz] = this.target;
    let x = p[0] - tx, y = p[1] - ty, z = p[2] - tz;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    [x, y] = [x * cy - y * sy, x * sy + y * cy];
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Camera looks along +y after the pitch; z is up.
    const y2 = y * cp - z * sp, z2 = y * sp + z * cp;
    const depth = y2 + this.dist;
    if (depth < 0.01) return null;
    const f = Math.min(this.canvas.width, this.canvas.height) * 0.9;
    return { x: this.canvas.width / 2 + (x / depth) * f, y: this.canvas.height / 2 - (z2 / depth) * f, z: depth };
  }

  private goTo(id: string) {
    this.focus = id;
    const p = PLANETS.find((x) => x.id === id);
    const dist = id === "sun" ? (this.compact ? 16 : 70) : 0.05 + this.radiusOf(p!) * 14;
    this.animate({ dist, target: () => this.bodyPos(id), yaw: this.yaw, pitch: id === "sun" ? 0.5 : 0.25 }, 1800);
    this.showInfo(id);
  }

  private animate(to: { dist: number; target: V3 | (() => V3); yaw: number; pitch: number }, ms: number, done?: () => void) {
    if (reduced()) ms = 1;
    this.anim = { from: { dist: this.dist, target: [...this.target] as V3, yaw: this.yaw, pitch: this.pitch }, to, t0: performance.now(), ms, done };
  }

  private radiusOf(p: Planet) {
    return 0.012 * Math.sqrt(p.radius / 6371);
  }

  // ---- Open, close, frame loop ------------------------------------------------------------------

  open(host: HTMLElement) {
    host.append(this.el);
    this.resize();
    addEventListener("resize", this.resize);
    addEventListener("keydown", this.onKey);
    // Start beside Earth and pull back to the whole system.
    this.time = Date.now();
    this.focus = "earth";
    this.target = this.bodyPos("earth");
    this.dist = 0.12;
    this.pitch = 0.2;
    requestAnimationFrame(() => this.el.classList.add("in"));
    this.animate({ dist: this.compact ? 16 : 70, target: () => [0, 0, 0], yaw: this.yaw - 0.8, pitch: 0.55 }, 4200, () => { this.focus = "sun"; });
    this.last = performance.now();
    const loop = (t: number) => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.info.hidden = true;
    this.animate({ dist: 0.1, target: () => this.bodyPos("earth"), yaw: this.yaw + 0.6, pitch: 0.15 }, 2200, () => {
      this.el.classList.remove("in");
      setTimeout(() => {
        cancelAnimationFrame(this.raf);
        removeEventListener("resize", this.resize);
        removeEventListener("keydown", this.onKey);
        this.el.remove();
        this.onExit?.();
      }, reduced() ? 0 : 500);
    });
  }

  private resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
    else if (e.key === " ") { e.preventDefault(); this.speed = this.speed ? 0 : 1; }
  };

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += this.speed * DAY * dt;
    if (this.anim) {
      const a = this.anim, t = Math.min(1, (now - a.t0) / a.ms), k = ease(t);
      const tgt = typeof a.to.target === "function" ? a.to.target() : a.to.target;
      // Zoom on a log scale so the pull-back feels even.
      this.dist = Math.exp(lerp(Math.log(a.from.dist), Math.log(a.to.dist), k));
      this.target = [lerp(a.from.target[0], tgt[0], k), lerp(a.from.target[1], tgt[1], k), lerp(a.from.target[2], tgt[2], k)];
      this.yaw = lerp(a.from.yaw, a.to.yaw, k);
      this.pitch = lerp(a.from.pitch, a.to.pitch, k);
      if (t >= 1) { this.anim = null; a.done?.(); }
    } else if (this.focus !== "sun") this.target = this.bodyPos(this.focus);
    this.draw();
    this.dateEl.textContent = new Date(this.time).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    if (!this.info.hidden && this.focus !== "sun") this.updateInfoLive();
  }

  // ---- Drawing ----------------------------------------------------------------------------------------

  private draw() {
    const g = this.g, W = this.canvas.width, H = this.canvas.height, u = Math.min(W, H) / 900;
    g.fillStyle = "#02030a";
    g.fillRect(0, 0, W, H);
    // Stars: rotate only (they're infinitely far).
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), f = Math.min(W, H) * 0.9;
    for (const s of this.stars) {
      let [x, y] = [s.d[0] * cy - s.d[1] * sy, s.d[0] * sy + s.d[1] * cy];
      const z = s.d[2];
      const y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      if (y2 <= 0.05) continue;
      x = W / 2 + (x / y2) * f;
      const Y = H / 2 - (z2 / y2) * f;
      if (x < 0 || x > W || Y < 0 || Y > H) continue;
      g.globalAlpha = 0.25 + s.b * 0.75;
      g.fillStyle = s.c;
      g.fillRect(x, Y, s.b > 0.8 ? 2 * u + 0.6 : u + 0.3, s.b > 0.8 ? 2 * u + 0.6 : u + 0.3);
    }
    g.globalAlpha = 1;

    // Orbits.
    g.lineWidth = Math.max(1, 1.2 * u);
    for (const p of PLANETS) {
      let o = this.orbits.get(p.id);
      if (!o || Math.abs(o.at - this.time) > 400 * DAY) { o = { at: this.time, pts: orbitPath(p, this.time, 240).map((q) => this.scale(q)) }; this.orbits.set(p.id, o); }
      g.strokeStyle = this.focus === p.id || this.hover === p.id ? p.color : "rgba(160,180,220,0.28)";
      g.beginPath();
      let pen = false;
      for (const q of o.pts) {
        const s = this.project(q);
        if (!s) { pen = false; continue; }
        if (pen) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y);
        pen = true;
      }
      g.stroke();
    }

    // Asteroid belt (each rock on its own Kepler orbit).
    g.fillStyle = "rgba(190,170,140,0.55)";
    const years = (this.time - Date.UTC(2000, 0, 1)) / (365.25 * DAY);
    for (const b of this.belt) {
      const th = b.th + (2 * Math.PI * years) / Math.pow(b.a, 1.5);
      const s = this.project(this.scale([b.a * Math.cos(th), b.a * Math.sin(th), b.z]));
      if (s) g.fillRect(s.x, s.y, u * 1.2, u * 1.2);
    }

    // Sun.
    const sun = this.project([0, 0, 0]);
    this.screen = [];
    const bodies: { id: string; pos: V3; s: { x: number; y: number; z: number } }[] = [];
    for (const p of PLANETS) {
      const pos = this.planetPos(p), s = this.project(pos);
      if (s) bodies.push({ id: p.id, pos, s });
    }
    const drawSun = () => {
      if (!sun) return;
      const r = Math.max(6 * u, (0.09 / sun.z) * f);
      for (const [k, a] of [[9, 0.05], [5, 0.1], [2.6, 0.25]] as const) {
        const grad = g.createRadialGradient(sun.x, sun.y, r * 0.5, sun.x, sun.y, r * k);
        grad.addColorStop(0, `rgba(255,200,90,${a})`);
        grad.addColorStop(1, "rgba(255,140,40,0)");
        g.fillStyle = grad;
        g.beginPath(); g.arc(sun.x, sun.y, r * k, 0, Math.PI * 2); g.fill();
      }
      const core = g.createRadialGradient(sun.x - r * 0.3, sun.y - r * 0.3, r * 0.1, sun.x, sun.y, r);
      core.addColorStop(0, "#fffbe8"); core.addColorStop(0.6, "#ffd36b"); core.addColorStop(1, "#ff9a2e");
      g.fillStyle = core;
      g.beginPath(); g.arc(sun.x, sun.y, r, 0, Math.PI * 2); g.fill();
      this.screen.push({ id: "sun", x: sun.x, y: sun.y, r: Math.max(r, 12 * u) });
      this.label("Sun", sun.x, sun.y + r + 14 * u, u, "sun");
    };
    // Far to near, with the Sun in its place.
    const items = [...bodies.map((b) => ({ z: b.s.z, draw: () => this.drawPlanet(b.id, b.pos, b.s, u, f) })), { z: sun?.z ?? 1e9, draw: drawSun }];
    items.sort((a, b) => b.z - a.z).forEach((i) => i.draw());
    this.flushLabels();
  }

  private labels: { text: string; x: number; y: number; u: number; id: string }[] = [];
  private label(text: string, x: number, y: number, u: number, id: string) {
    this.labels.push({ text, x, y, u, id });
  }

  /** Draws labels last, most important first, skipping any that would overlap. */
  private flushLabels() {
    const g = this.g;
    const rank = (id: string) => (id === this.focus ? 0 : id === this.hover ? 1 : id === "sun" ? 2 : id === "earth" ? 3 : 4 + PLANETS.findIndex((p) => p.id === id));
    const placed: [number, number, number, number][] = [];
    for (const l of this.labels.sort((a, b) => rank(a.id) - rank(b.id))) {
      const strong = l.id === this.focus || l.id === this.hover;
      g.font = `${strong ? 700 : 600} ${Math.round(12.5 * l.u + 3)}px "Terreno Sans", "Plus Jakarta Sans", system-ui, sans-serif`;
      const w = g.measureText(l.text).width, hh = 14 * l.u + 4;
      const box: [number, number, number, number] = [l.x - w / 2 - 4, l.y - hh, l.x + w / 2 + 4, l.y + 4];
      if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      g.textAlign = "center";
      g.fillStyle = strong ? "#fff" : "rgba(235,240,255,0.78)";
      g.fillText(l.text, l.x, l.y);
    }
    this.labels = [];
  }

  private drawPlanet(id: string, pos: V3, s: { x: number; y: number; z: number }, u: number, f: number) {
    const g = this.g, p = PLANETS.find((q) => q.id === id)!;
    const r = Math.max(3.2 * u, (this.radiusOf(p) / s.z) * f);
    // Light comes from the Sun: shift the highlight toward it on screen.
    const sun = this.project([0, 0, 0]);
    let lx = 0, ly = 0;
    if (sun) { const dx = sun.x - s.x, dy = sun.y - s.y, d = Math.hypot(dx, dy) || 1; lx = (dx / d) * r * 0.55; ly = (dy / d) * r * 0.55; }

    const ring = id === "saturn" ? this.ringPoints(pos, r / f * s.z) : null;
    if (ring) this.drawRing(ring, s.z, false);
    g.save();
    g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.clip();
    const base = g.createRadialGradient(s.x + lx, s.y + ly, r * 0.1, s.x + lx * 0.5, s.y + ly * 0.5, r * 1.6);
    base.addColorStop(0, "#ffffff");
    base.addColorStop(0.18, p.color);
    base.addColorStop(0.75, shade(p.color, 0.35));
    base.addColorStop(1, "#000");
    g.fillStyle = base;
    g.fillRect(s.x - r, s.y - r, 2 * r, 2 * r);
    if (id === "jupiter" || id === "saturn") {
      g.globalAlpha = 0.28;
      for (let k = -4; k <= 4; k++) {
        g.fillStyle = k % 2 ? "#8a5a30" : "#f6e7c8";
        g.fillRect(s.x - r, s.y + (k / 5) * r - r * 0.06, 2 * r, r * 0.12);
      }
      if (id === "jupiter") { g.globalAlpha = 0.6; g.fillStyle = "#b5462c"; g.beginPath(); g.ellipse(s.x + r * 0.3, s.y + r * 0.35, r * 0.18, r * 0.1, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    if (id === "earth") {
      g.globalAlpha = 0.5;
      g.fillStyle = "#3f9e4d";
      g.beginPath(); g.ellipse(s.x - r * 0.25, s.y - r * 0.1, r * 0.35, r * 0.5, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff";
      g.beginPath(); g.ellipse(s.x, s.y - r * 0.92, r * 0.6, r * 0.14, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // Night side.
    const night = g.createLinearGradient(s.x + lx * 1.8, s.y + ly * 1.8, s.x - lx * 1.8, s.y - ly * 1.8);
    night.addColorStop(0.45, "rgba(0,0,0,0)");
    night.addColorStop(1, "rgba(0,0,8,0.85)");
    g.fillStyle = night;
    g.fillRect(s.x - r, s.y - r, 2 * r, 2 * r);
    g.restore();
    if (ring) this.drawRing(ring, s.z, true);
    if (id === "earth") this.drawMoon(pos, s, r, u, f);
    this.screen.push({ id, x: s.x, y: s.y, r: Math.max(r, 12 * u) });
    this.label(id === "earth" ? "Earth · you are here" : p.name, s.x, s.y + r + 15 * u, u, id);
  }

  private ringPoints(pos: V3, planetR: number) {
    const n = SATURN_POLE;
    // Two axes in the ring plane.
    const a: V3 = norm(cross(n, [0, 0, 1]));
    const b: V3 = cross(n, a);
    const out: { inner: V3[]; outer: V3[] } = { inner: [], outer: [] };
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      for (const [key, k] of [["inner", 1.25], ["outer", 2.3]] as const)
        out[key].push([pos[0] + (a[0] * c + b[0] * s) * planetR * k, pos[1] + (a[1] * c + b[1] * s) * planetR * k, pos[2] + (a[2] * c + b[2] * s) * planetR * k]);
    }
    return out;
  }

  private drawRing(ring: { inner: V3[]; outer: V3[] }, planetZ: number, front: boolean) {
    const g = this.g;
    for (let i = 0; i < ring.outer.length - 1; i++) {
      const o1 = this.project(ring.outer[i]), o2 = this.project(ring.outer[i + 1]), i1 = this.project(ring.inner[i]), i2 = this.project(ring.inner[i + 1]);
      if (!o1 || !o2 || !i1 || !i2) continue;
      const isFront = (o1.z + o2.z) / 2 < planetZ;
      if (isFront !== front) continue;
      g.fillStyle = "rgba(226,207,160,0.62)";
      g.beginPath(); g.moveTo(o1.x, o1.y); g.lineTo(o2.x, o2.y); g.lineTo(i2.x, i2.y); g.lineTo(i1.x, i1.y); g.closePath(); g.fill();
    }
  }

  private drawMoon(earth: V3, _s: { x: number; y: number; z: number }, r: number, u: number, f: number) {
    // The Moon's angle from the Sun–Earth line follows its real phase.
    const age = moonPhase(this.time).age / 29.530588853;
    const sunAngle = Math.atan2(-earth[1], -earth[0]);
    const th = sunAngle + Math.PI + 2 * Math.PI * age;
    const d = this.radiusOf(PLANETS[2]) * 5;
    const m = this.project([earth[0] + Math.cos(th) * d, earth[1] + Math.sin(th) * d, earth[2]]);
    if (!m || r < 6 * u) return;
    const mr = Math.max(2 * u, r * 0.27);
    this.g.fillStyle = "#cfcac2";
    this.g.beginPath(); this.g.arc(m.x, m.y, mr, 0, Math.PI * 2); this.g.fill();
    void f;
  }

  // ---- Info card ----------------------------------------------------------------------------------------

  private liveEl: HTMLElement | null = null;
  private showInfo(id: string) {
    if (id === "sun") {
      this.info.hidden = false;
      this.liveEl = null;
      this.info.replaceChildren(h("strong", {}, "The Sun"), h("p", {}, "A middle-aged yellow dwarf star, 1.39 million km across, holding 99.86% of the solar system's mass. Its light takes about 8 minutes 20 seconds to reach Earth."));
      return;
    }
    const p = PLANETS.find((q) => q.id === id)!;
    this.liveEl = h("div", { class: "solar-live" });
    this.info.hidden = false;
    this.info.replaceChildren(
      h("strong", { style: `color:${p.color}` }, p.name), h("p", {}, p.facts.about),
      h("dl", {}, h("dt", {}, "Diameter"), h("dd", {}, `${Math.round(p.radius * 2).toLocaleString()} km`), h("dt", {}, "Day"), h("dd", {}, p.facts.day), h("dt", {}, "Year"), h("dd", {}, p.facts.year), h("dt", {}, "Moons"), h("dd", {}, String(p.facts.moons))),
      this.liveEl);
    this.updateInfoLive();
  }

  private updateInfoLive() {
    const p = PLANETS.find((q) => q.id === this.focus);
    if (!p || !this.liveEl) return;
    const P = heliocentric(p, this.time), E = heliocentric(PLANETS[2], this.time);
    const fromSun = Math.hypot(...P) * AU_KM, fromEarth = Math.hypot(P[0] - E[0], P[1] - E[1], P[2] - E[2]) * AU_KM;
    const light = fromEarth / 299_792.458 / 60;
    this.liveEl.textContent = p.id === "earth"
      ? `${(fromSun / 1e6).toFixed(1)} million km from the Sun on this date.`
      : `${(fromSun / 1e6).toFixed(0)} million km from the Sun · ${(fromEarth / 1e6).toFixed(0)} million km from Earth, so its light takes ${light < 60 ? `${light.toFixed(1)} minutes` : `${(light / 60).toFixed(1)} hours`} to reach us.`;
  }

  // ---- Input ------------------------------------------------------------------------------------------------

  private bindInput() {
    const c = this.canvas;
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    c.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; c.setPointerCapture(e.pointerId); this.anim = null; });
    c.addEventListener("pointermove", (e) => {
      const prev = ptrs.get(e.pointerId);
      const dpr = c.width / innerWidth;
      if (!prev) {
        const hit = this.hitTest(e.clientX * dpr, e.clientY * dpr);
        this.hover = hit;
        c.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a2, b2] = [...ptrs.values()];
        const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (pinch && d0 > 0) this.dist = Math.min(400, Math.max(0.02, this.dist * (d0 / d1)));
        pinch = 1;
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.006));
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = 0;
      if (moved < 6 && e.type === "pointerup") {
        const dpr = c.width / innerWidth;
        const hit = this.hitTest(e.clientX * dpr, e.clientY * dpr);
        if (hit) this.goTo(hit);
      }
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.anim = null; this.dist = Math.min(400, Math.max(0.02, this.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  }

  private hitTest(x: number, y: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const s of this.screen) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r + 8 && d < bd) { bd = d; best = s.id; }
    }
    return best;
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}
