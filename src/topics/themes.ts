// Topics: ways of seeing a place beyond the ground, water and weather, kept
// under "More" so the main bar stays calm. Each opens on the place itself
// (what's on its streets) and then widens to its country:
//   Money & trade  currency, rates and the economy; companies; where people shop
//   Sports         stadiums, teams and what people play; the country's stars
//   Fashion        boutiques and tailors; the country's labels and designers
//   Food           what people eat here; the country's dishes
//   Arts & music   venues, theatres and galleries; who was born or formed here
import type { App, Place, Subtab, Theme } from "../app";
import { countryAt, countryFacts, indicators, type CountryFacts, type IndicatorKey, type Series } from "../data/countries";
import { commonsThumb } from "../data/wikidata";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { WorkLayer } from "../work/layer";
import { asyncBlock, hero, inlineChart, note, section, stats } from "../themes/common";
import { cuisines, sportsPlayed, streetAround, tally, within, type Spot, type Street, type Topic } from "./street";
import { artistsNear, athletesOf, companiesNear, companiesOf, dishesOf, fashionOf, moneyBodies, venuesNear, type Named } from "./wiki";
import { rateText, usdRates } from "./rates";

// ---- Shared pieces -------------------------------------------------------

interface Country { iso3: string; facts: CountryFacts }
const countries = new Map<string, Promise<Country | null>>();
function countryOf(place: Place): Promise<Country | null> {
  const key = `${place.lon.toFixed(3)},${place.lat.toFixed(3)}`;
  let p = countries.get(key);
  if (!p) {
    p = countryAt(place.lon, place.lat).then(async (s) => (s?.id ? { iso3: "", facts: await countryFacts(s.id) } : null)).then((c) => (c ? { ...c, iso3: c.facts.cca3 } : null));
    p.catch(() => countries.delete(key));
    countries.set(key, p);
  }
  return p;
}

const compact = (v: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);
const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
const latest = (s: Series | undefined, fmt: (v: number) => string) => (s?.latest ? `${fmt(s.latest.value)} (${s.latest.year})` : null);
const placeName = (p: Place) => p.name?.title ?? "this spot";
/** "the Dominican Republic", "the Netherlands", "France". */
const theCountry = (c: Country) => {
  const n = c.facts.name.common;
  return /^(United |Dominican Republic|Czech|Central African|Democratic|Republic of|Netherlands|Philippines|Bahamas|Gambia|Maldives|Comoros|Seychelles|Vatican)|Islands$/.test(n) ? `the ${n}` : n;
};

let pins: WorkLayer | null = null;
const clearPins = () => pins?.set([]);
/** Puts a topic's spots on the map (the list carries the names, so the map stays uncluttered). */
function pinSpots(app: App, spots: { name?: string; lon: number; lat: number }[], color: string) {
  pins ??= new WorkLayer(app, "topic-pins", "Topic", color, false);
  pins.set(spots.slice(0, 60).map((s, i) => ({ id: `t${i}`, kind: "point" as const, pts: [[s.lon, s.lat]], color })));
}

/** Rows for named things; each opens its Wikipedia article (or goes there on the map). */
function namedList(app: App, items: Named[], opts: { emoji?: string; sub?: (n: Named) => string | undefined } = {}): HTMLElement {
  return h("div", { class: "list" }, ...items.map((n) => {
    // The detail only when the description doesn't already say it ("baseball · Dominican baseball player").
    const detail = n.detail && !n.about?.toLowerCase().includes(n.detail.toLowerCase()) ? n.detail : undefined;
    const sub = opts.sub?.(n) ?? [detail, n.about].filter(Boolean).join(" · ");
    const go = n.article ? () => window.open(n.article, "_blank", "noopener")
      : n.lon !== undefined && n.lat !== undefined ? () => void flyToPlace(app.globe, { name: n.name, lon: n.lon!, lat: n.lat!, radius: 1500 })
      : null;
    return h("button", { class: "list-row" + (go ? "" : " static"), onclick: go ?? undefined, title: n.article ? "Read about it on Wikipedia" : undefined },
      n.image ? h("img", { class: "tp-thumb", src: commonsThumb(n.image, 120), alt: "", loading: "lazy" }) : h("span", { class: "story-mini-emoji" }, opts.emoji ?? "•"),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, n.name), sub ? h("span", { class: "list-sub" }, sub) : ""),
      go ? h("span", { class: "chev", html: "&rsaquo;" }) : "");
  }));
}

