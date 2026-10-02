// Work › Finance and Work › Banking.
//   Company explorer: any company's shape, its owners above, everything it
//     owns and its partners around it, as a constellation and as lines on the
//     globe from its head office; its tickers, a live quote when a key is set,
//     and the figures it reports year by year as small charts.
//   Markets now: the world's exchanges following the sun, each one's trading
//     day on a shared 24-hour strip with the moment now running down it.
//   Watchlist: the companies you follow, on the map, and where your money is.
//   Banks near you, and Branch coverage: every branch and ATM around a place,
//     each bank's share of the branches, and the patches more than 2 km from
//     any branch.
import { Cartesian2 } from "cesium";
import type { App } from "../app";
import { arcFlow, empty, frame, OpsMap, title } from "../pro/kit/ui";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import type { WorkFeature } from "../work/layer";
import { branchesNear, brandNear, companyFacts, companyFigures, companyTies, quote, searchCompanies } from "./data";
import {
  companyLinks, EXCHANGES, gaps, growth, margin, money, METRICS, session, sessionUtc, shares, TIES, until,
  type Branch, type Facts, type Figures, type Metric, type Tie, type Tied,
} from "./model";

const NS = "http://www.w3.org/2000/svg";
const svgEl = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number> = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };
const tip = (el: SVGElement, text: string) => { const t = svgEl("title"); t.textContent = text; el.append(t); return el; };

/** Categorical slots, in fixed order (validated palette). */
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER = "#9a9893";
const TIE_ORDER: Tie[] = ["parent", "owner", "subsidiary", "division", "owns", "partner", "member"];
const tieColor = (t: Tie) => SLOTS[TIE_ORDER.indexOf(t)];

let map: OpsMap | null = null;
const opsMap = (app: App) => (map ??= new OpsMap(app, "finance", "#2a78d6"));

// ---- Watchlist --------------------------------------------------------------------------------------

const WATCH = "atlas.fin.watch.v1";
interface Watched { id: string; name: string; ticker?: string; country?: string; lon?: number; lat?: number }
const watched = (): Watched[] => { try { return JSON.parse(localStorage.getItem(WATCH) ?? "[]") as Watched[]; } catch { return []; } };
const setWatched = (w: Watched[]) => { try { localStorage.setItem(WATCH, JSON.stringify(w)); } catch { /* private mode */ } };

// ---- Company explorer -----------------------------------------------------------------------------

const PICKS = {
  finance: ["Apple Inc.", "Berkshire Hathaway", "Toyota", "LVMH", "Saudi Aramco", "Tencent", "Nestlé"],
  bank: ["JPMorgan Chase", "HSBC", "Bank of America", "BNP Paribas", "Mitsubishi UFJ Financial Group", "Industrial and Commercial Bank of China", "Banco Santander"],
};

export function openCompany(ctx: WorkCtx, app: App, kind: "finance" | "bank" = "finance", id?: string) {
  const status = h("p", { class: "muted small" });
  const results = h("div", { class: "list" });
  const input = h("input", { class: "pro-url", placeholder: kind === "bank" ? "A bank or banking group: HSBC, Chase, Santander…" : "A company: Apple, Toyota, a local utility…", "aria-label": "Company" }) as HTMLInputElement;
  const find = async (q: string, first = false) => {
    if (!q.trim()) return;
    status.textContent = "Searching Wikidata…";
    const hits = await searchCompanies(q).catch(() => []);
    status.textContent = hits.length ? "" : "Nothing by that name.";
    if (first && hits[0]) { showCompany(ctx, app, hits[0].id, kind); return; }
    results.replaceChildren(...hits.map((x) => h("button", { class: "list-row", onclick: () => showCompany(ctx, app, x.id, kind) }, h("span", { class: "sc-row-main" }, h("strong", {}, x.name), h("small", {}, x.about ?? x.id)))));
  };
  input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void find(input.value); });
  if (id) { showCompany(ctx, app, id, kind); return; }
  ctx.show(kind === "bank" ? "Bank explorer" : "Company explorer", ctx.home,
    h("p", { class: "sc-lede" }, kind === "bank"
      ? "Any bank: the group that owns it and everything it owns, where each is, its listings and figures, and its branches near you."
      : "Any company: who owns it, what it owns, its partners, where each is, its stock and its figures year by year."),
    h("div", { class: "build-log-form" }, input, h("button", { class: "pill-btn", onclick: () => void find(input.value) }, "Find")),
    h("div", { class: "chips wrap" }, ...PICKS[kind].map((n) => h("button", { class: "chip", onclick: () => void find(n, true) }, n))),
    status, results,
    h("p", { class: "fineprint" }, "From Wikidata (CC0): what volunteers and companies' own reports have recorded, so some companies have more than others."));
}

