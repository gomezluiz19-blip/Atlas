// Moving water (or anything that flows along lines): drops of light travel
// along each line in its own direction, leaving a short fading trail, drawn on
// a transparent canvas laid over the globe. Rivers run fast and bright, drains
// in a thin trickle, buried culverts dim. OpenStreetMap draws waterways in the
// direction they flow, so the drops go downstream.
import { Cartesian2, Cartesian3, SceneTransforms, type Viewer } from "cesium";

export interface FlowLine {
  pts: [number, number][];
  color: string;
  /** How fast the drops travel, metres a second (shown speeded up). */
  speed: number;
  /** Drops per kilometre of line. */
  density?: number;
  /** Radius of a drop, CSS pixels. */
  size?: number;
  /** Buried: drawn faint. */
  dim?: boolean;
  /** Lifts the middle of the line off the ground (metres), for long hops. */
  arc?: number;
}

interface Prepared { line: FlowLine; xyz: Cartesian3[]; cum: number[]; len: number }
interface Drop { p: Prepared; d: number }

export class FlowOverlay {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private lines: Prepared[] = [];
  private drops: Drop[] = [];
  private last = 0;
  private visible = true;
  private moving = false;
  private scratch = new Cartesian3();
  private win = new Cartesian2();
  private remove: (() => void)[] = [];

  constructor(private viewer: Viewer, private opts: { maxHeight?: number; maxDrops?: number; /** How fast trails fade each frame (0–1): lower leaves longer streaks. */ fade?: number } = {}) {
    this.canvas.className = "flow-layer";
    viewer.canvas.after(this.canvas);
    // While the camera moves, draw in step with the globe (after each of its frames) so the drops stay glued to
    // the ground. While it's still, the drops run on their own animation frames and the globe isn't redrawn at
    // all: animating a few thousand dots shouldn't cost a full 3D render sixty times a second.
    this.remove.push(viewer.scene.postRender.addEventListener(() => { if (this.moving) this.frame(); }));
    this.remove.push(viewer.camera.moveStart.addEventListener(() => (this.moving = true)));
    this.remove.push(viewer.camera.moveEnd.addEventListener(() => { this.moving = false; this.kick(); }));
    const onVis = () => this.kick();
    document.addEventListener("visibilitychange", onVis);
    this.remove.push(() => document.removeEventListener("visibilitychange", onVis));
  }

  private raf = 0;
  /** Starts the overlay's own animation loop if there's something to animate. */
  private kick() {
    if (this.raf || !this.visible || !this.drops.length || document.hidden) return;
    const loop = () => {
      this.raf = 0;
      if (!this.visible || !this.drops.length || document.hidden) return;
      if (!this.moving) this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  set(lines: FlowLine[]) {
    this.lines = lines.filter((l) => l.pts.length > 1).map((line) => {
      const n = line.pts.length - 1;
      const xyz = line.pts.map(([lon, lat], i) => Cartesian3.fromDegrees(lon, lat, 3 + (line.arc ? Math.sin((Math.PI * i) / Math.max(1, n)) * line.arc : 0)));
      const cum = [0];
      for (let i = 1; i < xyz.length; i++) cum.push(cum[i - 1] + Cartesian3.distance(xyz[i - 1], xyz[i]));
      return { line, xyz, cum, len: cum[cum.length - 1] };
    }).filter((p) => p.len > 5);
    // Drops spread along each line by its length, within an overall budget.
    const budget = this.opts.maxDrops ?? 2400;
    const want = this.lines.map((p) => Math.max(1, Math.round((p.len / 1000) * (p.line.density ?? 20))));
    const total = want.reduce((a, b) => a + b, 0);
    const k = total > budget ? budget / total : 1;
    this.drops = [];
    this.lines.forEach((p, i) => { for (let n = Math.max(1, Math.round(want[i] * k)); n > 0; n--) this.drops.push({ p, d: Math.random() * p.len }); });
    this.clear();
    this.kick();
  }

  show(v: boolean) { this.visible = v; if (!v) this.clear(); else this.kick(); }

  destroy() { for (const r of this.remove) r(); if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.canvas.remove(); }

  private clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  private frame() {
    const now = performance.now(), dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0);
    this.last = now;
    const c = this.canvas, ctx = this.ctx, dpr = Math.min(2, devicePixelRatio || 1);
    const w = this.viewer.canvas.clientWidth, h = this.viewer.canvas.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`; }
    const high = this.viewer.camera.positionCartographic.height > (this.opts.maxHeight ?? 40_000);
    if (!this.visible || !this.drops.length || high || document.hidden) { if (this.drops.length) this.clear(); return; }
    // Fade what was drawn, so each drop leaves a short trail (none while the camera moves: it would smear).
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = this.moving ? "rgba(0,0,0,1)" : `rgba(0,0,0,${this.opts.fade ?? 0.16})`;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "lighter";
    const scene = this.viewer.scene, cam = this.viewer.camera.positionWC, toCam = new Cartesian3();
    // One path per colour and brightness, filled once: a few canvas calls a frame instead of one per drop.
    const paths = new Map<string, Path2D>();
    for (const drop of this.drops) {
      const p = drop.p;
      drop.d += p.line.speed * dt;
      if (drop.d > p.len) drop.d -= p.len;
      // The segment this drop is on.
      let i = 1;
      while (i < p.cum.length - 1 && p.cum[i] < drop.d) i++;
      const a = p.cum[i - 1], f = (drop.d - a) / Math.max(1e-6, p.cum[i] - a);
      Cartesian3.lerp(p.xyz[i - 1], p.xyz[i], f, this.scratch);
      // Behind the Earth's curve: not drawn (matters when flows span continents).
      if (Cartesian3.dot(this.scratch, Cartesian3.subtract(cam, this.scratch, toCam)) < 0) continue;
      const s = SceneTransforms.worldToWindowCoordinates(scene, this.scratch, this.win);
      if (!s || s.x < -4 || s.y < -4 || s.x > w + 4 || s.y > h + 4) continue;
      const key = `${p.line.dim ? 1 : 0}${p.line.color}`, r = (p.line.size ?? 1.8) * dpr;
      let path = paths.get(key);
      if (!path) { path = new Path2D(); paths.set(key, path); }
      path.moveTo(s.x * dpr + r, s.y * dpr);
      path.arc(s.x * dpr, s.y * dpr, r, 0, Math.PI * 2);
    }
    for (const [key, path] of paths) {
      ctx.globalAlpha = key[0] === "1" ? 0.35 : 0.9;
      ctx.fillStyle = key.slice(1);
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
