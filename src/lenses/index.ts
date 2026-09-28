// All the lenses, in the order they're offered when scores tie.
import { blockLens } from "./block";
import { sliceLens } from "./slice";
import type { Lens } from "./types";

export const LENSES: Lens[] = [sliceLens, blockLens];
