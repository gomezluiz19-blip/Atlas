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
 * The drawn map: streets, buildings, parks, water and names, a day version and a night one, that the clay buildings
 * stand on (docs/design.md › The map). Esri's World Street Map by day (street-by-street detail to zoom 19, names
 * included) and its Dark Gray Canvas with its names by night, from the same servers as the satellite imagery. (CARTO
 * was the default until its tiles started answering "API key required" at street level.) Any other raster style is a
 * setting away (VITE_RENDERED_TILES and VITE_RENDERED_LABELS, with {dark} for "dark" or "light"); with a Google key,
 * Google's roadmap takes over (globe/basemap.ts).
 */
export interface RenderedMap {
  ground(dark: boolean): string; labels(dark: boolean): string; subdomains: string;
  /** The deepest zoom the provider really draws, by day and by night (past it the globe enlarges the last tiles). */
  maximumLevel: number; darkMaximumLevel?: number;
  credit: string;
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export function renderedMap(c: { renderedTiles?: string; renderedLabels?: string; esriKey?: string } = config): RenderedMap {
  const own = (t: string) => (dark: boolean) => t.replace("{dark}", dark ? "dark" : "light");
  if (c.renderedTiles)
    return { ground: own(c.renderedTiles), labels: own(c.renderedLabels || ""), subdomains: "abc", maximumLevel: 19, credit: "Map © OpenStreetMap contributors" };
  const token = c.esriKey ? `?token=${encodeURIComponent(c.esriKey)}` : "";
  const esri = (service: string) => `${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}${token}`;
  return {
    ground: (dark) => esri(dark ? "Canvas/World_Dark_Gray_Base" : "World_Street_Map"),
    // The street map carries its own names; the dark canvas keeps them on a layer of their own.
    labels: (dark) => (dark ? esri("Canvas/World_Dark_Gray_Reference") : ""),
    // The dark canvas stops at 16; asking deeper gets Esri's "Map data not yet available" picture.
    subdomains: "abc", maximumLevel: 19, darkMaximumLevel: 16, credit: "Map: Esri, HERE, Garmin, USGS, © OpenStreetMap contributors",
  };
}
