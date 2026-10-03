// The sums behind the commodity desk, the portfolio map and the What if lab
// (pure, so they can be tested and reused anywhere).
import { company, type Company } from "./companies";
import { MARKETS, market, YEARS, type Market } from "./markets";
import { COUNTRIES } from "./places";
import { POLICIES, type Policy } from "./policies";
import type { Shock } from "./scenarios";

// ---- Raw materials ----

/** Herfindahl–Hirschman index of a list of shares (%), 0–10,000. Above 2,500 is "highly concentrated" (US DoJ). */
export const hhi = (shares: [string, number][]) => Math.round(shares.reduce((a, [, s]) => a + s * s, 0));
export const concentration = (h: number) => (h >= 2500 ? "highly concentrated" : h >= 1500 ? "concentrated" : "spread out");

/** How exposed a material's supply is (0–100): how concentrated mining or processing is, and how stable the places are. */
export function supplyRisk(m: Market): { score: number; mining: number; processing: number; stability: number; label: string } {
  const mining = hhi(m.producers), processing = m.stage ? hhi(m.stage.where) : 0;
  const all = [...m.producers, ...(m.stage?.where ?? [])];
  const weight = all.reduce((a, [, s]) => a + s, 0) || 1;
  const instability = all.reduce((a, [c, s]) => a + s * (COUNTRIES[c]?.risk ?? 0.5), 0) / weight;
  const conc = Math.sqrt(Math.max(mining, processing) / 10000);
  const score = Math.round(100 * Math.min(1, conc * 0.7 + instability * 0.45));
  return { score, mining, processing, stability: Math.round((1 - instability) * 100), label: score >= 65 ? "High" : score >= 45 ? "Elevated" : "Moderate" };
}

export interface PriceStats { first: number; last: number; change: number; peak: { year: number; value: number }; low: { year: number; value: number }; swing: number }
/** Ten years of prices in a few numbers (pure). `swing`: typical year-on-year move, %. */
export function priceStats(prices: number[]): PriceStats {
  const first = prices[0], last = prices[prices.length - 1];
  let pi = 0, li = 0;
  prices.forEach((p, i) => { if (p > prices[pi]) pi = i; if (p < prices[li]) li = i; });
  const yoy = prices.slice(1).map((p, i) => (p / prices[i] - 1) * 100);
  const mean = yoy.reduce((a, b) => a + b, 0) / Math.max(1, yoy.length);
  const swing = Math.sqrt(yoy.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, yoy.length));
  return { first, last, change: Math.round((last / first - 1) * 100), peak: { year: YEARS[pi], value: prices[pi] }, low: { year: YEARS[li], value: prices[li] }, swing: Math.round(swing) };
}

/** Mine → processor flows, weighted by both shares (pure). */
export function flows(m: Market, max = 12): { from: string; to: string; weight: number }[] {
  if (!m.stage) return [];
  const out: { from: string; to: string; weight: number }[] = [];
  for (const [p, ps] of m.producers) for (const [r, rs] of m.stage.where) if (p !== r) out.push({ from: p, to: r, weight: (ps * rs) / 100 });
  return out.sort((a, b) => b.weight - a.weight).slice(0, max);
}

/** Companies that buy or sell a material, most exposed first. */
export function exposedTo(id: string, companies: Company[]): { c: Company; side: "buys" | "sells"; weight: number }[] {
  const out: { c: Company; side: "buys" | "sells"; weight: number }[] = [];
  for (const c of companies) {
    const b = c.inputs.find(([m]) => m === id), s = c.sells?.find(([m]) => m === id);
    if (s) out.push({ c, side: "sells", weight: s[1] });
    else if (b) out.push({ c, side: "buys", weight: b[1] });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ---- Scenarios on companies ----

const ROLE_HIT: Record<string, number> = { Fab: 1, Supplier: 0.8, Plant: 0.6, Mine: 0.6, Field: 0.6, Partner: 0.4, HQ: 0.3 };

export interface Reason { text: string; pct: number }
/** Roughly how a shock moves a company's profits, %, with the reasons (pure). Capped at ±80%. */
export function companyImpact(c: Company, sh: Shock): { pct: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  for (const [id, w] of c.inputs) {
    const p = sh.prices[id];
    if (p) reasons.push({ text: `${market(id)?.name ?? id} it buys ${p > 0 ? "up" : "down"} ${Math.abs(Math.round(p))}%`, pct: -w * p * 0.6 });
  }
  for (const [id, w] of c.sells ?? []) {
    const p = sh.prices[id];
    if (p) reasons.push({ text: `${market(id)?.name ?? id} it sells ${p > 0 ? "up" : "down"} ${Math.abs(Math.round(p))}%`, pct: w * p * 0.8 });
  }
  for (const [code, share] of c.revenue) {
    const d = sh.demand?.[code];
    if (d) reasons.push({ text: `Sales in ${COUNTRIES[code]?.name ?? code} ${d > 0 ? "up" : "down"} ${Math.abs(Math.round(d))}% (${share}% of revenue)`, pct: (share / 100) * d * 1.5 });
  }
  const hit = new Map<string, number>();
  for (const s of c.sites) {
    const loss = sh.supply?.[s.code];
    if (!loss || s.role === "HQ") continue;
    hit.set(s.code, Math.max(hit.get(s.code) ?? 0, (loss / 100) * (ROLE_HIT[s.role] ?? 0.4)));
  }
  for (const [code, h] of hit) {
    const names = c.sites.filter((s) => s.code === code && s.role !== "HQ").map((s) => s.name);
    reasons.push({ text: `${COUNTRIES[code]?.name ?? code} disrupted: ${names.slice(0, 2).join(", ")}`, pct: -h * 35 });
  }
  const lanes = new Set(sh.lanes ?? []);
  if (lanes.size) {
    const via = [...c.inputs, ...(c.sells ?? [])].filter(([id, w]) => w >= 0.1 && market(id)?.lanes?.some((l) => lanes.has(l)));
    if (via.length) reasons.push({ text: `Shipping delays for ${via.map(([id]) => market(id)?.name.toLowerCase()).join(", ")}`, pct: -2 * via.length });
  }
  const pct = Math.max(-80, Math.min(80, reasons.reduce((a, r) => a + r.pct, 0)));
  return { pct: Math.round(pct * 10) / 10, reasons: reasons.filter((r) => Math.abs(r.pct) >= 0.5).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)) };
}

