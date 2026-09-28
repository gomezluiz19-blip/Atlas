// Understands the many ways people copy a location: decimal or DMS
// coordinates, links from Google Maps, Apple Maps, OpenStreetMap and Bing,
// geo: URIs and Open Location Codes ("plus codes"). Anything else is treated
// as an address or place name to geocode.

export interface ParsedPoint {
  kind: "point";
  lat: number;
  lon: number;
  /** Web-map zoom level if the source said (e.g. a map link). */
  zoom?: number;
  /** A place name carried by the source (e.g. a Google Maps /place/ link). */
  label?: string;
  source: "coordinates" | "google" | "apple" | "osm" | "bing" | "geo" | "pluscode";
}

export interface ParsedQuery {
  kind: "query";
  text: string;
  /** Short plus code that needs a reference location (e.g. "9G8F+6X Zurich"). */
  shortCode?: string;
}

export type Parsed = ParsedPoint | ParsedQuery;

const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function point(lat: number, lon: number, source: ParsedPoint["source"], extra: Partial<ParsedPoint> = {}): ParsedPoint | null {
  if (!valid(lat, lon)) {
    // Some sources give lon,lat. Swap if that's the only valid reading.
    if (valid(lon, lat)) return { kind: "point", lat: lon, lon: lat, source, ...extra };
    return null;
  }
  return { kind: "point", lat, lon, source, ...extra };
}

const NUM = String.raw`[-+]?\d+(?:[.,]\d+)?`;

/** "40.7484, -73.9857", "40.7484° N 73.9857° W", "N40.7484 W73.9857". */
function parseDecimal(s: string): ParsedPoint | null {
  const t = s.replace(/[()[\]]/g, " ").trim();
  let m = t.match(new RegExp(`^(${NUM})\\s*°?\\s*([NS])?\\s*[,;/\\s]\\s*(${NUM})\\s*°?\\s*([EW])?$`, "i"));
  if (m) {
    let lat = Number(m[1].replace(",", ".")), lon = Number(m[3].replace(",", "."));
    if (m[2]?.toUpperCase() === "S") lat = -Math.abs(lat);
    if (m[4]?.toUpperCase() === "W") lon = -Math.abs(lon);
    return point(lat, lon, "coordinates");
  }
  m = t.match(new RegExp(`^([NS])\\s*(${NUM})\\s*°?\\s*[,;\\s]\\s*([EW])\\s*(${NUM})\\s*°?$`, "i"));
  if (m) {
    const lat = Number(m[2]) * (m[1].toUpperCase() === "S" ? -1 : 1);
    const lon = Number(m[4]) * (m[3].toUpperCase() === "W" ? -1 : 1);
    return point(lat, lon, "coordinates");
  }
  return null;
}

/** 40°44'54.3"N 73°59'08.5"W, 40 44 54.3 N 73 59 8.5 W, 40°44.905'N 73°59.142'W. */
function parseDms(s: string): ParsedPoint | null {
  const t = s
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/º|˚/g, "°")
    .trim();
  const part = String.raw`(\d{1,3})(?:\s*°\s*|\s+|°)(?:(\d{1,2}(?:[.,]\d+)?)\s*'?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*"?\s*)?`;
  const re = new RegExp(`^([NS])?\\s*${part}([NS])?[\\s,;]+([EW])?\\s*${part}([EW])?$`, "i");
  const m = t.match(re);
  if (!m) return null;
  const hemLat = (m[1] ?? m[5])?.toUpperCase(), hemLon = (m[6] ?? m[10])?.toUpperCase();
  if (!hemLat || !hemLon) return null; // without hemispheres this is ambiguous with plain decimals
  const dec = (d: string, mi?: string, se?: string) => Number(d) + Number((mi ?? "0").replace(",", ".")) / 60 + Number((se ?? "0").replace(",", ".")) / 3600;
  const lat = dec(m[2], m[3], m[4]) * (hemLat === "S" ? -1 : 1);
  const lon = dec(m[7], m[8], m[9]) * (hemLon === "W" ? -1 : 1);
  return point(lat, lon, "coordinates");
}

