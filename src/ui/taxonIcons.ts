// Line icons for groups of living things (24 × 24, drawn to match the app's
// other icons), and the rules that pick one for an iNaturalist taxon.
import type { Taxon } from "../data/inaturalist";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const TAXON_ICONS = {
  // Birds
  bird: svg('<path d="M3 12.5c3.5 0 5-2 7-4.5 1.8-2.2 5-2.6 6.8-.8L20 8l-2.6 1.2c.3 4.8-3.3 8.3-8.4 8.3H6"/><path d="M9 17.5 7.5 21M12 17.3l-.8 3.7"/><circle cx="15.6" cy="7.9" r=".5" fill="currentColor"/>'),
  raptor: svg('<path d="M2 9.5c3 1.5 6 1.8 8.5 1.2L12 8.5l1.5 2.2c2.5.6 5.5.3 8.5-1.2-2.5 3-5.5 4.5-8.5 4.8V17l-1.5 2-1.5-2v-2.7C7.5 14 4.5 12.5 2 9.5z"/>'),
  owl: svg('<path d="M6 5.5 8 8M18 5.5 16 8"/><path d="M6 5.5C4.8 9 4.5 13 6 16.5c1.4 3 3.5 4.5 6 4.5s4.6-1.5 6-4.5c1.5-3.5 1.2-7.5 0-11-2 1.3-4 2-6 2s-4-.7-6-2z"/><circle cx="9.3" cy="11" r="1.8"/><circle cx="14.7" cy="11" r="1.8"/><path d="M11.3 14.2 12 15.3l.7-1.1"/>'),
  duck: svg('<path d="M3 14.5h6.5C8 12.7 8 10.4 9.5 9 11 7.6 13.4 7.8 14.6 9.4c.5.7.7 1.5.7 2.3L19 11l-3.3 2.2c.8.7 1.3 1.6 1.3 2.8 0 2.2-2 3.5-5 3.5H8c-3 0-5-2-5-5z"/><circle cx="12.8" cy="10.6" r=".5" fill="currentColor"/>'),
  hummingbird: svg('<path d="M22 5.5 14.5 9"/><path d="M14.5 9c-1.2-1-3-1-4 .2L8.8 11 4 9.5l2.7 3.3L5 18.5l5-3.5c2.6 0 4.8-2.1 4.8-4.6 0-.5-.1-1-.3-1.4z"/><circle cx="12.9" cy="9.8" r=".5" fill="currentColor"/>'),
  penguin: svg('<path d="M12 3c-2.5 0-4 2-4 4.5v3C6.5 12 6 14.5 6.5 17c.5 2.5 2.7 4 5.5 4s5-1.5 5.5-4c.5-2.5 0-5-1.5-6.5v-3C16 5 14.5 3 12 3z"/><path d="M12 9.5c-1.7 0-2.8 2-2.8 4.8s1.1 4.7 2.8 4.7 2.8-1.9 2.8-4.7S13.7 9.5 12 9.5z"/><path d="M11.3 7.3 12 8.3l.7-1M9.5 21l-1 .5M14.5 21l1 .5"/><path d="M10.4 6v.01M13.6 6v.01"/>'),
  gull: svg('<path d="M2 9c2.5-1 5 0 7 2.5l3 2.5 3-2.5c2-2.5 4.5-3.5 7-2.5"/><path d="M10.4 13.2c.5.9 1 1.3 1.6 1.3s1.1-.4 1.6-1.3"/>'),
  // Mammals
  mammal: svg('<path d="M4 17V11.5C4 8.5 6.5 7 9 7h5.5l2-2.5.9 2.7c1.6.7 2.6 2.1 2.6 3.8v.5l1.5 1.5H19"/><path d="M4 11.5 2.5 9M7 17v3M10.5 17v3M15 15.5V20M18 14v6M4 17h14"/>'),
  deer: svg('<path d="M8.5 3v3.2L6.3 7.5M8.5 5.2l2-1.4M15.5 3v3.2l2.2 1.3M15.5 5.2l-2-1.4"/><path d="M7.5 8.5c1.5.4 3 .6 4.5.6s3-.2 4.5-.6l-1 3.6-1.5 1v4.4c0 1.9-.9 3-2 3s-2-1.1-2-3v-4.4l-1.5-1z"/><path d="M7.5 8.5 4.5 8.3l1.6 2.2M16.5 8.5l3-.2-1.6 2.2"/><path d="M11 19.3h2"/>'),
  bear: svg('<circle cx="6.5" cy="6.5" r="2"/><circle cx="17.5" cy="6.5" r="2"/><path d="M5.5 11c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5c0 4.8-2.9 8.5-6.5 8.5S5.5 15.8 5.5 11z"/><ellipse cx="12" cy="14.5" rx="2.6" ry="2"/><path d="M12 13.9v.1M9.5 10.5v.01M14.5 10.5v.01"/>'),
  cat: svg('<path d="M5 3.5 8 7.5h8l3-4v8c0 4.7-3.1 8-7 8s-7-3.3-7-8z"/><path d="M9.5 12v.5M14.5 12v.5M12 14.5l-1 1h2z"/><path d="M3 14.5l4 .5M3 17l4-.5M21 14.5l-4 .5M21 17l-4-.5"/>'),
  canine: svg('<path d="M4.5 3.5 8 8h8l3.5-4.5-.5 7.5-3.5 4.5-3.5 4-3.5-4L5 11z"/><path d="M9.5 11v.5M14.5 11v.5"/><path d="M11 15.5h2"/>'),
  rodent: svg('<path d="M14 18c-5 0-9-2-9-6.5 0-3 2.5-5.5 6-5.5 4.5 0 7 3 7 7l3 1-3 1.5"/><circle cx="9.5" cy="6.8" r="2"/><path d="M14 18c2.5 0 5 1 5.5 3"/><circle cx="16" cy="12.5" r=".5" fill="currentColor"/>'),
  bat: svg('<path d="M12 9c-1 0-1.6.6-1.8 1.5C8 9 5 8.6 2 10c1.5 1 2 2.3 2 4 1.3-.8 2.6-.9 3.8-.2.3-1.2 1.2-1.9 2.2-1.8.5 1.3 1.1 2.5 2 3.5.9-1 1.5-2.2 2-3.5 1-.1 1.9.6 2.2 1.8 1.2-.7 2.5-.6 3.8.2 0-1.7.5-3 2-4-3-1.4-6-1-8.2.5C13.6 9.6 13 9 12 9z"/><path d="M11 9l-.7-1.6M13 9l.7-1.6"/>'),
  whale: svg('<path d="M2.5 12c0-3.5 3.5-5.5 8-5.5 5 0 8 3 8.5 6L22 9.5l-.5 5.5-2.5-1c-1 3.2-4.3 5-8.5 5-4.8 0-8.5-2.8-8.5-7z"/><path d="M6 13.5c2 1.5 5 1.8 8 .5"/><circle cx="7" cy="10.5" r=".5" fill="currentColor"/><path d="M9 6.5c0-1.5-.5-2.5-1.5-3.5M9 6.5c.2-1.3 1.2-2.4 2.5-2.8"/>'),
  seal: svg('<path d="M3 18.5c2.2-.6 4.2-1.8 6-3.8 1.8-2 2.8-4.7 3.4-7.2.4-1.6 1.6-2.7 3.1-2.7 1.8 0 3 1.3 3 3v1.4l1.5.8-1.6.9c-.4 3.7-2.6 6.8-6 8.4"/><path d="M3 18.5c3 1.5 7 2 10.4 1.8M13.4 20.3l2.6.1 1.5 1M3 18.5 1.5 17M3 18.5l-1 2M19.4 9.4h2.1"/><circle cx="16.4" cy="7.2" r=".55" fill="currentColor"/>'),
  elephant: svg('<path d="M3 18v-5.5c0-3 2.5-5 5.5-5H13c3 0 6 2 6 5.5v3.5c0 1.5.8 2.5 2 2.5"/><path d="M13 7.5c-1 1-1.5 2.6-1 4.5 1.5.5 3 .3 4-.5M5 18v2.5M8.5 17.5v3M12.5 17.5v3M15.5 17v3.5M3 18h12.5M17.3 14.3c.6 1 1.6 1.5 2.6 1.3"/><circle cx="16.3" cy="10.3" r=".55" fill="currentColor"/>'),
  kangaroo: svg('<path d="M9 21c1-2 2-3.5 2-6 0-3 1-5 3-6.5l1-2.5-.3-2.5 1.3 1 1-1.2.3 2.5c1.3.6 2 1.5 2 2.5l-2.3.8c-.7 2-1.2 3-1.2 5 0 2.5 1 4 2.5 5.5H9z"/><path d="M11 17.5c-3 .5-6 1.8-8 3.5M14.7 11.5l1.6 2"/><circle cx="16.4" cy="6.9" r=".5" fill="currentColor"/>'),
  horse: svg('<path d="M8 21v-4c-2-1.5-2.5-4-1.5-6.5L10 4l1.5 1.5 1.5-2 1 2c2.5 1 4.5 3.5 5.5 6.5l.5 2-2 1.2-2.8-1.7-2.2 1.5V21"/><path d="M10 4c-1.5 1.5-3 3.5-3.5 6.5"/><circle cx="13.8" cy="8.6" r=".55" fill="currentColor"/>'),
  primate: svg('<circle cx="12" cy="11" r="6.5"/><circle cx="4.5" cy="11" r="2"/><circle cx="19.5" cy="11" r="2"/><path d="M8 13.5c0-2 1.8-3 4-3s4 1 4 3-1.8 3.5-4 3.5-4-1.5-4-3.5z"/><path d="M10 9v.01M14 9v.01M11 14h2"/>'),
  rabbit: svg('<path d="M9.5 9C8 6.5 8 3.5 9 2.5s2.5 2.5 2.5 5.5M14.5 9c1.5-2.5 1.5-5.5.5-6.5S12.5 5 12.5 8"/><path d="M6.5 15c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6-2.5 5.5-5.5 5.5-5.5-2-5.5-5.5z"/><path d="M10 14v.01M14 14v.01M11 17h2"/>'),
  // Reptiles and amphibians
  lizard: svg('<path d="M12 2.5c1 0 1.8.9 1.8 2s-.4 1.8-.8 2.5l.3 3 3.2-1.5M13.3 10l.2 5 3 2M13.5 15l-.8 3.5c-.3 1.6.3 3 1.3 3.5M10.8 7l-.3 3-3.2-1.5M10.5 10l-.2 5-3 2M10.3 15"/><path d="M10.8 7c-.4-.7-.6-1.4-.6-2.5s.8-2 1.8-2"/>'),
  crocodile: svg('<path d="M1.5 12c2.5 1.5 5 2 8 2H16l5.5-.8c.5-.1.5-.7 0-.9L16 10.8H9.5c-3 0-5.5.3-8 1.2z"/><path d="M9 10.8l1-1.3 1 1.3 1-1.3 1 1.3 1-1.3 1 1.3M7 14l-1 2.5M12 14l1 2.5M17.6 13l.3.6M19.5 12.8l.3.5"/><circle cx="15.2" cy="9.9" r=".5" fill="currentColor"/>'),
  snake: svg('<path d="M5 20.5c4.5 0 5-3 3-5s-2.5-4.5 1-5.5 7.5.5 8.5-2S15.5 4 13.5 4.5"/><path d="M13.5 4.5c-1 .3-1.3 1.3-.6 2 .6.6 1.8.6 2.6.3l1.5 1"/><path d="M17 7.8l1.5.2"/>'),
  turtle: svg('<path d="M4 15c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/><path d="M8 15l1.5-4h5L16 15M9.5 11 12 8.5l2.5 2.5M20 13.5h1.5c.8 0 1.5-.7 1.5-1.5s-.7-1.5-1.5-1.5H20M6 15v2.5M10 15v2.5M14 15v2.5M18 15v2.5M4 15l-1.5 1"/>'),
  frog: svg('<circle cx="8" cy="7" r="2.3"/><circle cx="16" cy="7" r="2.3"/><path d="M5.8 8.2C4 9.5 3 11.5 3 13.5c0 3.5 4 5.5 9 5.5s9-2 9-5.5c0-2-1-4-2.8-5.3"/><path d="M8 13.5c1.2 1 2.5 1.5 4 1.5s2.8-.5 4-1.5M3 19l3-1M21 19l-3-1"/><path d="M8 7v.01M16 7v.01"/>'),
  salamander: svg('<path d="M4.5 8.5c0-1.4 1.1-2.5 2.5-2.5 1.2 0 2 .6 2.8 1.5l3 3.5c1 1.2 2.3 1.8 3.7 1.8 1.7 0 3 1.2 3 2.7s-1.3 2.5-3 2.5c-1.2 0-2-.8-2-1.8"/><path d="M8.3 7 6.8 4.3M9.8 8.3l2.2-2.4M12.6 11l-1.7 3M15 12.4l1 2.8"/><circle cx="6.3" cy="8" r=".55" fill="currentColor"/>'),
  // Fish and sea life
  fish: svg('<path d="M2.5 12c2.5-3.5 6-5.5 10-5.5 3.5 0 6 2 7.5 5.5-1.5 3.5-4 5.5-7.5 5.5-4 0-7.5-2-10-5.5z"/><path d="M20 12l2.5-3.5v7z"/><circle cx="7" cy="11" r=".6" fill="currentColor"/><path d="M12 8.5c1 2 1 5 0 7"/>'),
  shark: svg('<path d="M2 14c3-2.5 7-3.5 11-3l2.5-5 1 5.3c2 .5 3.5 1.2 4.5 2.2l1-3.5v8l-1-3.2c-3 2.7-9 3.5-14 2.2-2-.5-3.5-1.5-5-3z"/><path d="M11 16l-1 3M5.5 14.5v.01"/>'),
  octopus: svg('<path d="M6.5 11C6.5 6.5 9 4 12 4s5.5 2.5 5.5 7c0 1.5-.6 2.5-1.5 3"/><path d="M8 14c-1.5 1.5-4 2-5 1M9.5 14.5c-.5 2.5-2 4-3.5 4.5M12 15v5.5M14.5 14.5c.5 2.5 2 4 3.5 4.5M16 14c1.5 1.5 4 2 5 1M8 14c-.9-.5-1.5-1.5-1.5-3"/><path d="M10 9.5v.5M14 9.5v.5"/>'),
  shell: svg('<path d="M12 20.5c-5 0-8.5-3-8.5-7.5C3.5 7.5 7.3 3.5 12 3.5s8.5 4 8.5 9.5c0 4.5-3.5 7.5-8.5 7.5z"/><path d="M12 20.5V3.5M12 20.5 6.5 5.5M12 20.5l5.5-15M12 20.5 3.8 10M12 20.5l8.2-10.5"/>'),
  snail: svg('<circle cx="13" cy="12" r="5.5"/><path d="M13 12a2.3 2.3 0 1 1 2.3-2.3"/><path d="M2.5 19.5H18c2 0 3.5-1 3.5-3v-1.5M7.5 17.5V13L4.5 7M7.5 13 8 7"/>'),
  crab: svg('<path d="M6 14c0-3 2.7-5 6-5s6 2 6 5-2.7 4.5-6 4.5S6 17 6 14z"/><path d="M6.5 12 3.5 10 3 6.5l2.5 1.5L6 5M17.5 12l3-2 .5-3.5-2.5 1.5L18 5M6.5 16l-3.5 2M17.5 16l3.5 2M8 18l-2 3M16 18l2 3M10 9V7.5M14 9V7.5"/>'),
  jellyfish: svg('<path d="M4.5 12c0-4.5 3.4-8 7.5-8s7.5 3.5 7.5 8c-2.5 1-5 1-7.5 1s-5 0-7.5-1z"/><path d="M7 13c.5 2-1 3.5 0 5.5M10.5 13.5c.3 2.5-1 4 0 7M13.5 13.5c-.3 2.5 1 4 0 7M17 13c-.5 2 1 3.5 0 5.5"/>'),
  starfish: svg('<path d="M12 3.6 14.3 9.6 20.7 10 15.7 14 17.4 20.2 12 16.7 6.6 20.2 8.3 14 3.3 10 9.7 9.6z"/><path d="M12 11v.01M12 13.5v.01M10 12.5v.01M14 12.5v.01"/>'),
  coral: svg('<path d="M12 21v-6M12 15l-4-4V7M8 11 5 8.5V5M12 15l4-3.5V6M16 11.5l3-2.5V6M8 7 6.5 4.5M16 8l1.5-3M7 21h10"/>'),
  // Insects and kin
  insect: svg('<ellipse cx="12" cy="15.5" rx="3.5" ry="5"/><circle cx="12" cy="8" r="2.3"/><path d="M11 6 8.5 3M13 6l2.5-3M8.5 13 4 11M8.5 16.5 4 17M9.5 19.5l-3 2M15.5 13 20 11M15.5 16.5 20 17M14.5 19.5l3 2"/>'),
  butterfly: svg('<path d="M12 7.5v12M12 7.5 10 4M12 7.5 14 4"/><path d="M12 10C10 5.5 6.5 4 4 5c-1.5.6-1.2 4 .5 6 1 1.2 2.5 1.8 4 2-2 1-3 3-2 5 1 1.5 4 .5 5.5-3.5M12 10c2-4.5 5.5-6 8-5 1.5.6 1.2 4-.5 6-1 1.2-2.5 1.8-4 2 2 1 3 3 2 5-1 1.5-4 .5-5.5-3.5"/>'),
  beetle: svg('<path d="M7 11c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5v4c0 3-2.2 5.5-5 5.5s-5-2.5-5-5.5z"/><path d="M12 10v10.5M9 6.5 7 3.5M15 6.5l2-3M7 12H3.5M17 12h3.5M7 15.5l-3 1.5M17 15.5l3 1.5M8 18.5l-2.5 2.5M16 18.5l2.5 2.5"/><path d="M9 6.8c.5-1.5 1.5-2.3 3-2.3s2.5.8 3 2.3"/>'),
  bee: svg('<ellipse cx="12" cy="14.5" rx="4" ry="5.5"/><path d="M8.2 12.5h7.6M8.2 16h7.6M12 20v2"/><path d="M8.5 11C6 11 3 9.5 3.5 7.5S7 6 9 9M15.5 11c2.5 0 5.5-1.5 5-3.5S17 6 15 9"/><path d="M10.5 9.3 9.5 6.5M13.5 9.3l1-2.8"/>'),
  ant: svg('<circle cx="5" cy="11" r="2"/><ellipse cx="10" cy="12" rx="2.5" ry="1.6"/><ellipse cx="17" cy="12.5" rx="4" ry="3"/><path d="M4 9.2 2.5 6.5M5.8 9.2 6.5 6.5M9 13.5 7 17.5M10.5 13.6l.2 4M11.8 13 14 17"/>'),
  dragonfly: svg('<path d="M12 5.5v16"/><circle cx="12" cy="4.5" r="1.5"/><path d="M12 8C9 6 4.5 6 3 7.5 2 8.5 4 10 7 10s5-1 5-2zM12 8c3-2 7.5-2 9-.5 1 1-1 2.5-4 2.5s-5-1-5-2zM12 11c-2.5-1-6-.5-7 .5-.8.8.8 2 3 2s4-1.5 4-2.5zM12 11c2.5-1 6-.5 7 .5.8.8-.8 2-3 2s-4-1.5-4-2.5z"/>'),
  spider: svg('<circle cx="12" cy="9" r="2.2"/><ellipse cx="12" cy="15" rx="3" ry="3.8"/><path d="M10 8 6 4.5 3 6M14 8l4-3.5L21 6M9.5 10.5 4.5 9.5 2 12M14.5 10.5l5-1L22 12M9.5 13 5 15l-1.5 4M14.5 13l4.5 2 1.5 4M10 17l-2.5 3.5M14 17l2.5 3.5"/>'),
  scorpion: svg('<ellipse cx="12" cy="13" rx="2.5" ry="3.5"/><path d="M12 16.5v2.5c0 1.5 1 2.5 2.5 2.5s2.5-1 2.5-2.5-1-2-2-2"/><path d="M10 10.5 7.5 8.5 5 9M14 10.5l2.5-2 2.5.5M9.5 12.5l-3 .5M9.5 14.5l-3 1.5M14.5 12.5l3 .5M14.5 14.5l3 1.5"/><path d="M5 9c-1 0-1.5-1-1-2 .6-.6 1.5-.7 2-.1M19 9c1 0 1.5-1 1-2-.6-.6-1.5-.7-2-.1"/>'),
  // Plants
  plant: svg('<path d="M12 21v-9"/><path d="M12 12c0-4 2.5-7 7-7 0 4.2-2.8 7-7 7zM12 14c0-3.3-2.3-6-6.5-6 0 3.6 2.6 6 6.5 6z"/><path d="M7 21h10"/>'),
  tree: svg('<path d="M12 21v-6.5M12 17l-3-2.5M12 15.5l2.5-2"/><path d="M8 15c-2.8 0-5-2-5-4.5 0-2 1.3-3.6 3.2-4.2C6.6 4.1 8.6 2.5 11 2.5c2 0 3.8 1 4.6 2.7C18.2 5.4 21 7.4 21 10.3 21 13 18.8 15 16 15z"/>'),
  conifer: svg('<path d="M12 2.5 7 9h2.5L5.5 14.5h3L4 20h16l-4.5-5.5h3L14.5 9H17z"/><path d="M12 20v2"/>'),
  palm: svg('<path d="M12.5 21.5c.5-4 .5-8-.5-11.5"/><path d="M12 10C10 6.5 6 5.5 3 7c3 0 5.5 1 7 3.5M12 10c-3.5-1.5-7-.5-8.5 2.5M12 10c1.5-3.5 5-5.5 8.5-4.5-3 .5-5.5 2-7 4.5M12 10c3.5-1.5 7 0 8.5 3M12 10c.5-3-.5-6-3-7.5"/>'),
  flower: svg('<circle cx="12" cy="8" r="2.2"/><path d="M12 5.8C11 2.5 13 2.5 12 5.8zM12 5.8c-1.6-3 1.2-4 1.8-.8M14.2 8c3.3-1 3.3 1 0 0zM9.8 8c-3.3-1-3.3 1 0 0z"/><path d="M10.2 6.7c-2.7-2-.7-3.8 1.3-1.6M13.8 6.7c2.7-2 .7-3.8-1.3-1.6M10.2 9.3c-2.7 2-.7 3.8 1.3 1.6M13.8 9.3c2.7 2 .7 3.8-1.3 1.6"/><path d="M12 10.5v11M12 16c-2.5-2.5-5-2.5-6-1.5 1 2 3.5 2.5 6 1.5zM12 18c2-2 4.5-2 5.5-1-1 1.8-3.5 2-5.5 1z"/>'),
  orchid: svg('<path d="M12 11.5c-2.5-4-6.5-5-8-3.5s1 5.5 5 5.5M12 11.5c2.5-4 6.5-5 8-3.5s-1 5.5-5 5.5M12 11.5C11 7 11 4 12 2.5c1 1.5 1 4.5 0 9zM9 13.5c-1 2.5 0 5 3 6 3-1 4-3.5 3-6"/><path d="M11 15.5h2"/>'),
  daisy: svg('<circle cx="12" cy="12" r="2.8"/><path d="M12 9.2V3M12 14.8V21M9.2 12H3M14.8 12H21M10 10l-4.2-4.2M14 14l4.2 4.2M14 10l4.2-4.2M10 14l-4.2 4.2"/>'),
  lily: svg('<path d="M12 13c-3.5 0-6.5-2.5-7-7 2.3.2 4 1.2 5 2.8C10.5 6 11.2 4.2 12 3c.8 1.2 1.5 3 2 5.8 1-1.6 2.7-2.6 5-2.8-.5 4.5-3.5 7-7 7z"/><path d="M12 13v8M12 17.5c-1.5-1.5-3.5-2-5.5-1.5M12 19c1.3-1.2 3-1.5 4.5-1"/>'),
  vine: svg('<circle cx="9" cy="11.5" r="1.8"/><circle cx="12.6" cy="11.5" r="1.8"/><circle cx="16.2" cy="11.5" r="1.8"/><circle cx="10.8" cy="14.8" r="1.8"/><circle cx="14.4" cy="14.8" r="1.8"/><circle cx="12.6" cy="18.1" r="1.8"/><path d="M12.6 9.7V6c0-1.5 1-2.5 2.5-3M12.6 6.5C10.5 4.5 8 4.5 6 5.5c1.5 2 4 2.5 6.6 1z"/>'),
  rose: svg('<path d="M12 12.5c-3 0-5-2-5-5 2.5 0 3.5.8 5 2 1.5-1.2 2.5-2 5-2 0 3-2 5-5 5z"/><path d="M12 9.5C10.5 7 10.5 4.5 12 3c1.5 1.5 1.5 4 0 6.5z"/><path d="M12 12.5v9M12 16.5c-1.8-1.5-4-1.8-5-.8 1.2 1.5 3.2 1.8 5 .8zM12 18.5c1.6-1.3 3.6-1.5 4.5-.5-1 1.3-2.8 1.6-4.5.5z"/>'),
  grass: svg('<path d="M4 21c1-5 .5-9-1-13M7.5 21c.5-6 2-10 5-14M12 21c-.3-5-1.5-9-3.5-12M15 21c.5-5 2.5-9 6-12M18.5 21c0-4-1-7-3-9.5"/><path d="M2 21h20"/>'),
  cactus: svg('<path d="M9.5 21V6c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3v15"/><path d="M9.5 13H7c-1.4 0-2.5-1.1-2.5-2.5V8M14.5 11H17c1.4 0 2.5-1.1 2.5-2.5V6"/><path d="M6 21h12"/>'),
  succulent: svg('<path d="M12 19c-1-4-1-8 0-12 1 4 1 8 0 12zM12 19c-3-2-5-5.5-5.5-9.5C9.5 12 11 15 12 19zM12 19c3-2 5-5.5 5.5-9.5C14.5 12 13 15 12 19zM12 19c-4-.5-7-2.5-9-6 3.5.5 6.5 2.5 9 6zM12 19c4-.5 7-2.5 9-6-3.5.5-6.5 2.5-9 6z"/><path d="M7 21h10"/>'),
  fern: svg('<path d="M6 21c3-5 5.5-11 12-18"/><path d="M9 16.5 6 15.5M9 16.5l1 3M11 13.5l-3.5-1.5M11 13.5l1.5 3M13 10.5 9.5 9M13 10.5l2 3M15 7.8l-3-1.8M15 7.8l2.3 2.7M16.8 5.6l-2.3-1.6M16.8 5.6l2 2.2"/>'),
  moss: svg('<path d="M3 20c0-2.5 1.5-4 3.5-4 .5-2 2-3 3.5-3 1 0 2 .5 2.5 1.2.6-1 1.7-1.7 3-1.7 2 0 3.5 1.5 3.5 3.5 1.5.3 2 1.5 2 4z"/><path d="M8 13V9M8 9l-.8-1M13 13.5V8M13 8l.8-1M17 13V10"/>'),
  mushroom: svg('<path d="M3 12c0-4.7 4-8.5 9-8.5s9 3.8 9 8.5z"/><path d="M9.5 12v6.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5V12"/><circle cx="8" cy="8" r="1"/><circle cx="14.5" cy="6.5" r="1"/><circle cx="16.5" cy="9.5" r=".8"/>'),
  lichen: svg('<path d="M4 17c0-2.5 2-4.5 4.5-4.5.5-2.5 2.6-4.5 5-4.5 2.8 0 5 2.2 5 5 1.5.5 2.5 2 2.5 3.5 0 2-1.6 3.5-3.5 3.5H7.5C5.6 20 4 18.6 4 17z"/><circle cx="9" cy="16" r="1.2"/><circle cx="13.5" cy="12.5" r="1.2"/><circle cx="16" cy="16.5" r="1.2"/>'),
  kelp: svg('<path d="M8 21c-1.5-3 1-5.5 0-8.5S7.5 6 9 3M8 12.5c1.8-.5 3-2 3-3.8-1.8.3-3 1.8-3 3.8zM8.2 17.5c-1.8-.3-3-1.6-3.2-3.5 1.8.2 3.1 1.5 3.2 3.5zM15.5 21c1.5-2.5-.5-5 .5-7.5s2-4.5 1-7.5M16 13.5c-1.6-.6-2.5-2-2.3-3.6 1.6.5 2.5 1.9 2.3 3.6zM16.5 9.2c1.4-.4 2.3-1.6 2.3-3-1.4.4-2.3 1.6-2.3 3z"/>'),
} as const;

