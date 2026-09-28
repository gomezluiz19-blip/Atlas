// Lenses: ways of looking at any feature on Earth, designed once and applied
// anywhere. Tap a mountain, sea, river, crater, forest or city and Atlas works
// out what it is, then offers the lenses that suit it.
import type { App } from "../app";

export type SubjectKind =
  | "peak" | "volcano" | "range" | "crater" | "canyon" | "river" | "lake" | "sea" | "coast"
  | "glacier" | "forest" | "desert" | "island" | "city" | "land";

export interface Subject {
  kind: SubjectKind;
  name: string;
  lon: number;
  lat: number;
  /** The feature's rough size: a radius in metres to frame and analyse it. */
  radius: number;
  /** Ground (or seafloor) elevation at the point, metres. */
  elevation: number;
  /** Highest minus lowest ground within the radius, metres. */
  relief: number;
  /** For craters and summits: the probed centre. */
  centre?: [number, number];
  /** Hints from the tapped label or map feature. */
  hint?: string;
}

export interface LensHost {
  app: App;
  /** The lens's panel body (replaced on each render). */
  body: HTMLElement;
  /** Sets the panel's title and subtitle. */
  title(title: string, sub?: string): void;
  /** Registers cleanup to run when the lens closes. */
  onClose(fn: () => void): void;
  close(): void;
}

export interface Lens {
  id: string;
  label: string;
  /** An emoji or glyph for the chip. */
  icon: string;
  /** One line: what it shows. */
  blurb: string;
  /** How well it suits the subject, 0 (not at all) to 1. */
  score(s: Subject): number;
  open(host: LensHost, s: Subject): void | Promise<void>;
}

export const KIND_LABEL: Record<SubjectKind, string> = {
  peak: "Mountain", volcano: "Volcano", range: "Mountain range", crater: "Crater", canyon: "Canyon", river: "River", lake: "Lake",
  sea: "Sea or ocean", coast: "Coast", glacier: "Glacier", forest: "Forest", desert: "Desert", island: "Island", city: "City", land: "Land",
};
