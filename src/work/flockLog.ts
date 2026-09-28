// Logging in plain words for Flock: "Daisy had twins", "weighed 101 at 590 kg",
// "wormed all the sheep", "Bramble is lame". Works for typed or spoken text;
// anything it can't read is left alone rather than guessed.
import { SPECIES, type Animal, type Flock, type HealthEvent } from "./flockModel";

export type LogAction =
  | { kind: "weight"; kg: number }
  | { kind: "birth"; young: number }
  | { kind: "health"; event: Omit<HealthEvent, "id"> }
  | { kind: "note"; text: string }
  | { kind: "bred" };

export interface LogEntry { animals: Animal[]; action: LogAction; summary: string }

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, twins: 2, twin: 2, two: 2, triplets: 3, three: 3, four: 4, quads: 4, quadruplets: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const SPECIES_WORDS: [RegExp, string][] = [
  [/\b(cattle|cows?|heifers?|steers?|bulls?|calves|herd)\b/, "cattle"],
  [/\b(sheep|ewes?|rams?|lambs?|hoggets?)\b/, "sheep"],
  [/\b(goats?|does|bucks?|kids)\b/, "goat"],
  [/\b(pigs?|sows?|gilts?|boars?|piglets?|hogs?)\b/, "pig"],
  [/\b(horses?|mares?|ponies|pony|foals?|geldings?|donkeys?)\b/, "horse"],
  [/\b(alpacas?|llamas?|crias?)\b/, "alpaca"],
  [/\b(chickens?|hens?|chooks?|pullets?|roosters?|cockerels?)\b/, "chicken"],
  [/\b(ducks?|drakes?|ducklings?)\b/, "duck"],
  [/\b(dogs?|puppies|pups?)\b/, "dog"],
  [/\b(cats?|kittens?)\b/, "cat"],
  [/\b(rabbits?|does|bunnies|kits)\b/, "rabbit"],
];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const label = (a: Animal) => a.name || (a.tag ? `#${a.tag}` : "an animal");

