// People: where they live and how they live. The planet glows with its towns
// and cities; views colour it by crowdedness, age, homes owned or rented,
// health, phones and the internet, or income. For a chosen place: the people
// around it, their homes (US neighbourhoods from the Census), their health
// and how connected they are, next to the world's figures.
import type { ImageryLayer } from "cesium";
import type { App, Subtab, Theme } from "../app";
import { countryAt, countryShapes } from "../data/countries";
import { colorFor, iso3, peopleNear, populationPoints, usTract, viewValues, VIEWS, type View } from "../data/people";
import { vectorLayer } from "../globe/vectorLayer";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { asyncBlock, hero, note, section, stats } from "./common";
import { iconFor } from "../ui/glyph";

const fmtPeople = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString()},000` : Math.round(n).toLocaleString());
const byId = (id: string) => VIEWS.find((v) => v.id === id)!;

/** One figure for a country, with a bar and the world's figure marked on it. */
function compare(v: View, value: number | undefined, world: number | undefined): HTMLElement {
  const [lo, hi] = v.range ?? [0, 100];
  const at = (x: number) => `${Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  return h("div", { class: "pp-row" },
    h("span", { class: "pp-label" }, iconFor(v.emoji, 15), ` ${v.label}`),
    h("span", { class: "pp-value" }, value === undefined ? "—" : v.unit(value)),
    h("span", { class: "pp-bar" },
      value !== undefined ? h("i", { style: `width:${at(value)};background:${colorFor(v, value, lo, hi)}` }) : "",
      world !== undefined ? h("b", { style: `left:${at(world)}`, title: `World: ${v.unit(world)}` }) : ""),
    h("small", { class: "pp-about" }, v.about, world !== undefined ? ` · world ${v.unit(world)}` : ""));
}

async function countryFigures(lon: number, lat: number, ids: string[]) {
  const c = await countryAt(lon, lat);
  const code = c ? iso3(c.id) : null;
  const views = ids.map(byId);
  const values = await Promise.all(views.map((v) => viewValues(v).catch(() => ({} as Record<string, { value: number }>))));
  return { country: c?.name ?? null, rows: views.map((v, i) => ({ v, value: code ? values[i][code]?.value : undefined, world: values[i].WLD?.value })) };
}

