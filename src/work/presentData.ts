// Data into a presentation: whatever someone brings (a table, a spreadsheet, JSON, a document, a list of
// addresses, a single number) read into a few simple visuals Terreno can animate on a slide: bars, a line over
// time, one big figure, a share of a whole in tiles, points on the globe, or a picture of a chart. Pure: the
// files are read in presentImport.ts, the visuals drawn in presentVisual.ts.

export interface Item { label: string; value: number }
export interface Spot { label: string; lon: number; lat: number; value?: number }

export type Visual =
  | { kind: "bars"; title?: string; unit?: string; items: Item[] }
  | { kind: "line"; title?: string; unit?: string; items: Item[] }
  | { kind: "number"; title?: string; unit?: string; value: number; was?: number; wasLabel?: string }
  | { kind: "share"; title?: string; unit?: string; items: Item[] }
  | { kind: "points"; title?: string; unit?: string; items: Spot[] }
  | { kind: "image"; title?: string; src: string };

export interface Table { columns: string[]; rows: string[][] }

/** A visual Terreno can make from what was brought, ready to add as a slide. */
export interface Suggestion {
  /** What it shows, in plain words ("Population by country, as bars"). */
  label: string;
  visual: Visual;
  /** Places still to be found on the map (addresses or names) before the points can be shown. */
  find?: { label: string; query: string; value?: number }[];
}

/** What was found in the input, and the visuals it could make. */
export interface Reading {
  /** One line on what it is ("A table: 12 rows; Country, Population"). */
  about: string;
  suggestions: Suggestion[];
  /** A document's sections, each a slide. */
  sections?: { title: string; text: string; visual?: Visual }[];
}

// ---- Numbers ----------------------------------------------------------------------------------------

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12 };

