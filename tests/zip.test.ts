import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { docxText, unzip, xlsxRows } from "../src/util/zip";

/** A minimal ZIP holding the given files, deflated (or stored). */
function zip(files: Record<string, string>, store = false): ArrayBuffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const raw = Buffer.from(body), data = store ? raw : deflateRawSync(raw), nm = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nm.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(store ? 0 : 8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, nm, data); central.push(cd, nm);
    offset += 30 + nm.length + data.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, cdBuf, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

describe("zip", () => {
  it("reads deflated and stored entries it's asked for", async () => {
    for (const store of [false, true]) {
      const files = await unzip(zip({ "a.txt": "hello hello hello", "b.txt": "no" }, store), (n) => n === "a.txt");
      expect([...files.keys()]).toEqual(["a.txt"]);
      expect(new TextDecoder().decode(files.get("a.txt"))).toBe("hello hello hello");
    }
    await expect(unzip(new ArrayBuffer(40), () => true)).rejects.toThrow(/ZIP/);
  });
  it("reads a Word document's text with headings", () => {
    const xml = '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Our farms</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Fields &amp; </w:t></w:r><w:r><w:t>orchards.</w:t></w:r></w:p></w:body></w:document>';
    expect(docxText(xml)).toBe("# Our farms\n\nFields & orchards.");
  });
  it("reads a sheet with shared strings, keeping empty cells in place", () => {
    const shared = "<sst><si><t>City</t></si><si><t>People</t></si><si><t>Oslo</t></si></sst>";
    const sheet = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>709000</v></c></row></sheetData>';
    expect(xlsxRows(sheet, shared)).toEqual([["City", "People"], ["Oslo", "", "709000"]]);
  });
});