export function peopleTheme(app: App): Theme {
  let current = "pop";
  let layer: ImageryLayer | null = null;
  let job = 0;

  /** Colours the world by a view (or back to the glow of where people live). */
  const showView = async (id: string) => {
    current = id;
    const my = ++job;
    if (layer) { app.globe.viewer.imageryLayers.remove(layer, true); layer = null; }
    if (id === "pop") { app.looks?.setLegend(null); return; }
    const v = byId(id);
    const [values, shapes] = await Promise.all([viewValues(v), countryShapes()]);
    if (my !== job || app.theme.id !== "people") return;
    const vals = Object.values(values).map((x) => x.value);
    const [lo, hi] = v.range ?? [Math.min(...vals), Math.max(...vals)];
    layer = vectorLayer(shapes, { stroke: "rgba(255,255,255,0.35)", width: 0.7, scaleWithZoom: true, fillOf: (s) => { const c = iso3((s as unknown as { id: string }).id); const x = c ? values[c]?.value : undefined; return x === undefined ? "rgba(120,120,120,0.35)" : colorFor(v, x, lo, hi); } });
    layer.alpha = 0.82;
    app.globe.viewer.imageryLayers.add(layer);
    app.looks?.setLegend({ emoji: v.emoji, name: v.label, stops: v.ramp, from: v.unit(lo), to: v.unit(hi) });
  };

  const here: Subtab = {
    id: "here", label: "Here",
    render({ app, place, body }) {
      asyncBlock(app, body, "Counting the people around here…", async () => {
        const [pts, figs] = await Promise.all([populationPoints(), countryFigures(place.lon, place.lat, ["density", "urban", "growth", "young", "old", "births"])]);
        const near = peopleNear(pts, place.lon, place.lat);
        const [r25, r100, r250] = near.rings;
        return [
          hero(r100.people ? fmtPeople(r100.people) : "Few", "people live in the towns and cities within 100 km", r25.people ? `${fmtPeople(r25.people)} within 25 km · ${fmtPeople(r250.people)} within 250 km` : undefined),
          near.big ? h("p", { class: "muted small" }, `The nearest city of over half a million is ${Math.round(near.big.km)} km away (${fmtPeople(near.big.pop)} people).`) : "",
          section(figs.country ? `${figs.country}'s people` : "The country", ...figs.rows.map((r) => compare(r.v, r.value, r.world))),
          note("Towns and cities from Natural Earth (their metro populations; people in the countryside between them aren't counted). Country figures: World Bank, latest year available; the white mark is the world."),
        ];
      });
    },
  };

  const homes: Subtab = {
    id: "homes", label: "Homes",
    render({ app, place, body }) {
      asyncBlock(app, body, "Looking up homes here…", async () => {
        const figs = await countryFigures(place.lon, place.lat, ["own", "rent", "urban"]);
        const us = figs.country === "United States of America" ? await usTract(place.lon, place.lat).catch(() => null) : null;
        const money = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString()}`);
        return [
          us ? section("This neighbourhood",
            h("div", { class: "pp-split" },
              h("i", { style: `flex:${us.owners}`, class: "own" }, us.owners > 0.12 ? `🏠 ${Math.round(us.owners * 100)}% own` : ""),
              h("i", { style: `flex:${us.renters}`, class: "rent" }, us.renters > 0.12 ? `🔑 ${Math.round(us.renters * 100)}% rent` : "")),
            stats(
              ["People", us.people.toLocaleString()],
              ["Households", us.households.toLocaleString()],
              ["Median rent", `${money(us.medianRent)} a month`],
              ["Median home value", money(us.medianValue)],
              ["Median household income", `${money(us.medianIncome)} a year`],
              us.medianAge !== null ? ["Median age", `${us.medianAge}`] : null,
              us.noInternet !== null ? ["Homes without internet", `${Math.round(us.noInternet * 100)}%`] : null),
            note(`${us.name}. US Census Bureau, American Community Survey 2018–2022 (5-year estimates, with margins of error).`)) : "",
          section(figs.country ? `Homes in ${figs.country}` : "Homes", ...figs.rows.map((r) => compare(r.v, r.value, r.world))),
          note("Home ownership: Eurostat EU-SILC 2023 and national surveys, which count differently; read them as approximate. Renters include homes that are neither owned nor rented."),
        ];
      });
    },
  };

  const health: Subtab = {
    id: "health", label: "Health",
    render({ app, place, body }) {
      asyncBlock(app, body, "Reading health figures…", async () => {
        const figs = await countryFigures(place.lon, place.lat, ["life", "child", "doctors", "water"]);
        return [section(figs.country ? `Health in ${figs.country}` : "Health", ...figs.rows.map((r) => compare(r.v, r.value, r.world))), note("World Bank (WHO, UN IGME and JMP data), latest year available.")];
      });
    },
  };

  const connected: Subtab = {
    id: "connected", label: "Connected",
    render({ app, place, body }) {
      asyncBlock(app, body, "Reading connection figures…", async () => {
        const figs = await countryFigures(place.lon, place.lat, ["mobile", "online", "power", "income"]);
        return [section(figs.country ? `${figs.country}, connected` : "Connected", ...figs.rows.map((r) => compare(r.v, r.value, r.world))), note("World Bank (ITU and IEA data), latest year available. Over 100 mobile subscriptions per 100 people means many have more than one.")];
      });
    },
  };

  const viewPicker = () => {
    const groups = ["People", "Homes", "Health", "Connected", "Money"] as const;
    const btn = (id: string, emoji: string, label: string) =>
      h("button", { class: `pp-view${current === id ? " on" : ""}`, "aria-pressed": String(current === id), onclick: () => { void showView(id); app.render(); } }, iconFor(emoji, 19), h("small", {}, label));
    return section("See the world by",
      h("div", { class: "pp-views" }, btn("pop", "✨", "Where people live")),
      ...groups.map((g) => h("div", { class: "pp-group" }, h("span", { class: "pp-group-label" }, g), h("div", { class: "pp-views" }, ...VIEWS.filter((v) => v.group === g).map((v) => btn(v.id, v.emoji, v.label))))),
      current !== "pop" ? note(`${byId(current).about}. Source: ${byId(current).source}. Grey: no recent figure.`) : note("Each glow is a town or city, brighter for more people (Natural Earth: 7,300 places)."));
  };

  return {
    id: "people",
    label: "People",
    icon: icons.people,
    color: "#ff9f0a",
    intro: "Where people live, and how: homes, health, phones and more.",
    subtabs: [here, homes, health, connected],
    enter() { if (current !== "pop") void showView(current); },
    leave() { job++; if (layer) { app.globe.viewer.imageryLayers.remove(layer, true); layer = null; } app.looks?.setLegend(null); },
    renderEmpty(_app, body) {
      body.append(
        h("div", { class: "empty-hint" }, h("span", { class: "empty-icon", html: icons.people }), h("span", {}, h("strong", {}, "Tap anywhere to meet its people"), h("span", {}, "How many live around it, their homes, health and how connected they are."))),
        viewPicker());
    },
  };
}
