// Where made lenses live: the examples that ship with Terreno (each by one of
// the example people), the ones made on this device, and ones opened from
// links. "My lenses" (made or kept) join the lens strip for every place.
import { deleteLensRemote, pushLens } from "../cloud/sync";
import { lensFromJson, type LensDef } from "./custom";

export const DEMO_LENSES: LensDef[] = [
  { id: "birdwatching", name: "Birdwatching", icon: "🐦", color: "#30b0c7", author: "maya", radiusKm: 5, for: ["lake", "coast", "forest", "river", "land"],
    blurb: "What's been seen here lately, where to watch from, and whether it's calm enough",
    home: { name: "Reifel Migratory Bird Sanctuary", lon: -123.1786, lat: 49.0986 },
    blocks: [
      { type: "species", group: "birds", days: 30 },
      { type: "places", title: "Hides and reserves", emoji: "🔭", tags: ["leisure=bird_hide", "leisure=nature_reserve"] },
      { type: "weather", good: { windMax: 25, rainMax: 0.2 }, when: "day" },
      { type: "sun" },
      { type: "tip", text: "Go early and go quiet. Birds are busiest in the first two hours after sunrise, and a still morning carries every call." },
    ] },
  { id: "stargazing", name: "Stargazing", icon: "🔭", color: "#5160c2", author: "kenjiskies", radiusKm: 15,
    blurb: "How dark tonight gets, the moon, the cloud, and somewhere with a view",
    home: { name: "Mauna Kea", lon: -155.4681, lat: 19.8207 },
    blocks: [
      { type: "sky" },
      { type: "weather", title: "Cloud after dark", good: { cloudMax: 30 }, when: "night" },
      { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] },
      { type: "ground" },
      { type: "tip", text: "Give your eyes twenty minutes in the dark and use a red torch. Look slightly to the side of faint things: the edge of your eye sees more." },
    ] },
  { id: "aurora-watch", name: "Aurora watch", icon: "🌌", color: "#5b9467", author: "kenjiskies", radiusKm: 15,
    blurb: "Is the aurora strong enough to reach here, is it dark, and is it clear?",
    home: { name: "Tromsø", lon: 18.9553, lat: 69.6492 },
    blocks: [
      { type: "aurora" },
      { type: "sky" },
      { type: "weather", title: "Cloud after dark", good: { cloudMax: 40 }, when: "night" },
      { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] },
      { type: "tip", text: "Get away from street lights and look north. Give it an hour: displays come in waves, and your phone's night mode sees colour your eyes can't." },
    ] },
  { id: "surf-check", name: "Surf check", icon: "🏄", color: "#3563d6", author: "lena.surf", radiusKm: 8, for: ["coast", "sea", "island"],
    blurb: "The swell, the wind and the breaks nearby: is it a lesson day?",
    home: { name: "Ribeira d'Ilhas, Ericeira", lon: -9.4196, lat: 38.9876 },
    blocks: [
      { type: "marine", good: { waveMin: 0.5, waveMax: 2, periodMin: 8 } },
      { type: "weather", title: "Wind", good: { windMax: 18 }, when: "day" },
      { type: "places", title: "Beaches and breaks", emoji: "🏖️", tags: ["natural=beach", "sport=surfing"] },
      { type: "tip", text: "For lessons, under 1.5 m with light offshore wind is perfect. Period is the secret: 12 seconds or more means clean, organised waves." },
    ] },
  { id: "coffee-crawl", name: "Coffee crawl", icon: "☕", color: "#9a7552", author: "priya.eats", radiusKm: 1.2, for: ["city"],
    blurb: "Cafés and bakeries within a walk, and whether it's a day to sit outside",
    home: { name: "Chiado, Lisbon", lon: -9.1421, lat: 38.7107 },
    blocks: [
      { type: "places", title: "Cafés", emoji: "☕", tags: ["amenity=cafe"] },
      { type: "places", title: "Bakeries", emoji: "🥐", tags: ["shop=bakery"] },
      { type: "weather", title: "Sitting outside", good: { rainMax: 0, tempMin: 15 }, when: "day" },
      { type: "tip", text: "Order at the counter and stand, like the locals: it's cheaper than sitting down, and faster." },
    ] },
  { id: "golden-hour", name: "Golden hour", icon: "📷", color: "#d19a2e", author: "samoutside", radiusKm: 8,
    blurb: "When the light is best, whether the sky will play along, and where to stand",
    home: { name: "Maroon Bells", lon: -106.989, lat: 39.0708 },
    blocks: [
      { type: "sun" },
      { type: "weather", title: "The sky", good: { cloudMin: 15, cloudMax: 70, rainMax: 0 }, when: "any" },
      { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] },
      { type: "ground" },
      { type: "tip", text: "Broken cloud is your friend: it catches the colour after the sun has set. Stay twenty minutes after sunset; the best light often comes last." },
    ] },
  { id: "rock-detective", name: "Rock detective", icon: "🪨", color: "#9a7552", author: "msokafor", radiusKm: 10,
    blurb: "The ground under your feet, rock you can actually see, and old quarries",
    home: { name: "Seven Sisters cliffs", lon: 0.148, lat: 50.77 },
    blocks: [
      { type: "ground" },
      { type: "places", title: "Rock you can see", emoji: "🪨", tags: ["geological=outcrop", "natural=cliff", "natural=rock"] },
      { type: "places", title: "Old quarries and mines", emoji: "⛏️", tags: ["landuse=quarry", "historic=mine"] },
      { type: "tip", text: "Cliffs, road cuttings and old walls are windows into the rock. Then open the Rewind lens to see how old it is and what the land looked like then." },
    ] },
];

