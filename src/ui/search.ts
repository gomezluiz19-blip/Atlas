// The search box: addresses (Photon/Nominatim), anything pasted (coordinates,
// map links, plus codes), instant matches from what's on the map, and recents.
import { BoundingSphere, Cartesian3, HeadingPitchRange, Math as CesiumMath } from "cesium";
import { elevation } from "../data/elevation";
import type { Globe } from "../globe/viewer";
import { h } from "./dom";
import { icons } from "./icons";
import { decodePlusCode, formatCoordinates, parseLocation, recoverPlusCode } from "../data/locationParse";

export interface Place {
  name: string;
  detail?: string;
  lon: number;
  lat: number;
  /** Rough radius of the feature, metres, used to frame it. */
  radius: number;
}

export const FIELD_SITES: Place[] = [
  { name: "Grand Canyon", detail: "Arizona · river incision, stratigraphy", lon: -112.113, lat: 36.1, radius: 9000 },
  { name: "Yarlung Tsangpo Gorge", detail: "Tibet · one of Earth's deepest canyons", lon: 94.97, lat: 29.72, radius: 14000 },
  { name: "Mount St. Helens", detail: "Washington · 1980 lateral-blast crater", lon: -122.1944, lat: 46.1912, radius: 5000 },
  { name: "Þingvellir rift", detail: "Iceland · Mid-Atlantic Ridge on land", lon: -21.12, lat: 64.26, radius: 7000 },
  { name: "Carrizo Plain", detail: "California · San Andreas Fault", lon: -119.83, lat: 35.18, radius: 7000 },
  { name: "Mississippi River Delta", detail: "Louisiana · bird's-foot delta", lon: -89.3, lat: 29.2, radius: 40000 },
  { name: "Mount Everest", detail: "Nepal/China · Himalayan collision", lon: 86.925, lat: 27.9881, radius: 10000 },
  { name: "Lake Natron", detail: "Tanzania · East African Rift", lon: 36.0, lat: -2.4, radius: 30000 },
];

export async function flyToPlace(globe: Globe, place: Place) {
  let ground = 0;
  try {
    [ground] = await elevation.sample([[place.lon, place.lat]], 10);
  } catch {
    /* fly anyway */
  }
  const centre = Cartesian3.fromDegrees(place.lon, place.lat, Math.max(0, ground) * globe.state.exaggeration);
  globe.viewer.camera.flyToBoundingSphere(new BoundingSphere(centre, place.radius), {
    offset: new HeadingPitchRange(0, CesiumMath.toRadians(-32), place.radius * 2.6),
    duration: 2.5,
  });
}

export function fieldSiteButtons(globe: Globe, onPick?: (p: Place) => void): HTMLElement {
  return h(
    "div",
    { class: "sites" },
    ...FIELD_SITES.map((s) =>
      h("button", { class: "site", onclick: () => { void flyToPlace(globe, s); onPick?.(s); } }, h("span", { class: "site-name" }, s.name), h("span", { class: "site-detail" }, s.detail ?? "")),
    ),
  );
}

/** "36.1, -112.1" or "36.1 -112.1" → lat/lon, else null. */
export function parseCoordinates(q: string): { lat: number; lon: number } | null {
  const p = parseLocation(q);
  return p.kind === "point" ? { lat: p.lat, lon: p.lon } : null;
}

export interface SearchResult extends Place {
  icon?: keyof typeof icons;
  source: "coords" | "local" | "address" | "recent" | "site";
  /** False when the name is only coordinates, so the app should look up a real place name. */
  named?: boolean;
}

/** Radius (m) to frame a result of a given OSM type. */
function radiusForType(key: string, value: string, type?: string): number {
  if (type === "house" || key === "building" || value === "house") return 250;
  if (type === "street" || key === "highway") return 700;
  if (key === "amenity" || key === "shop" || key === "tourism" || key === "leisure") return 600;
  if (type === "district" || type === "locality" || value === "suburb" || value === "neighbourhood") return 3000;
  if (value === "city" || type === "city") return 15000;
  if (value === "town" || value === "village") return 5000;
  if (type === "county") return 40000;
  if (type === "state") return 300000;
  if (type === "country") return 900000;
  return 2000;
}

