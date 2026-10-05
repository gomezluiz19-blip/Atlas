// The line between the TV and the phone that drives it.
//   - Two tabs in one browser talk directly (BroadcastChannel).
//   - Two devices meet through ntfy.sh, a free public relay, just long enough
//     to open a direct WebRTC channel between them; after that every drag of
//     the orb goes phone → TV directly, quickly and without limits. If the
//     direct channel can't open, everything still goes through the relay,
//     with dragging thinned out (the relay limits how often it can be used).
// Messages carry an id, so one that arrives two ways is acted on once (so no message uses `id` for its own payload).
// The code on the TV is the channel; anyone with it can drive that TV (fine
// for a demo; Supabase Realtime with a pairing token later, see docs/tv.md).
import { splitText } from "./rooms";

export type Cmd = { id?: string } & (
  | { t: "fly"; q: string } | { t: "type"; q: string } | { t: "pick"; i: number } | { t: "search"; open: boolean }
  | { t: "scene"; scene: string } | { t: "lens"; lens: string }
  | { t: "pan"; dx: number; dy: number } | { t: "zoom"; f: number }
  // Two fingers: turn the view around what's in the middle (radians), and tilt toward the horizon.
  | { t: "orbit"; turn: number; tilt: number }
  // A place handed over from Terreno on the phone: show it on the TV.
  | { t: "goto"; lon: number; lat: number; title: string; sub?: string } | { t: "dpad"; dir: "up" | "down" | "left" | "right" }
  | { t: "select" } | { t: "back" } | { t: "menu" }
  | { t: "holo" } | { t: "wind" } | { t: "next" } | { t: "exit" } | { t: "hello" } | { t: "ping" }
  | { t: "set"; value: string; done?: boolean }
  | { t: "trip"; to: string; from?: string; depart?: string; back?: string; people?: number }
  | { t: "rtc-offer"; sdp: string }
  // Rooms and their tools.
  | { t: "room"; room: string } | { t: "tool"; tool: string; arg?: string }
  // Pointer, spotlight and pen: where the thumb is on the phone's pad, 0–1 across and down.
  | { t: "point"; x: number; y: number; down?: boolean } | { t: "point-end" }
  | { t: "timer"; seconds: number } | { t: "slide"; dir: 1 | -1 } | { t: "quiz"; act: "reveal" | "next" | "prev" | "end" }
  // Things the phone hands the TV from its own Terreno: sites, a lesson, a quiz.
  | { t: "share"; kind: "sites" | "deck" | "quiz"; data: unknown }
  // A long message in pieces, for the relay.
  | { t: "part"; key: string; i: number; n: number; data: string });
export interface ToolItem { id: string; icon: string; label: string; about?: string }
export type State = { id?: string } & (
  | { t: "state"; scene: string; title: string; sub?: string }
  | { t: "suggest"; q: string; items: string[]; focus: number }
  | { t: "input"; kind: "text" | "date" | "number" | "time"; label: string; value: string }
  | { t: "form"; kind: "trip" }
  | { t: "rtc-answer"; sdp: string }
  | { t: "tools"; room: string; label: string; items: ToolItem[]; mode: string | null; rooms: { id: string; icon: string; label: string; who: string }[]; decks: { id: string; name: string }[]; quizzes: { id: string; name: string }[] }
  | { t: "present"; deck: string; i: number; n: number; title: string; notes: string; next: string }
  | { t: "quiz"; title: string; i: number; n: number; prompt: string; answer: string; revealed: boolean; ends: number }
  | { t: "panel"; kind: "none" }
  // Where the TV's camera is (sent when it settles), for the remote's readouts and "open here".
  | { t: "cam"; lon: number; lat: number; alt: number; heading: number; pitch: number }
  // What the TV is passing as it flies (the wayfinder's card), for the phone to keep.
  | { t: "passing"; name: string; line: string; kind: string; color: string; lon: number; lat: number; where: string });

const RELAY = "https://ntfy.sh";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];

/** A short code that's easy to read off a TV and type on a phone (pure given `rnd`). */
export function newCode(rnd: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join("");
}
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const topic = (code: string, dir: "cmd" | "state") => `atlas-tv-${code.toLowerCase()}-${dir}`;
const newId = () => Math.random().toString(36).slice(2, 10);

