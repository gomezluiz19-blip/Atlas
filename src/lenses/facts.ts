// "Worth knowing" about the feature being looked at, from the bundled facts.
import { featureFor, type Feature, type FeatureKind } from "../content/features";
import { h } from "../ui/dom";
import type { Subject, SubjectKind } from "./types";

/** Which facts suit a kind of subject, and how far away they can be. */
const FOR: Partial<Record<SubjectKind, { kinds: FeatureKind[]; km: number }>> = {
  peak: { kinds: ["peak", "volcano"], km: 12 },
  volcano: { kinds: ["volcano", "peak"], km: 20 },
  range: { kinds: ["peak", "volcano"], km: 0 },
  crater: { kinds: ["crater", "volcano"], km: 25 },
  river: { kinds: ["river"], km: 0 },
  sea: { kinds: ["deep"], km: 400 },
  coast: { kinds: ["deep"], km: 0 },
  forest: { kinds: ["forest"], km: 60 },
  city: { kinds: ["metro"], km: 30 },
  lake: { kinds: ["crater", "volcano", "river"], km: 5 },
  land: { kinds: ["crater", "peak", "volcano", "forest"], km: 5 },
  canyon: { kinds: ["river"], km: 0 },
  island: { kinds: ["volcano"], km: 25 },
  glacier: { kinds: ["peak", "volcano"], km: 15 },
  desert: { kinds: ["crater"], km: 15 },
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
