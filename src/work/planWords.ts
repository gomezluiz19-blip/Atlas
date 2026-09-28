// Schedules typed the way people say them. Build: "start 3 March; site 2
// weeks, foundations 6 weeks, frame 3 months, roof and walls 8 weeks
// overlapping 4 weeks…". Grow: "potatoes 20 March, then leeks after harvest,
// then a winter cover crop".
import { addDays, daysBetween, PHASES, type Phase, type PhaseId } from "./buildModel";
import { CROPS, cropById } from "./growModel";
import { parseDate } from "./journeyModel";

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5 };
const n = (s: string) => NUM[s.toLowerCase()] ?? parseFloat(s);
const NUMW = "(\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)";
const days = (count: number, unit: string) => Math.round(count * (/^mo/i.test(unit) ? 30.4 : /^w/i.test(unit) ? 7 : 1));

const PHASE_WORDS: [RegExp, PhaseId][] = [
  [/\b(site|prep|preparation|clearing|enabling|demolition|setting out)\b/i, "site"],
  [/\b(foundations?|footings?|piling|piles|groundworks?|excavation|slab)\b/i, "foundations"],
  [/\b(structure|frame|framing|steel|superstructure|concrete frame|floors)\b/i, "structure"],
  [/\b(envelope|roof|roofing|cladding|walls|windows|facade|façade|weathertight|shell)\b/i, "envelope"],
  [/\b(services|mep|m&e|electrics?|electrical|plumbing|mechanical|hvac|first fix)\b/i, "services"],
  [/\b(interiors?|fit[- ]?out|finishes|finishing|second fix|decorating|kitchens?)\b/i, "interiors"],
  [/\b(handover|hand over|snagging|commissioning|inspections?|completion)\b/i, "handover"],
];

export interface PhasePlan { phases: Phase[]; understood: { id: PhaseId; days: number; overlap: number }[]; start: string }

/** A new schedule from words; phases not mentioned keep their current length. */
export function schedulePhases(text: string, current: Phase[], today: string): PhasePlan | null {
  let start = current[0]?.start ?? today;
  const sm = text.match(/\b(?:start(?:ing)?|begin(?:ning)?|from)\s+(?:on\s+)?([a-z0-9/ -]+?)(?=[;,.]|$)/i);
  if (sm) { const d = /^(today|now)$/i.test(sm[1].trim()) ? today : parseDate(sm[1].trim(), today); if (d) start = d; }
  const understood: PhasePlan["understood"] = [];
  for (const part of text.split(/[;,\n]|\bthen\b/i)) {
    const id = PHASE_WORDS.find(([re]) => re.test(part))?.[1];
    const len = part.match(new RegExp(`${NUMW}\\s*(days?|weeks?|wks?|months?|mos?)\\b`, "i"));
    if (!id || !len) continue;
    const ov = part.match(new RegExp(`overlap(?:ping)?\\s+(?:by\\s+)?${NUMW}\\s*(days?|weeks?|wks?|months?|mos?)\\b`, "i"));
    understood.push({ id, days: days(n(len[1]), len[2]), overlap: ov ? days(n(ov[1]), ov[2]) : -1 });
  }
  if (!understood.length && !sm) return null;
  const out: Phase[] = [];
  let t = start;
  for (const meta of PHASES) {
    const was = current.find((p) => p.id === meta.id);
    const said = understood.find((u) => u.id === meta.id);
    const len = said?.days ?? (was ? Math.max(1, daysBetween(was.start, was.end)) : 14);
    // Keep the overlap the phase had before unless one was given.
    const prev = current[PHASES.indexOf(meta) - 1];
    const oldOverlap = was && prev ? Math.max(0, daysBetween(was.start, prev.end)) : 0;
    const overlap = out.length ? (said && said.overlap >= 0 ? said.overlap : oldOverlap) : 0;
    const s = out.length ? addDays(t, -overlap) : t;
    const e = addDays(s, len);
    out.push({ id: meta.id, start: s, end: e, done: was?.done ?? 0 });
    t = e;
  }
  return { phases: out, understood, start };
}

// ---- Grow: a field's year -----------------------------------------------------------------------

export interface Planting { crop: string; planted: string }

const cropIn = (text: string) => {
  const t = text.toLowerCase();
  // Longest names first so "winter wheat" beats "wheat".
  const names = CROPS.flatMap((c) => [c.label.toLowerCase().replace(/\s*\(.*\)/, ""), c.id.replace("-", " ")].map((name) => ({ c, name })))
    .concat([{ c: cropById("wheat-winter"), name: "winter wheat" }, { c: cropById("maize"), name: "corn" }])
    .sort((a, b) => b.name.length - a.name.length);
  for (const { c, name } of names) {
    const stem = name.replace(/(es|s)$/, "");
    if (stem.length >= 3 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(es|s)?\\b`).test(t)) return c;
  }
  return null;
};

/** Crops one after another in a field: "potatoes 20 March, then leeks after harvest". */
export function seasonPlan(text: string, today: string, after: string): Planting[] {
  const out: Planting[] = [];
  let prevEnd = after;
  for (const part of text.split(/\bthen\b|[;\n]|,/i).map((s) => s.trim()).filter(Boolean)) {
    const c = cropIn(part);
    if (!c) continue;
    // The first thing that reads as a date ("potatoes 20" isn't one; "20 March" is).
    let date: string | undefined;
    for (const m of part.matchAll(/(?=\b(\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,}|[a-z]{3,}\s+\d{1,2}(?:st|nd|rd|th)?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})\b)/gi)) {
      date = parseDate(m[1], today);
      if (date) break;
    }
    const planted = date || addDays(prevEnd, 7);
    out.push({ crop: c.id, planted });
    prevEnd = addDays(planted, c.days);
  }
  return out;
}
