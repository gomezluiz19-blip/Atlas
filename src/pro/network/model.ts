// A business as a network on the map: its own sites, its partners, and what
// moves between them (goods, people, money, data), how much and how. Pure
// functions for distance, time on the way and carbon, per flow and in total.
import { newId } from "../../work/store";

export type NodeKind = "hq" | "store" | "warehouse" | "factory" | "office" | "farm" | "supplier" | "customer" | "partner" | "port";
export type FlowKind = "goods" | "people" | "money" | "data";
export type Mode = "truck" | "van" | "rail" | "ship" | "air" | "transit" | "walk" | "digital";
export type Per = "day" | "week" | "month" | "year";

export interface NetNode { id: string; name: string; kind: NodeKind; lon: number; lat: number; address?: string; notes?: string; people?: number }
export interface Flow { id: string; from: string; to: string; what: string; kind: FlowKind; amount: number; unit: string; per: Per; mode: Mode }
export interface Network { id: string; name: string; nodes: NetNode[]; flows: Flow[]; created: number; demo?: boolean }

export const NODE_KINDS: Record<NodeKind, { label: string; emoji: string; ours: boolean }> = {
  hq: { label: "Head office", emoji: "🏢", ours: true }, store: { label: "Shop", emoji: "🏬", ours: true }, warehouse: { label: "Warehouse", emoji: "📦", ours: true },
  factory: { label: "Factory", emoji: "🏭", ours: true }, office: { label: "Office", emoji: "🏢", ours: true }, farm: { label: "Farm", emoji: "🌾", ours: false },
  supplier: { label: "Supplier", emoji: "🚚", ours: false }, customer: { label: "Customer", emoji: "🛒", ours: false }, partner: { label: "Partner", emoji: "🤝", ours: false },
  port: { label: "Port", emoji: "⚓", ours: false },
};
export const FLOW_KINDS: Record<FlowKind, { label: string; color: string }> = {
  goods: { label: "Goods", color: "#d19a2e" }, people: { label: "People", color: "#3563d6" }, money: { label: "Money", color: "#5b9467" }, data: { label: "Data", color: "#8b5fa8" },
};
/** How each way of moving goes: road-distance factor, speed (km/h), hours of handling, and carbon (kg CO2 per tonne-km for goods, per passenger-km for people). */
export const MODES: Record<Mode, { label: string; detour: number; kmh: number; handling: number; goodsCO2: number; peopleCO2: number }> = {
  truck: { label: "Truck", detour: 1.3, kmh: 65, handling: 2, goodsCO2: 0.105, peopleCO2: 0.17 },
  van: { label: "Van", detour: 1.3, kmh: 35, handling: 0.5, goodsCO2: 0.25, peopleCO2: 0.17 },
  rail: { label: "Rail", detour: 1.25, kmh: 55, handling: 6, goodsCO2: 0.028, peopleCO2: 0.035 },
  ship: { label: "Ship", detour: 1.4, kmh: 30, handling: 48, goodsCO2: 0.012, peopleCO2: 0.1 },
  air: { label: "Air", detour: 1.05, kmh: 780, handling: 6, goodsCO2: 0.6, peopleCO2: 0.15 },
  transit: { label: "Public transport", detour: 1.3, kmh: 22, handling: 0.2, goodsCO2: 0, peopleCO2: 0.05 },
  walk: { label: "Walk or bike", detour: 1.25, kmh: 5, handling: 0, goodsCO2: 0, peopleCO2: 0 },
  digital: { label: "Digital", detour: 0, kmh: 0, handling: 0, goodsCO2: 0, peopleCO2: 0 },
};
const PER_YEAR: Record<Per, number> = { day: 365, week: 52, month: 12, year: 1 };

/** Great-circle kilometres. */
export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export interface FlowFacts { km: number; hours: number; perYear: number; tonnesPerYear?: number; tkm?: number; co2t?: number }

/** One flow's distance on the way, time door to door, yearly volume and carbon (pure). */
export function flowFacts(f: Flow, from: NetNode, to: NetNode): FlowFacts {
  const m = MODES[f.mode];
  const km = kmBetween(from, to) * m.detour;
  const hours = f.mode === "digital" ? 0 : km / m.kmh + m.handling;
  const perYear = f.amount * PER_YEAR[f.per];
  const unit = f.unit.toLowerCase();
  const tonnes = /^(t|tonnes?|tons?)$/.test(unit) ? perYear : /^kg$/.test(unit) ? perYear / 1000 : undefined;
  if (f.kind === "goods" && tonnes !== undefined) return { km, hours, perYear, tonnesPerYear: tonnes, tkm: tonnes * km, co2t: (tonnes * km * m.goodsCO2) / 1000 };
  if (f.kind === "people") return { km, hours, perYear, co2t: (perYear * km * m.peopleCO2) / 1000 };
  return { km, hours, perYear };
}

/** The whole network: sites, partners, moves a year, tonne-km, carbon and the longest leg (pure). */
export function networkFacts(n: Network) {
  const byId = new Map(n.nodes.map((x) => [x.id, x]));
  const flows = n.flows.flatMap((f) => { const a = byId.get(f.from), b = byId.get(f.to); return a && b ? [{ f, a, b, x: flowFacts(f, a, b) }] : []; });
  const physical = flows.filter((r) => r.f.mode !== "digital");
  return {
    sites: n.nodes.filter((x) => NODE_KINDS[x.kind].ours).length,
    partners: n.nodes.filter((x) => !NODE_KINDS[x.kind].ours).length,
    tkm: flows.reduce((s, r) => s + (r.x.tkm ?? 0), 0),
    co2t: flows.reduce((s, r) => s + (r.x.co2t ?? 0), 0),
    longest: [...physical].sort((p, q) => q.x.km - p.x.km)[0],
    slowest: [...physical].sort((p, q) => q.x.hours - p.x.hours)[0],
    /** The flows that make most of the carbon, biggest first. */
    heaviest: [...flows].filter((r) => r.x.co2t).sort((p, q) => q.x.co2t! - p.x.co2t!).slice(0, 3),
    flows,
  };
}

export const blankNetwork = (name = "My business"): Network => ({ id: newId(), name, nodes: [], flows: [], created: Date.now() });

/** "3 h", "2.5 days", "3 weeks". */
export function duration(hours: number): string {
  if (hours <= 0) return "instant";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 36) return `${Math.round(hours)} h`;
  const d = hours / 24;
  return d < 14 ? `${d.toFixed(d < 3 ? 1 : 0)} days` : `${Math.round(d / 7)} weeks`;
}