/**
 * A number as people write it: "1,234", "$4.5M", "12%", "(300)", "8.1 billion", "−3,5" (European decimals when
 * that's the only reading). Null when it isn't one.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[−–]/g, "-").replace(/ /g, " ");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  s = s.replace(/^[A-Z]{3}\s+/, "").replace(/^[-+]?\s*[$€£¥₹₩]\s*/, (m) => (m.includes("-") ? "-" : ""));
  s = s.replace(/\s*(%|°[CF]?|[$€£¥₹₩]|[A-Z]{3})$/, "");
  const m = /^([-+]?)(\d[\d,.\s']*)\s*([a-z]+)?\.?$/i.exec(s);
  if (!m) return null;
  let digits = m[2].replace(/[\s']/g, "");
  const scale = m[3] ? SCALE[m[3].toLowerCase()] : 1;
  if (!scale) return null;
  // "3,5" or "1.234,5": a comma as the decimal point.
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(digits) || /^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits) || /^\d+(\.\d+)?$/.test(digits)) digits = digits.replace(/,/g, "");
  else return null;
  const n = Number(digits) * scale * (m[1] === "-" || neg ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}

/** The unit a column's values are written in ("%", "$", "°C"), if they share one. */
function unitOf(values: string[]): string | undefined {
  const units = values.map((v) => {
    const t = v.trim();
    return /%$/.test(t) ? "%" : /°C$/.test(t) ? "°C" : /°F$/.test(t) ? "°F" : /^\(?-?\s*\$/.test(t) ? "$" : /^\(?-?\s*€/.test(t) ? "€" : /^\(?-?\s*£/.test(t) ? "£" : "";
  });
  return units[0] && units.every((u) => u === units[0]) ? units[0] : undefined;
}

/** A figure written short, as on a slide: 8.1 bn, 12.4 k, 3.5 (pure). */
export function short(n: number, unit?: string): string {
  const a = Math.abs(n);
  const [d, s] = a >= 1e12 ? [1e12, " tn"] : a >= 1e9 ? [1e9, " bn"] : a >= 1e6 ? [1e6, " m"] : a >= 1e4 ? [1e3, " k"] : [1, ""];
  const v = n / d, abs = Math.abs(v);
  const txt = (abs >= 100 || (d === 1 && Number.isInteger(v)) ? Math.round(v).toLocaleString("en-US") : abs >= 10 ? v.toFixed(1) : v.toFixed(abs < 1 && d === 1 ? 2 : 1)).replace(/\.0$/, "");
  if (unit === "$" || unit === "€" || unit === "£") return `${n < 0 ? "-" : ""}${unit}${txt.replace(/^-/, "")}${s}`;
  return `${txt}${s}${unit ? (unit === "%" || unit.startsWith("°") ? unit : ` ${unit}`) : ""}`;
}

// ---- Drawing helpers -----------------------------------------------------------------------------------

/** Shares of 100 tiles, the largest remainders rounding up, so they add to exactly 100 (pure). */
export function tiles(items: Item[]): number[] {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!total) return items.map(() => 0);
  const exact = items.map((x) => (Math.max(0, x.value) / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((s, x) => s + x, 0);
  for (const i of exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) { if (left-- <= 0) break; out[i]++; }
  return out;
}

/** Round numbers for an axis: 0 (or the low end) up past the top, in 1, 2 or 5 steps (pure). */
export function niceTicks(lo: number, hi: number, n = 3): number[] {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step, out: number[] = [];
  for (let v = start; v <= hi + step * 0.999; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// ---- Tables ----------------------------------------------------------------------------------------

/** Splits delimited text (CSV, TSV, semicolons) into rows, honouring quotes. */
export function splitDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** The delimiter a text is a table in, if it is one: the same number of cells on most lines. */
export function tableDelimiter(text: string): string | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40);
  if (lines.length < 2) return null;
  let best: { d: string; score: number } | null = null;
  for (const d of ["\t", ",", ";", "|"]) {
    const counts = splitDelimited(lines.join("\n"), d).map((r) => r.length);
    const top = counts[0];
    if (top < 2) continue;
    const same = counts.filter((c) => c === top).length / counts.length;
    // Prose has commas too: a table's lines have the same count, and it's tabs or several columns.
    if (same >= 0.8 && (d === "\t" || top >= 2) && (same + top / 10) > (best?.score ?? 0)) best = { d, score: same + top / 10 };
  }
  if (!best) return null;
  // A sentence with one comma per line isn't a table unless the cells are short.
  if (best.d === "," || best.d === ";") {
    const cells = splitDelimited(lines.join("\n"), best.d).flat();
    if (cells.filter((c) => c.split(/\s+/).length > 6).length > cells.length / 4) return null;
  }
  return best.d;
}

const isHeaderRow = (row: string[], next?: string[]) =>
  row.every((c) => parseNumber(c) === null || /^(19|20)\d\d$/.test(c)) && !!next && row.some((c, i) => parseNumber(c) === null && parseNumber(next[i] ?? "") !== null) || row.every((c) => c && parseNumber(c) === null) && !!next && next.some((c) => parseNumber(c) !== null);

/** Reads delimited text into a table with headers (made up as "Column 2" when the first row isn't one). */
export function parseTable(text: string, delim = tableDelimiter(text) ?? ","): Table {
  const rows = splitDelimited(text.trim(), delim);
  if (!rows.length) return { columns: [], rows: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const head = isHeaderRow(rows[0], rows[1]);
  const columns = head ? pad(rows[0]).map((c, i) => c || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { columns, rows: (head ? rows.slice(1) : rows).map(pad) };
}

/** Reads JSON: an array of records, a GeoJSON collection, or an object of names to numbers. */
export function tableFromJson(data: unknown): Table | null {
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const o = data as Record<string, unknown> | unknown[] | null;
  if (!o || typeof o !== "object") return null;
  if (!Array.isArray(o) && o.type === "FeatureCollection" && Array.isArray(o.features)) {
    const feats = (o.features as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[])
      .map((f) => ({ c: centroid(f.geometry), p: f.properties ?? {} })).filter((f) => f.c);
    if (!feats.length) return null;
    const keys = [...new Set(feats.flatMap((f) => Object.keys(f.p)))].filter((k) => feats.some((f) => typeof f.p[k] !== "object" || f.p[k] === null)).slice(0, 12);
    return { columns: [...keys, "longitude", "latitude"], rows: feats.map((f) => [...keys.map((k) => cell(f.p[k])), String(f.c![0]), String(f.c![1])]) };
  }
  // { data: [...] } or { rows: [...] }: the list inside.
  if (!Array.isArray(o)) {
    const inner = Object.values(o).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object");
    if (inner) return tableFromJson(inner);
    const pairs = Object.entries(o).filter(([, v]) => typeof v === "number" || (typeof v === "string" && parseNumber(v) !== null));
    return pairs.length >= 2 ? { columns: ["Name", "Value"], rows: pairs.map(([k, v]) => [k, String(v)]) } : null;
  }
  if (!o.length) return null;
  if (o.every((r) => Array.isArray(r))) return { columns: (o[0] as unknown[]).map((_, i) => `Column ${i + 1}`), rows: (o as unknown[][]).map((r) => r.map(cell)) };
  const recs = o.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
  if (!recs.length) return null;
  const columns = [...new Set(recs.flatMap((r) => Object.keys(r)))].slice(0, 20);
  return { columns, rows: recs.map((r) => columns.map((c) => cell(r[c]))) };
}

function centroid(g?: { type?: string; coordinates?: unknown }): [number, number] | null {
  if (!g || !g.coordinates) return null;
  const pts: number[][] = [];
  const walk = (c: unknown) => { if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]); else if (Array.isArray(c)) c.forEach(walk); };
  walk(g.coordinates);
  const ok = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!ok.length) return null;
  return [ok.reduce((s, p) => s + p[0], 0) / ok.length, ok.reduce((s, p) => s + p[1], 0) / ok.length];
}

// ---- What each column is ----------------------------------------------------------------------------

type ColKind = "number" | "time" | "lat" | "lon" | "place" | "text";

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+\d{2,4})?$/i;
const isTime = (v: string) => /^(1[0-9]|20)\d\d$/.test(v) || /^\d{4}-\d{2}(-\d{2})?/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v) || MONTHS.test(v) || /^Q[1-4]\s*\d{2,4}$/i.test(v) || /^\d{4}\s*Q[1-4]$/i.test(v);
const ADDRESS = /\d+\s+[\w.'-]+.*\b(st|street|ave|avenue|rd|road|blvd|boulevard|lane|ln|dr|drive|way|pl|place|ct|court|sq|square|hwy|highway|pkwy|parkway|terrace|ter|calle|rue|strasse|straße|via)\b|\b\d{5}(-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** What a column holds, from its name and values. */
export function columnKind(name: string, values: string[]): ColKind {
  const n = name.trim().toLowerCase();
  const vals = values.filter((v) => v.trim());
  if (!vals.length) return "text";
  const nums = vals.map(parseNumber);
  const numeric = nums.filter((x) => x !== null).length / vals.length >= 0.8;
  if (numeric && /^(lat|latitude|y)$/.test(n) && nums.every((x) => x === null || Math.abs(x) <= 90)) return "lat";
  if (numeric && /^(lon|lng|long|longitude|x)$/.test(n) && nums.every((x) => x === null || Math.abs(x) <= 180)) return "lon";
  if (/^(year|date|month|quarter|time|period|day|week)s?$/.test(n) && vals.every(isTime)) return "time";
  if (vals.filter(isTime).length / vals.length >= 0.9 && !(numeric && vals.some((v) => !/^(1[0-9]|20)\d\d$/.test(v) && /^\d+$/.test(v)))) return "time";
  if (numeric) return "number";
  if (/(address|location|place|city|town|venue|site|store|office|country|region|state|county|where|addr)/.test(n)) return "place";
  if (vals.filter((v) => ADDRESS.test(v)).length / vals.length >= 0.6) return "place";
  return "text";
}

/** Sorts time labels in time order, when they read as times. */
const timeKey = (v: string): number => {
  const y = /^(\d{4})$/.exec(v); if (y) return +y[1];
  const iso = Date.parse(v); if (Number.isFinite(iso)) return iso / 3.15e10;
  const q = /Q([1-4])\D*(\d{2,4})|(\d{4})\D*Q([1-4])/i.exec(v);
  if (q) { const yr = +(q[2] ?? q[3]), qq = +(q[1] ?? q[4]); return (yr < 100 ? 2000 + yr : yr) + qq / 4; }
  return NaN;
};

// ---- Suggestions from a table ---------------------------------------------------------------------------

const MAX_BARS = 12;

/** The visuals a table can make, the best first. */
export function suggestFromTable(t: Table, title?: string): Suggestion[] {
  if (!t.rows.length || !t.columns.length) return [];
  const kinds = t.columns.map((c, i) => columnKind(c, t.rows.map((r) => r[i] ?? "")));
  const idx = (k: ColKind) => kinds.indexOf(k);
  const all = (k: ColKind) => kinds.flatMap((x, i) => (x === k ? [i] : []));
  const numCols = all("number");
  const out: Suggestion[] = [], later: Suggestion[] = [];
  const col = (i: number) => t.columns[i];
  const items = (li: number, vi: number): Item[] =>
    t.rows.flatMap((r) => { const v = parseNumber(r[vi] ?? ""); return v === null || !(r[li] ?? "").trim() ? [] : [{ label: r[li].trim(), value: v }]; });
  const unit = (vi: number) => unitOf(t.rows.map((r) => r[vi] ?? "").filter(Boolean));

  // On the globe: coordinates, or places to find.
  const lat = idx("lat"), lon = idx("lon");
  if (lat >= 0 && lon >= 0) {
    const vi = numCols[0];
    const nameCol = [idx("text"), idx("place")].find((i) => i >= 0) ?? -1;
    const spots: Spot[] = t.rows.flatMap((r, k) => {
      const la = parseNumber(r[lat]), lo = parseNumber(r[lon]);
      if (la === null || lo === null) return [];
      const v = vi !== undefined ? parseNumber(r[vi] ?? "") : null;
      return [{ label: nameCol >= 0 ? r[nameCol] : `Point ${k + 1}`, lat: la, lon: lo, ...(v !== null ? { value: v } : {}) }];
    }).slice(0, 2000);
    if (spots.length) out.push({ label: `${spots.length} place${spots.length === 1 ? "" : "s"} on the globe${vi !== undefined ? `, sized by ${col(vi).toLowerCase()}` : ""}`, visual: { kind: "points", title: title ?? (vi !== undefined ? col(vi) : undefined), unit: vi !== undefined ? unit(vi) : undefined, items: spots } });
  } else {
    const places = all("place");
    // The column to look up: addresses first, then by its name; city, region and country columns join it.
    const score = (i: number) => t.rows.filter((r) => ADDRESS.test(r[i] ?? "")).length / t.rows.length * 2 + (/(address|location|addr|where)/i.test(col(i)) ? 1 : 0) + (/(city|town|place|venue|site)/i.test(col(i)) ? 0.5 : 0);
    const pi = [...places].sort((a, b) => score(b) - score(a))[0] ?? -1;
    if (pi >= 0) {
      const vi = numCols[0];
      const headless = t.columns.every((c) => /^Column \d+$/.test(c));
      const extras = places.filter((i) => i !== pi && /(city|town|state|county|region|province|country|post|zip)/i.test(col(i)));
      const nameCol = [...places, ...all("text")].filter((i) => i !== pi && !extras.includes(i)).sort((a, b) => a - b)[0] ?? pi;
      const find = t.rows.filter((r) => r[pi]?.trim()).slice(0, 100).map((r) => {
        const v = vi !== undefined ? parseNumber(r[vi] ?? "") : null;
        // No header row: the line was an address written with commas, so all its words go to the lookup.
        const parts = headless ? r.filter((c, i) => c && i !== vi && kinds[i] !== "number") : [r[pi], ...extras.map((i) => r[i]).filter(Boolean)];
        return { label: headless ? r[pi] : r[nameCol] || r[pi], query: parts.join(", "), ...(v !== null ? { value: v } : {}) };
      });
      // Street addresses lead; names of countries or cities come after their bars.
      if (find.length) (score(pi) >= 1.2 ? out : later).push({ label: `Find ${find.length} place${find.length === 1 ? "" : "s"} on the globe${vi !== undefined ? `, sized by ${col(vi).toLowerCase()}` : ""}`, visual: { kind: "points", title: title ?? (vi !== undefined ? col(vi) : headless ? undefined : col(pi)), unit: vi !== undefined ? unit(vi) : undefined, items: [] }, find });
    }
  }

  // Over time.
  const ti = idx("time");
  if (ti >= 0 && numCols.length) {
    for (const vi of numCols.slice(0, 2)) {
      let its = items(ti, vi);
      if (its.every((x) => Number.isFinite(timeKey(x.label)))) its = [...its].sort((a, b) => timeKey(a.label) - timeKey(b.label));
      if (its.length >= 3) out.push({ label: `${col(vi)} over time, as a line`, visual: { kind: "line", title: title ?? col(vi), unit: unit(vi), items: its.slice(-60) } });
      if (its.length >= 2) {
        const first = its[0], last = its[its.length - 1];
        out.push({ label: `${col(vi)}: ${last.label} against ${first.label}, as one figure`, visual: { kind: "number", title: `${col(vi)}, ${last.label}`, unit: unit(vi), value: last.value, was: first.value, wasLabel: first.label } });
      }
    }
  }

  // Compared.
  const li = [idx("text"), idx("place")].find((i) => i >= 0) ?? -1;
  if (li >= 0 && numCols.length) {
    for (const vi of numCols.slice(0, 3)) {
      const its = items(li, vi);
      if (its.length < 2) continue;
      const ranked = [...its].sort((a, b) => b.value - a.value);
      out.push({ label: `${col(vi)} by ${col(li).toLowerCase()}, as bars${its.length > MAX_BARS ? ` (top ${MAX_BARS})` : ""}`, visual: { kind: "bars", title: title ?? `${col(vi)} by ${col(li).toLowerCase()}`, unit: unit(vi), items: ranked.slice(0, MAX_BARS) } });
      if (its.length <= 8 && its.every((x) => x.value >= 0) && its.some((x) => x.value > 0)) out.push({ label: `${col(vi)} as shares of the whole`, visual: { kind: "share", title: title ?? col(vi), unit: unit(vi), items: ranked } });
    }
  }

  // A single row of numbers: its biggest figure.
  if (t.rows.length === 1 && numCols.length) {
    const vi = numCols[0];
    const v = parseNumber(t.rows[0][vi])!;
    out.push({ label: `${col(vi)} as one figure`, visual: { kind: "number", title: title ?? col(vi), unit: unit(vi), value: v } });
  }
  // A column of numbers with no labels: the total.
  if (li < 0 && ti < 0 && numCols.length && t.rows.length > 1) {
    const vi = numCols[0];
    const total = t.rows.reduce((s, r) => s + (parseNumber(r[vi]) ?? 0), 0);
    out.push({ label: `The total of ${col(vi).toLowerCase()}, as one figure`, visual: { kind: "number", title: title ?? `Total ${col(vi).toLowerCase()}`, unit: unit(vi), value: total } });
  }
  return [...out, ...later];
}

// ---- Documents and loose text ----------------------------------------------------------------------------

/** A figure stated in a sentence: "8.1 billion people", "rose 12%", "$4.5M in sales". */
export function figureIn(text: string): { value: number; unit?: string; label: string } | null {
  const m = /([$€£]?\s?\d[\d,.]*\s?(?:%|percent|thousand|million|billion|trillion|bn|mn|k|m)?)\s*([a-z][a-z ]{0,30})?/i.exec(text);
  if (!m) return null;
  const raw = m[1].replace(/percent/i, "%").trim();
  const v = parseNumber(raw);
  if (v === null || (!raw.includes(",") && v >= 1900 && v <= 2100 && !/[%$€£]/.test(raw))) return null;
  const unit = raw.endsWith("%") ? "%" : /^[$€£]/.test(raw) ? raw[0] : undefined;
  const label = (m[2] ?? "").trim().split(/\s+/).slice(0, 4).join(" ");
  return { value: v, unit, label };
}

const ADDRESS_LINE = (l: string) => ADDRESS.test(l) && l.length < 140 && l.split(/\s+/).length <= 18;

/** Splits a document into sections (by headings, else by paragraphs), each a slide. */
export function sectionsOf(text: string): { title: string; text: string; visual?: Visual }[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: { title: string; body: string[] }[] = [];
  const heading = (l: string) => /^#{1,4}\s+\S/.test(l) ? l.replace(/^#+\s+/, "") : null;
  if (lines.some((l) => heading(l))) {
    for (const l of lines) {
      const hd = heading(l);
      if (hd) out.push({ title: hd.trim(), body: [] });
      else if (l.trim()) (out.at(-1) ?? out[out.push({ title: "", body: [] }) - 1]).body.push(l.trim());
    }
  } else {
    // Paragraphs; a short line on its own before one reads as its heading.
    const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const p of paras) {
      const [first, ...rest] = p.split("\n");
      if (rest.length && first.length < 70 && !/[.:;,]$/.test(first)) out.push({ title: first.trim(), body: rest.map((x) => x.trim()) });
      else if (!rest.length && first.length < 70 && !/[.!?]$/.test(first)) out.push({ title: first.trim(), body: [] });
      else if (out.length && !out.at(-1)!.body.length) out.at(-1)!.body.push(...p.split("\n").map((x) => x.trim()));
      else out.push({ title: "", body: p.split("\n").map((x) => x.trim()) });
    }
  }
  return out.filter((s) => s.title || s.body.length).slice(0, 40).map((s) => {
    const body = s.body.map((l) => l.replace(/^[-*•]\s+/, "")).join(" ").replace(/\s+/g, " ").trim();
    const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? "";
    const title = s.title || (firstSentence.length <= 80 ? firstSentence : `${firstSentence.slice(0, 77).replace(/\s+\S*$/, "")}…`);
    const rest = s.title ? body : body.slice(firstSentence.length).trim();
    const text = rest.length > 300 ? `${rest.slice(0, 297).replace(/\s+\S*$/, "")}…` : rest;
    // A short section built around one figure shows it.
    const fig = body.length <= 220 ? figureIn(body) : null;
    return { title, text, ...(fig && Math.abs(fig.value) >= 2 ? { visual: { kind: "number" as const, title: fig.label || undefined, unit: fig.unit, value: fig.value } } : {}) };
  });
}

/** Reads anything pasted or loaded as text. */
export function readText(text: string, name = ""): Reading {
  const t = text.trim();
  if (!t) return { about: "Nothing to read.", suggestions: [] };
  const ext = name.toLowerCase().split(".").pop() ?? "";
  // JSON.
  if (/^[[{]/.test(t) || ext === "json" || ext === "geojson") {
    try {
      const table = tableFromJson(JSON.parse(t));
      if (table) return { about: `Data: ${table.rows.length} record${table.rows.length === 1 ? "" : "s"}; ${table.columns.slice(0, 6).join(", ")}`, suggestions: suggestFromTable(table, titleFrom(name)) };
    } catch { /* not JSON after all */ }
  }
  // A table.
  const delim = ext === "tsv" ? "\t" : ext === "csv" ? (tableDelimiter(t) ?? ",") : tableDelimiter(t);
  if (delim) {
    const table = parseTable(t, delim);
    const sugg = suggestFromTable(table, titleFrom(name));
    if (sugg.length) return { about: `A table: ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}; ${table.columns.slice(0, 6).join(", ")}`, suggestions: sugg };
  }
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // "Label: number" or "Label  number" lines.
  const pairs = lines.map((l) => /^(.+?)[\s:=–-]+([-$€£(]?\s?\d[\d,.\s]*\s?(?:%|k|m|bn|million|billion)?\)?)$/i.exec(l)).filter((m): m is RegExpExecArray => !!m && parseNumber(m[2]) !== null);
  if (lines.length >= 2 && pairs.length >= Math.max(2, lines.length * 0.7)) {
    const table: Table = { columns: [/\b(19|20)\d\d\b/.test(pairs[0][1]) && pairs.every((p) => isTime(p[1].trim())) ? "Year" : "Name", "Value"], rows: pairs.map((p) => [p[1].trim(), p[2].trim()]) };
    return { about: `${pairs.length} figures`, suggestions: suggestFromTable(table, titleFrom(name)) };
  }
  // One number.
  if (lines.length <= 2 && t.length < 120) {
    const fig0 = parseNumber(lines[0]) === null ? figureIn(t) : null;
    const v = parseNumber(lines[0]) ?? (fig0 ? null : parseNumber(lines[0].split(/\s+/)[0]));
    const fig = v === null ? fig0 : null;
    if (v !== null || fig) {
      const value = v ?? fig!.value, unit = v !== null ? unitOf([lines[0]]) : fig!.unit;
      const label = v !== null ? (lines[1] ?? lines[0].split(/\s+/).slice(1).join(" ")) : fig!.label;
      return { about: "A figure", suggestions: [{ label: "As one big figure", visual: { kind: "number", title: label || undefined, unit, value } }] };
    }
  }
  // A list of addresses or places.
  const addr = lines.filter(ADDRESS_LINE);
  const placeList = lines.length >= 2 && lines.length <= 100 && lines.every((l) => l.length < 80 && !/[.!?]$/.test(l) && l.split(/\s+/).length <= 10);
  if (addr.length >= 2 && addr.length >= lines.length * 0.6 || placeList) {
    const list = addr.length >= lines.length * 0.6 ? addr : lines;
    return { about: `${list.length} address${list.length === 1 ? "" : "es"} or places`, suggestions: [{ label: `Find ${list.length} on the globe`, visual: { kind: "points", title: titleFrom(name), items: [] }, find: list.slice(0, 100).map((q) => ({ label: q.split(",")[0], query: q })) }] };
  }
  // A document.
  const sections = sectionsOf(t);
  const found = lines.filter(ADDRESS_LINE);
  return {
    about: `A document: ${sections.length} section${sections.length === 1 ? "" : "s"}${found.length ? `, ${found.length} address${found.length === 1 ? "" : "es"}` : ""}`,
    sections,
    suggestions: found.length ? [{ label: `Its ${found.length} address${found.length === 1 ? "" : "es"} on the globe`, visual: { kind: "points", title: "Where", items: [] }, find: found.slice(0, 100).map((q) => ({ label: q.split(",")[0], query: q })) }] : [],
  };
}

const titleFrom = (name: string) => name ? name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || undefined : undefined;

// ---- Placing points ---------------------------------------------------------------------------------------

/** A camera looking down on a set of points, with room around them (pure). */
export function pointsCamera(spots: Spot[]): { lon: number; lat: number; height: number; heading: number; pitch: number; roll: number } {
  if (!spots.length) return { lon: 0, lat: 20, height: 20_000_000, heading: 0, pitch: -Math.PI / 2, roll: 0 };
  const lats = spots.map((s) => s.lat);
  // Longitudes may straddle the date line: take the narrower of the two spans.
  const lons = spots.map((s) => s.lon).sort((a, b) => a - b);
  let gap = 0, at = 0;
  for (let i = 0; i < lons.length; i++) { const g = (i + 1 < lons.length ? lons[i + 1] : lons[0] + 360) - lons[i]; if (g > gap) { gap = g; at = i; } }
  const west = lons[(at + 1) % lons.length], span = 360 - gap;
  let lon = west + span / 2; if (lon > 180) lon -= 360;
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kmWide = Math.max(span * 111 * Math.cos((lat * Math.PI) / 180), (Math.max(...lats) - Math.min(...lats)) * 111);
  const height = Math.min(20_000_000, Math.max(2_500, kmWide * 1000 * 1.6));
  return { lon, lat, height, heading: 0, pitch: -Math.PI / 2, roll: 0 };
}

// ---- Checking a saved visual -------------------------------------------------------------------------------

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : undefined);

/** A visual from a file or the network, kept only if it's well formed. */
export function visualFromJson(v: unknown): Visual | undefined {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return undefined;
  const base = { title: str(o.title), unit: str(o.unit, 12) };
  const items = (max: number): Item[] => (Array.isArray(o.items) ? o.items : []).flatMap((x) => (x && fin(x.value) ? [{ label: String(x.label ?? "").slice(0, 80), value: x.value }] : [])).slice(0, max);
  switch (o.kind) {
    case "bars": case "share": case "line": { const it = items(o.kind === "line" ? 400 : 60); return it.length ? { kind: o.kind, ...base, items: it } : undefined; }
    case "number": return fin(o.value) ? { kind: "number", ...base, value: o.value, ...(fin(o.was) ? { was: o.was, wasLabel: str(o.wasLabel, 40) } : {}) } : undefined;
    case "points": {
      const it = (Array.isArray(o.items) ? o.items : []).flatMap((x) => (x && fin(x.lon) && fin(x.lat) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180 ? [{ label: String(x.label ?? "").slice(0, 80), lon: x.lon, lat: x.lat, ...(fin(x.value) ? { value: x.value } : {}) }] : [])).slice(0, 2000);
      return it.length ? { kind: "points", ...base, items: it } : undefined;
    }
    case "image": return typeof o.src === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(o.src) ? { kind: "image", title: base.title, src: o.src } : undefined;
    default: return undefined;
  }
}
