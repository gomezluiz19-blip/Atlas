// CSV cells that are safe to open in a spreadsheet. A cell starting with =, +, -, @, a tab or a
// carriage return is run as a formula by Excel, Sheets and LibreOffice ("CSV injection"), so text that
// someone else typed (a contact's name, a 311 description, an imported site) could run in the
// spreadsheet of whoever opens the export. Such text gets a leading apostrophe, which spreadsheets
// show as plain text. Numbers, including negative ones, are left alone.

/** One CSV cell: neutralised if it would run as a formula, quoted when it needs to be (pure). */
export function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text, header first (pure). */
export const csvText = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