export type TaxonIconKey = keyof typeof TAXON_ICONS;

/** Well-known iNaturalist taxon ids, most specific groups first. */
const BY_ANCESTOR: [number, TaxonIconKey][] = [
  // Birds
  [19350, "owl"], [71261, "raptor"], [6912, "duck"], [5190, "hummingbird"],
  // Mammals
  [40268, "bat"], [152871, "whale"], [43367, "primate"], [43359, "rabbit"], [43698, "rodent"],
  [41636, "bear"], [41944, "cat"], [42043, "canine"], [42158, "deer"], [42408, "deer"],
  // Reptiles, amphibians
  [85553, "snake"], [39532, "turtle"], [20979, "frog"], [26718, "salamander"],
  // Fish, molluscs
  [47273, "shark"], [47459, "octopus"],
  // Insects and arachnids
  [47157, "butterfly"], [47208, "beetle"], [47336, "ant"], [47201, "bee"], [47792, "dragonfly"], [47118, "spider"],
  // Plants and fungi
  [136329, "conifer"], [47903, "cactus"], [47217, "orchid"], [47604, "daisy"], [47148, "rose"], [47434, "grass"],
  [121943, "fern"], [311249, "moss"], [47851, "tree"], [54743, "lichen"], [47169, "mushroom"],
];

