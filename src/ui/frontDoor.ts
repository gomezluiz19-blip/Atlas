// One front door: the search box answers anything. Beyond places and
// addresses it finds what Terreno can show and do: a layer ("railways", "night
// lights", "where people live"), a theme, a view ("homeowners"), a tool
// ("plan a trip", "make a video"), a lens, a story. This file is the matching;
// main.ts lists the things.

export type ThingGroup = "Show on the map" | "Open" | "Stories";

export interface Thing {
  title: string;
  detail: string;
  /** Extra words people use for it. */
  words?: string;
  /** An emoji (drawn as its line icon). */
  emoji: string;
  group: ThingGroup;
  run(): void;
  /** For switches: whether it's on now. */
  on?(): boolean;
  /** For map layers: switches it off again. */
  off?(): void;
  /** For map layers you can stack (the Add a view sheet): the shelf it sits on ("Live", "Earth", "Analysis"). */
  shelf?: string;
}

/** Words that say how, not what: "show me the railways on the map". */
const FILLER = new Set(["show", "me", "the", "a", "an", "on", "map", "turn", "switch", "open", "see", "of", "and", "with", "for", "to", "my", "please", "view", "layer", "all", "world", "world's", "where", "are", "is", "in", "at"]);

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");

/** How well a thing matches a request (0: not at all). Every meaningful word must match. */
export function scoreThing(t: Thing, q: string): number {
  const want = tokens(q).filter((w) => !FILLER.has(w));
  if (!want.length) return 0;
  const title = tokens(t.title), all = [...title, ...tokens(t.detail), ...tokens(t.words ?? "")];
  let score = 0;
  for (const w of want) {
    const s = stem(w);
    let best = 0;
    for (const x of all) {
      const inTitle = title.includes(x) ? 1 : 0;
      if (x === w || stem(x) === s) best = Math.max(best, 3 + inTitle);
      else if (w.length >= 3 && x.startsWith(w)) best = Math.max(best, 2 + inTitle);
      else if (w.length >= 4 && x.includes(s)) best = Math.max(best, 1);
    }
    if (!best) return 0;
    score += best;
  }
  return score / want.length + (fold(t.title).startsWith(fold(q.trim())) ? 1 : 0);
}

/** The best matches, grouped as they'll be shown. */
export function findThings(things: Thing[], q: string, limit = 5): Thing[] {
  const seen = new Set<string>();
  return things
    .map((t) => ({ t, s: scoreThing(t, q) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .filter(({ t }) => (seen.has(t.title) ? false : (seen.add(t.title), true)))
    .slice(0, limit)
    .map((x) => x.t);
}