// ---- Portfolios ----

export interface Holding { id: string; value: number }
export const DEMO_PORTFOLIO: Holding[] = [
  { id: "apple", value: 18000 }, { id: "nvidia", value: 14000 }, { id: "tesla", value: 9000 }, { id: "bhp", value: 8000 },
  { id: "nestle", value: 7000 }, { id: "shell", value: 6000 }, { id: "vestas", value: 4000 }, { id: "newmont", value: 4000 },
];

const holdings = (hs: Holding[]) => hs.map((h) => ({ h, c: company(h.id) })).filter((x): x is { h: Holding; c: Company } => !!x.c && x.h.value > 0);
export const totalValue = (hs: Holding[]) => holdings(hs).reduce((a, x) => a + x.h.value, 0);

/** Where the money you've invested earns its revenue, by country (pure). */
export function countryExposure(hs: Holding[]): { code: string; value: number; share: number; from: string[] }[] {
  const total = totalValue(hs) || 1, by = new Map<string, { value: number; from: string[] }>();
  for (const { h, c } of holdings(hs))
    for (const [code, share] of c.revenue) {
      const e = by.get(code) ?? { value: 0, from: [] };
      e.value += (h.value * share) / 100;
      if (!e.from.includes(c.name)) e.from.push(c.name);
      by.set(code, e);
    }
  return [...by].map(([code, e]) => ({ code, value: Math.round(e.value), share: Math.round((e.value / total) * 1000) / 10, from: e.from })).sort((a, b) => b.value - a.value);
}

/** The raw materials behind a portfolio, as a buyer and as a seller (value × weight, pure). */
export function materialExposure(hs: Holding[]): { id: string; buys: number; sells: number }[] {
  const by = new Map<string, { buys: number; sells: number }>();
  for (const { h, c } of holdings(hs)) {
    for (const [id, w] of c.inputs) { const e = by.get(id) ?? { buys: 0, sells: 0 }; e.buys += h.value * w; by.set(id, e); }
    for (const [id, w] of c.sells ?? []) { const e = by.get(id) ?? { buys: 0, sells: 0 }; e.sells += h.value * w; by.set(id, e); }
  }
  return [...by].map(([id, e]) => ({ id, buys: Math.round(e.buys), sells: Math.round(e.sells) })).sort((a, b) => b.buys + b.sells - (a.buys + a.sells));
}

/** Policies that touch a portfolio, the biggest first, with the holdings they touch (pure). */
export function policyRadar(hs: Holding[], policies: Policy[] = POLICIES): { p: Policy; score: number; holdings: string[] }[] {
  const total = totalValue(hs) || 1, out: { p: Policy; score: number; holdings: string[] }[] = [];
  for (const p of policies) {
    let touched = 0;
    const names: string[] = [];
    for (const { h, c } of holdings(hs)) {
      const mats = [...c.inputs, ...(c.sells ?? [])].filter(([id, w]) => w >= 0.05 && p.materials.includes(id));
      const sector = p.sectors?.some((s) => s.toLowerCase() === c.sector.toLowerCase());
      const places = [...p.where, ...(p.bites ?? [])];
      const sales = c.revenue.filter(([code]) => (p.bites ?? []).includes(code)).reduce((a, [, s]) => a + s, 0);
      const sites = c.sites.some((s) => s.role !== "HQ" && places.includes(s.code) && (p.materials.length === 0 || sector));
      const strength = Math.min(1, mats.reduce((a, [, w]) => a + w, 0) * 1.5 + (sector ? 0.4 : 0) + sales / 200 + (sites ? 0.2 : 0));
      if (strength > 0.05) { touched += h.value * strength; names.push(c.name); }
    }
    if (names.length) out.push({ p, score: Math.round((touched / total) * p.weight * 100) / 100, holdings: names });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** A shock on a whole portfolio: each holding's move and the total, by value (pure). */
export function portfolioImpact(hs: Holding[], sh: Shock): { pct: number; value: number; rows: { c: Company; value: number; pct: number; reasons: Reason[] }[] } {
  const rows = holdings(hs).map(({ h, c }) => ({ c, value: h.value, ...companyImpact(c, sh) }));
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  // Profits move more than share prices: a rough half of the profit move reaches the price.
  const pct = rows.reduce((a, r) => a + r.value * r.pct * 0.5, 0) / total;
  return { pct: Math.round(pct * 10) / 10, value: Math.round((pct / 100) * total), rows: rows.sort((a, b) => a.pct - b.pct) };
}

/** Materials a shock moves, biggest first (pure). */
export const priceMoves = (sh: Shock) => Object.entries(sh.prices).filter(([, v]) => Math.abs(v) >= 1).map(([id, v]) => ({ m: market(id), id, pct: Math.round(v) })).filter((x) => x.m).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

export { MARKETS };
