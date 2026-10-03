// The stack of views, the pure parts: what each bubble shows, how the Add a
// view sheet finds and orders things. (The screen is ui/viewStack.ts.)
import type { Thing } from "./frontDoor";

const LEADING_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;

/** For layers named without an emoji, one that says what they are (by id). */
const BY_ID: [RegExp, string][] = [
  [/plane/, "✈️"], [/ship/, "🚢"], [/wind/, "💨"], [/radar/, "🌧️"], [/quake/, "〽️"], [/aurora/, "🌌"], [/lights/, "🌃"],
  [/plates/, "🧩"], [/species|wildlife/, "🔬"], [/geology/, "🪨"], [/elevation/, "⛰️"], [/slope/, "📐"], [/contour/, "〰️"],
  [/hillshade/, "🌄"], [/rail/, "🚆"], [/road/, "🚗"], [/port/, "⚓"], [/airport/, "🛫"], [/power/, "🏭"], [/cable/, "〰️"],
  [/^time/, "⏳"], [/sat/, "🛰️"], [/mine/, "⛏️"], [/city:life/, "🏙️"], [/^year/, "🌱"], [/politic/, "🏛️"], [/trip|journey/, "🧭"],
  [/news|worldnow/, "🗞️"], [/herd|flock/, "🐑"], [/ndvi|grow|field/, "🌱"], [/build/, "🏗️"], [/rain|flow|water|river/, "💧"],
];

/** The emoji and the plain name for a view on the map (pure): "🌋 Volcanoes" → 🌋, "Volcanoes". */
export function viewGlyph(id: string, label: string): { emoji: string; name: string } {
  const m = LEADING_EMOJI.exec(label);
  if (m) return { emoji: m[1], name: label.slice(m[0].length) || label };
  const hit = BY_ID.find(([re]) => re.test(id.toLowerCase()));
  return { emoji: hit?.[1] ?? "", name: label };
}

/** The first letter, for a bubble with no emoji. */
export const initial = (name: string) => (name.match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase();

/** Things that can be stacked as views (map layers with a shelf). */
export const stackable = (things: Thing[]) => things.filter((t) => t.shelf);

/** Views matching a search (pure): every word must appear in the name, the line about it, its words or its shelf. */
export function matchViews(things: Thing[], q: string): Thing[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (t: Thing) => {
    const title = t.title.toLowerCase(), rest = `${t.detail} ${t.words ?? ""} ${t.shelf ?? ""}`.toLowerCase();
    let s = 0;
    for (const w of words) {
      if (title.startsWith(w)) s += 4;
      else if (title.includes(w)) s += 3;
      else if (rest.includes(w)) s += 1;
      else return 0;
    }
    return s;
  };
  return stackable(things).map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t);
}

/** The shelves to show with nothing typed, in order: what's live, the theme you're in, then the rest (pure). */
export function shelfOrder(things: Thing[], themeLabel?: string): { first: string[]; more: string[] } {
  const all = [...new Set(stackable(things).map((t) => t.shelf!))];
  const fixed = ["Live", ...(themeLabel && all.includes(themeLabel) ? [themeLabel] : []), "The whole Earth", "Networks", "Analysis"].filter((s) => all.includes(s));
  return { first: fixed, more: all.filter((s) => !fixed.includes(s)) };
}
