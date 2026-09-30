// A demo company to try Field Network with: a made-up maker and servicer of
// drill rigs, underground loaders, haul trucks, crushers and automation, with
// machines at real mines from the Andes to the Copperbelt, Mongolia, the
// Bushveld, the Pilbara and Lapland. The company, its machines, people, jobs
// and deals are made up; the mines and places are real.
import { MINES } from "../../content/minerals";
import { addDays, today } from "../kit/ops";
import { newId } from "../../work/store";
import type { Account, Asset, Company, Depot, Job, Opportunity, Tech } from "./network";

const TYPES: Record<string, { model: string; every: number; perDay: number; life: number; power: Asset["power"] }> = {
  "Haul truck": { model: "KH-240", every: 500, perDay: 19, life: 90_000, power: "diesel" },
  "Drill rig": { model: "KD-9", every: 250, perDay: 16, life: 60_000, power: "diesel" },
  "Underground loader": { model: "KL-17", every: 250, perDay: 17, life: 40_000, power: "diesel" },
  Crusher: { model: "KC-3", every: 1000, perDay: 20, life: 150_000, power: "electric" },
  Automation: { model: "KA-Fleet", every: 2000, perDay: 24, life: 60_000, power: "electric" },
};

export function demoCompany(): Company {
  const t0 = today();
  const mine = (name: string) => MINES.find((m) => m.name.startsWith(name))!;
  const acc = (mineName: string, owner: string, sla = 24): Account => {
    const m = mine(mineName);
    return { id: newId(), name: owner, site: m.name, lon: m.lon, lat: m.lat, country: m.country, commodity: m.goods[0], method: m.kind, stage: "production", slaHours: sla,
      contacts: [{ name: "Maintenance superintendent (demo)", role: "Maintenance" }, { name: "Procurement lead (demo)", role: "Procurement" }] };
  };
  const accounts = [
    acc("Escondida", "Escondida customer (demo)"), acc("Chuquicamata", "Chuquicamata customer (demo)"), acc("Collahuasi", "Collahuasi customer (demo)"),
    acc("Antamina", "Antamina customer (demo)"), acc("Cerro Verde", "Cerro Verde customer (demo)"), acc("Kamoto", "Kolwezi customer (demo)", 48),
    acc("Oyu Tolgoi", "Oyu Tolgoi customer (demo)", 48), acc("Olympic Dam", "Olympic Dam customer (demo)"), acc("Mponeng", "Mponeng customer (demo)"),
    acc("Kiruna", "Kiruna customer (demo)"), acc("Carajás", "Carajás customer (demo)", 12), acc("Super Pit", "Kalgoorlie customer (demo)"),
  ];
  const A = (name: string) => accounts.find((a) => a.site.startsWith(name))!.id;
  // Machines: a seeded spread of types, ages, statuses and service states.
  const fleet: [string, string, number][] = [
    ["Escondida", "Haul truck", 6], ["Escondida", "Drill rig", 3], ["Escondida", "Automation", 1],
    ["Chuquicamata", "Underground loader", 5], ["Chuquicamata", "Drill rig", 2],
    ["Collahuasi", "Haul truck", 4], ["Collahuasi", "Drill rig", 2],
    ["Antamina", "Haul truck", 3], ["Antamina", "Crusher", 1],
    ["Cerro Verde", "Drill rig", 2], ["Kamoto", "Underground loader", 4], ["Kamoto", "Drill rig", 1],
    ["Oyu Tolgoi", "Underground loader", 4], ["Oyu Tolgoi", "Automation", 1],
    ["Olympic Dam", "Underground loader", 3], ["Mponeng", "Underground loader", 2], ["Mponeng", "Drill rig", 2],
    ["Kiruna", "Underground loader", 3], ["Carajás", "Haul truck", 5], ["Super Pit", "Drill rig", 3],
  ];
  const assets: Asset[] = [];
  let k = 0;
  for (const [site, type, n] of fleet) for (let i = 0; i < n; i++, k++) {
    const t = TYPES[type];
    const ageYears = 1 + ((k * 7) % 11) * 0.7;
    const hours = Math.round(t.perDay * 365 * ageYears * 0.85);
    const sinceService = Math.round(t.every * (((k * 13) % 10) / 9) * 1.15);
    assets.push({
      id: newId(), account: A(site), type, model: t.model, serial: `${t.model}-${String(1000 + k * 37).slice(-4)}`,
      installed: addDays(t0, -Math.round(ageYears * 365)), hours, asOf: addDays(t0, -2), perDay: t.perDay,
      serviceEvery: t.every, lastService: hours - sinceService, lifeHours: t.life,
      warrantyUntil: ageYears < 2 ? addDays(t0, 20 + ((k * 11) % 70)) : undefined,
      status: k % 17 === 3 ? "down" : k % 11 === 5 ? "standby" : "running", power: t.power,
    });
  }
  const depot = (name: string, kind: Depot["kind"], lon: number, lat: number, stock?: Depot["stock"]): Depot => ({ id: newId(), name, kind, lon, lat, stock });
  const depots = [
    depot("Service centre, Antofagasta", "service centre", -70.4, -23.65, [{ part: "Hydraulic pump", qty: 6, perMonth: 3 }, { part: "Drill bit set", qty: 40, perMonth: 30 }, { part: "Transmission", qty: 1, perMonth: 0.5 }]),
    depot("Service centre, Lima", "service centre", -77.04, -12.05, [{ part: "Hydraulic pump", qty: 2, perMonth: 2 }, { part: "Drill bit set", qty: 12, perMonth: 14 }]),
    depot("Parts depot, Lubumbashi", "parts depot", 27.48, -11.66, [{ part: "Hydraulic pump", qty: 1, perMonth: 1.5 }, { part: "Tyre, loader", qty: 8, perMonth: 4 }]),
    depot("Service centre, Johannesburg", "service centre", 28.05, -26.2, [{ part: "Hydraulic pump", qty: 5, perMonth: 2 }, { part: "Tyre, loader", qty: 20, perMonth: 6 }]),
    depot("Service centre, Perth", "service centre", 115.86, -31.95, [{ part: "Drill bit set", qty: 30, perMonth: 18 }, { part: "Hydraulic pump", qty: 4, perMonth: 1 }]),
    depot("Parts depot, Ulaanbaatar", "parts depot", 106.92, 47.92, [{ part: "Tyre, loader", qty: 3, perMonth: 3 }]),
    depot("Factory, Tampere", "factory", 23.76, 61.5),
  ];
  const tech = (name: string, base: string, lon: number, lat: number, skills: string[], available = true): Tech => ({ id: newId(), name, base, lon, lat, skills, available });
  const techs = [
    tech("Camila R. (demo)", "Antofagasta", -70.4, -23.65, ["Haul truck", "Drill rig", "Automation"]),
    tech("Diego M. (demo)", "Antofagasta", -70.4, -23.65, ["Underground loader", "Drill rig"], false),
    tech("Rosa Q. (demo)", "Lima", -77.04, -12.05, ["Haul truck", "Crusher"]),
    tech("Patrice K. (demo)", "Lubumbashi", 27.48, -11.66, ["Underground loader", "Drill rig"]),
    tech("Thabo N. (demo)", "Johannesburg", 28.05, -26.2, ["Underground loader", "Drill rig"]),
    tech("Grace W. (demo)", "Perth", 115.86, -31.95, ["Drill rig", "Underground loader", "Automation"]),
    tech("Bat-Erdene G. (demo)", "Ulaanbaatar", 106.92, 47.92, ["Underground loader", "Automation"], false),
    tech("Anna L. (demo)", "Tampere", 23.76, 61.5, ["Underground loader", "Automation", "Drill rig"]),
  ];
  const down = assets.filter((a) => a.status === "down");
  const jobs: Job[] = [
    ...down.map((a, i): Job => ({ id: newId(), account: a.account, asset: a.id, kind: "breakdown", priority: 1, opened: addDays(t0, -(i % 3)), status: i === 0 ? "assigned" : "open", tech: i === 0 ? techs[0].id : undefined, part: "Hydraulic pump" })),
    { id: newId(), account: A("Kamoto"), kind: "commissioning", priority: 2, opened: addDays(t0, -6), status: "open", notes: "Two new loaders to commission" },
    { id: newId(), account: A("Oyu Tolgoi"), kind: "training", priority: 3, opened: addDays(t0, -12), status: "open", notes: "Operator training before winter" },
    { id: newId(), account: A("Carajás"), kind: "inspection", priority: 2, opened: addDays(t0, -4), status: "open", notes: "Wet-season haul road inspection" },
  ];
  const opp = (product: string, value: number, stage: Opportunity["stage"], close: number, account?: string, prospect?: string): Opportunity => {
    const m = prospect ? mine(prospect) : undefined;
    return { id: newId(), product, value, stage, close: addDays(t0, close), account, prospect: m ? { name: m.name, lon: m.lon, lat: m.lat, country: m.country, commodity: m.goods[0] } : undefined };
  };
  const opps = [
    opp("6 battery-electric loaders", 14_000_000, "proposal", 90, A("Oyu Tolgoi")),
    opp("Haul fleet replacement (8 trucks)", 36_000_000, "negotiation", 60, A("Escondida")),
    opp("Automation retrofit", 4_500_000, "qualified", 120, A("Collahuasi")),
    opp("Service contract renewal", 2_200_000, "negotiation", 30, A("Antamina")),
    opp("Drill rigs (4)", 7_600_000, "lead", 180, undefined, "Pilgangoora"),
    opp("Underground loaders (5)", 9_000_000, "qualified", 150, undefined, "Rampura Agucha"),
    opp("Drill rigs (3)", 5_400_000, "lead", 210, undefined, "Grasberg"),
    opp("Crusher rebuild", 1_800_000, "won", -20, A("Cerro Verde")),
    opp("Loader fleet (4)", 7_000_000, "lost", -45, A("Mponeng")),
  ];
  return {
    id: newId(), name: "Kestrel Mining Equipment (demo)", vertical: "mining", demo: true, created: Date.now(), slaHours: 24,
    offer: { types: Object.keys(TYPES), methods: ["open pit", "underground"], commodities: ["copper", "gold", "iron", "lithium", "zinc", "nickel", "platinum"] },
    accounts, assets, techs, depots, jobs, opps,
  };
}
