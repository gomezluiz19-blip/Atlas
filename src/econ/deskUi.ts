// The commodity desk: raw materials as a business sees them. Pick one and the
// globe shows where it's mined (columns in its colour) and where it's
// processed (white columns, often the real choke point), with streams of it
// flowing between them. Beside that: ten years of prices, how concentrated and
// how risky supply is, the policies moving it, who buys and sells it, and what
// a scenario would do to the price and to them.
import type { App } from "../app";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { bars, gauge, pctTag, priceChart, priceLabel } from "./charts";
import { COMPANIES } from "./companies";
import { EconLayer, flyTilted } from "./globeViz";
import { MARKETS, market, YEARS, type Market } from "./markets";
import { companyImpact, concentration, exposedTo, flows, hhi, priceStats, supplyRisk } from "./model";
import { COUNTRIES, countryName } from "./places";
import { policiesFor } from "./policies";
import { LANES } from "./scenarios";
import { whatIfBar } from "./whatIf";

const SHELVES: { id: string; label: string; test: (m: Market) => boolean }[] = [
  { id: "battery", label: "Battery & tech", test: (m) => ["lithium", "cobalt", "nickel", "rare-earths", "graphite", "tungsten"].includes(m.id) },
  { id: "base", label: "Metals", test: (m) => ["copper", "iron", "aluminium", "zinc", "tin", "manganese", "platinum", "gold", "silver"].includes(m.id) },
  { id: "energy", label: "Energy", test: (m) => ["oil", "lng", "coal", "uranium"].includes(m.id) },
  { id: "food", label: "Food & farming", test: (m) => m.kind === "crop" || ["potash", "phosphate"].includes(m.id) },
];

let layer: EconLayer | null = null;

export function openDesk(ctx: WorkCtx, app: App, id?: string) {
  layer ??= new EconLayer(app, "econ:desk", "Raw materials", "#c77c02", "⛏️");
  const m = id ? market(id) : undefined;
  if (m) return detail(ctx, app, m);
  let shelf = SHELVES[0].id;
  const grid = h("div", { class: "ec-tiles" });
  const fill = () => grid.replaceChildren(...MARKETS.filter(SHELVES.find((s) => s.id === shelf)!.test).map((x) => {
    const st = x.prices ? priceStats(x.prices) : null, risk = supplyRisk(x);
    return h("button", { class: "ec-tile", style: `--c:${x.color}`, onclick: () => detail(ctx, app, x) },
      h("span", { class: "ec-tag" }, x.tag), h("strong", {}, x.name),
      h("small", {}, st ? h("span", {}, "10 yrs ", pctTag(st.change, 0, true)) : "No public price"),
      h("i", { class: `ec-risk r${risk.label === "High" ? 3 : risk.label === "Elevated" ? 2 : 1}`, title: `Supply risk: ${risk.label}` }));
  }));
  const tabs = h("div", { class: "segmented ec-shelves", role: "tablist" }, ...SHELVES.map((s) => {
    const b = h("button", { role: "tab", "aria-selected": String(s.id === shelf), onclick: () => { shelf = s.id; tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b))); fill(); } }, s.label);
    return b;
  }));
  fill();
  // The overview on the globe: where the world's battery metals come from.
  drawOverview(app);
  ctx.show("Commodity desk", () => { layer?.clear(); ctx.home(); },
    h("p", { class: "mp-intro" }, "Raw materials as a business sees them: where they're mined, where they're processed, what they cost, how risky the supply is, the policies moving them and what a shock would do."),
    tabs, grid,
    h("p", { class: "ec-legend" }, h("i", { class: "ec-risk r3" }), " high supply risk  ", h("i", { class: "ec-risk r2" }), " elevated  ", h("i", { class: "ec-risk r1" }), " moderate"),
    h("p", { class: "fineprint" }, "Approximate: USGS, IEA, Energy Institute, FAO and World Bank figures, rounded. Good for the shape of a market, not for trading."));
}

