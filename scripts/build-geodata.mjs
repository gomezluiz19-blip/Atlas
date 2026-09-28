// Builds the compact world-scale label and plate-boundary files in public/data
// from Natural Earth (public domain) and Bird (2003) PB2002 plate boundaries.
//   node scripts/build-geodata.mjs <folder with the downloaded GeoJSON files>
// Sources:
//   https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//   https://github.com/fraxen/tectonicplates (PB2002_boundaries.json, PB2002_plates.json)
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-geodata.mjs <source folder>");
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8")).features;
const r = (v) => Math.round(v * 1000) / 1000;

/** Area-weighted centroid of a polygon's largest outer ring. */
function labelPoint(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : ring[0]; }
  }
  return best;
}

// [name, lon, lat, kind, minZoom, rank, detail]
const labels = [];
const add = (name, lon, lat, kind, minZoom, rank, detail = "") => {
  if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
  labels.push([name, r(lon), r(lat), kind, Math.round(minZoom * 10) / 10, Math.round(rank), detail]);
};

const REGION_KIND = (cls) => cls === "continent" ? "continent"
  : /range|mtn|mountain|foothills/.test(cls) ? "range"
  : /desert/.test(cls) ? "desert"
  : /island/.test(cls) ? "island"
  : /delta|wetland|tundra|gorge|valley/.test(cls) ? "nature"
  : "region";
for (const f of load("ne_10m_geography_regions_polys.geojson")) {
  const p = f.properties, cls = String(p.FEATURECLA).toLowerCase();
  const [lon, lat] = labelPoint(f.geometry);
  add(p.NAME_EN ?? p.NAME, lon, lat, REGION_KIND(cls), p.MIN_LABEL ?? 3, 240 - (p.SCALERANK ?? 5) * 20, cls);
}
for (const f of load("ne_10m_geography_marine_polys.geojson")) {
  const p = f.properties;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name_en ?? p.name, lon, lat, "sea", p.min_label ?? 3, 250 - (p.scalerank ?? 5) * 20, p.featurecla);
}
for (const f of load("ne_10m_geography_regions_points.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const cls = String(p.featurecla);
  add(p.name_en ?? p.name, lon, lat, cls === "waterfall" ? "waterfall" : /island/.test(cls) ? "island" : "nature", p.min_zoom ?? 5, 200 - (p.scalerank ?? 5) * 15, cls);
}
for (const f of load("ne_10m_geography_regions_elevation_points.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const kind = p.featurecla === "mountain" || p.featurecla === "spot elevation" ? "peak" : "nature";
  add(p.name_en ?? p.name, lon, lat, kind, p.min_zoom ?? 7, 60 + (p.elevation ?? 0) / 60, p.elevation ? `${p.elevation} m` : p.featurecla);
}
for (const f of load("ne_50m_lakes.geojson")) {
  const p = f.properties;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name_en ?? p.name, lon, lat, "water", p.min_label ?? p.min_zoom ?? 4, 190 - (p.scalerank ?? 5) * 15, "lake");
}
for (const f of load("ne_10m_glaciated_areas.geojson")) {
  const p = f.properties;
  if (!p.name) continue;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name, lon, lat, "glacier", Math.max(4, p.min_zoom ?? 5), 170 - (p.scalerank ?? 5) * 10, "ice field");
}
for (const f of load("ne_10m_playas.geojson")) {
  const p = f.properties;
  if (!p.name) continue;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name_en ?? p.name, lon, lat, "desert", Math.max(5, p.min_zoom ?? 6), 150 - (p.scalerank ?? 5) * 10, "salt flat");
}
const bigCities = new Set();
for (const f of load("ne_50m_populated_places_simple.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const capital = /capital/i.test(p.featurecla) && !/admin-1/i.test(p.featurecla);
  bigCities.add(`${p.name}|${Math.round(lat)}|${Math.round(lon)}`);
  add(p.name, lon, lat, capital ? "capital" : "city", p.min_zoom ?? 5, 40 + Math.log10(Math.max(1000, p.pop_max ?? 1000)) * 20 + (capital ? 30 : 0), p.adm0name);
}

// Detail, loaded when people zoom in: towns, lakes and reservoirs, national parks.
const worldCount = labels.length;
for (const f of load("ne_10m_populated_places_simple.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  if (bigCities.has(`${p.name}|${Math.round(lat)}|${Math.round(lon)}`)) continue;
  const capital = /capital/i.test(p.featurecla) && !/admin-1/i.test(p.featurecla);
  add(p.name, lon, lat, capital ? "capital" : "city", Math.max(5, p.min_zoom ?? 6), 30 + Math.log10(Math.max(1000, p.pop_max ?? 1000)) * 20 + (capital ? 30 : 0), [p.adm1name, p.adm0name].filter(Boolean).join(", "));
}
const seenLakes = new Set(labels.filter((l) => l[3] === "water").map((l) => l[0]));
for (const file of ["ne_10m_lakes.geojson", "ne_10m_lakes_north_america.geojson", "ne_10m_lakes_europe.geojson"]) {
  for (const f of load(file)) {
    const p = f.properties, name = p.name_en ?? p.name;
    if (!name || seenLakes.has(name)) continue;
    seenLakes.add(name);
    const [lon, lat] = labelPoint(f.geometry);
    add(name, lon, lat, "water", Math.max(5, p.min_label ?? p.min_zoom ?? 6), 150 - (p.scalerank ?? 6) * 10, String(p.featurecla ?? "lake").toLowerCase());
  }
}
for (const f of load("ne_10m_parks_and_protected_lands_area.geojson")) {
  const p = f.properties;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.unit_name ?? p.name, lon, lat, "park", 6, 140, p.unit_type ?? "protected area");
}
const detail = labels.splice(worldCount);

const rivers = [];
for (const f of load("ne_50m_rivers_lake_centerlines.geojson")) {
  const p = f.properties;
  const name = p.name_en ?? p.name;
  if (!name) continue;
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) {
    const pts = [];
    line.forEach(([x, y], i) => { if (i % 2 === 0 || i === line.length - 1) pts.push(r(x), r(y)); });
    rivers.push([name, p.min_label ?? p.min_zoom ?? 5, 180 - (p.scalerank ?? 5) * 12, pts]);
  }
}

