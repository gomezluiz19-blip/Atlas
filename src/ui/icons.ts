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
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
};
