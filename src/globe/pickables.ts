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
