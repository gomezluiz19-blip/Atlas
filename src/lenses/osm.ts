// OpenStreetMap shapes for lenses: polygons of forests, lakes and parks, and
// transit lines, from Overpass geometry output.
import { overpass, type OsmElement } from "../data/overpass";

export type Ring = [number, number][];

interface GeomMember { type: string; role?: string; geometry?: { lat: number; lon: number }[] }

/** Outer rings of a way or multipolygon relation (with `out geom`). */
export function ringsOf(e: OsmElement & { members?: GeomMember[] }): Ring[] {
  if (e.type === "way" && e.geometry) return [e.geometry.map((p) => [p.lon, p.lat] as [number, number])];
  if (e.type === "relation" && e.members) {
    const outers = e.members.filter((m) => m.type === "way" && (m.role === "outer" || m.role === "") && m.geometry).map((m) => m.geometry!.map((p) => [p.lon, p.lat] as [number, number]));
    return joinRings(outers);
  }
  return [];
}

/** Joins way pieces into closed rings where their ends meet. */
export function joinRings(pieces: Ring[]): Ring[] {
  const out: Ring[] = [];
  const left = pieces.map((p) => [...p]);
  const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  while (left.length) {
    let ring = left.shift()!;
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]);) {
      grew = false;
      for (let k = 0; k < left.length; k++) {
        const q = left[k], e = ring[ring.length - 1];
        if (same(e, q[0])) ring = [...ring, ...q.slice(1)];
        else if (same(e, q[q.length - 1])) ring = [...ring, ...q.slice(0, -1).reverse()];
        else continue;
        left.splice(k, 1);
        grew = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

export interface Shape { name: string; tags: Record<string, string>; rings: Ring[] }

export async function forestsAround(lon: number, lat: number, r: number): Promise<Shape[]> {
  const els = await overpass(`[out:json][timeout:30];(way["natural"="wood"](around:${r},${lat},${lon});way["landuse"="forest"](around:${r},${lat},${lon});relation["natural"="wood"](around:${r},${lat},${lon});relation["landuse"="forest"](around:${r},${lat},${lon}););out geom tags 400;`);
  return els.map((e) => ({ name: e.tags?.name ?? "", tags: e.tags ?? {}, rings: ringsOf(e as never) })).filter((s) => s.rings.length);
}

/** The mapped area (lake, forest, park, island or town) that contains a point. */
export async function areaContaining(lon: number, lat: number): Promise<Shape[]> {
  const els = await overpass(`[out:json][timeout:30];is_in(${lat},${lon})->.a;(way(pivot.a)["natural"~"^(water|wood)$"];relation(pivot.a)["natural"~"^(water|wood)$"];way(pivot.a)["landuse"="forest"];relation(pivot.a)["landuse"="forest"];way(pivot.a)["leisure"~"^(park|nature_reserve)$"];relation(pivot.a)["leisure"~"^(park|nature_reserve)$"];relation(pivot.a)["boundary"="national_park"];relation(pivot.a)["place"~"^(island|islet)$"];way(pivot.a)["place"~"^(island|islet)$"];relation(pivot.a)["boundary"="administrative"]["admin_level"~"^(6|7|8)$"];);out geom tags 20;`);
  return els.map((e) => ({ name: e.tags?.name ?? "", tags: e.tags ?? {}, rings: ringsOf(e as never) })).filter((s) => s.rings.length);
}

export interface Line { name: string; ref: string; colour: string; mode: string; pieces: Ring[] }

export async function transitAround(lon: number, lat: number, r: number): Promise<{ lines: Line[]; stations: { name: string; lon: number; lat: number }[] }> {
  const els = await overpass(`[out:json][timeout:45];(relation["route"~"^(subway|light_rail|monorail)$"](around:${r},${lat},${lon}););out geom tags;(node["railway"="station"]["station"~"^(subway|light_rail|monorail)$"](around:${r},${lat},${lon});node["station"="subway"](around:${r},${lat},${lon}););out tags;`);
  const groups = new Map<string, Line>();
  const stations: { name: string; lon: number; lat: number }[] = [];
  for (const e of els as (OsmElement & { members?: GeomMember[] })[]) {
    if (e.type === "node" && e.lat !== undefined && e.lon !== undefined) { if (!stations.some((s) => s.name === e.tags?.name && Math.abs(s.lat - e.lat!) < 0.003)) stations.push({ name: e.tags?.name ?? "Station", lon: e.lon, lat: e.lat }); continue; }
    if (e.type !== "relation") continue;
    const t = e.tags ?? {};
    const key = t.ref || t.name || String(e.id);
    const pieces = (e.members ?? []).filter((m) => m.type === "way" && m.geometry && (!m.role || m.role === "" || /forward|backward/.test(m.role))).map((m) => m.geometry!.map((p) => [p.lon, p.lat] as [number, number]));
    const prev = groups.get(key);
    if (!prev || pieces.length > prev.pieces.length)
      groups.set(key, { name: t.name ?? key, ref: t.ref ?? "", colour: /^#?[0-9a-f]{6}$/i.test(t.colour ?? "") ? (t.colour!.startsWith("#") ? t.colour! : `#${t.colour}`) : "", mode: t.route ?? "subway", pieces });
  }
  const palette = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00acc1", "#fdd835", "#6d4c41", "#d81b60", "#3949ab"];
  const lines = [...groups.values()].map((l, i) => ({ ...l, colour: l.colour || palette[i % palette.length] }));
  return { lines, stations };
}