/** Named spots on the street; tapping one flies there. */
function spotList(app: App, spots: Spot[], max = 8): HTMLElement {
  return h("div", { class: "list" }, ...spots.filter((s) => s.name).slice(0, max).map((s) =>
    h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: s.name!, lon: s.lon, lat: s.lat, radius: 350 }) },
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, s.name!), h("span", { class: "list-sub" }, [s.kind, s.tags["addr:street"]].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" }))));
}

/** A tally as bars: the biggest fills the row. */
function bars(rows: { label: string; n: number }[], color: string): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return h("div", { class: "tp-bars" }, ...rows.map((r) =>
    h("div", { class: "tp-bar" },
      h("span", { class: "tp-bar-label" }, r.label),
      h("span", { class: "tp-bar-track" }, h("span", { class: "tp-bar-fill", style: `width:${Math.max(4, (r.n / max) * 100).toFixed(0)}%;background:${color}` })),
      h("span", { class: "tp-bar-n" }, String(r.n)))));
}

const OSM_NOTE = "Shops, restaurants, venues and pitches from OpenStreetMap, mapped by volunteers: busy streets are well covered, quiet ones less so.";
const WIKI_NOTE = "Names from Wikidata, best known first (by how many Wikipedia languages write about them). Tap one to read about it.";

/** A place-level tab: reads the streets around, then builds from this topic's spots. */
function streetTab(id: string, label: string, topic: Topic, color: string, build: (app: App, place: Place, mine: Spot[], street: Street) => (Node | string)[]): Subtab {
  return {
    id, label,
    render({ app, place, body }) {
      clearPins();
      asyncBlock(app, body, "Reading the streets around…", async () => {
        const street = await streetAround(place.lon, place.lat);
        const mine = street.spots.filter((s) => s.topic === topic);
        pinSpots(app, mine.filter((s) => s.name), color);
        return build(app, place, mine, street);
      });
    },
  };
}

/** A country-level tab. */
function countryTab(id: string, label: string, build: (app: App, place: Place, c: Country) => Promise<(Node | string)[]>): Subtab {
  return {
    id, label,
    render({ app, place, body }) {
      clearPins();
      asyncBlock(app, body, "Looking up the country…", async () => {
        const c = await countryOf(place);
        if (!c) return [hero("No country", "This spot is in international waters or Antarctica.")];
        return build(app, place, c);
      });
    },
  };
}

/** Counts as stat rows, leaving out the ones with nothing to count. */
const counts = (...rows: [string, number][]) => stats(...rows.filter(([, n]) => n > 0).map(([l, n]) => [l, n.toLocaleString()] as [string, string]));

/** Runs a lookup, with a quiet line instead of the section if it fails. */
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}

function theme(t: Omit<Theme, "more" | "leave">): Theme {
  return { ...t, more: true, leave: () => clearPins() };
}

// ---- Money & trade -------------------------------------------------------

