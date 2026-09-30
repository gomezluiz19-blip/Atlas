// A demo business to try the network with: a made-up coffee roaster in
// Brooklyn buying from farms in Colombia and Ethiopia, shipping through their
// ports, roasting in Red Hook and delivering to its cafés and a grocery chain.
import { newId } from "../../work/store";
import type { Flow, NetNode, Network } from "./model";

export function demoNetwork(): Network {
  const n = (name: string, kind: NetNode["kind"], lon: number, lat: number, extra: Partial<NetNode> = {}): NetNode => ({ id: newId(), name, kind, lon, lat, ...extra });
  const huila = n("Finca La Esperanza, Huila", "farm", -75.88, 2.18, { notes: "Washed caturra; harvest Apr–Jun and Oct–Dec" });
  const yirga = n("Yirgacheffe washing station", "farm", 38.2, 6.16, { notes: "Natural and washed heirloom" });
  const cartagena = n("Port of Cartagena", "port", -75.53, 10.4);
  const djibouti = n("Port of Djibouti", "port", 43.14, 11.6);
  const newark = n("Port Newark", "port", -74.15, 40.68);
  const roastery = n("Ridgeline Roastery, Red Hook (demo)", "factory", -74.012, 40.676, { people: 22 });
  const hq = n("Ridgeline head office (demo)", "hq", -73.99, 40.69, { people: 9 });
  const soho = n("Ridgeline Café SoHo", "store", -74.0005, 40.7233, { people: 11 });
  const wburg = n("Ridgeline Café Williamsburg", "store", -73.957, 40.714, { people: 9 });
  const midtown = n("Ridgeline Café Midtown", "store", -73.985, 40.754, { people: 14 });
  const grocer = n("Harbor Grocers (wholesale)", "customer", -77.03, 38.9);
  const bushwick = n("Bushwick (where much of the team lives)", "partner", -73.92, 40.694);
  const f = (from: NetNode, to: NetNode, what: string, kind: Flow["kind"], amount: number, unit: string, per: Flow["per"], mode: Flow["mode"]): Flow =>
    ({ id: newId(), from: from.id, to: to.id, what, kind, amount, unit, per, mode });
  return {
    id: newId(), name: "Ridgeline Coffee Roasters (demo)", demo: true, created: Date.now(),
    nodes: [huila, yirga, cartagena, djibouti, newark, roastery, hq, soho, wburg, midtown, grocer, bushwick],
    flows: [
      f(huila, cartagena, "Green coffee", "goods", 26, "t", "month", "truck"),
      f(cartagena, newark, "Green coffee", "goods", 26, "t", "month", "ship"),
      f(yirga, djibouti, "Green coffee", "goods", 14, "t", "month", "truck"),
      f(djibouti, newark, "Green coffee", "goods", 14, "t", "month", "ship"),
      f(newark, roastery, "Green coffee", "goods", 40, "t", "month", "truck"),
      f(roastery, soho, "Roasted coffee", "goods", 0.6, "t", "week", "van"),
      f(roastery, wburg, "Roasted coffee", "goods", 0.5, "t", "week", "van"),
      f(roastery, midtown, "Roasted coffee", "goods", 0.8, "t", "week", "van"),
      f(roastery, grocer, "Bagged coffee", "goods", 6, "t", "month", "truck"),
      f(bushwick, wburg, "Baristas", "people", 7, "people", "day", "transit"),
      f(bushwick, roastery, "Roasting crew", "people", 12, "people", "day", "transit"),
      f(soho, hq, "Sales", "money", 48_000, "USD", "week", "digital"),
      f(midtown, hq, "Sales", "money", 61_000, "USD", "week", "digital"),
      f(grocer, hq, "Wholesale payments", "money", 90_000, "USD", "month", "digital"),
      f(hq, roastery, "Roast orders", "data", 30, "orders", "day", "digital"),
    ],
  };
}
