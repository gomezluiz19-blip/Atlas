// Section Studio: an interactive geologic cross-section. Layers can be
// highlighted, tilted and shifted, and a time slider replays deposition and
// then erosion down to today's landscape.
import { depositedFraction, horizonElevation, layerIndexAt, type StackLayer, type Structure, type StructureFit } from "../analysis/geosection";
import { formatAge, lithologySummary, type MapUnit } from "../data/macrostrat";
import { niceTicks } from "./chart";
import { formatDistance, h } from "./dom";
import { lithPattern, patternFor } from "./lithology";

export interface SectionData {
  distance: ArrayLike<number>;
  elevation: ArrayLike<number>;
  stack: StackLayer[];
  fit: StructureFit;
  /** Mapped bedrock along the surface, as contiguous runs. */
  surface: { x0: number; x1: number; unit: MapUnit }[];
}

const M = { top: 18, right: 14, bottom: 30, left: 66 };
const BASEMENT = "#8d8a86";

export class SectionStudio {
  readonly el: HTMLElement;
  private canvas = h("canvas", { class: "studio-canvas", "aria-label": "Geologic cross-section" });
  private tip = h("div", { class: "studio-tip", hidden: true });
  private legend = h("div", { class: "studio-legend" });
  private timeLabel = h("span", { class: "studio-time-label" });
  private timeInput: HTMLInputElement;
  private dipInput: HTMLInputElement;
  private shiftInput: HTMLInputElement;
  private dipValue = h("span", { class: "value" });
  private shiftValue = h("span", { class: "value" });
  private playBtn: HTMLButtonElement;
  private structure: Structure;
  private highlight: number | null = null;
  /** 0..1 over deposition then erosion; 1 is today. */
  private time = 1;
  private showEroded = true;
  private showSurface = true;
  private frame = 0;
  private playing = false;
  onStructureChange?: (s: Structure) => void;
  onHighlight?: (index: number | null) => void;

