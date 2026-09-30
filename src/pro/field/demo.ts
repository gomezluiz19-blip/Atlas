// A demo programme to try Field Ops with: a made-up water, health and
// schooling programme in Turkana, northern Kenya, supplied from Mombasa and
// Kitale. The programme, its figures and incidents are made up; the towns and
// routes are real places.
import { addDays, today } from "../kit/ops";
import { newId } from "../../work/store";
import { defaultReach, type Programme, type Service } from "./model";

export function demoProgramme(): Programme {
  const t0 = today();
  const s = (name: string, kind: string, lon: number, lat: number) => ({ id: newId(), name, kind, lon, lat });
  const c = (name: string, lon: number, lat: number, people: number, needs: Service[]) => ({ id: newId(), name, lon, lat, people, needs });
  const mombasa = s("Port of Mombasa", "port", 39.668, -4.044), kitale = s("Supply hub, Kitale", "warehouse", 35.006, 1.016);
  const lodwarW = s("Warehouse, Lodwar", "warehouse", 35.6, 3.12), lodwarO = s("Field office, Lodwar", "office", 35.593, 3.117), nairobi = s("Country office, Nairobi", "office", 36.822, -1.292);
  const lodwarC = s("Clinic, Lodwar", "clinic", 35.598, 3.122), kakumaC = s("Clinic, Kakuma", "clinic", 34.866, 3.717);
  const w1 = s("Borehole, Lokichar", "water", 35.65, 2.38), w2 = s("Borehole, Kalokol", "water", 35.863, 3.535), w3 = s("Water point, Lodwar", "water", 35.6, 3.11);
  const school = s("School, Lokitaung", "school", 35.757, 4.266), dist = s("Distribution point, Kakuma", "distribution", 34.87, 3.71), dist2 = s("Distribution point, Lokichar", "distribution", 35.652, 2.382);
  const airstrip = s("Lodwar airstrip", "airstrip", 35.609, 3.122);
  const mv = (from: { id: string }, to: { id: string }, what: string, kind: Programme["moves"][number]["kind"], amount: number, unit: string, per: Programme["moves"][number]["per"], mode: Programme["moves"][number]["mode"]) =>
    ({ id: newId(), from: from.id, to: to.id, what, kind, amount, unit, per, mode });
  return {
    id: newId(), name: "Turkana programme (demo)", demo: true, created: Date.now(), reach: defaultReach(),
    sites: [mombasa, kitale, lodwarW, lodwarO, nairobi, lodwarC, kakumaC, w1, w2, w3, school, dist, dist2, airstrip],
    communities: [
      c("Lodwar", 35.597, 3.119, 48_000, ["water", "health"]), c("Kakuma", 34.867, 3.717, 60_000, ["water", "health", "food", "school"]),
      c("Lokichoggio", 34.348, 4.204, 18_000, ["water", "health", "school"]), c("Kalokol", 35.863, 3.535, 11_000, ["health", "school"]),
      c("Lokitaung", 35.757, 4.266, 9_000, ["water", "health"]), c("Lokichar", 35.65, 2.38, 14_000, ["health", "school"]),
      c("Kainuk", 35.56, 1.73, 6_000, ["water", "health", "school"]), c("Lokori", 36.02, 1.95, 7_500, ["water", "health", "food"]),
      c("Kerio", 35.95, 3.0, 4_000, ["water", "food"]), c("Nakalale", 35.67, 3.97, 3_500, ["water", "health"]),
    ],
    moves: [
      mv(mombasa, kitale, "Medical supplies and water kits", "goods", 60, "t", "month", "truck"),
      mv(kitale, lodwarW, "Supplies", "goods", 55, "t", "month", "truck"),
      mv(lodwarW, kakumaC, "Medicines", "goods", 4, "t", "week", "truck"),
      mv(lodwarW, dist, "Food rations", "goods", 18, "t", "week", "truck"),
      mv(lodwarW, dist2, "Food rations", "goods", 9, "t", "week", "truck"),
      mv(lodwarW, school, "School meals", "goods", 2, "t", "week", "truck"),
      mv(nairobi, airstrip, "Staff rotation", "people", 12, "people", "week", "air"),
      mv(lodwarO, nairobi, "Monitoring reports", "data", 40, "reports", "week", "digital"),
    ],
    parties: [
      { id: newId(), name: "County health department", kind: "government", mood: "ally", lon: 35.597, lat: 3.119, log: [{ at: addDays(t0, -6), text: "Agreed joint outreach days in Kalokol." }] },
      { id: newId(), name: "WASH cluster", kind: "cluster", mood: "positive", log: [] },
      { id: newId(), name: "Lokichoggio elders (demo)", kind: "community", mood: "concerned", lon: 34.348, lat: 4.204, log: [{ at: addDays(t0, -3), text: "Asked again for a water point; the nearest is 60 km away." }] },
      { id: newId(), name: "Main donor (demo)", kind: "donor", mood: "positive", log: [] },
    ],
    incidents: [
      { id: newId(), title: "Truck held at a roadblock near Kainuk", opened: addDays(t0, -4), updated: addDays(t0, -4), status: "open", severity: 3 },
      { id: newId(), title: "Borehole pump at Lokichar failing", site: w1.id, opened: addDays(t0, -21), updated: addDays(t0, -17), status: "waiting", severity: 2 },
      { id: newId(), title: "Cold-chain fridge at Kakuma clinic", site: kakumaC.id, opened: addDays(t0, -2), updated: addDays(t0, -1), status: "open", severity: 2 },
    ],
    deliveries: [
      { id: newId(), title: "Vaccines to Kakuma clinic", date: addDays(t0, 2), kind: "delivery", site: kakumaC.id },
      { id: newId(), title: "Pump parts to Lokichar", date: addDays(t0, 6), kind: "delivery", site: w1.id },
      { id: newId(), title: "Food rations, Lokichar", date: addDays(t0, -1), kind: "delivery", site: dist2.id },
      { id: newId(), title: "Quarterly report to donor", date: addDays(t0, 19), kind: "report" },
    ],
  };
}
