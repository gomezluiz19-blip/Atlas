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
