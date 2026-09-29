// Small sounds and taps, off by default. Sounds are synthesised (no files):
// a soft two-note chime on arriving somewhere, a low swell for the opening.
// On phones, a light tap of haptic feedback marks the same moments.

const KEY = "atlas.sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ }
  if (on) chime("arrive");
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, gain: number) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + start);
  o.stop(ac.currentTime + start + dur + 0.05);
}

/** A moment's sound (if sound is on) and tap (on phones). */
export function chime(kind: "arrive" | "open" | "surprise") {
  haptic(kind === "open" ? 0 : 8);
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "open") { tone(ctx, 220, 0, 2.4, 0.05); tone(ctx, 330, 0.15, 2.2, 0.035); tone(ctx, 440, 0.3, 2, 0.02); }
    else if (kind === "surprise") { tone(ctx, 784, 0, 0.5, 0.05); tone(ctx, 1047, 0.09, 0.6, 0.045); tone(ctx, 1319, 0.18, 0.8, 0.035); }
    else { tone(ctx, 660, 0, 0.6, 0.05); tone(ctx, 880, 0.1, 0.8, 0.04); }
  } catch { /* no audio */ }
}

export function haptic(ms = 8) {
  if (ms > 0 && matchMedia("(pointer: coarse)").matches) navigator.vibrate?.(ms);
}
