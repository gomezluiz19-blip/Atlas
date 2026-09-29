// Motion, without any model: each frame is shrunk to a small grey picture
// and compared with the last. What changed is activity (how much of the view
// is moving), where it moved (a coarse grid), and over time a heatmap of
// where things happen. Works offline and on any device; the detector, when it
// loads, adds what's moving (people, vehicles) on top.

export const GRID_W = 48, GRID_H = 27;
const W = 160, H = 90;

export interface MotionFrame {
  /** Share of the picture that changed, 0..1. */
  activity: number;
  /** Changed cells on the GRID_W × GRID_H grid (row-major), 0..1 each. */
  cells: Float32Array;
}

export class MotionMeter {
  private canvas = document.createElement("canvas");
  private prev: Uint8ClampedArray | null = null;
  /** Where things happened, accumulated (row-major GRID_W × GRID_H). */
  heat = new Float32Array(GRID_W * GRID_H);
  heatTotal = 0;

  constructor() { this.canvas.width = W; this.canvas.height = H; }

  /** Compares this frame with the last. */
  measure(el: CanvasImageSource): MotionFrame {
    const g = this.canvas.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(el, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const grey = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) grey[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    const cells = new Float32Array(GRID_W * GRID_H);
    let changed = 0;
    if (this.prev) {
      const cw = W / GRID_W, ch = H / GRID_H, per = cw * ch;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          // A change bigger than camera noise and lighting flicker.
          if (Math.abs(grey[i] - this.prev[i]) > 22) {
            changed++;
            cells[Math.min(GRID_H - 1, Math.floor(y / ch)) * GRID_W + Math.min(GRID_W - 1, Math.floor(x / cw))] += 1 / per;
          }
        }
    }
    this.prev = grey;
    return { activity: changed / (W * H), cells };
  }

  /** Adds weight to the heatmap: motion cells, or points (people's feet) when the detector sees them. */
  addCells(cells: Float32Array, weight = 1) {
    for (let i = 0; i < cells.length; i++) if (cells[i] > 0.08) { this.heat[i] += cells[i] * weight; this.heatTotal += cells[i] * weight; }
  }
  addPoint(x: number, y: number, weight = 1) {
    const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(x * GRID_W))), cy = Math.max(0, Math.min(GRID_H - 1, Math.floor(y * GRID_H)));
    // A soft 3×3 footprint, so a person standing still paints an area, not a pixel.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = cx + dx, Y = cy + dy;
      if (X < 0 || Y < 0 || X >= GRID_W || Y >= GRID_H) continue;
      const w = weight * (dx === 0 && dy === 0 ? 1 : 0.4);
      this.heat[Y * GRID_W + X] += w;
      this.heatTotal += w;
    }
  }
  resetHeat() { this.heat.fill(0); this.heatTotal = 0; }

  /** Paints the heatmap over a picture of the given size (transparent where nothing happened). */
  paintHeat(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const max = Math.max(...this.heat);
    if (!(max > 0)) return;
    const cw = w / GRID_W, ch = h / GRID_H;
    ctx.save();
    ctx.filter = `blur(${Math.max(6, cw * 1.2)}px)`;
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        const v = this.heat[y * GRID_W + x] / max;
        if (v < 0.04) continue;
        // Blue (a little) through yellow to red (the most).
        const hue = 220 - 220 * Math.min(1, v * 1.15);
        ctx.fillStyle = `hsla(${hue}, 95%, 55%, ${0.18 + 0.5 * v})`;
        ctx.fillRect(x * cw - cw * 0.5, y * ch - ch * 0.5, cw * 2, ch * 2);
      }
    ctx.restore();
  }

  /** Where the most happened, as a share of all activity, per named zone. */
  zoneShares(zones: { name: string; box: [number, number, number, number] }[]): { name: string; share: number }[] {
    if (!(this.heatTotal > 0)) return zones.map((z) => ({ name: z.name, share: 0 }));
    return zones.map((z) => {
      const [zx, zy, zw, zh] = z.box;
      let s = 0;
      for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
        const cx = (x + 0.5) / GRID_W, cy = (y + 0.5) / GRID_H;
        if (cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh) s += this.heat[y * GRID_W + x];
      }
      return { name: z.name, share: s / this.heatTotal };
    });
  }
}
