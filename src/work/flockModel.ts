// Animals in care: livestock on a farm, patients at a vet, animals at a rescue
// centre or an adoption agency. Records (weights, health, breeding), what's
// due, grazing on paddocks, and heat stress.

export type Org = "farm" | "vet" | "rescue" | "adoption";

export const ORGS: Record<Org, { label: string; statuses: string[]; about: string }> = {
  farm: { label: "Farm or ranch", statuses: ["Active", "For sale", "Sold", "Deceased"], about: "Herds and flocks, paddocks, weights, breeding and health" },
  vet: { label: "Vet practice", statuses: ["Patient", "Admitted", "Discharged"], about: "Patients, treatments, vaccinations and recalls" },
  rescue: { label: "Rescue centre", statuses: ["Intake", "In care", "Ready for release", "Released"], about: "Intakes, care, and releases back to the wild" },
  adoption: { label: "Adoption agency", statuses: ["Intake", "Available", "Adoption pending", "Adopted"], about: "Animals looking for homes, and a listing to share" },
};

export interface Species { id: string; label: string; emoji: string; /** Days from mating (or egg laying) to birth (hatching). */ gestation: number; /** Animal units (a 450 kg cow = 1). */ au: number; kg: number }

export const SPECIES: Species[] = [
  { id: "cattle", label: "Cattle", emoji: "🐄", gestation: 283, au: 1, kg: 550 },
  { id: "sheep", label: "Sheep", emoji: "🐑", gestation: 147, au: 0.2, kg: 70 },
  { id: "goat", label: "Goats", emoji: "🐐", gestation: 150, au: 0.15, kg: 60 },
  { id: "pig", label: "Pigs", emoji: "🐖", gestation: 114, au: 0.3, kg: 120 },
  { id: "horse", label: "Horses", emoji: "🐎", gestation: 340, au: 1.25, kg: 500 },
  { id: "alpaca", label: "Alpacas and llamas", emoji: "🦙", gestation: 345, au: 0.3, kg: 65 },
  { id: "chicken", label: "Chickens", emoji: "🐔", gestation: 21, au: 0.005, kg: 2.5 },
  { id: "duck", label: "Ducks", emoji: "🦆", gestation: 28, au: 0.01, kg: 3 },
  { id: "dog", label: "Dogs", emoji: "🐕", gestation: 63, au: 0.05, kg: 20 },
  { id: "cat", label: "Cats", emoji: "🐈", gestation: 65, au: 0.01, kg: 4.5 },
  { id: "rabbit", label: "Rabbits", emoji: "🐇", gestation: 31, au: 0.005, kg: 2 },
  { id: "bird", label: "Wild birds", emoji: "🦉", gestation: 30, au: 0, kg: 1 },
  { id: "hedgehog", label: "Hedgehogs and small wildlife", emoji: "🦔", gestation: 35, au: 0, kg: 1 },
  { id: "turtle", label: "Turtles and reptiles", emoji: "🐢", gestation: 60, au: 0, kg: 5 },
];
export const speciesById = (id: string) => SPECIES.find((s) => s.id === id) ?? SPECIES[0];

export interface HealthEvent { id: string; date: string; kind: "vaccination" | "treatment" | "checkup" | "note"; text: string; /** When the next dose or recheck is due. */ due?: string; done?: boolean }

export interface Animal {
  id: string;
  species: string;
  name: string;
  tag?: string;
  breed?: string;
  sex?: "F" | "M";
  born?: string;
  status: string;
  paddock?: string;
  weights: { date: string; kg: number }[];
  health: HealthEvent[];
  /** Date bred (mated or inseminated), for the due date. */
  bred?: string;
  photo?: string;
  notes?: string;
}

export interface Paddock { id: string; name: string; pts: [number, number][]; /** Forage on offer, kg dry matter per hectare. */ forage?: number }

export interface Flock { org: Org; name: string; animals: Animal[]; paddocks: Paddock[] }

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** "3 yr 2 mo", "5 mo", "12 days". */
export function age(born: string | undefined, today: string): string {
  if (!born) return "";
  const d = days(born, today);
  if (d < 0) return "";
  if (d < 60) return `${d} day${d === 1 ? "" : "s"}`;
  const [by, bm, bd] = born.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 24) return `${months} mo`;
  const y = Math.floor(months / 12), m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

/** Average daily gain (kg/day) over the last two weighings, and overall. */
export function gain(weights: Animal["weights"]): { last?: number; overall?: number } {
  const w = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 2) return {};
  const rate = (a: typeof w[0], b: typeof w[0]) => { const d = days(a.date, b.date); return d > 0 ? (b.kg - a.kg) / d : undefined; };
  return { last: rate(w[w.length - 2], w[w.length - 1]), overall: rate(w[0], w[w.length - 1]) };
}

export const dueDate = (species: string, bred: string) => addDays(bred, speciesById(species).gestation);

export interface DueItem { animal: Animal; what: string; date: string; overdue: boolean; kind: "health" | "birth" }

/** Everything coming up (or late): vaccinations, rechecks, births. */
export function dueList(animals: Animal[], today: string, horizon = 30): DueItem[] {
  const out: DueItem[] = [];
  const until = addDays(today, horizon);
  for (const a of animals) {
    for (const e of a.health) if (e.due && !e.done && e.due <= until) out.push({ animal: a, what: e.text || e.kind, date: e.due, overdue: e.due < today, kind: "health" });
    if (a.bred) {
      const d = dueDate(a.species, a.bred);
      if (d >= addDays(today, -7) && d <= until) out.push({ animal: a, what: speciesById(a.species).id === "chicken" || a.species === "duck" ? "Eggs due to hatch" : "Due to give birth", date: d, overdue: d < today, kind: "birth" });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** A paddock's stocking and how long its grass lasts. */
export function grazing(areaHa: number, forageKgDmHa: number, animals: Animal[], utilisation = 0.5) {
  const au = animals.reduce((s, a) => s + speciesById(a.species).au, 0);
  // Grazers eat about 2.5% of body weight in dry matter a day.
  const intake = animals.reduce((s, a) => {
    const sp = speciesById(a.species);
    if (!sp.au || sp.au < 0.01) return s;
    const kg = [...a.weights].sort((x, y) => x.date.localeCompare(y.date)).pop()?.kg ?? sp.kg;
    return s + kg * 0.025;
  }, 0);
  const onOffer = areaHa * forageKgDmHa * utilisation;
  return { au, auPerHa: areaHa > 0 ? au / areaHa : 0, intake, days: intake > 0 ? onOffer / intake : Infinity };
}

/** Temperature-humidity index (NRC 1971 form) and what it means for cattle. */
export function thi(tempC: number, rh: number): { value: number; level: "none" | "alert" | "danger" | "emergency" } {
  const value = 0.8 * tempC + (rh / 100) * (tempC - 14.4) + 46.4;
  return { value, level: value >= 84 ? "emergency" : value >= 79 ? "danger" : value >= 72 ? "alert" : "none" };
}

export function counts(animals: Animal[]): { species: string; n: number }[] {
  const m = new Map<string, number>();
  for (const a of animals) m.set(a.species, (m.get(a.species) ?? 0) + 1);
  return [...m].map(([species, n]) => ({ species, n })).sort((a, b) => b.n - a.n);
}
