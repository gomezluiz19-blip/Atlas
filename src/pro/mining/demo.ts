// A demo mine to try Mining Pro with: a made-up copper mine in Zambia's
// North-Western Province, trucking concentrate to rail for the port of Dar es
// Salaam and along the Lobito corridor to the Atlantic, with a smelter in
// China. The mine, its people, grievances and figures are made up; the towns,
// ports and corridors are real.
import { addDays, today } from "../kit/ops";
import { newId } from "../../work/store";
import type { Mine } from "./model";

export function demoMine(): Mine {
  const t0 = today();
  const s = (name: string, kind: string, lon: number, lat: number, people?: number) => ({ id: newId(), name, kind, lon, lat, people });
  const pit = s("Main pit", "pit", 26.1, -12.3, 420), plant = s("Concentrator", "plant", 26.13, -12.285, 260), tailings = s("Tailings dam", "tailings", 26.08, -12.262);
  const camp = s("Camp", "camp", 26.16, -12.31, 1_100), airstrip = s("Solwezi airport", "airstrip", 26.365, -12.174), town = s("Solwezi town office", "office", 26.389, -12.169, 35);
  const lusaka = s("Head office, Lusaka", "office", 28.283, -15.417, 80), ndola = s("Fuel and reagents, Ndola", "supplier", 28.64, -12.97);
  const kapiri = s("Kapiri Mposhi rail siding", "siding", 28.67, -13.97), dar = s("Port of Dar es Salaam", "port", 39.29, -6.82);
  const kolwezi = s("Kolwezi rail siding (Lobito corridor)", "siding", 25.47, -10.72), lobito = s("Port of Lobito", "port", 13.55, -12.35);
  const smelter = s("Smelter, Qingdao", "smelter", 120.38, 36.07), gov = s("Ministry of Mines, Lusaka", "government", 28.29, -15.41);
  const mv = (from: { id: string }, to: { id: string }, what: string, kind: Mine["moves"][number]["kind"], amount: number, unit: string, per: Mine["moves"][number]["per"], mode: Mine["moves"][number]["mode"]) =>
    ({ id: newId(), from: from.id, to: to.id, what, kind, amount, unit, per, mode });
  const community = (name: string, kind: string, mood: Mine["parties"][number]["mood"], lon: number, lat: number, log: string) =>
    ({ id: newId(), name, kind, mood, lon, lat, log: [{ at: addDays(t0, -9), text: log }] });
  const parties = [
    community("Kamutunda village (demo)", "community", "concerned", 26.05, -12.24, "Asked about dust from haul trucks near the school."),
    community("Chief's council (demo)", "leader", "positive", 26.2, -12.35, "Agreed the plan for the new borehole; wants local hiring figures quarterly."),
    community("Farmers' co-operative (demo)", "landholder", "opposed", 26.02, -12.28, "Says the new waste dump takes grazing land; compensation disputed."),
    community("Water users' association (demo)", "ngo", "neutral", 26.07, -12.21, "Monthly sampling on the stream below the dam, shared results."),
    { id: newId(), name: "Mines Safety Department", kind: "government", mood: "neutral" as const, log: [] },
    { id: newId(), name: "Offtake buyer (demo)", kind: "buyer", mood: "ally" as const, log: [] },
  ];
  return {
    id: newId(), name: "Mutanda Hills Copper (demo)", commodity: "copper", country: "Zambia", demo: true, created: Date.now(),
    sites: [pit, plant, tailings, camp, airstrip, town, lusaka, ndola, kapiri, dar, kolwezi, lobito, smelter, gov],
    moves: [
      mv(pit, plant, "Ore", "goods", 1_000_000, "t", "month", "truck"),
      mv(plant, kapiri, "Copper concentrate", "goods", 12_000, "t", "month", "truck"),
      mv(kapiri, dar, "Copper concentrate", "goods", 12_000, "t", "month", "rail"),
      mv(dar, smelter, "Copper concentrate", "goods", 12_000, "t", "month", "ship"),
      mv(plant, kolwezi, "Copper concentrate", "goods", 8_000, "t", "month", "truck"),
      mv(kolwezi, lobito, "Copper concentrate", "goods", 8_000, "t", "month", "rail"),
      mv(lobito, smelter, "Copper concentrate", "goods", 8_000, "t", "month", "ship"),
      mv(ndola, plant, "Diesel, lime and reagents", "goods", 3_500, "t", "month", "truck"),
      mv(lusaka, airstrip, "Rotating crew", "people", 120, "people", "week", "air"),
      mv(camp, pit, "Shift crews", "people", 700, "people", "day", "van"),
      mv(lusaka, gov, "Royalties", "money", 9_000_000, "USD", "month", "digital"),
    ],
    parties,
    issues: [
      { id: newId(), title: "Dust on the haul road past the school", party: parties[0].id, site: pit.id, opened: addDays(t0, -34), updated: addDays(t0, -20), status: "open", severity: 2 },
      { id: newId(), title: "Stream below the dam ran cloudy after rain", party: parties[3].id, site: tailings.id, opened: addDays(t0, -8), updated: addDays(t0, -2), status: "open", severity: 3 },
      { id: newId(), title: "Compensation for grazing land under the waste dump", party: parties[2].id, opened: addDays(t0, -61), updated: addDays(t0, -18), status: "waiting", severity: 2 },
      { id: newId(), title: "Local hiring below the agreed share", party: parties[1].id, opened: addDays(t0, -15), updated: addDays(t0, -15), status: "open", severity: 1 },
    ],
    permits: [
      { id: newId(), title: "Large-scale mining licence", date: addDays(t0, 410), kind: "licence" },
      { id: newId(), title: "Environmental permit (tailings raise)", date: addDays(t0, 44), kind: "environment", site: tailings.id },
      { id: newId(), title: "Water abstraction permit", date: addDays(t0, 12), kind: "water", site: plant.id },
      { id: newId(), title: "Explosives storage licence", date: addDays(t0, 150), kind: "explosives", site: pit.id },
      { id: newId(), title: "Concentrate export permit", date: addDays(t0, -3), kind: "export" },
    ],
    econ: { oreMt: 12, grade: 0.62, gradeUnit: "%", recovery: 88, payable: 96, price: 9_500, costPerT: 28 },
  };
}
