// No borrowed emoji anywhere in Terreno. A phone's emoji never match the type, the palette or each other, so
// every one that reaches the page (from code, data or a service) becomes Terreno's own icon as it arrives:
// the matching line icon in the text's colour, a country's two letters for a flag, or a tessera for anything
// else. Tooltips and labels lose theirs. What people type themselves (fields, editable text, anything marked
// data-keep-emoji) is left as they wrote it.
import { anyIconHtml, EMOJI_RE, isEmoji, svgOf, SYMBOL_ICON, symbolLead } from "./glyph";

const SKIP = "input, textarea, [contenteditable=''], [contenteditable='true'], [data-keep-emoji], script, style, svg, .gx, title";
const MAYBE = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;
const SYMBOL = /^\s*(◎|♡|♥|▶|❚❚|⑂|⌕|☰|↺|⟲|✈|⏱)(\s|$)/u;
const ATTRS = ["title", "aria-label", "placeholder", "alt"];

/** Text with its emoji taken out, for tooltips and labels (pure). */
export function withoutEmoji(text: string): string {
  if (!MAYBE.test(text)) return text;
  return text.replace(EMOJI_RE, (m) => (isEmoji(m) ? "" : m)).replace(/\s{2,}/g, " ").trim();
}

/** "▶ Play", "◎ Hologram", a lone "▶": a symbol standing in for an icon at the start of a control's label. */
function fixSymbol(node: Text): boolean {
  const lead = symbolLead(node.data);
  const parent = node.parentElement;
  if (!lead || !parent || parent.closest(SKIP) || node.previousSibling) return false;
  const icon = document.createElement("span");
  icon.className = "gx";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = svgOf(SYMBOL_ICON[lead[0]], 16);
  node.replaceWith(icon, lead[1].replace(/^\s+/, ""));
  return true;
}

function fixText(node: Text) {
  const t = node.data;
  if (SYMBOL.test(t) && fixSymbol(node)) return;
  if (!MAYBE.test(t)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const frag = document.createDocumentFragment();
  let last = 0, changed = false;
  for (const m of t.matchAll(EMOJI_RE)) {
    if (!isEmoji(m[0])) continue;
    changed = true;
    frag.append(t.slice(last, m.index));
    const icon = document.createElement("span");
    icon.className = "gx";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = anyIconHtml(m[0], 16);
    frag.append(icon);
    last = m.index! + m[0].length;
  }
  if (!changed) return;
  frag.append(t.slice(last));
  node.replaceWith(frag);
}

function fixAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && MAYBE.test(v) && !el.closest("[data-keep-emoji]")) el.setAttribute(a, withoutEmoji(v));
  }
}

function sweep(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { fixText(root as Text); return; }
  if (!(root instanceof Element) || root.closest("[data-keep-emoji]")) return;
  fixAttrs(root);
  const texts: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (MAYBE.test((n as Text).data) || SYMBOL.test((n as Text).data)) texts.push(n as Text);
  texts.forEach(fixText);
  root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")).forEach(fixAttrs);
}

/** Watches the page and turns emoji into Terreno's icons as they appear. */
export function installEmojiGuard(root: HTMLElement = document.body): () => void {
  sweep(root);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") fixText(m.target as Text);
      else if (m.type === "attributes") fixAttrs(m.target as Element);
      else m.addedNodes.forEach(sweep);
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => mo.disconnect();
}
