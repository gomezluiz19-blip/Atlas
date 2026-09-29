// Answers across layers, the readers: each fills its measures into every cell
// of the grid from one kind of data. They run together; one that fails leaves
// its measures unknown (scored as half) instead of stopping the answer.
import type { Needs } from "./criteria";
import { coastDistances, floodProxy, kmBetween, nearestPolyline, bilinear, type Area, type Bbox } from "./engine";
import { elevation } from "../data/elevation";
import { containsPoint, countryShapes, type CountryShape } from "../data/countries";
import { iso3, populationPoints, viewValues, VIEWS } from "../data/people";
import { airports, nearestLine, ports, railways, roads } from "../data/infra";
import { plates, riversIn } from "../data/worldData";
import { FEATURES } from "../content/features";
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";

const rad = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pad = (a: Area, f: number) => {
  const dx = (a.box.e - a.box.w) * f, dy = (a.box.n - a.box.s) * f;
  return { w: a.box.w - dx, s: Math.max(-85, a.box.s - dy), e: a.box.e + dx, n: Math.min(85, a.box.n + dy) };
};

/** Country shapes drawn once into a small raster, so "is this land?" is one pixel read. */
function landMask(shapes: CountryShape[], box: Bbox, size = 1024): (lon: number, lat: number) => boolean {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const sx = size / (box.e - box.w), sy = size / (box.n - box.s);
  ctx.fillStyle = "#fff";
  for (const s of shapes) {
    if (s.bbox[2] < box.w || s.bbox[0] > box.e || s.bbox[3] < box.s || s.bbox[1] > box.n) continue;
    ctx.beginPath();
    for (const poly of s.polygons) for (const ring of poly) ring.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - box.w) * sx, (box.n - y) * sy));
    ctx.fill("evenodd");
  }
  const px = ctx.getImageData(0, 0, size, size).data;
  return (lon, lat) => {
    const x = Math.floor((lon - box.w) * sx), y = Math.floor((box.n - lat) * sy);
    return x >= 0 && y >= 0 && x < size && y < size && px[(y * size + x) * 4 + 3] > 127;
  };
}

/** Heights, slopes, which way the ground faces, land or sea, and distance to the sea. */
async function terrain(a: Area) {
  const widthDeg = a.box.e - a.box.w;
  // About eight tiles across the view: fine enough for slopes, light enough to load quickly.
  const z = clamp(Math.floor(Math.log2((8 * 360) / widthDeg)), 3, 12);
  const pts: [number, number][] = [];
  // Per cell: 2×2 sub-points, each with four neighbours for the slope.
  const sub = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  const cw = widthDeg / a.nx, ch = (a.box.n - a.box.s) / a.ny;
  const stepDeg = (lat: number) => {
    const mPerPx = (156_543 * Math.cos(lat * rad)) / 2 ** z;
    return { dLat: (mPerPx * 1.5) / 111_000, dLon: (mPerPx * 1.5) / (111_000 * Math.max(0.1, Math.cos(lat * rad))), m: mPerPx * 1.5 };
  };
  for (const c of a.cells) for (const [sx, sy] of sub) {
    const lon = c.lon + sx * cw, lat = c.lat + sy * ch, st = stepDeg(lat);
    pts.push([lon, lat], [lon, lat + st.dLat], [lon, lat - st.dLat], [lon + st.dLon, lat], [lon - st.dLon, lat]);
  }
  // A ring around the view, only to find the sea just beyond it.
  const ring = pad(a, 0.3), ringPts: [number, number][] = [];
  const rn = Math.round(a.nx * 1.6), rm = Math.round(a.ny * 1.6);
  for (let j = 0; j < rm; j++) for (let i = 0; i < rn; i++) {
    const lon = ring.w + ((i + 0.5) / rn) * (ring.e - ring.w), lat = ring.n - ((j + 0.5) / rm) * (ring.n - ring.s);
    if (lon >= a.box.w && lon <= a.box.e && lat >= a.box.s && lat <= a.box.n) continue;
    ringPts.push([lon, lat]);
  }
  const zRing = Math.max(3, z - 2);
  const [hs, ringH, shapes] = await Promise.all([elevation.sample(pts, z), elevation.sample(ringPts, zRing), countryShapes().catch(() => [])]);
  const onLand = shapes.length ? landMask(shapes, ring) : () => false;
  const isSea = (h: number, lon: number, lat: number) => h <= 0 && !onLand(lon, lat);
  const sea: [number, number][] = [];
  const shore: boolean[] = [];
  a.cells.forEach((c, k) => {
    let elev = 0, gx = 0, gy = 0, slope = 0, land = 0;
    const st = stepDeg(c.lat);
    for (let q = 0; q < 4; q++) {
      const b = (k * 4 + q) * 5;
      const [z0, zN, zS, zE, zW] = [hs[b], hs[b + 1], hs[b + 2], hs[b + 3], hs[b + 4]];
      const lon = c.lon + sub[q][0] * cw, lat = c.lat + sub[q][1] * ch;
      if (isSea(z0, lon, lat)) { sea.push([lon, lat]); continue; }
      land++;
      elev += z0;
      const dx = (zE - zW) / (2 * st.m), dy = (zN - zS) / (2 * st.m);
      gx += dx; gy += dy;
      slope += Math.atan(Math.hypot(dx, dy)) / rad;
    }
    // A cell is sea only if all of it is; a cell that's partly sea is on the shore.
    c.sea = land === 0;
    shore[k] = land > 0 && land < 4;
    if (c.sea) return;
    c.v.elev = Math.max(0, elev / land);
    c.v.slope = slope / land;
    // Flat ground faces nowhere in particular: unknown, not north.
    c.v.aspect = Math.hypot(gx / land, gy / land) < 0.01 ? NaN : ((Math.atan2(-gx, -gy) / rad) + 360) % 360;
  });
  ringPts.forEach(([lon, lat], i) => { if (isSea(ringH[i], lon, lat)) sea.push([lon, lat]); });
  const edgeKm = Math.max((ring.e - ring.w) * 111 * Math.cos(((a.box.s + a.box.n) / 2) * rad), (ring.n - ring.s) * 111) / 2;
  coastDistances(a, sea, sea.length ? 5000 : edgeKm);
  // Sea points sit at sub-cell spacing: the shore lies between them and the land.
  const half = a.cellKm / 4;
  a.cells.forEach((c, k) => { if (!c.sea) c.v.coast = shore[k] ? Math.min(c.v.coast, half) : Math.max(0, c.v.coast - half); });
}

