// One pigment per kind of feature, used wherever a kind is drawn: map layers, the wayfinder's ribbon and
// cards, legends. From the data palette in docs/design.md, mid-toned to read on imagery and on paper.
import type { FeatureKind } from "./features";

export const PIGMENT = {
  cobalt: "#3563d6", cerulean: "#4c9ac9", ice: "#a3bfd4", sage: "#5b9467", sap: "#8faa5a", ochre: "#d19a2e", naples: "#e1b843",
  terracotta: "#c4513a", madder: "#b8496a", violet: "#8b5fa8", ultramarine: "#5160c2", umber: "#9a7552", stone: "#8c8f87",
} as const;

const P = PIGMENT;
export const FEATURE_COLOR: Record<FeatureKind, string> = {
  peak: P.umber, range: P.umber, volcano: P.terracotta, rift: P.terracotta, crater: P.stone, canyon: P.ochre, plateau: P.ochre, desert: P.naples,
  river: P.cobalt, lake: P.cerulean, waterfall: P.cerulean, deep: P.ultramarine, glacier: P.ice, reef: P.madder, wetland: P.sap, island: P.sap,
  forest: P.sage, cave: P.violet, metro: P.ultramarine,
};