function moneyTheme(): Theme {
  const color = "#d4a017";
  const MONEY_KEYS: IndicatorKey[] = ["inflation", "lendingRate", "unemployment", "trade", "exports", "fdi", "fxRate", "tourism", "remittances", "agriculture", "industry", "services", "gdpPerCapita"];

  const money = countryTab("money", "Money", async (_app, _place, c) => {
    const f = c.facts;
    const [code, cur] = Object.entries(f.currencies ?? {})[0] ?? [];
    const [s, fx, bodies] = await Promise.all([indicators(c.iso3, MONEY_KEYS), soft(usdRates()), soft(moneyBodies(c.iso3))]);
    const perUsd = code && fx?.rates[code];
    const perEur = code && fx?.rates.EUR && fx.rates[code] ? fx.rates[code] / fx.rates.EUR : null;
    const sectors = [["Farming", s.agriculture], ["Industry", s.industry], ["Services", s.services]] as const;
    const hasSectors = sectors.some(([, x]) => x.latest);
    return [
      code && perUsd && code !== "USD"
        ? hero(`1 US$ = ${rateText(perUsd)} ${code}`, `${cur?.name ?? code}${cur?.symbol ? ` (${cur.symbol})` : ""}`, [perEur && code !== "EUR" ? `1 € = ${rateText(perEur)} ${code}` : "", fx?.updated ? `rate of ${fx.updated}` : ""].filter(Boolean).join(" · "))
        : hero(cur?.name ?? "—", code ? `the currency (${code})` : "the currency", code === "USD" ? "The US dollar is the world's main reserve currency." : undefined),
      s.fxRate.points.length >= 5 && code !== "USD" ? section(`What a dollar buys, in ${code}`,
        h("div", { class: "chart-card" }, inlineChart({ x: s.fxRate.points.map((p) => p.year), y: s.fxRate.points.map((p) => p.value) }, { xLabel: "Year", yLabel: code ?? "", xFormat: (v) => String(Math.round(v)), yFormat: rateText }, 150))) : "",
      section("Rates",
        stats(
          ["Prices rising (inflation)", latest(s.inflation, (v) => `${v.toFixed(1)}% a year`) ?? "Not reported"],
          ["Borrowing costs (bank lending rate)", latest(s.lendingRate, pct) ?? "Not reported"],
          ["Out of work (unemployment)", latest(s.unemployment, pct) ?? "Not reported"],
          ["Income per person", latest(s.gdpPerCapita, (v) => `$${compact(v)}`) ?? "Not reported"],
        )),
      section("Trade and money coming in",
        stats(
          ["Trade, as share of the economy", latest(s.trade, pct) ?? "Not reported", "Exports plus imports, against the size of the economy"],
          ["Exports a year", latest(s.exports, (v) => `$${compact(v)}`) ?? "Not reported"],
          s.tourism.latest ? ["Spent by visitors a year", latest(s.tourism, (v) => `$${compact(v)}`)!] : null,
          s.remittances.latest ? ["Sent home by family abroad", latest(s.remittances, (v) => `$${compact(v)}`)!, "Personal remittances received"] : null,
          ["Foreign investment a year", latest(s.fdi, (v) => `$${compact(v)}`) ?? "Not reported"],
        )),
      hasSectors ? section("What the economy runs on", bars(sectors.filter(([, x]) => x.latest).map(([l, x]) => ({ label: l, n: Math.round(x.latest!.value) })), color), h("p", { class: "muted small" }, "Share of the economy, %")) : "",
      bodies && (bodies.bank || bodies.exchanges.length) ? section("Who runs the money", namedList(_app, [...(bodies.bank ? [bodies.bank] : []), ...bodies.exchanges], { emoji: "🏦", sub: (n) => (n === bodies.bank ? "Central bank: sets interest rates and issues the currency" : "Stock exchange") })) : "",
      note(`Figures from the World Bank's World Development Indicators; today's exchange rate from open.er-api.com (Rates By Exchange Rate API); the central bank and stock exchanges from Wikidata. The chart is the official yearly average rate.`),
    ];
  });

  const companies: Subtab = {
    id: "companies", label: "Companies",
    render({ app, place, body }) {
      clearPins();
      asyncBlock(app, body, "Finding companies…", async () => {
        const [near, c] = await Promise.all([soft(companiesNear(place.lon, place.lat)), countryOf(place)]);
        const big = c ? await soft(companiesOf(c.iso3)) : null;
        const inCountry = (big ?? []).filter((x) => !near?.some((n) => n.id === x.id));
        if (!near?.length && !inCountry.length) return [hero("—", "No well-known companies found", "Wikidata may not have reached here yet."), note(WIKI_NOTE)];
        return [
          near?.length ? section(`Based near ${placeName(place)}`, namedList(app, near, { emoji: "🏢" })) : "",
          inCountry.length && c ? section(`Best-known companies in ${theCountry(c)}`, namedList(app, inCountry, { emoji: "🏢" })) : "",
          note(WIKI_NOTE),
        ];
      });
    },
  };

  const shopping = streetTab("shopping", "Shopping", "money", color, (app, place, mine, street) => {
    const big = mine.filter((s) => /^(mall|department_store|marketplace)$/.test(s.tags.shop ?? s.tags.amenity ?? ""));
    const shops = mine.filter((s) => s.tags.shop);
    const money = (k: string) => mine.filter((s) => s.tags.amenity === k).length;
    const all = street.spots.filter((s) => s.tags.shop).length;
    return [
      hero(all.toLocaleString(), `shops ${within(street.radius)} of ${placeName(place)}`),
      big.length ? section("Markets and shopping centres", spotList(app, big)) : "",
      shops.length ? section("What people buy here", bars(tally(shops.map((s) => s.kind)), color)) : "",
      counts(["Banks", money("bank")], ["Cash machines", money("atm")], ["Money exchange", money("bureau_de_change")], ["Money transfer", money("money_transfer")]),
      note(OSM_NOTE),
    ];
  });

  return theme({ id: "money", label: "Money & trade", icon: icons.coin, color, intro: "Currency, rates and what an economy runs on; the companies based there, and where people shop.", subtabs: [money, companies, shopping] });
}

// ---- Sports ----------------------------------------------------------------