/** Broad groups, checked after the name keywords. */
const BY_BROAD_ANCESTOR: [number, TaxonIconKey][] = [
  [3, "bird"], [40151, "mammal"], [26036, "lizard"], [20978, "frog"], [47178, "fish"], [47115, "snail"],
  [47158, "insect"], [47119, "spider"], [47170, "mushroom"], [47126, "plant"],
];

/** Keywords in common names, for taxa whose ancestry isn't available. */
const BY_NAME: [RegExp, TaxonIconKey][] = [
  // Checked first: names that would otherwise match a later rule ("sea lion", "lion's mane jellyfish").
  [/\bseal\b|sea lion|walrus/, "seal"],
  [/jelly|man.o.war|sea nettle/, "jellyfish"],
  [/sea star|starfish|brittle star|sea urchin|sand dollar/, "starfish"],
  [/coral|sea anemone|\banemone\b/, "coral"],
  [/kelp|seaweed|\bwrack\b|algae|sea lettuce/, "kelp"],
  [/penguin/, "penguin"],
  [/\bgull\b|\btern\b|albatross|petrel|shearwater|gannet|booby|pelican|cormorant|puffin|kittiwake/, "gull"],
  [/elephant/, "elephant"],
  [/kangaroo|wallaby|koala|wombat|opossum|possum|bandicoot/, "kangaroo"],
  [/\bhorse\b(?! ?chestnut)|zebra|donkey|\bass\b/, "horse"],
  [/crocodile|alligator|caiman|gharial/, "crocodile"],
  [/lily\b|lilies|\blotus\b|tulip|\biris\b|daffodil|amaryllis/, "lily"],
  [/\bvine\b|grape|\bivy\b|creeper|clematis|wisteria/, "vine"],
  [/\bowl\b/, "owl"],
  [/hawk|eagle|kite\b|falcon|kestrel|vulture|osprey|condor|harrier|buzzard|caracara/, "raptor"],
  [/duck|goose|swan|teal|merganser|mallard|wigeon|eider|scaup/, "duck"],
  [/hummingbird|\bstarthroat|sabrewing|\bhermit\b/, "hummingbird"],
  [/\bbat\b/, "bat"],
  [/whale|dolphin|porpoise|orca/, "whale"],
  [/monkey|\bape\b|gorilla|chimpanzee|baboon|lemur|orangutan|macaque|gibbon/, "primate"],
  [/rabbit|\bhare\b|jackrabbit|cottontail|pika/, "rabbit"],
  [/squirrel|chipmunk|mouse|\brat\b|vole|beaver|marmot|gopher|porcupine|woodchuck|capybara/, "rodent"],
  [/\bbear\b/, "bear"],
  [/\bcat\b|\blion\b|tiger|leopard|lynx|bobcat|puma|cougar|jaguar|ocelot|cheetah/, "cat"],
  [/\bfox\b|wolf|coyote|\bdog\b|jackal|dingo/, "canine"],
  [/deer|\belk\b|moose|caribou|reindeer|sheep|goat|bison|buffalo|antelope|ibex|pronghorn|gazelle|wildebeest/, "deer"],
  [/snake|rattlesnake|python|viper|cobra|\bboa\b|garter|racer|kingsnake|mamba/, "snake"],
  [/turtle|tortoise|terrapin|slider\b/, "turtle"],
  [/frog|\btoad\b|bullfrog|treefrog/, "frog"],
  [/salamander|\bnewt\b|axolotl/, "salamander"],
  [/shark|\bray\b|stingray|skate\b|manta/, "shark"],
  [/octopus|squid|cuttlefish|nautilus/, "octopus"],
  [/\bcrab\b|lobster|shrimp|crayfish|prawn|barnacle/, "crab"],
  [/snail|slug|whelk|conch/, "snail"],
  [/clam|mussel|oyster|scallop|cockle/, "shell"],
  [/butterfly|\bmoth\b|skipper|swallowtail|monarch|admiral|fritillary|sulphur/, "butterfly"],
  [/\bbee\b|bumble|wasp|hornet|yellowjacket/, "bee"],
  [/\bant\b/, "ant"],
  [/beetle|weevil|ladybird|ladybug|scarab|firefly/, "beetle"],
  [/dragonfly|damselfly|darner|skimmer|bluet/, "dragonfly"],
  [/scorpion/, "scorpion"],
  [/spider|tarantula|orbweaver|widow\b/, "spider"],
  [/\bpine\b|pinyon|pi\u00f1on|\bfir\b|spruce|cedar|juniper|cypress|hemlock|larch|redwood|sequoia|yew\b/, "conifer"],
  [/palm\b|palmetto/, "palm"],
  [/cactus|cholla|saguaro|prickly.?pear|ocotillo/, "cactus"],
  [/agave|yucca|aloe|sedum|stonecrop|succulent/, "succulent"],
  [/orchid/, "orchid"],
  [/\boak\b|maple|birch|beech|\bash\b|elm\b|willow|poplar|aspen|walnut|chestnut|sycamore|cottonwood|eucalyptus|acacia|baobab|mangrove/, "tree"],
  [/fern|bracken|horsetail/, "fern"],
  [/\bmoss\b|liverwort/, "moss"],
  [/grass|sedge|\brush\b|bamboo|reed\b|cattail/, "grass"],
  [/daisy|aster\b|sunflower|dandelion|thistle|goldenrod|yarrow|coneflower/, "daisy"],
  [/\brose\b|bramble|blackberry|hawthorn|strawberry/, "rose"],
  [/mushroom|bolete|chanterelle|puffball|amanita|bracket|polypore|morel/, "mushroom"],
  [/lichen/, "lichen"],
];