/** Small bar charts, one per figure (one scale each: never two on one axis). */
function figureCharts(f: Figures): HTMLElement {
  const show = (["revenue", "profit", "assets", "marketCap", "staff"] as Metric[]).filter((m) => (f[m]?.length ?? 0) >= 2);
  if (!show.length) return empty("No yearly figures recorded for this one yet.");
  return h("div", { class: "fin-charts" }, ...show.map((m) => {
    const pts = f[m]!, W = 220, H = 74, pad = 2, max = Math.max(...pts.map((p) => Math.abs(p.amount)), 1);
    const neg = pts.some((p) => p.amount < 0), base = neg ? H / 2 : H - 12;
    const bw = (W - pad * 2) / pts.length;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "fin-bars", role: "img", "aria-label": `${METRICS[m].label} by year` });
    svg.append(svgEl("line", { x1: 0, x2: W, y1: base, y2: base, class: "fin-base" }));
    pts.forEach((p, i) => {
      const hgt = (Math.abs(p.amount) / max) * (neg ? H / 2 - 4 : H - 16), x = pad + i * bw + 1, w = Math.max(2, bw - 2);
      const y = p.amount >= 0 ? base - hgt : base;
      const fmt = m === "staff" ? `${Math.round(p.amount).toLocaleString()} people` : money(p.amount, p.unit);
      svg.append(tip(svgEl("rect", { x, y, width: w, height: Math.max(1, hgt), rx: Math.min(2, w / 2), class: "fin-bar" + (p.amount < 0 ? " neg" : "") + (i === pts.length - 1 ? " last" : "") }), `${p.year}: ${fmt}`));
    });
    const first = svgEl("text", { x: pad, y: H - 1, class: "fin-yr" }); first.textContent = String(pts[0].year);
    const last = svgEl("text", { x: W - pad, y: H - 1, class: "fin-yr", "text-anchor": "end" }); last.textContent = String(pts[pts.length - 1].year);
    svg.append(first, last);
    const end = pts[pts.length - 1], g = growth(pts);
    return h("div", { class: "fin-chart" },
      h("div", { class: "fin-chart-head" }, h("span", {}, METRICS[m].label), h("strong", {}, m === "staff" ? Math.round(end.amount).toLocaleString() : money(end.amount, end.unit)),
        g !== null ? h("small", { class: g >= 0 ? "up" : "down" }, `${g >= 0 ? "▲" : "▼"} ${Math.abs(g * 100).toFixed(g > -0.1 && g < 0.1 ? 1 : 0)}% on ${pts[pts.length - 2].year}`) : ""),
      svg);
  }));
}

/** The company at the centre, its owners above and everything it owns, its partners and alliances around it. */
function constellation(f: Facts, ties: Tied[], open: (id: string) => void, size = 300): SVGSVGElement {
  const c = size / 2, svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "fin-web", role: "img", "aria-label": `${f.name} and the companies tied to it` });
  const up = ties.filter((t) => TIES[t.tie].up).slice(0, 8), down = ties.filter((t) => !TIES[t.tie].up);
  // Owners on an arc above; the rest around the lower three quarters, grouped by tie, best known nearer.
  const place = (list: Tied[], a0: number, a1: number, r: number) => list.map((t, i) => {
    const a = list.length === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (list.length - 1);
    return { t, x: c + Math.sin(a) * r, y: c - Math.cos(a) * r };
  });
  const groups = TIE_ORDER.filter((k) => !TIES[k].up).map((k) => down.filter((t) => t.tie === k).slice(0, 14)).filter((g) => g.length);
  const total = groups.reduce((n, g) => n + g.length, 0) || 1;
  let a = Math.PI * 0.38;
  const nodes = [...place(up, -Math.PI * 0.28, Math.PI * 0.28, c * 0.62)];
  for (const g of groups) {
    const span = (Math.PI * 1.24 * g.length) / total;
    nodes.push(...g.map((t, i) => { const ang = a + (span * (i + 0.5)) / g.length, r = c * (0.5 + 0.34 * ((i % 3) / 2)); return { t, x: c + Math.sin(ang) * r, y: c - Math.cos(ang) * r }; }));
    a += span;
  }
  for (const n of nodes) svg.append(svgEl("line", { x1: c, y1: c, x2: n.x, y2: n.y, class: "fin-link", stroke: tieColor(n.t.tie) }));
  nodes.forEach((n, i) => {
    const r = 3 + Math.min(5, Math.sqrt(n.t.fame) * 0.6);
    const dot = tip(svgEl("circle", { cx: n.x, cy: n.y, r, fill: tieColor(n.t.tie), class: "fin-node", style: `animation-delay:${i * 18}ms` }),
      `${n.t.name} · ${TIES[n.t.tie].label.toLowerCase()}${n.t.share ? ` · ${(n.t.share * (n.t.share <= 1 ? 100 : 1)).toFixed(1)}%` : ""}${n.t.about ? ` · ${n.t.about}` : ""}`);
    dot.addEventListener("click", () => open(n.t.id));
    svg.append(dot);
    if (i < 10 || n.t.fame > 40) { const t = svgEl("text", { x: n.x, y: n.y - r - 3, class: "fin-node-label" }); t.textContent = n.t.name.length > 18 ? `${n.t.name.slice(0, 17)}…` : n.t.name; svg.append(t); }
  });
  svg.append(svgEl("circle", { cx: c, cy: c, r: 15, class: "fin-core" }));
  const t = svgEl("text", { x: c, y: c + 4, class: "fin-core-label" }); t.textContent = (f.listings.find((l) => l.ticker)?.ticker ?? f.name).slice(0, 6); svg.append(t);
  return svg;
}

