// Countries: the nation a place belongs to: its people, economy and environment.
import type { ImageryLayer } from "cesium";
import type { App, Place, Subtab, Theme } from "../app";
import { countryAt, countryFacts, countryShapes, indicators, type CountryFacts, type CountryShape, type IndicatorKey, type Series } from "../data/countries";
import { getJson } from "../data/http";
import { vectorLayer } from "../globe/vectorLayer";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { asyncBlock, hero, inlineChart, note, section, stats } from "./common";

interface Country {
  shape: CountryShape;
  facts: CountryFacts;
}

const cache = new Map<string, Promise<Country | null>>();

function countryFor(place: Place): Promise<Country | null> {
  const key = `${place.lon.toFixed(4)},${place.lat.toFixed(4)}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const shape = await countryAt(place.lon, place.lat);
      if (!shape || !shape.id) return null;
      return { shape, facts: await countryFacts(shape.id) };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const compact = (v: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);
const money = (v: number) => `$${compact(v)}`;
const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;

function latest(s: Series | undefined, fmt: (v: number) => string): string {
  return s?.latest ? `${fmt(s.latest.value)} (${s.latest.year})` : "Not reported";
}

function trendChart(s: Series, yLabel: string, fmt: (v: number) => string): HTMLElement | "" {
  if (s.points.length < 5) return "";
  return h("div", { class: "chart-card" },
    inlineChart({ x: s.points.map((p) => p.year), y: s.points.map((p) => p.value) }, { xLabel: "Year", yLabel, xFormat: (v) => String(Math.round(v)), yFormat: fmt }, 160));
}

export function countriesTheme(): Theme {
  let borders: ImageryLayer | null = null;
  let highlight: ImageryLayer | null = null;
  let highlighted = "";

  const drawHighlight = (app: App, shape: CountryShape | null) => {
    const layers = app.globe.viewer.imageryLayers;
    if (highlighted === (shape?.id ?? "")) return;
    if (highlight) layers.remove(highlight, true);
    highlight = null;
    highlighted = shape?.id ?? "";
    if (!shape) return;
    highlight = vectorLayer([shape], { stroke: "#ff375f", width: 2.5, fill: "rgba(255, 55, 95, 0.1)", scaleWithZoom: true });
    layers.add(highlight);
  };

  /** Wraps a subtab body: finds the country, then renders its content. */
  const countryTab = (id: string, label: string, keys: IndicatorKey[], build: (c: Country, s: Record<IndicatorKey, Series>, app: App) => (Node | string)[]): Subtab => ({
    id,
    label,
    render({ app, place, body }) {
      asyncBlock(app, body, "Looking up the country…", async () => {
        const c = await countryFor(place);
        drawHighlight(app, c?.shape ?? null);
        if (!c) return [hero("No country", "This spot is in international waters or Antarctica.")];
        const series = keys.length ? await indicators(c.facts.cca3, keys) : ({} as Record<IndicatorKey, Series>);
        return build(c, series, app);
      });
    },
  });

  const overview = countryTab("overview", "Overview", [], (c, _s, app) => {
    const f = c.facts;
    const langs = Object.values(f.languages ?? {});
    const cur = Object.values(f.currencies ?? {}).map((x) => `${x.name}${x.symbol ? ` (${x.symbol})` : ""}`);
    const density = f.population && f.area ? f.population / f.area : null;
    const neighbours = h("div", { class: "chips wrap" });
    if (f.borders?.length) {
      getJson<{ name: { common: string }; cca3: string; latlng: [number, number] }[]>("REST Countries", `https://restcountries.com/v3.1/alpha?codes=${f.borders.join(",")}&fields=name,cca3,latlng`)
        .then((rows) => neighbours.replaceChildren(...rows.sort((a, b) => a.name.common.localeCompare(b.name.common)).map((r) =>
          h("button", { class: "chip", onclick: () => app.select({ lon: r.latlng[1], lat: r.latlng[0], height: 0 }) }, r.name.common))))
        .catch(() => neighbours.replaceChildren(...f.borders!.map((b) => h("span", { class: "chip" }, b))));
    }
    return [
      h("div", { class: "country-head" },
        f.flags?.svg ? h("img", { class: "flag", src: f.flags.svg, alt: f.flags.alt ?? `Flag of ${f.name.common}` }) : "",
        h("div", {}, h("div", { class: "hero-value small" }, f.name.common), h("div", { class: "hero-label" }, f.name.official))),
      stats(
        ["Capital", f.capital?.join(", ") ?? "—"],
        ["Population", f.population ? compact(f.population) : "—"],
        ["Area", f.area ? `${compact(f.area)} km²` : "—"],
        density ? ["People per km²", Math.round(density).toLocaleString()] : null,
        ["Region", [f.subregion, f.region].filter(Boolean).join(", ") || "—"],
        ["Languages", langs.slice(0, 4).join(", ") || "—"],
        ["Currency", cur.join(", ") || "—"],
        ["Drives on the", f.car?.side ?? "—"],
        f.landlocked ? ["Coast", "Landlocked"] : null,
      ),
      f.borders?.length ? section(`Neighbours · ${f.borders.length}`, neighbours) : section("Neighbours", h("p", { class: "muted" }, "No land borders.")),
      note("Facts from REST Countries; borders from Natural Earth. Borders shown are de facto and simplified."),
    ];
  });

  const people = countryTab("people", "People", ["population", "lifeExpectancy", "urban", "fertility"], (c, s) => [
    hero(s.population.latest ? compact(s.population.latest.value) : "—", `people in ${c.facts.name.common}`, s.population.latest ? `World Bank, ${s.population.latest.year}` : undefined),
    trendChart(s.population, "People", compact),
    stats(
      ["Life expectancy", latest(s.lifeExpectancy, (v) => `${v.toFixed(1)} years`)],
      ["Living in cities", latest(s.urban, pct)],
      ["Children per woman", latest(s.fertility, (v) => v.toFixed(2))],
    ),
    note("World Bank World Development Indicators."),
  ]);

  const economy = countryTab("economy", "Economy", ["gdp", "gdpPerCapita", "gini", "electricity"], (_c, s) => [
    hero(s.gdpPerCapita.latest ? money(s.gdpPerCapita.latest.value) : "—", "income per person (GDP per capita)", s.gdpPerCapita.latest ? `US dollars, ${s.gdpPerCapita.latest.year}` : undefined),
    trendChart(s.gdpPerCapita, "US$", money),
    stats(
      ["Size of the economy (GDP)", latest(s.gdp, money)],
      ["Inequality (Gini, 0–100)", latest(s.gini, (v) => v.toFixed(1)), "0 means everyone has the same income; higher is more unequal"],
      ["People with electricity", latest(s.electricity, pct)],
    ),
    note("World Bank World Development Indicators, current US dollars."),
  ]);

  const environment = countryTab("environment", "Environment", ["forest", "renewables", "co2PerCapita", "protectedLand"], (_c, s) => [
    hero(s.forest.latest ? pct(s.forest.latest.value) : "—", "of the land is forest", s.forest.latest ? String(s.forest.latest.year) : undefined),
    trendChart(s.co2PerCapita, "t CO₂", (v) => v.toFixed(1)),
    stats(
      ["CO₂ per person", latest(s.co2PerCapita, (v) => `${v.toFixed(1)} tonnes a year`)],
      ["Energy from renewables", latest(s.renewables, pct)],
      ["Protected land", latest(s.protectedLand, pct)],
    ),
    note("World Bank World Development Indicators. The chart shows CO₂ emissions per person over time."),
  ]);

  return {
    id: "countries",
    label: "Countries",
    icon: icons.flag,
    color: "#ff375f",
    intro: "The nation a place belongs to: its people, economy and environment.",
    subtabs: [overview, people, economy, environment],
    enter(app) {
      if (!borders) {
        void countryShapes().then((shapes) => {
          if (borders) return;
          borders = vectorLayer(shapes, { stroke: "rgba(255, 255, 255, 0.8)", width: 1.2, scaleWithZoom: true });
          app.globe.viewer.imageryLayers.add(borders);
          borders.show = app.theme.id === "countries";
        });
      } else borders.show = true;
      if (highlight) highlight.show = true;
    },
    leave() {
      if (borders) borders.show = false;
      if (highlight) highlight.show = false;
    },
  };
}
