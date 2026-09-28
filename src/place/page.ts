// A place's page: one address for everything Atlas knows about it. The card
// under a tapped mountain, river, town or spot becomes a page with a
// permanent link: what it is, the place across every layer at once (each
// figure opens its theme), places like it, stories that pass through, what's
// nearby, and where every figure comes from.
import type { App, Place } from "../app";
import { MEASURES, compassName, type Group } from "../answers/criteria";
import { forecast } from "../data/openmeteo";
import { weatherText } from "../analysis/climate";
import { h } from "../ui/dom";
import { iconFor, labelled } from "../ui/glyph";
import { asyncBlock, section } from "../themes/common";
import { likeThis, measureAt } from "./measure";
import { nearestNamed, slugOfPlace } from "./places";

/** A place's page link: the prerendered page for named places, else an app link. */
export function pageLink(slug: string): string {
  const base = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;
  return import.meta.env.PROD && /^[a-z0-9-]+$/.test(slug) ? `${base}p/${slug}/` : `${base}#/p/${slug}`;
}

const THEME_OF: Record<Group, string> = { Ground: "land", Climate: "climate", People: "people", "Getting there": "built", Water: "water", Hazards: "land", Country: "countries" };
const TILES: { group: Group; keys: string[] }[] = [
  { group: "Ground", keys: ["elev", "slope", "aspect"] },
  { group: "Climate", keys: ["temp", "winter", "rain", "sun", "frost"] },
  { group: "People", keys: ["crowd", "city"] },
  { group: "Getting there", keys: ["airport", "rail", "highway", "port"] },
  { group: "Water", keys: ["coast", "river", "flood"] },
  { group: "Hazards", keys: ["faults", "volcano"] },
  { group: "Country", keys: ["income", "life", "online"] },
];
/** Short names for the tiles (the full labels are for conditions). */
const SHORT: Record<string, string> = {
  elev: "Height", slope: "Slope", aspect: "Faces", temp: "Average", winter: "Coldest month", rain: "Rain a year", sun: "Sunshine", frost: "Frosty nights",
  crowd: "People, 25 km", city: "Big city", airport: "Airport", rail: "Railway", highway: "Main road", port: "Seaport",
  coast: "The sea", river: "River", flood: "Flood risk", faults: "Plate edge", volcano: "Volcano", income: "Income", life: "Life expectancy", online: "Online",
};
const value = (key: string, v: number) => {
  if (!Number.isFinite(v)) return "—";
  if (key === "aspect") return compassName(v);
  if (key === "coast" && v < 1) return "on the coast";
  if (key === "slope" && v < 1.5) return "flat";
  if (key === "crowd") return v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : v >= 1000 ? `${Math.round(v / 1000).toLocaleString()},000` : "few";
  if (key === "sun" || key === "rain") return MEASURES[key].fmt(v).replace(" a year", "");
  if (key === "frost") return `${Math.round(v)}`;
  return MEASURES[key].fmt(v);
};

/** The page's header strip: its address and what you can do from here. */
export function pageHead(app: App, place: Place, placesLike: (title: string) => void): HTMLElement {
  const addr = h("span", { class: "pg-addr" }, "…");
  const copy = h("button", { class: "pg-btn", title: "Copy this page's link" }, ...labelled("🏷️ Copy link", 15));
  const row = h("div", { class: "pg-head" },
    h("div", { class: "pg-kicker" }, h("span", { class: "pg-dot" }), "Atlas page ", addr),
    h("div", { class: "pg-actions" },
      copy,
      h("button", { class: "pg-btn", onclick: () => placesLike(place.name?.title ?? "here") }, ...labelled("✨ Places like this", 15)),
      h("button", { class: "pg-btn", onclick: () => app.actions.get("place:save")?.run() }, ...labelled("📍 Save", 15))));
  let slug = "";
  void slugOfPlace(place).then((s) => {
    slug = s;
    addr.textContent = s.startsWith("@") ? "for this spot" : `/${s}`;
  }).catch(() => { addr.textContent = ""; });
  copy.addEventListener("click", async () => {
    const link = slug ? pageLink(slug) : app.shareLink?.() ?? location.href;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: place.name?.title ?? "A place on Atlas", url: link });
      else { await navigator.clipboard.writeText(link); app.toast("Link to this page copied", 2500); }
    } catch { /* share dismissed */ }
  });
  return row;
}

/** The place across every layer at once: each tile opens the theme it came from. */
export function acrossLayers(app: App, place: Place, body: HTMLElement) {
  asyncBlock(app, body, "Reading every layer here…", async () => {
    const [m, wx] = await Promise.all([measureAt(place.lon, place.lat), forecast(place.lon, place.lat).catch(() => null)]);
    const now = wx ? weatherText(wx.current.weather_code) : null;
    const groups = TILES.map(({ group, keys }) => {
      const tiles = keys.filter((k) => Number.isFinite(m.v[k]) && !(m.sea && MEASURES[k].group !== "Water" && MEASURES[k].group !== "Climate"));
      if (!tiles.length && !(group === "Climate" && wx)) return null;
      return h("div", { class: "pg-group" },
        h("button", { class: "pg-group-title", onclick: () => app.setTheme(THEME_OF[group]) }, group, h("span", { class: "chev", html: "&rsaquo;" })),
        h("div", { class: "pg-tiles" },
          group === "Climate" && wx ? tile("🌤️", `${Math.round(wx.current.temperature_2m)}°`, now ? now.text : "Right now", () => app.setTheme("climate", "now")) : "",
          ...tiles.map((k) => tile(MEASURES[k].emoji, value(k, m.v[k]), SHORT[k], () => app.setTheme(THEME_OF[group])))));
    }).filter((g) => g !== null);
    return [
      section("Across every layer", h("div", { class: "pg-layers" }, ...groups)),
      h("p", { class: "fineprint" },
        "Read just now from: terrain (Mapzen/AWS Terrain Tiles), last year's weather (ERA5 via Open-Meteo), towns (Natural Earth), airports, ports, rail and roads (Natural Earth), rivers (Natural Earth), plate boundaries (Bird 2003), country figures (World Bank). Flood risk is a rough proxy.",
        m.missing.length ? ` Couldn't reach ${m.missing.join(", ")} just now.` : ""),
    ];
  });
}

function tile(emoji: string, v: string, label: string, onclick: () => void): HTMLElement {
  return h("button", { class: "pg-tile", onclick }, h("span", { class: "pg-tile-icon" }, iconFor(emoji, 15)), h("span", { class: "pg-tile-value" }, v), h("span", { class: "pg-tile-label" }, label));
}

/** "Places like this": conditions from this place's own figures, answered around it. */
export async function placesLike(app: App, place: Place, open: (title: string, criteria: ReturnType<typeof likeThis>) => void) {
  app.toast("Reading this place, then looking for its likes…", 3000);
  const m = await measureAt(place.lon, place.lat);
  const criteria = likeThis(m.v);
  if (!criteria.length) { app.toast("Couldn't read enough about this place to compare it.", 4000); return; }
  open(`Places like ${place.name?.title ?? "this spot"}`, criteria);
}

/** Other places with pages, nearest first. */
export function nearbyPages(app: App, place: Place, body: HTMLElement, go: (slug: string) => void) {
  asyncBlock(app, body, "", async () => {
    const own = await slugOfPlace(place).catch(() => "");
    const list = await nearestNamed(place.lon, place.lat, 8, own);
    return list.length ? [section("Pages nearby", h("div", { class: "chips wrap" }, ...list.map((r) => h("button", { class: "chip", onclick: () => go(r.slug) }, r.name))))] : [];
  });
}
