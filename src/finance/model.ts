// Finance and banking on the map, from open data. A company's shape comes from
// Wikidata (CC0): who owns it, what it owns (subsidiaries, divisions, brands,
// buildings, teams), its partners and alliances, where each is based, and the
// figures it reports year by year (revenue, profit, assets, market value,
// staff) with its tickers. Branch networks come from OpenStreetMap, where
// bank branches and shops carry their brand's Wikidata id. The world's stock
// exchanges open and close by their own clocks. Pure functions; fetching is in
// data.ts and the screens in ui.ts.

// ---- Wikidata queries ------------------------------------------------------------------------------

const LABELS = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }`;

/** The company's facts: what it is, where, when, who runs it, and its listings (pure). */
export const factsQuery = (q: string) => `SELECT ?co ?coLabel ?coDescription ?inception ?industryLabel ?ceoLabel ?hqLabel ?coord ?countryLabel ?website ?logo ?exLabel ?ticker ?isin ?cik ?lei WHERE {
  BIND(wd:${q} AS ?co)
  OPTIONAL { ?co wdt:P571 ?inception. }
  OPTIONAL { ?co wdt:P452 ?industry. }
  OPTIONAL { ?co wdt:P169 ?ceo. }
  OPTIONAL { ?co wdt:P159 ?hq. OPTIONAL { ?hq wdt:P625 ?hqc. } }
  OPTIONAL { ?co wdt:P625 ?own. }
  BIND(COALESCE(?own, ?hqc) AS ?coord)
  OPTIONAL { ?co wdt:P17 ?country. }
  OPTIONAL { ?co wdt:P856 ?website. }
  OPTIONAL { ?co wdt:P154 ?logo. }
  OPTIONAL { ?co p:P414 ?ls. ?ls ps:P414 ?ex. OPTIONAL { ?ls pq:P249 ?ticker. } FILTER NOT EXISTS { ?ls pq:P582 ?ended. } }
  OPTIONAL { ?co wdt:P946 ?isin. }
  OPTIONAL { ?co wdt:P5531 ?cik. }
  OPTIONAL { ?co wdt:P1278 ?lei. }
  ${LABELS}
} LIMIT 200`;

export const METRICS = {
  revenue: { p: "P2139", label: "Revenue" },
  profit: { p: "P2295", label: "Net income" },
  operating: { p: "P3362", label: "Operating income" },
  assets: { p: "P2403", label: "Total assets" },
  equity: { p: "P2137", label: "Total equity" },
  marketCap: { p: "P2226", label: "Market value" },
  staff: { p: "P1128", label: "Employees" },
} as const;
export type Metric = keyof typeof METRICS;

/** Every reported figure with its date and currency (pure). */
export const figuresQuery = (q: string) => `SELECT ?pid ?amount ?unitLabel ?date WHERE {
  VALUES (?pid ?pp ?pv) { ${Object.values(METRICS).map((m) => `("${m.p}" p:${m.p} psv:${m.p})`).join(" ")} }
  wd:${q} ?pp ?st. ?st ?pv ?val. ?val wikibase:quantityAmount ?amount.
  OPTIONAL { ?val wikibase:quantityUnit ?unit. }
  OPTIONAL { ?st pq:P585 ?date. }
  ${LABELS}
} LIMIT 400`;

export type Tie = "parent" | "owner" | "subsidiary" | "division" | "owns" | "partner" | "member";
export const TIES: Record<Tie, { label: string; color: string; up?: boolean }> = {
  parent: { label: "Parent", color: "#ff9f0a", up: true },
  owner: { label: "Owners", color: "#ffd60a", up: true },
  subsidiary: { label: "Subsidiaries", color: "#0a84ff" },
  division: { label: "Divisions", color: "#64d2ff" },
  owns: { label: "Assets it owns", color: "#30d158" },
  partner: { label: "Partners", color: "#bf5af2" },
  member: { label: "Alliances and memberships", color: "#ff375f" },
};

/** Everyone tied to the company and how, with where each is based (pure). */
export const tiesQuery = (q: string) => `SELECT ?tie ?x ?xLabel ?xDescription ?coord ?share ?sl WHERE {
  {
    { wd:${q} wdt:P749 ?x. BIND("parent" AS ?tie) }
    UNION { wd:${q} p:P127 ?os. ?os ps:P127 ?x. OPTIONAL { ?os pq:P1107 ?share. } FILTER NOT EXISTS { ?os pq:P582 ?e1. } BIND("owner" AS ?tie) }
    UNION { { wd:${q} wdt:P355 ?x. } UNION { ?x wdt:P749 wd:${q}. } FILTER NOT EXISTS { ?x wdt:P576 ?gone. } BIND("subsidiary" AS ?tie) }
    UNION { wd:${q} wdt:P199 ?x. BIND("division" AS ?tie) }
    UNION { wd:${q} wdt:P1830 ?x. BIND("owns" AS ?tie) }
    UNION { wd:${q} wdt:P1327 ?x. BIND("partner" AS ?tie) }
    UNION { wd:${q} wdt:P463 ?x. BIND("member" AS ?tie) }
  }
  OPTIONAL { ?x wdt:P625 ?c1. }
  OPTIONAL { ?x wdt:P159 ?hq. ?hq wdt:P625 ?c2. }
  BIND(COALESCE(?c1, ?c2) AS ?coord)
  OPTIONAL { ?x wikibase:sitelinks ?sl. }
  ${LABELS}
} LIMIT 600`;

// ---- Reading the answers -----------------------------------------------------------------------------

type B = Record<string, { value: string } | undefined>;
const val = (b: B, k: string) => b[k]?.value;
const qidOf = (u?: string) => u?.split("/").pop() ?? "";
export const pointOf = (wkt?: string): [number, number] | undefined => {
  const m = wkt && /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
};

export interface Listing { exchange: string; ticker?: string }
export interface Facts {
  id: string; name: string; about?: string; founded?: number; industries: string[]; ceo?: string;
  hq?: string; country?: string; lon?: number; lat?: number; website?: string; logo?: string;
  listings: Listing[]; isin?: string; cik?: string; lei?: string;
}

/** The facts from the rows (OPTIONALs multiply them) (pure). */
export function readFacts(rows: B[]): Facts | null {
  if (!rows.length) return null;
  const r0 = rows[0], pt = rows.map((r) => pointOf(val(r, "coord"))).find(Boolean);
  const uniq = (k: string) => [...new Set(rows.map((r) => val(r, k)).filter((x): x is string => !!x && !/^Q\d+$/.test(x)))];
  const listings: Listing[] = [];
  for (const r of rows) {
    const ex = val(r, "exLabel");
    if (!ex || /^Q\d+$/.test(ex)) continue;
    const t = val(r, "ticker");
    if (!listings.some((l) => l.exchange === ex && l.ticker === t)) listings.push({ exchange: ex, ticker: t });
  }
  // A listing with a ticker beats the same exchange without one.
  const best = listings.filter((l) => l.ticker || !listings.some((m) => m.exchange === l.exchange && m.ticker));
  const year = val(r0, "inception")?.slice(0, 4);
  return {
    id: qidOf(val(r0, "co")), name: val(r0, "coLabel") ?? "", about: val(r0, "coDescription"), founded: year ? Number(year) : undefined,
    industries: uniq("industryLabel").slice(0, 3), ceo: uniq("ceoLabel")[0], hq: uniq("hqLabel")[0], country: uniq("countryLabel")[0],
    lon: pt?.[0], lat: pt?.[1], website: val(r0, "website"), logo: uniq("logo")[0], listings: best.slice(0, 4),
    isin: uniq("isin")[0], cik: uniq("cik")[0], lei: uniq("lei")[0],
  };
}

export interface Point { year: number; amount: number; unit: string }
export type Figures = Partial<Record<Metric, Point[]>>;

/** One value per year per figure, in the currency used most (pure). */
export function readFigures(rows: B[]): Figures {
  const out: Figures = {};
  for (const [m, def] of Object.entries(METRICS) as [Metric, (typeof METRICS)[Metric]][]) {
    const pts = rows.filter((r) => val(r, "pid") === def.p).map((r) => ({ year: Number(val(r, "date")?.slice(0, 4) ?? NaN), amount: Number(val(r, "amount")), unit: val(r, "unitLabel") ?? "" }))
      .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.amount));
    if (!pts.length) continue;
    const units = new Map<string, number>();
    for (const p of pts) units.set(p.unit, (units.get(p.unit) ?? 0) + 1);
    const unit = [...units].sort((a, b) => b[1] - a[1])[0][0];
    const byYear = new Map<number, Point>();
    for (const p of pts.filter((x) => x.unit === unit)) byYear.set(p.year, p);
    out[m] = [...byYear.values()].sort((a, b) => a.year - b.year).slice(-12);
  }
  return out;
}

export interface Tied { tie: Tie; id: string; name: string; about?: string; lon?: number; lat?: number; share?: number; fame: number }

/** Everyone tied, once per tie, best known first (pure). */
export function readTies(rows: B[], self: string): Tied[] {
  const seen = new Map<string, Tied>();
  for (const r of rows) {
    const tie = val(r, "tie") as Tie, id = qidOf(val(r, "x")), name = val(r, "xLabel");
    if (!tie || !id || id === self || !name || /^Q\d+$/.test(name)) continue;
    const key = `${tie}:${id}`, pt = pointOf(val(r, "coord"));
    const prev = seen.get(key);
    if (prev) { if (!prev.lon && pt) [prev.lon, prev.lat] = pt; continue; }
    const share = val(r, "share");
    seen.set(key, { tie, id, name, about: val(r, "xDescription"), lon: pt?.[0], lat: pt?.[1], share: share ? Number(share) : undefined, fame: Number(val(r, "sl") ?? 0) });
  }
  return [...seen.values()].sort((a, b) => b.fame - a.fame);
}

// ---- Money in words -------------------------------------------------------------------------------------

const SYMBOL: Record<string, string> = { "United States dollar": "$", euro: "€", "pound sterling": "£", "Japanese yen": "¥", "renminbi": "CN¥", "Swiss franc": "CHF ", "Indian rupee": "₹", "South Korean won": "₩", "Canadian dollar": "C$", "Australian dollar": "A$", "Brazilian real": "R$" };

/** 391.0 bn → "$391 bn" (pure). */
export function money(amount: number, unit = ""): string {
  const sym = SYMBOL[unit] ?? "", tail = sym || !unit || unit === "1" ? "" : ` ${unit}`;
  const a = Math.abs(amount), sign = amount < 0 ? "−" : "";
  const [v, s] = a >= 1e12 ? [a / 1e12, " tn"] : a >= 1e9 ? [a / 1e9, " bn"] : a >= 1e6 ? [a / 1e6, " m"] : a >= 1e3 ? [a / 1e3, "k"] : [a, ""];
  return `${sign}${sym}${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, "")}${s}${tail}`;
}

/** Year-on-year change of the last two points, as a share (pure). */
export function growth(pts?: Point[]): number | null {
  if (!pts || pts.length < 2) return null;
  const [a, b] = pts.slice(-2);
  return a.amount ? (b.amount - a.amount) / Math.abs(a.amount) : null;
}

/** Net margin from the latest year both are reported (pure). */
export function margin(f: Figures): { year: number; value: number } | null {
  const rev = f.revenue ?? [], prof = f.profit ?? [];
  for (const p of [...prof].reverse()) { const r = rev.find((x) => x.year === p.year && x.unit === p.unit); if (r && r.amount) return { year: p.year, value: p.amount / r.amount }; }
  return null;
}

// ---- Where to look it up -------------------------------------------------------------------------------

const EX_CODE: [RegExp, string][] = [[/nasdaq/i, "NASDAQ"], [/new york stock exchange/i, "NYSE"], [/london stock exchange/i, "LON"], [/tokyo/i, "TYO"], [/hong kong/i, "HKG"], [/euronext paris/i, "EPA"], [/euronext amsterdam/i, "AMS"], [/frankfurt|xetra/i, "ETR"], [/toronto/i, "TSE"], [/swiss|six/i, "SWX"], [/shanghai/i, "SHA"], [/shenzhen/i, "SHE"], [/national stock exchange of india/i, "NSE"], [/bombay/i, "BOM"], [/australian/i, "ASX"], [/korea/i, "KRX"], [/b3|bovespa|são paulo/i, "BVMF"]];

/** The exchange as Google Finance writes it, when known (pure). */
export const exchangeCode = (exchange: string) => EX_CODE.find(([re]) => re.test(exchange))?.[1];

export interface Link { label: string; url: string }

/** Where to read more: quotes, filings, the company itself (pure). */
export function companyLinks(f: Facts): Link[] {
  const out: Link[] = [];
  const l = f.listings.find((x) => x.ticker && exchangeCode(x.exchange)) ?? f.listings.find((x) => x.ticker);
  if (l?.ticker) {
    const code = exchangeCode(l.exchange);
    out.push({ label: "Google Finance", url: code ? `https://www.google.com/finance/quote/${encodeURIComponent(l.ticker)}:${code}` : `https://www.google.com/finance?q=${encodeURIComponent(l.ticker)}` });
    out.push({ label: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(l.ticker)}` });
  }
  if (f.cik) out.push({ label: "SEC filings", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${f.cik}&type=10-K` });
  if (f.lei) out.push({ label: "LEI record", url: `https://search.gleif.org/#/record/${f.lei}` });
  if (f.website) out.push({ label: "Website", url: f.website });
  out.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${f.id}` });
  return out;
}

// ---- The world's exchanges, by their own clocks --------------------------------------------------------

export interface Exchange { id: string; name: string; city: string; tz: string; lon: number; lat: number; open: string; close: string; lunch?: [string, string]; days?: number[] }

/** Regular trading hours, local time (holidays not counted). Days: 0 Sunday … 6 Saturday; default Monday–Friday. */
export const EXCHANGES: Exchange[] = [
  { id: "nyse", name: "NYSE and Nasdaq", city: "New York", tz: "America/New_York", lon: -74.011, lat: 40.707, open: "09:30", close: "16:00" },
  { id: "tsx", name: "Toronto Stock Exchange", city: "Toronto", tz: "America/Toronto", lon: -79.38, lat: 43.648, open: "09:30", close: "16:00" },
  { id: "b3", name: "B3", city: "São Paulo", tz: "America/Sao_Paulo", lon: -46.634, lat: -23.546, open: "10:00", close: "17:00" },
  { id: "lse", name: "London Stock Exchange", city: "London", tz: "Europe/London", lon: -0.099, lat: 51.515, open: "08:00", close: "16:30" },
  { id: "euronext", name: "Euronext", city: "Paris", tz: "Europe/Paris", lon: 2.339, lat: 48.869, open: "09:00", close: "17:30" },
  { id: "xetra", name: "Deutsche Börse (Xetra)", city: "Frankfurt", tz: "Europe/Berlin", lon: 8.677, lat: 50.115, open: "09:00", close: "17:30" },
  { id: "six", name: "SIX Swiss Exchange", city: "Zurich", tz: "Europe/Zurich", lon: 8.531, lat: 47.374, open: "09:00", close: "17:30" },
  { id: "jse", name: "Johannesburg Stock Exchange", city: "Johannesburg", tz: "Africa/Johannesburg", lon: 28.055, lat: -26.107, open: "09:00", close: "17:00" },
  { id: "tadawul", name: "Saudi Exchange (Tadawul)", city: "Riyadh", tz: "Asia/Riyadh", lon: 46.676, lat: 24.69, open: "10:00", close: "15:00", days: [0, 1, 2, 3, 4] },
  { id: "nse", name: "NSE and BSE", city: "Mumbai", tz: "Asia/Kolkata", lon: 72.834, lat: 18.932, open: "09:15", close: "15:30" },
  { id: "sgx", name: "Singapore Exchange", city: "Singapore", tz: "Asia/Singapore", lon: 103.851, lat: 1.279, open: "09:00", close: "17:00", lunch: ["12:00", "13:00"] },
  { id: "hkex", name: "Hong Kong Exchanges", city: "Hong Kong", tz: "Asia/Hong_Kong", lon: 114.158, lat: 22.283, open: "09:30", close: "16:00", lunch: ["12:00", "13:00"] },
  { id: "sse", name: "Shanghai Stock Exchange", city: "Shanghai", tz: "Asia/Shanghai", lon: 121.505, lat: 31.235, open: "09:30", close: "15:00", lunch: ["11:30", "13:00"] },
  { id: "krx", name: "Korea Exchange", city: "Seoul", tz: "Asia/Seoul", lon: 126.929, lat: 37.524, open: "09:00", close: "15:30" },
  { id: "jpx", name: "Tokyo Stock Exchange", city: "Tokyo", tz: "Asia/Tokyo", lon: 139.778, lat: 35.683, open: "09:00", close: "15:30", lunch: ["11:30", "12:30"] },
  { id: "asx", name: "ASX", city: "Sydney", tz: "Australia/Sydney", lon: 151.209, lat: -33.866, open: "10:00", close: "16:00" },
];

const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** The local weekday and minute of the day somewhere (pure given `now`). */
export function localClock(tz: string, now: Date): { day: number; min: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const h = Number(get("hour")) % 24, m = Number(get("minute"));
  return { day, min: h * 60 + m, hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

export type Session = { state: "open" | "lunch" | "closed"; local: string; /** Minutes until it next opens or closes. */ next: number; nextWhat: "opens" | "closes" | "reopens" };

/** Whether an exchange is trading now, and how long until that changes (pure given `now`). */
export function session(ex: Exchange, now: Date): Session {
  const { day, min, hhmm } = localClock(ex.tz, now), days = ex.days ?? [1, 2, 3, 4, 5];
  const o = mins(ex.open), c = mins(ex.close), l0 = ex.lunch ? mins(ex.lunch[0]) : -1, l1 = ex.lunch ? mins(ex.lunch[1]) : -1;
  const trading = days.includes(day);
  if (trading && min >= o && min < c) {
    if (ex.lunch && min >= l0 && min < l1) return { state: "lunch", local: hhmm, next: l1 - min, nextWhat: "reopens" };
    return { state: "open", local: hhmm, next: (ex.lunch && min < l0 ? l0 : c) - min, nextWhat: "closes" };
  }
  // Closed: minutes until the next trading day's open.
  let wait = trading && min < o ? o - min : 1440 - min + o, d = (day + 1) % 7;
  if (!(trading && min < o)) while (!days.includes(d)) { wait += 1440; d = (d + 1) % 7; }
  return { state: "closed", local: hhmm, next: wait, nextWhat: "opens" };
}

/** "2 h 05", "45 min", "1 day 3 h" (pure). */
export function until(m: number): string {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `${d} day${d > 1 ? "s" : ""}${h ? ` ${h} h` : ""}`;
}

/** An exchange's session as UTC minutes of the day today, for the world clock ring (pure given `now`). */
export function sessionUtc(ex: Exchange, now: Date): [number, number] {
  const { min } = localClock(ex.tz, now), utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const offset = ((min - utc + 720 + 1440) % 1440) - 720;
  const w = (x: number) => ((x - offset) % 1440 + 1440) % 1440;
  return [w(mins(ex.open)), w(mins(ex.close))];
}

// ---- Banks around a place ---------------------------------------------------------------------------

export interface Branch { id: string; lon: number; lat: number; kind: "bank" | "atm" | "credit_union" | "bureau"; brand: string; name: string; brandId?: string }

/** Banks, ATMs, credit unions and exchange bureaux around a point (pure). */
export const branchesQuery = (lon: number, lat: number, m: number) => {
  const a = `(around:${Math.round(m)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];(nwr["amenity"~"^(bank|atm|bureau_de_change)$"]${a};nwr["office"="credit_union"]${a};);out center tags 3000;`;
};

/** A brand's locations around a point, by its Wikidata id (pure). */
export const brandQuery = (qid: string, lon: number, lat: number, m: number) =>
  `[out:json][timeout:25];nwr["brand:wikidata"="${qid}"](around:${Math.round(m)},${lat.toFixed(5)},${lon.toFixed(5)});out center tags 2000;`;

/** The brand a branch belongs to: its brand tag, else operator, else its name (pure). */
export function brandOf(t: Record<string, string>): string {
  const b = t.brand ?? t.operator ?? t.name ?? "";
  return b.replace(/\s+(ATM|Branch|Bank Branch)$/i, "").trim() || "Unnamed";
}

/** Elements to branches (pure). */
export function toBranches(els: { type?: string; id?: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]): Branch[] {
  const out: Branch[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, t = e.tags ?? {};
    if (lat === undefined || lon === undefined) continue;
    const kind = t.office === "credit_union" || /credit union/i.test(t.name ?? "") ? "credit_union" : t.amenity === "atm" ? "atm" : t.amenity === "bureau_de_change" ? "bureau" : "bank";
    out.push({ id: `${e.type ?? "n"}${e.id ?? out.length}`, lon, lat, kind, brand: brandOf(t), name: t.name ?? brandOf(t), brandId: t["brand:wikidata"] });
  }
  return out;
}

/** Share of branches by brand, biggest first, the tail folded into "Others" (pure). */
export function shares(bs: Branch[], top = 7): { brand: string; n: number; share: number }[] {
  const by = new Map<string, number>();
  for (const b of bs.filter((x) => x.kind === "bank" || x.kind === "credit_union")) by.set(b.brand, (by.get(b.brand) ?? 0) + 1);
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
  const rows = [...by].sort((a, b) => b[1] - a[1]).map(([brand, n]) => ({ brand, n, share: n / total }));
  if (rows.length <= top) return rows;
  const rest = rows.slice(top), n = rest.reduce((a, r) => a + r.n, 0);
  return [...rows.slice(0, top), { brand: `Others (${rest.length})`, n, share: n / total }];
}

/** Grid cells around a point further than `km` from any branch: where banking is a trip (pure). */
export function gaps(bs: Branch[], c: { lon: number; lat: number }, radiusKm: number, km = 2, cells = 24): { lon: number; lat: number; dKm: number }[] {
  const kx = 111.32 * Math.cos((c.lat * Math.PI) / 180), ky = 110.57, step = (2 * radiusKm) / cells;
  const banks = bs.filter((b) => b.kind !== "bureau");
  const out: { lon: number; lat: number; dKm: number }[] = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = -radiusKm + (i + 0.5) * step, y = -radiusKm + (j + 0.5) * step;
    if (Math.hypot(x, y) > radiusKm) continue;
    const lon = c.lon + x / kx, lat = c.lat + y / ky;
    let d = Infinity;
    for (const b of banks) d = Math.min(d, Math.hypot((b.lon - lon) * kx, (b.lat - lat) * ky));
    if (d > km) out.push({ lon, lat, dKm: d });
  }
  return out;
}