const read = <T>(key: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full */ } };
const MADE = "atlas.lenses.v1";
const KEPT = "atlas.lenses.kept.v1";

export const madeLenses = (): LensDef[] => read<unknown[]>(MADE, []).flatMap((x) => lensFromJson(x) ?? []);
export const keptIds = (): string[] => read<string[]>(KEPT, []);
/** Made here, or kept from someone else. */
export const myLenses = (): LensDef[] => [...madeLenses(), ...keptIds().flatMap((id) => { const d = findLens(id); return d && !madeLenses().some((m) => m.id === id) ? [d] : []; })];
export const isMade = (id: string) => madeLenses().some((d) => d.id === id);
export const isKept = (id: string) => keptIds().includes(id) || isMade(id);

const SEEN = "atlas.lenses.seen.v1";
export function allLenses(): LensDef[] {
  const out = new Map<string, LensDef>();
  for (const d of [...madeLenses(), ...read<unknown[]>(SEEN, []).flatMap((x) => lensFromJson(x) ?? []), ...DEMO_LENSES]) if (!out.has(d.id)) out.set(d.id, d);
  return [...out.values()];
}
export const findLens = (id: string) => allLenses().find((d) => d.id === id) ?? null;

export function saveLens(d: LensDef) { write(MADE, [d, ...madeLenses().filter((x) => x.id !== d.id)]); void pushLens(d).catch(() => {}); }
export function deleteLens(id: string) { write(MADE, madeLenses().filter((x) => x.id !== id)); keep(id, false); void deleteLensRemote(id); }
export function keep(id: string, on: boolean) { write(KEPT, on ? [...new Set([...keptIds(), id])] : keptIds().filter((x) => x !== id)); }
/** A lens opened from a link, remembered so it can be found again. */
export function rememberLens(d: LensDef) {
  if (DEMO_LENSES.some((x) => x.id === d.id) || isMade(d.id)) return;
  write(SEEN, [d, ...read<unknown[]>(SEEN, []).flatMap((x) => lensFromJson(x) ?? []).filter((x) => x.id !== d.id)].slice(0, 30));
}
