// Topics: ways of seeing a place beyond the ground, water and weather, kept
// under "More" so the main bar stays calm. Each opens on the place itself
// (what's on its streets) and then widens to its country:
//   Money & trade  currency, rates and the economy; companies; where people shop
//   Sports         stadiums, teams and what people play; the country's stars
//   Fashion        boutiques and tailors; the country's labels and designers
//   Food           what people eat here; the country's dishes
//   Arts & music   venues, theatres and galleries; who was born or formed here
//   Tourism        places to stay and sights; visitors, spending and World Heritage
//   Education      schools, colleges and libraries; literacy, enrolment, universities
//   Health         the nearest hospital, clinics and pharmacies; the country's health
import type { App, Place, Subtab, Theme } from "../app";
import { countryAt, countryFacts, indicators, type CountryFacts, type IndicatorKey, type Series } from "../data/countries";
import { commonsThumb } from "../data/wikidata";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { WorkLayer } from "../work/layer";
import { asyncBlock, hero, inlineChart, note, section, stats } from "../themes/common";
import { cuisines, hospitalsAround, kmBetween, sportsPlayed, streetAround, tally, within, type Spot, type Street, type Topic } from "./street";
import { artistsNear, athletesOf, companiesNear, companiesOf, dishesOf, fashionOf, heritageOf, moneyBodies, universitiesOf, venuesNear, type Named } from "./wiki";
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

/** A tally worth drawing: a handful of things or more (two shops as bars is noise). */
function tallySection(title: string, rows: { label: string; n: number }[], color: string): HTMLElement | "" {
  return rows.reduce((t, r) => t + r.n, 0) >= 4 && rows.length > 1 ? section(title, bars(rows, color)) : "";
}

/** A World Bank series over the years, when there are enough of them to draw. */
function trend(sr: Series, yLabel: string, fmt: (v: number) => string): HTMLElement | "" {
  if (sr.points.length < 5) return "";
  return h("div", { class: "chart-card" }, inlineChart({ x: sr.points.map((p) => p.year), y: sr.points.map((p) => p.value) }, { xLabel: "Year", yLabel, xFormat: (v) => String(Math.round(v)), yFormat: fmt }, 150));
}
const WB_NOTE = "Figures from the World Bank's World Development Indicators; the latest year each country reported.";

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
      tallySection("What people buy here", tally(shops.map((s) => s.kind)), color),
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
          played.length ? tallySection(`What people play ${street ? within(street.radius) : "here"}`, played, color) : "",
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
  { name: "Johannesburg", lon: 28.05, lat: -26.2, when: "South African Fashion Week, twice a year" },
  { name: "Dakar", lon: -17.45, lat: 14.69, when: "Dakar Fashion Week, each year since 2002" },
  { name: "Accra", lon: -0.19, lat: 5.6, when: "Accra Fashion Week, each year" },
  { name: "Addis Ababa", lon: 38.76, lat: 9.01, when: "Hub of Africa Fashion Week, each year" },
  { name: "Lahore", lon: 74.34, lat: 31.55, when: "PFDC fashion weeks, through the year" },
  { name: "Jakarta", lon: 106.82, lat: -6.2, when: "Jakarta Fashion Week, in October" },
  { name: "Medellín", lon: -75.57, lat: 6.25, when: "Colombiamoda, in July" },
  { name: "Istanbul", lon: 28.98, lat: 41.01, when: "Istanbul Fashion Week, twice a year" },
  { name: "Dubai", lon: 55.27, lat: 25.2, when: "Arab Fashion Week, twice a year" },
];
const km = kmBetween;

