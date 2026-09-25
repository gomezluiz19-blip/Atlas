// OpenStreetMap features via the Overpass API (ODbL, © OpenStreetMap contributors).
import { getJson, ServiceError } from "./http";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

/** Runs an Overpass QL query (JSON output), trying mirrors in turn. */
export async function overpass(query: string): Promise<OsmElement[]> {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const body = await getJson<{ elements: OsmElement[]; remark?: string }>(
        "OpenStreetMap",
        url,
        { method: "POST", body: new URLSearchParams({ data: query }), headers: { "Content-Type": "application/x-www-form-urlencoded" } },
        60_000,
      );
      if (body.remark && /runtime error|timed out|out of memory/i.test(body.remark) && !body.elements?.length) {
        throw new ServiceError("OpenStreetMap", "the area is too busy to load at once; try a smaller area");
      }
      return body.elements ?? [];
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** A point representing any element (node position, or the centre/first vertex of a way). */
export function elementPoint(e: OsmElement): [number, number] | null {
  if (e.lon !== undefined && e.lat !== undefined) return [e.lon, e.lat];
  if (e.center) return [e.center.lon, e.center.lat];
  if (e.geometry?.length) {
    const g = e.geometry;
    let x = 0, y = 0;
    for (const p of g) { x += p.lon; y += p.lat; }
    return [x / g.length, y / g.length];
  }
  return null;
}

export function osmUrl(e: OsmElement): string {
  return `https://www.openstreetmap.org/${e.type}/${e.id}`;
}
