import { describe, expect, it } from "vitest";
import { bestPath, breaks, cutOff, dailyUse, fill, ITEMS, itemOf, legDays, legIncidents, MODES, planMove, preposition, type Network } from "../src/pro/relief/model";
import { demoNetwork } from "../src/pro/relief/demo";

const SEP = Date.parse("2026-09-30T12:00:00Z"), JAN = Date.parse("2026-01-15T12:00:00Z");
const H = (n: Network, name: string) => n.hubs.find((x) => x.name.startsWith(name))!;

describe("relief pipeline", () => {
  it("works out a daily ration from the people served", () => {
    const n = demoNetwork(SEP), pibor = H(n, "Pibor");
    expect(dailyUse(pibor, itemOf("cereal")!)).toBeCloseTo(38_000 * 0.0004, 5);
    expect(dailyUse(pibor, itemOf("rutf")!)).toBe(18);
    expect(dailyUse(H(n, "Juba"), itemOf("cereal")!)).toBe(0);
  });
  it("slows roads in the rains and closes dry-season-only ones", () => {
    const n = demoNetwork(SEP);
    const road = n.legs.find((l) => l.from === H(n, "Juba").id && l.to === H(n, "Rumbek").id)!;
    expect(legDays(n, road, 8)).toBeGreaterThan(legDays(n, road, 0));
    const pibor = n.legs.find((l) => l.to === H(n, "Pibor").id && l.mode === "road")!;
    expect(legDays(n, pibor, 8)).toBe(Infinity);
    expect(Number.isFinite(legDays(n, pibor, 0))).toBe(true);
  });
  it("routes by ground in the dry season and by air in the rains", () => {
    const n = demoNetwork(SEP), juba = H(n, "Juba").id, pibor = H(n, "Pibor").id;
    expect(bestPath(n, juba, pibor, 0, { noAir: true })!.modes).not.toContain("air");
    expect(bestPath(n, juba, pibor, 8, { noAir: true })).toBeNull();
    expect(bestPath(n, juba, pibor, 8)!.modes).toEqual(["air"]);
  });
  it("finds the cheapest way separately from the fastest", () => {
    const n = demoNetwork(SEP), juba = H(n, "Juba").id, mal = H(n, "Malakal").id;
    const fast = bestPath(n, juba, mal, 0)!, cheap = bestPath(n, juba, mal, 0, { cheapest: true })!;
    expect(fast.days).toBeLessThanOrEqual(cheap.days);
    expect(cheap.usdPerT).toBeLessThan(fast.usdPerT);
    expect(cheap.modes).toContain("river");
  });
  it("lists places cut off by ground in the rains", () => {
    const n = demoNetwork(SEP);
    const cut = cutOff(n, 8).map((c) => c.h.name);
    expect(cut).toEqual(expect.arrayContaining(["Pibor", "Akobo", "Leer", "Maban (Bunj)"]));
    expect(cutOff(n, 0)).toHaveLength(0);
    expect(cutOff(n, 8).find((c) => c.h.name === "Pibor")!.any).toBe(true);
  });
  it("flags pipeline breaks with the last day to send", () => {
    const n = demoNetwork(SEP), bs = breaks(n, "2026-09-30");
    const akobo = bs.find((b) => b.hub.name === "Akobo" && b.item.id === "cereal")!;
    expect(akobo.cover).toBeLessThan(5);
    expect(akobo.level).toBe(2);
    expect(akobo.sendBy).toBe("2026-09-30");
    expect(akobo.path?.modes).toEqual(["air"]);
    // Leer has no airstrip on the network and its road is shut in the rains.
    const leer = bs.find((b) => b.hub.name === "Leer" && b.item.id === "cereal")!;
    expect(leer.opens).toBe("2026-11-01");
    expect(leer.level).toBe(3);
    // Its therapeutic food runs out in late October, days before the road reopens: it needs an air link.
    const leerRutf = bs.find((b) => b.hub.name === "Leer" && b.item.id === "rutf")!;
    expect(leerRutf.runsOut < "2026-11-01").toBe(true);
    expect(leerRutf.sendBy).toBeUndefined();
    // Given more stock, the reopening road is soon enough.
    const n2 = demoNetwork(SEP); H(n2, "Leer").stock.rutf = 900;
    const later = breaks(n2, "2026-09-30").find((b) => b.hub.name === "Leer" && b.item.id === "rutf")!;
    expect(later.sendBy! >= "2026-11-01").toBe(true);
    expect(later.level).toBe(1);
    const aweil = bs.find((b) => b.hub.name === "Aweil" && b.item.id === "hygiene")!;
    expect(aweil.sendBy! <= aweil.runsOut).toBe(true);
    // Worst first.
    expect(bs[0].level).toBe(3);
  });
  it("counts what's on the way", () => {
    const n = demoNetwork(SEP), before = breaks(n, "2026-09-30").find((b) => b.hub.name === "Pibor" && b.item.id === "rutf")!;
    expect(before.coming).toBe(300);
    expect(before.cover).toBeCloseTo((260 + 300) / 18, 5);
  });
  it("works out what to preposition before the roads close", () => {
    const n = demoNetwork(JAN), p = preposition(n, H(n, "Pibor"), "2026-03-10")!;
    expect(p.starts).toBe("2026-05-01");
    expect(p.months).toBe(6);
    expect(p.need.find((x) => x.item.id === "cereal")!.short).toBeGreaterThan(0);
    expect(preposition(n, H(n, "Kapoeta"), "2026-03-10")).toBeNull();
  });
  it("plans a move with trips, cost and carbon", () => {
    const n = demoNetwork(JAN), m = planMove(n, itemOf("cereal")!, 100, H(n, "Juba").id, H(n, "Rumbek").id, "2026-01-15")!;
    expect(m.path.modes).toEqual(["road"]);
    expect(m.trips).toEqual([5]);
    expect(m.usd).toBeCloseTo(100 * m.path.legs[0].km * MODES.road.detour * MODES.road.usdPerTkm, 5);
    expect(m.arrives > "2026-01-15").toBe(true);
  });
  it("links recent incidents to the roads they're on", () => {
    const n = demoNetwork(SEP), road = n.legs.find((l) => l.from === H(n, "Juba").id && l.to === H(n, "Bor").id && l.mode === "road")!;
    expect(legIncidents(n, road, "2026-09-30")).toHaveLength(1);
    expect(legIncidents(n, road, "2026-11-30")).toHaveLength(0);
  });
  it("reports warehouse fill in tonnes", () => {
    const x = { id: "x", name: "x", kind: "hub" as const, lon: 0, lat: 0, capacity: 100, stock: { cereal: 40, hygiene: 1000 } };
    expect(fill(x).tonnes).toBeCloseTo(40 + 1000 * ITEMS.find((i) => i.id === "hygiene")!.t, 5);
    expect(fill(x).share).toBeCloseTo(0.52, 5);
  });
});
