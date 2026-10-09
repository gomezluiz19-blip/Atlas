// The messages on this device, and the servers' copy when they're on. Sending always keeps a copy here; it
// goes to Terreno's servers too when you're signed in to them, and is marked "sent". Messages to example people
// (and anything sent while the servers are off) stay on this device, and the thread says so.
import { cloudOn } from "../cloud/client";
import { fetchMessagesRemote, live, markReadRemote, sendMessageRemote } from "../cloud/sync";
import { cleanText, thread, unread, type Message } from "./presence";

const KEY = "atlas.messages.v1";
const listeners = new Set<() => void>();

function load(): Message[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Message[];
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.text === "string" && typeof m.from === "string" && typeof m.to === "string") : [];
  } catch { return []; }
}
function save(all: Message[]) {
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-2000))); } catch { /* storage full: keep what's on screen */ }
  listeners.forEach((fn) => fn());
}

/** Runs fn whenever messages change; returns the way to stop. */
export const onMessages = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export const conversation = (me: string, them: string) => thread(load(), me, them);
export const unreadFor = (me: string) => unread(load(), me);

/** Sends a message: kept here, and on the servers when they're on. */
export async function send(from: string, to: string, text: string, opts: { example?: boolean } = {}): Promise<Message | null> {
  const t = cleanText(text);
  if (!t) return null;
  const m: Message = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, from, to, text: t, at: new Date().toISOString(), via: "device", read: true };
  save([...load(), m]);
  if (!opts.example && live()) {
    try {
      if (await sendMessageRemote(m)) save(load().map((x) => (x.id === m.id ? { ...x, via: "sent" } : x)));
    } catch { /* stays on this device; the thread shows it */ }
  }
  return m;
}

/** Fetches your conversations from the servers and merges them in. */
export async function refresh(me: string): Promise<void> {
  if (!live()) return;
  const remote = await fetchMessagesRemote(me).catch(() => []);
  if (!remote.length) return;
  const byId = new Map(load().map((m) => [m.id, m]));
  for (const m of remote) byId.set(m.id, { ...byId.get(m.id), ...m });
  save([...byId.values()]);
}

/** Marks a conversation read, here and on the servers. */
export function markRead(me: string, them: string) {
  const all = load();
  if (!all.some((m) => m.to === me && m.from === them && !m.read)) return;
  save(all.map((m) => (m.to === me && m.from === them ? { ...m, read: true } : m)));
  void markReadRemote(me, them);
}

/** Whether messages can reach other people right now (the servers are on and you're signed in to them). */
export const canDeliver = () => cloudOn() && live();
