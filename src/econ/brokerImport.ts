// Holdings from a broker's export (pure). Fidelity, Schwab, Vanguard, E*TRADE,
// Robinhood and Interactive Brokers all export positions as CSV with a symbol
// column and either a market value or a quantity and a price; this finds those
// columns by name, cleans "$1,234.56" style numbers and matches symbols to the
// companies Terreno maps. The rest come back as "not mapped yet".
import { findCompany } from "./companies";
import type { Holding } from "./model";

/** Splits CSV text into rows, honouring quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const num = (s: string | undefined) => { if (!s) return NaN; const neg = /^\(.*\)$/.test(s.trim()) || s.trim().startsWith("-"); const v = Number(s.replace(/[^0-9.]/g, "")); return neg ? -v : v; };
const find = (head: string[], ...names: RegExp[]) => head.findIndex((h) => names.some((re) => re.test(h)));

export interface Imported { holdings: Holding[]; unknown: { symbol: string; value: number }[]; skipped: number }

/** Reads positions from a broker CSV, or from "AAPL 5000" lines typed or pasted (pure). */
export function importPositions(text: string): Imported {
  const rows = csvRows(text);
  const hi = rows.findIndex((r) => r.some((c) => /^(symbol|ticker|instrument|security id)$/i.test(c)));
  const out: Imported = { holdings: [], unknown: [], skipped: 0 };
  const add = (symbol: string, value: number) => {
    if (!symbol || !Number.isFinite(value) || value <= 0) { out.skipped++; return; }
    const c = findCompany(symbol.replace(/\*+$/, ""));
    if (c) { const h = out.holdings.find((x) => x.id === c.id); if (h) h.value += value; else out.holdings.push({ id: c.id, value }); }
    else out.unknown.push({ symbol, value });
  };
  if (hi < 0) {
    // Plain lines: "AAPL 5000", "Nestlé, $7,000".
    for (const line of text.split(/\n/)) {
      const m = /^\s*([A-Za-zÀ-ÿ.\- ]+?)[\s,;:]+\$?\s*([\d,.]+)\s*$/.exec(line);
      if (m) add(m[1].trim(), num(m[2])); else if (line.trim()) out.skipped++;
    }
    return out;
  }
  const head = rows[hi].map((c) => c.toLowerCase());
  const sym = find(head, /^(symbol|ticker|instrument|security id)$/);
  const val = find(head, /^(current value|market value|mkt val|value|position value|marketvalue|current market value)/);
  const qty = find(head, /^(quantity|qty|shares|position)$/);
  const px = find(head, /^(last price|price|last|current price|mark)$/);
  for (const r of rows.slice(hi + 1)) {
    const s = r[sym] ?? "";
    if (!s || /total|cash|pending|account/i.test(s)) { out.skipped++; continue; }
    const v = val >= 0 ? num(r[val]) : qty >= 0 && px >= 0 ? num(r[qty]) * num(r[px]) : NaN;
    add(s, v);
  }
  out.holdings.forEach((h) => (h.value = Math.round(h.value)));
  return out;
}