function drawOverview(app: App) {
  const by = new Map<string, number>();
  for (const m of MARKETS.filter((x) => SHELVES[0].test(x))) for (const [c, s] of m.producers) by.set(c, (by.get(c) ?? 0) + s / 6);
  layer!.draw({ columns: [...by].map(([code, v]) => ({ code, value: v, color: "#5b9467", label: v > 6 ? countryName(code) : undefined })) }, "Battery metals: who mines them");
  flyTilted(app, 60, 5, 20_000_000, -62);
}

function detail(ctx: WorkCtx, app: App, m: Market) {
  const risk = supplyRisk(m), st = m.prices ? priceStats(m.prices) : null;
  const top = m.producers[0], topStage = m.stage?.where[0];
  // The globe: mines in the material's colour, processors in white, flows between.
  const draw = (hit?: Set<string>) => layer!.draw({
    columns: [
      ...m.producers.map(([c, s]) => ({ code: c, value: s, color: m.color, label: `${countryName(c)} ${s}%`, offsetKm: m.stage?.where.some(([w]) => w === c) ? -170 : 0 })),
      ...(m.stage?.where ?? []).map(([c, s]) => ({ code: c, value: s, color: "#f2f2f7", label: `${m.stage!.verb.replace(/ in$| by$/, "")} · ${countryName(c)} ${s}%`, offsetKm: m.producers.some(([p]) => p === c) ? 170 : 0 })),
    ],
    flows: flows(m).map((f) => ({ ...f, color: m.color })),
    halos: hit ? [...hit].map((c) => ({ code: c, strength: 0.8, color: "#c4513a" })) : [],
    pins: hit ? (m.lanes ?? []).filter((l) => hit.has(l)).map((l) => ({ lon: LANES[l][0], lat: LANES[l][1], color: "#c4513a", label: l })) : [],
  }, `${m.name}: mined and processed`);
  draw();
  const c0 = COUNTRIES[top[0]];
  if (c0) flyTilted(app, c0.lon, Math.max(-35, Math.min(45, c0.lat)), 15_000_000);

  const chartBox = h("div", { class: "ec-chart-box" }, m.prices ? priceChart(YEARS, m.prices, m.color) : h("p", { class: "muted small" }, "No public benchmark price for this one."));
  const impacts = h("div", { class: "ec-impacts" });
  const buyers = exposedTo(m.id, COMPANIES);
  const who = (side: "buys" | "sells") => buyers.filter((x) => x.side === side).slice(0, 8).map((x) => h("span", { class: "ec-co", title: x.c.about }, h("strong", {}, x.c.ticker), ` ${x.c.name}`));
  const policies = policiesFor(m.id);
  const wi = whatIfBar({
    only: (s) => !!s.shock.prices[m.id],
    title: `What if… (${m.name.toLowerCase()})`,
    openLab: () => void import("./labUi").then((x) => x.openLab(ctx, app)),
    onChange: ({ shock, picked }) => {
      if (!shock) { chartBox.replaceChildren(m.prices ? priceChart(YEARS, m.prices, m.color) : ""); impacts.replaceChildren(); draw(); return; }
      const p = shock.prices[m.id] ?? 0;
      if (m.prices) chartBox.replaceChildren(priceChart(YEARS, m.prices, m.color, m.prices[m.prices.length - 1] * (1 + p / 100)));
      const rows = buyers.map((x) => ({ x, ...companyImpact(x.c, shock) })).sort((a, b) => b.pct - a.pct);
      impacts.replaceChildren(
        h("p", { class: "ec-lede" }, `${picked.map((s) => s.name).join(" + ")}: ${m.name.toLowerCase()} `, pctTag(p, 0, true), m.prices ? ` to about ${priceLabel(m.prices[m.prices.length - 1] * (1 + p / 100), m.unit)}.` : "."),
        h("div", { class: "ec-winlose" },
          h("div", {}, h("h4", {}, "Gain"), ...rows.filter((r) => r.pct > 0.5).slice(0, 4).map((r) => h("div", { class: "ec-wl" }, h("span", {}, r.x.c.name), pctTag(r.pct)))),
          h("div", {}, h("h4", {}, "Lose"), ...rows.filter((r) => r.pct < -0.5).reverse().slice(0, 4).map((r) => h("div", { class: "ec-wl" }, h("span", {}, r.x.c.name), pctTag(r.pct))))),
        h("p", { class: "fineprint" }, "Rough change in yearly profit, before hedging and contracts."));
      draw(new Set([...Object.keys(shock.supply ?? {}), ...(shock.lanes ?? [])]));
    },
  });
  const crit = [m.critical?.us ? "US critical mineral" : "", m.critical?.eu ? "EU critical raw material" : ""].filter(Boolean);
  ctx.show(m.name, () => openDesk(ctx, app),
    h("header", { class: "ec-hero", style: `--c:${m.color}` },
      h("span", { class: "ec-tag lg" }, m.tag),
      h("div", {}, h("h2", {}, m.name), h("p", {}, m.uses), crit.length ? h("div", { class: "ec-badges" }, ...crit.map((c) => h("span", { class: "ec-badge" }, c))) : "")),
    h("div", { class: "ec-kpis" },
      st ? h("div", { class: "ec-kpi" }, h("small", {}, "Price, 2024 average"), h("strong", {}, priceLabel(st.last, m.unit)), h("span", {}, "10 yrs ", pctTag(st.change, 0, true))) : "",
      st ? h("div", { class: "ec-kpi" }, h("small", {}, "Typical year's swing"), h("strong", {}, `±${st.swing}%`), h("span", {}, `peak ${st.peak.year}`)) : "",
      gauge(risk.score, `Supply risk: ${risk.label.toLowerCase()}`, risk.label === "High" ? "#c4513a" : risk.label === "Elevated" ? "#d19a2e" : "#5b9467")),
    chartBox,
    h("h3", { class: "group-title" }, "Where it's mined"),
    h("p", { class: "ec-note" }, `${countryName(top[0])} mines ${top[1]}% of it; the market is ${concentration(hhi(m.producers))} (HHI ${hhi(m.producers).toLocaleString()}).`),
    bars(m.producers.map(([c, s]) => ({ label: countryName(c), value: s })), m.color, 100),
    m.stage && topStage ? h("div", {},
      h("h3", { class: "group-title" }, m.stage.verb),
      h("p", { class: "ec-note" }, topStage[0] === top[0] ? `${countryName(topStage[0])} does both.` : `Mined in ${countryName(top[0])}, but ${topStage[1]}% is ${m.stage.verb.toLowerCase().replace(/ in$| by$/, "")} in ${countryName(topStage[0])}: ${topStage[1] >= 60 ? "that's the real choke point." : "a second dependence."}`),
      bars(m.stage.where.map(([c, s]) => ({ label: countryName(c), value: s })), "#8c8f87", 100)) : "",
    m.lanes?.length ? h("p", { class: "ec-note" }, "Sails through: ", m.lanes.join(", "), ".") : "",
    wi, impacts,
    policies.length ? h("div", {}, h("h3", { class: "group-title" }, "Policies moving it"),
      ...policies.map((p) => h("div", { class: "ec-policy" }, h("div", { class: "ec-policy-head" }, h("strong", {}, p.title), h("span", { class: `ec-status ${p.status.replace(" ", "-")}` }, `${p.status} · ${p.since}`)), h("p", {}, p.what)))) : "",
    buyers.length ? h("div", {}, h("h3", { class: "group-title" }, "Who's exposed"),
      who("sells").length ? h("div", { class: "ec-cos" }, h("small", {}, "Sell it"), ...who("sells")) : "",
      who("buys").length ? h("div", { class: "ec-cos" }, h("small", {}, "Buy it"), ...who("buys")) : "",
      h("button", { class: "pill-btn", onclick: () => void import("./portfolioUi").then((x) => x.openPortfolio(ctx, app)) }, "See it in a portfolio ›")) : "",
    h("p", { class: "fineprint" }, "Mine shares: USGS 2024 and others; processing: IEA 2024; prices: World Bank Pink Sheet (CC BY 4.0) or rounded spot averages. Approximate."));
}
