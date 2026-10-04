// Taking work out of the Pro tools: CSV files (for spreadsheets and other
// systems) and printable reports (for a board, a donor, a chief of staff),
// opened in their own window ready to print or save as PDF.

import { csvCell as cell } from "../../util/csv";

/** Rows of objects to CSV text, columns in the order of `head` (pure). */
export function toCsv(head: string[], rows: (string | number | boolean | undefined | null)[][]): string {
  return [head.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

export function downloadCsv(file: string, head: string[], rows: (string | number | boolean | undefined | null)[][]) {
  const blob = new Blob(["﻿" + toCsv(head, rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.endsWith(".csv") ? file : `${file}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Reads a file the person picks (CSV, ICS, GeoJSON…) as text. */
export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => { const f = input.files?.[0]; if (!f) return resolve(null); f.text().then(resolve, () => resolve(null)); };
    input.click();
  });
}

export type Section =
  | { heading: string; kpis: [string, string][] }
  | { heading: string; lines: string[] }
  | { heading: string; table: { head: string[]; rows: (string | number)[][] } };

const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The report as a standalone HTML page (pure). */
export function reportHtml(title: string, subtitle: string, sections: Section[], footer = ""): string {
  const body = sections.map((s) => {
    const inner = "kpis" in s ? `<div class="kpis">${s.kpis.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`
      : "lines" in s ? `<ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
      : `<table><thead><tr>${s.table.head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return `<section><h2>${esc(s.heading)}</h2>${inner}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:14px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:#1b1b1a;max-width:860px;margin:32px auto;padding:0 24px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}.sub{color:#6b6961;margin:0 0 24px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#6b6961;margin:28px 0 10px;border-bottom:1px solid #e3e0d8;padding-bottom:6px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpis div{background:#f5f4f0;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column}.kpis b{font-size:22px}.kpis span{font-size:12px;color:#6b6961}
ul{padding-left:18px;margin:0}li{margin:4px 0}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ecebe6;vertical-align:top}th{font-weight:600;color:#55534e}
footer{margin-top:32px;color:#8a877f;font-size:11.5px}@media print{body{margin:0}.noprint{display:none}}
</style></head><body><p class="noprint"><button id="print">Print or save as PDF</button></p><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>${body}<footer>${esc(footer)}</footer></body></html>`;
}

/** Opens the report in a new window, ready to print. */
export function printReport(title: string, subtitle: string, sections: Section[], footer = "Made with Atlas") {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(reportHtml(title, subtitle, sections, footer));
  w.document.close();
  // No inline handlers: the report window inherits the site's Content Security Policy.
  w.document.getElementById("print")?.addEventListener("click", () => w.print());
  return true;
}
