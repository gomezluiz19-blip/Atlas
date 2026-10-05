// How the lenses present themselves in a place's card: a small drawing of
// what each one does (not an emoji that could mean anything), a plain name,
// and a fixed place in one of three families, so the strip reads the same way
// on every mountain, river or city:
//   Look inside   cut it open, lift it out in 3D, its shape
//   Watch time    a day passing, then and now, the sea rising
//   Follow        water to the sea, the metro, the woods, true size, the seafloor
const g = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export type LensFamily = "inside" | "time" | "follow" | "yours";

export interface LensLook { name: string; hint: string; family: LensFamily; glyph: string }

export const FAMILY: Record<LensFamily, { label: string; color: string }> = {
  inside: { label: "Look inside", color: "#b86b3a" },
  time: { label: "Watch time", color: "#e0a526" },
  follow: { label: "Follow", color: "#2f8fdd" },
  yours: { label: "Yours", color: "#8b5fa8" },
};

/** Built-in lenses, in the order they're shown. */
export const LOOKS: Record<string, LensLook> = {
  slice: { name: "Cut open", hint: "See the rock layers inside", family: "inside",
    glyph: g('<path d="M3 19l6-10 3 4 3-5 6 11z"/><path d="M13.5 5.5l-4 15" stroke-dasharray="2 2"/><path d="M4 19h16"/>') },
  block: { name: "3D block", hint: "Lift it out, rocks on its sides", family: "inside",
    glyph: g('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/><path d="M4 12l8 4.5 8-4.5" opacity="0.6"/>') },
  anatomy: { name: "Its shape", hint: "Height, steepness and bands of life", family: "inside",
    glyph: g('<path d="M3 19l7-12 4 6 2-3 5 9z"/><path d="M8 12h6M6.5 15h10" opacity="0.7"/><path d="M21 5v4M19 7h4" /> ') },
  day: { name: "A day", hint: "Sunrise to night in half a minute", family: "time",
    glyph: g('<path d="M3 18h18"/><path d="M5.5 18a6.5 6.5 0 0 1 13 0"/><circle cx="16.5" cy="9.5" r="2"/><path d="M12 5.5v-2M7 8l-1.3-1.3M17 8l1.3-1.3" opacity="0.7"/>') },
  rewind: { name: "Then & now", hint: "From space years ago, or the deep past", family: "time",
    glyph: g('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>') },
  sealevel: { name: "Sea level", hint: "Raise or drain the oceans", family: "time",
    glyph: g('<path d="M3 14c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/><path d="M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" opacity="0.6"/><path d="M12 3v7M9.5 5.5L12 3l2.5 2.5"/>') },
  trace: { name: "Follow water", hint: "Rain to river to the sea", family: "follow",
    glyph: g('<path d="M12 3c2 2.6 3.2 4.3 3.2 6a3.2 3.2 0 0 1-6.4 0c0-1.7 1.2-3.4 3.2-6z"/><path d="M12 14c0 3-3 3-3 5.5S12 22 14 21" stroke-dasharray="2 2"/>') },
  transit: { name: "Metro", hint: "Lines, stations, trains moving", family: "follow",
    glyph: g('<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 11h12M9 16.5L7 20.5M15 16.5l2 4"/><circle cx="9.5" cy="13.8" r="0.6" fill="currentColor"/><circle cx="14.5" cy="13.8" r="0.6" fill="currentColor"/>') },
  forest: { name: "The woods", hint: "Which trees, how dense", family: "follow",
    glyph: g('<path d="M8 20v-4M16 20v-3"/><path d="M8 3l4.5 8h-2.5l3 5H3l3-5H3.5z"/><path d="M16 7l3.5 6h-2l2.5 4H12" opacity="0.8"/>') },
  size: { name: "True size", hint: "Pick it up, drop it anywhere", family: "follow",
    glyph: g('<path d="M4 6l5-2 4 3 5-1 2 6-3 6-6 1-5-3z"/><path d="M8 10l3 1 3-1 1 3-2 3-3 .5-2-2z" opacity="0.7"/>') },
  seafloor: { name: "Seafloor", hint: "Its zones and deepest point", family: "follow",
    glyph: g('<path d="M3 6c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0"/><path d="M3 20l4-5 3 2 3-6 3 3 5-4v10z"/>') },
};

const ORDER = ["slice", "block", "anatomy", "day", "rewind", "sealevel", "trace", "transit", "forest", "size", "seafloor"];
const FAMILIES: LensFamily[] = ["inside", "time", "follow", "yours"];

/** A lens's look (made lenses keep their own emoji, under "Yours"). */
export function lookOf(l: { id: string; label: string; icon: string; blurb: string }): LensLook {
  return LOOKS[l.id] ?? { name: l.label, hint: l.blurb, family: "yours", glyph: "" };
}

/** Stable order: family, then the fixed order within it (made lenses by name). */
export function lensOrder(a: { id: string; label: string }, b: { id: string; label: string }): number {
  const la = LOOKS[a.id]?.family ?? "yours", lb = LOOKS[b.id]?.family ?? "yours";
  const fa = FAMILIES.indexOf(la), fb = FAMILIES.indexOf(lb);
  if (fa !== fb) return fa - fb;
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
  if (ia >= 0 && ib >= 0) return ia - ib;
  return a.label.localeCompare(b.label);
}
