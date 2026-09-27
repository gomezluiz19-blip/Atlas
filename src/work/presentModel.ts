// Presentations: slides that are places on the globe (a camera view), each with
// a title, a few lines of text, and optionally the world's borders in a past
// year and map layers switched on.
export interface SlideCamera { lon: number; lat: number; height: number; heading: number; pitch: number; roll: number }

export interface Slide {
  id: string;
  title: string;
  text: string;
  camera: SlideCamera;
  /** Show the borders of this year (see data/history). */
  year?: number;
  /** Map layers (app action ids) to switch on for this slide. */
  layers?: string[];
  /** Slowly circle the place while this slide is shown. */
  orbit?: boolean;
  /** Seconds this slide stays up in a tour. */
  seconds?: number;
  thumb?: string;
  /** Teacher's notes: shown only when the presenter asks for them. */
  notes?: string;
}

export interface Deck { id: string; name: string; created: number; slides: Slide[] }

const deg = Math.PI / 180;
/** A view looking down at a place from `height` metres, tilted a little. */
export const overhead = (lon: number, lat: number, height: number, tilt = 0): SlideCamera =>
  ({ lon, lat: lat - (tilt ? (height * Math.tan(tilt * deg)) / 111_000 : 0), height, heading: 0, pitch: (-90 + tilt) * deg, roll: 0 });

/** Ready-made starting decks for common school topics. */
export const TEMPLATES: { name: string; about: string; slides: Omit<Slide, "id">[] }[] = [
  {
    name: "The Roman Empire", about: "From the city of Rome to an empire around the Mediterranean",
    slides: [
      { title: "Rome, a city on seven hills", text: "Rome began as a small town beside the River Tiber, in central Italy.", camera: overhead(12.49, 41.89, 25_000, 40), year: -500, orbit: true },
      { title: "Ruling Italy", text: "By 300 BC Rome controlled most of the Italian peninsula.", camera: overhead(12.5, 41.5, 1_800_000), year: -300 },
      { title: "An empire around a sea", text: "By AD 100 the empire circled the Mediterranean, which the Romans called Mare Nostrum, “our sea”.", camera: overhead(15, 38, 6_500_000), year: 100 },
      { title: "East and West", text: "By AD 400 the empire had split in two, ruled from Rome and from Constantinople.", camera: overhead(20, 40, 6_000_000), year: 400 },
    ],
  },
  {
    name: "World War I", about: "Europe's empires in 1914, and the new countries of 1920",
    slides: [
      { title: "Europe in 1914", text: "Europe was divided between great empires: Britain, France, Germany, Austria-Hungary, Russia and the Ottoman Empire.", camera: overhead(18, 48, 5_500_000), year: 1914 },
      { title: "The Western Front", text: "Trenches ran from the North Sea to Switzerland, through Belgium and France.", camera: overhead(3.5, 49.8, 700_000, 30), year: 1914 },
      { title: "A new map in 1920", text: "After the war, new countries appeared: Poland, Czechoslovakia, Yugoslavia, and the Baltic states.", camera: overhead(20, 50, 4_500_000), year: 1920 },
    ],
  },
  {
    name: "The age of exploration", about: "The world in 1492 and 1530, as sailors crossed the oceans",
    slides: [
      { title: "The world in 1492", text: "Columbus sailed west from Spain, hoping to reach Asia.", camera: overhead(-30, 30, 14_000_000), year: 1492 },
      { title: "Spain and Portugal", text: "The two kingdoms raced to find sea routes to the spices of Asia.", camera: overhead(-6, 40, 1_600_000), year: 1492 },
      { title: "The Americas in 1530", text: "Within forty years, Spain had conquered the Aztec Empire in Mexico and was reaching the Inca Empire in the Andes.", camera: overhead(-80, 5, 11_000_000), year: 1530 },
    ],
  },
];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads a deck from JSON (an exported file), rejecting anything malformed. */
export function deckFromJson(data: unknown, id: () => string): Deck | null {
  const o = data as Partial<Deck> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.slides)) return null;
  const slides: Slide[] = o.slides.flatMap((s): Slide[] => {
    const c = s?.camera;
    if (!c || ![c.lon, c.lat, c.height, c.heading, c.pitch, c.roll].every(isNum)) return [];
    return [{
      id: id(),
      title: String(s.title ?? ""),
      text: String(s.text ?? ""),
      camera: { lon: c.lon, lat: c.lat, height: c.height, heading: c.heading, pitch: c.pitch, roll: c.roll },
      year: isNum(s.year) ? s.year : undefined,
      layers: Array.isArray(s.layers) ? s.layers.filter((x): x is string => typeof x === "string") : undefined,
      orbit: s.orbit === true || undefined,
      seconds: isNum(s.seconds) && s.seconds > 0 ? s.seconds : undefined,
      thumb: typeof s.thumb === "string" && s.thumb.startsWith("data:image/") ? s.thumb : undefined,
      notes: typeof s.notes === "string" && s.notes ? s.notes : undefined,
    }];
  });
  return { id: id(), name: String(o.name ?? "Imported presentation"), created: Date.now(), slides };
}

/** How long a slide stays up in a tour: its own setting, else by how much there is to read. */
export const slideSeconds = (s: Slide) => s.seconds ?? Math.min(20, Math.max(6, 4 + (s.title.length + s.text.length) / 18));
