// Any government open-data table with locations, read the same way: Socrata portals (NYC, Montgomery
// County, Prince George's, most US cities and counties), ArcGIS feature services (DC, Arlington, Fairfax,
// Alexandria and thousands of local GIS sites), plain GeoJSON, or CSV. Paste a dataset's link and Atlas
// works out how to query it, finds the location in each row, and guesses which columns are the date,
// address, type, value, owner and contractor, for the person to confirm before importing.

export type SourceKind = "socrata" | "arcgis" | "geojson" | "csv";
export interface Source { kind: SourceKind; url: string; label: string }
export interface Row { lon: number; lat: number; props: Record<string, string> }
export type FieldRole = "name" | "address" | "date" | "type" | "value" | "owner" | "contractor" | "status" | "stories";
export type FieldMap = Partial<Record<FieldRole, string>>;

/** How to query a dataset from the link someone pasted (pure). Null if it isn't a link Atlas understands. */
export function detectSource(link: string, limit = 2000): Source | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // Socrata: /resource/abcd-1234(.json), /d/abcd-1234, /dataset/Some-Name/abcd-1234, /api/views/abcd-1234
  const soc = u.pathname.match(/\/(?:resource|d|api\/views|dataset\/[^/]+|[^/]+\/[^/]+)\/([a-z0-9]{4}-[a-z0-9]{4})(?:\.json|\.csv|\/|$)/i);
  if (soc) return { kind: "socrata", url: `${u.origin}/resource/${soc[1]}.json?$limit=${limit}&$order=${encodeURIComponent(":id DESC")}`, label: `${u.hostname} · ${soc[1]}` };
  // ArcGIS: …/FeatureServer/0 or …/MapServer/3 (with or without /query)
  const arc = u.pathname.match(/^(.*\/(?:FeatureServer|MapServer)\/\d+)(?:\/query)?\/?$/i);
  if (arc) return { kind: "arcgis", url: `${u.origin}${arc[1]}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=${limit}`, label: `${u.hostname} · ${arc[1].split("/").slice(-3).join("/")}` };
  if (/\.csv$/i.test(u.pathname) || /format=csv/i.test(u.search)) return { kind: "csv", url: u.href, label: u.hostname };
  if (/\.(geo)?json$/i.test(u.pathname) || /f=(geo)?json/i.test(u.search)) return { kind: "geojson", url: u.href, label: u.hostname };
  return null;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "object" ? "" : String(v));
const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : NaN; };
const okLonLat = (lon: number, lat: number) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lon === 0 && lat === 0);

/** The centre of a GeoJSON geometry (points as they are; lines and areas by the middle of their extent) (pure). */
function centreOf(g: { type?: string; coordinates?: unknown } | null | undefined): [number, number] | null {
  if (!g || !g.coordinates) return null;
  if (g.type === "Point") { const [x, y] = g.coordinates as number[]; return [x, y]; }
  const flat: number[][] = [];
  const walk = (c: unknown) => { if (Array.isArray(c) && typeof c[0] === "number") flat.push(c as number[]); else if (Array.isArray(c)) c.forEach(walk); };
  walk(g.coordinates);
  if (!flat.length) return null;
  const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** A row's location from whatever columns it has: lat/lon pairs, x/y, a Socrata location object or point (pure). */
function locate(o: Record<string, unknown>): [number, number] | null {
  const keys = Object.keys(o);
  const find = (re: RegExp) => keys.find((k) => re.test(k));
  const latK = find(/^(gis_)?lat(itude)?$|_lat(itude)?$|^y_?coord|^point_y$|^y$/i), lonK = find(/^(gis_)?(lon|lng|long|longitude)$|_(lon|lng|longitude)$|^x_?coord|^point_x$|^x$/i);
  if (latK && lonK) { const lat = num(o[latK]), lon = num(o[lonK]); if (okLonLat(lon, lat)) return [lon, lat]; }
  for (const k of keys) {
    const v = o[k] as { latitude?: unknown; longitude?: unknown; type?: string; coordinates?: unknown } | null;
    if (v && typeof v === "object") {
      if ("latitude" in v && "longitude" in v) { const lat = num(v.latitude), lon = num(v.longitude); if (okLonLat(lon, lat)) return [lon, lat]; }
      const c = centreOf(v as { type?: string; coordinates?: unknown });
      if (c && okLonLat(c[0], c[1])) return c;
    }
  }
  return null;
}
const flatProps = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (v !== null && typeof v === "object" ? [] : [[k, str(v)]])));