/** Which animals the sentence is about: names, tag numbers, or a whole species ("all the sheep"). */
export function findAnimals(text: string, flock: Flock): Animal[] {
  const t = text.toLowerCase();
  const active = flock.animals.filter((a) => !/sold|deceased|released|adopted|discharged/i.test(a.status));
  const named = active.filter((a) => a.name && new RegExp(`\\b${a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  if (named.length) return named;
  const tags = [...t.matchAll(/(?:#|\btag\s*|\bno\.?\s*|\bnumber\s*|\b)(\d{1,6})\b/g)].map((m) => m[1]);
  const tagged = active.filter((a) => a.tag && tags.includes(a.tag.toLowerCase()));
  if (tagged.length) return tagged;
  if (/\b(all|every|whole|the)\b/.test(t) || /\b(flock|herd|mob)\b/.test(t)) {
    for (const [re, sp] of SPECIES_WORDS) if (re.test(t)) { const g = active.filter((a) => a.species === sp); if (g.length) return g; }
    if (/\b(all|every|whole) (the )?(animals|stock|livestock|of them)\b/.test(t)) return active;
  }
  return [];
}

/** Reads one log line. */
export function parseLog(text: string, flock: Flock): LogEntry | null {
  const t = text.toLowerCase().replace(/^(please\s+)?(log|record|note|add)( that)?\s*[:,]?\s*/, "").trim();
  if (!t) return null;
  const animals = findAnimals(t, flock);
  if (!animals.length) return null;
  const who = animals.length === 1 ? label(animals[0]) : `${animals.length} ${SPECIES.find((s) => s.id === animals[0].species)?.label.toLowerCase() ?? "animals"}`;

  // Weight: "weighed 101 at 590 kg", "Daisy weighs 590kg", "Daisy 590 kg"
  const kg = /(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?)\b/.exec(t) ?? (/\bweigh(?:s|ed|t)?\b/.test(t) ? /\b(?:at|is|of|was)\s+(\d+(?:\.\d+)?)\b/.exec(t) : null);
  if (kg && animals.length === 1) {
    const v = parseFloat(kg[1]);
    if (v > 0 && v < 2000) return { animals, action: { kind: "weight", kg: v }, summary: `${who}: weight ${v} kg` };
  }
  // Births: "had twins", "lambed", "calved a heifer", "gave birth to 3", "kidded"
  const born = /\b(had|gave birth(?: to)?|delivered|dropped|lambed|calved|kidded|farrowed|foaled|whelped|kittened|kindled)\b(?:\s+(a|an|one|single|twins?|two|triplets|three|four|quads|quadruplets|five|six|seven|eight|nine|ten|\d+))?/.exec(t);
  if (born && (/\b(had|gave birth|delivered|dropped)\b/.test(born[1]) ? /\b(twins?|triplets|quads|lambs?|calf|calves|kids?|piglets?|foal|pups?|puppies|kittens?|kits|young|babies|litter|\d+)\b/.test(t) : true)) {
    const w = born[2] ?? (/\b(twins?|triplets|quads|quadruplets)\b/.exec(t)?.[1]) ?? "";
    const young = NUM[w] ?? (parseInt(w, 10) || (/\blitter\b/.test(t) ? 0 : 1));
    return { animals, action: { kind: "birth", young }, summary: `${who}: gave birth${young ? ` (${young})` : ""}` };
  }
  // Breeding: "Daisy was served / bred / tupped / covered / AI'd"
  if (/\b(served|bred|tupped|covered|mated|inseminated|ai'?d|put to the (ram|bull|boar|buck))\b/.test(t))
    return { animals, action: { kind: "bred" }, summary: `${who}: bred today` };
  // Health: vaccinations, worming, treatments, trims.
  const health: [RegExp, HealthEvent["kind"], string, number?][] = [
    [/\b(vaccinated|vaccination|jabbed|booster)\b/, "vaccination", "Vaccination", 365],
    [/\b(wormed|drenched|dewormed|worming|drench)\b/, "treatment", "Worming", 42],
    [/\b(treated|injected|antibiotics?|dosed|medicated)\b/, "treatment", "Treatment", 7],
    [/\b(trimmed|feet trimmed|hoof trim|foot ?bath(ed)?|farrier|shod)\b/, "checkup", "Feet trimmed", 90],
    [/\b(sheared|shorn|clipped|crutched)\b/, "treatment", "Shearing", 365],
    [/\b(checked|vet (visit|check|came)|examined|scanned)\b/, "checkup", "Check-up"],
  ];
  for (const [re, kind, what, every] of health) {
    if (!re.test(t)) continue;
    const detail = /\b(?:with|for|against)\s+(.+)$/i.exec(text.trim())?.[1]?.replace(/[.!]$/, "");
    const desc = detail ? `${what}: ${detail}` : what;
    return { animals, action: { kind: "health", event: { date: today(), kind, text: desc, due: every ? addDays(every) : undefined } }, summary: `${who}: ${desc[0].toLowerCase()}${desc.slice(1)}${every ? " (next due set)" : ""}` };
  }
  // Anything else about a named animal becomes a dated note ("Bramble is lame").
  if (animals.length <= 3 && /\b(is|was|seems|looks|has|limping|lame|sick|off (her|his) feed|coughing|scouring|injured|cut|lost|found|moved|escaped)\b/.test(t)) {
    const note = text.trim().replace(/^(please\s+)?(log|record|note|add)( that)?\s*[:,]?\s*/i, "");
    return { animals, action: { kind: "note", text: note }, summary: `${who}: note "${note}"` };
  }
  return null;
}

/** Applies a log entry to the records (mutates and returns the flock). */
export function applyLog(flock: Flock, e: LogEntry, newId: () => string): Flock {
  const ids = new Set(e.animals.map((a) => a.id));
  for (const a of flock.animals) {
    if (!ids.has(a.id)) continue;
    const act = e.action;
    if (act.kind === "weight") a.weights.push({ date: today(), kg: act.kg });
    else if (act.kind === "birth") { a.health.unshift({ id: newId(), date: today(), kind: "note", text: act.young ? `Gave birth: ${act.young}` : "Gave birth" }); a.bred = undefined; }
    else if (act.kind === "bred") a.bred = today();
    else if (act.kind === "health") a.health.unshift({ id: newId(), ...act.event });
    else a.health.unshift({ id: newId(), date: today(), kind: "note", text: act.text });
  }
  return flock;
}
