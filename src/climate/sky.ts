// Two ways of seeing weather and climate at a glance.
//
// The sky ring: the next 48 hours as a clock face. The inner ring is the next
// 24 hours, the outer the 24 after; each hour sits at its time of day
// (midnight at the bottom, noon at the top), so daylight makes an arc across
// the top. Each hour is coloured by its temperature; rain chances rise as
// blue bars outward; wind as ticks inward; a hand marks now.
//
// Warming stripes: one stripe a year since 1950, blue for cooler than the
// 1961–1990 average and red for warmer (after Ed Hawkins's #ShowYourStripes),
// with how far the climate has, in effect, moved.
import type { Hours } from "../data/openmeteo";

const NS = "http://www.w3.org/2000/svg";
const el = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number> = {}, ...kids: (SVGElement | string)[]) => {
  const e = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
};

/** A temperature colour: deep blue below −10 °C through white near 12 °C to deep red above 35 °C (pure). */
export function tempColor(c: number): string {
  const stops: [number, [number, number, number]][] = [[-15, [40, 70, 180]], [0, [90, 160, 240]], [12, [235, 240, 245]], [22, [255, 196, 90]], [30, [245, 110, 60]], [38, [180, 30, 60]]];
  let a = stops[0], b = stops[stops.length - 1];
  if (c <= a[0]) return `rgb(${a[1].join(",")})`;
  for (let i = 1; i < stops.length; i++) if (c <= stops[i][0]) { a = stops[i - 1]; b = stops[i]; break; }
  if (c > b[0]) return `rgb(${b[1].join(",")})`;
  const t = (c - a[0]) / (b[0] - a[0]);
  return `rgb(${a[1].map((x, i) => Math.round(x + (b[1][i] - x) * t)).join(",")})`;
}

const hourOf = (iso: string) => Number(iso.slice(11, 13));
const clock = (iso: string) => { const h = hourOf(iso); return h === 0 ? "midnight" : h === 12 ? "noon" : `${h % 12} ${h < 12 ? "am" : "pm"}`; };
const dayWord = (iso: string, first: string) => (iso.slice(0, 10) === first.slice(0, 10) ? "" : " tomorrow");

/** The next 48 hours in a sentence or two (pure). */
export function skySentence(x: Hours["hourly"]): string {
  const n = x.time.length;
  if (!n) return "";
  const first = x.time[0];
  const rainy = x.precipitation_probability.findIndex((p, i) => (p ?? 0) >= 50 || x.precipitation[i] >= 0.5);
  const parts: string[] = [];
  if (rainy === -1) parts.push("Dry for the next two days");
  else if (rainy === 0) {
    const stop = x.precipitation_probability.findIndex((p, i) => i > 0 && (p ?? 0) < 30 && x.precipitation[i] < 0.2);
    parts.push(stop === -1 ? "Wet on and off for the next two days" : `Rain now, easing by ${clock(x.time[stop])}${dayWord(x.time[stop], first)}`);
  } else parts.push(`Rain likely from ${clock(x.time[rainy])}${dayWord(x.time[rainy], first)} (${x.precipitation_probability[rainy] ?? 50}%)`);
  const hi = x.temperature_2m.indexOf(Math.max(...x.temperature_2m)), lo = x.temperature_2m.indexOf(Math.min(...x.temperature_2m));
  parts.push(`warmest at ${clock(x.time[hi])}${dayWord(x.time[hi], first)}, ${Math.round(x.temperature_2m[hi])}°; coldest at ${clock(x.time[lo])}${dayWord(x.time[lo], first)}, ${Math.round(x.temperature_2m[lo])}°`);
  const gust = Math.max(...x.wind_speed_10m);
  if (gust >= 40) parts.push(`windy, up to ${Math.round(gust)} km/h`);
  return parts.join("; ") + ".";
}

