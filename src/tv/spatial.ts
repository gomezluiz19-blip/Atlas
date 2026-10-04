// Moving around Terreno's own screens with a remote's arrows, the way a TV
// does: a focus ring sits on one button, link or field at a time, and up,
// down, left, right move it to the nearest thing in that direction. Select
// presses it; back presses the screen's own Back or Close. Works on whatever
// is open: a hologram and its dock, a Work tool's panel, a lens.

const FOCUSABLE = "button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select, textarea, summary, [role=button], .list-row, .holo-orb, .tv-trip";

export type Dir = "up" | "down" | "left" | "right";

/** The screen the remote is driving now (the top-most open one), or null for the globe itself. */
export function activeScope(): HTMLElement | null {
  const pick = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => !e.hidden && e.getClientRects().length > 0) ?? null;
  return pick(".draw-bar") ?? pick(".tv-trips") ?? pick(".work-panel:not([hidden]):not(.tucked)") ?? pick(".lens-panel:not([hidden])") ?? pick(".holo:not(.mini):not(.out)");
}

const visible = (e: HTMLElement) => {
  if (e.closest("[hidden], details:not([open]) > :not(summary)")) return false;
  const r = e.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden";
};

export function candidates(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => visible(e) && !e.closest(".tv-skip"));
}

const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The best next element in a direction (pure over rectangles). */
export function nearest(from: DOMRect, rects: DOMRect[], dir: Dir): number {
  const a = centre(from);
  let best = -1, bestScore = Infinity;
  rects.forEach((r, i) => {
    const b = centre(r), dx = b.x - a.x, dy = b.y - a.y;
    const along = dir === "down" ? dy : dir === "up" ? -dy : dir === "right" ? dx : -dx;
    const across = dir === "down" || dir === "up" ? Math.abs(dx) : Math.abs(dy);
    if (along <= 4) return;
    // Straight ahead beats diagonal: sideways distance counts double.
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

let current: HTMLElement | null = null;
let lastPoint: DOMRect | null = null;

export function clearFocus() { current?.classList.remove("tv-focus"); current = null; }

function setFocus(e: HTMLElement) {
  current?.classList.remove("tv-focus");
  current = e;
  e.classList.add("tv-focus");
  e.focus?.({ preventScroll: true });
  e.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  lastPoint = e.getBoundingClientRect();
}

/** Puts the focus somewhere sensible on a screen that's just opened (or after its contents changed). */
export function ensureFocus(scope: HTMLElement): HTMLElement | null {
  if (current && scope.contains(current) && visible(current)) return current;
  const all = candidates(scope);
  if (!all.length) { clearFocus(); return null; }
  if (lastPoint) {
    // Nearest to where the focus last was.
    const c = centre(lastPoint);
    all.sort((a, b) => { const p = centre(a.getBoundingClientRect()), q = centre(b.getBoundingClientRect()); return Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y); });
  }
  // Skip a screen's own Close and Back when starting fresh: start on its content.
  const first = lastPoint ? all[0] : all.find((e) => !/close|back/i.test(e.getAttribute("aria-label") ?? e.textContent ?? "")) ?? all[0];
  setFocus(first);
  return first;
}

/** Moves the focus; returns false if there's nothing that way. */
export function move(scope: HTMLElement, dir: Dir): boolean {
  const cur = ensureFocus(scope);
  if (!cur) return false;
  const all = candidates(scope).filter((e) => e !== cur);
  const i = nearest(cur.getBoundingClientRect(), all.map((e) => e.getBoundingClientRect()), dir);
  if (i < 0) {
    // Nothing further that way: scroll the screen a little, so long panels can be read.
    const scroller = scope.querySelector<HTMLElement>(".work-panel") ?? scope;
    if (dir === "down" || dir === "up") scroller.scrollBy({ top: dir === "down" ? 240 : -240, behavior: "smooth" });
    return false;
  }
  setFocus(all[i]);
  return true;
}

export const focused = () => (current && current.isConnected ? current : null);

/** Presses the screen's own Back, or its Close. */
export function back(scope: HTMLElement): boolean {
  const btn = [...scope.querySelectorAll<HTMLElement>("button, [role=button]")].find((b) => visible(b) && /^‹\s*back$/i.test((b.textContent ?? "").trim()))
    ?? [...scope.querySelectorAll<HTMLElement>("button")].find((b) => visible(b) && /^close/i.test(b.getAttribute("aria-label") ?? ""))
    ?? [...scope.querySelectorAll<HTMLElement>("button")].find((b) => visible(b) && (b.textContent ?? "").trim() === "✕");
  if (!btn) return false;
  clearFocus();
  btn.click();
  return true;
}
