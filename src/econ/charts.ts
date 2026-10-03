// Small charts for the economy views, drawn as SVG: a price history with its
// peak and an optional what-if point, a risk gauge, and share bars.
import { h } from "../ui/dom";

const fmt = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
/** A price in its unit: 9147, "$/t" → "$9,147/t". */
export const priceLabel = (v: number, unit = "") => {
  const n = v >= 1000 ? Math.round(v).toLocaleString("en-US") : fmt(v);
  return unit.startsWith("$") ? `$${n}${unit.slice(1)}` : `${n} ${unit}`.trim();
};

/** Ten years of prices as an area chart; `next` adds a dashed what-if point a year on. */
export function priceChart(years: number[], prices: number[], color: string, next?: number): SVGSVGElement {
  const W = 360, H = 150, pad = { l: 34, r: next !== undefined ? 46 : 12, t: 18, b: 22 };
  const all = next !== undefined ? [...prices, next] : prices;
  const lo = Math.min(...all) * 0.9, hi = Math.max(...all) * 1.06;
  const n = prices.length + (next !== undefined ? 1 : 0);
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = prices.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const area = `${line}L${x(prices.length - 1).toFixed(1)},${H - pad.b}L${x(0).toFixed(1)},${H - pad.b}Z`;
  const pk = prices.indexOf(Math.max(...prices));
  const id = `g${Math.random().toString(36).slice(2, 7)}`;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "ec-chart");
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${[0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="ec-grid"/><text x="${pad.l - 4}" y="${y(v) + 3}" class="ec-axis" text-anchor="end">${fmt(v)}</text>`; }).join("")}
    <path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" class="ec-line"/>
    ${years.map((yr, i) => (i % 3 === 0 || i === years.length - 1 ? `<text x="${x(i)}" y="${H - 6}" class="ec-axis" text-anchor="middle">${yr}</text>` : "")).join("")}
    <circle cx="${x(pk)}" cy="${y(prices[pk])}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/><text x="${x(pk)}" y="${y(prices[pk]) - 8}" class="ec-peak" text-anchor="middle">peak ${fmt(prices[pk])}</text>
    ${next !== undefined ? `<path d="M${x(prices.length - 1)},${y(prices[prices.length - 1])}L${x(n - 1)},${y(next)}" stroke="${next >= prices[prices.length - 1] ? "#ff453a" : "#30d158"}" stroke-width="2.4" stroke-dasharray="5 4" fill="none"/>
      <circle cx="${x(n - 1)}" cy="${y(next)}" r="5" fill="${next >= prices[prices.length - 1] ? "#ff453a" : "#30d158"}" stroke="#fff" stroke-width="1.5" class="ec-next"/><text x="${x(n - 1)}" y="${y(next) - 9}" class="ec-peak" text-anchor="middle">what if</text>` : ""}`;
  return svg;
}

/** A half-ring gauge for a 0–100 score. */
export function gauge(score: number, label: string, color: string): HTMLElement {
  const a = Math.PI * (1 - Math.max(0, Math.min(100, score)) / 100), r = 42, cx = 50, cy = 50;
  const ex = cx + r * Math.cos(a), ey = cy - r * Math.sin(a);
  return h("div", { class: "ec-gauge", html: `<svg viewBox="0 0 100 58"><path d="M8,50 A42,42 0 0 1 92,50" class="ec-gauge-track"/><path d="M8,50 A42,42 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${color}" class="ec-gauge-fill"/></svg>` },
    h("strong", {}, String(score)), h("small", {}, label));
}

/** Rows of labelled bars (share %), the first highlighted. */
export function bars(rows: { label: string; value: number; note?: string; color?: string }[], color: string, max = Math.max(...rows.map((r) => r.value), 1)): HTMLElement {
  return h("div", { class: "ec-bars" }, ...rows.map((r) => h("div", { class: "ec-bar", style: `--c:${r.color ?? color};--w:${Math.max(2, (r.value / max) * 100)}%` },
    h("span", { class: "ec-bar-label" }, r.label), h("span", { class: "ec-bar-track" }, h("i", {})), h("span", { class: "ec-bar-value" }, r.note ?? `${r.value}%`))));
}

/** A signed percentage, coloured. */
/** `price`: a price move, coloured neutral (whether it helps depends on which side you are). */
export const pctTag = (p: number, digits = 0, price = false) => h("span", { class: `ec-pct ${price ? "price" : ""} ${p > 0.05 ? "up" : p < -0.05 ? "down" : ""}` }, `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(digits)}%`);
