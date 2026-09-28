// A sowing calendar from a place's own frost dates: when to start seeds
// indoors, when to plant out, and when to sow outdoors, for common garden
// crops. Offsets are the usual rules of thumb in weeks from the average last
// spring frost (negative = before), as seed packets and extension services give.

export interface SowRule {
  crop: string;
  emoji: string;
  /** Start indoors: weeks before (-) or after (+) the last frost, [from, to]. */
  indoors?: [number, number];
  /** Plant out / transplant. */
  out?: [number, number];
  /** Sow directly outdoors. */
  direct?: [number, number];
  /** Days from sowing (or planting out) to first harvest. */
  days: number;
  /** Tender crops need the whole season frost-free. */
  tender?: boolean;
  note?: string;
  /** Autumn jobs, in weeks from the average first autumn frost. */
  autumn?: { what: SowTask["what"]; w: [number, number]; note?: string }[];
}

export const SOWING: SowRule[] = [
  { crop: "Tomatoes", emoji: "🍅", indoors: [-8, -6], out: [1, 3], days: 70, tender: true },
  { crop: "Peppers and chillies", emoji: "🌶️", indoors: [-10, -8], out: [2, 4], days: 75, tender: true },
  { crop: "Aubergines", emoji: "🍆", indoors: [-10, -8], out: [2, 4], days: 80, tender: true },
  { crop: "Cucumbers", emoji: "🥒", indoors: [-4, -3], out: [1, 3], direct: [1, 4], days: 55, tender: true },
  { crop: "Courgettes and squash", emoji: "🎃", indoors: [-4, -3], out: [1, 3], direct: [1, 3], days: 55, tender: true },
  { crop: "Sweetcorn", emoji: "🌽", indoors: [-4, -2], out: [1, 3], direct: [1, 3], days: 80, tender: true },
  { crop: "French and runner beans", emoji: "🫘", indoors: [-3, -2], out: [1, 3], direct: [1, 6], days: 60, tender: true },
  { crop: "Basil", emoji: "🌿", indoors: [-6, -4], out: [2, 4], days: 30, tender: true },
  { crop: "Onions (from seed)", emoji: "🧅", indoors: [-12, -10], out: [-4, -2], days: 110 },
  { crop: "Onion sets and shallots", emoji: "🧅", direct: [-4, -1], days: 100 },
  { crop: "Leeks", emoji: "🥬", indoors: [-12, -8], out: [2, 6], days: 120 },
  { crop: "Cabbage, broccoli and cauliflower", emoji: "🥦", indoors: [-8, -6], out: [-3, -1], days: 70 },
  { crop: "Kale", emoji: "🥬", indoors: [-8, -6], out: [-4, -1], direct: [-4, 2], days: 55 },
  { crop: "Lettuce and salad leaves", emoji: "🥗", indoors: [-8, -6], out: [-3, 0], direct: [-4, 10], days: 40, note: "Sow a short row every two or three weeks." },
  { crop: "Spinach", emoji: "🥬", direct: [-6, -2], days: 40 },
  { crop: "Peas", emoji: "🟢", direct: [-6, -2], days: 65 },
  { crop: "Broad beans", emoji: "🫛", direct: [-8, -4], days: 90 },
  { crop: "Carrots", emoji: "🥕", direct: [-3, 4], days: 75 },
  { crop: "Beetroot", emoji: "🟣", direct: [-2, 6], days: 60 },
  { crop: "Radishes", emoji: "🔴", direct: [-5, 8], days: 28, note: "Sow little and often." },
  { crop: "Parsnips", emoji: "🥕", direct: [-2, 2], days: 120 },
  { crop: "Potatoes (earlies)", emoji: "🥔", direct: [-4, -2], days: 90, note: "Earth up shoots if frost is forecast." },
  { crop: "Potatoes (maincrop)", emoji: "🥔", direct: [-2, 1], days: 120 },
  { crop: "Strawberry plants", emoji: "🍓", out: [-4, 0], days: 60, autumn: [{ what: "Plant out", w: [-6, -2], note: "Autumn-planted runners crop next summer" }] },
  { crop: "Garlic", emoji: "🧄", days: 240, autumn: [{ what: "Plant out", w: [-2, 6], note: "Cloves pointed end up, 15 cm apart; lift next summer" }] },
  { crop: "Broad beans (overwintering)", emoji: "🫛", days: 200, autumn: [{ what: "Sow outdoors", w: [-4, 0], note: "Hardy varieties such as 'Aquadulce'" }] },
  { crop: "Onion sets (overwintering)", emoji: "🧅", days: 250, autumn: [{ what: "Plant out", w: [-6, -2] }] },
  { crop: "Winter salads and spinach", emoji: "🥗", days: 50, autumn: [{ what: "Sow outdoors", w: [-8, -5], note: "Under cover once frosts start" }] },
  { crop: "Spring cabbage", emoji: "🥬", days: 200, autumn: [{ what: "Plant out", w: [-8, -5] }] },
  { crop: "Green manure (winter rye, field beans)", emoji: "🌱", days: 150, autumn: [{ what: "Sow outdoors", w: [-6, 0], note: "Covers bare soil over winter" }] },
];

export interface SowTask { crop: string; emoji: string; what: "Sow indoors" | "Plant out" | "Sow outdoors"; from: number; to: number; note?: string }

/**
 * The sowing tasks for a place, as days of the year. `lastSpring` and
 * `firstAutumn` are the average frost dates (day of year); where there's no
 * frost, planting follows the cool season instead and this returns nothing.
 */
export function sowingTasks(lastSpring: number | null, firstAutumn: number | null): SowTask[] {
  if (lastSpring === null) return [];
  const season = firstAutumn !== null ? (firstAutumn - lastSpring + 365) % 365 : 365;
  const out: SowTask[] = [];
  const add = (r: SowRule, what: SowTask["what"], w?: [number, number]) => {
    if (!w) return;
    const from = lastSpring + w[0] * 7, to = lastSpring + w[1] * 7;
    // Skip a tender crop the season is too short to ripen.
    if (r.tender && season - Math.max(0, w[0] * 7) < r.days + 14) return;
    out.push({ crop: r.crop, emoji: r.emoji, what, from: (from + 365 - 1) % 365 + 1, to: (to + 365 - 1) % 365 + 1, note: r.note });
  };
  for (const r of SOWING) {
    add(r, "Sow indoors", r.indoors); add(r, "Plant out", r.out); add(r, "Sow outdoors", r.direct);
    if (firstAutumn !== null) for (const a of r.autumn ?? []) {
      const from = firstAutumn + a.w[0] * 7, to = firstAutumn + a.w[1] * 7;
      out.push({ crop: r.crop, emoji: r.emoji, what: a.what, from: (from + 365 - 1) % 365 + 1, to: (to + 365 - 1) % 365 + 1, note: a.note ?? r.note });
    }
  }
  return out;
}

/** Tasks whose window overlaps the next `weeks` weeks from `today` (day of year), soonest first. */
export function upcoming(tasks: SowTask[], today: number, weeks = 6): (SowTask & { inDays: number; now: boolean })[] {
  const ahead = weeks * 7;
  const rel = (d: number) => (d - today + 365) % 365;
  return tasks
    .map((t) => {
      const a = rel(t.from), b = rel(t.to);
      const now = a > b || a === 0; // window wraps past today: open now
      return { ...t, inDays: now ? 0 : a, now };
    })
    .filter((t) => t.now || t.inDays <= ahead)
    .sort((x, y) => x.inDays - y.inDays || x.crop.localeCompare(y.crop));
}
