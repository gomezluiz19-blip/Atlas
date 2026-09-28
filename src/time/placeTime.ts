// A place through time, on its page: how much warmer it has become since the
// 1950s and how much more by the 2050s; who governed it across the centuries;
// and one tap to see it from space in years past.
import type { App, Place } from "../app";
import { countryAt } from "../data/countries";
import { bordersFor } from "../data/history";
import { history, projection } from "../data/openmeteo";
import { cached } from "../data/diskCache";
import { h } from "../ui/dom";
import { asyncBlock, section } from "../themes/common";
import { polityAt, projectedChange, rulerTimeline, spanMean, yearName, yearlyMeans } from "./model";

const RULER_YEARS = [1500, 1700, 1815, 1880, 1914, 1938, 1960, 1994];
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} °C`;

/** Yearly temperatures as bars, with the projection drawn on to 2050. */
function chart(years: { year: number; mean: number }[], future: { year: number; mean: number } | null): SVGSVGElement {
  const W = 320, H = 86, pad = 6;
  const all = [...years, ...(future ? [future] : [])];
  const x0 = years[0].year, x1 = future?.year ?? years[years.length - 1].year;
  const lo = Math.min(...all.map((p) => p.mean)) - 0.3, hi = Math.max(...all.map((p) => p.mean)) + 0.3;
  const X = (y: number) => pad + ((y - x0) / (x1 - x0)) * (W - pad * 2), Y = (t: number) => H - 12 - ((t - lo) / (hi - lo)) * (H - 12 - pad);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "pt-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Yearly average temperature here since 1950, with the projection to 2050");
  const last = years[years.length - 1];
  // The warming-stripes palette: blue for cool years, red for warm.
  const stops: [number, number, number][] = [[33, 102, 172], [247, 247, 247], [178, 24, 43]];
  const color = (t: number) => {
    const x = Math.max(0, Math.min(1, t)) * 2, i = Math.min(1, Math.floor(x)), f = x - i;
    return `rgb(${stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f)).join(",")})`;
  };
  const bars = years.map((p) => {
    const t = (p.mean - lo) / (hi - lo);
    return `<rect x="${(X(p.year) - 1.6).toFixed(1)}" y="${Y(p.mean).toFixed(1)}" width="3.2" height="${(H - 12 - Y(p.mean)).toFixed(1)}" rx="1" fill="${color(t)}"/>`;
  }).join("");
  const recent = spanMean(years, last.year - 9, last.year);
  svg.innerHTML = bars + (future
    ? `<line x1="${X(last.year)}" y1="${Y(recent)}" x2="${X(future.year)}" y2="${Y(future.mean)}" stroke="#ff6b5a" stroke-width="2" stroke-dasharray="4 4"/><circle cx="${X(future.year)}" cy="${Y(future.mean)}" r="4.5" fill="#ff6b5a"/>`
    : "") +
    `<text x="${pad}" y="${H - 1}" class="pt-axis">${x0}</text><text x="${X(last.year)}" y="${H - 1}" class="pt-axis" text-anchor="middle">${last.year}</text>` +
    (future ? `<text x="${W - pad}" y="${H - 1}" class="pt-axis" text-anchor="end">${future.year}</text>` : "");
  return svg;
}

export function throughTime(app: App, place: Place, body: HTMLElement) {
  const go = (y: number) => app.actions.get("time:go")?.run(String(y));
  const now = new Date().getUTCFullYear();
  const rulers = h("div", { class: "pt-rulers" });
  const loadRulers = async () => {
    showRulers.remove();
    const rows: { year: number; name: string | null }[] = [];
    const line = h("p", { class: "muted small" }, "Reading the borders of each age…");
    rulers.replaceChildren(line);
    for (const y of RULER_YEARS) {
      const list = await bordersFor(y).catch(() => null);
      if (!list) continue;
      rows.push({ year: y, name: polityAt(list, place.lon, place.lat) });
      line.textContent = `Reading the borders of each age… ${yearName(y)}`;
    }
    const today = await countryAt(place.lon, place.lat).catch(() => null);
    rows.push({ year: now, name: today?.name ?? null });
    rulers.replaceChildren(h("ol", { class: "pt-timeline" }, ...rulerTimeline(rows).map((r) =>
      h("li", {}, h("button", { class: "pt-when", title: "See the map of the time", onclick: () => app.actions.get("time:go")?.run(`${r.from}@${place.lon},${place.lat}`) }, r.from === r.to ? yearName(r.from) : `${yearName(r.from)}–${r.to === now ? "today" : yearName(r.to)}`),
        h("span", {}, r.name ?? "No state recorded")))),
      h("p", { class: "fineprint" }, "Historical borders: historical-basemaps (A. Ourednik et al.); before the modern era they're approximate. Tap a year to see the map of the time."));
  };
  const showRulers = h("button", { class: "pill-btn", onclick: () => void loadRulers() }, "Who governed here");
  asyncBlock(app, body, "Reading this place's past…", async () => {
    const hist = await history(place.lon, place.lat).catch(() => null);
    const years = hist ? yearlyMeans(hist.daily.time, hist.daily.temperature_2m_mean) : [];
    const model = await cached(`proj:${place.lon.toFixed(2)},${place.lat.toFixed(2)}`, 30 * 86_400_000, async () => {
      const p = await projection(place.lon, place.lat);
      return yearlyMeans(p.daily.time, p.daily.temperature_2m_mean);
    }).catch(() => null);
    const out: (Node | string)[] = [];
    if (years.length >= 30) {
      const first = years[0].year, lastY = years[years.length - 1].year;
      const then = spanMean(years, first, first + 9), recent = spanMean(years, lastY - 9, lastY);
      const change = model?.length ? projectedChange(model) : NaN;
      const future = Number.isFinite(change) ? { year: 2050, mean: spanMean(years, 1991, 2010) + change } : null;
      out.push(chart(years, future), h("p", { class: "pt-says" },
        `The last ten years here averaged ${recent.toFixed(1)} °C, ${signed(recent - then)} on the ${first}s.`,
        future ? ` By the 2050s, one climate model has it ${signed(change).replace("+", "")} warmer than 1991–2010.` : ""));
    }
    out.push(h("div", { class: "pt-row" }, h("span", { class: "pt-row-label" }, "From space"),
      ...[2001, 2010, 2020, now - 1].map((y) => h("button", { class: "chip", onclick: () => go(y) }, String(y)))));
    out.push(rulers, showRulers);
    out.push(h("p", { class: "fineprint" }, "Measured: ERA5 reanalysis since 1950. Projected: CMIP6 EC-Earth3P-HR, its change from 1991–2010 to 2041–2060 added to what was measured. Both via Open-Meteo."));
    return [section("Through time", ...out)];
  });
}
