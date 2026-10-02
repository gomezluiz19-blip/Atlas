// The line between the TV and the phone that drives it. Commands go phone →
// TV and the TV says what it's showing back. Two tabs in one browser talk
// directly; two devices go through ntfy.sh, a free public relay (good enough
// for a demo; Supabase Realtime replaces it later, see docs/tv.md). The code
// on the TV's screen is the channel; anyone with it can drive that TV.
export type Cmd =
  | { t: "fly"; q: string }
  | { t: "scene"; id: string }
  | { t: "lens"; id: string }
  | { t: "holo" } | { t: "wind" } | { t: "next" } | { t: "exit" } | { t: "hello" };
export type State = { t: "state"; scene: string; title: string; sub?: string };

const RELAY = "https://ntfy.sh";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short code that's easy to read off a TV and type on a phone (pure given `rnd`). */
export function newCode(rnd: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join("");
}
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const topic = (code: string, dir: "cmd" | "state") => `atlas-tv-${code.toLowerCase()}-${dir}`;

/** The remote's address for a code, next to the app (pure). */
export const remoteUrl = (code: string, base = location.href) => new URL(`remote.html#${code}`, base.replace(/#.*$/, "")).href;

/** Listens on a code's channel; returns a function that stops listening. */
export function listen<T>(code: string, dir: "cmd" | "state", on: (msg: T) => void): () => void {
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(topic(code, dir)) : null;
  if (bc) bc.onmessage = (e) => on(e.data as T);
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${RELAY}/${topic(code, dir)}/sse`);
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as { event?: string; message?: string };
        if (m.event === "message" && m.message) on(JSON.parse(m.message) as T);
      } catch { /* not ours */ }
    };
  } catch { /* no relay: same-browser only */ }
  return () => { bc?.close(); es?.close(); };
}

/** Sends on a code's channel (both ways at once; the receiver may get it twice, which is harmless). */
export function send(code: string, dir: "cmd" | "state", msg: Cmd | State) {
  try { const bc = new BroadcastChannel(topic(code, dir)); bc.postMessage(msg); bc.close(); } catch { /* old browser */ }
  void fetch(`${RELAY}/${topic(code, dir)}`, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
}
