// Place pages as real web pages, written at build time: p/<address>/index.html
// for every named place, each with its own title, description, structured
// data and readable content (for search engines, link previews and anyone
// without JavaScript), and the whole app, which opens straight onto the place.
// Pure: the Vite build plugin supplies the files.
import type { Feature } from "../content/features";
import { assignSlugs, type PlaceEntry } from "./slug";

export type LabelRow = [string, number, number, string, number, number, string];

const KIND_WORD: Record<string, string> = {
  city: "town or city", capital: "capital city", district: "district", water: "lake or body of water", sea: "sea", island: "island", peak: "mountain",
  range: "mountain range", desert: "desert", region: "region", continent: "continent", glacier: "glacier", nature: "natural feature", park: "park",
  waterfall: "waterfall", volcano: "volcano", river: "river", lake: "lake", deep: "ocean deep", crater: "impact crater", forest: "forest", metro: "metro system", canyon: "canyon",
};
const SCHEMA: Record<string, string> = {
  city: "City", capital: "City", peak: "Mountain", volcano: "Mountain", range: "Mountain", continent: "Continent", sea: "SeaBodyOfWater",
  river: "RiverBodyOfWater", lake: "LakeBodyOfWater", water: "BodyOfWater", deep: "BodyOfWater", waterfall: "Waterfall", park: "Park",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface PageData {
  slug: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  description: string;
  facts: [string, string][];
  nearby: { slug: string; name: string }[];
}

/** All the places with pages, and what each page says. */
export function pagesFor(features: Feature[], world: LabelRow[], detail: LabelRow[]): PageData[] {
  const entries: PlaceEntry[] = [
    ...features.map((f, i): PlaceEntry => ({ name: f.name, lon: f.lon, lat: f.lat, kind: f.kind, rank: 1000, source: "feature", i })),
    ...world.map((w, i): PlaceEntry => ({ name: w[0], lon: w[1], lat: w[2], kind: w[3], rank: w[5], detail: w[6], source: "world", i })),
    ...detail.map((w, i): PlaceEntry => ({ name: w[0], lon: w[1], lat: w[2], kind: w[3], rank: w[5], detail: w[6], source: "detail", i })),
  ];
  const bySlug = assignSlugs(entries);
  // A coarse grid, so "nearby" is quick for 12,000 places.
  const grid = new Map<string, [string, PlaceEntry][]>();
  const cell = (lon: number, lat: number) => `${Math.floor(lon)}|${Math.floor(lat)}`;
  for (const [s, e] of bySlug) grid.set(cell(e.lon, e.lat), [...(grid.get(cell(e.lon, e.lat)) ?? []), [s, e]]);
  const near = (slug: string, e: PlaceEntry) => {
    const out: [number, string, string][] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const [s, o] of grid.get(cell(e.lon + dx, e.lat + dy)) ?? []) if (s !== slug) out.push([Math.hypot((o.lon - e.lon) * Math.cos((e.lat * Math.PI) / 180), o.lat - e.lat), s, o.name]);
    return out.sort((a, b) => a[0] - b[0]).slice(0, 6).map(([, s, name]) => ({ slug: s, name }));
  };
  return [...bySlug].map(([slug, e]): PageData => {
    const word = KIND_WORD[e.kind] ?? "place";
    if (e.source === "feature") {
      const f = features[e.i];
      return { slug, name: f.name, kind: f.kind, lon: f.lon, lat: f.lat, description: f.blurb || `${f.name} is a ${word}.`, facts: f.facts, nearby: near(slug, e) };
    }
    const where = e.detail && e.detail !== e.kind ? e.detail : "";
    const article = /^[aeiou]/.test(word) ? "an" : "a";
    return { slug, name: e.name, kind: e.kind, lon: e.lon, lat: e.lat, description: `${e.name} is ${article} ${word}${where ? ` in ${where}` : ""}.`, facts: [], nearby: near(slug, e) };
  });
}

const coord = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

/** One place's page: the built app's HTML with the place's own head and content. */
export function renderPage(appHtml: string, p: PageData, site = ""): string {
  const word = KIND_WORD[p.kind] ?? "place";
  const title = `${p.name}: ${word} · Terreno`;
  const promise = "Its ground, climate, people, how to get there, hazards and stories, all on one page and on a 3D globe.";
  const desc = `${p.description} ${promise}`.slice(0, 300);
  const url = site ? `${site}p/${p.slug}/` : "";
  const ld = { "@context": "https://schema.org", "@type": SCHEMA[p.kind] ?? "Place", name: p.name, description: p.description, geo: { "@type": "GeoCoordinates", latitude: +p.lat.toFixed(5), longitude: +p.lon.toFixed(5) }, ...(url ? { url } : {}) };
  const head = [
    `<base href="../../" />`,
    `<link rel="stylesheet" href="./page.css" />`,
    url ? `<link rel="canonical" href="${esc(url)}" />` : "",
    `<meta property="og:title" content="${esc(`${p.name} · Terreno`)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    url ? `<meta property="og:url" content="${esc(url)}" />` : "",
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    `<script>window.ATLAS_PAGE=${JSON.stringify(p.slug)}</script>`,
  ].filter(Boolean).join("\n    ");
  const article = `<article class="seo-page">
      <p class="seo-kicker">Terreno · ${esc(word)}</p>
      <h1>${esc(p.name)}</h1>
      <p>${esc(p.description)}</p>
      ${p.facts.length ? `<dl>${p.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      <p>${coord(p.lat, p.lon)}</p>
      <p>${esc(promise)}</p>
      ${p.nearby.length ? `<nav><h2>Nearby on Terreno</h2><ul>${p.nearby.map((n) => `<li><a href="./p/${n.slug}/">${esc(n.name)}</a></li>`).join("")}</ul></nav>` : ""}
      <p><a href="./#/p/${p.slug}">Open ${esc(p.name)} in Terreno</a></p>
    </article>`;
  return appHtml
    .replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    ${head}`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<body>/, `<body>\n    ${article}`);
}

/** sitemap.xml for the front page and every place page. */
export function sitemap(site: string, slugs: string[]): string {
  const urls = [site, ...slugs.map((s) => `${site}p/${s}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
}
