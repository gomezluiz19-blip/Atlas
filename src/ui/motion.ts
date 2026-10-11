// Terreno's motion, in one place (docs/design.md › Motion). The map leads and the rest follows; things morph
// rather than pop; the marks of the brand (registration ticks, hairlines, mono figures, pigments) arrive with
// a little life. One easing curve, three durations, one stagger step, the same on every screen (slower on a TV),
// and all of it a quick fade when someone has asked their system for less motion.
import { CallbackProperty, type ImageryLayer, type Viewer } from "cesium";

/** Durations in milliseconds; CSS reads the same numbers from :root (--t-quick, --t-move, --t-arrive). */
export const T = { quick: 140, move: 320, arrive: 600, stagger: 40 } as const;

/** Whether the person has asked for less motion. */
export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How much slower things move on this screen (a TV, read across a room, takes it at 1.5×). */
const pace = () => (typeof document !== "undefined" && document.body?.classList.contains("tv-mode") ? 1.5 : 1);

/** A cubic Bézier easing, as CSS defines it, for motion that isn't CSS (the camera, the globe) (pure). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t, dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) { const e = x(t) - p, d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return y(Math.min(1, Math.max(0, t)));
  };
}

/** The house curve: quick to leave, long to settle (the same as --ease-settle). */
export const settle = bezier(0.2, 0.7, 0.1, 1);
/** For things rising into view and the camera's flights: gentle at both ends (--ease-lift). */
export const lift = bezier(0.45, 0, 0.15, 1);

/**
 * Changes the page as one smooth morph where the browser can (View Transitions): elements that share a
 * `view-transition-name` before and after glide from one to the other. Elsewhere, or with less motion asked
 * for, the change simply happens.
 */
export function morph(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (reduced() || !doc.startViewTransition || document.hidden) { update(); return; }
  try { doc.startViewTransition(update); } catch { update(); }
}

/**
 * One element becomes another: `from` is snapshotted, `update` runs, and `to` grows out of where `from` was
 * (the ＋ button into its menu, Navigate into its panel). Without View Transitions it simply happens.
 */
export function morphBetween(from: HTMLElement, to: () => HTMLElement, name: string, update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (reduced() || !doc.startViewTransition || document.hidden) { update(); return; }
  from.style.setProperty("view-transition-name", name);
  let t: { finished: Promise<void> };
  try {
    t = doc.startViewTransition(() => { from.style.removeProperty("view-transition-name"); update(); to().style.setProperty("view-transition-name", name); });
  } catch { from.style.removeProperty("view-transition-name"); update(); return; }
  void t.finished.catch(() => {}).finally(() => to().style.removeProperty("view-transition-name"));
}

/** Gives a container's children their place in a staggered entrance (CSS reads --i). */
export function stagger(el: Element, from = 0): void {
  let i = from;
  for (const c of el.children) if (c instanceof HTMLElement) c.style.setProperty("--i", String(Math.min(i++, 12)));
}

// ---- Figures that count up -----------------------------------------------------------------------

/** Numbers in a text worth counting: not years, times, dates or ranges' second halves (pure). */
export function countable(text: string): { start: number; end: number; value: number; decimals: number }[] {
  const out: { start: number; end: number; value: number; decimals: number }[] = [];
  for (const m of text.matchAll(/(?<![\d:.\-–/])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d:])|(?<![\d:.\-–/])\d+(?:\.\d+)?(?![\d:/])/g)) {
    const raw = m[0], value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 2) continue;
    if (!raw.includes(",") && !raw.includes(".") && value >= 1900 && value <= 2100) continue; // a year
    out.push({ start: m.index!, end: m.index! + raw.length, value, decimals: raw.includes(".") ? raw.split(".")[1].length : 0 });
  }
  return out;
}

const fmt = (v: number, decimals: number, grouped: boolean) =>
  grouped ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);

/** Counts the figures in an element's text up from zero, keeping their format; the text ends exactly as written. */
export function countUp(el: HTMLElement, ms = T.arrive): void {
  if (reduced() || el.dataset.counted) return;
  // Folded away: it counts when the card opens, where someone can see it.
  if (el.closest(".sheet.collapsed")) return;
  el.dataset.counted = "1";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const jobs: { node: Text; text: string; nums: ReturnType<typeof countable> }[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "", nums = countable(text);
    if (nums.length) jobs.push({ node: n as Text, text, nums });
  }
  if (!jobs.length) return;
  const t0 = performance.now(), dur = ms * pace();
  const shown = new Map<Text, string>();
  const frame = (now: number) => {
    const k = settle(Math.min(1, (now - t0) / dur));
    for (const j of jobs) {
      // Someone else changed the text meanwhile: theirs stands.
      if (shown.has(j.node) && j.node.textContent !== shown.get(j.node)) continue;
      let s = "", at = 0;
      for (const x of j.nums) { s += j.text.slice(at, x.start) + fmt(x.value * k, x.decimals, j.text.slice(x.start, x.end).includes(",")); at = x.end; }
      const out = k < 1 ? s + j.text.slice(at) : j.text;
      j.node.textContent = out;
      shown.set(j.node, out);
    }
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** The figures that count up when they appear: insights' headlines and the big mono numbers. */
const FIGURES = ".bf-title, .bf-mono, .hero-value, .stat-value, .callout-value, .pp-value, .po-kpi strong";

/** Sets whose pieces arrive one after another: the hours, the mosaic, the faces, the countries. */
const SETS = ".bf-ribbon, .bf-mosaic, .bf-faces, .bf-countries-list, .plus-row, .plus-tools, .nav-hits, .vn-getting";

/** As things arrive anywhere under `root`: figures count up (once each) and sets stagger in. */
export function watchMotion(root: HTMLElement): void {
  const scan = (n: Node) => {
    if (!(n instanceof HTMLElement)) return;
    if (n.matches(FIGURES)) countUp(n);
    n.querySelectorAll<HTMLElement>(FIGURES).forEach((e) => countUp(e));
    if (n.matches(SETS)) stagger(n);
    n.querySelectorAll(SETS).forEach((e) => stagger(e));
    if (n.parentElement?.matches(SETS)) stagger(n.parentElement);
  };
  new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach(scan);
      // The card opening: what it holds counts up now.
      if (m.type === "attributes" && m.target instanceof HTMLElement && m.target.matches(".sheet:not(.collapsed)")) scan(m.target);
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

// ---- The globe ------------------------------------------------------------------------------------

/** A layer fades up to its opacity instead of appearing at once. */
export function fadeIn(viewer: Viewer, layer: ImageryLayer, ms = T.arrive): void {
  const target = layer.alpha;
  if (reduced()) return;
  layer.alpha = 0;
  const t0 = performance.now(), dur = ms * pace();
  const frame = (now: number) => {
    if (layer.isDestroyed()) return;
    const k = settle(Math.min(1, (now - t0) / dur));
    layer.alpha = target * k;
    viewer.scene.requestRender();
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** A marker's scale that grows from nothing, the `i`th of a set a beat after the one before. */
export function dropIn(viewer: Viewer, i: number, scale = 1): CallbackProperty | number {
  if (reduced()) return scale;
  const t0 = performance.now() + i * T.stagger * 2 * pace(), dur = T.arrive * pace();
  let done = false;
  return new CallbackProperty(() => {
    if (done) return scale;
    const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur));
    if (k >= 1) done = true; else viewer.scene.requestRender();
    // A touch past full size, then settling: the marker lands.
    return scale * (k < 1 ? lift(k) * (1 + 0.12 * Math.sin(Math.PI * k)) : 1);
  }, false);
}