/** Last year's weather, read at a few points and spread across the grid (adjusted for height). */
async function climate(a: Area) {
  const g = a.nx * a.ny > 200 ? 6 : 4;
  const pts: [number, number][] = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push([a.box.w + ((i + 0.5) / g) * (a.box.e - a.box.w), a.box.n - ((j + 0.5) / g) * (a.box.n - a.box.s)]);
  const year = new Date().getUTCFullYear() - 1;
  const key = `answers:climate:${year}:${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(";")}`;
  type Row = { elevation?: number; daily: { time: string[]; temperature_2m_mean: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[]; sunshine_duration: (number | null)[] } };
  const rows = await cached(key, 30 * 86_400_000, async () => {
    const body = await getJson<Row | Row[]>("Open-Meteo",
      `https://archive-api.open-meteo.com/v1/archive?latitude=${pts.map((p) => p[1].toFixed(3)).join(",")}&longitude=${pts.map((p) => p[0].toFixed(3)).join(",")}` +
      `&start_date=${year}-01-01&end_date=${year}-12-31&daily=temperature_2m_mean,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=UTC`, undefined, 60_000);
    const list = Array.isArray(body) ? body : [body];
    return list.map((r) => {
      const d = r.daily, num = (x: (number | null)[]) => x.filter((v): v is number => v !== null);
      const months = Array.from({ length: 12 }, (_, m) => num(d.temperature_2m_mean.filter((_, i) => Number(d.time[i].slice(5, 7)) === m + 1)));
      const mean = (x: number[]) => (x.length ? x.reduce((p, q) => p + q, 0) / x.length : NaN);
      return {
        h: r.elevation ?? NaN,
        temp: mean(num(d.temperature_2m_mean)),
        winter: Math.min(...months.map(mean).filter(Number.isFinite)),
        frost: num(d.temperature_2m_min).filter((t) => t < 0).length,
        rain: num(d.precipitation_sum).reduce((p, q) => p + q, 0),
        sun: num(d.sunshine_duration).reduce((p, q) => p + q, 0) / 3600,
      };
    });
  });
  const field = (k: "temp" | "winter" | "frost" | "rain" | "sun" | "h") => rows.map((r) => r[k]);
  const f = { temp: field("temp"), winter: field("winter"), frost: field("frost"), rain: field("rain"), sun: field("sun"), h: field("h") };
  for (const c of a.cells) {
    const h = bilinear(f.h, g, g, a.box, c.lon, c.lat);
    // The weather model's ground is smoothed: a mountain cell is colder than its grid box says.
    const lapse = Number.isFinite(h) && Number.isFinite(c.v.elev) ? -0.0065 * (c.v.elev - h) : 0;
    c.v.temp = bilinear(f.temp, g, g, a.box, c.lon, c.lat) + lapse;
    c.v.winter = bilinear(f.winter, g, g, a.box, c.lon, c.lat) + lapse;
    c.v.frost = Math.max(0, bilinear(f.frost, g, g, a.box, c.lon, c.lat) - lapse * 12);
    c.v.rain = bilinear(f.rain, g, g, a.box, c.lon, c.lat);
    c.v.sun = bilinear(f.sun, g, g, a.box, c.lon, c.lat);
  }
}

