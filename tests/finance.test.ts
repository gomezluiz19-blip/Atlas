import { describe, expect, it } from "vitest";
import { brandOf, companyLinks, exchangeCode, EXCHANGES, gaps, growth, margin, money, readFacts, readFigures, readTies, session, sessionUtc, shares, toBranches, until } from "../src/finance/model";

const b = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
const ex = (id: string) => EXCHANGES.find((e) => e.id === id)!;

describe("finance model", () => {
  it("reads a company's facts, keeping listings with tickers", () => {
    const f = readFacts([
      b({ co: "http://www.wikidata.org/entity/Q312", coLabel: "Apple Inc.", coDescription: "American technology company", inception: "1976-04-01T00:00:00Z", industryLabel: "consumer electronics", exLabel: "Nasdaq", ticker: "AAPL", coord: "Point(-122.009 37.334)", countryLabel: "United States", cik: "320193" }),
      b({ co: "http://www.wikidata.org/entity/Q312", coLabel: "Apple Inc.", exLabel: "Nasdaq", industryLabel: "software" }),
    ])!;
    expect(f.id).toBe("Q312");
    expect(f.founded).toBe(1976);
    expect(f.listings).toEqual([{ exchange: "Nasdaq", ticker: "AAPL" }]);
    expect(f.industries).toEqual(["consumer electronics", "software"]);
    expect(f.lon).toBeCloseTo(-122.009);
    const links = companyLinks(f);
    expect(links[0].url).toBe("https://www.google.com/finance/quote/AAPL:NASDAQ");
    expect(links.some((l) => l.label === "SEC filings")).toBe(true);
  });
  it("reads yearly figures in the currency used most", () => {
    const fig = readFigures([
      b({ pid: "P2139", amount: "+365817000000", unitLabel: "United States dollar", date: "2021-09-25T00:00:00Z" }),
      b({ pid: "P2139", amount: "+394328000000", unitLabel: "United States dollar", date: "2022-09-24T00:00:00Z" }),
      b({ pid: "P2139", amount: "+1", unitLabel: "euro", date: "2022-01-01T00:00:00Z" }),
      b({ pid: "P2295", amount: "+99803000000", unitLabel: "United States dollar", date: "2022-09-24T00:00:00Z" }),
    ]);
    expect(fig.revenue!.map((p) => p.year)).toEqual([2021, 2022]);
    expect(growth(fig.revenue)!).toBeCloseTo(0.078, 3);
    expect(margin(fig)!.value).toBeCloseTo(0.253, 3);
    expect(money(394328000000, "United States dollar")).toBe("$394 bn");
    expect(money(-2.5e9, "euro")).toBe("−€2.5 bn");
    expect(money(1500, "1")).toBe("1.5k");
  });
  it("reads ties once each, without itself", () => {
    const t = readTies([
      b({ tie: "subsidiary", x: "http://www.wikidata.org/entity/Q1", xLabel: "Beats", sl: "20" }),
      b({ tie: "subsidiary", x: "http://www.wikidata.org/entity/Q1", xLabel: "Beats", coord: "Point(-118 34)" }),
      b({ tie: "owner", x: "http://www.wikidata.org/entity/Q2", xLabel: "Vanguard", share: "0.08", sl: "30" }),
      b({ tie: "parent", x: "http://www.wikidata.org/entity/Q312", xLabel: "Self" }),
      b({ tie: "partner", x: "http://www.wikidata.org/entity/Q3", xLabel: "Q3" }),
    ], "Q312");
    expect(t.map((x) => x.name)).toEqual(["Vanguard", "Beats"]);
    expect(t[1].lon).toBe(-118);
    expect(exchangeCode("London Stock Exchange")).toBe("LON");
  });
  it("knows when exchanges trade, lunch and open next", () => {
    const wedNoonNY = new Date("2026-10-07T16:00:00Z"); // 12:00 in New York (EDT)
    expect(session(ex("nyse"), wedNoonNY)).toMatchObject({ state: "open", local: "12:00", next: 240, nextWhat: "closes" });
    const tokyoLunch = new Date("2026-10-07T02:45:00Z"); // 11:45 in Tokyo
    expect(session(ex("jpx"), tokyoLunch)).toMatchObject({ state: "lunch", next: 45 });
    const satNY = new Date("2026-10-10T16:00:00Z"); // Saturday noon
    const s = session(ex("nyse"), satNY);
    expect(s.state).toBe("closed");
    expect(s.next).toBe(2 * 1440 - 150); // Monday 09:30
    const friRiyadh = new Date("2026-10-09T08:00:00Z"); // Friday 11:00: closed; opens Sunday
    expect(session(ex("tadawul"), friRiyadh).state).toBe("closed");
    expect(session(ex("tadawul"), new Date("2026-10-11T08:00:00Z")).state).toBe("open");
    expect(sessionUtc(ex("lse"), new Date("2026-07-01T12:00:00Z"))).toEqual([420, 930]);
    expect(until(45)).toBe("45 min");
    expect(until(125)).toBe("2 h 05");
    expect(until(1440 + 180)).toBe("1 day 3 h");
  });
  it("sorts branches by brand, folds the tail, and finds the gaps", () => {
    const els: { type: string; id: number; lat: number; lon: number; tags: Record<string, string> }[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ type: "node", id: i, lat: 51.5 + i * 0.001, lon: -0.1, tags: { amenity: "bank", brand: "Barclays" } })),
      ...Array.from({ length: 3 }, (_, i) => ({ type: "node", id: 10 + i, lat: 51.5, lon: -0.1 + i * 0.001, tags: { amenity: "bank", name: "HSBC Branch" } })),
      { type: "node", id: 20, lat: 51.5, lon: -0.1, tags: { amenity: "atm", operator: "Cardtronics" } },
      { type: "node", id: 21, lat: 51.5, lon: -0.1, tags: { office: "credit_union", name: "London Mutual Credit Union" } },
    ];
    const bs = toBranches(els);
    expect(bs.filter((x) => x.kind === "atm")).toHaveLength(1);
    expect(bs.find((x) => x.id === "node21")!.kind).toBe("credit_union");
    expect(brandOf({ name: "HSBC Branch" })).toBe("HSBC");
    const sh = shares(bs, 2);
    expect(sh.map((x) => x.brand)).toEqual(["Barclays", "HSBC", "Others (1)"]);
    expect(sh.reduce((n, x) => n + x.share, 0)).toBeCloseTo(1);
    const holes = gaps(bs, { lon: -0.1, lat: 51.5 }, 5, 2, 20);
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.every((g) => g.dKm > 2)).toBe(true);
    expect(gaps(bs, { lon: -0.1, lat: 51.5 }, 1, 2, 10)).toEqual([]);
  });
});
