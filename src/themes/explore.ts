// Explore: the default mode. The card follows the map: what's in view and
// worth knowing, and one-touch map layers. Tapping a label or the ground
// opens a card about that feature or spot.
import type { App, Place, Subtab, Theme } from "../app";
import { distanceKm } from "../analysis/insights";
import { CATEGORIES, KIND_INFO, type PlaceKind } from "../analysis/placeKinds";
import { glyphFor } from "../ui/placeGlyphs";
import { countryAt } from "../data/countries";
import { elevation } from "../data/elevation";
import { reverseGeocode } from "../data/geocode";
import { forecast } from "../data/openmeteo";
import type { Quake } from "../data/quakes";
import { commonsThumb, notablePlaces, type Notable } from "../data/wikidata";
import { summary, summaryByName } from "../data/wikipedia";
import { weatherText } from "../analysis/climate";
import type { Feeds, LabelData } from "../explore/feeds";
import { insightsFor, type Insight } from "../explore/insights";
import { currentView } from "../explore/view";
import { OVERLAYS, type OverlayId, type Overlays } from "../globe/overlays";
import { formatElevation, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { action, asyncBlock, hero, note, section, stats } from "./common";

const INSIGHT_ICON: Record<Insight["icon"], string> = {
  aurora: icons.sparkle, sun: icons.sun, moon: icons.moon, plates: icons.plates, quake: icons.activity, heritage: icons.heritage, globe: icons.globe,
};
const OVERLAY_ICON: Record<OverlayId, string> = {
  labels: icons.tag, aurora: icons.sparkle, quakes: icons.activity, plates: icons.plates, lights: icons.moon, radar: icons.rain, species: icons.paw,
};

type FeatureData = LabelData | { type: "quake"; quake: Quake };

export function exploreTheme(app: App, feeds: Feeds, overlays: Overlays): Theme {
  let areaJob = 0;
  let category: string | null = null;
  let showAll = false;
  const setCategory = (id: string | null) => {
    category = id;
    showAll = false;
    app.labels?.setFilter(id ? CATEGORIES.find((c) => c.id === id)!.kinds : null);
  };

  const toggles = () => {
    const grid = h("div", { class: "toggle-grid" });
    const draw = () =>
      grid.replaceChildren(...OVERLAYS.map((o) =>
        h("button", { class: "toggle", "aria-pressed": String(overlays.isOn(o.id)), title: o.about, onclick: () => void overlays.toggle(o.id) },
          h("span", { class: "toggle-icon", html: OVERLAY_ICON[o.id] }), h("span", { class: "toggle-label" }, o.label))));
    draw();
    const off = overlays.subscribe(() => (grid.isConnected ? draw() : off()));
    return grid;
  };

  const insightCard = (i: Insight) =>
    h("div", { class: "insight" },
      h("span", { class: `insight-icon i-${i.icon}`, html: INSIGHT_ICON[i.icon] }),
      h("div", { class: "insight-text" },
        h("div", { class: "insight-title" }, i.title),
        h("div", { class: "insight-detail" }, i.detail),
        i.overlay && !overlays.isOn(i.overlay)
          ? h("button", { class: "link-btn", onclick: (e: Event) => { void overlays.set(i.overlay!, true); (e.currentTarget as HTMLElement).remove(); } }, `Show ${OVERLAYS.find((o) => o.id === i.overlay)?.label.toLowerCase()} on the map`)
          : ""));

  const notableRow = (n: Notable, from?: { lon: number; lat: number }) =>
    h("button", { class: "list-row", onclick: () => openNotable(n) },
      n.image
        ? h("img", { class: "thumb", src: commonsThumb(n.image, 96), alt: "", loading: "lazy" })
        : h("span", { class: "thumb glyph-thumb", style: `--c:${KIND_INFO[n.kind === "other" ? "landmark" : n.kind].color}`, html: glyphFor(n.kind === "other" ? "landmark" : n.kind) ?? "" }),
      h("span", { class: "list-text" },
        h("span", { class: "list-title" }, n.name, n.heritage ? h("span", { class: "pill heritage-pill" }, "World Heritage") : ""),
        h("span", { class: "list-sub" }, [n.description, from ? `${formatKm(distanceKm(from.lon, from.lat, n.lon, n.lat))}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" }));

  const openNotable = (n: Notable) => {
    void flyToPlace(app.globe, { name: n.name, lon: n.lon, lat: n.lat, radius: n.kind === "city" || n.kind === "district" ? 4000 : 900 });
    app.select({ lon: n.lon, lat: n.lat, height: 0 }, { title: n.name, context: n.description ?? KIND_INFO[n.kind].label }, { source: "notable", notable: n } satisfies LabelData);
  };

  /** The live "what's in view" card. */
  const renderEmpty = (app: App, body: HTMLElement) => {
    const insightsBox = h("div", { class: "insights" });
    const inView = h("div", { class: "in-view" });
    body.append(
      h("div", { class: "empty-hint compact" }, h("span", { class: "empty-icon", html: icons.compass }), h("span", {}, h("strong", {}, "Move the map to explore"), h("span", {}, "Labels appear as you zoom in. Tap one, or anywhere, to learn more."))),
      insightsBox,
      inView,
      section("Map layers", toggles()),
    );
    let insightJob = 0;
    const update = () => {
      if (!body.isConnected) { off(); return; }
      const v = feeds.view;
      // Area name for the header.
      const job = ++areaJob;
      if (v.zoom < 3) app.setHeader("Earth", "Zoom in anywhere to explore");
      else
        reverseGeocode(v.lon, v.lat, Math.max(3, Math.min(14, Math.round(v.zoom) + 1)))
          .then((n) => { if (job === areaJob && n) app.setHeader(n.title, n.context || "Exploring"); })
          .catch(() => {});
      // What's in view, filterable by category (the filter also applies to the map's labels).
      const places = feeds.notable.filter((n) => n.kind !== "district" && n.kind !== "city" && n.kind !== "capital");
      const inCat = (n: Notable, id: string) => CATEGORIES.find((c) => c.id === id)!.kinds.includes(n.kind);
      const cats = CATEGORIES.map((c) => ({ ...c, n: places.filter((p) => inCat(p, c.id)).length })).filter((c) => c.n > 0);
      if (category && !cats.some((c) => c.id === category)) setCategory(null);
      const shown = category ? places.filter((p) => inCat(p, category!)) : places;
      const top = shown.slice(0, showAll ? 30 : 8);
      const labels = places.length ? [] : app.labels?.shownLabels().slice(0, 8) ?? [];
      const chip = (id: string | null, label: string, n: number) =>
        h("button", { class: "chip", role: "radio", "aria-checked": String(category === id), onclick: () => { setCategory(id); update(); } }, `${label} ${n}`);
      inView.replaceChildren(
        places.length
          ? section("Worth knowing in view",
              cats.length > 1 ? h("div", { class: "chips", role: "radiogroup", "aria-label": "Filter by category" }, chip(null, "All", places.length), ...cats.map((c) => chip(c.id, c.label, c.n))) : "",
              h("div", { class: "list" }, ...top.map((n) => notableRow(n))),
              shown.length > top.length ? h("button", { class: "link-btn", onclick: () => { showAll = true; update(); } }, `Show ${Math.min(30, shown.length) - top.length} more`) : "")
          : labels.length
            ? section("In view", h("div", { class: "chips wrap" }, ...labels.map((l) => h("button", { class: "chip", onclick: () => app.labels?.onClick?.(l) }, l.name))))
            : "",
      );
      // Insights (slower: live data).
      const ij = ++insightJob;
      void insightsFor(v.lon, v.lat, v.radiusKm, feeds.notable).then((list) => {
        if (ij !== insightJob || !body.isConnected) return;
        insightsBox.replaceChildren(...(list.length ? [section("Worth knowing here", ...list.slice(0, 4).map(insightCard))] : []));
      });
    };
    const off = feeds.subscribe(update);
    update();
  };

  const featureCard = (place: Place, body: HTMLElement) => {
    const f = place.feature as FeatureData;
    if ("type" in f && f.type === "quake") return quakeCard(place, f.quake, body);
    const d = f as LabelData;
    const n = d.notable, w = d.world;
    const kind: PlaceKind = n ? (n.kind === "other" ? "landmark" : n.kind) : w ? w.kind : "water";
    const img = h("div", { class: "feature-img" });
    const text = h("div", { class: "feature-text" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading about it…"));
    body.append(
      img,
      h("div", { class: "badge-row" },
        h("span", { class: "badge", style: `--theme:${KIND_INFO[kind].color}` }, singular(kind, n?.types[0])),
        n?.heritage ? h("span", { class: "badge", style: "--theme:#bf5af2" }, "UNESCO World Heritage") : "",
        n && n.sitelinks >= 20 ? h("span", { class: "badge muted-badge" }, `Wikipedia in ${n.sitelinks} languages`) : "",
        w?.kind === "peak" && w.detail ? h("span", { class: "badge muted-badge" }, w.detail) : ""),
      text,
    );
    if (n?.image) img.append(h("img", { src: commonsThumb(n.image, 720), alt: n.name, loading: "lazy" }));
    const name = place.name?.title ?? "";
    const lookup = n?.article ? summary(n.article) : summaryByName(d.source === "river" || w?.kind === "water" ? [name, `${name} River`, `${name} (river)`] : [name]);
    lookup
      .then((s) => {
        if (!s) { text.replaceChildren(h("p", { class: "muted" }, n?.description ?? "No encyclopedia summary found.")); return; }
        if (!n?.image && s.thumbnail) img.append(h("img", { src: s.thumbnail, alt: s.title, loading: "lazy" }));
        text.replaceChildren(h("p", {}, s.extract), h("a", { class: "link-btn", href: s.url, target: "_blank", rel: "noopener" }, "Read more on Wikipedia"));
      })
      .catch(() => text.replaceChildren(h("p", { class: "muted" }, n?.description ?? "Couldn't load a summary.")));
    nearbyAndThemes(place, body, n?.id);
  };

  const quakeCard = (place: Place, q: Quake, body: HTMLElement) => {
    const hours = (Date.now() - q.time) / 3_600_000;
    body.append(
      hero(`M${q.mag.toFixed(1)}`, "earthquake", q.place),
      stats(
        ["When", hours < 24 ? `${Math.round(hours)} hours ago` : `${Math.round(hours / 24)} days ago`],
        ["Depth", `${Math.round(q.depthKm)} km`, "Shallow quakes (under 70 km) shake the surface hardest"],
        ["Strength", q.mag >= 7 ? "Major" : q.mag >= 6 ? "Strong" : q.mag >= 5 ? "Moderate" : q.mag >= 4 ? "Light" : "Minor"],
      ),
      h("a", { class: "btn", href: q.url, target: "_blank", rel: "noopener" }, "USGS event page"),
    );
    asyncBlock(app, body, "Checking the setting…", async () => {
      const list = await insightsFor(q.lon, q.lat, 50, []);
      const plate = list.find((i) => i.id === "plates");
      return plate ? [insightCard(plate)] : [];
    });
    nearbyAndThemes(place, body);
  };

  /** A plain spot on the map: quick facts from every theme, insights and what's nearby. */
  const placeCard = (place: Place, body: HTMLElement) => {
    asyncBlock(app, body, "Getting to know this place…", async () => {
      const [[z], country, weather] = await Promise.all([
        elevation.sample([[place.lon, place.lat]], 12).catch(() => [NaN]),
        countryAt(place.lon, place.lat).catch(() => null),
        forecast(place.lon, place.lat).catch(() => null),
      ]);
      const w = weather ? weatherText(weather.current.weather_code) : null;
      return [
        h("div", { class: "glance" },
          glance(icons.mountain, Number.isFinite(z) ? formatElevation(z) : "—", "Elevation", () => app.setTheme("land")),
          glance(icons.cloudSun, weather ? `${Math.round(weather.current.temperature_2m)}°` : "—", w ? w.text : "Weather", () => app.setTheme("climate")),
          glance(icons.flag, country?.name ?? "—", "Country", () => app.setTheme("countries"))),
      ];
    });
    asyncBlock(app, body, "Looking for things worth knowing…", async () => {
      const list = await insightsFor(place.lon, place.lat, 60, feeds.notable);
      return list.length ? [section("Worth knowing here", ...list.slice(0, 4).map(insightCard))] : [];
    });
    nearbyAndThemes(place, body);
  };

  const nearbyAndThemes = (place: Place, body: HTMLElement, exclude?: string) => {
    asyncBlock(app, body, "Finding what's nearby…", async () => {
      let pool = feeds.notable;
      if (!pool.length || currentView(app.globe.viewer).zoom < 9) {
        const d = 0.06;
        pool = await notablePlaces(place.lon - d, place.lat - d, place.lon + d, place.lat + d, 60).catch(() => []);
      }
      const near = pool
        .filter((n) => n.id !== exclude && n.kind !== "district" && distanceKm(place.lon, place.lat, n.lon, n.lat) < 5)
        .sort((a, b) => b.sitelinks - a.sitelinks)
        .slice(0, 6);
      return near.length ? [section("Nearby", h("div", { class: "list" }, ...near.map((n) => notableRow(n, place))))] : [];
    });
    body.append(
      section("See it through a theme",
        ...app.themes.filter((t) => t.id !== "explore").map((t) => action(t.label, () => app.setTheme(t.id), t.icon))),
      note("Places and descriptions from Wikidata and Wikipedia; importance is how many language editions write about a place."),
    );
  };

  const here: Subtab = {
    id: "here",
    label: "Here",
    render({ place, body }) {
      if (place.feature) featureCard(place, body);
      else placeCard(place, body);
    },
  };

  return {
    id: "explore",
    label: "Explore",
    icon: icons.compass,
    color: "#0a84ff",
    intro: "Move the map; tap anything to learn about it.",
    subtabs: [here],
    renderEmpty,
  };
}

function glance(icon: string, value: string, label: string, onclick: () => void): HTMLElement {
  return h("button", { class: "glance-tile", onclick }, h("span", { class: "glance-icon", html: icon }), h("span", { class: "glance-value" }, value), h("span", { class: "glance-label" }, label));
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

function singular(kind: PlaceKind, type?: string): string {
  if (type) return type.charAt(0).toUpperCase() + type.slice(1);
  const map: Partial<Record<PlaceKind, string>> = { water: "Water", sea: "Sea or ocean", peak: "Mountain", range: "Mountain range", desert: "Desert", city: "City", capital: "Capital city", region: "Region", continent: "Continent", nature: "Natural feature", park: "Park" };
  return map[kind] ?? KIND_INFO[kind].label;
}