function parseUrl(s: string): Parsed | null {
  let url: URL;
  try {
    url = new URL(s.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const q = url.searchParams;
  const pair = (v: string | null, sep = ",") => {
    if (!v) return null;
    const [a, b] = v.split(sep).map(Number);
    return valid(a, b) ? [a, b] : null;
  };
  const dz = (z: string | null | undefined) => (z ? Number(z) : undefined);

  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === "maps.app.goo.gl" || host === "goo.gl") {
    if (host === "maps.app.goo.gl" || host === "goo.gl") return { kind: "query", text: "" }; // short links can't be expanded in the browser
    const path = decodeURIComponent(url.pathname);
    const label = path.match(/\/place\/([^/]+)/)?.[1]?.replace(/\+/g, " ");
    // Exact pin from the data parameter wins over the view centre.
    const pin = path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/);
    if (pin) return point(Number(pin[1]), Number(pin[2]), "google", { label, zoom: dz(at?.[3]) ?? 16 });
    const qp = pair(q.get("q")) ?? pair(q.get("ll")) ?? pair(q.get("query")) ?? pair(q.get("center")) ?? pair(q.get("destination"));
    if (qp) return point(qp[0], qp[1], "google", { label, zoom: dz(q.get("z")) });
    if (at) return point(Number(at[1]), Number(at[2]), "google", { label, zoom: dz(at[3]) });
    const text = q.get("q") ?? q.get("query") ?? label;
    return text ? { kind: "query", text } : null;
  }
  if (host === "maps.apple.com" || host === "maps.apple") {
    const label = q.get("q") ?? q.get("name") ?? undefined;
    const p = pair(q.get("coordinate")) ?? pair(q.get("ll")) ?? pair(q.get("sll")) ?? pair(q.get("center"));
    if (p) return point(p[0], p[1], "apple", { label: label ?? undefined, zoom: dz(q.get("z")) });
    const text = q.get("address") ?? q.get("q") ?? q.get("daddr");
    return text ? { kind: "query", text } : null;
  }
  if (host.endsWith("openstreetmap.org") || host === "osm.org") {
    const m = url.hash.match(/map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
    const ml = q.get("mlat"), mo = q.get("mlon");
    if (ml && mo) return point(Number(ml), Number(mo), "osm", { zoom: m ? Number(m[1]) : undefined });
    if (m) return point(Number(m[2]), Number(m[3]), "osm", { zoom: Number(m[1]) });
    return null;
  }
  if (host === "bing.com") {
    const cp = q.get("cp");
    const p = pair(cp, "~");
    if (p) return point(p[0], p[1], "bing", { zoom: dz(q.get("lvl")) });
    const text = q.get("q") ?? q.get("where1");
    return text ? { kind: "query", text } : null;
  }
  return null;
}

/** geo:40.7484,-73.9857?z=17 or geo:0,0?q=address. */
function parseGeoUri(s: string): Parsed | null {
  const m = s.trim().match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^?;]*)?(?:;[^?]*)?(?:\?(.*))?$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[3] ?? "");
  const lat = Number(m[1]), lon = Number(m[2]);
  const q = params.get("q");
  if (lat === 0 && lon === 0 && q) {
    const inner = parseDecimal(q.replace(/\(.*\)$/, ""));
    return inner ?? { kind: "query", text: q };
  }
  return point(lat, lon, "geo", { zoom: params.get("z") ? Number(params.get("z")) : undefined, label: q?.match(/\((.*)\)$/)?.[1] });
}

// ---- Open Location Code (plus codes) ----
const OLC = "23456789CFGHJMPQRVWX";
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125];

export function isFullPlusCode(code: string): boolean {
  const c = code.toUpperCase();
  return /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{0,7}$/.test(c) || /^[23456789CFGHJMPQRVWX]{2,8}0*\+$/.test(c);
}

export function isShortPlusCode(code: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{4,7}\+[23456789CFGHJMPQRVWX]{2,7}$/i.test(code) && code.indexOf("+") < 8;
}

/** Centre of a full plus code. */
export function decodePlusCode(code: string): { lat: number; lon: number; size: number } {
  const c = code.toUpperCase().replace("+", "").replace(/0+$/, "");
  let lat = -90, lon = -180, latRes = 0, lonRes = 0;
  for (let i = 0; i < Math.min(10, c.length); i += 2) {
    const r = PAIR_RES[i / 2];
    lat += OLC.indexOf(c[i]) * r;
    lon += OLC.indexOf(c[i + 1] ?? "2") * r;
    latRes = lonRes = r;
  }
  for (let i = 10; i < c.length; i++) {
    latRes /= 5;
    lonRes /= 4;
    const d = OLC.indexOf(c[i]);
    lat += Math.floor(d / 4) * latRes;
    lon += (d % 4) * lonRes;
  }
  return { lat: lat + latRes / 2, lon: lon + lonRes / 2, size: latRes * 111_000 };
}

