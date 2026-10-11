// Which satellite imagery the globe (and the pictures stitched from it) uses. Esri's World Imagery is the
// default and needs an Esri account and licence for a commercial product; MapTiler and Mapbox are drop-in
// alternatives, chosen with an environment setting and a key, so changing provider is configuration, not code
// (see docs/data-licensing.md).
import { config } from "../config";

export interface Imagery { id: "esri" | "maptiler" | "mapbox"; template: string; maximumLevel: number; credit: string }

/** The provider in use (pure given the settings). */
export function imagery(c: { imagery?: string; maptilerKey?: string; mapboxToken?: string; esriKey?: string } = config): Imagery {
  if (c.imagery === "maptiler" && c.maptilerKey)
    return { id: "maptiler", template: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(c.maptilerKey)}`, maximumLevel: 20, credit: "© MapTiler © OpenStreetMap contributors; imagery © MapTiler and its providers" };
  if (c.imagery === "mapbox" && c.mapboxToken)
    return { id: "mapbox", template: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${encodeURIComponent(c.mapboxToken)}`, maximumLevel: 21, credit: "© Mapbox © Maxar © OpenStreetMap contributors" };
  const token = c.esriKey ? `?token=${encodeURIComponent(c.esriKey)}` : "";
  return { id: "esri", template: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}${token}`, maximumLevel: 19, credit: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community" };
}

/** One tile's address (pure). */
export const imageryTile = (z: number, x: number, y: number, i: Imagery = imagery()) => i.template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/**
 * The rendered map: a calm drawn street map (ground, parks, water, roads) with the names on their own layer,
 * a day version and a night one, that the clay buildings stand on (docs/design.md › The map). CARTO's Voyager
 * and Dark Matter from OpenStreetMap by default; any other raster style is a setting away (VITE_RENDERED_TILES
 * and VITE_RENDERED_LABELS, with {dark} for "dark" or "light"), see docs/data-licensing.md.
 */
export interface RenderedMap { ground(dark: boolean): string; labels(dark: boolean): string; subdomains: string; maximumLevel: number; credit: string }

export function renderedMap(c: { renderedTiles?: string; renderedLabels?: string } = config): RenderedMap {
  const own = (t: string) => (dark: boolean) => t.replace("{dark}", dark ? "dark" : "light");
  if (c.renderedTiles)
    return { ground: own(c.renderedTiles), labels: own(c.renderedLabels || ""), subdomains: "abc", maximumLevel: 19, credit: "Map © OpenStreetMap contributors" };
  const carto = (style: string) => `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png`;
  return {
    ground: (dark) => carto(dark ? "dark_nolabels" : "voyager_nolabels"),
    labels: (dark) => carto(dark ? "dark_only_labels" : "voyager_only_labels"),
    subdomains: "abcd", maximumLevel: 19, credit: "Map © CARTO, © OpenStreetMap contributors",
  };
}
