// All the lenses, in the order they're offered when scores tie.
import { anatomyLens } from "./anatomy";
import { blockLens } from "./block";
import { forestLens, sizeLens, transitLens } from "./places";
import { rewindLens } from "./rewind";
import { seaLevelLens, seafloorLens } from "./sea";
import { sliceLens } from "./slice";
import { traceLens } from "./trace";
import type { Lens } from "./types";

export const LENSES: Lens[] = [sliceLens, blockLens, anatomyLens, seafloorLens, seaLevelLens, traceLens, rewindLens, transitLens, forestLens, sizeLens];