const BY_ICONIC: Record<string, TaxonIconKey> = {
  Aves: "bird", Mammalia: "mammal", Reptilia: "lizard", Amphibia: "frog", Actinopterygii: "fish", Mollusca: "snail",
  Insecta: "insect", Arachnida: "spider", Plantae: "plant", Fungi: "mushroom", Animalia: "insect", Chromista: "kelp", Protozoa: "lichen",
};

const GREEN = new Set(["Plantae", "Fungi", "Chromista", "Protozoa"]);
const PLANT_ICONS = new Set<TaxonIconKey>(["plant", "tree", "conifer", "palm", "flower", "orchid", "daisy", "rose", "lily", "vine", "grass", "cactus", "succulent", "fern", "moss", "mushroom", "lichen", "kelp"]);

function ancestorIds(t: Partial<Taxon> & { ancestor_ids?: number[]; ancestry?: string }): number[] {
  if (Array.isArray(t.ancestor_ids)) return t.ancestor_ids;
  if (typeof t.ancestry === "string") return t.ancestry.split("/").map(Number);
  return [];
}

/** Picks the most specific icon for a taxon. */
export function taxonIcon(t: Partial<Taxon> & { ancestor_ids?: number[]; ancestry?: string }): TaxonIconKey {
  const ids = new Set(ancestorIds(t));
  if (t.id !== undefined) ids.add(t.id);
  for (const [id, icon] of BY_ANCESTOR) if (ids.has(id)) return icon;
  const name = `${t.preferred_common_name ?? ""}`.toLowerCase();
  // A name keyword only counts if it's the right kingdom ("elephant ear" is a plant).
  const iconic = t.iconic_taxon_name;
  const plantLike = iconic ? GREEN.has(iconic) : ids.has(47126) || ids.has(47170) ? true : ids.has(1) ? false : null;
  for (const [re, icon] of BY_NAME) if (re.test(name) && (plantLike === null || plantLike === PLANT_ICONS.has(icon))) return icon;
  for (const [id, icon] of BY_BROAD_ANCESTOR) if (ids.has(id)) return icon;
  return BY_ICONIC[iconic ?? ""] ?? "plant";
}

export const GROUP_ICON: Record<string, TaxonIconKey> = {
  plants: "plant", trees: "conifer", flowers: "flower", ferns: "fern", fungi: "mushroom",
  animals: "mammal", birds: "bird", mammals: "mammal", reptiles: "lizard", amphibians: "frog", fish: "fish",
  insects: "butterfly", spiders: "spider", molluscs: "snail",
};

const markerCache = new Map<string, string>();

/** A round map-marker image (data URL) with the icon in white on a colour. */
export function taxonMarker(key: TaxonIconKey, color: string, size = 34): string {
  const k = `${key}|${color}|${size}`;
  let url = markerCache.get(k);
  if (!url) {
    const inner = TAXON_ICONS[key].replace(/<svg[^>]*>/, "").replace("</svg>", "");
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15.5" fill="${color}" stroke="white" stroke-width="2.5"/><g transform="translate(6.2 6.2) scale(0.9)" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/fill="currentColor"/g, 'fill="white"')}</g></svg>`;
    url = `data:image/svg+xml,${encodeURIComponent(s)}`;
    markerCache.set(k, url);
  }
  return url;
}