function showCompany(ctx: WorkCtx, app: App, id: string, kind: "finance" | "bank") {
  const body = h("div", {}, h("p", { class: "muted small" }, "Reading the company from Wikidata…"));
  ctx.show(kind === "bank" ? "Bank explorer" : "Company explorer", () => openCompany(ctx, app, kind), body);
  void Promise.all([companyFacts(id), companyFigures(id).catch(() => ({} as Figures)), companyTies(id).catch(() => [] as Tied[])]).then(([f, fig, ties]) => {
    if (!f) { body.replaceChildren(empty("Couldn't read that company.")); return; }
    const open = (x: string) => showCompany(ctx, app, x, kind);
    // The globe: lines from its head office to everything tied to it that has a place.
    const located = ties.filter((t) => t.lon !== undefined && t.lat !== undefined);
    if (f.lon !== undefined && f.lat !== undefined) {
      const hq = { lon: f.lon, lat: f.lat };
      const flows = located.slice(0, 80).map((t, i) => arcFlow(`t${i}`, TIES[t.tie].up ? t as { lon: number; lat: number } : hq, TIES[t.tie].up ? hq : t as { lon: number; lat: number }, tieColor(t.tie), 0.4, t.tie === "partner" || t.tie === "member"));
      const pts: WorkFeature[] = [{ id: "hq", kind: "point", pts: [[f.lon, f.lat]], color: "#ffffff", label: f.name }, ...located.slice(0, 80).map((t, i): WorkFeature => ({ id: `p${i}`, kind: "point", pts: [[t.lon!, t.lat!]], color: tieColor(t.tie), label: i < 6 ? t.name : undefined }))];
      opsMap(app).draw(f.name, [...flows.map((x) => x.line), ...pts], flows.map((x) => x.flow));
      frame(app, f.name, [hq, ...located.slice(0, 80) as { lon: number; lat: number }[]], 20_000);
    }
    const listing = f.listings.find((l) => l.ticker);
    const quoteBox = h("div", {});
    if (listing?.ticker) void quote(listing.ticker).then((q) => {
      if (!q) return;
      quoteBox.replaceChildren(h("div", { class: "fin-quote" }, h("strong", {}, q.price.toFixed(2)),
        h("span", { class: q.change >= 0 ? "up" : "down" }, `${q.change >= 0 ? "▲" : "▼"} ${Math.abs(q.change).toFixed(2)} (${q.changePct.toFixed(2)}%)`),
        h("small", { class: "muted" }, `${listing.ticker} · day ${q.low.toFixed(2)}–${q.high.toFixed(2)} · ${new Date(q.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)));
    }).catch(() => {});
    const latest = (m: Metric) => { const p = fig[m]; return p?.length ? p[p.length - 1] : undefined; };
    const kpi = (label: string, m: Metric, extra?: string) => { const p = latest(m); return p ? h("div", { class: "fin-kpi" }, h("small", {}, `${label} · ${p.year}`), h("strong", {}, m === "staff" ? Math.round(p.amount).toLocaleString() : money(p.amount, p.unit)), extra ? h("small", { class: "muted" }, extra) : "") : ""; };
    const mg = margin(fig);
    const w = watched(), on = w.some((x) => x.id === f.id);
    const watchBtn = h("button", { class: on ? "pill-btn" : "primary-btn", onclick: () => {
      const now = watched(), has = now.some((x) => x.id === f.id);
      setWatched(has ? now.filter((x) => x.id !== f.id) : [...now, { id: f.id, name: f.name, ticker: listing?.ticker, country: f.country, lon: f.lon, lat: f.lat }]);
      watchBtn.textContent = has ? "＋ Watch" : "✓ Watching"; watchBtn.className = has ? "primary-btn" : "pill-btn";
    } }, on ? "✓ Watching" : "＋ Watch");
    const branchBox = h("div", {});
    const counts = TIE_ORDER.map((k) => [k, ties.filter((t) => t.tie === k).length] as const).filter(([, n]) => n);
    body.replaceChildren(
      h("div", { class: "fin-head" },
        f.logo ? h("img", { class: "fin-logo", src: `${f.logo.replace(/^http:/, "https:")}?width=96`, alt: "" }) : "",
        h("div", {}, h("h2", { class: "fin-name" }, f.name), h("p", { class: "muted small" }, f.about ?? ""),
          h("div", { class: "chips wrap" }, ...f.listings.map((l) => h("span", { class: "fin-ticker" }, l.ticker ? `${l.exchange} · ${l.ticker}` : l.exchange))))),
      quoteBox,
      h("p", { class: "fin-facts" }, [f.industries.join(", "), f.founded ? `founded ${f.founded}` : "", f.hq ? `based in ${f.hq}${f.country ? `, ${f.country}` : ""}` : f.country ?? "", f.ceo ? `led by ${f.ceo}` : ""].filter(Boolean).join(" · ")),
      h("div", { class: "fin-kpis" }, kpi("Revenue", "revenue"), kpi("Net income", "profit", mg ? `${(mg.value * 100).toFixed(1)}% margin` : undefined), kpi(kind === "bank" ? "Total assets" : "Assets", "assets"), kpi("Market value", "marketCap"), kpi("Employees", "staff")),
      h("div", { class: "row-btns" }, watchBtn, h("button", { class: "pill-btn", onclick: () => void branchesFor(app, f, branchBox) }, kind === "bank" ? "Its branches near the map" : "Its locations near the map")),
      branchBox,
      title("Year by year"), figureCharts(fig),
      title(`Tied to ${f.name}`),
      ties.length ? h("div", { class: "fin-web-wrap" }, constellation(f, ties, open),
        h("div", { class: "fin-legend" }, ...counts.map(([k, n]) => h("div", { class: "fin-leg" }, h("i", { style: `background:${tieColor(k)}` }), h("span", {}, TIES[k].label), h("small", {}, String(n)))))) : empty("No owners, subsidiaries or partners recorded yet."),
      ...counts.map(([k]) => h("details", { class: "fin-group", open: k === "parent" || k === "owner" },
        h("summary", {}, h("i", { style: `background:${tieColor(k)}` }), `${TIES[k].label} (${ties.filter((t) => t.tie === k).length})`),
        h("div", { class: "list" }, ...ties.filter((t) => t.tie === k).slice(0, 40).map((t) => h("div", { class: "fin-row" },
          h("button", { class: "list-row", onclick: () => open(t.id) }, h("span", { class: "sc-row-main" }, h("strong", {}, t.name), h("small", {}, [t.share ? `${(t.share * (t.share <= 1 ? 100 : 1)).toFixed(1)}% stake` : "", t.about ?? ""].filter(Boolean).join(" · ")))),
          t.lon !== undefined ? h("button", { class: "chip", title: "Show on the globe", onclick: () => void flyToPlace(app.globe, { name: t.name, lon: t.lon!, lat: t.lat!, radius: 3000 }) }, "◎") : ""))))),
      title("Look it up"),
      h("div", { class: "row-btns" }, ...companyLinks(f).map((l) => h("a", { class: "pill-btn", href: l.url, target: "_blank", rel: "noopener" }, `${l.label} ↗`))),
      h("p", { class: "fineprint" }, `Figures as reported to Wikidata (CC0), in the currency used most; market value is as of the year shown.${listing?.ticker ? " Live quotes need a market-data key (see docs)." : ""}`));
  }).catch(() => body.replaceChildren(empty("Couldn't reach Wikidata just now. Try again in a moment.")));
}

/** A brand's own branches or shops around the middle of the map (OpenStreetMap's brand:wikidata). */
async function branchesFor(app: App, f: Facts, box: HTMLElement) {
  const c = centre(app);
  if (!c) { box.replaceChildren(empty("Point the map at a place first.")); return; }
  box.replaceChildren(h("p", { class: "muted small" }, "Looking within 25 km of the middle of the map…"));
  try {
    const bs = await brandNear(f.id, c.lon, c.lat, 25_000);
    if (!bs.length) { box.replaceChildren(empty(`No ${f.name} locations mapped within 25 km of here on OpenStreetMap.`)); return; }
    opsMap(app).draw(`${f.name} near here`, bs.map((b, i): WorkFeature => ({ id: `b${i}`, kind: "point", pts: [[b.lon, b.lat]], color: b.kind === "atm" ? "#eda100" : "#2a78d6" })));
    frame(app, f.name, bs, 3000);
    const n = (k: Branch["kind"]) => bs.filter((b) => b.kind === k).length;
    box.replaceChildren(h("p", { class: "src-lede" }, h("strong", {}, String(bs.length)), ` ${f.name} locations within 25 km${n("atm") ? ` (${n("bank")} branches, ${n("atm")} ATMs)` : ""}. On the map in blue${n("atm") ? ", ATMs in yellow" : ""}.`));
  } catch { box.replaceChildren(empty("Couldn't reach OpenStreetMap just now.")); }
}

const centre = (app: App) => { const cv = app.globe.viewer.canvas, p = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2)); return p ? { lon: p.lon, lat: p.lat } : null; };

// ---- Markets now ------------------------------------------------------------------------------------

export function openMarkets(ctx: WorkCtx, app: App) {
  const body = h("div", {});
  const draw = () => {
    if (!body.isConnected && drawn) { clearInterval(timer); return; }
    drawn = true;
    const now = new Date(), utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const rows = EXCHANGES.map((e) => ({ e, s: session(e, now), w: sessionUtc(e, now) })).sort((a, b) => a.w[0] - b.w[0]);
    const open = rows.filter((r) => r.s.state === "open");
    opsMap(app).draw("Markets now", rows.map((r): WorkFeature => ({ id: r.e.id, kind: "point", pts: [[r.e.lon, r.e.lat]], color: r.s.state === "open" ? "#1baf7a" : r.s.state === "lunch" ? "#eda100" : "#9a9893", label: r.s.state === "open" ? r.e.city : undefined })));
    const G = 62, W = 300, rowH = 15, H = rows.length * rowH + 18, x = (m: number) => G + (m / 1440) * (W - G - 4);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "mk-strip", role: "img", "aria-label": "Each exchange's trading day in UTC, with now marked" });
    for (const hr of [0, 6, 12, 18, 24]) { svg.append(svgEl("line", { x1: x(hr * 60), x2: x(hr * 60), y1: 0, y2: H - 12, class: "mk-grid" })); const t = svgEl("text", { x: x(hr * 60), y: H - 2, class: "mk-hr", "text-anchor": hr === 24 ? "end" : hr === 0 ? "start" : "middle" }); t.textContent = hr === 24 ? "UTC" : `${String(hr).padStart(2, "0")}:00`; svg.append(t); }
    rows.forEach((r, i) => {
      const y = i * rowH + 4, [a, b] = r.w;
      const name = svgEl("text", { x: G - 6, y: y + rowH - 8, class: "mk-name" + (r.s.state === "open" ? " open" : ""), "text-anchor": "end" }); name.textContent = r.e.city; svg.append(name);
      const seg = (s: number, e: number) => svg.append(tip(svgEl("rect", { x: x(s), y, width: Math.max(1, x(e) - x(s)), height: rowH - 6, rx: 4, class: "mk-sess " + r.s.state }), `${r.e.name}: ${r.e.open}–${r.e.close} local (${r.e.city})`));
      if (b > a) seg(a, b); else { seg(a, 1440); seg(0, b); }
    });
    svg.append(svgEl("line", { x1: x(utcMin), x2: x(utcMin), y1: 0, y2: H - 12, class: "mk-now" }));
    body.replaceChildren(
      h("p", { class: "src-lede" }, h("strong", {}, String(open.length)), ` of ${rows.length} major exchanges trading now (${now.toUTCString().slice(17, 22)} UTC).`),
      svg,
      h("div", { class: "list" }, ...rows.map((r) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: r.e.name, lon: r.e.lon, lat: r.e.lat, radius: 2500 }) },
        h("span", { class: `mk-dot ${r.s.state}` }),
        h("span", { class: "sc-row-main" }, h("strong", {}, r.e.name), h("small", {}, `${r.e.city} · ${r.s.local} local`)),
        h("span", { class: `mk-state ${r.s.state}` }, r.s.state === "open" ? `Open · closes in ${until(r.s.next)}` : r.s.state === "lunch" ? `Lunch · back in ${until(r.s.next)}` : `Opens in ${until(r.s.next)}`)))),
      h("p", { class: "fineprint" }, "Regular hours, local time; public holidays and early closes aren't counted."));
  };
  let drawn = false;
  const timer = window.setInterval(draw, 30_000);
  ctx.show("Markets now", ctx.home, h("p", { class: "sc-lede" }, "The world's exchanges follow the sun: who's trading now, and when each opens and closes."), body);
  draw();
}

// ---- Watchlist ----------------------------------------------------------------------------------------

export function openWatchlist(ctx: WorkCtx, app: App) {
  const w = watched();
  if (!w.length) {
    ctx.show("Watchlist", ctx.home, h("p", { class: "sc-lede" }, "The companies you follow, on the map."), empty("Nothing yet: open a company in the Company explorer and tap ＋ Watch."),
      h("button", { class: "primary-btn", onclick: () => openCompany(ctx, app) }, "Open the Company explorer"));
    return;
  }
  const located = w.filter((x) => x.lon !== undefined && x.lat !== undefined) as (Watched & { lon: number; lat: number })[];
  opsMap(app).draw("Watchlist", located.map((x, i): WorkFeature => ({ id: x.id, kind: "point", pts: [[x.lon, x.lat]], color: SLOTS[0], label: i < 12 ? x.ticker ?? x.name : undefined })));
  if (located.length) frame(app, "Watchlist", located, 200_000);
  const by = new Map<string, number>();
  for (const x of w) by.set(x.country ?? "Unknown", (by.get(x.country ?? "Unknown") ?? 0) + 1);
  const rows = [...by].sort((a, b) => b[1] - a[1]), max = rows[0][1];
  const bodyRows = () => watched().map((x) => h("div", { class: "fin-row" },
    h("button", { class: "list-row", onclick: () => openCompany(ctx, app, "finance", x.id) }, h("span", { class: "sc-row-main" }, h("strong", {}, x.name), h("small", {}, [x.ticker, x.country].filter(Boolean).join(" · ")))),
    h("button", { class: "chip", title: "Stop watching", onclick: () => { setWatched(watched().filter((y) => y.id !== x.id)); openWatchlist(ctx, app); } }, "✕")));
  ctx.show("Watchlist", ctx.home,
    h("p", { class: "sc-lede" }, `${w.length} ${w.length === 1 ? "company" : "companies"}, head offices on the map.`),
    title("Where your companies are based"),
    h("div", { class: "fin-country" }, ...rows.map(([c, n]) => h("div", { class: "fin-crow", title: `${c}: ${n}` }, h("span", {}, c), h("span", { class: "reach-bar" }, h("i", { style: `width:${(n / max) * 100}%;--c:${SLOTS[0]}` })), h("strong", {}, String(n))))),
    title("Companies"), h("div", { class: "list" }, ...bodyRows()),
    h("button", { class: "pill-btn", onclick: () => openCompany(ctx, app) }, "＋ Add a company"));
}

// ---- Banks near you, and branch coverage ------------------------------------------------------------

function pickSpot(ctx: WorkCtx, app: App, run: (p: { lon: number; lat: number; name: string }) => void): HTMLElement {
  const mine = (() => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { name: string; lon: number; lat: number }[]).slice(0, 4); } catch { return []; } })();
  return h("div", { class: "row-btns" },
    app.place ? h("button", { class: "chip", onclick: () => run({ lon: app.place!.lon, lat: app.place!.lat, name: app.place!.name?.title ?? "the chosen place" }) }, "◎ The chosen place") : "",
    h("button", { class: "chip", onclick: () => { const c = centre(app); if (c) run({ ...c, name: "the middle of the map" }); } }, "Middle of the map"),
    h("button", { class: "chip", onclick: () => { ctx.hide(); app.pickOnce("Tap the spot", (p) => { ctx.unhide(); run({ lon: p.lon, lat: p.lat, name: "the spot you tapped" }); }, () => ctx.unhide()); } }, "Tap a spot"),
    ...mine.map((p) => h("button", { class: "chip", onclick: () => run(p) }, `⌂ ${p.name}`)));
}

const KIND_LABEL: Record<Branch["kind"], string> = { bank: "Bank", atm: "ATM", credit_union: "Credit union", bureau: "Exchange bureau" };
const KIND_COLOR: Record<Branch["kind"], string> = { bank: SLOTS[0], atm: SLOTS[3], credit_union: SLOTS[2], bureau: SLOTS[6] };
const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110.57);

export function openBanksNear(ctx: WorkCtx, app: App) {
  const status = h("p", { class: "muted small" }), body = h("div", {});
  const run = async (p: { lon: number; lat: number; name: string }) => {
    status.textContent = `Looking 2 km around ${p.name}…`; body.replaceChildren();
    void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 2200 });
    try {
      const bs = (await branchesNear(p.lon, p.lat, 2000)).map((b) => ({ ...b, d: km(p, b) })).sort((a, b) => a.d - b.d);
      status.textContent = "";
      opsMap(app).draw("Banks near you", [{ id: "me", kind: "point", pts: [[p.lon, p.lat]], color: "#ffffff", label: p.name }, ...bs.map((b): WorkFeature => ({ id: b.id, kind: "point", pts: [[b.lon, b.lat]], color: KIND_COLOR[b.kind] }))]);
      if (!bs.length) { body.replaceChildren(empty("No banks or ATMs mapped within 2 km on OpenStreetMap.")); return; }
      const nearest = (k: Branch["kind"]) => bs.find((b) => b.kind === k);
      body.replaceChildren(
        h("div", { class: "fin-kpis" }, ...(["bank", "atm", "credit_union"] as const).map((k) => { const n = nearest(k); return n ? h("div", { class: "fin-kpi" }, h("small", {}, `Nearest ${KIND_LABEL[k].toLowerCase()}`), h("strong", {}, n.d < 1 ? `${Math.round(n.d * 1000)} m` : `${n.d.toFixed(1)} km`), h("small", { class: "muted" }, n.brand)) : ""; })),
        title("Nearest"),
        h("div", { class: "list" }, ...bs.slice(0, 25).map((b) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: b.name, lon: b.lon, lat: b.lat, radius: 400 }) },
          h("span", { class: "dot", style: `background:${KIND_COLOR[b.kind]}` }), h("span", { class: "sc-row-main" }, h("strong", {}, b.name), h("small", {}, KIND_LABEL[b.kind])), h("span", { class: "muted small" }, b.d < 1 ? `${Math.round(b.d * 1000)} m` : `${b.d.toFixed(1)} km`)))),
        h("p", { class: "fineprint" }, "From OpenStreetMap; opening hours vary, so check with the bank."));
    } catch { status.textContent = "Couldn't reach OpenStreetMap just now."; }
  };
  ctx.show("Banks near you", ctx.home, h("p", { class: "sc-lede" }, "Banks, ATMs and credit unions around a place, nearest first."), pickSpot(ctx, app, (p) => void run(p)), status, body);
  const c = app.place ?? centre(app);
  if (c) void run({ lon: c.lon, lat: c.lat, name: app.place?.name?.title ?? "the middle of the map" });
}

/** Each bank's share of the branches, as a ring. */
function shareRing(rows: ReturnType<typeof shares>, size = 170): SVGSVGElement {
  const c = size / 2, r = c - 10, w = 18, svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "bk-ring", role: "img", "aria-label": "Share of branches by bank" });
  let a = -Math.PI / 2;
  rows.forEach((row, i) => {
    const span = row.share * Math.PI * 2, gap = rows.length > 1 ? 0.025 : 0, a1 = a + span - gap;
    const p = (ang: number, rr: number) => `${c + Math.cos(ang) * rr},${c + Math.sin(ang) * rr}`;
    const large = span - gap > Math.PI ? 1 : 0;
    const d = rows.length === 1 ? `M${c},${c - r} A${r},${r} 0 1 1 ${c - 0.01},${c - r} L${c - 0.01},${c - r + w} A${r - w},${r - w} 0 1 0 ${c},${c - r + w} Z`
      : `M${p(a, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, r - w)} A${r - w},${r - w} 0 ${large} 0 ${p(a, r - w)} Z`;
    svg.append(tip(svgEl("path", { d, fill: row.brand.startsWith("Others") ? OTHER : SLOTS[i % SLOTS.length], class: "bk-seg" }), `${row.brand}: ${row.n} (${(row.share * 100).toFixed(0)}%)`));
    a += span;
  });
  const t = svgEl("text", { x: c, y: c - 2, class: "bk-n" }); t.textContent = String(rows.reduce((n, x) => n + x.n, 0)); svg.append(t);
  const s = svgEl("text", { x: c, y: c + 14, class: "bk-sub" }); s.textContent = "branches"; svg.append(s);
  return svg;
}

export function openCoverage(ctx: WorkCtx, app: App) {
  const status = h("p", { class: "muted small" }), body = h("div", {});
  let radiusKm = 5;
  const run = async (p: { lon: number; lat: number; name: string }) => {
    status.textContent = `Surveying ${radiusKm} km around ${p.name}…`; body.replaceChildren();
    void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: radiusKm * 1300 });
    try {
      const bs = await branchesNear(p.lon, p.lat, radiusKm * 1000);
      status.textContent = "";
      const sh = shares(bs), holes = gaps(bs, p, radiusKm, 2, 26);
      const color = new Map(sh.map((s, i) => [s.brand, s.brand.startsWith("Others") ? OTHER : SLOTS[i % SLOTS.length]]));
      const cellKm = (2 * radiusKm) / 26, kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
      const cell = (g: { lon: number; lat: number }): [number, number][] => { const dx = cellKm / 2 / kx, dy = cellKm / 2 / 110.57; return [[g.lon - dx, g.lat - dy], [g.lon + dx, g.lat - dy], [g.lon + dx, g.lat + dy], [g.lon - dx, g.lat + dy]]; };
      opsMap(app).draw("Branch coverage", [
        ...holes.map((g, i): WorkFeature => ({ id: `g${i}`, kind: "area", pts: cell(g), color: "#e34948", fill: Math.min(0.45, 0.12 + (g.dKm - 2) * 0.06) })),
        ...bs.filter((b) => b.kind !== "atm").map((b): WorkFeature => ({ id: b.id, kind: "point", pts: [[b.lon, b.lat]], color: color.get(b.brand) ?? OTHER })),
        { id: "c", kind: "point", pts: [[p.lon, p.lat]], color: "#ffffff", label: p.name },
      ]);
      const area = Math.PI * radiusKm * radiusKm, holeShare = holes.length / Math.max(1, Math.round(area / (cellKm * cellKm)));
      const banks = bs.filter((b) => b.kind === "bank" || b.kind === "credit_union").length, atms = bs.filter((b) => b.kind === "atm").length;
      if (!banks) { body.replaceChildren(empty(`No bank branches mapped within ${radiusKm} km on OpenStreetMap.`)); return; }
      body.replaceChildren(
        h("p", { class: "src-lede" }, h("strong", {}, String(banks)), ` branches and ${atms} ATMs within ${radiusKm} km; ${(holeShare * 100).toFixed(0)}% of the area is more than 2 km from any branch (red on the map).`),
        h("div", { class: "src-top" }, shareRing(sh),
          h("div", { class: "src-kinds" }, ...sh.map((s) => h("div", { class: "src-kind", style: `--c:${color.get(s.brand)}` }, h("i", {}), h("span", {}, s.brand), h("small", {}, `${s.n} · ${(s.share * 100).toFixed(0)}%`))))),
        h("p", { class: "fineprint" }, "From OpenStreetMap: branches volunteers have mapped, by brand. Shares count branches, not deposits or customers."));
    } catch { status.textContent = "Couldn't reach OpenStreetMap just now."; }
  };
  let last: { lon: number; lat: number; name: string } | null = null;
  const go = (p: { lon: number; lat: number; name: string }) => { last = p; void run(p); };
  ctx.show("Branch coverage", ctx.home,
    h("p", { class: "sc-lede" }, "For bankers: who has the branches around a place, and where banking means a trip."),
    pickSpot(ctx, app, go),
    h("div", { class: "chips" }, ...[2, 5, 10, 20].map((r) => h("button", { class: "chip" + (r === radiusKm ? " on" : ""), onclick: (e: Event) => { radiusKm = r; (e.currentTarget as HTMLElement).parentElement!.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === e.currentTarget)); if (last) go(last); } }, `${r} km`))),
    status, body);
  const c = app.place ?? centre(app);
  if (c) go({ lon: c.lon, lat: c.lat, name: app.place?.name?.title ?? "the middle of the map" });
}

export const clearFinance = () => map?.clear();