function sportsTheme(): Theme {
  const color = "#ff9f0a";
  const here: Subtab = {
    id: "here", label: "Here",
    render({ app, place, body }) {
      clearPins();
      asyncBlock(app, body, "Finding stadiums and pitches…", async () => {
        const [venues, street] = await Promise.all([soft(venuesNear(place.lon, place.lat)), soft(streetAround(place.lon, place.lat))]);
        const mine = street?.spots.filter((s) => s.topic === "sports") ?? [];
        const played = sportsPlayed(mine);
        const count = (k: string) => mine.filter((s) => s.tags.leisure === k).length;
        pinSpots(app, [...(venues ?? []).filter((v) => v.lon !== undefined).map((v) => ({ name: v.name, lon: v.lon!, lat: v.lat! })), ...mine.filter((s) => s.name)], color);
        if (!venues?.length && !mine.length) return [hero("—", "No sports places found nearby"), note(OSM_NOTE)];
        return [
          venues?.length ? section("Stadiums and arenas", namedList(app, venues, { emoji: "🏟️", sub: (v) => {
            const x = v as Named & { capacity?: number; teams: string[] };
            return [x.capacity ? `${x.capacity.toLocaleString()} seats` : "", x.teams.length ? `Home of ${x.teams.join(", ")}` : x.detail].filter(Boolean).join(" · ");
          } })) : "",
          played.length ? section(`What people play ${street ? within(street.radius) : "here"}`, bars(played, color)) : "",
          counts(["Pitches and courts", count("pitch")], ["Gyms", count("fitness_centre")], ["Sports centres", count("sports_centre") + count("sports_hall")], ["Swimming pools", count("swimming_pool")], ["Golf courses", count("golf_course")]),
          note(`Stadiums and teams from Wikidata (within 40 km, biggest first); pitches, gyms and pools from OpenStreetMap.`),
        ];
      });
    },
  };
  const stars = countryTab("stars", "Stars", async (app, _p, c) => {
    const list = await athletesOf(c.iso3);
    return [
      list.length ? section(`Sports stars of ${theCountry(c)}`, namedList(app, list, { emoji: "🏅" })) : hero("—", "No athletes found", "Wikidata may not list who competes for this country."),
      note(WIKI_NOTE),
    ];
  });
  return theme({ id: "sports", label: "Sports", icon: icons.trophy, color, intro: "Stadiums and the teams that play in them, what people play on local pitches, and a country's sports stars.", subtabs: [here, stars] });
}

// ---- Fashion ---------------------------------------------------------------

/** Where the big fashion weeks are held. */
const CAPITALS = [
  { name: "Paris", lon: 2.35, lat: 48.86, when: "late Feb–early Mar and late Sep–early Oct" },
  { name: "Milan", lon: 9.19, lat: 45.46, when: "late Feb and late Sep" },
  { name: "New York", lon: -74.0, lat: 40.71, when: "Feb and Sep" },
  { name: "London", lon: -0.13, lat: 51.51, when: "Feb and Sep" },
  { name: "Tokyo", lon: 139.69, lat: 35.69, when: "Mar and Sep" },
  { name: "Seoul", lon: 126.98, lat: 37.57, when: "Mar and Oct" },
  { name: "Copenhagen", lon: 12.57, lat: 55.68, when: "Jan–Feb and Aug" },
  { name: "São Paulo", lon: -46.63, lat: -23.55, when: "Apr and Oct" },
  { name: "Lagos", lon: 3.38, lat: 6.52, when: "Oct" },
  { name: "Mumbai", lon: 72.88, lat: 19.08, when: "Mar and Oct" },
  { name: "Shanghai", lon: 121.47, lat: 31.23, when: "Mar–Apr and Oct" },
  { name: "Berlin", lon: 13.4, lat: 52.52, when: "Jan–Feb and Jul" },
  { name: "Madrid", lon: -3.7, lat: 40.42, when: "Feb and Sep" },
  { name: "Mexico City", lon: -99.13, lat: 19.43, when: "Apr and Oct" },
  { name: "Santo Domingo", lon: -69.93, lat: 18.49, when: "Dominicana Moda, in the autumn" },
];
const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
};

