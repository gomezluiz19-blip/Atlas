// Place search (OpenStreetMap Nominatim), coordinate entry, and curated field sites.
import { BoundingSphere, Cartesian3, HeadingPitchRange, Math as CesiumMath } from "cesium";
import { elevation } from "../data/elevation";
import type { Globe } from "../globe/viewer";
import { h } from "./dom";
import { icons } from "./icons";

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

export function fieldSiteButtons(globe: Globe): HTMLElement {
  return h(
    "div",
    { class: "sites" },
    ...FIELD_SITES.map((s) =>
      h("button", { class: "site", onclick: () => void flyToPlace(globe, s) }, h("span", { class: "site-name" }, s.name), h("span", { class: "site-detail" }, s.detail ?? "")),
    ),
  );
}

/** "36.1, -112.1" or "36.1 -112.1" → lat/lon, else null. */
export function parseCoordinates(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function geocode(q: string, signal: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { "Accept-Language": navigator.language } });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string; boundingbox: string[]; type: string }[];
  return rows.map((r) => {
    const [s, n, w, e] = r.boundingbox.map(Number);
    const radius = Math.max(1500, Math.min(2_000_000, (Math.hypot(n - s, (e - w) * Math.cos((Number(r.lat) * Math.PI) / 180)) * 111_000) / 2));
    const [name, ...rest] = r.display_name.split(", ");
    return { name, detail: rest.slice(-3).join(", "), lon: Number(r.lon), lat: Number(r.lat), radius };
  });
}

export function createSearch(globe: Globe): HTMLElement {
  const input = h("input", {
    type: "search",
    placeholder: "Search places or enter lat, lon",
    "aria-label": "Search places",
    autocomplete: "off",
    spellcheck: "false",
  });
  const list = h("div", { class: "search-results", role: "listbox", hidden: true });
  const root = h("div", { class: "search" }, h("span", { class: "search-icon", html: icons.search }), input, list);
  let controller: AbortController | null = null;
  let timer = 0;

  const showPlaces = (places: Place[], heading?: string) => {
    list.replaceChildren(
      ...(heading ? [h("div", { class: "search-heading" }, heading)] : []),
      ...places.map((p) =>
        h(
          "button",
          {
            class: "search-item",
            role: "option",
            onmousedown: (e: Event) => e.preventDefault(),
            onclick: () => {
              list.hidden = true;
              input.value = p.name;
              input.blur();
              void flyToPlace(globe, p);
            },
          },
          h("span", { class: "site-name" }, p.name),
          h("span", { class: "site-detail" }, p.detail ?? ""),
        ),
      ),
    );
    list.hidden = places.length === 0 && !heading;
  };

  const update = () => {
    const q = input.value.trim();
    controller?.abort();
    clearTimeout(timer);
    if (!q) return showPlaces(FIELD_SITES, "Field sites");
    const coords = parseCoordinates(q);
    if (coords) return showPlaces([{ name: `${coords.lat}, ${coords.lon}`, detail: "Go to coordinates", ...coords, radius: 4000 }]);
    timer = window.setTimeout(async () => {
      controller = new AbortController();
      try {
        const places = await geocode(q, controller.signal);
        showPlaces(places, places.length ? undefined : "No matches");
      } catch (err) {
        if ((err as Error).name !== "AbortError") showPlaces([], "Search is unavailable right now");
      }
    }, 300);
  };

  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (list.querySelector(".search-item") as HTMLButtonElement | null)?.click();
    if (e.key === "Escape") input.blur();
  });
  return root;
}
