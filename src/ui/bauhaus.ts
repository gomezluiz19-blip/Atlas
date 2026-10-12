// Terreno's playful icons, after the Bauhaus: each thing drawn from a few plain shapes (a circle, a square, a
// triangle, a bar) in red, yellow, blue and ink, overlapping like a print. No outlines, no tiles, no gradients:
// the shape is the icon. Colours come from CSS (--bh-*), so night inverts the ink. Used by the stages (stage.ts).

const art = (body: string) => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;
const R = "var(--bh-red)", Y = "var(--bh-yellow)", B = "var(--bh-blue)", K = "var(--bh-ink)", G = "var(--bh-green)", P = "var(--bh-paper)";

export const ART: Record<string, string> = {
  // ---- Getting around ----
  navigate: art(`<polygon points="12,46 88,12 54,88 46,54" fill="${B}"/><polygon points="46,54 88,12 54,88" fill="${R}" class="bh-mul"/>`),
  walk: art(`<circle cx="60" cy="16" r="11" fill="${Y}"/><polygon points="44,30 68,30 60,62 38,62" fill="${R}"/><line x1="44" y1="60" x2="28" y2="94" stroke="${K}" stroke-width="10"/><line x1="56" y1="60" x2="74" y2="92" stroke="${K}" stroke-width="10"/><line x1="48" y1="36" x2="26" y2="56" stroke="${B}" stroke-width="8"/>`),
  drive: art(`<path d="M22 50 A28 28 0 0 1 78 50 Z" fill="${Y}"/><rect x="8" y="48" width="84" height="26" rx="3" fill="${B}" class="bh-mul"/><circle cx="28" cy="76" r="11" fill="${K}"/><circle cx="72" cy="76" r="11" fill="${K}"/><rect x="82" y="54" width="10" height="8" fill="${R}"/>`),
  train: art(`<rect x="22" y="12" width="56" height="66" fill="${B}"/><rect x="22" y="22" width="56" height="12" fill="${R}"/><rect x="32" y="40" width="36" height="18" fill="${P}"/><circle cx="34" cy="68" r="6" fill="${Y}"/><circle cx="66" cy="68" r="6" fill="${Y}"/><line x1="32" y1="80" x2="16" y2="98" stroke="${K}" stroke-width="7"/><line x1="68" y1="80" x2="84" y2="98" stroke="${K}" stroke-width="7"/><rect x="20" y="86" width="60" height="5" fill="${K}"/>`),
  taxi: art(`<polygon points="40,46 60,46 50,28" fill="${R}"/><rect x="8" y="44" width="84" height="30" rx="3" fill="${Y}"/><rect x="18" y="54" width="8" height="8" fill="${K}"/><rect x="34" y="54" width="8" height="8" fill="${K}"/><rect x="50" y="54" width="8" height="8" fill="${K}"/><rect x="66" y="54" width="8" height="8" fill="${K}"/><circle cx="28" cy="78" r="10" fill="${K}"/><circle cx="72" cy="78" r="10" fill="${K}"/>`),
  bike: art(`<circle cx="26" cy="66" r="18" fill="none" stroke="${B}" stroke-width="8"/><circle cx="74" cy="66" r="18" fill="none" stroke="${R}" stroke-width="8"/><polyline points="26,66 44,36 66,36 74,66" fill="none" stroke="${K}" stroke-width="7"/><circle cx="44" cy="30" r="7" fill="${Y}"/>`),
  fly: art(`<polygon points="10,58 90,22 60,90 50,62" fill="${B}"/><polygon points="50,62 90,22 30,40" fill="${Y}" class="bh-mul"/><circle cx="22" cy="24" r="8" fill="${R}"/>`),
  guide: art(`<circle cx="50" cy="50" r="38" fill="${Y}"/><polygon points="50,14 62,50 50,44 38,50" fill="${R}"/><polygon points="50,86 62,50 50,56 38,50" fill="${K}"/>`),

  // ---- Looking for ----
  search: art(`<circle cx="42" cy="42" r="28" fill="${Y}"/><circle cx="42" cy="42" r="16" fill="${P}"/><rect x="58" y="62" width="34" height="12" transform="rotate(45 64 66)" fill="${K}"/>`),
  food: art(`<circle cx="42" cy="40" r="12" fill="${Y}"/><path d="M10 50 A40 40 0 0 0 90 50 Z" fill="${R}" class="bh-mul"/><line x1="56" y1="10" x2="78" y2="48" stroke="${K}" stroke-width="6"/><line x1="68" y1="6" x2="88" y2="44" stroke="${K}" stroke-width="6"/>`),
  coffee: art(`<circle cx="36" cy="20" r="8" fill="${Y}"/><circle cx="54" cy="12" r="6" fill="${Y}"/><rect x="18" y="36" width="50" height="46" fill="${B}"/><circle cx="76" cy="56" r="12" fill="none" stroke="${K}" stroke-width="7"/><rect x="10" y="86" width="68" height="7" fill="${R}"/>`),
  parks: art(`<circle cx="72" cy="26" r="16" fill="${Y}"/><polygon points="30,14 54,74 6,74" fill="${G}"/><polygon points="60,40 80,80 40,80" fill="${B}" class="bh-mul"/><rect x="26" y="74" width="8" height="16" fill="${K}"/><rect x="6" y="88" width="88" height="6" fill="${K}"/>`),
  stay: art(`<circle cx="74" cy="22" r="10" fill="${Y}"/><rect x="8" y="50" width="84" height="24" fill="${B}"/><circle cx="26" cy="44" r="12" fill="${R}"/><rect x="44" y="40" width="48" height="14" fill="${Y}" class="bh-mul"/><rect x="8" y="74" width="8" height="16" fill="${K}"/><rect x="84" y="74" width="8" height="16" fill="${K}"/>`),
  shops: art(`<polygon points="12,34 88,34 80,90 20,90" fill="${R}"/><path d="M34 34 A16 16 0 0 1 66 34" fill="none" stroke="${K}" stroke-width="7"/><circle cx="50" cy="62" r="12" fill="${Y}"/>`),
  fuel: art(`<rect x="16" y="18" width="44" height="72" fill="${B}"/><rect x="24" y="28" width="28" height="18" fill="${P}"/><polyline points="60,40 78,52 78,78" fill="none" stroke="${K}" stroke-width="6"/><circle cx="78" cy="84" r="6" fill="${R}"/>`),

  // ---- You ----
  me: art(`<circle cx="50" cy="32" r="18" fill="${R}"/><path d="M14 94 A36 36 0 0 1 86 94 Z" fill="${K}"/><rect x="66" y="58" width="16" height="16" fill="${Y}"/>`),
  person: art(`<circle cx="50" cy="30" r="18" fill="${R}"/><path d="M16 92 A34 34 0 0 1 84 92 Z" fill="${B}"/><rect x="62" y="56" width="18" height="18" fill="${Y}" class="bh-mul"/>`),
  note: art(`<rect x="18" y="14" width="56" height="70" fill="${Y}" transform="rotate(-6 46 49)"/><rect x="28" y="34" width="34" height="5" fill="${K}"/><rect x="28" y="46" width="26" height="5" fill="${K}"/><polygon points="70,30 82,38 52,86 42,88 44,78" fill="${R}"/>`),
  home: art(`<rect x="22" y="44" width="56" height="46" fill="${B}"/><polygon points="12,48 50,12 88,48" fill="${R}" class="bh-mul"/><rect x="44" y="62" width="14" height="28" fill="${Y}"/>`),
  bell: art(`<circle cx="50" cy="16" r="7" fill="${B}"/><path d="M22 66 A28 30 0 0 1 78 66 Z" fill="${Y}"/><rect x="14" y="64" width="72" height="9" fill="${K}"/><circle cx="50" cy="84" r="8" fill="${R}"/>`),
  door: art(`<rect x="34" y="10" width="46" height="82" fill="${B}"/><circle cx="70" cy="54" r="5" fill="${Y}"/><rect x="6" y="48" width="30" height="10" fill="${K}"/><polygon points="30,38 52,53 30,68" fill="${R}" class="bh-mul"/>`),
  flag: art(`<rect x="22" y="10" width="7" height="80" fill="${K}"/><polygon points="29,12 84,28 29,46" fill="${R}"/><circle cx="26" cy="88" r="12" fill="${B}" class="bh-mul"/>`),

  // ---- Everything else ----
  more: art(`<circle cx="50" cy="50" r="40" fill="${B}"/><rect x="44" y="20" width="12" height="60" fill="${Y}"/><rect x="20" y="44" width="60" height="12" fill="${Y}"/>`),
  explore: art(`<circle cx="50" cy="50" r="38" fill="${B}"/><polygon points="50,12 62,50 38,50" fill="${R}"/><polygon points="50,88 62,50 38,50" fill="${K}"/><circle cx="50" cy="50" r="6" fill="${Y}"/>`),
  create: art(`<polygon points="14,86 50,18 86,86" fill="${Y}"/><circle cx="68" cy="38" r="20" fill="${R}" class="bh-mul"/><rect x="10" y="58" width="28" height="28" fill="${K}"/>`),
  work: art(`<rect x="38" y="20" width="24" height="16" fill="none" stroke="${K}" stroke-width="7"/><rect x="10" y="34" width="80" height="52" fill="${K}"/><rect x="10" y="52" width="80" height="10" fill="${B}"/><rect x="44" y="48" width="12" height="18" fill="${Y}"/>`),
  views: art(`<polygon points="50,10 90,30 50,50 10,30" fill="${B}"/><polygon points="50,30 90,50 50,70 10,50" fill="${Y}" class="bh-mul"/><polygon points="50,50 90,70 50,90 10,70" fill="${R}" class="bh-mul"/>`),
};