// Detailed rivers (10 m, with the Europe and North America supplements), loaded on demand.
const riversDetail = [];
for (const file of ["ne_10m_rivers_lake_centerlines.geojson", "ne_10m_rivers_europe.geojson", "ne_10m_rivers_north_america.geojson"]) {
  for (const f of load(file)) {
    const p = f.properties;
    const name = p.name_en ?? p.name;
    if (!name || !f.geometry) continue;
    const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const line of lines) {
      const pts = [];
      let lx = Infinity, ly = Infinity;
      line.forEach(([x, y], i) => {
        // Drop points closer than ~1 km to the last one kept.
        if (i === line.length - 1 || Math.abs(x - lx) + Math.abs(y - ly) > 0.015) { pts.push(r(x), r(y)); lx = x; ly = y; }
      });
      if (pts.length >= 4) riversDetail.push([name, p.min_label ?? p.min_zoom ?? 6, 170 - (p.scalerank ?? 6) * 10, pts]);
    }
  }
}

const plateNames = Object.fromEntries(load("PB2002_plates.json").map((f) => [f.properties.Code, f.properties.PlateName]));
const boundaries = load("PB2002_boundaries.json").map((f) => {
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return [f.properties.Name, f.properties.Type ?? "", lines.map((l) => l.flatMap(([x, y]) => [r(x), r(y)]))];
});

writeFileSync("public/data/world-labels.json", JSON.stringify(labels));
writeFileSync("public/data/rivers.json", JSON.stringify(rivers));
writeFileSync("public/data/detail-labels.json", JSON.stringify(detail));
// Tiled in 15° cells ("rivers/<col>_<row>.json", col 0–23 from 180°W, row 0–11 from 90°S) so only the
// area in view is fetched. A line goes in every cell its points touch.
mkdirSync("public/data/rivers", { recursive: true });
for (const f of readdirSync("public/data/rivers")) unlinkSync(join("public/data/rivers", f));
const cells = new Map();
for (const line of riversDetail) {
  const keys = new Set();
  for (let i = 0; i < line[3].length; i += 2) keys.add(`${Math.min(23, Math.floor((line[3][i] + 180) / 15))}_${Math.min(11, Math.floor((line[3][i + 1] + 90) / 15))}`);
  for (const k of keys) { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(line); }
}
for (const [k, lines] of cells) writeFileSync(`public/data/rivers/${k}.json`, JSON.stringify(lines));
writeFileSync("public/data/rivers/index.json", JSON.stringify([...cells.keys()].sort()));
writeFileSync("public/data/plates.json", JSON.stringify({ plates: plateNames, boundaries }));
console.log(`labels ${labels.length}, detail labels ${detail.length}, river lines ${rivers.length}, detailed river lines ${riversDetail.length}, plate boundaries ${boundaries.length}`);
