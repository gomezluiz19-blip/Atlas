import { describe, expect, it } from "vitest";
import { COMPANIES, findCompany } from "../src/econ/companies";
import { MARKETS, market, YEARS } from "../src/econ/markets";
import { companyImpact, concentration, countryExposure, DEMO_PORTFOLIO, exposedTo, flows, hhi, materialExposure, policyRadar, portfolioImpact, priceMoves, priceStats, supplyRisk, totalValue } from "../src/econ/model";
import { COUNTRIES } from "../src/econ/places";
import { POLICIES } from "../src/econ/policies";
import { combine, scaled, scenario, SCENARIOS } from "../src/econ/scenarios";

describe("economy data", () => {
  it("places every producer, processor, revenue country and site", () => {
    const codes = new Set<string>();
    for (const m of MARKETS) for (const [c] of [...m.producers, ...(m.stage?.where ?? [])]) codes.add(c);
    for (const c of COMPANIES) { for (const [code] of c.revenue) codes.add(code); for (const s of c.sites) codes.add(s.code); codes.add(c.hq); }
    for (const p of POLICIES) for (const c of [...p.where, ...(p.bites ?? [])]) codes.add(c);
    for (const s of SCENARIOS) for (const c of [...Object.keys(s.shock.supply ?? {}), ...Object.keys(s.shock.demand ?? {})]) codes.add(c);
    expect([...codes].filter((c) => !COUNTRIES[c])).toEqual([]);
  });
  it("names only materials that exist, with ten years of prices", () => {
    const ids = new Set(MARKETS.map((m) => m.id));
    for (const c of COMPANIES) for (const [id] of [...c.inputs, ...(c.sells ?? [])]) expect(ids.has(id), `${c.id}: ${id}`).toBe(true);
    for (const p of POLICIES) for (const id of p.materials) expect(ids.has(id), `${p.id}: ${id}`).toBe(true);
    for (const s of SCENARIOS) for (const id of Object.keys(s.shock.prices)) expect(ids.has(id), `${s.id}: ${id}`).toBe(true);
    for (const m of MARKETS) if (m.prices) expect(m.prices).toHaveLength(YEARS.length);
    expect(market("oil")?.unit).toBe("$/bbl");
  });
  it("finds companies by ticker or name", () => {
    expect(findCompany("aapl")?.id).toBe("apple");
    expect(findCompany("TSLA")?.id).toBe("tesla");
    expect(findCompany("nest")?.id).toBe("nestle");
    expect(findCompany("")).toBeUndefined();
  });
});

describe("raw materials", () => {
  it("measures concentration", () => {
    expect(hhi([["A", 50], ["B", 50]])).toBe(5000);
    expect(concentration(hhi(market("cobalt")!.producers))).toBe("highly concentrated");
    expect(supplyRisk(market("rare-earths")!).score).toBeGreaterThan(supplyRisk(market("gold")!).score);
    expect(supplyRisk(market("cobalt")!).label).toBe("High");
  });
  it("sums up a price history", () => {
    const st = priceStats(market("lithium")!.prices!);
    expect(st.peak.year).toBe(2022);
    expect(st.change).toBe(100);
    expect(st.swing).toBeGreaterThan(50);
  });
  it("draws flows from mines to refiners, biggest first", () => {
    const f = flows(market("cobalt")!);
    expect(f[0]).toMatchObject({ from: "CD", to: "CN" });
    expect(f.every((x) => x.from !== x.to)).toBe(true);
  });
  it("lists who buys and sells it", () => {
    const ex = exposedTo("lithium", COMPANIES);
    expect(ex[0]).toMatchObject({ side: "sells" });
    expect(ex.some((x) => x.c.id === "tesla" && x.side === "buys")).toBe(true);
  });
});

describe("scenarios and portfolios", () => {
  it("scales and combines shocks", () => {
    const half = scaled(scenario("hormuz")!.shock, 0.5);
    expect(half.prices.oil).toBe(30);
    const both = combine([{ prices: { oil: 50 } }, { prices: { oil: 20 } }]);
    expect(Math.round(both.prices.oil)).toBe(80);
    expect(scaled(scenario("taiwan")!.shock, 0).lanes).toEqual([]);
  });
  it("hurts buyers and helps sellers when prices rise", () => {
    const sh = scenario("drc-cobalt")!.shock;
    expect(companyImpact(COMPANIES.find((c) => c.id === "catl")!, sh).pct).toBeLessThan(0);
    expect(companyImpact(COMPANIES.find((c) => c.id === "albemarle")!, scenario("cn-minerals")!.shock).pct).toBeGreaterThan(0);
    // Glencore mines its cobalt in Congo: the halt takes its volume as the price rises.
    expect(companyImpact(COMPANIES.find((c) => c.id === "glencore")!, sh).reasons.some((r) => /DR Congo disrupted/.test(r.text))).toBe(true);
  });
  it("hits chip companies hardest in a Taiwan blockade", () => {
    const sh = scenario("taiwan")!.shock;
    const nv = companyImpact(COMPANIES.find((c) => c.id === "nvidia")!, sh), ko = companyImpact(COMPANIES.find((c) => c.id === "cocacola")!, sh);
    expect(nv.pct).toBeLessThan(ko.pct);
    expect(nv.reasons[0].text).toMatch(/Taiwan/);
  });
  it("maps a portfolio's exposure, materials, policies and scenario hit", () => {
    expect(totalValue(DEMO_PORTFOLIO)).toBe(70000);
    const ex = countryExposure(DEMO_PORTFOLIO);
    expect(ex[0].code).toBe("US");
    expect(ex.find((e) => e.code === "CN")!.from).toContain("Apple");
    expect(materialExposure(DEMO_PORTFOLIO).map((m) => m.id)).toContain("lithium");
    const radar = policyRadar(DEMO_PORTFOLIO);
    expect(radar.length).toBeGreaterThan(3);
    expect(radar.some((r) => r.p.id === "cn-ree-2025")).toBe(true);
    const hit = portfolioImpact(DEMO_PORTFOLIO, scenario("taiwan")!.shock);
    expect(hit.pct).toBeLessThan(0);
    expect(hit.rows[0].c.id).toBe("nvidia");
  });
  it("lists the prices a shock moves", () => {
    expect(priceMoves(scenario("hormuz")!.shock)[0].id).toBe("lng");
  });
});
