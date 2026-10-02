// The land around a place for the hologram: water (lakes, ponds, rivers,
// the shoreline), swimming pools, and trees, single ones and whole woods.
// From OpenStreetMap, plus whatever you've added yourself (a pool, your
// trees), since private gardens are rarely mapped. Pure functions; the
// drawing is in holo.ts.
type LL = [number, number];

export interface Water { ring: LL[]; name?: string; kind: "lake" | "pond" | "river" | "sea" | "wetland" | "water" }
export interface Land {
  water: Water[];
  /** Rivers and streams too narrow to be mapped as areas. */
  streams: { line: LL[]; name?: string }[];
  pools: LL[][];
  trees: LL[];
  woods: LL[][];
}

export const emptyLand = (): Land => ({ water: [], streams: [], pools: [], trees: [], woods: [] });

/** One Overpass query for the water, pools and trees around a point (pure). */
export function landQuery(lon: number, lat: number, m: number): string {
  const a = `(around:${Math.round(m)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  return `[out:json][timeout:30];(
nwr["natural"~"^(water|wetland|wood)$"]${a};
nwr["landuse"~"^(forest|reservoir|basin)$"]${a};
nwr["waterway"~"^(riverbank|river|stream|canal|brook)$"]${a};
way["natural"="coastline"]${a};
nwr["leisure"="swimming_pool"]${a};
node["natural"="tree"]${a};
);out geom 4000;`;
}

interface El { type: string; id?: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] }

const same = (a: LL, b: LL) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Joins way pieces that share ends into closed rings (a lake drawn as several ways) (pure). */
export function joinRings(parts: LL[][]): LL[][] {
  const left = parts.filter((p) => p.length > 1).map((p) => [...p]), rings: LL[][] = [];
  while (left.length) {
    let cur = left.shift()!;
    let grew = true;
    while (!same(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const p = left[i], end = cur[cur.length - 1];
        if (same(p[0], end)) cur = [...cur, ...p.slice(1)];
        else if (same(p[p.length - 1], end)) cur = [...cur, ...[...p].reverse().slice(1)];
        else if (same(p[p.length - 1], cur[0])) cur = [...p, ...cur.slice(1)];
        else if (same(p[0], cur[0])) cur = [...[...p].reverse(), ...cur.slice(1)];
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    // An open piece (cut by the query's edge) is closed straight across: good enough inside the disc.
    if (cur.length > 2) rings.push(cur);
  }
  return rings;
}

const kindOf = (t: Record<string, string>): Water["kind"] =>
  t.natural === "wetland" ? "wetland" : t.water === "pond" ? "pond" : t.water === "river" || t.waterway === "riverbank" ? "river" : t.water === "lake" || t.water === "reservoir" || t.landuse === "reservoir" ? "lake" : "water";

/** The query's answer as land (pure). */
export function toLand(els: El[]): Land {
  const land = emptyLand();
  const geo = (g?: { lat: number; lon: number }[]) => (g ?? []).map((p) => [p.lon, p.lat] as LL);
  const rings = (e: El): LL[][] => e.type === "way" ? [geo(e.geometry)] : e.type === "relation" ? joinRings((e.members ?? []).filter((m) => m.role !== "inner").map((m) => geo(m.geometry))) : [];
  for (const e of els) {
    const t = e.tags ?? {};
    if (t.natural === "tree" && e.lat !== undefined && e.lon !== undefined) { land.trees.push([e.lon, e.lat]); continue; }
    if (t.leisure === "swimming_pool") { for (const r of rings(e)) if (r.length > 2) land.pools.push(r); continue; }
    if (t.natural === "wood" || t.landuse === "forest") { for (const r of rings(e)) if (r.length > 2) land.woods.push(r); continue; }
    if (t.natural === "coastline") { const g = geo(e.geometry); if (g.length > 1) land.streams.push({ line: g, name: "Shoreline" }); continue; }
    if (/^(river|stream|canal|brook)$/.test(t.waterway ?? "") && e.type === "way") { const g = geo(e.geometry); if (g.length > 1) land.streams.push({ line: g, name: t.name }); continue; }
    if (t.natural === "water" || t.natural === "wetland" || t.waterway === "riverbank" || /^(reservoir|basin)$/.test(t.landuse ?? ""))
      for (const r of rings(e)) if (r.length > 2) land.water.push({ ring: r, name: t.name, kind: kindOf(t) });
  }
  return land;
}

/** Adds what you've marked yourself (pure). */
export function withYours(land: Land, yours?: { pools?: LL[][]; trees?: LL[] }): Land {
  return { ...land, pools: [...land.pools, ...(yours?.pools ?? [])], trees: [...land.trees, ...(yours?.trees ?? [])] };
}

// ---- Geometry in metres around the place ---------------------------------------------------------------

/** Clips a polygon (x, z in metres) to a convex polygon, Sutherland–Hodgman (pure). */
export function clipConvex(poly: LL[], clip: LL[]): LL[] {
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], inside = (p: LL) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cut = (p: LL, q: LL): LL => { const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1]; const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d; return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]; };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
}

/** A circle as a counter-clockwise polygon (pure). */
export const circle = (r: number, n = 64): LL[] => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * 2 * Math.PI) * r, Math.sin((i / n) * 2 * Math.PI) * r]);

/** Ray-cast point in polygon (pure). */
export function inRing(ring: LL[], [x, y]: LL): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Trees spread through a wood at about `spacing` metres, a little jittered, the same every time (pure). */
export function scatter(ring: LL[], spacing = 9, max = 600): LL[] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const out: LL[] = [];
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = s + spacing / 2; y < n && out.length < max; y += spacing)
    for (let x = w + spacing / 2; x < e && out.length < max; x += spacing) {
      const p: LL = [x + (rnd() - 0.5) * spacing * 0.8, y + (rnd() - 0.5) * spacing * 0.8];
      if (inRing(ring, p)) out.push(p);
    }
  return out;
}

const segDist = ([px, py]: LL, [ax, ay]: LL, [bx, by]: LL) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** The shortest distance (m) from any point of a shape to an edge or line, 0 if inside a ring (pure). */
export function distanceTo(points: LL[], rings: LL[][], lines: LL[][] = []): number {
  let best = Infinity;
  for (const p of points) {
    for (const r of rings) {
      if (inRing(r, p)) return 0;
      for (let i = 0; i < r.length; i++) best = Math.min(best, segDist(p, r[i], r[(i + 1) % r.length]));
    }
    for (const l of lines) for (let i = 0; i < l.length - 1; i++) best = Math.min(best, segDist(p, l[i], l[i + 1]));
  }
  return best;
}

/** The survey's line about the land (pure). */
export function landLine(s: { trees: number; pools: number; water?: { name?: string; kind: string; m: number } }): string {
  const bits: string[] = [];
  if (s.water) {
    const what = s.water.name ?? `a ${s.water.kind}`;
    bits.push(s.water.m <= 80 ? `Waterfront on ${what}, ${Math.round(s.water.m)} m to the water` : `${what} ${Math.round(s.water.m)} m away`);
  }
  if (s.trees) bits.push(`${s.trees.toLocaleString()} tree${s.trees === 1 ? "" : "s"}`);
  if (s.pools) bits.push(`${s.pools} pool${s.pools === 1 ? "" : "s"}`);
  return bits.length ? `✓ ${bits.join(" · ")}` : "△ No trees, pool or water mapped here: add yours";
}
