// Terreno's pictograms: the stage icons, drawn the way a new set of road and wayfinding signs would be. Each
// is a plain, solid silhouette in ink with one accent in clay (a beam, a sign, a stripe, a sun), on the same
// 100-unit grid with the same weight, so a row of four reads as one family. Simple enough to read at a glance,
// a little crafted so they feel like a set of prints rather than system icons. Colours come from CSS (--pg-ink,
// --pg-accent, --pg-paper) so night turns the ink light. Used by the stages (stage.ts).

const pg = (body: string) => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;
const K = "var(--pg-ink)", A = "var(--pg-accent)", P = "var(--pg-paper)";
/** A stroke in the set's weight. */
const line = (d: string, c = K, w = 10) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export const ART: Record<string, string> = {
  // ---- Getting around ----
  navigate: pg(`<path d="M14 46 86 14 54 86 46 54z" fill="${K}"/><path d="M46 54 86 14 54 86z" fill="${A}"/>`),
  walk: pg(`<circle cx="57" cy="14" r="9" fill="${K}"/>${line("M52 30 44 56 58 70 62 92")}${line("M44 56 32 90")}${line("M50 32 34 46 28 60", K, 8)}${line("M53 34 64 48 76 52", K, 8)}<rect x="14" y="94" width="72" height="5" rx="2.5" fill="${A}"/>`),
  drive: pg(`<path d="M8 66v-8c0-4 2-6 6-7l10-3 10-14c2-3 5-4 8-4h22c3 0 6 1 8 4l9 13 9 2c3 1 4 3 4 6v11z" fill="${K}"/><path d="M38 38h12v10H31zM56 38h10l7 10H56z" fill="${P}"/><circle cx="27" cy="68" r="10" fill="${K}" stroke="${P}" stroke-width="4"/><circle cx="73" cy="68" r="10" fill="${K}" stroke="${P}" stroke-width="4"/><path d="M92 54 100 50v12z" fill="${A}"/>`),
  train: pg(`<rect x="22" y="8" width="56" height="70" rx="12" fill="${K}"/><rect x="30" y="18" width="40" height="22" rx="4" fill="${P}"/><rect x="22" y="46" width="56" height="7" fill="${A}"/><circle cx="34" cy="66" r="5" fill="${P}"/><circle cx="66" cy="66" r="5" fill="${P}"/>${line("M34 80 22 96", K, 8)}${line("M66 80 78 96", K, 8)}`),
  taxi: pg(`<rect x="36" y="16" width="28" height="12" rx="3" fill="${A}"/><path d="M8 72v-10c0-4 2-6 6-7l10-3 10-14c2-3 5-4 8-4h16c3 0 6 1 8 4l10 14 10 3c4 1 6 3 6 7v10z" fill="${K}"/><path d="M38 42h10v10H31zM54 42h8l7 10H54z" fill="${P}"/><circle cx="27" cy="74" r="10" fill="${K}" stroke="${P}" stroke-width="4"/><circle cx="73" cy="74" r="10" fill="${K}" stroke="${P}" stroke-width="4"/>`),
  bike: pg(`<circle cx="24" cy="66" r="17" fill="none" stroke="${K}" stroke-width="8"/><circle cx="76" cy="66" r="17" fill="none" stroke="${K}" stroke-width="8"/>${line("M24 66 42 38h24l10 28M42 38 54 66h-6", K, 8)}${line("M36 30h12", A, 8)}${line("M62 26h8", K, 8)}`),
  fly: pg(`<path d="M50 6c4 0 6 4 6 9v22l34 20v9l-34-10v18l10 8v7l-16-5-16 5v-7l10-8V56L10 66v-9l34-20V15c0-5 2-9 6-9z" fill="${K}"/><rect x="44" y="92" width="12" height="5" rx="2.5" fill="${A}"/>`),
  guide: pg(`<circle cx="50" cy="50" r="40" fill="none" stroke="${K}" stroke-width="8"/><path d="M50 16 64 62 50 54 36 62z" fill="${A}"/>`),

  // ---- Looking for ----
  search: pg(`<circle cx="42" cy="42" r="26" fill="none" stroke="${K}" stroke-width="10"/>${line("M62 62 88 88", K, 12)}<circle cx="42" cy="42" r="8" fill="${A}"/>`),
  food: pg(`${line("M30 10v26M22 10v18c0 6 4 10 8 10s8-4 8-10V10", K, 7)}${line("M30 38v52", K, 9)}<path d="M64 10c10 4 14 18 14 32v6H66v42" fill="none" stroke="${K}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="94" width="76" height="5" rx="2.5" fill="${A}"/>`),
  coffee: pg(`${line("M34 8c-6 8 6 12 0 20M52 8c-6 8 6 12 0 20", A, 6)}<path d="M14 36h60v24c0 16-12 28-28 28h-4C26 88 14 76 14 60z" fill="${K}"/><path d="M74 44h4c8 0 12 5 12 11s-4 11-12 11h-6" fill="none" stroke="${K}" stroke-width="8"/>`),
  parks: pg(`<circle cx="76" cy="20" r="11" fill="${A}"/><path d="M40 10 66 62H50l14 22H16l14-22H14z" fill="${K}"/><rect x="36" y="80" width="8" height="16" fill="${K}"/>`),
  stay: pg(`<rect x="8" y="22" width="8" height="70" rx="3" fill="${K}"/><rect x="8" y="58" width="84" height="14" fill="${K}"/><rect x="84" y="58" width="8" height="34" rx="3" fill="${K}"/><rect x="20" y="42" width="22" height="14" rx="6" fill="${A}"/><rect x="46" y="40" width="46" height="16" rx="6" fill="${K}"/>`),
  shops: pg(`<path d="M18 34h64l-6 56H24z" fill="${K}"/>${line("M36 34c0-14 6-22 14-22s14 8 14 22", K, 7)}<rect x="30" y="52" width="40" height="7" fill="${A}"/>`),
  fuel: pg(`<rect x="14" y="12" width="44" height="80" rx="6" fill="${K}"/><rect x="22" y="22" width="28" height="20" rx="3" fill="${P}"/>${line("M58 40 74 50v26a6 6 0 0 0 12 0V44L74 32", K, 7)}<rect x="22" y="22" width="28" height="7" fill="${A}"/>`),

  // ---- You ----
  me: pg(`<circle cx="50" cy="28" r="17" fill="${K}"/><path d="M16 92c0-22 15-36 34-36s34 14 34 36z" fill="${K}"/><circle cx="74" cy="64" r="9" fill="${A}"/>`),
  person: pg(`<circle cx="50" cy="28" r="17" fill="${K}"/><path d="M16 92c0-22 15-36 34-36s34 14 34 36z" fill="${K}"/><rect x="40" y="62" width="20" height="6" rx="3" fill="${A}"/>`),
  note: pg(`<path d="M20 10h44l16 16v64H20z" fill="${K}"/><path d="M64 10v16h16z" fill="${P}"/><rect x="30" y="40" width="38" height="6" rx="3" fill="${P}"/><rect x="30" y="54" width="28" height="6" rx="3" fill="${P}"/><rect x="30" y="68" width="34" height="6" rx="3" fill="${A}"/>`),
  home: pg(`<path d="M50 10 92 46H80v44H20V46H8z" fill="${K}"/><rect x="42" y="62" width="16" height="28" fill="${A}"/>`),
  bell: pg(`<path d="M50 10c16 0 26 12 26 28v20l10 14H14l10-14V38c0-16 10-28 26-28z" fill="${K}"/><circle cx="50" cy="84" r="9" fill="${A}"/>`),
  door: pg(`<rect x="38" y="8" width="48" height="86" rx="4" fill="${K}"/><circle cx="74" cy="54" r="5" fill="${P}"/>${line("M8 51h26", A, 9)}<path d="M28 39 44 51 28 63z" fill="${A}"/>`),
  flag: pg(`<rect x="20" y="8" width="8" height="86" rx="3" fill="${K}"/><path d="M28 12h56L70 30l14 18H28z" fill="${A}"/>`),

  // ---- Everything else ----
  more: pg(`<rect x="42" y="12" width="16" height="76" rx="8" fill="${K}"/><rect x="12" y="42" width="76" height="16" rx="8" fill="${A}"/>`),
  explore: pg(`<circle cx="50" cy="50" r="40" fill="${K}"/><path d="M50 18 60 50H40z" fill="${A}"/><path d="M50 82 60 50H40z" fill="${P}"/>`),
  create: pg(`<path d="M18 82 26 58 66 18l16 16-40 40z" fill="${K}"/><path d="M66 18 74 10l16 16-8 8z" fill="${A}"/><rect x="12" y="88" width="76" height="5" rx="2.5" fill="${K}"/>`),
  work: pg(`<path d="M38 26v-8h24v8" fill="none" stroke="${K}" stroke-width="7"/><rect x="10" y="26" width="80" height="62" rx="8" fill="${K}"/><rect x="10" y="50" width="80" height="8" fill="${A}"/>`),
  views: pg(`<path d="M50 10 90 30 50 50 10 30z" fill="${K}"/>${line("M10 50 50 70 90 50", K, 8)}${line("M10 70 50 90 90 70", A, 8)}`),
};
