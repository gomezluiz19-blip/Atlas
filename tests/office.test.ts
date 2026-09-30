import { describe, expect, it } from "vitest";
import { caseQueue, contactsCsv, contactsFromRows, parseCsv, partyLines, spreadAround, tally, topTopics, votesNeeded, type Bill } from "../src/pro/office/model";
import { readAcs } from "../src/pro/office/census";
import { duration, flowFacts, kmBetween, networkFacts, type Network } from "../src/pro/network/model";
import { demoNetwork } from "../src/pro/network/demo";
import { demoOffice } from "../src/pro/office/demo";

describe("Politics Pro", () => {
  it("counts the whip against the votes needed", () => {
    const t = tally(["yes", "yes", "lean-yes", "no", "undecided", "unknown"], 4);
    expect(t).toMatchObject({ firm: 2, likely: 3, short: 1, total: 6 });
    expect(votesNeeded("house", 435)).toBe(218);
    expect(votesNeeded("senate", 100)).toBe(51);
  });

  it("starts from party lines only where nothing is set", () => {
    const b: Bill = { id: "b", title: "x", chamber: "house", members: { A: "no" }, sponsorParty: "Democrat" };
    partyLines(b, [{ key: "A", party: "Democrat" }, { key: "B", party: "Democrat" }, { key: "C", party: "Republican" }, { key: "D" }]);
    expect(b.members).toEqual({ A: "no", B: "lean-yes", C: "lean-no", D: "undecided" });
  });

  it("takes in a CRM export, quoted fields and all", () => {
    const rows = parseCsv('First Name,Last Name,Email,Street,City,State,Zip,Type,Tags\n"Maria","Gonzalez, Jr.",m@x.org,1 Pearl St,Boulder,CO,80302,Constituent,"Housing; Broadband"\nTeleWest,,gov@tw.com,,,,,Company,\n');
    const cs = contactsFromRows(rows);
    expect(cs).toHaveLength(2);
    expect(cs[0]).toMatchObject({ name: "Maria Gonzalez, Jr.", email: "m@x.org", address: "1 Pearl St, Boulder, CO, 80302", kind: "constituent", topics: ["Housing", "Broadband"] });
    expect(cs[1].kind).toBe("organisation");
    expect(contactsCsv(cs, []).split("\n")[1]).toContain('"Maria Gonzalez, Jr."');
    expect(topTopics([...cs, ...cs])[0]).toEqual({ topic: "Housing", count: 2 });
  });

  it("queues casework oldest first and flags stale cases", () => {
    const q = caseQueue([
      { id: "1", subject: "a", agency: "VA", status: "open", opened: "2026-08-01", updated: "2026-08-02" },
      { id: "2", subject: "b", agency: "SSA", status: "closed", opened: "2026-07-01", updated: "2026-07-02" },
      { id: "3", subject: "c", agency: "IRS", status: "waiting", opened: "2026-09-20", updated: "2026-09-28" },
    ], "2026-09-30");
    expect(q.map((c) => [c.id, c.days, c.stale])).toEqual([["1", 60, true], ["3", 10, false]]);
  });

  it("reads district figures and spreads members around their state", () => {
    const d = readAcs(["NAME", "B01003_001E", "B19013_001E", "B21001_002E", "B21001_001E"], ["CD 2", "760000", "98000", "30000", "600000"], 2023);
    expect(d).toMatchObject({ population: 760000, medianIncome: 98000, veteransPct: 5 });
    const a = spreadAround([-105, 39], 0, 8), b = spreadAround([-105, 39], 1, 8);
    expect(a).not.toEqual(b);
    const o = demoOffice();
    expect(o.contacts.length).toBeGreaterThan(10);
    expect(Object.keys(o.bills[0].members)).toHaveLength(0); // no real member is given a stance
  });
});

describe("Business network", () => {
  it("measures a flow: distance, time and carbon", () => {
    expect(kmBetween({ lon: -74, lat: 40.7 }, { lon: -0.12, lat: 51.5 })).toBeCloseTo(5570, -2);
    const a = { id: "a", name: "A", kind: "farm" as const, lon: 0, lat: 0 }, b = { id: "b", name: "B", kind: "port" as const, lon: 1, lat: 0 };
    const r = flowFacts({ id: "f", from: "a", to: "b", what: "x", kind: "goods", amount: 10, unit: "t", per: "month", mode: "truck" }, a, b);
    expect(r.km).toBeCloseTo(111.2 * 1.3, 0);
    expect(r.tonnesPerYear).toBe(120);
    expect(r.co2t).toBeCloseTo((120 * r.km * 0.105) / 1000, 3);
    expect(duration(3.4)).toBe("3 h");
    expect(duration(24 * 20)).toBe("3 weeks");
  });

  it("sums the demo coffee roaster", () => {
    const n: Network = demoNetwork();
    const f = networkFacts(n);
    expect(f.sites).toBe(5);
    expect(f.longest?.f.mode).toBe("ship");
    expect(f.co2t).toBeGreaterThan(10);
    expect(f.heaviest[0].x.co2t).toBeGreaterThan(0);
  });
});
