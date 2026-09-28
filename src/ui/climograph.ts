// A climograph: monthly precipitation as bars and temperature as a line,
// the standard way geographers summarise a climate on one small chart.
import { niceTicks } from "./chart";

const NS = "http://www.w3.org/2000/svg";
const MONTHS = "JFMAMJJASOND";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function climograph(temp: number[], precip: number[]): SVGSVGElement {
  const W = 340, H = 200, L = 36, R = 40, T = 14, B = 24;
  const pw = W - L - R, ph = H - T - B;
  const tMin = Math.min(0, Math.floor(Math.min(...temp) / 5) * 5), tMax = Math.max(10, Math.ceil(Math.max(...temp) / 5) * 5);
  const pMax = Math.max(50, Math.ceil(Math.max(...precip) / 25) * 25);
  const x = (m: number) => L + ((m + 0.5) / 12) * pw;
  const yT = (t: number) => T + (1 - (t - tMin) / (tMax - tMin)) * ph;
  const yP = (p: number) => T + (1 - p / pMax) * ph;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "climograph", role: "img", "aria-label": "Monthly temperature and precipitation" });
  for (const t of niceTicks(tMin, tMax, 4)) {
    svg.append(el("line", { x1: L, x2: L + pw, y1: yT(t), y2: yT(t), class: "cg-grid" }));
    svg.append(el("text", { x: L - 6, y: yT(t) + 4, "text-anchor": "end", class: "cg-tick temp" }, `${t}°`));
  }
  for (const p of niceTicks(0, pMax, 4)) svg.append(el("text", { x: L + pw + 6, y: yP(p) + 4, class: "cg-tick rain" }, `${p}`));
  svg.append(el("text", { x: L + pw + 6, y: T - 3, class: "cg-tick rain" }, "mm"));
  const bw = (pw / 12) * 0.62;
  precip.forEach((p, m) => {
    const bar = el("rect", { x: x(m) - bw / 2, y: yP(p), width: bw, height: Math.max(0, T + ph - yP(p)), rx: 3, class: "cg-bar" });
    bar.append(el("title", {}, `${"January February March April May June July August September October November December".split(" ")[m]}: ${Math.round(p)} mm, ${temp[m].toFixed(1)} °C`));
    svg.append(bar);
    svg.append(el("text", { x: x(m), y: H - 6, "text-anchor": "middle", class: "cg-tick" }, MONTHS[m]));
  });
  let d = "";
  temp.forEach((t, m) => (d += `${m ? "L" : "M"}${x(m).toFixed(1)},${yT(t).toFixed(1)}`));
  svg.append(el("path", { d, class: "cg-line" }));
  temp.forEach((t, m) => svg.append(el("circle", { cx: x(m), cy: yT(t), r: 3, class: "cg-dot" })));
  if (tMin < 0) svg.append(el("line", { x1: L, x2: L + pw, y1: yT(0), y2: yT(0), class: "cg-freeze" }));
  return svg;
}