function fashionTheme(): Theme {
  const color = "#ff2d92";
  const here = streetTab("here", "Here", "fashion", color, (app, place, mine, street) => {
    const cap = [...CAPITALS].sort((a, b) => km(place, a) - km(place, b))[0];
    const d = km(place, cap);
    return [
      hero(String(mine.length), `fashion shops ${within(street.radius)} of ${placeName(place)}`),
      mine.length ? section("Boutiques and shops", spotList(app, mine, 10)) : "",
      tallySection("What they sell", tally(mine.map((s) => s.kind)), color),
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
      eat.length ? tallySection("What people eat here", eat, color) : "",
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
      kinds.length ? tallySection("What's here", kinds, color) : "",
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

// ---- Tourism ---------------------------------------------------------------

function tourismTheme(): Theme {
  const color = "#00c7be";
  const here = streetTab("here", "Here", "tourism", color, (app, place, mine, street) => {
    const stays = mine.filter((s) => !/^(attraction|viewpoint|theme_park|zoo|aquarium)$/.test(s.tags.tourism ?? ""));
    const sights = [...mine.filter((s) => !stays.includes(s)), ...street.spots.filter((s) => s.tags.tourism === "museum" || s.tags.tourism === "gallery")];
    const rooms = stays.reduce((n, s) => n + (Number(s.tags.rooms) || 0), 0);
    return [
      hero(String(stays.length), `places to stay ${within(street.radius)} of ${placeName(place)}`, rooms ? `at least ${rooms.toLocaleString()} rooms listed` : undefined),
      tallySection("What kind", tally(stays.map((s) => s.kind)), color),
      stays.length ? section("Where to stay", spotList(app, stays, 8)) : "",
      sights.length ? section("Sights and museums", spotList(app, sights, 8)) : "",
      note(OSM_NOTE),
    ];
  });
  const country = countryTab("country", "Country", async (app, _p, c) => {
    const [s, sites] = await Promise.all([indicators(c.iso3, ["arrivals", "tourism", "tourismShare"]), soft(heritageOf(c.iso3))]);
    return [
      hero(s.arrivals.latest ? compact(s.arrivals.latest.value) : "—", `visitors from abroad a year in ${theCountry(c)}`, s.arrivals.latest ? String(s.arrivals.latest.year) : undefined),
      trend(s.arrivals, "Visitors", compact),
      stats(
        ["Spent by visitors a year", latest(s.tourism, (v) => `$${compact(v)}`) ?? "Not reported"],
        ["Tourism's share of exports", latest(s.tourismShare, pct) ?? "Not reported", "Money spent by visitors, against everything the country sells abroad"],
      ),
      sites?.length ? section(`World Heritage Sites · ${sites.length}`, namedList(app, sites, { emoji: "🏛️" })) : "",
      note(`${WB_NOTE} World Heritage Sites from Wikidata.`),
    ];
  });
  return theme({ id: "tourism", label: "Tourism", icon: icons.suitcase, color, intro: "Places to stay and things to see around a place; how many visit a country, what they spend, and its World Heritage Sites.", subtabs: [here, country] });
}

// ---- Education -------------------------------------------------------------

function educationTheme(): Theme {
  const color = "#0a84ff";
  const here = streetTab("here", "Here", "education", color, (app, place, mine, street) => {
    const n = (...k: string[]) => mine.filter((s) => k.includes(s.tags.amenity ?? "")).length;
    const higher = mine.filter((s) => /^(university|college)$/.test(s.tags.amenity ?? ""));
    return [
      hero(String(n("school")), `schools ${within(street.radius)} of ${placeName(place)}`),
      counts(["Nurseries", n("kindergarten")], ["Colleges and universities", higher.length], ["Libraries", n("library")], ["Other schools (language, music, driving)", n("language_school", "music_school", "driving_school")]),
      higher.length ? section("Colleges and universities", spotList(app, higher, 6)) : "",
      mine.some((s) => s.tags.amenity === "school") ? section("Schools", spotList(app, mine.filter((s) => s.tags.amenity === "school"), 8)) : "",
      mine.some((s) => s.tags.amenity === "library") ? section("Libraries", spotList(app, mine.filter((s) => s.tags.amenity === "library"), 4)) : "",
      note(OSM_NOTE),
    ];
  });
  const country = countryTab("country", "Country", async (app, _p, c) => {
    const [s, unis] = await Promise.all([indicators(c.iso3, ["literacy", "secondary", "tertiary", "eduSpend", "pupilTeacher"]), soft(universitiesOf(c.iso3))]);
    return [
      hero(s.literacy.latest ? pct(s.literacy.latest.value) : s.tertiary.latest ? pct(s.tertiary.latest.value) : "—", s.literacy.latest ? "of adults can read and write" : "go on to university or college", `In ${theCountry(c)}${s.literacy.latest ? `, ${s.literacy.latest.year}` : ""}`),
      stats(
        ["In secondary school", latest(s.secondary, pct) ?? "Not reported", "Gross enrolment: can pass 100% when older or younger pupils are in the class"],
        ["Go on to university or college", latest(s.tertiary, pct) ?? "Not reported", "Gross enrolment in higher education"],
        ["Pupils per teacher (primary)", latest(s.pupilTeacher, (v) => v.toFixed(0)) ?? "Not reported"],
        ["Spent on education", latest(s.eduSpend, (v) => `${v.toFixed(1)}% of the economy`) ?? "Not reported"],
      ),
      trend(s.tertiary, "% in higher education", (v) => `${Math.round(v)}%`),
      unis?.length ? section(`Best-known universities in ${theCountry(c)}`, namedList(app, unis, { emoji: "🎓" })) : "",
      note(`${WB_NOTE} Universities from Wikidata, best known first.`),
    ];
  });
  return theme({ id: "education", label: "Education", icon: icons.graduate, color, intro: "Schools, colleges and libraries around a place; how well a country reads, how many study on, and its best-known universities.", subtabs: [here, country] });
}

// ---- Health ----------------------------------------------------------------

function healthTheme(): Theme {
  const color = "#ff453a";
  const here = streetTab("here", "Here", "health", color, (app, place, mine, street) => {
    const n = (k: string) => mine.filter((s) => s.tags.amenity === k).length;
    const nearest = h("div", {}, h("p", { class: "muted small" }, "Finding the nearest hospital…"));
    // The nearest hospital, even when it's beyond the streets read around.
    void hospitalsAround(place.lon, place.lat).then((list) => {
      const byKm = list.map((s) => ({ s, d: km(place, s) })).sort((a, b) => a.d - b.d);
      const best = byKm.find((x) => x.s.name) ?? byKm[0];
      nearest.replaceChildren(best
        ? h("div", { class: "list" }, h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: best.s.name ?? "Hospital", lon: best.s.lon, lat: best.s.lat, radius: 600 }) },
            h("span", { class: "story-mini-emoji" }, "🏥"),
            h("span", { class: "list-text" }, h("span", { class: "list-title" }, best.s.name ?? "Hospital"), h("span", { class: "list-sub" }, `${best.d < 1 ? `${Math.round(best.d * 1000)} m` : `${best.d.toFixed(1)} km`} away in a straight line${best.s.tags.emergency === "yes" ? " · emergency department" : ""}`)),
            h("span", { class: "chev", html: "&rsaquo;" })))
        : h("p", { class: "muted small" }, "No hospital mapped within 30 km."));
    }).catch(() => nearest.replaceChildren(h("p", { class: "muted small" }, "Couldn't look up hospitals just now.")));
    const care = mine.filter((s) => s.tags.amenity !== "pharmacy");
    return [
      section("Nearest hospital", nearest),
      counts(["Clinics", n("clinic")], ["Doctors", n("doctors")], ["Dentists", n("dentist")], ["Pharmacies", n("pharmacy")], ["Hospitals", n("hospital")]),
      care.length ? section(`Care ${within(street.radius)}`, spotList(app, care, 8)) : "",
      mine.some((s) => s.tags.amenity === "pharmacy") ? section("Pharmacies", spotList(app, mine.filter((s) => s.tags.amenity === "pharmacy"), 5)) : "",
      h("p", { class: "fineprint" }, "In an emergency, call your local emergency number. Opening hours and services aren't checked here."),
      note(OSM_NOTE),
    ];
  });
  const country = countryTab("country", "Country", async (_app, _p, c) => {
    const s = await indicators(c.iso3, ["lifeExpectancy", "infantMortality", "maternal", "healthSpend", "healthPerPerson", "outOfPocket", "doctors", "beds"]);
    return [
      hero(s.lifeExpectancy.latest ? `${s.lifeExpectancy.latest.value.toFixed(1)} years` : "—", `life expectancy in ${theCountry(c)}`, s.lifeExpectancy.latest ? String(s.lifeExpectancy.latest.year) : undefined),
      trend(s.lifeExpectancy, "Years", (v) => v.toFixed(0)),
      section("Care",
        stats(
          ["Doctors per 1,000 people", latest(s.doctors, (v) => v.toFixed(1)) ?? "Not reported"],
          ["Hospital beds per 1,000 people", latest(s.beds, (v) => v.toFixed(1)) ?? "Not reported"],
          ["Spent on health", latest(s.healthSpend, (v) => `${v.toFixed(1)}% of the economy`) ?? "Not reported"],
          ["Spent per person", latest(s.healthPerPerson, (v) => `$${compact(v)} a year`) ?? "Not reported"],
          ["Paid by patients themselves", latest(s.outOfPocket, pct) ?? "Not reported", "Out-of-pocket spending, as a share of all health spending"],
        )),
      section("Mothers and babies",
        stats(
          ["Babies who die before age 1", latest(s.infantMortality, (v) => `${v.toFixed(1)} in 1,000`) ?? "Not reported"],
          ["Mothers who die in childbirth", latest(s.maternal, (v) => `${Math.round(v)} in 100,000`) ?? "Not reported"],
        )),
      note(WB_NOTE),
    ];
  });
  return theme({ id: "health", label: "Health", icon: icons.medical, color, intro: "The nearest hospital, and the clinics, doctors and pharmacies around a place; how long people live in a country and the care they get.", subtabs: [here, country] });
}

export function topicThemes(): Theme[] {
  return [moneyTheme(), sportsTheme(), fashionTheme(), foodTheme(), artsTheme(), tourismTheme(), educationTheme(), healthTheme()];
}
