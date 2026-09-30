import { describe, expect, it } from "vitest";
import { along, CHOKEPOINTS, gcKm, NM, progressKm, seaDays, seaRoute, splitRoute, type LonLat } from "../src/pro/shipping/sea";
import { anchoredNear, attention, co2, customerUpdate, demurrage, eta, etsCost, etsPhase, risks, slowSteam, tooBigForPanama, voyage, whatIf, type Desk, type Shipment } from "../src/pro/shipping/model";
import { findPort } from "../src/pro/shipping/ports";
import { demoDesk } from "../src/pro/shipping/demo";


const P = (q: string): LonLat => { const p = findPort(q)!; return [p.lon, p.lat]; };
const nm = (a: string, b: string, closed: string[] = []) => seaRoute(P(a), P(b), closed)!.km / NM;

describe("sea routes", () => {
  it("come within a few percent of published port-to-port distances", () => {
    // Published distances, nautical miles (Suez for Asia–Europe).
    expect(nm("Singapore", "Rotterdam")).toBeGreaterThan(8000); expect(nm("Singapore", "Rotterdam")).toBeLessThan(8700);
    expect(nm("Shanghai", "Rotterdam")).toBeGreaterThan(10_000); expect(nm("Shanghai", "Rotterdam")).toBeLessThan(11_000);
    expect(nm("Santos", "Rotterdam")).toBeGreaterThan(5200); expect(nm("Santos", "Rotterdam")).toBeLessThan(5800);
    expect(nm("Shanghai", "Los Angeles")).toBeGreaterThan(5500); expect(nm("Shanghai", "Los Angeles")).toBeLessThan(6200);
  });
  it("name the chokepoints they pass", () => {
    const r = seaRoute(P("Shanghai"), P("Rotterdam"))!;
    expect(r.chokepoints).toEqual(expect.arrayContaining(["suez", "redsea", "malacca"]));
    expect(seaRoute(P("Jebel Ali"), P("Singapore"))!.chokepoints).toContain("hormuz");
  });
  it("find a way round when a chokepoint closes, and it's longer", () => {
    const open = nm("Singapore", "Rotterdam"), shut = seaRoute(P("Singapore"), P("Rotterdam"), ["redsea"])!;
    expect(shut.chokepoints).not.toContain("redsea");
    expect(shut.km / NM - open).toBeGreaterThan(2500);
    expect(shut.via.join(" ")).toMatch(/Cape of Good Hope/);
  });
  it("have no way through when the only exit is shut", () => {
    expect(seaRoute(P("Odesa"), P("Piraeus"), ["bosporus"])).toBeNull();
  });
  it("place a ship along the way and read progress back", () => {
    const r = seaRoute(P("Singapore"), P("Rotterdam"))!;
    const { p } = along(r.pts, 5000);
    expect(Math.abs(progressKm(r.pts, p) - 5000)).toBeLessThan(60);
    expect(gcKm(along(r.pts, 0).p, r.pts[0])).toBeLessThan(1);
    const [behind, ahead] = splitRoute(r.pts, 5000);
    expect(behind[behind.length - 1]).toEqual(ahead[0]);
  });
  it("turn distance and speed into days", () => {
    expect(seaDays(16 * NM * 24 * 10, 16)).toBeCloseTo(10, 5);
  });
  it("cover every chokepoint's edges with real waypoints", () => {
    for (const c of Object.values(CHOKEPOINTS)) expect(c.edges.length).toBeGreaterThan(0);
  });
});