function fashionTheme(): Theme {
  const color = "#ff2d92";
  const here = streetTab("here", "Here", "fashion", color, (app, place, mine, street) => {
    const cap = [...CAPITALS].sort((a, b) => km(place, a) - km(place, b))[0];
    const d = km(place, cap);
    return [
      hero(String(mine.length), `fashion shops ${within(street.radius)} of ${placeName(place)}`),
      mine.length ? section("Boutiques and shops", spotList(app, mine, 10)) : "",
      mine.length ? section("What they sell", bars(tally(mine.map((s) => s.kind)), color)) : "",
      section("Nearest fashion week",
        h("div", { class: "list" }, h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: cap.name, lon: cap.lon, lat: cap.lat, radius: 8000 }) },
          h("span", { class: "story-mini-emoji" }, "👗"),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, cap.name), h("span", { class: "list-sub" }, `${d < 30 ? "Right here" : `${Math.round(d).toLocaleString()} km away`} · ${cap.when}`)),
          h("span", { class: "chev", html: "&rsaquo;" })))),
      note(OSM_NOTE),
    ];
  });
  const labels = countryTab("labels", "Labels", async (app, _p, c) => {
    const { labels, designers } = await fashionOf(c.iso3);
    if (!labels.length && !designers.length) return [hero("—", `No fashion labels found for ${theCountry(c)}`, "Wikidata may not have them yet."), note(WIKI_NOTE)];
    return [
      labels.length ? section(`Labels from ${theCountry(c)}`, namedList(app, labels, { emoji: "🏷️" })) : "",
      designers.length ? section("Designers", namedList(app, designers, { emoji: "✂️" })) : "",
      note(WIKI_NOTE),
    ];
  });
  return theme({ id: "fashion", label: "Fashion", icon: icons.shirt, color, intro: "Boutiques and tailors on the streets around, the nearest fashion week, and a country's labels and designers.", subtabs: [here, labels] });
}

// ---- Food ------------------------------------------------------------------

function foodTheme(): Theme {
  const color = "#ff6b35";
  const here = streetTab("here", "Here", "food", color, (app, place, mine, street) => {
    const n = (...kinds: string[]) => mine.filter((s) => kinds.includes(s.tags.amenity ?? s.tags.shop ?? "")).length;
    const markets = street.spots.filter((s) => s.tags.amenity === "marketplace");
    const eat = cuisines(mine);
    return [
      hero(String(n("restaurant", "fast_food", "food_court")), `places to eat ${within(street.radius)} of ${placeName(place)}`),
      eat.length ? section("What people eat here", bars(eat, color)) : "",
      counts(["Cafés", n("cafe")], ["Bars and pubs", n("bar", "pub", "biergarten")], ["Bakeries", n("bakery", "pastry")], ["Ice cream", n("ice_cream")]),
      markets.length ? section("Markets", spotList(app, markets)) : "",
      mine.length ? section("On the map", spotList(app, mine, 8)) : "",
      note(OSM_NOTE),
    ];
  });
  const dishes = countryTab("dishes", "Dishes", async (app, _p, c) => {
    const list = await dishesOf(c.iso3);
    return [
      list.length ? section(`Dishes from ${theCountry(c)}`, namedList(app, list, { emoji: "🍲", sub: (d) => d.about })) : hero("—", `No dishes found for ${theCountry(c)}`, "Wikidata may not list them yet."),
      note(WIKI_NOTE),
    ];
  });
  return theme({ id: "food", label: "Food", icon: icons.fork, color, intro: "What people eat on the streets around a place, its cafés and markets, and the dishes a country is known for.", subtabs: [here, dishes] });
}

// ---- Arts & music ------------------------------------------------------------

function artsTheme(): Theme {
  const color = "#8e7cff";
  const here = streetTab("here", "Here", "arts", color, (app, place, mine, street) => {
    const kinds = tally(mine.map((s) => s.kind));
    return [
      hero(String(mine.length), `venues, theatres and galleries ${within(street.radius)} of ${placeName(place)}`),
      mine.length ? section("Where to go", spotList(app, mine, 10)) : "",
      kinds.length ? section("What's here", bars(kinds, color)) : "",
      note(OSM_NOTE),
    ];
  });
  const people = {
    id: "people", label: "People",
    render({ app, place, body }) {
      clearPins();
      asyncBlock(app, body, "Finding musicians and artists…", async () => {
        const { music, art } = await artistsNear(place.lon, place.lat);
        if (!music.length && !art.length) return [hero("—", "No well-known musicians or artists found nearby"), note(WIKI_NOTE)];
        return [
          music.length ? section("Musicians and bands from around here", namedList(app, music, { emoji: "🎵" })) : "",
          art.length ? section("Artists born around here", namedList(app, art, { emoji: "🎨" })) : "",
          note("Born (or, for bands, formed) within 30 km. " + WIKI_NOTE),
        ];
      });
    },
  } satisfies Subtab;
  return theme({ id: "arts", label: "Arts & music", icon: icons.music, color, intro: "Theatres, music venues and galleries around a place, and the musicians and artists who came from there.", subtabs: [here, people] });
}

export function topicThemes(): Theme[] {
  return [moneyTheme(), sportsTheme(), fashionTheme(), foodTheme(), artsTheme()];
}
