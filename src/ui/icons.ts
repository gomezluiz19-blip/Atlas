// Inline 24x24 stroke icons.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  explore: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  section: svg('<path d="M3 17l4-7 3 4 4-9 3 6 4-2"/><path d="M3 21h18"/>'),
  flow: svg('<path d="M12 3c3 4 5 6.6 5 9.5a5 5 0 0 1-10 0C7 9.6 9 7 12 3z"/><path d="M12 21v-3"/>'),
  watershed: svg('<path d="M3 18c2-5 4-9 9-12 5 3 7 7 9 12"/><path d="M12 6v12M8 13l4 5 4-5"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  strata: svg('<path d="M3 7c3-2 6 1 9-1s6-1 9 1"/><path d="M3 12c3-2 6 1 9-1s6-1 9 1"/><path d="M3 17c3-2 6 1 9-1s6-1 9 1"/><path d="M3 4v16M21 4v16"/>'),
  column: svg('<rect x="8" y="3" width="8" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 15h8"/><path d="M4 21h16"/>'),
  cube: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  leaf: svg('<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19c3-4 6-7 10-10"/>'),
  pick: svg('<path d="M4 20l9-9"/><path d="M10 5c4-1 7 0 9 2-3 0-6 1-8 3"/><path d="M19 14c1-4 0-7-2-9 0 3-1 6-3 8"/>'),
  pylon: svg('<path d="M9 21l3-18 3 18"/><path d="M7 8h10M8 13h8M5 8l2 3M19 8l-2 3"/><path d="M10 17h4"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
};