/** The sky ring as an SVG. */
export function skyRing(x: Hours["hourly"], size = 300): SVGSVGElement {
  const c = size / 2, svg = el("svg", { viewBox: `0 0 ${size} ${size}`, class: "sky-ring", role: "img", "aria-label": "The next 48 hours" });
  const rings = [{ r0: c * 0.42, r1: c * 0.58 }, { r0: c * 0.62, r1: c * 0.78 }];
  const ang = (hour: number) => ((hour / 24) * 360 + 180) * (Math.PI / 180); // midnight at the bottom, noon at the top
  const pt = (a: number, r: number) => [c + Math.sin(a) * r, c - Math.cos(a) * r];
  const arc = (a0: number, a1: number, r0: number, r1: number) => {
    const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
    return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`;
  };
  // Hour marks: midnight, 6, noon, 18.
  for (const [h, t] of [[0, "0"], [6, "6"], [12, "12"], [18, "18"]] as const) {
    const [tx, ty] = pt(ang(h), c * 0.9);
    svg.append(el("text", { x: tx, y: ty, class: "sky-mark" }, t));
  }
  x.time.forEach((iso, i) => {
    const ring = rings[i < 24 ? 0 : 1], h = hourOf(iso), a0 = ang(h) + 0.01, a1 = ang(h + 1) - 0.01;
    const seg = el("path", { d: arc(a0, a1, ring.r0, ring.r1), fill: tempColor(x.temperature_2m[i]), class: "sky-hour" + (x.is_day[i] ? " day" : " night") });
    seg.append(el("title", {}, `${clock(iso)}${dayWord(iso, x.time[0])}: ${Math.round(x.temperature_2m[i])}°, rain ${x.precipitation_probability[i] ?? 0}%, wind ${Math.round(x.wind_speed_10m[i])} km/h, cloud ${x.cloud_cover[i]}%`));
    svg.append(seg);
    const p = (x.precipitation_probability[i] ?? 0) / 100;
    if (p >= 0.1) svg.append(el("path", { d: arc(a0 + 0.04, a1 - 0.04, ring.r1 + 1, ring.r1 + 1 + p * c * 0.1), class: "sky-rain", opacity: 0.35 + p * 0.65 }));
    const wlen = Math.min(1, x.wind_speed_10m[i] / 60) * c * 0.06;
    if (wlen > 1) { const [wx0, wy0] = pt((a0 + a1) / 2, ring.r0 - 1), [wx1, wy1] = pt((a0 + a1) / 2, ring.r0 - 1 - wlen); svg.append(el("line", { x1: wx0, y1: wy0, x2: wx1, y2: wy1, class: "sky-wind" })); }
  });
  // Night: a soft veil over the dark hours of the inner ring's face.
  const now = x.time[0], [hx, hy] = pt(ang(hourOf(now) + Number(now.slice(14, 16)) / 60), c * 0.82);
  svg.append(el("line", { x1: c, y1: c, x2: hx, y2: hy, class: "sky-hand" }), el("circle", { cx: c, cy: c, r: 3, class: "sky-hub" }));
  svg.append(el("text", { x: c, y: c - 4, class: "sky-now" }, `${Math.round(x.temperature_2m[0])}°`), el("text", { x: c, y: c + 14, class: "sky-sub" }, "now"));
  return svg;
}

// ---- Warming stripes -----------------------------------------------------------------------------

export interface YearMean { year: number; mean: number }

/** Each year against the 1961–1990 average, in °C (pure). */
export function anomalies(years: YearMean[]): { year: number; d: number }[] {
  const base = years.filter((y) => y.year >= 1961 && y.year <= 1990);
  const ref = (base.length ? base : years).reduce((s, y) => s + y.mean, 0) / Math.max(1, (base.length ? base : years).length);
  return years.map((y) => ({ year: y.year, d: y.mean - ref }));
}

/** A stripe colour for an anomaly, on a scale of ±`span` °C (pure; Hawkins-style blues and reds). */
export function stripeColor(d: number, span = 1.8): string {
  const blues = ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"];
  const reds = ["#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"];
  const t = Math.max(-1, Math.min(1, d / span));
  if (t < 0) return blues[Math.min(7, Math.floor((1 + t) * 8))];
  return reds[Math.min(7, Math.floor(t * 8))];
}

/** The stripes as an SVG, one per year. */
export function stripes(years: YearMean[], height = 120): SVGSVGElement {
  const a = anomalies(years), w = a.length;
  const span = Math.max(0.8, ...a.map((y) => Math.abs(y.d))) * 0.9;
  const svg = el("svg", { viewBox: `0 0 ${w} ${height}`, preserveAspectRatio: "none", class: "stripes", role: "img", "aria-label": `Warming stripes, ${a[0]?.year}–${a[w - 1]?.year}` });
  a.forEach((y, i) => { const r = el("rect", { x: i, y: 0, width: 1.02, height, fill: stripeColor(y.d, span) }); r.append(el("title", {}, `${y.year}: ${y.d >= 0 ? "+" : "−"}${Math.abs(y.d).toFixed(1)} °C against 1961–1990`)); svg.append(r); });
  return svg;
}

/**
 * How far a warming moves a climate, as rough rules of thumb (pure): towards
 * the equator, at about 0.6 °C per degree of latitude in the mid-latitudes;
 * or downhill, at about 6.5 °C per kilometre of height.
 */
export function climateShift(warming: number, lat: number): { km: number | null; metres: number } {
  const metres = Math.round((warming / 6.5) * 1000 / 10) * 10;
  const km = Math.abs(lat) < 20 ? null : Math.round(((warming / 0.6) * 111) / 10) * 10;
  return { km, metres };
}

// ---- Hot days and frosty nights, decade by decade -----------------------------------------------

export interface Decade { decade: number; hot: number; frost: number }

/** Average days a year over `hot` °C and nights under 0 °C, per decade (pure). */
export function decades(time: string[], tmax: (number | null)[], tmin: (number | null)[], hot = 30): Decade[] {
  const by = new Map<number, { hot: number; frost: number; years: Set<string> }>();
  time.forEach((t, i) => {
    const d = Math.floor(Number(t.slice(0, 4)) / 10) * 10;
    const b = by.get(d) ?? { hot: 0, frost: 0, years: new Set<string>() };
    b.years.add(t.slice(0, 4));
    if ((tmax[i] ?? -99) > hot) b.hot++;
    if ((tmin[i] ?? 99) < 0) b.frost++;
    by.set(d, b);
  });
  // Only decades with at least five years in the record.
  return [...by.entries()].filter(([, b]) => b.years.size >= 5).sort((a, b) => a[0] - b[0]).map(([decade, b]) => ({ decade, hot: b.hot / b.years.size, frost: b.frost / b.years.size }));
}

/** Decades as mirrored bars: hot days rising in red, frosty nights falling in blue. */
export function decadeBars(ds: Decade[], hot = 30): SVGSVGElement {
  const W = 320, H = 190, mid = 92, n = ds.length, bw = W / n;
  const top = Math.max(1, ...ds.map((d) => d.hot)), bot = Math.max(1, ...ds.map((d) => d.frost));
  const k = Math.min((mid - 18) / top, (H - mid - 34) / bot);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "decade-bars", role: "img", "aria-label": `Days over ${hot} °C and frosty nights per year, by decade` });
  svg.append(el("line", { x1: 0, y1: mid, x2: W, y2: mid, class: "db-axis" }));
  ds.forEach((d, i) => {
    const x = i * bw + bw * 0.18, w = bw * 0.64, future = d.decade >= 2030;
    svg.append(el("rect", { x, y: mid - d.hot * k, width: w, height: Math.max(0.5, d.hot * k), class: "db-hot" + (future ? " future" : ""), rx: 2 }));
    svg.append(el("rect", { x, y: mid + 1, width: w, height: Math.max(0.5, d.frost * k), class: "db-frost" + (future ? " future" : ""), rx: 2 }));
    svg.append(el("text", { x: x + w / 2, y: mid - d.hot * k - 4, class: "db-num" }, String(Math.round(d.hot))));
    svg.append(el("text", { x: x + w / 2, y: mid + d.frost * k + 12, class: "db-num" }, String(Math.round(d.frost))));
    svg.append(el("text", { x: x + w / 2, y: H - 2, class: "db-dec" }, `${d.decade}s`));
  });
  return svg;
}
