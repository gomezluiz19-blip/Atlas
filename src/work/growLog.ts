// Field diary in plain words for Grow: "sprayed Top field with glyphosate",
// "planted Barn plot with barley", "harvested Top field, 7.2 t/ha",
// "irrigated the veg patch 20 mm". Unclear lines are left alone.
import { CROPS } from "./growModel";

export interface FieldLite { id: string; name: string; crop: string; planted: string; diary: { date: string; text: string }[] }
export interface FieldLogEntry { field: FieldLite; text: string; patch?: { crop?: string; planted?: string }; summary: string }

const VERBS: [RegExp, string][] = [
  [/\b(planted|sowed|sown|drilled|transplanted|seeded)\b/, "Planted"],
  [/\b(harvested|combined|picked|lifted|dug)\b/, "Harvested"],
  [/\b(sprayed|spraying)\b/, "Sprayed"],
  [/\b(fertili[sz]ed|top-?dressed|spread (manure|slurry|fertili[sz]er|lime)|limed|manured)\b/, "Fed"],
  [/\b(irrigated|watered)\b/, "Irrigated"],
  [/\b(cut|mowed|mown)\b/, "Cut"],
  [/\b(baled|wrapped)\b/, "Baled"],
  [/\b(ploughed|plowed|cultivated|harrowed|disced|tilled|rolled)\b/, "Worked the ground"],
  [/\b(weeded|hoed)\b/, "Weeded"],
  [/\b(scouted|walked|checked|inspected)\b/, "Checked"],
  [/\b(grazed)\b/, "Grazed"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const today = () => new Date().toISOString().slice(0, 10);

/** Finds the field a sentence is about, by its name (longest name first). */
export function findField(text: string, fields: FieldLite[]): FieldLite | undefined {
  const t = text.toLowerCase();
  return [...fields].sort((a, b) => b.name.length - a.name.length).find((f) => f.name && new RegExp(`\\b${esc(f.name.toLowerCase())}\\b`).test(t));
}

/** A crop named in the sentence ("with barley", "to winter wheat"). */
function cropIn(t: string): string | undefined {
  // "Wheat (winter)" is also "winter wheat"; the longest phrase that matches wins.
  const words = (c: (typeof CROPS)[number]) => {
    const l = c.label.toLowerCase(), base = l.replace(/\s*\(.*\)$/, ""), paren = /\(([^)]+)\)/.exec(l)?.[1];
    return [c.id, l, base, ...(paren ? [`${paren} ${base}`] : [])];
  };
  let best: string | undefined, len = 0;
  for (const c of CROPS) for (const w of words(c)) if (w.length > 2 && w.length > len && new RegExp(`\\b${esc(w)}\\b`).test(t)) { best = c.id; len = w.length; }
  return best;
}

export function parseFieldLog(text: string, fields: FieldLite[]): FieldLogEntry | null {
  const raw = text.trim().replace(/^(please\s+)?(log|record|note|add)( that)?\s*[:,]?\s*/i, "");
  const t = raw.toLowerCase();
  const field = findField(t, fields);
  if (!field) return null;
  const verb = VERBS.find(([re]) => re.test(t));
  if (!verb) return null;
  // Keep the details after the field name ("with glyphosate", "7.2 t/ha", "20 mm").
  const after = raw.slice(t.indexOf(field.name.toLowerCase()) + field.name.length).replace(/^[\s,:;-]+/, "").replace(/[.!]$/, "");
  const before = raw.slice(0, t.indexOf(field.name.toLowerCase())).replace(/^(i|we)\s+/i, "").replace(/\b(the|in|on|at)\s*$/i, "").trim();
  const detail = [after].filter((x) => x && !/^(today|this morning|this afternoon)$/i.test(x)).join(" ");
  const entry = detail ? `${verb[1]}: ${detail}` : before && !VERBS.some(([re]) => re.test(before.toLowerCase())) ? `${verb[1]}: ${before}` : verb[1];
  let patch: FieldLogEntry["patch"];
  if (verb[1] === "Planted") {
    const crop = cropIn(t);
    patch = { planted: today(), ...(crop ? { crop } : {}) };
  }
  const cropName = patch?.crop ? CROPS.find((c) => c.id === patch!.crop)!.label : "";
  return { field, text: entry, patch, summary: `${field.name}: ${entry.charAt(0).toLowerCase()}${entry.slice(1)}${patch ? ` (planting date today${cropName ? `, crop ${cropName}` : ""})` : ""}` };
}
