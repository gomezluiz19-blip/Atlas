// Site diary in plain words for Build: "Oak Street: poured the level 2 slab,
// 14 crew", "structure 60%", "delivery of steel on Friday". A line names the
// project, or starts with "site" when there's only one project.
import { PHASES, type BuildProject, type PhaseId } from "./buildModel";

export interface SiteLogEntry {
  project: BuildProject;
  log?: { text: string; crew?: number };
  phase?: { id: PhaseId; done: number };
  delivery?: { date: string; text: string };
  summary: string;
}

const PHASE_WORDS: [RegExp, PhaseId][] = [
  [/\b(site prep(aration)?|clearing|hoarding|fencing)\b/, "site"],
  [/\b(foundations?|footings?|piles?|piling|groundworks?|ground slab)\b/, "foundations"],
  [/\b(structure|frame|framing|steel ?work|superstructure|floors? slab|topping out|topped out)\b/, "structure"],
  [/\b(envelope|cladding|roof(ing)?|windows|glazing|weathertight|brickwork)\b/, "envelope"],
  [/\b(services|mep|first fix|second fix|electrics?|plumbing|hvac|ventilation)\b/, "services"],
  [/\b(interiors?|finishes|plastering|drylining|decorating|fit[- ]?out|flooring)\b/, "interiors"],
  [/\b(handover|snagging|inspection|completion)\b/, "handover"],
];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "tomorrow", "on Friday", "on 12 March" → an ISO date (defaults to today). */
export function dateIn(t: string, now = new Date()): string {
  if (/\btomorrow\b/.test(t)) return iso(new Date(now.getTime() + 86_400_000));
  const dow = DAYS.findIndex((d) => new RegExp(`\\b(on |next |this )?${d}\\b`).test(t));
  if (dow >= 0) { const add = ((dow - now.getDay() + 7) % 7) || 7; return iso(new Date(now.getTime() + add * 86_400_000)); }
  const m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t);
  if (m) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]);
    let d = new Date(Date.UTC(now.getUTCFullYear(), month, Number(m[1])));
    if (d.getTime() < now.getTime() - 30 * 86_400_000) d = new Date(Date.UTC(now.getUTCFullYear() + 1, month, Number(m[1])));
    return iso(d);
  }
  return iso(now);
}

export function parseSiteLog(text: string, projects: BuildProject[], now = new Date()): SiteLogEntry | null {
  const raw = text.trim().replace(/^(please\s+)?(log|record|note|add)( that)?\s*[:,]?\s*/i, "");
  const t = raw.toLowerCase();
  let project = [...projects].sort((a, b) => b.name.length - a.name.length).find((p) => p.name && new RegExp(`\\b${esc(p.name.toLowerCase())}\\b`).test(t));
  let rest = project ? raw.replace(new RegExp(esc(project.name), "i"), "") : raw;
  if (!project && projects.length === 1 && /^(site|on site|site log|site diary)\b/.test(t)) { project = projects[0]; rest = raw.replace(/^(site log|site diary|on site|site)\s*[:,-]?\s*/i, ""); }
  if (!project) return null;
  rest = rest.replace(/^[\s:,;-]+/, "").replace(/[.!]$/, "").trim();
  const r = rest.toLowerCase();
  if (!rest) return null;

  // Delivery: "delivery of steel on Friday", "steel delivered tomorrow"
  const del = /\b(deliver(y|ies|ed)|arriving|arrives|drop[- ]?off)\b/.exec(r);
  if (del) {
    const what = rest.replace(/\b(delivery|deliveries|delivered|arriving|arrives|of|on|tomorrow|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ").replace(/\b\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9}\b/i, " ").replace(/\s+/g, " ").trim();
    const date = dateIn(r, now);
    return { project, delivery: { date, text: what || rest }, summary: `${project.name}: delivery of ${what || rest} on ${date}` };
  }
  // Progress: "structure 60%", "foundations done", "roof complete"
  const pct = /(\d{1,3})\s*%/.exec(r), finished = /\b(done|complete(d)?|finished)\b/.test(r);
  const phase = PHASE_WORDS.find(([re]) => re.test(r))?.[1];
  const crewM = /\b(\d{1,3})\s*(crew|workers|men|people|trades(people|men)?|operatives|on site)\b/.exec(r);
  const crew = crewM ? Number(crewM[1]) : undefined;
  const entry: SiteLogEntry = { project, log: { text: rest, crew }, summary: "" };
  if (phase && (pct || finished)) {
    const done = finished ? 100 : Math.min(100, Number(pct![1]));
    entry.phase = { id: phase, done };
  }
  const label = PHASES.find((p) => p.id === entry.phase?.id)?.label;
  entry.summary = `${project.name}: ${rest}${crew !== undefined && !/crew|workers|men|people|operatives/.test(r) ? `, ${crew} crew` : ""}${entry.phase ? ` (${label} ${entry.phase.done}%)` : ""}`;
  return entry;
}
