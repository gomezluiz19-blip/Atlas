// Small canvas charts for lens panels.
import { h } from "../ui/dom";

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";

function canvas(w: number, hgt: number) {
  const c = h("canvas", { class: "lens-chart", width: w * 2, height: hgt * 2, style: `width:${w}px;height:${hgt}px` }) as HTMLCanvasElement;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  return { c, g };
}

/** A compass rose: the share of slopes facing each of 8 directions. */
export function rose(shares: number[], color = "#0a84ff", size = 150): HTMLCanvasElement {
  const { c, g } = canvas(size, size);
  const cx = size / 2, cy = size / 2, R = size / 2 - 16, max = Math.max(...shares, 0.01);
  g.strokeStyle = css("--fill-strong");
  for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * r, 0, Math.PI * 2); g.stroke(); }
  shares.forEach((s, i) => {
    const a = ((i * 45 - 90 - 20) * Math.PI) / 180, b = ((i * 45 - 90 + 20) * Math.PI) / 180;
    g.fillStyle = color;
    g.globalAlpha = 0.35 + 0.65 * (s / max);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * (s / max), a, b); g.closePath(); g.fill();
  });
  g.globalAlpha = 1;
  g.fillStyle = css("--secondary");
  g.font = "600 11px -apple-system, system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  ["N", "E", "S", "W"].forEach((t, i) => { const a = ((i * 90 - 90) * Math.PI) / 180; g.fillText(t, cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9)); });
  return c;
}

/** Line chart of one or more series, with optional labels on the axes. */
export function lines(series: { values: number[]; color: string }[], opts: { w?: number; h?: number; yLabel?: (v: number) => string; xLabels?: [string, string]; fill?: boolean } = {}): HTMLCanvasElement {
  const W = opts.w ?? 400, H = opts.h ?? 140;
  const { c, g } = canvas(W, H);
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all), hi = Math.max(...all), pad = { l: 42, r: 8, t: 8, b: 18 };
  const X = (i: number, n: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  g.strokeStyle = css("--fill-strong");
  g.fillStyle = css("--secondary");
  g.font = "10px -apple-system, system-ui, sans-serif";
  for (const v of [lo, (lo + hi) / 2, hi]) { g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.fillText(opts.yLabel ? opts.yLabel(v) : String(Math.round(v)), 2, Y(v) + 3); }
  if (opts.xLabels) { g.fillText(opts.xLabels[0], pad.l, H - 4); g.textAlign = "right"; g.fillText(opts.xLabels[1], W - pad.r, H - 4); g.textAlign = "left"; }
  for (const s of series) {
    g.strokeStyle = s.color; g.lineWidth = 1.8;
    g.beginPath();
    s.values.forEach((v, i) => (i ? g.lineTo(X(i, s.values.length), Y(v)) : g.moveTo(X(i, s.values.length), Y(v))));
    g.stroke();
    if (opts.fill) { g.lineTo(X(s.values.length - 1, s.values.length), H - pad.b); g.lineTo(pad.l, H - pad.b); g.closePath(); g.globalAlpha = 0.15; g.fillStyle = s.color; g.fill(); g.globalAlpha = 1; g.fillStyle = css("--secondary"); }
  }
  return c;
}

/** A single stacked bar of shares. */
export function bar(parts: { share: number; color: string; label: string }[]): HTMLElement {
  return h("div", { class: "lens-bar" }, ...parts.filter((p) => p.share > 0.005).map((p) =>
    h("span", { style: `width:${(p.share * 100).toFixed(1)}%;background:${p.color}`, title: `${p.label}: ${Math.round(p.share * 100)}%` })));
}

export const stat = (value: string, label: string) => h("div", { class: "lens-stat" }, h("strong", {}, value), h("span", {}, label));
