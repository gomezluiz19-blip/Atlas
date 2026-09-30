// A demo freight desk: a made-up forwarder with made-up customers and ships,
// moving cargo between real ports on real trade lanes, from Ningbo to
// Rotterdam, Santos to Hamburg, Tubarão to Qingdao and San Antonio to New
// York. The ships' positions are worked out from when they sailed.
import { newId } from "../../work/store";
import { DOCS, eta, isoDay, type Customer, type Desk, type Shipment, type Stage, type Vessel, type VesselType } from "./model";
import { PORTS } from "./ports";

export function demoDesk(now = Date.now()): Desk {
  const day = (n: number) => isoDay(now + n * 86_400_000);
  const port = (code: string) => PORTS.find((p) => p.code === code)!;
  const cust = (name: string, country: string): Customer => ({ id: newId(), name: `${name} (demo)`, country, contact: "Logistics lead (demo)" });
  const customers = [cust("Northwind Outdoor", "Netherlands"), cust("Casa Ferreira Coffee", "Germany"), cust("Kora Solar", "Kenya"), cust("Harrow & Pike Furniture", "United Kingdom"), cust("Andes Fresh", "Chile"), cust("Ferro Atlântico", "Brazil"), cust("Anatolia Agri", "Turkey")];
  const C = (n: string) => customers.find((c) => c.name.startsWith(n))!.name;
  const ship = (name: string, type: VesselType, knots: number, teu?: number, dwt?: number, flag?: string): Vessel => ({ id: newId(), name: `${name} (demo)`, type, knots, teu, dwt, flag, operator: "Demo Line" });
  const vessels = [
    ship("Aurora Meridian", "container", 15, 23_500, undefined, "Liberia"), ship("Pacific Wren", "container", 17, 14_000, undefined, "Singapore"),
    ship("Cape Verdant", "container", 15, 9_000, undefined, "Malta"), ship("Baltic Tern", "container", 14, 1_400, undefined, "Finland"),
    ship("Indigo Crest", "container", 16, 8_500, undefined, "Marshall Islands"), ship("Sea Juniper", "container", 16, 11_000, undefined, "Panama"),
    ship("Northern Lark", "container", 15, 20_000, undefined, "Denmark"), ship("Polar Finch", "reefer", 19, undefined, 12_000, "Bahamas"),
    ship("Mistral Bay", "container", 15, 6_000, undefined, "Portugal"), ship("Southern Anvil", "bulk", 12.5, undefined, 200_000, "Marshall Islands"),
    ship("Hunter Gale", "bulk", 12.5, undefined, 95_000, "Panama"), ship("Bosporus Dawn", "general", 13, undefined, 8_000, "Turkey"),
    ship("Harbour Swift", "container", 16, 13_000, undefined, "Hong Kong"), ship("Coral Stitch", "container", 16, 8_000, undefined, "Cyprus"),
  ];
  const V = (n: string) => vessels.find((v) => v.name.startsWith(n))!.id;
  const docs = (done: number) => DOCS.map((text, i) => ({ text, done: i < done }));
  const mk = (ref: string, customer: string, cargo: string, from: string, to: string, vessel: string, stage: Stage, etd: number, promise: number, o: Partial<Shipment> = {}): Shipment => {
    const s: Shipment = { id: newId(), ref, customer: C(customer), cargo, origin: port(from), dest: port(to), vessel: V(vessel), stage, etd: day(etd), eta: day(etd + promise), docs: docs(stage === "booked" ? 1 : stage === "loaded" ? 3 : 5), log: [], freeDays: 5, demurrage: 150, ...o };
    if (stage !== "booked" && stage !== "loaded") s.atd = s.atd ?? s.etd;
    s.log.push({ at: day(etd - 14), text: "Booked" });
    if (s.atd) s.log.push({ at: s.atd, text: `Sailed from ${s.origin.name}` });
    if (s.ata) s.log.push({ at: s.ata, text: `Arrived at ${s.dest.name}` });
    return s;
  };
  const shipments = [
    mk("MF-24101", "Northwind", "Tents and outdoor gear, 4 × 40′", "CNNGB", "NLRTM", "Aurora", "sailing", -12, 28, { teu: 8, containers: 4, value: 310_000, incoterm: "FOB", hs: "6306" }),
    mk("MF-24102", "Northwind", "Down jackets, 2 × 40′ HC", "CNSHA", "USLAX", "Pacific Wren", "sailing", -6, 16, { teu: 4, containers: 2, value: 540_000, incoterm: "FOB", hs: "6201" }),
    mk("MF-24103", "Casa Ferreira", "Green coffee, 10 × 20′", "BRSSZ", "DEHAM", "Cape Verdant", "sailing", -9, 16, { teu: 10, containers: 10, tonnes: 192, value: 1_150_000, incoterm: "CIF", hs: "0901" }),
    mk("MF-24104", "Casa Ferreira", "Roasted coffee, 2 × 20′", "DEHAM", "FIHEL", "Baltic Tern", "booked", 12, 5, { teu: 2, containers: 2, value: 210_000, incoterm: "DAP", hs: "0901" }),
    mk("MF-24105", "Kora Solar", "Solar panels, 12 × 40′", "CNSHA", "KEMBA", "Indigo Crest", "sailing", -10, 19, { teu: 24, containers: 12, value: 880_000, incoterm: "CFR", hs: "8541", via: port("OMSLL") }),
    mk("MF-24106", "Kora Solar", "Inverters and cable, 3 × 40′", "CNYTN", "NGAPP", "Sea Juniper", "sailing", -20, 28, { teu: 6, containers: 3, value: 420_000, incoterm: "CIF", hs: "8504" }),
    mk("MF-24107", "Harrow", "Furniture, 6 × 40′ HC", "VNSGN", "GBFXT", "Northern Lark", "sailing", -25, 25, { teu: 12, containers: 6, value: 260_000, incoterm: "FOB", hs: "9403" }),
    mk("MF-24108", "Harrow", "Oak timber, 3 × 40′", "USSAV", "GBFXT", "Cape Verdant", "arrived", -20, 12, { teu: 6, containers: 3, value: 95_000, incoterm: "FOB", hs: "4407", ata: day(-7) }),
    mk("MF-24109", "Andes Fresh", "Table grapes, 240 t chilled", "CLSAI", "USNYC", "Polar Finch", "sailing", -4, 13, { tonnes: 240, value: 610_000, incoterm: "CIF", hs: "0806" }),
    mk("MF-24110", "Andes Fresh", "Blueberries, 4 × 40′ reefer", "PECLL", "NLRTM", "Mistral Bay", "sailing", -8, 17, { teu: 8, containers: 4, value: 720_000, incoterm: "CIF", hs: "0810" }),
    mk("MF-24111", "Ferro", "Iron ore fines, 180,000 t", "BRTUB", "CNTAO", "Southern Anvil", "sailing", -18, 36, { tonnes: 180_000, value: 17_000_000, incoterm: "CFR", hs: "2601" }),
    mk("MF-24112", "Ferro", "Thermal coal, 80,000 t", "AUNTL", "KRPUS", "Hunter Gale", "sailing", -3, 17, { tonnes: 80_000, value: 9_000_000, incoterm: "FOB", hs: "2701" }),
    mk("MF-24113", "Anatolia", "Tractors and implements", "TRIST", "RUNVS", "Bosporus Dawn", "booked", 5, 4, { tonnes: 900, value: 2_400_000, incoterm: "CPT", hs: "8701" }),
    mk("MF-24114", "Northwind", "Bicycles, 5 × 40′ HC", "TWKHH", "USNYC", "Harbour Swift", "loaded", 3, 31, { teu: 10, containers: 5, value: 690_000, incoterm: "FOB", hs: "8712" }),
    mk("MF-24115", "Kora Solar", "Battery packs, 4 × 40′", "KRPUS", "AEJEA", "Coral Stitch", "delivered", -40, 22, { teu: 8, containers: 4, value: 1_300_000, incoterm: "DAP", hs: "8507", ata: day(-17) }),
    mk("MF-24116", "Harrow", "Upholstery fabric, 2 × 40′", "INNSA", "ITGOA", "Coral Stitch", "sailing", -5, 12, { teu: 4, containers: 2, value: 130_000, incoterm: "FOB", hs: "5407" }),
  ];
  const desk: Desk = {
    id: newId(), name: "Meridian Freight (demo)", demo: true, created: now, customers, vessels, shipments, closed: [], euaPrice: 70,
    waits: {
      Mombasa: { days: 3, source: "agent's report (demo)", asOf: day(-1) }, "Lagos (Apapa)": { days: 5, source: "agent's report (demo)", asOf: day(-2) },
      "Los Angeles": { days: 1, source: "agent's report (demo)", asOf: day(-1) }, "New York / New Jersey": { days: 2, source: "agent's report (demo)", asOf: day(-1) },
    },
  };
  // One ship last heard from a day and a half ago, where it would have been then.
  const s = shipments[0], v = vessels.find((x) => x.id === s.vessel)!, then = now - 36 * 3_600_000, e = eta(desk, s, then);
  v.last = { lon: e.at[0], lat: e.at[1], t: then, knots: v.knots, status: "Under way", source: "demo" };
  return desk;
}
