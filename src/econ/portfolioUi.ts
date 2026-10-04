// Your portfolio on the globe: where the companies you own earn their money
// (columns), the supply chains behind them (streams from their suppliers,
// fabs and mines to home), the raw materials they live on, the policies about
// to bite, and what a scenario would do to the lot.
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { pickFile } from "../pro/kit/report";
import { importPositions } from "./brokerImport";
import { bars, pctTag } from "./charts";
import { COMPANIES, company, findCompany } from "./companies";
import { EconLayer, flyTilted, type Flow } from "./globeViz";
import { market } from "./markets";
import { countryExposure, DEMO_PORTFOLIO, materialExposure, policyRadar, portfolioImpact, totalValue, type Holding } from "./model";
import { countryName } from "./places";
import { LANES } from "./scenarios";
import { whatIfBar } from "./whatIf";

const KEY = "atlas.econ.portfolio.v1";
const COLORS = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#64d2ff", "#ffd60a", "#ac8e68", "#5e5ce6", "#ff6482"];
export const loadPortfolio = (): Holding[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => company(x?.id) && x.value > 0) : []; } catch { return []; } };
const save = (hs: Holding[]) => { try { localStorage.setItem(KEY, JSON.stringify(hs)); } catch { /* private mode */ } };
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

let layer: EconLayer | null = null;
type Tab = "earn" | "made" | "policy" | "whatif";

