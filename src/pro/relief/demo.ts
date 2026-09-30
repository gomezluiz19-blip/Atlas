// A demo relief supply chain: a made-up logistics operation along a real
// corridor, from the port of Mombasa up the Northern Corridor through
// Kampala to Juba, then out to field warehouses and distribution points in
// South Sudan by road, Nile barge and air. The roads to the most remote
// places close in the rains (roughly May to October). The organisation,
// stocks, people and consignments are made up; the places are real.
import { newId } from "../../work/store";
import { addDays, isoDay, kmBetween, type Consignment, type Hub, type HubKind, type Leg, type Mode, type Network } from "./model";

const WET = [4, 5, 6, 7, 8, 9];

export function demoNetwork(now = Date.now()): Network {
  const today = isoDay(now);
  const hub = (name: string, kind: HubKind, lon: number, lat: number, stock: Record<string, number>, o: Partial<Hub> = {}): Hub => ({ id: newId(), name, kind, lon, lat, stock, wet: kind === "port" ? [] : WET, ...o });
  const hubs = [
    hub("Mombasa port", "port", 39.65, -4.05, { cereal: 4200, pulses: 600, oil: 260, rutf: 30_000, hygiene: 18_000, shelter: 6000, medkit: 40 }, { capacity: 12_000, wet: [3, 4] }),
    hub("Kampala transit hub", "hub", 32.58, 0.35, { cereal: 900, pulses: 120, oil: 50, rutf: 6000, hygiene: 3000 }, { capacity: 3000, wet: [3, 4, 9, 10] }),
    hub("Juba main hub", "hub", 31.58, 4.85, { cereal: 1600, pulses: 210, oil: 90, rutf: 9000, hygiene: 5000, shelter: 1500, medkit: 12 }, { capacity: 5000 }),
    hub("Bor warehouse", "field", 31.56, 6.21, { cereal: 380, pulses: 40, oil: 18, rutf: 1400, hygiene: 800 }, { capacity: 900 }),
    hub("Rumbek warehouse", "field", 29.69, 6.81, { cereal: 220, pulses: 30, oil: 10, rutf: 900, hygiene: 600 }, { capacity: 700 }),
    hub("Wau warehouse", "field", 28.0, 7.7, { cereal: 300, pulses: 35, oil: 14, rutf: 1200, hygiene: 500 }, { capacity: 800 }),
    hub("Malakal warehouse", "field", 31.66, 9.53, { cereal: 260, pulses: 22, oil: 9, rutf: 1600, hygiene: 700 }, { capacity: 900 }),
    hub("Bentiu warehouse", "field", 29.8, 9.23, { cereal: 150, pulses: 12, oil: 6, rutf: 700, hygiene: 300 }, { capacity: 600 }),
    hub("Pibor", "point", 33.13, 6.8, { cereal: 400, pulses: 60, oil: 25, rutf: 260, hygiene: 2500 }, { people: 38_000, use: { rutf: 18 } }),
    hub("Akobo", "point", 33.0, 7.78, { cereal: 25, pulses: 4, oil: 1.6, rutf: 120, hygiene: 600 }, { people: 26_000, use: { rutf: 12 } }),
    hub("Leer", "point", 30.14, 8.3, { cereal: 60, pulses: 9, oil: 3.8, rutf: 400, hygiene: 2000 }, { people: 31_000, use: { rutf: 15 } }),
    hub("Aweil", "point", 27.4, 8.77, { cereal: 140, pulses: 21, oil: 8.8, rutf: 500, hygiene: 4000 }, { people: 45_000, use: { rutf: 20 } }),
    hub("Maban (Bunj)", "point", 33.8, 9.97, { cereal: 250, pulses: 38, oil: 16, rutf: 300, hygiene: 3000 }, { people: 52_000, use: { rutf: 22 } }),
    hub("Kapoeta", "point", 33.59, 4.77, { cereal: 300, pulses: 45, oil: 19, rutf: 380, hygiene: 2500 }, { people: 24_000, use: { rutf: 10 } }),
  ];
  const H = (n: string) => hubs.find((x) => x.name.startsWith(n))!;
  const leg = (a: string, b: string, mode: Mode, o: Partial<Leg> = {}): Leg => ({ id: newId(), from: H(a).id, to: H(b).id, mode, km: kmBetween(H(a), H(b)), status: "open", ...o });
  const legs = [
    leg("Mombasa", "Kampala", "road", { delayDays: 2, perDay: 30, note: "Northern Corridor; border at Malaba" }),
    leg("Kampala", "Juba", "road", { delayDays: 2, perDay: 20, note: "Via Nimule; border clearance" }),
    leg("Juba", "Bor", "road", { perDay: 12, status: "slow", note: "Escorted convoys after an incident" }),
    leg("Juba", "Bor", "river", { perDay: 1, tonnesEach: 300, note: "Nile barges" }),
    leg("Bor", "Malakal", "river", { perDay: 1, tonnesEach: 300, note: "Nile barges" }),
    leg("Juba", "Rumbek", "road", { perDay: 10 }),
    leg("Rumbek", "Wau", "road", { perDay: 8 }),
    leg("Wau", "Aweil", "road", { perDay: 8 }),
    leg("Rumbek", "Bentiu", "road", { perDay: 6, dryOnly: true }),
    leg("Bentiu", "Leer", "road", { perDay: 4, dryOnly: true }),
    leg("Bor", "Pibor", "road", { perDay: 5, dryOnly: true }),
    leg("Pibor", "Akobo", "road", { perDay: 3, dryOnly: true }),
    leg("Malakal", "Maban", "road", { perDay: 5, dryOnly: true }),
    leg("Juba", "Kapoeta", "road", { perDay: 8 }),
    leg("Juba", "Malakal", "air", { perDay: 2, tonnesEach: 12 }),
    leg("Juba", "Pibor", "air", { perDay: 1, tonnesEach: 12 }),
    leg("Juba", "Akobo", "air", { perDay: 1, tonnesEach: 12 }),
    leg("Malakal", "Maban", "air", { perDay: 1, tonnesEach: 12 }),
    leg("Juba", "Bentiu", "air", { perDay: 1, tonnesEach: 12 }),
  ];
  const mv = (item: string, qty: number, from: string, to: string, left: number, arrives: number, status: Consignment["status"] = "moving"): Consignment =>
    ({ id: newId(), item, qty, from: H(from).id, to: H(to).id, path: [H(from).id, H(to).id], left: addDays(today, left), arrives: addDays(today, arrives), status });
  const moves = [
    mv("cereal", 600, "Mombasa", "Juba", -6, 4), mv("rutf", 4000, "Mombasa", "Juba", -3, 7), mv("cereal", 120, "Juba", "Rumbek", -2, 1),
    mv("cereal", 250, "Juba", "Malakal", -5, -1, "delayed"), mv("hygiene", 600, "Juba", "Kapoeta", -1, 2), mv("rutf", 300, "Juba", "Pibor", -1, 1),
  ];
  const incidents = [
    { id: newId(), date: addDays(today, -5), text: "Convoy stopped and looted on the Juba–Bor road (demo)", lon: 31.6, lat: 5.6, severity: 3 as const },
    { id: newId(), date: addDays(today, -2), text: "Bridge damaged by flooding near Rumbek (demo)", lon: 29.9, lat: 6.6, severity: 2 as const },
  ];
  return { id: newId(), name: "Riverline Relief Logistics (demo)", demo: true, created: now, hubs, legs, moves, incidents };
}