function iconForType(key: string, value: string, type?: string): keyof typeof icons {
  if (type === "house" || type === "street" || key === "highway" || key === "building") return "home";
  if (key === "natural" || key === "waterway" || key === "water") return value === "peak" || value === "volcano" ? "mountain" : "drop";
  if (value === "city" || value === "town" || value === "village" || type === "city") return "building";
  if (type === "country" || type === "state") return "flag";
  return "target";
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; housenumber?: string; street?: string; postcode?: string; city?: string; district?: string;
    county?: string; state?: string; country?: string; osm_key?: string; osm_value?: string; type?: string;
    extent?: [number, number, number, number];
  };
}

/** As-you-type address and place search (Photon, built on OpenStreetMap). */
async function photon(q: string, bias: { lat: number; lon: number } | null, signal: AbortSignal): Promise<SearchResult[]> {
  let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`;
  if (bias) url += `&lat=${bias.lat.toFixed(3)}&lon=${bias.lon.toFixed(3)}&location_bias_scale=0.3`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const body = (await res.json()) as { features: PhotonFeature[] };
  return body.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name ?? (street || p.city || p.country || "Unnamed place");
    const detail = [p.name && street ? street : "", p.district, p.city !== name ? p.city : "", p.state, p.country].filter(Boolean).join(", ");
    let radius = radiusForType(p.osm_key ?? "", p.osm_value ?? "", p.type);
    if (p.extent) {
      const [w, n, e, s] = p.extent;
      radius = Math.max(radius / 2, Math.min(2_000_000, (Math.hypot(n - s, (e - w) * Math.cos((lat * Math.PI) / 180)) * 111_000) / 2));
    }
    return { name, detail, lon, lat, radius, icon: iconForType(p.osm_key ?? "", p.osm_value ?? "", p.type), source: "address" as const };
  });
}

/** One-off search (Nominatim), used as a fallback when Photon is unavailable. */
async function nominatim(q: string, signal: AbortSignal): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { "Accept-Language": navigator.language } });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string; boundingbox: string[]; type: string }[];
  return rows.map((r) => {
    const [s, n, w, e] = r.boundingbox.map(Number);
    const radius = Math.max(250, Math.min(2_000_000, (Math.hypot(n - s, (e - w) * Math.cos((Number(r.lat) * Math.PI) / 180)) * 111_000) / 2));
    const [name, ...rest] = r.display_name.split(", ");
    return { name, detail: rest.slice(-3).join(", "), lon: Number(r.lon), lat: Number(r.lat), radius, icon: "target" as const, source: "address" as const };
  });
}

const RECENT_KEY = "atlas.recent-searches";
function loadRecent(): SearchResult[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as SearchResult[]).slice(0, 6).map((r) => ({ ...r, source: "recent" as const }));
  } catch {
    return [];
  }
}
function saveRecent(p: SearchResult) {
  try {
    const list = loadRecent().filter((r) => !(r.name === p.name && Math.abs(r.lat - p.lat) < 1e-4));
    list.unshift({ ...p, source: "recent" });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}

export interface SearchOptions {
  /** Instant matches from data already on the device (labels, curated places). */
  local?: (q: string) => SearchResult[];
  /** Bias address results toward what's on screen. */
  bias?: () => { lat: number; lon: number } | null;
  onPick?: (p: SearchResult) => void;
}

export function createSearch(globe: Globe, opts: SearchOptions = {}): HTMLElement {
  const input = h("input", {
    id: "search-input",
    type: "search",
    placeholder: "Search places, addresses or coordinates",
    "aria-label": "Search places, addresses, coordinates or map links",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "search",
  });
  const list = h("div", { class: "search-results", role: "listbox", hidden: true });
  const root = h("div", { class: "search" }, h("span", { class: "search-icon", html: icons.search }), input, list);
  let controller: AbortController | null = null;
  let timer = 0;
  let items: SearchResult[] = [];
  let active = -1;

  const pick = (p: SearchResult) => {
    list.hidden = true;
    input.value = p.name;
    input.blur();
    if (p.source !== "coords") saveRecent(p);
    void flyToPlace(globe, p);
    opts.onPick?.(p);
  };

  const render = (groups: { heading?: string; items: SearchResult[] }[], note?: string) => {
    items = groups.flatMap((g) => g.items);
    active = items.length ? 0 : -1;
    let k = 0;
    list.replaceChildren(
      ...groups.flatMap((g) => [
        ...(g.heading && g.items.length ? [h("div", { class: "search-heading" }, g.heading)] : []),
        ...g.items.map((p) => {
          const i = k++;
          return h(
            "button",
            {
              class: "search-item",
              role: "option",
              id: `sr-${i}`,
              "aria-selected": String(i === active),
              onmousedown: (e: Event) => e.preventDefault(),
              onclick: () => pick(p),
            },
            h("span", { class: "search-item-icon", html: icons[p.icon ?? (p.source === "recent" ? "search" : "target")] }),
            h("span", { class: "search-item-text" }, h("span", { class: "site-name" }, p.name), p.detail ? h("span", { class: "site-detail" }, p.detail) : ""),
          );
        }),
      ]),
      ...(note ? [h("div", { class: "search-note" }, note)] : []),
    );
    list.hidden = items.length === 0 && !note;
  };

  const highlight = (i: number) => {
    active = (i + items.length) % items.length;
    list.querySelectorAll(".search-item").forEach((el, k) => el.setAttribute("aria-selected", String(k === active)));
    list.querySelector(`#sr-${active}`)?.scrollIntoView({ block: "nearest" });
  };

  const update = () => {
    const raw = input.value;
    const q = raw.trim();
    controller?.abort();
    clearTimeout(timer);
    if (!q) {
      render([{ heading: "Recent", items: loadRecent() }, { heading: "Places to start", items: FIELD_SITES.map((s) => ({ ...s, source: "site" as const, icon: "mountain" as const })) }]);
      return;
    }
    const parsed = parseLocation(raw);
    if (parsed.kind === "point") {
      const label = parsed.label ?? formatCoordinates(parsed.lat, parsed.lon);
      const radius = parsed.zoom ? Math.max(150, 40_000_000 / 2 ** parsed.zoom / 2) : 1500;
      render([{ items: [{ name: label, detail: parsed.label ? formatCoordinates(parsed.lat, parsed.lon) : `Go to these coordinates (${parsed.source === "coordinates" ? "pasted" : parsed.source === "pluscode" ? "plus code" : `${parsed.source} link`})`, lat: parsed.lat, lon: parsed.lon, radius, icon: "target", source: "coords", named: Boolean(parsed.label) }] }]);
      return;
    }
    if (!parsed.text && !parsed.shortCode) {
      render([], "Short links like maps.app.goo.gl can't be opened here. Open the link, then copy the full address from your browser's address bar.");
      return;
    }
    const local = parsed.shortCode ? [] : opts.local?.(parsed.text) ?? [];
    render([{ heading: local.length ? "On the map" : undefined, items: local.slice(0, 4) }], "Searching…");
    timer = window.setTimeout(async () => {
      controller = new AbortController();
      const signal = controller.signal;
      try {
        let results: SearchResult[];
        try {
          results = await photon(parsed.text, opts.bias?.() ?? null, signal);
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
          results = await nominatim(parsed.text, signal);
        }
        if (parsed.shortCode && results[0]) {
          const full = recoverPlusCode(parsed.shortCode, results[0].lat, results[0].lon);
          const c = decodePlusCode(full);
          results = [{ name: `${parsed.shortCode} ${parsed.text}`.trim(), detail: `Plus code ${full}`, lat: c.lat, lon: c.lon, radius: 300, icon: "target", source: "coords" }];
        }
        const seen = new Set(local.map((l) => l.name.toLowerCase()));
        const addresses = results.filter((r) => !seen.has(r.name.toLowerCase()));
        render(
          [{ heading: local.length ? "On the map" : undefined, items: local.slice(0, 4) }, { heading: local.length ? "Places and addresses" : undefined, items: addresses }],
          local.length + addresses.length ? undefined : "No matches. Try adding a town or country.",
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") render([{ items: local }], "Address search is unavailable right now.");
      }
    }, 220);
  };

  input.addEventListener("input", update);
  input.addEventListener("focus", () => { input.select(); update(); });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); highlight(active + 1); }
    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); highlight(active - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) pick(items[active]);
      else if (input.value.trim()) update();
    } else if (e.key === "Escape") input.blur();
  });
  // "/" focuses search from anywhere, like many map apps.
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      input.focus();
    }
  });
  return root;
}
