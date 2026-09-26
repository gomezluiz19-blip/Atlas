// Builds the compact world-scale label and plate-boundary files in public/data
// from Natural Earth (public domain) and Bird (2003) PB2002 plate boundaries.
//   node scripts/build-geodata.mjs <folder with the downloaded GeoJSON files>
// Sources:
//   https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//   https://github.com/fraxen/tectonicplates (PB2002_boundaries.json, PB2002_plates.json)
import { readFileSync, writeFileSync } from "node:fs";
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

for (const f of load("ne_50m_geography_regions_polys.geojson")) {
  const p = f.properties, cls = String(p.FEATURECLA).toLowerCase();
  const [lon, lat] = labelPoint(f.geometry);
  const kind = cls === "continent" ? "continent" : /range|mtn|mountain/.test(cls) ? "range" : /desert/.test(cls) ? "desert" : "region";
  add(p.NAME_EN ?? p.NAME, lon, lat, kind, p.MIN_LABEL ?? 3, 240 - (p.SCALERANK ?? 5) * 20, cls);
}
for (const f of load("ne_50m_geography_marine_polys.geojson")) {
  const p = f.properties;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name_en ?? p.name, lon, lat, "sea", p.min_label ?? 3, 250 - (p.scalerank ?? 5) * 20, p.featurecla);
}
for (const f of load("ne_50m_geography_regions_points.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  add(p.name_en ?? p.name, lon, lat, p.featurecla === "waterfall" ? "water" : "nature", p.min_zoom ?? 5, 200 - (p.scalerank ?? 5) * 15, p.featurecla);
}
for (const f of load("ne_10m_geography_regions_elevation_points.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  add(p.name_en ?? p.name, lon, lat, "peak", p.min_zoom ?? 7, 60 + (p.elevation ?? 0) / 60, p.elevation ? `${p.elevation} m` : "");
}
for (const f of load("ne_50m_lakes.geojson")) {
  const p = f.properties;
  const [lon, lat] = labelPoint(f.geometry);
  add(p.name_en ?? p.name, lon, lat, "water", p.min_label ?? p.min_zoom ?? 4, 190 - (p.scalerank ?? 5) * 15, "lake");
}
for (const f of load("ne_50m_populated_places_simple.geojson")) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const capital = /capital/i.test(p.featurecla) && !/admin-1/i.test(p.featurecla);
  add(p.name, lon, lat, capital ? "capital" : "city", p.min_zoom ?? 5, 40 + Math.log10(Math.max(1000, p.pop_max ?? 1000)) * 20 + (capital ? 30 : 0), p.adm0name);
}

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

const plateNames = Object.fromEntries(load("PB2002_plates.json").map((f) => [f.properties.Code, f.properties.PlateName]));
const boundaries = load("PB2002_boundaries.json").map((f) => {
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return [f.properties.Name, f.properties.Type ?? "", lines.map((l) => l.flatMap(([x, y]) => [r(x), r(y)]))];
});

writeFileSync("public/data/world-labels.json", JSON.stringify(labels));
writeFileSync("public/data/rivers.json", JSON.stringify(rivers));
writeFileSync("public/data/plates.json", JSON.stringify({ plates: plateNames, boundaries }));
console.log(`labels ${labels.length}, river lines ${rivers.length}, plate boundaries ${boundaries.length}`);