  constructor(private data: SectionData) {
    this.structure = { ...data.fit.structure };
    this.timeInput = h("input", { type: "range", id: "studio-time", min: 0, max: 1000, step: 1, value: 1000, "aria-label": "Geologic time" });
    this.timeInput.addEventListener("input", () => { this.stop(); this.time = Number(this.timeInput.value) / 1000; this.draw(); });
    this.dipInput = h("input", { type: "range", id: "studio-dip", min: -30, max: 30, step: 0.1, value: this.dipDeg(), "aria-label": "Layer tilt" });
    this.dipInput.addEventListener("input", () => { this.structure.slope = Math.tan((Number(this.dipInput.value) * Math.PI) / 180); this.changed(); });
    this.shiftInput = h("input", { type: "range", id: "studio-shift", min: -1500, max: 1500, step: 10, value: 0, "aria-label": "Raise or lower layers" });
    this.shiftInput.addEventListener("input", () => { this.structure.top = data.fit.structure.top + Number(this.shiftInput.value); this.changed(); });
    this.playBtn = h("button", { class: "btn btn-small", onclick: () => (this.playing ? this.stop() : this.play()) }, "▶ Play history");

    const reset = h("button", {
      class: "btn btn-small",
      onclick: () => {
        this.structure = { ...data.fit.structure };
        this.shiftInput.value = "0";
        this.dipInput.value = String(this.dipDeg());
        this.changed();
      },
    }, "Reset to map fit");
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, title: string) =>
      h("label", { class: "check", title }, h("input", { type: "checkbox", checked: get(), onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); this.draw(); } }), label);

    const controls = h(
      "div",
      { class: "studio-controls" },
      h("div", { class: "studio-time" }, this.playBtn, this.timeInput, this.timeLabel),
      h(
        "div",
        { class: "studio-adjust" },
        h("label", { class: "slider-inline" }, h("span", {}, "Tilt"), this.dipInput, this.dipValue),
        h("label", { class: "slider-inline" }, h("span", {}, "Raise / lower"), this.shiftInput, this.shiftValue),
        reset,
        toggle("Rock removed by erosion", () => this.showEroded, (v) => (this.showEroded = v), "Show, faintly, the layers that once lay above today's surface"),
        toggle("Mapped surface", () => this.showSurface, (v) => (this.showSurface = v), "Colour the ground line by the bedrock map"),
      ),
    );
    const wrap = h("div", { class: "studio-plot" }, this.canvas, this.tip);
    this.el = h("div", { class: "studio" }, h("div", { class: "studio-main" }, wrap, controls), this.legend);

    this.renderLegend();
    this.updateLabels();
    new ResizeObserver(() => this.draw()).observe(wrap);
    this.canvas.addEventListener("pointermove", (e) => this.hover(e));
    this.canvas.addEventListener("pointerleave", () => (this.tip.hidden = true));
    this.canvas.addEventListener("click", (e) => {
      const i = this.layerAtEvent(e);
      this.setHighlight(i !== null && i >= 0 && i < data.stack.length && this.highlight !== i ? i : null);
    });
  }

  get currentStructure(): Structure {
    return this.structure;
  }

  get currentHighlight(): number | null {
    return this.highlight;
  }

  /** Draws the section into a canvas of the given size (for PNG export). */
  exportPng(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
  }

  setHighlight(i: number | null) {
    this.highlight = i;
    this.legend.querySelectorAll<HTMLElement>(".legend-unit").forEach((row, k) => row.classList.toggle("active", k === i));
    this.onHighlight?.(i);
    this.draw();
  }

  private dipDeg(): number {
    return Math.round((Math.atan(this.structure.slope) * 180) / Math.PI * 10) / 10;
  }

  private changed() {
    this.updateLabels();
    this.draw();
    this.onStructureChange?.(this.structure);
  }

  private updateLabels() {
    const d = this.dipDeg();
    this.dipValue.textContent = d === 0 ? "flat" : `${Math.abs(d).toFixed(1)}° ${d > 0 ? "up to B" : "up to A"}`;
    const shift = Math.round(this.structure.top - this.data.fit.structure.top);
    this.shiftValue.textContent = `${shift > 0 ? "+" : ""}${shift} m`;
  }

  private play() {
    this.playing = true;
    this.playBtn.textContent = "❚❚ Pause";
    if (this.time >= 1) this.time = 0;
    let last = performance.now();
    const step = (now: number) => {
      if (!this.playing) return;
      this.time = Math.min(1, this.time + (now - last) / 14000);
      last = now;
      this.timeInput.value = String(Math.round(this.time * 1000));
      this.draw();
      if (this.time >= 1) this.stop();
      else this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private stop() {
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.playBtn.textContent = "▶ Play history";
  }

  /** Splits the slider into one step per layer (oldest first), then erosion. */
  private timeState(): { ma: number | null; erosion: number; label: string } {
    const layers = this.data.stack;
    const n = layers.length;
    if (n === 0) return { ma: null, erosion: 1, label: "Today" };
    const segments = n + 1;
    const v = Math.min(this.time * segments, segments - 1e-9);
    const k = Math.floor(v);
    const f = v - k;
    if (this.time >= 1) return { ma: null, erosion: 1, label: "Today: the landscape after uplift and erosion" };
    if (k >= n) return { ma: null, erosion: f, label: "Uplift and erosion cut down through the layers…" };
    const layer = layers[n - 1 - k];
    const u = layer.unit;
    const ma = u.b_age - f * (u.b_age - u.t_age);
    return { ma, erosion: 0, label: `${formatAge(ma)} ago · depositing ${u.unit_name}` };
  }

  private renderLegend() {
    const rows = this.data.stack.map((l, i) => {
      const swatch = h("canvas", { class: "legend-swatch", width: 28, height: 20 });
      const g = swatch.getContext("2d")!;
      g.fillStyle = l.unit.color;
      g.fillRect(0, 0, 28, 20);
      const p = lithPattern(g, patternFor(l.unit.lith));
      if (p) { g.fillStyle = p; g.fillRect(0, 0, 28, 20); }
      const thick = Math.round(l.depthBottom - l.depthTop);
      const age = l.unit.t_age === l.unit.b_age ? formatAge(l.unit.b_age) : `${Math.round(l.unit.b_age)}–${Math.round(l.unit.t_age)} Ma`;
      return h(
        "button",
        { class: "legend-unit", onclick: () => this.setHighlight(this.highlight === i ? null : i), title: "Highlight this layer" },
        swatch,
        h("span", { class: "legend-text" },
          h("span", { class: "legend-name" }, l.unit.unit_name),
          h("span", { class: "legend-meta" }, `${age} · ~${thick.toLocaleString()} m · ${lithologySummary(l.unit) || "lithology unknown"}`)),
      );
    });
    this.legend.replaceChildren(
      h("div", { class: "legend-head" }, "Layers, youngest first"),
      ...rows,
      h("div", { class: "legend-unit static" }, h("span", { class: "legend-swatch basement" }), h("span", { class: "legend-text" }, h("span", { class: "legend-name" }, "Older rock"), h("span", { class: "legend-meta" }, "Below the column's oldest recorded unit"))),
    );
  }

  private geometry() {
    const { distance: d, elevation: z, stack } = this.data;
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    const n = d.length;
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < n; i++) { zmin = Math.min(zmin, z[i]); zmax = Math.max(zmax, z[i]); }
    const relief = Math.max(50, zmax - zmin);
    const L = d[n - 1];
    const s = this.structure;
    const stackTop = Math.max(horizonElevation(s, 0, 0), horizonElevation(s, 0, L));
    const stackBottom = stack.length ? Math.min(horizonElevation(s, stack[stack.length - 1].depthBottom, 0), horizonElevation(s, stack[stack.length - 1].depthBottom, L)) : zmin;
    const y1 = Math.min(Math.max(zmax, stackTop), zmax + relief * 0.9) + relief * 0.06;
    const y0 = Math.max(Math.min(zmin - relief * 0.35, stackBottom - relief * 0.1), zmin - Math.max(relief * 1.6, 400));
    const pw = w - M.left - M.right, ph = hgt - M.top - M.bottom;
    const sx = (x: number) => M.left + (x / L) * pw;
    const sy = (e: number) => M.top + (1 - (e - y0) / (y1 - y0)) * ph;
    const ix = (px: number) => ((px - M.left) / pw) * L;
    const iy = (py: number) => y0 + (1 - (py - M.top) / ph) * (y1 - y0);
    return { w, hgt, n, L, zmin, zmax, y0, y1, pw, ph, sx, sy, ix, iy };
  }

  private draw() {
    const cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, hgt = cv.clientHeight;
    if (w < 60 || hgt < 60) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(hgt * dpr);
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.el);
    const ink = css.getPropertyValue("--text").trim() || "#e8eef7";
    const muted = css.getPropertyValue("--muted").trim() || "#9aa8bc";
    const G = this.geometry();
    const { distance: d, elevation: z, stack } = this.data;
    const s = this.structure;
    const state = this.timeState();
    ctx.clearRect(0, 0, w, hgt);

    // Sky.
    const sky = ctx.createLinearGradient(0, M.top, 0, M.top + G.ph);
    sky.addColorStop(0, "rgba(120, 170, 220, 0.16)");
    sky.addColorStop(1, "rgba(120, 170, 220, 0.02)");
    ctx.fillStyle = sky;
    ctx.fillRect(M.left, M.top, G.pw, G.ph);

    // The surface that clips the rock: today's ground, or a partly eroded one.
    const surfaceAt = (i: number) => {
      const top = horizonElevation(s, 0, d[i]);
      if (state.ma !== null) return Infinity; // before erosion: nothing removed yet
      return z[i] + (1 - state.erosion) * Math.max(0, top - z[i]);
    };
    const groundPath = () => {
      const p = new Path2D();
      p.moveTo(G.sx(d[0]), G.sy(G.y0) + 2);
      for (let i = 0; i < G.n; i++) p.lineTo(G.sx(d[i]), G.sy(Math.min(surfaceAt(i), G.y1 + 1e6)));
      p.lineTo(G.sx(d[G.n - 1]), G.sy(G.y0) + 2);
      p.closePath();
      return p;
    };

    const plotClip = new Path2D();
    plotClip.rect(M.left, M.top, G.pw, G.ph);
    ctx.save();
    ctx.clip(plotClip);

    const drawLayers = (alpha: number) => {
      // Basement below the stack.
      const baseDepth = stack.length ? stack[stack.length - 1].depthBottom : 0;
      ctx.globalAlpha = alpha * (this.highlight === null ? 1 : 0.3);
      ctx.fillStyle = BASEMENT;
      this.quad(ctx, G, s, baseDepth, baseDepth + 1e6);
      ctx.fill();
      const p = lithPattern(ctx, "metamorphic");
      if (p) { ctx.fillStyle = p; ctx.fill(); }
      for (let i = stack.length - 1; i >= 0; i--) {
        const l = stack[i];
        let top = l.depthTop;
        if (state.ma !== null) {
          const f = depositedFraction(l.unit, state.ma);
          if (f <= 0) continue;
          top = l.depthBottom - f * (l.depthBottom - l.depthTop);
        }
        ctx.globalAlpha = alpha * (this.highlight === null || this.highlight === i ? 1 : 0.25);
        this.quad(ctx, G, s, top, l.depthBottom);
        ctx.fillStyle = l.unit.color;
        ctx.fill();
        const pat = lithPattern(ctx, patternFor(l.unit.lith));
        if (pat) { ctx.fillStyle = pat; ctx.fill(); }
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(G.sx(0), G.sy(horizonElevation(s, top, 0)));
        ctx.lineTo(G.sx(G.L), G.sy(horizonElevation(s, top, G.L)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    if (state.ma !== null) {
      drawLayers(1);
    } else {
      const ground = groundPath();
      if (this.showEroded) {
        ctx.save();
        const above = new Path2D();
        above.rect(M.left, M.top, G.pw, G.ph);
        above.addPath(ground);
        ctx.clip(above, "evenodd");
        drawLayers(0.18);
        ctx.restore();
      }
      ctx.save();
      ctx.clip(ground);
      drawLayers(1);
      ctx.restore();
    }

    // Today's ground line (dashed while it is still buried).
    ctx.beginPath();
    for (let i = 0; i < G.n; i++) {
      const X = G.sx(d[i]), Y = G.sy(z[i]);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    const buried = state.ma !== null || state.erosion < 1;
    ctx.setLineDash(buried ? [5, 4] : []);
    ctx.strokeStyle = buried ? "rgba(255,255,255,0.7)" : ink;
    ctx.lineWidth = buried ? 1.4 : 1.8;
    ctx.stroke();
    ctx.setLineDash([]);

    if (!buried && this.showSurface) {
      ctx.lineWidth = 6;
      ctx.lineCap = "butt";
      for (const run of this.data.surface) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < G.n; i++) {
          if (d[i] < run.x0 || d[i] > run.x1) continue;
          const X = G.sx(d[i]), Y = G.sy(z[i]) - 4;
          if (started) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); started = true; }
        }
        ctx.strokeStyle = run.unit.color;
        ctx.stroke();
      }
    }

    // Layer names where there is room.
    if (state.ma === null && state.erosion >= 1) {
      ctx.font = "600 11.5px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      stack.forEach((l) => {
        let best = -1, bestPx = 0;
        for (let k = 0; k < G.n; k += 6) {
          const x = d[k];
          const top = Math.min(z[k], horizonElevation(s, l.depthTop, x));
          const bot = horizonElevation(s, l.depthBottom, x);
          const px = G.sy(bot) - G.sy(top);
          if (px > bestPx) { bestPx = px; best = k; }
        }
        if (best < 0 || bestPx < 15) return;
        const x = d[best];
        const top = Math.min(z[best], horizonElevation(s, l.depthTop, x));
        const mid = (top + horizonElevation(s, l.depthBottom, x)) / 2;
        const X = Math.min(Math.max(G.sx(x), M.left + 60), M.left + G.pw - 60);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.strokeText(l.unit.unit_name, X, G.sy(mid));
        ctx.fillStyle = "#1a1612";
        ctx.fillText(l.unit.unit_name, X, G.sy(mid));
      });
    }
    ctx.restore();

    // Axes.
    ctx.fillStyle = muted;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of niceTicks(G.y0, G.y1, Math.max(3, Math.floor(G.ph / 45)))) {
      ctx.fillText(`${Math.round(t).toLocaleString()} m`, M.left - 8, G.sy(t));
      ctx.beginPath(); ctx.moveTo(M.left - 4, G.sy(t)); ctx.lineTo(M.left, G.sy(t)); ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of niceTicks(0, G.L, Math.max(2, Math.floor(G.pw / 110)))) {
      ctx.fillText(formatDistance(t), G.sx(t), M.top + G.ph + 8);
    }
    ctx.textAlign = "left";
    ctx.fillText("A", M.left + 4, M.top + 4);
    ctx.textAlign = "right";
    ctx.fillText("B", M.left + G.pw - 4, M.top + 4);
    const ve = (G.L / G.pw) / ((G.y1 - G.y0) / G.ph);
    ctx.textAlign = "left";
    ctx.fillText(ve > 1.1 ? `Vertical exaggeration ≈ ${ve.toFixed(ve < 10 ? 1 : 0)}×` : "True scale", M.left + 22, M.top + 4);

    this.timeLabel.textContent = state.label;
  }

  /** Path for the band between two depths, across the whole section. */
  private quad(ctx: CanvasRenderingContext2D, G: ReturnType<SectionStudio["geometry"]>, s: Structure, d0: number, d1: number) {
    const bottom = (x: number) => Math.max(horizonElevation(s, d1, x), G.y0 - 1e5);
    ctx.beginPath();
    ctx.moveTo(G.sx(0), G.sy(horizonElevation(s, d0, 0)));
    ctx.lineTo(G.sx(G.L), G.sy(horizonElevation(s, d0, G.L)));
    ctx.lineTo(G.sx(G.L), G.sy(bottom(G.L)));
    ctx.lineTo(G.sx(0), G.sy(bottom(0)));
    ctx.closePath();
  }

  private layerAtEvent(e: MouseEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const G = this.geometry();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (px < M.left || px > M.left + G.pw || py < M.top || py > M.top + G.ph) return null;
    const x = G.ix(px), elev = G.iy(py);
    const { distance: d, elevation: z } = this.data;
    const k = Math.min(d.length - 1, Math.max(0, Math.round((x / G.L) * (d.length - 1))));
    if (this.timeState().ma === null && elev > z[k]) return null;
    return layerIndexAt(this.data.stack, this.structure, x, elev);
  }

  private hover(e: PointerEvent) {
    const i = this.layerAtEvent(e);
    const { stack } = this.data;
    if (i === null || i < 0) {
      this.tip.hidden = true;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const G = this.geometry();
    const elev = G.iy(e.clientY - rect.top);
    if (i >= stack.length) {
      this.tip.replaceChildren(h("strong", {}, "Older rock"), h("span", {}, "Beneath the column's oldest recorded unit"));
    } else {
      const u = stack[i].unit;
      const age = `${formatAge(u.b_age)} – ${formatAge(u.t_age)} old`;
      this.tip.replaceChildren(
        h("strong", {}, u.unit_name),
        h("span", {}, `${u.b_int_name ?? ""}${u.t_int_name && u.t_int_name !== u.b_int_name ? ` – ${u.t_int_name}` : ""}`),
        h("span", {}, age),
        h("span", {}, lithologySummary(u) || "Lithology not recorded"),
        h("span", { class: "muted" }, `Elevation here ≈ ${Math.round(elev).toLocaleString()} m`),
      );
    }
    this.tip.hidden = false;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    this.tip.style.left = `${Math.min(x + 14, rect.width - 230)}px`;
    this.tip.style.top = `${Math.max(4, y - 10)}px`;
  }
}
