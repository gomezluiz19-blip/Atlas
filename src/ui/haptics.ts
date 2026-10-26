// Touch you can feel: one small vocabulary of haptics used across Terreno, so a tap, a choice, a confirmation
// and a wall each feel the same everywhere. Android (and other browsers with navigator.vibrate) play a pattern;
// iPhone Safari has no vibrate, but toggling a hidden switch input plays the system's selection tick, so that
// stands in. Only on touch screens, and off if the person turns it off (atlas.haptics = "off").

export type Haptic = "tap" | "tick" | "select" | "confirm" | "success" | "warn" | "heavy"
  // The pictograms' own rhythms, played when one is pressed (ui/pictograms.ts › MOTION_HAPTIC).
  | "steps" | "purr" | "chug" | "whoosh" | "bite" | "sip" | "ring" | "swing" | "breath";

/** Each feel as a vibration pattern in ms (pure, so it's tested). */
export const PATTERNS: Record<Haptic, number[]> = {
  tick: [4],
  tap: [8],
  select: [12],
  confirm: [10, 40, 18],
  success: [8, 50, 8, 50, 22],
  warn: [30, 60, 30],
  heavy: [26],
  steps: [10, 110, 10, 110, 10],
  purr: [6, 18, 6, 18, 6, 18, 6, 18, 6],
  chug: [16, 60, 10, 60, 16, 60, 10],
  whoosh: [4, 8, 8, 8, 14, 8, 22],
  bite: [12, 90, 18],
  sip: [30],
  ring: [8, 40, 8, 40, 8, 40, 8],
  swing: [10, 160, 10],
  breath: [20, 140, 12],
};

let iosSwitch: HTMLLabelElement | null = null;
/** The iOS stand-in: a hidden <input switch> whose label, when clicked, makes the Taptic Engine tick. */
function iosTick() {
  if (!iosSwitch) {
    const id = "haptic-switch";
    const input = document.createElement("input");
    input.type = "checkbox"; input.id = id; input.setAttribute("switch", "");
    iosSwitch = document.createElement("label");
    iosSwitch.htmlFor = id;
    for (const el of [input, iosSwitch]) el.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    iosSwitch.setAttribute("aria-hidden", "true"); input.setAttribute("aria-hidden", "true"); input.tabIndex = -1;
    document.body.append(input, iosSwitch);
  }
  iosSwitch.click();
}

const enabled = () => {
  try { if (localStorage.getItem("atlas.haptics") === "off") return false; } catch { /* storage blocked */ }
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
};

export function haptic(kind: Haptic = "tap") {
  if (!enabled()) return;
  try {
    if (typeof navigator.vibrate === "function") { navigator.vibrate(PATTERNS[kind]); return; }
    iosTick();
    // iOS: one tick, or the pattern's beats as ticks for the bigger moments and the pictograms' rhythms.
    const beats = PATTERNS[kind].length > 1 ? Math.ceil(PATTERNS[kind].length / 2) : 1;
    let at = 0;
    for (let i = 1; i < beats; i++) { at += (PATTERNS[kind][i * 2 - 2] ?? 0) + (PATTERNS[kind][i * 2 - 1] ?? 0); setTimeout(iosTick, at); }
  } catch { /* not supported */ }
}

/**
 * Haptics for a whole part of the page at once: any button, link, chip or toggle tapped inside it gives a tap
 * (or the feel named on the element's data-haptic), so new controls get it without wiring.
 */
export function hapticsOn(root: HTMLElement | Document = document) {
  root.addEventListener("pointerdown", (e) => {
    const t = (e as PointerEvent).pointerType === "mouse" ? null : (e.target as HTMLElement | null)?.closest<HTMLElement>("button, a, [role=button], [role=tab], [role=option], label, summary, input[type=range]");
    if (!t || (t as HTMLButtonElement).disabled) return;
    haptic((t.dataset.haptic as Haptic) || (t.matches("[role=tab], [aria-pressed], [aria-selected]") ? "select" : "tap"));
  }, { passive: true });
}
