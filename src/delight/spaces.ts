// One hologram at a time, from anywhere: a place on the card, your home, a
// building site, a mine, a port, a warehouse. Opening one closes the last.
import type { App } from "../app";
import type { Holo, SpaceOptions } from "../myplaces/holo";
import { flyToPlace } from "../ui/search";

let active: Holo | null = null;
export const activeSpace = () => active;
export function closeSpace() { active?.close(); active = null; }
/** Takes over a hologram made elsewhere (so opening the next one closes it). */
export function adopt(h: Holo) { if (active !== h) closeSpace(); active = h; }

export type OpenOptions = Omit<SpaceOptions, "onGlobe" | "onClose"> & { onGlobe?(): void; onClose?(): void };

export async function openSpace(app: App, o: OpenOptions): Promise<Holo> {
  closeSpace();
  const m = await import("../myplaces/holo");
  const h = m.bootSpace({
    ...o,
    onGlobe: () => { closeSpace(); void flyToPlace(app.globe, { name: o.name, lon: o.lon, lat: o.lat, radius: Math.max(400, (o.size ?? 520) * 0.9) }); o.onGlobe?.(); },
    onClose: () => { closeSpace(); o.onClose?.(); },
  });
  active = h;
  return h;
}
