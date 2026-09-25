// A responsive SVG line/area chart for elevation profiles and hypsometric curves.
import { h } from "./dom";

export interface ChartData {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** Optional per-sample flag drawn as a highlighted band (e.g. ponded reaches). */
  flag?: ArrayLike<boolean>;
  flagLabel?: string;
}

export interface ChartOptions {
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  /** Show the vertical exaggeration (only meaningful when both axes are metres). */
  showExaggeration?: boolean;
  annotations?: { index: number; label: string }[];
  onHover?: (index: number | null) => void;
}

const NS = "http://www.w3.org/2000/svg";
const M = { top: 16, right: 18, bottom: 34, left: 76 };

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export class Chart {
  readonly el: HTMLDivElement;
  private svg = s("svg");
  private readout = h("div", { class: "chart-readout" });
  private data: ChartData | null = null;
  private opts: ChartOptions | null = null;

  constructor() {
    this.el = h("div", { class: "chart" });
    this.el.append(this.svg, this.readout);
    new ResizeObserver(() => this.draw()).observe(this.el);
  }

  render(data: ChartData, opts: ChartOptions) {
    this.data = data;
    this.opts = opts;
    this.draw();
  }

  private draw() {
    const { data, opts } = this;
    const width = this.el.clientWidth, height = this.el.clientHeight;
    this.svg.replaceChildren();
    if (!data || !opts || width < 50 || height < 50) return;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const n = data.x.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, data.x[i]); x1 = Math.max(x1, data.x[i]);
      y0 = Math.min(y0, data.y[i]); y1 = Math.max(y1, data.y[i]);
    }
    const pad = Math.max(1, (y1 - y0) * 0.08);
    y0 -= pad; y1 += pad;
    const pw = width - M.left - M.right, ph = height - M.top - M.bottom;
    const sx = (v: number) => M.left + ((v - x0) / (x1 - x0 || 1)) * pw;
    const sy = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * ph;

    const grid = s("g", { class: "chart-grid" });
    for (const t of niceTicks(y0, y1, Math.max(2, Math.floor(ph / 40)))) {
      grid.append(s("line", { x1: M.left, x2: M.left + pw, y1: sy(t), y2: sy(t) }));
      const label = s("text", { x: M.left - 8, y: sy(t) + 4, "text-anchor": "end" });
      label.textContent = opts.yFormat(t);
      grid.append(label);
    }
    for (const t of niceTicks(x0, x1, Math.max(2, Math.floor(pw / 90)))) {
      const label = s("text", { x: sx(t), y: M.top + ph + 18, "text-anchor": "middle" });
      label.textContent = opts.xFormat(t);
      grid.append(s("line", { x1: sx(t), x2: sx(t), y1: M.top + ph, y2: M.top + ph + 4 }), label);
    }
    const yl = s("text", { class: "chart-axis-label", transform: `translate(12 ${M.top + ph / 2}) rotate(-90)`, "text-anchor": "middle" });
    yl.textContent = opts.yLabel;
    const xl = s("text", { class: "chart-axis-label", x: M.left + pw, y: height - 2, "text-anchor": "end" });
    xl.textContent = opts.xLabel;
    grid.append(yl, xl);
    this.svg.append(grid);

    let line = "";
    for (let i = 0; i < n; i++) line += `${i ? "L" : "M"}${sx(data.x[i]).toFixed(1)},${sy(data.y[i]).toFixed(1)}`;
    const area = `${line}L${sx(data.x[n - 1])},${M.top + ph}L${sx(data.x[0])},${M.top + ph}Z`;
    this.svg.append(s("path", { d: area, class: "chart-area" }), s("path", { d: line, class: "chart-line" }));

    if (data.flag) {
      const g = s("g", { class: "chart-flag" });
      for (let i = 1; i < n; i++) {
        if (!data.flag[i]) continue;
        g.append(s("line", { x1: sx(data.x[i - 1]), y1: sy(data.y[i - 1]), x2: sx(data.x[i]), y2: sy(data.y[i]) }));
      }
      this.svg.append(g);
    }

    for (const a of opts.annotations ?? []) {
      const x = sx(data.x[a.index]), y = sy(data.y[a.index]);
      const g = s("g", { class: "chart-annotation" });
      const t = s("text", { x, y: y - 10, "text-anchor": x > width - 80 ? "end" : x < M.left + 40 ? "start" : "middle" });
      t.textContent = a.label;
      g.append(s("circle", { cx: x, cy: y, r: 3.5 }), t);
      this.svg.append(g);
    }

    if (opts.showExaggeration) {
      const ve = ((x1 - x0) / pw) / ((y1 - y0) / ph);
      const t = s("text", { class: "chart-ve", x: M.left + 8, y: M.top + 12 });
      const trueScale = ve > 0.9 && ve < 1.1;
      t.textContent = trueScale ? "True scale (no exaggeration)" : `Vertical exaggeration ≈ ${ve.toFixed(ve < 10 ? 1 : 0)}×`;
      const why = ve > 1
        ? "Heights are stretched relative to distances so the shape is readable. Real slopes are gentler than they look."
        : "Heights are squashed relative to distances. Real slopes are steeper than they look.";
      if (!trueScale) t.append(Object.assign(s("title"), { textContent: why }));
      this.svg.append(t);
    }

    const cursor = s("g", { class: "chart-cursor", visibility: "hidden" });
    const cline = s("line", { y1: M.top, y2: M.top + ph });
    const cdot = s("circle", { r: 4.5 });
    cursor.append(cline, cdot);
    const hit = s("rect", { x: M.left, y: M.top, width: pw, height: ph, fill: "transparent" });
    this.svg.append(cursor, hit);

    const move = (ev: PointerEvent) => {
      const rect = this.svg.getBoundingClientRect();
      const xv = x0 + ((ev.clientX - rect.left - M.left) / pw) * (x1 - x0);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (data.x[mid] < xv) lo = mid; else hi = mid;
      }
      const i = Math.abs(data.x[lo] - xv) < Math.abs(data.x[hi] - xv) ? lo : hi;
      const cx = sx(data.x[i]), cy = sy(data.y[i]);
      cline.setAttribute("x1", String(cx));
      cline.setAttribute("x2", String(cx));
      cdot.setAttribute("cx", String(cx));
      cdot.setAttribute("cy", String(cy));
      cursor.setAttribute("visibility", "visible");
      this.readout.textContent = `${opts.xFormat(data.x[i])}  ·  ${opts.yFormat(data.y[i])}`;
      this.readout.style.opacity = "1";
      opts.onHover?.(i);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => {
      cursor.setAttribute("visibility", "hidden");
      this.readout.style.opacity = "0";
      opts.onHover?.(null);
    });
  }
}
