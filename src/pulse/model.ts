// Pulse: everything someone has in Terreno, as one living picture of the world
// at a moment in time. Their places glow; what they've planned brightens as
// it nears; their shipments ride their sea lanes to where they'd be that day;
// relief loads move between warehouses; building sites, mines, customers and
// business partners hold their places, joined by what moves between them.
// Pure functions over what's saved: give it a time, get the picture.
import { gatherAll, shade } from "../plans/gather";
import { eta, VESSEL_TYPES, type Desk } from "../pro/shipping/model";
import { along, interp, type LonLat } from "../pro/shipping/sea";

export type Layer = "places" | "plans" | "freight" | "relief" | "sites" | "network";
export const LAYERS: Record<Layer, { label: string; color: string }> = {
  places: { label: "Places", color: "#ffc46b" },
  plans: { label: "Plans", color: "#5ab0ff" },
  freight: { label: "Freight", color: "#5ad8ff" },
  relief: { label: "Relief", color: "#5dffa8" },
  sites: { label: "Sites", color: "#ffb347" },
  network: { label: "Network", color: "#b59bff" },
};

export interface Anchor { id: string; layer: Layer; lon: number; lat: number; color: string; label: string; size: number; pulse?: boolean }
export interface Lane { id: string; layer: Layer; pts: LonLat[]; color: string; dashed?: boolean; /** 0–1: how much of the lane is behind the mover. */ done?: number }
export interface Mover { id: string; layer: Layer; lon: number; lat: number; color: string; label: string; heading?: number }
export interface World { t: number; anchors: Anchor[]; lanes: Lane[]; movers: Mover[]; counts: Record<Layer, number> }

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const read = <T>(key: string): T[] => { try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

/** A great-circle arc between two points, for drawing (pure). */
export function arcPts(a: LonLat, b: LonLat, n = 48): LonLat[] { return Array.from({ length: n + 1 }, (_, i) => interp(a, b, i / n)); }

/** Where something moving from a to b between two times is at `t` (pure): null before it leaves or after it lands. */
export function between(a: LonLat, b: LonLat, leave: number, arrive: number, t: number): { p: LonLat; f: number } | null {
  if (t < leave || t > arrive || arrive <= leave) return null;
  const f = (t - leave) / (arrive - leave);
  return { p: interp(a, b, f), f };
}

/** The bearing from a to b, degrees from north (pure). */
export function bearing(a: LonLat, b: LonLat): number {
  const r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Everything saved, as the world looks at time `t` (reads localStorage). */
export function worldAt(t: number, closed?: string[]): World {
  const anchors: Anchor[] = [], lanes: Lane[] = [], movers: Mover[] = [];
  const day = isoDay(t);

  // Your places: warm and steady.
  for (const p of read<{ id: string; name: string; lon: number; lat: number }>("atlas.myplaces.v1"))
    anchors.push({ id: `p${p.id}`, layer: "places", lon: p.lon, lat: p.lat, color: LAYERS.places.color, label: p.name, size: 1.4, pulse: true });

  // Plans: the nearer, the brighter (the same scale as My plans); trips joined leg by leg.
  const plans = gatherAll().filter((x) => x.source !== "Shipment" && x.source !== "Relief");
  const byGroup = new Map<string, typeof plans>();
  for (const x of plans) {
    const d = Math.round((Date.parse(x.date + "T12:00:00Z") - Date.parse(day + "T12:00:00Z")) / DAY);
    if (d < -14 || d > 120) continue;
    anchors.push({ id: `pl${x.id}`, layer: "plans", lon: x.lon, lat: x.lat, color: shade(Math.max(0, d), 90), label: `${x.title}`, size: d >= 0 && d <= 7 ? 1.1 : 0.8, pulse: d >= 0 && d <= 2 });
    if (x.group) byGroup.set(x.group, [...(byGroup.get(x.group) ?? []), x]);
  }
  for (const [g, xs] of byGroup) for (let i = 1; i < xs.length; i++) lanes.push({ id: `pg${g}${i}`, layer: "plans", pts: arcPts([xs[i - 1].lon, xs[i - 1].lat], [xs[i].lon, xs[i].lat], 24), color: LAYERS.plans.color, dashed: xs[i].date < day });

  // Freight: each open shipment on its lane, its ship where it would be that day.
  for (const d of read<Desk>("atlas.pro.shipping.v1")) for (const s of d.shipments ?? []) {
    if (s.stage === "delivered") continue;
    const e = eta(d, s, t, closed ?? d.closed);
    if (!e.route) continue;
    const total = e.doneKm + e.leftKm;
    lanes.push({ id: `fl${s.id}`, layer: "freight", pts: e.route.pts, color: e.late >= 3 ? "#ff9f0a" : LAYERS.freight.color, done: total ? e.doneKm / total : 0 });
    if ((e.basis === "live" || e.basis === "estimated") && e.leftKm > 1) {
      const ahead = along(e.route.pts, e.doneKm + 300).p;
      const v = d.vessels?.find((x) => x.id === s.vessel);
      movers.push({ id: `sh${s.id}`, layer: "freight", lon: e.at[0], lat: e.at[1], color: e.late >= 3 ? "#ff9f0a" : "#ffffff", label: `${VESSEL_TYPES[v?.type ?? "container"].emoji} ${s.ref}`, heading: bearing(e.at, ahead) });
    }
    anchors.push({ id: `fo${s.id}`, layer: "freight", lon: s.dest.lon, lat: s.dest.lat, color: LAYERS.freight.color, label: s.dest.name, size: 0.7 });
  }

  // Relief: warehouses and points, loads moving along their legs.
  for (const n of read<{ hubs: { id: string; name: string; kind: string; lon: number; lat: number }[]; moves: { id: string; item: string; qty: number; from: string; to: string; left: string; arrives: string; status: string }[] }>("atlas.pro.relief.v1")) {
    const hub = (id: string) => n.hubs.find((x) => x.id === id);
    for (const x of n.hubs) anchors.push({ id: `rh${x.id}`, layer: "relief", lon: x.lon, lat: x.lat, color: LAYERS.relief.color, label: x.name, size: x.kind === "point" ? 0.8 : 1 });
    for (const m of n.moves ?? []) {
      const a = hub(m.from), b = hub(m.to);
      if (!a || !b) continue;
      const leave = Date.parse(m.left + "T06:00:00Z"), arrive = Date.parse(m.arrives + "T18:00:00Z");
      lanes.push({ id: `rl${m.id}`, layer: "relief", pts: arcPts([a.lon, a.lat], [b.lon, b.lat], 24), color: m.status === "delayed" ? "#ff9f0a" : LAYERS.relief.color, dashed: true });
      const at = between([a.lon, a.lat], [b.lon, b.lat], leave, arrive, t);
      if (at) movers.push({ id: `rm${m.id}`, layer: "relief", lon: at.p[0], lat: at.p[1], color: "#ffffff", label: `${m.qty} ${m.item}`, heading: bearing([a.lon, a.lat], [b.lon, b.lat]) });
    }
  }

  // Sites: building sites, mines, customer sites.
  for (const f of read<{ projects: { id: string; name: string; lon: number; lat: number }[] }>("atlas.pro.build.v1")) for (const p of f.projects ?? []) anchors.push({ id: `b${p.id}`, layer: "sites", lon: p.lon, lat: p.lat, color: LAYERS.sites.color, label: p.name, size: 1 });
  for (const m of read<{ id: string; name: string; sites: { id: string; name: string; lon: number; lat: number; kind: string }[] }>("atlas.pro.mines.v1")) {
    const pit = m.sites.find((s) => s.kind === "pit" || s.kind === "underground") ?? m.sites[0];
    if (pit) anchors.push({ id: `m${m.id}`, layer: "sites", lon: pit.lon, lat: pit.lat, color: LAYERS.sites.color, label: m.name, size: 1.2 });
  }
  for (const c of read<{ accounts: { id: string; site: string; lon: number; lat: number }[] }>("atlas.pro.services.v1")) for (const a of c.accounts ?? []) anchors.push({ id: `a${a.id}`, layer: "sites", lon: a.lon, lat: a.lat, color: LAYERS.sites.color, label: a.site, size: 0.8 });

  // Business networks: nodes, and arcs for what flows.
  for (const n of read<{ nodes: { id: string; name: string; lon: number; lat: number }[]; flows: { id: string; from: string; to: string }[] }>("atlas.pro.networks.v1")) {
    for (const x of n.nodes ?? []) anchors.push({ id: `n${x.id}`, layer: "network", lon: x.lon, lat: x.lat, color: LAYERS.network.color, label: x.name, size: 0.8 });
    for (const fl of n.flows ?? []) { const a = n.nodes.find((x) => x.id === fl.from), b = n.nodes.find((x) => x.id === fl.to); if (a && b) lanes.push({ id: `nf${fl.id}`, layer: "network", pts: arcPts([a.lon, a.lat], [b.lon, b.lat], 32), color: LAYERS.network.color }); }
  }

  const counts = Object.fromEntries((Object.keys(LAYERS) as Layer[]).map((l) => [l, anchors.filter((a) => a.layer === l).length + movers.filter((m) => m.layer === l).length])) as Record<Layer, number>;
  return { t, anchors, lanes, movers, counts };
}

/** The span the time scrub covers around now: a month back, a quarter ahead (pure). */
export const SPAN = { back: 30, ahead: 90 };
export const tAt = (now: number, frac: number) => now + (frac * (SPAN.back + SPAN.ahead) - SPAN.back) * DAY;
export const fracAt = (now: number, t: number) => ((t - now) / DAY + SPAN.back) / (SPAN.back + SPAN.ahead);
