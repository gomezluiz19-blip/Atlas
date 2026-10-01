// A place's page: one address for everything Atlas knows about it. The card
// under a tapped mountain, river, town or spot becomes a page with a
// permanent link: what it is, the place across every layer at once (each
// figure opens its theme), places like it, stories that pass through, what's
// nearby, and where every figure comes from.
import type { App, Place } from "../app";
import { MEASURES, compassName, type Group, type Needs } from "../answers/criteria";
import { forecast } from "../data/openmeteo";
import { weatherText } from "../analysis/climate";
import { h } from "../ui/dom";
import { iconFor, labelled } from "../ui/glyph";
import { asyncBlock, note, section } from "../themes/common";
import { likeThis, measureAt } from "./measure";
import { headline } from "./headline";
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
  elev: "Ground here", slope: "Slope", aspect: "Faces", temp: "Average", winter: "Coldest month", rain: "Rain a year", sun: "Sunshine", frost: "Frosty nights",
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
  // The one fact worth knowing first, from the layers measured here.
  const head = h("p", { class: "pg-headline" });
  let fact = "", slug = "";
  void measureAt(place.lon, place.lat).then((m) => {
    // A summit's own height (in the card's subtitle) wins over the ground sampled where it was tapped.
    const known = /height[:\s]+([\d,]+)\s*m/i.exec(place.name?.context ?? "");
    const v = known ? { ...m.v, elev: Number(known[1].replace(/,/g, "")) } : m.v;
    fact = headline(v, (place.feature as { world?: { kind?: string } } | undefined)?.world?.kind) ?? "";
    if (fact && head.isConnected) { head.textContent = fact; head.classList.add("on"); }
  }).catch(() => {});
  void slugOfPlace(place).then((s) => (slug = s)).catch(() => {});
  // Sharing lives in the card's share button (link, picture card, coordinates, other maps).
  app.actions.set("place:card", { label: "A picture card of this place", run: () => {
    // Whatever place is chosen now (the fact and page address are this page's, if it's still the one).
    const p = app.place ?? place, same = p === place;
    void import("../delight/card").then((m) => m.shareCard(app, {
      title: p.name?.title ?? "A place on Earth", kicker: p.name?.context?.split(",").slice(-1)[0]?.trim(), fact: same && fact ? fact : undefined,
      link: same && slug && !slug.startsWith("@") ? pageLink(slug) : app.shareLink?.() ?? location.href,
    }));
  } });
  return h("div", { class: "pg-head" },
    head,
    h("div", { class: "pg-actions" },
      h("button", { class: "pg-btn holo-go", title: "See this place as a hologram: the ground and every building around it, in 3D", onclick: () => app.actions.get("space:boot")?.run() }, ...labelled("◎ Hologram", 15)),
      h("button", { class: "pg-btn", title: "Walk, bike or drive from here: how far you get and how long to your places", onclick: () => app.actions.get("reach:open")?.run() }, ...labelled("⏱ Getting around", 15)),
      h("button", { class: "pg-btn", title: "Plan a trip here: the way there, the time change, the weather, stays and where to book", onclick: () => app.actions.get("travel:to")?.run() }, ...labelled("✈ Go here", 15)),
      h("button", { class: "pg-btn", title: "Find places with the same ground and climate", onclick: () => placesLike(place.name?.title ?? "here") }, ...labelled("✨ Places like this", 15)),
      h("button", { class: "pg-btn", title: "A place you love: it goes on your page (your Top 8, favourite restaurants, trails…)", onclick: () => app.actions.get("profile:add")?.run() }, ...labelled("♡ Add to my page", 15)),
      h("button", { class: "pg-btn", title: "A place you live, farm or run: My Places gives it a daily brief", onclick: () => app.actions.get("place:save")?.run() }, ...labelled("🏠 Add to My Places", 15))));
}

/** The place across every layer at once: each tile opens the theme it came from. */
const READING: [Needs, string][] = [["terrain", "Ground"], ["climate", "Climate"], ["places", "People"], ["infra", "Getting there"], ["water", "Water"], ["hazards", "Hazards"], ["country", "Country"]];

export function acrossLayers(app: App, place: Place, body: HTMLElement) {
  // The layers being read, ticking in live, until the page has them all.
  const dots = new Map<Needs, HTMLElement>();
  const reading = h("div", { class: "pg-reading", role: "status" },
    h("span", { class: "pg-reading-title" }, "Reading this place"),
    h("div", { class: "pg-reading-list" }, ...READING.map(([n, label]) => { const el = h("span", { class: "pg-reading-item" }, h("i"), label); dots.set(n, el); return el; })));
  body.append(reading);
  asyncBlock(app, body, "", async () => {
    const [m, wx] = await Promise.all([
      measureAt(place.lon, place.lat, (n, ok) => dots.get(n)?.classList.add(ok ? "done" : "failed")),
      forecast(place.lon, place.lat).catch(() => null),
    ]);
    reading.remove();
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
      section("At a glance", h("div", { class: "pg-layers" }, ...groups)),
      m.missing.length ? h("p", { class: "fineprint" }, `Couldn't reach ${m.missing.join(", ")} just now.`) : "",
      note("Read just now from: terrain (Mapzen/AWS Terrain Tiles), last year's weather (ERA5 via Open-Meteo), towns (Natural Earth), airports, ports, rail and roads (Natural Earth), rivers (Natural Earth), plate boundaries (Bird 2003), country figures (World Bank). Flood risk is a rough proxy."),
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
