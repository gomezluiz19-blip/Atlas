// Builds the compact world infrastructure files in public/data:
//   rail.json, roads.json, shipping.json, ports.json, airports.json, power.json
//   node scripts/build-infra.mjs <folder with the downloaded source files>
// Sources (download into the folder under these names):
//   ne_10m_railroads.geojson, ne_10m_roads.geojson, ne_10m_ports.geojson, ne_10m_airports.geojson
//     https://github.com/nvkelso/natural-earth-vector/tree/master/geojson (public domain)
//   shipping.geojson  https://github.com/newzealandpaul/Shipping-Lanes (data/Shipping_Lanes_v1.geojson, CC BY 4.0)
//   power.csv         https://github.com/wri/global-power-plant-database (output_database/global_power_plant_database.csv, CC BY 4.0)
//
// Lines are simplified (Douglas–Peucker) and stored as integer thousandths of a
// degree, delta-encoded: [attrs..., x0, y0, dx1, dy1, ...]. See src/data/infra.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-infra.mjs <source folder>");
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8")).features;

function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplified, delta-encoded integer line, or null if it collapses to a point. */
function encode(line, tol) {
  const s = simplify(line, tol);
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of s) {
    const ix = Math.round(x * 1000), iy = Math.round(y * 1000);
    if (out.length && ix === px && iy === py) continue;
    out.push(ix - px, iy - py);
    px = ix; py = iy;
  }
  return out.length >= 4 ? out : null;
}
const linesOf = (g) => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []);
const r3 = (v) => Math.round(v * 1000) / 1000;

// Railways: [scalerank, electric(0/1), ...line]
const rail = [];
for (const f of load("ne_10m_railroads.geojson")) {
  const p = f.properties;
  for (const l of linesOf(f.geometry)) {
    const e = encode(l, 0.004);
    if (e) rail.push([p.scalerank ?? 10, p.electric === 1 ? 1 : 0, ...e]);
  }
}

// Roads: [kind, scalerank, ...line]; kind M major, S secondary, R road, F ferry, O other.
const roadKind = (t) => (/major|beltway|bypass/i.test(t) ? "M" : /secondary/i.test(t) ? "S" : /ferry/i.test(t) ? "F" : /^road$/i.test(t) ? "R" : "O");
const roads = [];
for (const f of load("ne_10m_roads.geojson")) {
  const p = f.properties;
  const kind = roadKind(p.type ?? "");
  // Tracks and minor unclassified roads add bulk without helping at world scale.
  if (/track/i.test(p.type ?? "") || (kind === "O" && (p.scalerank ?? 9) >= 9)) continue;
  for (const l of linesOf(f.geometry)) {
    const e = encode(l, 0.006);
    if (e) roads.push([kind, p.scalerank ?? 9, ...e]);
  }
}

// Shipping lanes: [importance 1 major, 2 middle, 3 minor, ...line]
const shipping = [];
for (const f of load("shipping.geojson")) {
  const t = String(f.properties.Type ?? "").toLowerCase();
  const imp = t === "major" ? 1 : t === "middle" ? 2 : 3;
  for (const l of linesOf(f.geometry)) {
    const e = encode(l, 0.02);
    if (e) shipping.push([imp, ...e]);
  }
}

// Ports: [name, lon, lat, scalerank]
const ports = load("ne_10m_ports.geojson")
  .map((f) => [f.properties.name, r3(f.geometry.coordinates[0]), r3(f.geometry.coordinates[1]), f.properties.scalerank ?? 9])
  .filter((p) => p[0]);

// Airports: [name, iata, lon, lat, type, scalerank]
const airports = load("ne_10m_airports.geojson")
  .map((f) => {
    const p = f.properties;
    return [p.name_en ?? p.name, p.iata_code ?? p.abbrev ?? "", r3(f.geometry.coordinates[0]), r3(f.geometry.coordinates[1]), p.type ?? "", p.scalerank ?? 9];
  })
  .filter((a) => a[0]);

// Power plants: { countries: {ISO3: name}, plants: [name, lon, lat, fuel, MW, country ISO3, commissioned year or 0] }
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csv = parseCsv(readFileSync(join(dir, "power.csv"), "utf8"));
const head = csv[0], col = (n) => head.indexOf(n);
const [cCountry, cCountryLong, cName, cMw, cLat, cLon, cFuel, cYear] = ["country", "country_long", "name", "capacity_mw", "latitude", "longitude", "primary_fuel", "commissioning_year"].map(col);
const power = [];
const countries = {};
for (const row of csv.slice(1)) {
  const mw = Number(row[cMw]), lat = Number(row[cLat]), lon = Number(row[cLon]);
  if (!(mw >= 1) || !Number.isFinite(lat) || !Number.isFinite(lon) || !row[cName]) continue;
  power.push([row[cName], r3(lon), r3(lat), row[cFuel] || "Other", Math.round(mw * 10) / 10, row[cCountry], Math.round(Number(row[cYear]) || 0)]);
  countries[row[cCountry]] = row[cCountryLong];
}
power.sort((a, b) => b[4] - a[4]);

const out = { rail, roads, shipping, ports, airports, power: { countries, plants: power } };
for (const [name, data] of Object.entries(out)) writeFileSync(`public/data/${name}.json`, JSON.stringify(data));
console.log(Object.entries(out).map(([k, v]) => `${k} ${(v.plants ?? v).length}`).join(", "));