export function openPortfolio(ctx: WorkCtx, app: App) {
  layer ??= new EconLayer(app, "econ:portfolio", "My portfolio", "#0a84ff", "📈");
  let hs = loadPortfolio();
  let tab: Tab = "earn";
  const body = h("div", { class: "pf-body" });
  const holdingsBox = h("div", { class: "pf-holdings" });
  const colorOf = (id: string) => COLORS[Math.max(0, hs.findIndex((x) => x.id === id)) % COLORS.length];

  const ask = h("input", { class: "pro-url", list: "pf-cos", placeholder: "Ticker or company: AAPL, Nestlé, BHP", "aria-label": "Company" }) as HTMLInputElement;
  const amount = h("input", { class: "pro-url pf-amt", type: "number", min: "0", step: "100", placeholder: "Value $", "aria-label": "Value in dollars" }) as HTMLInputElement;
  const note = h("p", { class: "pf-note muted small" });
  const add = () => {
    const c = findCompany(ask.value);
    const v = Number(amount.value) || 1000;
    if (!c) { note.textContent = `Atlas maps ${COMPANIES.length} big companies so far; try one from the list.`; return; }
    hs = [...hs.filter((x) => x.id !== c.id), { id: c.id, value: (hs.find((x) => x.id === c.id)?.value ?? 0) + v }];
    save(hs); ask.value = ""; amount.value = ""; note.textContent = ""; render();
  };
  ask.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  // From a broker: their positions export (CSV), or lines pasted from a statement.
  const paste = h("textarea", { class: "pro-url pf-paste", rows: 4, placeholder: "Paste a positions export, or lines like “AAPL 5000”", "aria-label": "Positions" }) as HTMLTextAreaElement;
  const importNote = h("div", { class: "pf-import-note" });
  const take = (text: string) => {
    const r = importPositions(text);
    if (r.holdings.length) {
      const by = new Map(hs.map((x) => [x.id, x.value]));
      for (const x of r.holdings) by.set(x.id, x.value);
      hs = [...by].map(([id, value]) => ({ id, value }));
      save(hs); render();
    }
    importNote.replaceChildren(
      h("p", {}, r.holdings.length ? `Added ${r.holdings.length} holding${r.holdings.length === 1 ? "" : "s"}.` : "No mapped companies found in that."),
      r.unknown.length ? h("p", { class: "muted small" }, `Not mapped yet: ${r.unknown.slice(0, 12).map((u) => u.symbol).join(", ")}${r.unknown.length > 12 ? "…" : ""} (Atlas maps ${COMPANIES.length} big companies so far).`) : "");
  };
  const importer = h("details", { class: "md-adjust pf-import" }, h("summary", {}, "Import from your broker"),
    h("p", { class: "muted small" }, "Export your positions as CSV (Fidelity, Schwab, Vanguard, E*TRADE, Robinhood, Interactive Brokers all can), then choose the file or paste it. It stays on this device."),
    h("div", { class: "pf-import-row" }, h("button", { class: "pill-btn", onclick: () => void pickFile(".csv,text/csv,text/plain").then((t) => t && take(t)) }, "Choose a CSV file"),
      h("button", { class: "pill-btn", onclick: () => take(paste.value) }, "Import pasted")),
    paste, importNote,
    h("p", { class: "fineprint" }, "Connecting a brokerage account directly (read-only, through an aggregator such as SnapTrade or Plaid Investments) needs Atlas's back end; see docs/brokers.md."));
  amount.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

  const tabs = h("div", { class: "segmented pf-tabs", role: "tablist" }, ...([["earn", "Where it earns"], ["made", "Made of"], ["policy", "Policies"], ["whatif", "What if"]] as [Tab, string][]).map(([id, label]) => {
    const b = h("button", { role: "tab", "aria-selected": String(id === tab), onclick: () => { tab = id; tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b))); render(); } }, label);
    return b;
  }));

  /** Supply chains: from each holding's suppliers, fabs, mines and plants abroad to its home. */
  const chains = (): Flow[] => hs.flatMap((x) => { const c = company(x.id)!; return c.sites.filter((s) => s.role !== "HQ" && s.code !== c.hq).map((s) => ({ from: s.code, to: c.hq, weight: x.value, color: colorOf(c.id) })); });

  function render() {
    const total = totalValue(hs);
    holdingsBox.replaceChildren(...(hs.length ? [
      h("div", { class: "pf-total" }, h("small", {}, "Portfolio"), h("strong", {}, usd(total)), h("span", {}, `${hs.length} holding${hs.length === 1 ? "" : "s"}`)),
      h("div", { class: "pf-ring" }, ...hs.map((x) => h("i", { style: `--c:${colorOf(x.id)};--w:${(x.value / total) * 100}%`, title: `${company(x.id)!.name}: ${Math.round((x.value / total) * 100)}%` }))),
      h("div", { class: "pf-list" }, ...hs.map((x) => {
        const c = company(x.id)!;
        return h("div", { class: "pf-row", style: `--c:${colorOf(x.id)}` }, h("i", {}), h("span", { class: "pf-name" }, h("strong", {}, c.name), h("small", {}, `${c.ticker} · ${c.sector}`)),
          h("span", { class: "pf-val" }, usd(x.value)),
          h("button", { class: "icon-btn pf-x", "aria-label": `Remove ${c.name}`, onclick: () => { hs = hs.filter((y) => y.id !== x.id); save(hs); render(); } }, "✕"));
      }))] : [
      h("div", { class: "pf-empty" }, h("strong", {}, "See where your money really is"), h("p", {}, "Add the companies you own, or start from a demo: the globe shows where they earn, the supply chains and raw materials behind them, and the policies and shocks that could move them."),
        h("button", { class: "primary-btn", onclick: () => { hs = DEMO_PORTFOLIO.map((x) => ({ ...x })); save(hs); render(); } }, "Try a demo portfolio"))]));
    if (!hs.length) { body.replaceChildren(); layer!.clear(); return; }
    if (tab === "earn") earn(); else if (tab === "made") made(); else if (tab === "policy") policy(); else whatIf();
  }

  function earn() {
    const ex = countryExposure(hs), total = totalValue(hs);
    layer!.draw({ columns: ex.map((e) => ({ code: e.code, value: e.share * 1.4, color: "#0a84ff", label: e.share >= 4 ? `${countryName(e.code)} ${e.share}%` : undefined })), flows: chains() }, "My portfolio: where it earns");
    flyTilted(app, 20, 25, 19_000_000, -60);
    const covered = ex.reduce((a, e) => a + e.value, 0);
    body.replaceChildren(
      h("p", { class: "ec-lede" }, `Of every $100 you own, about $${Math.round(((ex[0]?.value ?? 0) / total) * 100)} is earned in ${countryName(ex[0]?.code ?? "US")}`, ex[1] ? ` and $${Math.round((ex[1].value / total) * 100)} in ${countryName(ex[1].code)}.` : "."),
      bars(ex.slice(0, 10).map((e) => ({ label: countryName(e.code), value: e.share, note: `${e.share}%` })), "#0a84ff"),
      h("p", { class: "fineprint" }, `${Math.round((covered / total) * 100)}% of revenue placed by country; the rest is reported as "other". Columns: where your companies sell. Streams: their suppliers, fabs, mines and plants abroad, flowing home.`),
      h("h3", { class: "group-title" }, "Supply chains"),
      ...hs.map((x) => { const c = company(x.id)!; const sites = c.sites.filter((s) => s.role !== "HQ"); return h("details", { class: "pf-chain", style: `--c:${colorOf(c.id)}` },
        h("summary", {}, h("i", {}), h("strong", {}, c.name), h("small", {}, `${sites.length} key sites in ${new Set(sites.map((s) => s.code)).size} countries`)),
        ...sites.map((s) => h("button", { class: "pf-site", onclick: () => app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat, 60_000), duration: 2 }) }, h("span", { class: `pf-role ${s.role.toLowerCase()}` }, s.role), `${s.name} · ${countryName(s.code)}`))); }));
  }

  function made() {
    const mats = materialExposure(hs);
    const by = new Map<string, number>();
    for (const x of mats) { const m = market(x.id); if (m) for (const [c, s] of m.producers) by.set(c, (by.get(c) ?? 0) + ((x.buys + x.sells) * s) / 100); }
    const max = Math.max(1, ...by.values());
    layer!.draw({ columns: [...by].map(([code, v]) => ({ code, value: (v / max) * 55, color: "#ff9f0a", label: v / max > 0.25 ? countryName(code) : undefined })) }, "My portfolio: the raw materials behind it");
    flyTilted(app, 40, 0, 19_000_000, -60);
    const top = Math.max(1, ...mats.map((x) => x.buys + x.sells));
    body.replaceChildren(
      h("p", { class: "ec-lede" }, "The raw materials your companies buy (costs that bite when prices rise) and sell (profits that rise with them). Columns: the countries they're mined in."),
      h("div", { class: "pf-mats" }, ...mats.slice(0, 12).map((x) => { const m = market(x.id)!; return h("button", { class: "pf-mat", style: `--c:${m.color}`, onclick: () => void import("./deskUi").then((d) => d.openDesk(ctx, app, m.id)) },
        h("span", { class: "ec-tag" }, m.tag), h("span", { class: "pf-mat-name" }, h("strong", {}, m.name), h("small", {}, x.sells > x.buys ? "You mostly sell it: rising prices help" : "You mostly buy it: rising prices hurt")),
        h("span", { class: "pf-mat-bar" }, h("i", { class: "buy", style: `width:${(x.buys / top) * 100}%` }), h("i", { class: "sell", style: `width:${(x.sells / top) * 100}%` }))); })),
      h("p", { class: "ec-legend" }, h("i", { class: "pf-key buy" }), " buys  ", h("i", { class: "pf-key sell" }), " sells · tap one for its market"));
  }

  function policy() {
    const radar = policyRadar(hs).slice(0, 10);
    const where = new Map<string, number>();
    for (const r of radar) for (const c of [...r.p.where]) where.set(c, Math.max(where.get(c) ?? 0, r.score));
    const max = Math.max(0.01, ...where.values());
    layer!.draw({ halos: [...where].map(([code, s]) => ({ code, strength: s / max, color: "#ff9f0a", label: countryName(code) })), flows: chains() }, "My portfolio: policies to watch");
    flyTilted(app, 60, 25, 20_000_000, -65);
    body.replaceChildren(
      h("p", { class: "ec-lede" }, radar.length ? `${radar.length} policies touch what you own. The biggest first:` : "No tracked policies touch these holdings."),
      ...radar.map((r) => h("div", { class: "ec-policy" },
        h("div", { class: "ec-policy-head" }, h("strong", {}, r.p.title), h("span", { class: `ec-status ${r.p.status.replace(" ", "-")}` }, `${r.p.status} · ${r.p.since}`)),
        h("p", {}, r.p.what),
        h("div", { class: "pf-touch" }, h("small", {}, `${r.p.where.map(countryName).join(", ")} → `), ...r.holdings.map((n) => h("span", { class: "ec-co" }, n)), h("span", { class: "pf-weight", title: "How much of your portfolio it touches, weighted by how big the policy is" }, "●".repeat(Math.min(5, Math.max(1, Math.round(r.score * 2)))))))),
      h("p", { class: "fineprint" }, "Policies as reported as of late 2025; check the latest before acting."));
  }

  function whatIf() {
    const out = h("div", { class: "pf-wi" }, h("p", { class: "muted" }, "Pick a scenario, or several, to see how your portfolio would take it."));
    const bar = whatIfBar({
      openLab: () => void import("./labUi").then((x) => x.openLab(ctx, app)),
      onChange: ({ shock, picked }) => {
        if (!shock) { out.replaceChildren(h("p", { class: "muted" }, "Pick a scenario, or several, to see how your portfolio would take it.")); earn(); return; }
        const r = portfolioImpact(hs, shock);
        const hit = Object.entries(shock.supply ?? {}).filter(([, v]) => v > 0);
        layer!.draw({
          halos: hit.map(([code, v]) => ({ code, strength: v / 100, color: "#ff453a", label: `${countryName(code)} −${Math.round(v)}%` })),
          pins: (shock.lanes ?? []).map((l) => ({ lon: LANES[l][0], lat: LANES[l][1], color: "#ff453a", label: `${l} closed` })),
          flows: chains().map((f) => ({ ...f, color: hit.some(([c]) => c === f.from) ? "#ff453a" : f.color })),
        }, `What if: ${picked.map((s) => s.name).join(" + ")}`);
        const f = picked[0]?.focus;
        if (f) flyTilted(app, f.lon, f.lat, f.height * 1.5, -55);
        out.replaceChildren(
          h("div", { class: `pf-hit ${r.pct < 0 ? "down" : "up"}` }, h("small", {}, "Your portfolio, roughly"), h("strong", {}, pctTag(r.pct, 1)), h("span", {}, `${r.value < 0 ? "−" : "+"}${usd(Math.abs(r.value))}`)),
          ...r.rows.map((row) => h("details", { class: "pf-imp", style: `--c:${colorOf(row.c.id)}` },
            h("summary", {}, h("i", {}), h("strong", {}, row.c.name), pctTag(row.pct)),
            ...(row.reasons.length ? row.reasons.map((x) => h("div", { class: "pf-why" }, h("span", {}, x.text), pctTag(x.pct))) : [h("div", { class: "pf-why muted" }, "Barely touched.")]))),
          h("p", { class: "fineprint" }, "Rules of thumb, not a forecast: profit moves from the materials each company buys and sells, its sales by country and its sites in harm's way; about half of a profit move reaches the share price."));
      },
    });
    body.replaceChildren(bar, out);
    earn();
    body.replaceChildren(bar, out);
  }

  render();
  ctx.show("My portfolio", () => { layer?.clear(); ctx.home(); },
    h("p", { class: "mp-intro" }, "Where you're invested, as a map: where your companies earn, what they're made of, the policies about to bite and how a shock would land."),
    holdingsBox,
    h("div", { class: "pf-add" }, ask, amount, h("button", { class: "primary-btn", onclick: add }, "Add")), note, importer,
    h("datalist", { id: "pf-cos" }, ...COMPANIES.map((c) => h("option", { value: c.ticker }, c.name))),
    tabs, body);
}
