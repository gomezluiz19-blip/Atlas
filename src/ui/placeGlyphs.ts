// Small glyphs drawn inside map-label pins, one per kind of place.
import type { PlaceKind } from "../analysis/placeKinds";
import { icons } from "./icons";
import { TAXON_ICONS } from "./taxonIcons";

const g = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const GLYPHS: Partial<Record<PlaceKind, string>> = {
  landmark: g('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  monument: g('<path d="M10 21V7l2-4 2 4v14M7 21h10"/>'),
  castle: g('<path d="M4 21V8h3v2h2V8h2v2h2V8h2v2h2V8h3v13zM10 21v-4a2 2 0 0 1 4 0v4"/>'),
  bridge: g('<path d="M2 9c3 0 6 3 10 3s7-3 10-3M4 9v10M20 9v10M9 12v7M15 12v7M2 16h20"/>'),
  dam: g('<path d="M4 20l3-14h10l3 14zM8 10h8M9 14h6"/><path d="M1.5 20h21"/>'),
  lighthouse: g('<path d="M9 21l1-12h4l1 12M10 9V6h4v3M12 3v3M8 21h8M3 8l5-1M21 8l-5-1"/>'),
  sports: g('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3.5v4M20.2 9.8l-4.4.5M17.5 19l-3.2-4.3M6.5 19l3.2-4.3M3.8 9.8l4.4.5"/>'),
  culture: g('<path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>'),
  worship: g('<path d="M12 2v5M10 4h4M6 21V12l6-5 6 5v9zM10 21v-4a2 2 0 0 1 4 0v4"/>'),
  transport: g('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  education: g('<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>'),
  peak: g('<path d="M2 20L9 7l4 6 2.5-3.5L22 20z"/>'),
  volcano: g('<path d="M2 20l6-10h8l6 10zM9 6l1 2M12 3v4M15 6l-1 2"/>'),
  waterfall: g('<path d="M4 4h16M7 4v12M12 4v14M17 4v10M4 20c2-1.5 4-1.5 6 0s4 1.5 6 0 3-1.5 4 0"/>'),
  glacier: g('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>'),
  island: g('<path d="M12.5 17c.3-3.5 0-6.5-1-9M11.5 8C10 5.5 7 5 5 6.5c2 0 4 1 5 3M11.5 8c1.5-2.5 4.5-3 6.5-1.5-2 0-4 1-5 3"/><path d="M3 20c3-2.5 15-2.5 18 0"/>'),
  beach: g('<path d="M4 20h16M12 20l3-12M6.5 11C8 6 14 4 19 7z"/>'),
  water: g('<path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11z"/>'),
  park: TAXON_ICONS.tree,
  zoo: icons.paw,
  nature: TAXON_ICONS.plant,
};

export function glyphFor(kind: PlaceKind): string | undefined {
  return GLYPHS[kind];
}
