// Builds the People data from Natural Earth:
//   public/data/population.json  [lon, lat, population] for every populated place, largest first
//   src/content/iso3.json         ISO 3166 numeric → alpha-3, for the map's country shapes
// Usage: node scripts/build-people.mjs <folder with ne_10m_populated_places_simple.geojson,
//   ne_10m_admin_0_countries.geojson and ne_110m_admin_0_countries.geojson>
// (from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-people.mjs <source folder>");
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8")).features;

const pts = load("ne_10m_populated_places_simple.geojson")
  .filter((f) => (f.properties.pop_max ?? 0) > 0)
  .map((f) => [Math.round(f.geometry.coordinates[0] * 100) / 100, Math.round(f.geometry.coordinates[1] * 100) / 100, Math.round(f.properties.pop_max)])
  .sort((a, b) => b[2] - a[2]);
writeFileSync("public/data/population.json", JSON.stringify(pts));

const good = (v) => v && v !== "-99";
const codes = {};
for (const f of [...load("ne_10m_admin_0_countries.geojson"), ...load("ne_110m_admin_0_countries.geojson")]) {
  const p = f.properties;
  const a3 = good(p.ISO_A3) ? p.ISO_A3 : good(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3;
  for (const k of ["ISO_N3", "ISO_N3_EH"]) if (good(String(p[k] ?? ""))) codes[String(p[k]).padStart(3, "0")] ??= a3;
}
const atlas = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
const ids = atlas.objects.countries.geometries.map((g) => g.id).filter(Boolean);
writeFileSync("src/content/iso3.json", JSON.stringify(Object.fromEntries(ids.filter((i) => codes[i]).map((i) => [i, codes[i]]))));
console.log(`${pts.length} places; ${ids.filter((i) => codes[i]).length} of ${ids.length} country shapes coded`);
