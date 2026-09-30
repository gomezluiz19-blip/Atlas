// Lets globe entities (e.g. earthquake dots) carry a feature that opens a card when tapped.
import type { Entity } from "cesium";

export interface PickFeature {
  lon: number;
  lat: number;
  title: string;
  context: string;
  feature: unknown;
}

const registry = new WeakMap<Entity, PickFeature>();

export function makePickable(entity: Entity, f: PickFeature) {
  registry.set(entity, f);
}

export function pickFeature(picked: unknown): PickFeature | undefined {
  const id = (picked as { id?: unknown } | undefined)?.id;
  return id && typeof id === "object" ? registry.get(id as Entity) : undefined;
}

/** Things on the globe that do something of their own when tapped (a plane opens its card). */
const taps = new WeakMap<object, () => void>();
export function makeTappable(id: object, onTap: () => void) {
  taps.set(id, onTap);
}
export function tapHandler(picked: unknown): (() => void) | undefined {
  const id = (picked as { id?: unknown } | undefined)?.id;
  return id && typeof id === "object" ? taps.get(id) : undefined;
}
