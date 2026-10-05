// The What if lab: play out a shock and watch it travel. Pick ready-made
// scenarios (a blockade, an export ban, a drought), or build your own (a price
// move, a country's output lost, a sea lane shut), set how hard it hits, and
// see the countries and lanes it hits on the globe, the prices it moves, the
// companies that win and lose, and what it does to your portfolio.
import type { App } from "../app";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { bars, pctTag } from "./charts";
import { COMPANIES } from "./companies";
import { EconLayer, flyTilted } from "./globeViz";
import { MARKETS, market } from "./markets";
import { companyImpact, portfolioImpact, priceMoves } from "./model";
import { COUNTRIES, countryName } from "./places";
import { combine, LANES, SCENARIOS, type Shock } from "./scenarios";
import { whatIfBar } from "./whatIf";

let layer: EconLayer | null = null;

export function openLab(ctx: WorkCtx, app: App) {
  layer ??= new EconLayer(app, "econ:lab", "What if", "#c4513a", "⚡");
  layer.clear();
  let preset: { shock: Shock | null; names: string[] } = { shock: null, names: [] };
  // Build your own: one price, one country, one lane.
  const sel = (opts: [string, string][], label: string) => h("select", { class: "pro-url", "aria-label": label }, h("option", { value: "" }, label), ...opts.map(([v, t]) => h("option", { value: v }, t))) as HTMLSelectElement;
  const mSel = sel(MARKETS.map((m) => [m.id, m.name]), "A raw material…");
  const mPct = h("input", { type: "range", min: -60, max: 150, step: 5, value: 40, "aria-label": "Price change" }) as HTMLInputElement;
  const mOut = h("output", {}, "+40%");
  const cSel = sel(Object.entries(COUNTRIES).filter(([c]) => c !== "EU").sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([c, x]) => [c, x.name]), "A country…");
  const cPct = h("input", { type: "range", min: 10, max: 100, step: 5, value: 50, "aria-label": "Output lost" }) as HTMLInputElement;
  const cOut = h("output", {}, "50% of output lost");
  const lSel = sel(Object.keys(LANES).map((l) => [l, l]), "A sea lane…");
  const own = (): Shock | null => {
    const sh: Shock = { prices: {}, supply: {}, lanes: [] };
    if (mSel.value) sh.prices[mSel.value] = Number(mPct.value);
    if (cSel.value) sh.supply![cSel.value] = Number(cPct.value);
    if (lSel.value) sh.lanes!.push(lSel.value);
    return mSel.value || cSel.value || lSel.value ? sh : null;
  };
  for (const el of [mSel, mPct, cSel, cPct, lSel]) el.addEventListener("input", () => {
    mOut.textContent = `${Number(mPct.value) > 0 ? "+" : ""}${mPct.value}%`;
    cOut.textContent = `${cPct.value}% of output lost`;
    run();
  });
  const out = h("div", { class: "lab-out" });

  function run() {
    const mine = own();
    const shock = [preset.shock, mine].filter((x): x is Shock => !!x);
    if (!shock.length) { out.replaceChildren(h("p", { class: "muted" }, "Pick a scenario above, or build your own below.")); layer!.clear(); return; }
    const sh = combine(shock), names = [...preset.names, ...(mine ? ["your own shock"] : [])];
    const moves = priceMoves(sh);
    const hit = Object.entries(sh.supply ?? {}).filter(([, v]) => v > 0);
    const rows = COMPANIES.map((c) => ({ c, ...companyImpact(c, sh) })).filter((r) => Math.abs(r.pct) >= 1).sort((a, b) => a.pct - b.pct);
    // On the globe: hit countries pulse, closed lanes flash, and the materials that jump rise where they're mined.
    const cols = moves.filter((x) => x.pct > 0).slice(0, 3).flatMap((x) => x.m!.producers.slice(0, 3).map(([code, s]) => ({ code, value: s * Math.min(1.5, x.pct / 60), color: x.m!.color, label: `${x.m!.tag} ${countryName(code)}` })));
    layer!.draw({
      halos: hit.map(([code, v]) => ({ code, strength: v / 100, color: "#c4513a", label: `${countryName(code)} −${Math.round(v)}%` })),
      pins: (sh.lanes ?? []).map((l) => ({ lon: LANES[l][0], lat: LANES[l][1], color: "#c4513a", label: `${l} closed` })),
      columns: cols,
    }, `What if: ${names.join(" + ")}`);
    const portfolio = (() => { try { return JSON.parse(localStorage.getItem("atlas.econ.portfolio.v1") ?? "[]"); } catch { return []; } })();
    const pf = Array.isArray(portfolio) && portfolio.length ? portfolioImpact(portfolio, sh) : null;
    out.replaceChildren(
      h("h3", { class: "group-title" }, "Prices"),
      moves.length ? bars(moves.slice(0, 8).map((x) => ({ label: x.m!.name, value: Math.abs(x.pct), note: `${x.pct > 0 ? "+" : "−"}${Math.abs(x.pct)}%`, color: x.pct > 0 ? "#c4513a" : "#5b9467" })), "#c4513a") : h("p", { class: "muted small" }, "No big price moves."),
      hit.length || sh.lanes?.length ? h("p", { class: "ec-note" }, [...hit.map(([c, v]) => `${countryName(c)} loses ${Math.round(v)}% of output`), ...(sh.lanes ?? []).map((l) => `${l} closed`)].join(" · "), ".") : "",
      pf ? h("div", { class: `pf-hit ${pf.pct < 0 ? "down" : "up"}` }, h("small", {}, "Your portfolio"), h("strong", {}, pctTag(pf.pct, 1)),
        h("button", { class: "link-btn", onclick: () => void import("./portfolioUi").then((x) => x.openPortfolio(ctx, app)) }, "Open it ›")) : "",
      h("div", { class: "ec-winlose" },
        h("div", {}, h("h4", {}, "Hit hardest"), ...rows.slice(0, 6).map((r) => h("div", { class: "ec-wl", title: r.reasons.map((x) => x.text).join("; ") }, h("span", {}, r.c.name), pctTag(r.pct)))),
        h("div", {}, h("h4", {}, "Gain most"), ...rows.slice(-6).reverse().filter((r) => r.pct > 0).map((r) => h("div", { class: "ec-wl", title: r.reasons.map((x) => x.text).join("; ") }, h("span", {}, r.c.name), pctTag(r.pct))))),
      moves[0] ? h("button", { class: "pill-btn", onclick: () => void import("./deskUi").then((d) => d.openDesk(ctx, app, moves[0].id)) }, `${market(moves[0].id)!.name} on the commodity desk ›`) : "",
      h("p", { class: "fineprint" }, "Rough changes in yearly profit for the companies Terreno maps; judgement-based shock sizes anchored on past episodes. For comparing exposures, not forecasting."));
  }

  const bar = whatIfBar({
    title: "Pick scenarios (they stack)",
    onChange: ({ shock, picked }) => {
      preset = { shock, names: picked.map((s) => s.name) };
      const f = picked[picked.length - 1]?.focus;
      if (f) flyTilted(app, f.lon, f.lat, f.height * 1.5, -55);
      run();
    },
  });
  run();
  ctx.show("What if…", () => { layer?.clear(); ctx.home(); },
    h("p", { class: "mp-intro" }, `Play out a shock and watch it travel: ${SCENARIOS.length} ready-made scenarios, or build your own. Prices, countries, sea lanes, companies and your portfolio react together.`),
    bar,
    h("details", { class: "lab-own" }, h("summary", {}, "Build your own shock"),
      h("div", { class: "lab-row" }, mSel, h("label", { class: "wi-sev" }, mPct, mOut)),
      h("div", { class: "lab-row" }, cSel, h("label", { class: "wi-sev" }, cPct, cOut)),
      h("div", { class: "lab-row" }, lSel)),
    out);
}
