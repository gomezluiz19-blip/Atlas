// What sits over the globe on a TV, borrowed from classrooms, broadcast and signage:
//   Ink: a laser pointer (a red dot with a fading tail), a spotlight (the room goes dim except one circle), and a
//     pen to draw over the globe, all steered by a thumb on the phone.
//   A countdown the whole room can read, with a chime at the end.
//   Keeping the screen awake (Screen Wake Lock), and nudging the fixed titles a few pixels now and then so a
//   screen left on all day in a lobby doesn't burn them in.
import { h } from "../ui/dom";
import { clockText } from "./rooms";

export type InkMode = "pointer" | "spotlight" | "pen";

export class Ink {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private spot: HTMLElement;
  private trail: { x: number; y: number; t: number }[] = [];
  private raf = 0;
  private last: { x: number; y: number } | null = null;
  private strokes: { x: number; y: number }[][] = [];
  mode: InkMode | null = null;
  color = "#ff3b30";

  constructor() {
    this.canvas = h("canvas", { class: "tv-ink" }) as HTMLCanvasElement;
    this.g = this.canvas.getContext("2d")!;
    this.spot = h("div", { class: "tv-spot" });
    this.el = h("div", { class: "tv-ink-layer" }, this.spot, this.canvas);
    addEventListener("resize", this.size);
    this.size();
  }
  private size = () => { this.canvas.width = innerWidth * devicePixelRatio; this.canvas.height = innerHeight * devicePixelRatio; this.draw(); };

  set(mode: InkMode | null) {
    this.mode = mode;
    this.el.dataset.mode = mode ?? "";
    this.trail = []; this.last = null;
    if (mode !== "pen") this.strokes = [];
    if (mode === "spotlight") this.move(0.5, 0.5);
    this.draw();
  }
  clear() { this.strokes = []; this.draw(); }

  /** A thumb on the phone's pad: x and y from 0 to 1 across the screen. */
  move(x: number, y: number, down = false) {
    const px = Math.min(1, Math.max(0, x)) * innerWidth, py = Math.min(1, Math.max(0, y)) * innerHeight;
    if (this.mode === "spotlight") { this.spot.style.setProperty("--x", `${px}px`); this.spot.style.setProperty("--y", `${py}px`); return; }
    if (this.mode === "pen") {
      if (down) {
        if (!this.last) this.strokes.push([]);
        this.strokes[this.strokes.length - 1].push({ x: px, y: py });
      }
      this.last = down ? { x: px, y: py } : null;
    }
    this.trail.push({ x: px, y: py, t: performance.now() });
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }
  /** The thumb lifted: the pen's stroke ends, the pointer fades. */
  lift() { this.last = null; }

  private loop = () => {
    this.raf = 0;
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < 450);
    this.draw();
    if (this.trail.length) this.raf = requestAnimationFrame(this.loop);
  };
  private draw() {
    const g = this.g, k = devicePixelRatio;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.lineCap = "round"; g.lineJoin = "round";
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      g.strokeStyle = this.color; g.lineWidth = 6; g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(s[0].x, s[0].y); for (const p of s.slice(1)) g.lineTo(p.x, p.y); g.stroke();
    }
    g.shadowBlur = 0;
    if (this.mode !== "pointer" && this.mode !== "pen") return;
    const now = performance.now(), tip = this.trail[this.trail.length - 1];
    if (this.mode === "pointer") {
      // A tail that fades, then the dot with its glow.
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i], life = 1 - (now - b.t) / 450;
        g.strokeStyle = `rgba(255,59,48,${(life * 0.55).toFixed(3)})`; g.lineWidth = 10 * life;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    if (tip) {
      const r = this.mode === "pen" ? 7 : 11;
      const glow = g.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r * 3.2);
      glow.addColorStop(0, this.mode === "pen" ? this.color : "rgba(255,80,70,.95)"); glow.addColorStop(0.35, "rgba(255,59,48,.45)"); glow.addColorStop(1, "rgba(255,59,48,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(tip.x, tip.y, r * 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(tip.x, tip.y, r * 0.35, 0, Math.PI * 2); g.fill();
    }
  }
  dispose() { removeEventListener("resize", this.size); cancelAnimationFrame(this.raf); this.el.remove(); }
}

/** A countdown in the corner, big enough to read from the back of the room; it chimes at zero. */
export class Countdown {
  readonly el: HTMLElement;
  private ring: SVGCircleElement;
  private text: HTMLElement;
  private timer = 0;
  private ends = 0;
  private total = 0;
  constructor(private onDone?: () => void) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 100 100");
    const bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", "50"); bg.setAttribute("cy", "50"); bg.setAttribute("r", "44"); bg.setAttribute("class", "tv-timer-bg");
    this.ring = document.createElementNS(NS, "circle"); this.ring.setAttribute("cx", "50"); this.ring.setAttribute("cy", "50"); this.ring.setAttribute("r", "44"); this.ring.setAttribute("class", "tv-timer-ring");
    svg.append(bg, this.ring);
    this.text = h("strong", {});
    this.el = h("div", { class: "tv-timer", role: "timer", "aria-live": "off" }, svg, this.text);
  }
  get running() { return this.ends > Date.now(); }
  start(seconds: number) {
    clearInterval(this.timer);
    this.el.classList.remove("done");
    if (seconds <= 0) { this.ends = 0; this.el.classList.remove("on"); return; }
    this.total = seconds; this.ends = Date.now() + seconds * 1000;
    this.el.classList.add("on");
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 250);
  }
  private tick() {
    const left = (this.ends - Date.now()) / 1000;
    this.text.textContent = clockText(left);
    this.ring.style.strokeDashoffset = String(276.5 * (1 - Math.max(0, left) / this.total));
    this.el.classList.toggle("low", left <= 10);
    if (left <= 0) {
      clearInterval(this.timer);
      this.ends = 0;
      this.text.textContent = "Time!";
      this.el.classList.add("done");
      chime();
      this.onDone?.();
      window.setTimeout(() => this.el.classList.remove("on", "done", "low"), 8000);
    }
  }
  dispose() { clearInterval(this.timer); this.el.remove(); }
}

/** Three soft notes, like a school bell's polite cousin. */
export function chime() {
  try {
    const A = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new A();
    [659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.22;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.2);
    });
    window.setTimeout(() => void ctx.close(), 2500);
  } catch { /* no sound here */ }
}

/** Keeps the screen on while TV mode runs (where the browser allows it), and again after the tab comes back. */
export function stayAwake(): () => void {
  type Lock = { release(): Promise<void> };
  let lock: Lock | null = null, stopped = false;
  const ask = async () => {
    try { lock = await (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<Lock> } }).wakeLock?.request("screen") ?? null; } catch { lock = null; }
  };
  const again = () => { if (!stopped && document.visibilityState === "visible") void ask(); };
  void ask();
  document.addEventListener("visibilitychange", again);
  return () => { stopped = true; document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
}

/** Moves fixed titles a few pixels every few minutes, so an all-day screen doesn't keep them burnt in. */
export function antiBurn(el: HTMLElement, everyMs = 180_000): () => void {
  let n = 0;
  const t = window.setInterval(() => { n++; el.style.setProperty("--shift-x", `${((n * 7) % 9) - 4}px`); el.style.setProperty("--shift-y", `${((n * 5) % 7) - 3}px`); }, everyMs);
  return () => clearInterval(t);
}