function encodePairs(lat: number, lon: number, pairs: number): string {
  let la = Math.min(89.9999999, Math.max(-90, lat)) + 90, lo = (((lon + 180) % 360) + 360) % 360;
  let out = "";
  for (let i = 0; i < pairs; i++) {
    const r = PAIR_RES[i];
    const a = Math.floor(la / r), b = Math.floor(lo / r);
    out += OLC[a] + OLC[b];
    la -= a * r;
    lo -= b * r;
  }
  return out;
}

/** Recovers a short code ("9G8F+6X") to the full code nearest a reference point. */
export function recoverPlusCode(short: string, refLat: number, refLon: number): string {
  const s = short.toUpperCase();
  const missing = 8 - s.indexOf("+");
  const res = PAIR_RES[missing / 2 - 1] ?? 20;
  const prefix = encodePairs(refLat, refLon, 5).slice(0, missing);
  const guess = decodePlusCode(prefix + s);
  let { lat, lon } = guess;
  const half = res / 2;
  if (refLat + half < lat && lat - res >= -90) lat -= res;
  else if (refLat - half > lat && lat + res <= 90) lat += res;
  if (refLon + half < lon) lon -= res;
  else if (refLon - half > lon) lon += res;
  const full = encodePairs(lat, lon, 4) + "+" + s.slice(s.indexOf("+") + 1);
  return full.slice(0, 8) + "+" + s.slice(s.indexOf("+") + 1);
}

function parsePlusCode(s: string): Parsed | null {
  const t = s.trim();
  const m = t.match(/^([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*)(?:[,\s]+(.+))?$/i);
  if (!m) return null;
  if (isFullPlusCode(m[1])) {
    const p = decodePlusCode(m[1]);
    return point(p.lat, p.lon, "pluscode", { zoom: p.size < 50 ? 18 : p.size < 500 ? 15 : 10 });
  }
  if (isShortPlusCode(m[1])) return { kind: "query", text: m[2] ?? "", shortCode: m[1].toUpperCase() };
  return null;
}

/** Interprets anything typed or pasted into the search box. */
export function parseLocation(input: string): Parsed {
  const s = input.replace(/\s+/g, " ").trim();
  if (!s) return { kind: "query", text: "" };
  return (
    parseUrl(s) ??
    parseGeoUri(s) ??
    parsePlusCode(s) ??
    parseDecimal(s) ??
    parseDms(s) ??
    // Multi-line addresses pasted from elsewhere read better as one line.
    { kind: "query", text: input.replace(/\s*\n\s*/g, ", ").replace(/\s+/g, " ").trim() }
  );
}

// ---- Shareable links (URL hash) ----

export interface ShareState {
  place?: { lat: number; lon: number };
  theme?: string;
  camera?: { lat: number; lon: number; height: number; heading: number; pitch: number };
}

const r5 = (v: number) => Number(v.toFixed(5));

export function formatHash(s: ShareState): string {
  const parts: string[] = [];
  if (s.place) parts.push(`p=${r5(s.place.lat)},${r5(s.place.lon)}`);
  if (s.theme) parts.push(`t=${s.theme}`);
  if (s.camera) {
    const c = s.camera;
    parts.push(`c=${r5(c.lat)},${r5(c.lon)},${Math.round(c.height)},${Math.round(c.heading)},${Math.round(c.pitch)}`);
  }
  return parts.length ? `#${parts.join("&")}` : "";
}

export function parseHash(hash: string): ShareState {
  const out: ShareState = {};
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const p = params.get("p")?.split(",").map(Number);
  if (p && p.length === 2 && valid(p[0], p[1])) out.place = { lat: p[0], lon: p[1] };
  const t = params.get("t");
  if (t && /^[a-z]+$/.test(t)) out.theme = t;
  const c = params.get("c")?.split(",").map(Number);
  if (c && c.length === 5 && valid(c[0], c[1]) && c.every(Number.isFinite)) out.camera = { lat: c[0], lon: c[1], height: c[2], heading: c[3], pitch: c[4] };
  return out;
}

/** "40.74844° N, 73.98566° W". */
export function formatCoordinates(lat: number, lon: number, digits = 5): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Degrees, minutes, seconds: 40°44′54.4″N 73°59′08.4″W. */
export function formatDms(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), sec = (mf - m) * 60;
    return `${d}°${String(m).padStart(2, "0")}′${sec.toFixed(1).padStart(4, "0")}″${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, "N", "S")} ${f(lon, "E", "W")}`;
}
