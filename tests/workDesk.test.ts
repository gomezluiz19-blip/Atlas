import { describe, expect, it } from "vitest";
import { demoBook } from "../src/work/desk/demo";
import { attention, downstream, lineage, projected, recsFromRows, round, slip, type Rec } from "../src/work/desk/model";
import { parseCsv } from "../src/pro/office/model";

const T = "2026-03-02";
const rec = (o: Partial<Rec> & { id: string }): Rec => ({ kind: "order", title: o.id, status: "", health: "ok", ...o });

describe("consequences", () => {
  const recs = [
    rec({ id: "client", kind: "client", title: "Acme" }),
    rec({ id: "order", parent: "client", due: "2026-03-10", value: 1000, currency: "USD", needs: ["ship"] }),
    rec({ id: "ship", kind: "shipment", title: "MSKU 1", parent: "order", due: "2026-03-05", eta: "2026-03-12", health: "late" }),
  ];
  it("carries a late shipment forward to the order that waits on it", () => {
    const when = projected(recs);
    expect(when.get("order")).toBe("2026-03-12");
    expect(slip(recs[1], when.get("order"), T)).toBe(2);
  });
  it("knows the chain up to the client, and what's downstream", () => {
    expect(lineage(recs, "ship").map((r) => r.id)).toEqual(["order", "client"]);
    expect(downstream(recs, "ship").map((r) => r.id)).toEqual(["order"]);
  });
  it("tells it once, from where it starts, with the money", () => {
    const a = attention(recs, T);
    expect(a).toHaveLength(1);
    expect(a[0].rec.id).toBe("ship");
    expect(a[0].atStake).toBe(1000);
    expect(a[0].sentence).toBe("Shipment MSKU 1 is 7 days behind, so order for Acme misses 10 Mar by 2 days ($1,000).");
  });
  it("lets finished work hold nothing up, and survives a loop", () => {
    expect(projected([rec({ id: "a", due: "2026-03-03", needs: ["b"] }), rec({ id: "b", eta: "2026-04-01", health: "done" })]).get("a")).toBe("2026-03-03");
    expect(projected([rec({ id: "a", due: "2026-03-03", needs: ["b"] }), rec({ id: "b", due: "2026-03-04", needs: ["a"] })]).get("a")).toBe("2026-03-04");
  });
  it("counts overdue work as late even without an estimate", () => {
    expect(slip(rec({ id: "x", due: "2026-02-27" }), "2026-02-27", T)).toBe(3);
  });
});

describe("the examples", () => {
  it("each has something that needs you, worst first", () => {
    for (const role of ["company", "field", "solo"] as const) {
      const a = attention(demoBook(role, T).recs, T);
      expect(a.length).toBeGreaterThan(0);
      expect(a[0].sentence.length).toBeGreaterThan(20);
    }
    const company = attention(demoBook("company", T).recs, T);
    expect(company[0].sentence).toMatch(/^Shipment MSKU 7714200 is 6 days behind, so order 1042 for Halden Foods misses .* by 2 days/);
    expect(attention(demoBook("solo", T).recs, T).map((a) => a.sentence)).toContain("File the Lakeline deed for Lakeline Dental can't go ahead: needs a notary.");
    expect(attention(demoBook("field", T).recs, T)[0].sentence).toMatch(/^Diverter valve 87161 is 2 days behind, so hot water repair, flat 4B for Ancoats Lofts misses/);
  });
  it("plans the field round around what can't go ahead", () => {
    const r = round(demoBook("field", T).recs, T, { lon: -2.32, lat: 53.465 });
    expect(r.waiting.map((x) => x.id)).toEqual(["j-2"]);
    expect(r.stops.map((x) => x.id)).toHaveLength(4);
    expect(r.km).toBeGreaterThan(5);
  });
});

describe("bringing records in", () => {
  it("reads a CRM export, names and all", () => {
    const rows = parseCsv(`Name,Type,Stage,Address,Close Date,Amount,Account,Depends on
Acme Ltd,Account,Active,"1 Main St, Leeds",,,,
Deal 7,Opportunity,Delayed,,2026-03-20,"$12,500",Acme Ltd,Box 9
Box 9,Container,In transit,,2026-03-18,,Deal 7,`);
    const recs = recsFromRows(rows);
    expect(recs.map((r) => r.kind)).toEqual(["client", "order", "shipment"]);
    expect(recs[0].where).toBe("1 Main St, Leeds");
    expect(recs[1]).toMatchObject({ health: "late", value: 12500, due: "2026-03-20", parent: "r1", needs: ["r3"] });
    expect(recs[2].parent).toBe("r2");
  });
});
