import { describe, expect, it } from "vitest";
import { bookingHref, bookingRef, callHref, fareEstimate, fareText, firmFromOsm, rankFirms, tariffFor, tripFromLine, whatsappHref, type TaxiFirm } from "../src/taxi/model";

describe("the fare", () => {
  it("applies a city tariff as a range, and invents nothing for unknown places", () => {
    const f = fareEstimate(10, 20, tariffFor("us")!);
    expect(f.currency).toBe("USD");
    expect(f.low).toBeLessThan(f.high);
    expect(f.low).toBe(Math.round((3.5 + 17.5 + 10) * 0.85));
    expect(tariffFor("XX")).toBeNull();
    expect(tariffFor(null)).toBeNull();
  });
  it("keeps a minimum fare", () => {
    expect(fareEstimate(0.5, 2, tariffFor("FR")!).low).toBe(Math.round(7.3 * 0.85));
  });
  it("says it the way people do", () => {
    expect(fareText({ low: 18, high: 24, currency: "USD" })).toBe("about $18–24");
    expect(fareText({ low: 20, high: 20, currency: "GBP" })).toBe("about £20");
    expect(fareText({ low: 18, high: 24, currency: "USD" }, "en-US@posix")).toBe("about $18–24");
  });
  it("turns a straight line into a road trip", () => {
    const t = tripFromLine(10);
    expect(t.km).toBeCloseTo(13);
    expect(t.minutes).toBeCloseTo((13 / 28) * 60);
  });
});

describe("who to call", () => {
  const at = { lon: -0.1276, lat: 51.5072 };
  const firm = (o: Partial<TaxiFirm>): TaxiFirm => ({ id: o.name ?? "x", name: "x", lon: at.lon, lat: at.lat, radiusKm: 20, phone: "020 7123 4567", source: "listing", ...o });
  it("puts what the rider needs first, then verified, then nearest; never by payment", () => {
    const list = rankFirms([
      firm({ name: "Near", lon: at.lon + 0.01 }),
      firm({ name: "Far but wheelchair", lon: at.lon + 0.1, needs: ["wheelchair"] }),
      firm({ name: "Verified", lon: at.lon + 0.05, verified: true }),
    ], at, ["wheelchair"]);
    expect(list.map((f) => f.name)).toEqual(["Far but wheelchair", "Verified", "Near"]);
  });
  it("leaves out firms you can't reach and those that don't cover the pickup", () => {
    const list = rankFirms([firm({ name: "No contact", phone: undefined }), firm({ name: "Too far", lat: at.lat + 1 }), firm({ name: "Rank", rank: true, phone: undefined, lon: at.lon + 0.005 })], at);
    expect(list.map((f) => f.name)).toEqual(["Rank"]);
  });
  it("reads ranks and companies from OpenStreetMap", () => {
    expect(firmFromOsm({ type: "node", id: 1, lat: 51.5, lon: -0.12, tags: { amenity: "taxi" } })).toMatchObject({ rank: true, name: "Taxi rank" });
    expect(firmFromOsm({ type: "way", id: 2, center: { lat: 51.5, lon: -0.12 }, tags: { office: "taxi", name: "Acme Cabs", phone: "+44 20 7000 0000; +44 20 7000 0001", website: "https://acme.example" } }))
      .toMatchObject({ name: "Acme Cabs", phone: "+44 20 7000 0000", booking: "https://acme.example", rank: false });
    expect(firmFromOsm({ type: "node", id: 3, lat: 1, lon: 1, tags: { shop: "bakery" } })).toBeNull();
  });
});

describe("reaching them", () => {
  it("makes references easy to read out", () => {
    let i = 0;
    expect(bookingRef(() => i++ % 32)).toBe("TRN-2345-6789");
    expect(bookingRef()).toMatch(/^TRN-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });
  it("carries the reference to the firm", () => {
    expect(callHref("+44 (20) 7123-4567")).toBe("tel:+442071234567");
    expect(whatsappHref("+44 7700 900123", "Heathrow", "TRN-AAAA-BBBB")).toBe(`https://wa.me/447700900123?text=${encodeURIComponent("Hello, I'd like a taxi to Heathrow. Terreno reference TRN-AAAA-BBBB.")}`);
    expect(bookingHref("https://cabs.example/book?x=1", "TRN-AAAA-BBBB")).toBe("https://cabs.example/book?x=1&ref=TRN-AAAA-BBBB&utm_source=terreno");
    expect(bookingHref("not a url", "R")).toBe("not a url");
  });
});
