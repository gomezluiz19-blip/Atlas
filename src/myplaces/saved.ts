// The saved places, read lightly: where home is, for anything that measures from it or opens over it.
// (The full store, with devices and sanitising, is store.ts; this reads the same list without loading it.)
import { loadList } from "../util/storage";

export interface SavedSpot { id?: string; kind?: string; name: string; lon: number; lat: number }

/** Every saved place with a real position. */
export const savedSpots = (): SavedSpot[] => loadList<SavedSpot>("atlas.myplaces.v1").filter((p) => Number.isFinite(p?.lon) && Number.isFinite(p?.lat));

/** The saved home, if there is one. */
export const savedHome = (): SavedSpot | null => savedSpots().find((p) => p.kind === "home") ?? null;

/** Home, else the first saved place: where "here" is for you. */
export const homeOrFirst = (): SavedSpot | null => { const all = savedSpots(); return all.find((p) => p.kind === "home") ?? all[0] ?? null; };
