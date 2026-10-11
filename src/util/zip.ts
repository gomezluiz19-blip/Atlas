// Reads files out of a ZIP (a .docx or .xlsx is one) with the browser's own inflater, no library. Only what
// Terreno needs: stored and deflated entries, no encryption, no ZIP64.

const u16 = (b: DataView, o: number) => b.getUint16(o, true);
const u32 = (b: DataView, o: number) => b.getUint32(o, true);

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The entries whose names pass `want`, as bytes by name. */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const b = new DataView(buf), bytes = new Uint8Array(buf);
  // The end-of-directory record sits in the last 64 kB (after an optional comment).
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) if (u32(b, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("Not a ZIP file.");
  const count = u16(b, end + 10);
  let at = u32(b, end + 16);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= buf.byteLength; n++) {
    if (u32(b, at) !== 0x02014b50) break;
    const method = u16(b, at + 10), size = u32(b, at + 20), nameLen = u16(b, at + 28), extra = u16(b, at + 30), comment = u16(b, at + 32), local = u32(b, at + 42);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extra + comment;
    if (!want(name)) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflate(raw));
  }
  return out;
}

const text = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : "");
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");

/** A Word document's text, headings marked with "#" as Markdown would (pure, on document.xml). */
export function docxText(xml: string): string {
  const paras: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const t = (p.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? []).map((x) => (x.startsWith("<w:t") && !x.startsWith("<w:tab") ? unescape(x.replace(/<[^>]+>/g, "")) : x === "<w:tab/>" ? "\t" : "\n")).join("");
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const level = /^(Heading|Title)(\d?)$/i.exec(style);
    paras.push(level && t.trim() ? `${"#".repeat(Math.min(4, Number(level[2] || 1)))} ${t.trim()}` : t);
  }
  // Paragraphs apart, so headings and body read as sections; table cells on one line with tabs.
  return paras.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A Word file's text. */
export async function readDocx(buf: ArrayBuffer): Promise<string> {
  const files = await unzip(buf, (n) => n === "word/document.xml");
  return docxText(text(files.get("word/document.xml")));
}

/** The first sheet of a workbook as rows of cells (pure, on the sheet's and shared strings' XML). */
export function xlsxRows(sheetXml: string, sharedXml: string): string[][] {
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) => unescape((si.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const col = (ref: string) => { let n = 0; for (const c of ref.replace(/\d+$/, "")) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const rows: string[][] = [];
  for (const r of sheetXml.match(/<row[ >][\s\S]*?<\/row>/g) ?? []) {
    const row: string[] = [];
    for (const c of r.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1];
      const type = /t="(\w+)"/.exec(c)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(c)?.[1] ?? /<t(?:\s[^>]*)?>([^<]*)<\/t>/.exec(c)?.[1] ?? "";
      const value = type === "s" ? shared[+v] ?? "" : unescape(v);
      row[ref ? col(ref) : row.length] = value;
    }
    if (row.some((x) => x)) rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

/** A spreadsheet's first sheet as tab-separated text. */
export async function readXlsx(buf: ArrayBuffer): Promise<string> {
  const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const first = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10))[0];
  if (!first) throw new Error("No sheet in that workbook.");
  return xlsxRows(text(files.get(first)), text(files.get("xl/sharedStrings.xml"))).map((r) => r.map((c) => c.replace(/[\t\n]/g, " ")).join("\t")).join("\n");
}