/** The nearest big city and how many people live close by. */
async function places(a: Area) {
  const p = pad(a, 1);
  const pts = (await populationPoints()).filter(([x, y]) => x >= p.w - 3 && x <= p.e + 3 && y >= p.s - 3 && y <= p.n + 3);
  const big = pts.filter(([, , n]) => n >= 500_000);
  for (const c of a.cells) {
    let crowd = 0, city = 400;
    for (const [x, y, n] of pts) {
      if (Math.abs(y - c.lat) > 0.3) continue;
      if (kmBetween(c.lon, c.lat, x, y) <= 25) crowd += n;
    }
    for (const [x, y] of big) { const d = kmBetween(c.lon, c.lat, x, y); if (d < city) city = d; }
    c.v.crowd = crowd;
    c.v.city = city;
  }
}

/** Airports, seaports, railways and main roads. */
async function infra(a: Area) {
  const p = pad(a, 0.5);
  const inBox = (b: [number, number, number, number], m: number) => !(b[2] < p.w - m || b[0] > p.e + m || b[3] < p.s - m || b[1] > p.n + m);
  const [ap, po, rl, rd] = await Promise.all([airports(), ports(), railways(), roads()]);
  const near = <T extends { lon: number; lat: number }>(xs: T[], m: number) => xs.filter((x) => x.lon >= p.w - m && x.lon <= p.e + m && x.lat >= p.s - m && x.lat <= p.n + m);
  const aps = near(ap, 4), pos = near(po, 5), rls = rl.filter((l) => inBox(l.bbox, 1.5)), rds = rd.filter((l) => inBox(l.bbox, 1.5));
  const closest = <T extends { lon: number; lat: number }>(xs: T[], lon: number, lat: number, cap: number) => xs.reduce((b, x) => Math.min(b, kmBetween(lon, lat, x.lon, x.lat)), cap);
  for (const c of a.cells) {
    c.v.airport = closest(aps, c.lon, c.lat, 400);
    c.v.port = closest(pos, c.lon, c.lat, 500);
    c.v.rail = nearestLine(rls, c.lon, c.lat, 150)?.km ?? 150;
    c.v.highway = nearestLine(rds, c.lon, c.lat, 150)?.km ?? 150;
  }
}

/** Rivers, and where flat low ground near water may flood. */
async function water(a: Area) {
  const p = pad(a, 0.2);
  const lines = (await riversIn(p.w, p.s, p.e, p.n, 16)).map((r) => r.pts);
  for (const c of a.cells) {
    c.v.river = nearestPolyline(lines, c.lon, c.lat, 150);
    c.v.flood = c.sea ? NaN : floodProxy(c.v);
  }
}

/** Famous volcanoes and the edges of the tectonic plates. */
async function hazards(a: Area) {
  const volcanoes = FEATURES.filter((f) => f.kind === "volcano");
  const b = await plates();
  const lines = b.boundaries.flatMap(([, , parts]) => parts);
  for (const c of a.cells) {
    c.v.volcano = volcanoes.reduce((m, v) => Math.min(m, kmBetween(c.lon, c.lat, v.lon, v.lat)), 3000);
    c.v.faults = nearestPolyline(lines, c.lon, c.lat, 3000);
  }
}

/** Country figures: people online, income, life expectancy. */
async function country(a: Area) {
  const [shapes, ...vals] = await Promise.all([countryShapes(), ...["online", "income", "life"].map((id) => viewValues(VIEWS.find((v) => v.id === id)!).catch(() => ({} as Record<string, { value: number }>)))]);
  const local = shapes.filter((s) => !(s.bbox[2] < a.box.w || s.bbox[0] > a.box.e || s.bbox[3] < a.box.s || s.bbox[1] > a.box.n));
  for (const c of a.cells) {
    const s = local.find((x) => containsPoint(x, c.lon, c.lat));
    const code = s ? iso3(s.id) : null;
    c.v.online = code ? vals[0][code]?.value ?? NaN : NaN;
    c.v.income = code ? vals[1][code]?.value ?? NaN : NaN;
    c.v.life = code ? vals[2][code]?.value ?? NaN : NaN;
  }
}

const READERS: Record<Needs, (a: Area) => Promise<void>> = { terrain, climate, places, infra, water, hazards, country };
export const STEP_WORDS: Record<Needs, string> = {
  terrain: "the ground", climate: "last year's weather", places: "towns and cities", infra: "airports, ports, rail and roads",
  water: "rivers", hazards: "volcanoes and fault lines", country: "country figures",
};

/** Reads the layers a question needs into the grid (terrain first: the others build on it). */
export async function gather(a: Area, needs: Set<Needs>, onStep: (done: Needs, ok: boolean) => void) {
  const run = async (n: Needs) => {
    if (a.read.has(n)) return;
    try { await READERS[n](a); a.read.add(n); onStep(n, true); } catch { a.missing.push(n); onStep(n, false); }
  };
  await run("terrain");
  // Flood risk leans on rivers and the coast, so water waits for terrain (above).
  await Promise.all([...needs].filter((n) => n !== "terrain").map(run));
}
