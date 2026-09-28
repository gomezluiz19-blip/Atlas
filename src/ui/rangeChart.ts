// Horizontal range bars: for each item, the spread of a value (min, quartiles,
// median, max). Used for species' elevation ranges ("life zones").
import { niceTicks } from "./chart";

export interface RangeItem {
  label: string;
  sublabel?: string;
  values: number[];
  color?: string;
}

const NS = "http://www.w3.org/2000/svg";
const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function rangeChart(items: RangeItem[], unit: (v: number) => string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "range-chart";
  const rows = items
    .filter((i) => i.values.length)
    .map((i) => {
      const v = i.values.slice().sort((a, b) => a - b);
      return { ...i, min: v[0], q1: quantile(v, 0.25), med: quantile(v, 0.5), q3: quantile(v, 0.75), max: v[v.length - 1], n: v.length };
    })
    .sort((a, b) => a.med - b.med);
  const labelW = 190, rowH = 30, top = 8, bottom = 30, right = 16;
  const lo = Math.min(...rows.map((r) => r.min)), hi = Math.max(...rows.map((r) => r.max));
  const draw = () => {
    const width = Math.max(320, wrap.clientWidth);
    const height = top + rows.length * rowH + bottom;
    const pw = width - labelW - right;
    const sx = (v: number) => labelW + ((v - lo) / (hi - lo || 1)) * pw;
    const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "range-svg" });
    for (const t of niceTicks(lo, hi, Math.max(3, Math.floor(pw / 90)))) {
      svg.append(s("line", { x1: sx(t), x2: sx(t), y1: top, y2: height - bottom, class: "range-grid" }));
      const tx = s("text", { x: sx(t), y: height - bottom + 16, "text-anchor": "middle", class: "range-tick" });
      tx.textContent = unit(t);
      svg.append(tx);
    }
    rows.forEach((r, k) => {
      const y = top + k * rowH + rowH / 2;
      const name = s("text", { x: labelW - 10, y: y - 2, "text-anchor": "end", class: "range-label" });
      name.textContent = r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label;
      const sub = s("text", { x: labelW - 10, y: y + 11, "text-anchor": "end", class: "range-sub" });
      const subText = r.sublabel && r.sublabel.length > 22 ? `${r.sublabel.slice(0, 21)}…` : r.sublabel;
      sub.textContent = `${subText ? `${subText} · ` : ""}${r.n} obs.`;
      const color = r.color ?? "#7bd389";
      svg.append(
        name, sub,
        s("line", { x1: sx(r.min), x2: sx(r.max), y1: y, y2: y, stroke: color, "stroke-width": 2, "stroke-opacity": 0.7 }),
        s("rect", { x: sx(r.q1), y: y - 7, width: Math.max(2, sx(r.q3) - sx(r.q1)), height: 14, rx: 3, fill: color, "fill-opacity": 0.55, stroke: color }),
        s("line", { x1: sx(r.med), x2: sx(r.med), y1: y - 8, y2: y + 8, stroke: "currentColor", "stroke-width": 2 }),
      );
      const title = s("title", {});
      title.textContent = `${r.label}: ${unit(r.min)} – ${unit(r.max)} (middle half ${unit(r.q1)} – ${unit(r.q3)}), median ${unit(r.med)}`;
      svg.lastElementChild!.append(title);
    });
    wrap.replaceChildren(svg);
  };
  new ResizeObserver(draw).observe(wrap);
  return wrap;
}