describe("shipments", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const base = (): Desk => ({ id: "d", name: "Test", created: 0, customers: [], vessels: [{ id: "v", name: "Test ship", type: "container", knots: 16, teu: 10_000 }], shipments: [], waits: {}, closed: [] });
  const ship = (o: Partial<Shipment> = {}): Shipment => ({ id: "s", ref: "T1", customer: "C", cargo: "Boxes", origin: findPort("Singapore")!, dest: findPort("Rotterdam")!, vessel: "v", stage: "sailing", etd: "2026-09-20", atd: "2026-09-20", eta: "2026-10-12", teu: 10, docs: [], log: [], ...o });

  it("estimate where a ship is and when it arrives from when it sailed", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    const e = eta(d, s, now);
    expect(e.basis).toBe("estimated");
    expect(e.doneKm).toBeCloseTo(10 * 16 * NM * 24, 0);
    expect(e.eta > "2026-10-10" && e.eta < "2026-10-16").toBe(true);
  });
  it("add the wait at the destination port", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    const a = eta(d, s, now).eta;
    d.waits.Rotterdam = { days: 4, source: "test", asOf: "2026-09-30" };
    const b = eta(d, s, now);
    expect(Date.parse(b.eta) - Date.parse(a)).toBe(4 * 86_400_000);
    expect(b.late).toBeGreaterThan(0);
  });
  it("use a fresh live position over the estimate", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    const r = voyage(s)!, p = along(r.pts, 2000).p;
    d.vessels[0].last = { lon: p[0], lat: p[1], t: now, knots: 16, source: "test" };
    const e = eta(d, s, now);
    expect(e.basis).toBe("live");
    expect(Math.abs(e.doneKm - 2000)).toBeLessThan(60);
  });
  it("flag a ship that's gone quiet", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    const r = voyage(s)!, p = along(r.pts, 2000).p;
    d.vessels[0].last = { lon: p[0], lat: p[1], t: now - 40 * 3_600_000, knots: 16, source: "test" };
    const f = risks(d, s, eta(d, s, now), "2026-09-30");
    expect(f.some((x) => /No position from the ship for 40 hours/.test(x.text))).toBe(true);
  });
  it("keep the biggest ships out of Panama", () => {
    const d = base(), s = ship({ origin: findPort("Shanghai")!, dest: findPort("New York")! });
    expect(voyage(s, [], d.vessels[0])!.chokepoints).toContain("panama");
    const big = { ...d.vessels[0], teu: 24_000 };
    expect(tooBigForPanama(big)).toBe(true);
    expect(voyage(s, [], big)!.chokepoints).not.toContain("panama");
  });
  it("work out demurrage after free time", () => {
    const s = ship({ stage: "arrived", ata: "2026-09-20", freeDays: 5, demurrage: 100, containers: 3 });
    const dm = demurrage(s, "2026-09-30");
    expect(dm.endsOn).toBe("2026-09-25");
    expect(dm.daysOver).toBe(5);
    expect(dm.cost).toBe(1500);
  });
  it("estimate carbon, scaled by the square of speed", () => {
    const d = base(), s = ship();
    const t = co2(s, 10_000, d.vessels[0]);
    expect(t).toBeCloseTo((10_000 * 10 * 55) / 1e6, 5);
    expect(co2(s, 10_000, d.vessels[0], 8)).toBeCloseTo(t / 4, 5);
    const r = slowSteam(5000, 10, 16, 12);
    expect(r.saved).toBeCloseTo(10 * (1 - 0.5625), 5);
    expect(r.addDays).toBeGreaterThan(0);
  });
  it("charge the EU ETS on half of an extra-EU voyage and all of an intra-EU one", () => {
    expect(etsPhase(2024)).toBe(0.4); expect(etsPhase(2025)).toBe(0.7); expect(etsPhase(2026)).toBe(1); expect(etsPhase(2023)).toBe(0);
    expect(etsCost(ship(), 100, 70, 2026)).toEqual({ share: 0.5, tonnes: 50, eur: 3500 });
    expect(etsCost(ship({ origin: findPort("Hamburg")! }), 100, 70, 2026).share).toBe(1);
    expect(etsCost(ship({ origin: findPort("Shanghai")!, dest: findPort("Los Angeles")! }), 100, 70, 2026).eur).toBe(0);
  });
  it("flag warning areas and sanctioned countries", () => {
    const d = base(), s = ship({ origin: findPort("Mumbai")!, dest: findPort("Genoa")! }); d.shipments.push(s);
    expect(risks(d, s, eta(d, s, now), "2026-09-30").some((f) => /Red Sea/.test(f.text))).toBe(true);
    const r = ship({ origin: findPort("Istanbul")!, dest: findPort("Novorossiysk")!, stage: "booked", atd: undefined }); d.shipments.push(r);
    const f = risks(d, r, eta(d, r, now), "2026-09-30");
    expect(f.some((x) => /sanctions/.test(x.text))).toBe(true);
    expect(f.some((x) => /Black Sea/.test(x.text))).toBe(true);
  });
  it("show what closing a chokepoint does to open shipments", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    const w = whatIf(d, "redsea", now);
    expect(w).toHaveLength(1);
    expect(w[0].addDays).toBeGreaterThan(5);
    expect(whatIf(d, "panama", now)).toHaveLength(0);
  });
  it("count ships waiting at anchor near a port", () => {
    const p = { lon: 4.05, lat: 51.95 };
    expect(anchoredNear([{ lon: 4.0, lat: 52.0, status: "At anchor", speed: 0 }, { lon: 4.1, lat: 51.9, speed: 6 }, { lon: 8, lat: 54, status: "At anchor", speed: 0 }], p)).toBe(1);
  });
  it("write a plain customer update", () => {
    const d = base(), s = ship(); d.shipments.push(s);
    expect(customerUpdate(d, s, eta(d, s, now))).toMatch(/^Shipment T1 \(Boxes\) is at sea on Test ship, about [\d,]+ of [\d,]+ nautical miles along\. We expect it at Rotterdam on 2026-10-\d\d/);
  });
});

describe("the demo desk", () => {
  it("has shipments on real lanes with routes and a sensible board", () => {
    const d = demoDesk(Date.parse("2026-09-30T12:00:00Z"));
    expect(d.shipments.length).toBe(16);
    for (const s of d.shipments) expect(voyage(s, [], d.vessels.find((v) => v.id === s.vessel))).not.toBeNull();
    const a = attention(d, Date.parse("2026-09-30T12:00:00Z"));
    expect(a.length).toBe(15);
    expect(a[0].score).toBeGreaterThan(0);
    // The big ship on Ningbo–Rotterdam was last heard 36 hours ago.
    expect(a.find((x) => x.s.ref === "MF-24101")!.f.some((f) => /No position/.test(f.text))).toBe(true);
    // Timber at Felixstowe is past its free time.
    expect(demurrage(d.shipments.find((s) => s.ref === "MF-24108")!, "2026-09-30").daysOver).toBe(2);
  });
});
