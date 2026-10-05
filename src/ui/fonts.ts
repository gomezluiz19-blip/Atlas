// The house typeface. Terreno is set in Axiforma (a licensed face by Kastelov): Axiforma Heavy for the
// wordmark, Axiforma for everything else, heavier where it matters. Licensed font files dropped into
// public/fonts/ are served with the site; a machine with Axiforma installed uses its own copy; anyone else
// gets Plus Jakarta Sans, the nearest open face (geometric, wide, a two-storey a), from Google Fonts.
// Pure, so the build (vite.config.ts) and the tests can both call it.

/** The weights Terreno uses, and the file stem Kastelov ships each one as. */
export const AXIFORMA_WEIGHTS: [weight: number, stem: string][] = [
  [400, "Regular"], [500, "Medium"], [600, "SemiBold"], [700, "Bold"], [800, "Heavy"],
];
/** The families the CSS names, our own so a fallback never borrows the wrong weight. */
export const FAMILY = "Terreno Sans";

/**
 * @font-face rules for Axiforma. `has(file)` says whether a licensed file is in public/fonts; without one
 * only local() is tried, so a missing licence costs no network request (and no 404).
 */
export function axiformaFaces(has: (file: string) => boolean, base = "/fonts/"): string {
  return AXIFORMA_WEIGHTS.map(([w, stem]) => {
    const local = [`local("Axiforma ${stem}")`, `local("Axiforma-${stem}")`];
    if (stem === "Regular") local.push(`local("Axiforma")`);
    const files = [["woff2", "woff2"], ["woff", "woff"], ["otf", "opentype"]]
      .filter(([ext]) => has(`Axiforma-${stem}.${ext}`)).map(([ext, fmt]) => `url("${base}Axiforma-${stem}.${ext}") format("${fmt}")`);
    return `@font-face{font-family:"${FAMILY}";font-style:normal;font-weight:${w};font-display:swap;src:${[...local, ...files].join(",")}}`;
  }).join("\n");
}
