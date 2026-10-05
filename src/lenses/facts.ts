// "Worth knowing" about the feature being looked at, from the bundled facts.
import { featureFor, type Feature, type FeatureKind } from "../content/features";
import { h } from "../ui/dom";
import type { Subject, SubjectKind } from "./types";

/** Which facts suit a kind of subject, and how far away they can be. */
const FOR: Partial<Record<SubjectKind, { kinds: FeatureKind[]; km: number }>> = {
  peak: { kinds: ["peak", "volcano"], km: 12 },
  volcano: { kinds: ["volcano", "peak"], km: 20 },
  range: { kinds: ["range", "peak", "volcano"], km: 0 },
  crater: { kinds: ["crater", "volcano"], km: 25 },
  river: { kinds: ["river", "waterfall", "wetland"], km: 0 },
  sea: { kinds: ["deep", "reef"], km: 400 },
  coast: { kinds: ["reef", "deep", "wetland"], km: 30 },
  forest: { kinds: ["forest"], km: 60 },
  city: { kinds: ["metro"], km: 30 },
  lake: { kinds: ["lake", "waterfall", "crater", "volcano"], km: 20 },
  land: { kinds: ["crater", "peak", "volcano", "forest", "waterfall", "canyon", "cave", "rift", "wetland"], km: 5 },
  canyon: { kinds: ["canyon", "river"], km: 40 },
  island: { kinds: ["island", "volcano", "reef"], km: 25 },
  glacier: { kinds: ["glacier", "peak", "volcano"], km: 15 },
  desert: { kinds: ["desert", "plateau", "crater"], km: 0 },
};

export function factsFor(s: Subject): Feature | undefined {
  const rule = FOR[s.kind];
  if (!rule) return undefined;
  return featureFor({ name: s.name, lon: s.lon, lat: s.lat, kinds: rule.kinds, withinKm: rule.km || undefined })
    // A named feature of any kind (the Thames tapped as "land", a crater tapped as "lake").
    ?? featureFor({ name: s.name, lon: s.lon, lat: s.lat });
}

export function factCard(f: Feature, compact = false): HTMLElement {
  return h("div", { class: "lens-fact" + (compact ? " compact" : "") },
    h("strong", {}, f.name),
    f.blurb ? h("p", {}, f.blurb) : "",
    h("div", { class: "lens-fact-rows" }, ...f.facts.map(([k, v]) => h("span", {}, h("small", {}, k), v))));
}

/** A one-line summary that opens into the full card (for the place card, where space is tight). */
export function factLine(f: Feature): HTMLElement {
  const key = f.facts[0] ? `${f.facts[0][0].toLowerCase()} ${f.facts[0][1]}` : "";
  const d = h("details", { class: "lens-fact-line" },
    h("summary", {}, h("span", { class: "fact-i" }, "i"), h("strong", {}, f.name), key ? h("span", { class: "muted" }, ` · ${key}`) : ""),
    factCard(f));
  return d;
}
