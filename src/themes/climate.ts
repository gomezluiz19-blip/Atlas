// Climate: the weather now, the long-term climate, and how it has changed.
import type { Subtab, Theme } from "../app";
import { annualMeans, koppen, linearTrend, monthlyNormals, weatherText } from "../analysis/climate";
import { anomalies, climateShift, decadeBars, decades, skyRing, skySentence, stripes } from "../climate/sky";
import { windLayer } from "../climate/windLayer";
import { beaufort } from "../climate/wind";
import { forecast, history, hours48, projectedExtremes } from "../data/openmeteo";
import { WorkLayer } from "../work/layer";
import { offsetKm } from "../pro/kit/ops";
import type { Overlays } from "../globe/overlays";
import { climograph } from "../ui/climograph";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { asyncBlock, compass, hero, inlineChart, note, section, stats } from "./common";

const MONTH = "January February March April May June July August September October November December".split(" ");
const deg = (v: number) => `${Math.round(v)}°`;

function weatherIcon(code: number, day = true): string {
  const k = weatherText(code).icon;
  if (k === "sun") return day ? icons.sun : icons.cloud;
  if (k === "partly") return icons.cloudSun;
  return icons[k];
}

export function climateTheme(overlays: Overlays): Theme {
  let firstVisit = true;

  const now: Subtab = {
    id: "now",
    label: "Now",
    render({ app, place, body }) {
      asyncBlock(app, body, "Checking the weather…", async () => {
        const [f, hrs] = await Promise.all([forecast(place.lon, place.lat), hours48(place.lon, place.lat).catch(() => null)]);
        const c = f.current, d = f.daily;
        const w = weatherText(c.weather_code);
        const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
        const days = d.time.map((t, i) => {
          const name = i === 0 ? "Today" : new Date(`${t}T12:00`).toLocaleDateString(undefined, { weekday: "short" });
          const a = ((d.temperature_2m_min[i] - lo) / (hi - lo || 1)) * 100, b = ((d.temperature_2m_max[i] - lo) / (hi - lo || 1)) * 100;
          const rain = d.precipitation_probability_max[i];
          return h("div", { class: "day-row" },
            h("span", { class: "day-name" }, name),
            h("span", { class: "day-icon", html: weatherIcon(d.weather_code[i]), title: weatherText(d.weather_code[i]).text }),
            h("span", { class: "day-rain" }, rain !== null && rain >= 20 ? `${rain}%` : ""),
            h("span", { class: "day-lo" }, deg(d.temperature_2m_min[i])),
            h("span", { class: "range-track" }, h("span", { class: "range-fill", style: `left:${a}%;right:${100 - b}%` })),
            h("span", { class: "day-hi" }, deg(d.temperature_2m_max[i])));
        });
        const toggle = h("label", { class: "switch-row" },
          h("span", {}, h("strong", {}, "Rain radar on the map"), h("span", { class: "muted" }, "Live, updated every 10 minutes. Zoom out to see it.")),
          h("input", { type: "checkbox", class: "switch", checked: overlays.isOn("radar"), onchange: (e: Event) => void overlays.set("radar", (e.target as HTMLInputElement).checked) }));
        const sunrise = d.sunrise[0]?.slice(11, 16), sunset = d.sunset[0]?.slice(11, 16);
        const wind = windLayer(app);
        const windNote = h("span", { class: "muted" }, "Streamlines of the wind now over the whole view, drops running faster where it blows harder.");
        wind.onChange = () => { if (wind.stats) windNote.textContent = `Strongest in view: ${Math.round(wind.stats.max)} km/h (${beaufort(wind.stats.max)}); average ${Math.round(wind.stats.mean)} km/h.`; };
        const windToggle = h("label", { class: "switch-row" },
          h("span", {}, h("strong", {}, "Wind on the map"), windNote),
          h("input", { type: "checkbox", class: "switch", checked: wind.isOn, onchange: (e: Event) => wind.toggle((e.target as HTMLInputElement).checked) }));
        return [
          hrs?.hourly.time.length ? h("div", { class: "sky-card" }, skyRing(hrs.hourly), h("p", { class: "sky-sentence" }, skySentence(hrs.hourly)),
            h("p", { class: "fineprint" }, "The next 48 hours as a clock: inner ring today, outer tomorrow; noon at the top. Colour is temperature, blue bars the chance of rain, ticks the wind.")) : "",
          h("div", { class: "weather-now" },
            h("span", { class: "weather-icon", html: weatherIcon(c.weather_code, c.is_day === 1) }),
            h("div", {}, h("div", { class: "hero-value" }, deg(c.temperature_2m)), h("div", { class: "hero-label" }, `${w.text} · feels like ${deg(c.apparent_temperature)}`))),
          stats(
            ["Wind", `${Math.round(c.wind_speed_10m)} km/h from the ${compass(c.wind_direction_10m)}`],
            ["Humidity", `${Math.round(c.relative_humidity_2m)}%`],
            ["Sunrise · sunset", sunrise && sunset ? `${sunrise} · ${sunset}` : "—", "Local time"],
          ),
          section("Next 7 days", h("div", { class: "days" }, ...days)),
          toggle,
          windToggle,
          note(`Forecast from Open-Meteo, local time (${f.timezone}).`),
        ];
      });
    },
  };

  const climate: Subtab = {
    id: "climate",
    label: "Climate",
    render({ app, place, body }) {
      asyncBlock(app, body, "Reading 30 years of weather…", async () => {
        const hist = await history(place.lon, place.lat);
        const n = monthlyNormals(hist.daily.time, hist.daily.temperature_2m_mean, hist.daily.precipitation_sum, 1991, 2020);
        if (n.temp.some((t) => Number.isNaN(t))) return [h("p", { class: "muted" }, "No climate record is available here.")];
        const k = koppen(n, place.lat);
        const mean = n.temp.reduce((a, b) => a + b, 0) / 12;
        const total = n.precip.reduce((a, b) => a + b, 0);
        const warm = n.temp.indexOf(Math.max(...n.temp)), cold = n.temp.indexOf(Math.min(...n.temp)), wet = n.precip.indexOf(Math.max(...n.precip));
        return [
          hero(k.name, `Climate type ${k.code}`, k.description),
          h("div", { class: "chart-card" }, climograph(n.temp, n.precip),
            h("div", { class: "legend-inline" }, h("span", { class: "key temp" }, "Temperature"), h("span", { class: "key rain" }, "Rain and snow (mm)"))),
          stats(
            ["Average temperature", `${mean.toFixed(1)} °C`],
            ["Rain and snow per year", `${Math.round(total).toLocaleString()} mm`],
            ["Warmest month", `${MONTH[warm]}, ${n.temp[warm].toFixed(1)} °C on average`],
            ["Coldest month", `${MONTH[cold]}, ${n.temp[cold].toFixed(1)} °C on average`],
            ["Wettest month", `${MONTH[wet]}, ${Math.round(n.precip[wet])} mm`],
          ),
          note("Averages for 1991–2020 from the ERA5 reanalysis (via Open-Meteo), a model-based record that blends weather observations. Climate type by the Köppen–Geiger system."),
        ];
      });
    },
  };

  const change: Subtab = {
    id: "change",
    label: "Change",
    render({ app, place, body }) {
      asyncBlock(app, body, "Comparing decades…", async () => {
        const [hist, proj] = await Promise.all([history(place.lon, place.lat), projectedExtremes(place.lon, place.lat).catch(() => null)]);
        const ds = proj ? decades(proj.daily.time, proj.daily.temperature_2m_max, proj.daily.temperature_2m_min) : [];
        const years = annualMeans(hist.daily.time, hist.daily.temperature_2m_mean);
        if (years.length < 30) return [h("p", { class: "muted" }, "Not enough records here to show a trend.")];
        const xs = years.map((y) => y.year), ys = years.map((y) => y.mean);
        const { slope, intercept } = linearTrend(xs, ys);
        const avg = (from: number, to: number) => {
          const sel = years.filter((y) => y.year >= from && y.year <= to);
          return sel.reduce((a, b) => a + b.mean, 0) / sel.length;
        };
        const last = xs[xs.length - 1];
        const then = avg(1951, 1980), recent = avg(last - 9, last);
        const diff = recent - then;
        const hottest = years.reduce((a, b) => (b.mean > a.mean ? b : a));
        const perDecade = slope * 10;
        const shift = climateShift(diff, place.lat);
        let arrow: WorkLayer | null = null;
        const showShift = () => {
          if (!shift.km) return;
          const to = offsetKm(place.lon, place.lat, place.lat >= 0 ? 180 : 0, shift.km);
          arrow ??= new WorkLayer(app, "climate-shift", "How far the climate has moved", "#ff6b3d");
          arrow.set([{ id: "shift", kind: "line", pts: [[place.lon, place.lat], to], color: "#ff6b3d", solid: true }, { id: "shift-to", kind: "point", pts: [to], color: "#ff6b3d", label: `Its 1950s climate is now about here` }]);
        };
        return [
          h("div", { class: "stripes-card" }, stripes(years), h("div", { class: "stripes-years" }, h("span", {}, String(xs[0])), h("span", {}, String(last)))),
          diff > 0.2 ? h("p", { class: "shift-line" },
            shift.km ? `Warming of ${diff.toFixed(1)} °C is roughly like this place moving about ${shift.km.toLocaleString()} km towards the equator, or ${shift.metres.toLocaleString()} m downhill.` : `Warming of ${diff.toFixed(1)} °C is roughly like this place moving ${shift.metres.toLocaleString()} m downhill.`,
            shift.km ? h("button", { class: "link-btn", onclick: showShift }, " Show on the map") : "") : "",
          hero(`${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} °C`, diff >= 0 ? "warmer than in 1951–1980" : "cooler than in 1951–1980", `Comparing the average of ${last - 9}–${last} with 1951–1980`),
          h("div", { class: "chart-card" },
            inlineChart({ x: xs, y: ys }, {
              xLabel: "Year", yLabel: "°C", xFormat: (v) => String(Math.round(v)), yFormat: (v) => `${v.toFixed(1)}°`,
              overlay: { x: [xs[0], last], y: [intercept + slope * xs[0], intercept + slope * last] },
            }, 180)),
          stats(
            ["Warming rate", `${perDecade >= 0 ? "+" : "−"}${Math.abs(perDecade).toFixed(2)} °C per decade`, "Straight-line trend through every year's average"],
            ["Warmest year on record here", `${hottest.year} (${hottest.mean.toFixed(1)} °C)`],
            ["Years of record", `${xs[0]}–${last}`],
          ),
          ds.length >= 4 ? section("Hot days and frosty nights, decade by decade", h("div", { class: "chart-card" }, decadeBars(ds),
            h("div", { class: "legend-inline" }, h("span", { class: "key hot" }, "Days over 30 °C a year"), h("span", { class: "key frost" }, "Nights below 0 °C a year"))),
            h("p", { class: "muted small" }, `In the 2040s: about ${Math.round(ds[ds.length - 1].hot)} days a year over 30 °C (${Math.round(ds[0].hot)} in the 1990s) and ${Math.round(ds[ds.length - 1].frost)} frosty nights (${Math.round(ds[0].frost)}).`)) : "",
          note(`Yearly average temperature from ERA5 (via Open-Meteo). Decades to 2050 from one climate model (EC-Earth3P-HR, CMIP6, a high-emissions path), so read them as a likely direction, not a forecast. Stripes: each year against the 1961–1990 average (${anomalies(years).filter((y) => y.d > 0).length} of ${years.length} years warmer), after Ed Hawkins's #ShowYourStripes. The moves are rules of thumb: about 0.6 °C per degree of latitude, 6.5 °C per kilometre of height.`),
        ];
      });
    },
  };

  return {
    id: "climate",
    label: "Climate",
    icon: icons.cloudSun,
    color: "#d19a2e",
    intro: "Today's weather, the long-term climate, and how it's changing.",
    subtabs: [now, climate, change],
    enter() {
      // Radar is most useful here, so switch it on the first time (it stays under the user's control after).
      if (firstVisit) void overlays.set("radar", true, "climate");
      firstVisit = false;
    },
  };
}
