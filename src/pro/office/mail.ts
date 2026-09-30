// The office's mailbag and the numbers behind it: every letter, email, call
// and form with its topic and position, what's rising week on week, the reply
// queue against the office's own two-week promise, form letters merged per
// person, casework turnaround by agency, and invite lists for an event by
// distance and interest. Pure functions.
import { kmBetween } from "../kit/ops";
import type { Case, Contact } from "./model";

export type Position = "support" | "oppose" | "neutral" | "question";
export const POSITIONS: { id: Position; label: string; color: string }[] = [
  { id: "support", label: "Support", color: "#1f9d55" }, { id: "oppose", label: "Oppose", color: "#d64545" },
  { id: "neutral", label: "Comment", color: "#8e8e93" }, { id: "question", label: "Question or request", color: "#0a84ff" },
];
export const CHANNELS = ["Email", "Web form", "Letter", "Phone", "Social media", "In person"] as const;
export interface Message { id: string; contact?: string; name: string; email?: string; topic: string; position: Position; channel: string; received: string; replied?: string; lon?: number; lat?: number; note?: string }
export interface Template { id: string; topic: string; body: string }

/** Days to reply the office commits to. */
export const REPLY_DAYS = 14;
const dayMs = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);
const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** The mailbag's shape: topics with their support and opposition, what's rising, the weekly count and the reply queue (pure). */
export function mailStats(ms: Message[], on: string, weeks = 8) {
  const week = (d: string) => Math.floor(daysBetween(d, on) / 7);
  const topics = [...ms.reduce((m, x) => m.set(x.topic, [...(m.get(x.topic) ?? []), x]), new Map<string, Message[]>())].map(([topic, xs]) => {
    const thisWeek = xs.filter((x) => week(x.received) === 0).length, lastWeek = xs.filter((x) => week(x.received) === 1).length;
    return {
      topic, n: xs.length, thisWeek, lastWeek,
      support: xs.filter((x) => x.position === "support").length, oppose: xs.filter((x) => x.position === "oppose").length,
      rising: thisWeek >= 3 && thisWeek >= 2 * Math.max(1, lastWeek),
    };
  }).sort((a, b) => b.n - a.n);
  const byWeek = Array.from({ length: weeks }, (_, i) => ms.filter((x) => week(x.received) === weeks - 1 - i).length);
  const queue = ms.filter((x) => !x.replied).map((x) => ({ ...x, waiting: daysBetween(x.received, on) })).sort((a, b) => b.waiting - a.waiting);
  const replied = ms.filter((x) => x.replied);
  return {
    total: ms.length, topics, byWeek, queue,
    overdue: queue.filter((x) => x.waiting > REPLY_DAYS).length,
    medianReply: median(replied.map((x) => daysBetween(x.received, x.replied!))),
    onTime: replied.length ? replied.filter((x) => daysBetween(x.received, x.replied!) <= REPLY_DAYS).length / replied.length : null,
  };
}

/** A form letter for one person: {first}, {name} and {topic} filled in (pure). */
export function merge(body: string, m: { name: string; topic: string }): string {
  const first = m.name.replace(/^(Mr|Mrs|Ms|Mx|Dr|Sgt|Rev)\.?\s+/i, "").split(/\s+/)[0] ?? m.name;
  return body.replace(/\{first\}/g, first).replace(/\{name\}/g, m.name).replace(/\{topic\}/g, m.topic);
}

/** Casework by agency: open cases, how long they've been open, how long closed ones took, and missing privacy releases (pure). */
export function agencyStats(cases: (Case & { release?: boolean; closed?: string })[], on: string) {
  const by = new Map<string, typeof cases>();
  for (const c of cases) by.set(c.agency, [...(by.get(c.agency) ?? []), c]);
  return [...by].map(([agency, cs]) => {
    const open = cs.filter((c) => c.status !== "closed"), done = cs.filter((c) => c.status === "closed");
    return {
      agency, open: open.length, closed: done.length,
      medianOpen: median(open.map((c) => daysBetween(c.opened, on))),
      medianToClose: median(done.map((c) => daysBetween(c.opened, c.closed ?? c.updated))),
      noRelease: open.filter((c) => !c.release).length,
    };
  }).sort((a, b) => b.open - a.open || b.medianOpen - a.medianOpen);
}

/** Who to invite to an event: people within `km`, optionally with an interest in a topic, nearest first (pure). */
export function inviteList(contacts: Contact[], at: { lon: number; lat: number }, km: number, topic?: string) {
  const t = topic?.toLowerCase();
  return contacts.filter((c) => c.lon !== undefined && c.lat !== undefined && c.kind !== "press")
    .map((c) => ({ c, km: kmBetween(at, { lon: c.lon!, lat: c.lat! }) }))
    .filter((x) => x.km <= km && (!t || x.c.topics.some((y) => y.toLowerCase() === t)))
    .sort((a, b) => a.km - b.km);
}

/** Messages from a mail system's export: name, email, subject or topic, date, and position if marked (pure). */
export function messagesFromRows(rows: Record<string, string>[], newId: () => string): Message[] {
  const col = (r: Record<string, string>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(r)) if (k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "") && r[k]) return r[k]; return ""; };
  return rows.flatMap((r) => {
    const name = col(r, "name", "from", "sender", "constituent") || `${col(r, "first name", "first")} ${col(r, "last name", "last")}`.trim();
    const topic = col(r, "topic", "issue", "category", "subject");
    if (!name || !topic) return [];
    const pos = col(r, "position", "stance", "pro con").toLowerCase();
    const position: Position = /support|pro|for|yes/.test(pos) ? "support" : /oppos|against|con|no/.test(pos) ? "oppose" : /quest|request|help/.test(pos) ? "question" : "neutral";
    const d = col(r, "date", "received", "date received");
    const received = d && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return [{ id: newId(), name, email: col(r, "email", "e mail") || undefined, topic: topic.replace(/^(re|fwd?):\s*/i, "").slice(0, 60), position, channel: col(r, "channel", "source", "type") || "Email", received }];
  });
}