/** The remote's address for a code, next to the app (pure). */
export const remoteUrl = (code: string, base = location.href) => new URL(`remote.html#${code}`, base.replace(/#.*$/, "")).href;

/** Remembers recent message ids, so a message heard twice is handled once. */
function deduper(max = 300) {
  const seen = new Set<string>(), order: string[] = [];
  return (id?: string) => {
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id); order.push(id);
    if (order.length > max) seen.delete(order.shift()!);
    return true;
  };
}

/** Listens on a code's channel (same browser and relay); returns a function that stops listening. */
export function listen<T extends { id?: string }>(code: string, dir: "cmd" | "state", on: (msg: T) => void): () => void {
  const fresh = deduper();
  const take = (m: T) => { if (fresh(m.id)) on(m); };
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(topic(code, dir)) : null;
  if (bc) bc.onmessage = (e) => take(e.data as T);
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${RELAY}/${topic(code, dir)}/sse`);
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as { event?: string; message?: string };
        if (m.event === "message" && m.message) take(JSON.parse(m.message) as T);
      } catch { /* not ours */ }
    };
  } catch { /* no relay: same-browser only */ }
  return () => { bc?.close(); es?.close(); };
}

/** Sends on a code's channel, both ways at once (an id lets the far end ignore the second copy). */
export function send(code: string, dir: "cmd" | "state", msg: Cmd | State) {
  const m = { ...msg, id: msg.id ?? newId() };
  try { const bc = new BroadcastChannel(topic(code, dir)); bc.postMessage(m); bc.close(); } catch { /* old browser */ }
  void fetch(`${RELAY}/${topic(code, dir)}`, { method: "POST", body: JSON.stringify(m) }).catch(() => {});
}

/** Waits for the connection's addresses to be gathered (or gives up after a moment: good enough on one network). */
const gathered = (pc: RTCPeerConnection, ms = 2500) => new Promise<void>((done) => {
  if (pc.iceGatheringState === "complete") { done(); return; }
  const t = setTimeout(done, ms);
  pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); done(); } });
});

/** The TV side: answers a phone's offer and hands every message on the direct channel to `on`. */
export function hostDirect(code: string, offerSdp: string, on: (c: Cmd) => void): () => void {
  if (typeof RTCPeerConnection === "undefined") return () => {};
  const pc = new RTCPeerConnection({ iceServers: STUN });
  pc.ondatachannel = (e) => { e.channel.onmessage = (m) => { try { on(JSON.parse(m.data as string) as Cmd); } catch { /* not ours */ } }; };
  void (async () => {
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    send(code, "state", { t: "rtc-answer", sdp: pc.localDescription!.sdp });
  })().catch(() => pc.close());
  return () => pc.close();
}

/**
 * The phone side: one function to send anything. It opens a direct channel to the TV when it
 * can; until then (or if it can't) it uses the relay, sending drags at most a few times a second.
 */
export function joinTv(code: string, onState: (s: State) => void) {
  let channel: RTCDataChannel | null = null;
  let pending: { dx: number; dy: number; f: number; turn: number; tilt: number; point?: Cmd } | null = null, lastSlow = 0, slowTimer = 0;
  const stop = listen<State>(code, "state", (s) => {
    if (s.t === "rtc-answer") { void pc?.setRemoteDescription({ type: "answer", sdp: s.sdp }).catch(() => {}); return; }
    onState(s);
  });
  let pc: RTCPeerConnection | null = null;
  if (typeof RTCPeerConnection !== "undefined") {
    pc = new RTCPeerConnection({ iceServers: STUN });
    const ch = pc.createDataChannel("atlas", { ordered: true });
    ch.onopen = () => { channel = ch; };
    ch.onclose = () => { channel = null; };
    void (async () => {
      await pc!.setLocalDescription(await pc!.createOffer());
      await gathered(pc!);
      send(code, "cmd", { t: "rtc-offer", sdp: pc!.localDescription!.sdp });
    })().catch(() => {});
  }
  /** Drags and pinches, thinned to what the relay allows when there's no direct channel. */
  const flushSlow = () => {
    if (!pending) return;
    const p = pending; pending = null; lastSlow = Date.now();
    // Relay only: the same-browser copy already went straight through.
    const relay = (m: Cmd) => void fetch(`${RELAY}/${topic(code, "cmd")}`, { method: "POST", body: JSON.stringify({ ...m, id: newId() }) }).catch(() => {});
    if (p.dx || p.dy) relay({ t: "pan", dx: p.dx, dy: p.dy });
    if (p.f !== 1) relay({ t: "zoom", f: p.f });
    if (p.turn || p.tilt) relay({ t: "orbit", turn: p.turn, tilt: p.tilt });
    if (p.point) relay(p.point);
  };
  const sameBrowser = (m: Cmd) => { try { const bc = new BroadcastChannel(topic(code, "cmd")); bc.postMessage({ ...m, id: newId() }); bc.close(); } catch { /* old browser */ } };
  return {
    get direct() { return !!channel; },
    send(c: Cmd) {
      if (channel?.readyState === "open") { channel.send(JSON.stringify({ ...c, id: newId() })); return; }
      if (c.t === "pan" || c.t === "zoom" || c.t === "orbit" || (c.t === "point" && !c.down)) {
        // Same browser: straight through. Across devices: gathered up and sent every 400 ms.
        sameBrowser(c);
        pending ??= { dx: 0, dy: 0, f: 1, turn: 0, tilt: 0 };
        if (c.t === "pan") { pending.dx += c.dx; pending.dy += c.dy; } else if (c.t === "zoom") pending.f *= c.f;
        else if (c.t === "orbit") { pending.turn += c.turn; pending.tilt += c.tilt; } else pending.point = c;
        clearTimeout(slowTimer);
        slowTimer = window.setTimeout(flushSlow, Math.max(0, 400 - (Date.now() - lastSlow)));
        return;
      }
      // Big things (a lesson, a quiz, a fleet of sites) go through the relay in pieces.
      const text = JSON.stringify(c);
      if (text.length > 3000) {
        const parts = splitText(text), key = newId();
        parts.forEach((data, i) => send(code, "cmd", { t: "part", key, i, n: parts.length, data }));
        return;
      }
      send(code, "cmd", c);
    },
    close() { stop(); pc?.close(); },
  };
}
