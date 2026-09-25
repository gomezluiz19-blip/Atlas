// Climate: the weather now, the long-term climate, and how it has changed.
import type { ImageryLayer } from "cesium";
import type { App, Subtab, Theme } from "../app";
import { annualMeans, koppen, linearTrend, monthlyNormals, weatherText } from "../analysis/climate";
import { forecast, history } from "../data/openmeteo";
import { latestRadarTiles } from "../data/radar";
import { climograph } from "../ui/climograph";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { asyncBlock, compass, hero, inlineChart, note, section, stats, tileLayer } from "./common";

const MONTH = "January February March April May June July August September October November December".split(" ");
const deg = (v: number) => `${Math.round(v)}°`;

function weatherIcon(code: number, day = true): string {
  const k = weatherText(code).icon;
  if (k === "sun") return day ? icons.sun : icons.cloud;
  if (k === "partly") return icons.cloudSun;
  return icons[k];
}

export function climateTheme(): Theme {
  let radar: ImageryLayer | null = null;
  let radarOn = true;

  const setRadar = async (app: App, on: boolean) => {
    radarOn = on;
    if (on && !radar) {
      try {
        const { url } = await latestRadarTiles();
        radar = tileLayer(app.globe.viewer, url, { maximumLevel: 7, credit: "Radar: RainViewer", alpha: 0.7 });
      } catch {
        app.toast("Rain radar is unavailable right now.");
      }
    }
    if (radar) radar.show = on && app.theme.id === "climate";
  };

  const now: Subtab = {
    id: "now",
    label: "Now",
    render({ app, place, body }) {
      asyncBlock(app, body, "Checking the weather…", async () => {
        const f = await forecast(place.lon, place.lat);
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
          h("input", { type: "checkbox", class: "switch", checked: radarOn, onchange: (e: Event) => void setRadar(app, (e.target as HTMLInputElement).checked) }));
        const sunrise = d.sunrise[0]?.slice(11, 16), sunset = d.sunset[0]?.slice(11, 16);
        return [
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
        const hist = await history(place.lon, place.lat);
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
        return [
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
          note("Yearly average temperature from ERA5 (via Open-Meteo). The dashed line is the long-term trend. One place's record varies a lot from year to year; the trend is what matters."),
        ];
      });
    },
  };

  return {
    id: "climate",
    label: "Climate",
    icon: icons.cloudSun,
    color: "#ff9f0a",
    intro: "Today's weather, the long-term climate, and how it's changing.",
    subtabs: [now, climate, change],
    enter(app) {
      void setRadar(app, radarOn);
    },
    leave() {
      if (radar) radar.show = false;
    },
  };
}
