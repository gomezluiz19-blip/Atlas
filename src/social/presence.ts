// Presence: what someone is up to right now (a status they set, and how fresh it is), the ways they're happy
// to be reached (the channels they choose to show), and the messages between two people. Pure: no DOM, no
// network, no storage.

// ---- Status ------------------------------------------------------------------------------------------

export type StatusState = "free" | "busy" | "out" | "travelling" | "quiet";

/** Each state's word and pigment (sage free, ochre busy, cerulean out, ultramarine travelling, stone quiet). */
export const STATES: Record<StatusState, { label: string; color: string; hint: string }> = {
  free: { label: "Free to talk", color: "#5b9467", hint: "Message or call any time" },
  busy: { label: "Busy", color: "#d19a2e", hint: "Replies later" },
  out: { label: "Out exploring", color: "#4c9ac9", hint: "Away from the screen" },
  travelling: { label: "Travelling", color: "#5160c2", hint: "On the move" },
  quiet: { label: "Do not disturb", color: "#8c8f87", hint: "Not taking messages now" },
};

export interface Status {
  state: StatusState;
  /** A line of their own ("At the lake until 5"). */
  text?: string;
  /** When it was set (ISO). */
  at: string;
  /** Where they are, in words, if they chose to say (a town, never an address). */
  where?: string;
}

/** A status goes stale after a day: it's shown faded, as "last set". */
export const STALE_MS = 24 * 3_600_000;

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago" (pure). */
export function ago(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (m < 2) return "Just now";
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const d = Math.round(hrs / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

/** A status as it should read now: its state, line, freshness, and whether it's gone stale (pure). */
export function statusNow(s: Status | undefined, now: Date): { state: StatusState; label: string; color: string; line: string; when: string; stale: boolean } | null {
  if (!s || !STATES[s.state]) return null;
  const stale = now.getTime() - new Date(s.at).getTime() > STALE_MS;
  const st = STATES[s.state];
  return { state: s.state, label: st.label, color: stale ? STATES.quiet.color : st.color, line: [s.text, s.where].filter(Boolean).join(" · "), when: ago(s.at, now), stale };
}

/** A status from storage or a link, tidied; anything malformed is dropped (pure). */
export function statusFromJson(v: unknown): Status | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const state = typeof o.state === "string" && o.state in STATES ? (o.state as StatusState) : null;
  const at = typeof o.at === "string" && Number.isFinite(new Date(o.at).getTime()) ? o.at : null;
  if (!state || !at) return undefined;
  const text = typeof o.text === "string" ? o.text.trim().slice(0, 100) : "";
  const where = typeof o.where === "string" ? o.where.trim().slice(0, 60) : "";
  return { state, at, ...(text ? { text } : {}), ...(where ? { where } : {}) };
}

// ---- Ways to reach someone -----------------------------------------------------------------------

export type ReachKind = "text" | "call" | "whatsapp" | "telegram" | "signal" | "email";
export interface Reach { kind: ReachKind; value: string }

export const REACH: Record<ReachKind, { label: string; placeholder: string; verb: string }> = {
  text: { label: "Text", placeholder: "+1 914 555 0100", verb: "Text" },
  call: { label: "Call", placeholder: "+1 914 555 0100", verb: "Call" },
  whatsapp: { label: "WhatsApp", placeholder: "+351 912 345 678", verb: "WhatsApp" },
  telegram: { label: "Telegram", placeholder: "username", verb: "Telegram" },
  signal: { label: "Signal", placeholder: "+44 7700 900123", verb: "Signal" },
  email: { label: "Email", placeholder: "name@example.com", verb: "Email" },
};

const digits = (s: string) => s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");

/** Whether a way to reach someone is well formed (pure). */
export function validReach(r: Reach): boolean {
  const v = r.value.trim();
  switch (r.kind) {
    case "text": case "call": case "whatsapp": case "signal": return /^\+?\d{7,15}$/.test(digits(v));
    case "telegram": return /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v);
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }
}

/** The link that opens the right app, with a first line ready where the app allows it (pure). */
export function reachLink(r: Reach, hello = ""): string {
  const v = r.value.trim(), d = digits(v), body = hello ? encodeURIComponent(hello) : "";
  switch (r.kind) {
    case "text": return `sms:${d}${body ? `?&body=${body}` : ""}`;
    case "call": return `tel:${d}`;
    case "whatsapp": return `https://wa.me/${d.replace(/^\+/, "")}${body ? `?text=${body}` : ""}`;
    case "telegram": return `https://t.me/${v.replace(/^@/, "")}`;
    case "signal": return `https://signal.me/#p/${d.startsWith("+") ? d : `+${d}`}`;
    case "email": return `mailto:${v}${body ? `?body=${body}` : ""}`;
  }
}

/** Ways to reach from storage or a link: well formed, one of each kind, at most six (pure). */
export function reachFromJson(v: unknown): Reach[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((x): Reach[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.kind !== "string" || !(o.kind in REACH) || typeof o.value !== "string") return [];
    const r = { kind: o.kind as ReachKind, value: o.value.trim().slice(0, 80) };
    if (!validReach(r) || seen.has(r.kind)) return [];
    seen.add(r.kind);
    return [r];
  }).slice(0, 6);
}

// ---- Messages ----------------------------------------------------------------------------------------

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  at: string;
  /** "sent": on Terreno's servers; "device": kept here (servers off, or an example person). */
  via: "sent" | "device";
  read?: boolean;
}

/** The conversation between two handles, oldest first (pure). */
export function thread(all: Message[], me: string, them: string): Message[] {
  return all.filter((m) => (m.from === me && m.to === them) || (m.from === them && m.to === me)).sort((a, b) => a.at.localeCompare(b.at));
}

/** Unread messages to me, counted per sender (pure). */
export function unread(all: Message[], me: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of all) if (m.to === me && !m.read) out[m.from] = (out[m.from] ?? 0) + 1;
  return out;
}

/** Messages grouped into runs by day, for a thread's date lines ("Today", "Yesterday", "3 Oct") (pure). */
export function byDay(ms: Message[], now: Date): { day: string; items: Message[] }[] {
  const out: { day: string; items: Message[] }[] = [];
  const label = (iso: string) => {
    const d = new Date(iso), t = new Date(now);
    const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    if (key(d) === key(t)) return "Today";
    t.setDate(t.getDate() - 1);
    if (key(d) === key(t)) return "Yesterday";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  for (const m of ms) {
    const day = label(m.at);
    if (out.at(-1)?.day === day) out.at(-1)!.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}

/** A message, tidied: trimmed, at most 2,000 characters; null when empty (pure). */
export function cleanText(s: string): string | null {
  const t = s.replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, 2000);
  return t ? t : null;
}
