// Making sure there is always a map. With a Google Maps Platform key (VITE_GOOGLE_MAPS_API_KEY, the Map Tiles API)
// the drawn map is Google's own roadmap, styled in Terreno's paper by day and slate by night, the satellite view is
// Google's imagery with its road and place names over it, and the city is Google's photorealistic 3D. Without a key,
// or if Google refuses it, the drawn map is Esri's street map (or the one configured) and the photographs Esri's;
// and if a provider's street-level tiles don't come back, or come back as a blank "API key required" picture,
// OpenStreetMap's own tiles stand in, so nobody ever sees an empty globe or a provider's message where the map
// should be (docs/data-licensing.md).

/** Google's map style for the paper day map: warm ground, quiet roads, muted names, no shop clutter. */
export const PAPER_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#ece8e1" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5f5a52" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f6f2ec" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#b9b1a4" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e4ded4" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e8e4da" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ saturation: -60 }, { lightness: 15 }] },
  { featureType: "poi.business", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d3e0c2" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#ddd6ca" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f6e8d8" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d9b99a" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ saturation: -80 }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#c9bfb1" }] },
  { featureType: "transit.station", elementType: "labels.icon", stylers: [{ saturation: -40 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#b7d0da" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5d7f8c" }] },
];

/** The same map at night: slate ground, soft roads, readable names. */
export const SLATE_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#151a20" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#97a2ae" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#151a20" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#39424d" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#1a2027" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ saturation: -70 }, { lightness: -20 }] },
  { featureType: "poi.business", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#18241d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#262e37" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1d242c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a2f29" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ saturation: -80 }, { lightness: -20 }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#2f3741" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1822" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4f6b7c" }] },
];

/** The language and region Google draws names in, from the browser (pure). */
export function googleLocale(lang = typeof navigator === "undefined" ? "en-US" : navigator.language): { language: string; region: string } {
  const m = /^([a-z]{2,3})(?:[-_]([A-Za-z]{2}))?/i.exec(lang ?? "");
  const language = m ? `${m[1].toLowerCase()}${m[2] ? `-${m[2].toUpperCase()}` : ""}` : "en-US";
  return { language, region: m?.[2]?.toUpperCase() ?? "US" };
}

export type GoogleLayer = "day" | "night" | "photos" | "names";

/**
 * What to ask Google for when opening a tile session (pure): the map type, the house style, and on sharp screens
 * tiles drawn at twice the scale (512 px, names at a readable size) so the map is crisp rather than enlarged.
 */
export function googleSessionBody(layer: GoogleLayer, dpr: number, loc: { language: string; region: string }): Record<string, unknown> {
  const sharp = dpr >= 1.5 ? { scale: "scaleFactor2x", highDpi: true } : {};
  switch (layer) {
    case "day": return { mapType: "roadmap", ...loc, styles: PAPER_STYLES, ...sharp };
    case "night": return { mapType: "roadmap", ...loc, styles: SLATE_STYLES, ...sharp };
    case "photos": return { mapType: "satellite", ...loc, ...(dpr >= 1.5 ? { highDpi: true } : {}) };
    case "names": return { mapType: "satellite", overlay: true, layerTypes: ["layerRoadmap"], ...loc, ...sharp };
  }
}

/** OpenStreetMap's own tiles: the stand-in when nothing else answers. */
export const OSM_FALLBACK = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maximumLevel: 19, credit: "Map © OpenStreetMap contributors" };

/**
 * One real street-level tile's address from a template, for a quick check (pure): lower Manhattan at zoom 15, where
 * every provider has streets, because some answer the whole-world zooms and only fail (or send a "key required"
 * picture) once you come down to the streets.
 */
export const sampleTile = (template: string, subdomains = "abc") =>
  template.replace("{s}", subdomains[0] ?? "a").replace("{z}", "15").replace("{x}", "9650").replace("{y}", "12318").replace("{dark}", "light");

/**
 * Whether a tile's pixels look like a map rather than a provider's message: a "key required" or "not available"
 * picture is nearly all one pale colour with a line of text; a street-level map tile never is (pure, on RGBA bytes).
 */
export function looksLikeMap(rgba: Uint8ClampedArray): boolean {
  let pale = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 10) continue;
    n++;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r > 225 && g > 225 && b > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 12) pale++;
  }
  // A see-through overlay (names over the photographs) with little on it is still fine.
  if (n < rgba.length / 4 / 20) return true;
  return pale / n < 0.9;
}

/**
 * Whether a tile source actually answers with a picture: one tile, a few seconds, an image back. A refused key
 * comes back as an error status or JSON; a missing service doesn't come back at all.
 */
export async function tileWorks(template: string, subdomains?: string, ms = 6000): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(sampleTile(template, subdomains), { signal: ctl.signal, mode: "cors" });
    if (!res.ok || !/^image\//.test(res.headers.get("content-type") ?? "image/")) return false;
    // Look at the picture itself, where the browser can: a blank page with a message isn't a map.
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return true;
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(32, 32), g = c.getContext("2d");
    if (!g) return true;
    g.drawImage(bmp, 0, 0, 32, 32);
    return looksLikeMap(g.getImageData(0, 0, 32, 32).data);
  } catch { return false; } finally { clearTimeout(t); }
}