/** Rows with a location from a Socrata or ArcGIS JSON answer, or GeoJSON (pure). Rows without a location are dropped. */
export function rowsFromJson(json: unknown): Row[] {
  const out: Row[] = [];
  const j = json as { features?: { geometry?: { type?: string; coordinates?: unknown; x?: number; y?: number }; properties?: Record<string, unknown>; attributes?: Record<string, unknown> }[] };
  if (j && Array.isArray(j.features)) {
    for (const f of j.features) {
      const props = f.properties ?? f.attributes ?? {};
      const g = f.geometry;
      const c = g && typeof g.x === "number" && typeof g.y === "number" ? [g.x, g.y] as [number, number] : centreOf(g) ?? locate(props);
      if (c && okLonLat(c[0], c[1])) out.push({ lon: c[0], lat: c[1], props: flatProps(props) });
    }
    return out;
  }
  if (Array.isArray(json)) for (const o of json as Record<string, unknown>[]) {
    if (!o || typeof o !== "object") continue;
    const c = locate(o);
    if (c) out.push({ lon: c[0], lat: c[1], props: flatProps(o) });
  }
  return out;
}

/** Rows from CSV text with latitude and longitude columns (pure). */
export function rowsFromCsv(text: string): Row[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, "\"").trim()).slice(0, -1);
  const head = split(lines[0]);
  return lines.slice(1).flatMap((l) => {
    const v = split(l), o: Record<string, unknown> = {};
    head.forEach((k, i) => { o[k] = v[i] ?? ""; });
    const c = locate(o);
    return c ? [{ lon: c[0], lat: c[1], props: flatProps(o) }] : [];
  });
}

const ROLE_RE: [FieldRole, RegExp][] = [
  ["date", /issu|permit_?date|approv|filing_?date|application_?date|applied|start_?date|^date|_date$|date_/i],
  ["address", /full_?address|^address|site_?addr|street_?address|location_?desc|addr/i],
  ["type", /permit_?type|work_?type|job_?type|permit_?class|^type|category|subtype|use_?type|facility_?type|factype/i],
  ["value", /valuation|est(imated)?_?(cost|value)|job_?value|construction_?(cost|value)|project_?(cost|value)|declared_?value/i],
  ["owner", /owner/i],
  ["contractor", /contractor|applicant|permittee|builder/i],
  ["status", /status/i],
  ["stories", /stor(y|ies)|floors|num_?floors/i],
  ["name", /project_?name|^name|facname|facility_?name|description|desc|work_?description|^title/i],
];
/** Which column plays which part, by name and by what's in it (pure). The person can change any of them. */
export function guessFields(rows: Row[]): FieldMap {
  const keys = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r.props)))];
  const filled = (k: string) => rows.slice(0, 50).filter((r) => (r.props[k] ?? "").trim()).length;
  const used = new Set<string>(), map: FieldMap = {};
  for (const [role, re] of ROLE_RE) {
    const best = keys.filter((k) => re.test(k) && !used.has(k) && filled(k) > 0).sort((a, b) => filled(b) - filled(a))[0];
    if (best) { map[role] = best; used.add(best); }
  }
  return map;
}

/** A date in any of the usual forms (ISO, MM/DD/YYYY, epoch milliseconds) as YYYY-MM-DD, or null (pure). */
export function isoDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{12,13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
export const money = (v: string | undefined) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Fetches a dataset and returns its rows with locations. */
export async function loadDataset(src: Source, fetcher: typeof fetch = fetch): Promise<Row[]> {
  const res = await fetcher(src.url, { headers: { Accept: src.kind === "csv" ? "text/csv" : "application/json" } });
  if (!res.ok) throw new Error(`The portal answered ${res.status}. Check the link, or whether the dataset is public.`);
  return src.kind === "csv" ? rowsFromCsv(await res.text()) : rowsFromJson(await res.json());
}

/** Where to find permits and facilities in the places Atlas's first users are, and in New York (links to search, not promises). */
export const PORTALS: { place: string; url: string; look: string }[] = [
  { place: "District of Columbia", url: "https://opendata.dc.gov/search?q=building%20permits", look: "\"Building Permits in <year>\" (ArcGIS: copy the FeatureServer link from \"I want to use this › API\")" },
  { place: "Montgomery County, MD", url: "https://data.montgomerycountymd.gov/browse?q=permits", look: "Residential and commercial permit datasets (Socrata: paste the dataset page link)" },
  { place: "Prince George's County, MD", url: "https://data.princegeorgescountymd.gov/browse?q=permit", look: "Permit datasets (Socrata)" },
  { place: "Arlington County, VA", url: "https://data.arlingtonva.us/", look: "Building permits (paste the dataset's API or GeoJSON link)" },
  { place: "Fairfax County, VA", url: "https://data-fairfaxcountygis.opendata.arcgis.com/search?q=permit", look: "Permit layers (ArcGIS: the FeatureServer layer link)" },
  { place: "City of Alexandria, VA", url: "https://data.alexandriava.gov/", look: "Permits (ArcGIS or Socrata)" },
  { place: "Baltimore City, MD", url: "https://data.baltimorecity.gov/search?q=permits", look: "Building permits (ArcGIS)" },
  { place: "New York City", url: "https://data.cityofnewyork.us/resource/ipu4-2q9a", look: "DOB Permit Issuance (Socrata), or the Facilities Database ji82-xba5 for city facilities" },
];
