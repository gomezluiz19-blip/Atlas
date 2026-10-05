// What a TV is for. A screen in a living room, a classroom, a site office, a lobby and a meeting room need
// different things from the same Earth, so TV mode asks once ("What's this screen for?"), remembers the
// answer, and gives each room its own playlist and its own tools, always in the same shape: what plays by
// itself, and what the person with the remote can reach for. Names say who it's for, not what we called the
// code. Everything here is pure (no DOM, no globe), so it can be tested and shared with the phone.

export type RoomId = "home" | "classroom" | "ops" | "lobby" | "meeting";
export type SceneId = "live" | "places" | "markets" | "home" | "wherein" | "sites" | "hazards" | "clocks" | "welcome";
export interface Tool { id: string; icon: string; label: string; /** One line the phone shows under it. */ about?: string }
export interface Room { id: RoomId; icon: string; label: string; who: string; about: string; scenes: SceneId[]; tools: string[] }

/** Everything the remote can reach for, in any room. */
export const TOOLS: Record<string, Tool> = {
  search: { id: "search", icon: "⌕", label: "Search", about: "Fly anywhere" },
  trip: { id: "trip", icon: "✈️", label: "Plan a trip", about: "Where, when and who, then the whole journey" },
  trips: { id: "trips", icon: "🧳", label: "My trips", about: "Play a saved journey" },
  myplace: { id: "myplace", icon: "🏠", label: "My place", about: "Home as a hologram, with the day's brief" },
  work: { id: "work", icon: "💼", label: "Work tools", about: "Your industry's tools on the big screen" },
  lesson: { id: "lesson", icon: "📖", label: "Lessons", about: "Present a lesson; your notes stay on the phone" },
  quiz: { id: "quiz", icon: "❓", label: "Class quiz", about: "Questions big for the room, the answers on your phone" },
  wherein: { id: "wherein", icon: "🧭", label: "Where in the world?", about: "A clue, a countdown, then the reveal" },
  timemachine: { id: "timemachine", icon: "⏳", label: "Time machine", about: "The world's borders, year by year" },
  pointer: { id: "pointer", icon: "🔴", label: "Pointer", about: "A laser dot that follows your thumb" },
  spotlight: { id: "spotlight", icon: "🔦", label: "Spotlight", about: "Dim everything but one spot" },
  pen: { id: "pen", icon: "✎", label: "Pen", about: "Draw over the globe" },
  timer: { id: "timer", icon: "⏱", label: "Timer", about: "A countdown the whole room can see" },
  sites: { id: "sites", icon: "📍", label: "Our sites", about: "Every site you run, its time and weather" },
  hazards: { id: "hazards", icon: "⚠️", label: "Hazards near us", about: "Earthquakes near your sites this week" },
  clocks: { id: "clocks", icon: "🕒", label: "World clocks", about: "Local time where you work" },
  welcome: { id: "welcome", icon: "👋", label: "Welcome message", about: "Change what the screen says" },
  present: { id: "present", icon: "🎞", label: "Present", about: "A story or deck, with you as the clicker" },
  "scene:live": { id: "scene:live", icon: "🌍", label: "Live Earth" },
  "scene:places": { id: "scene:places", icon: "🏔", label: "Great places" },
  "scene:markets": { id: "scene:markets", icon: "📈", label: "Markets" },
  "lens:slice": { id: "lens:slice", icon: "⛰", label: "Cut open" },
  "lens:block": { id: "lens:block", icon: "🧊", label: "3D block" },
  "lens:day": { id: "lens:day", icon: "☀️", label: "A day" },
  holo: { id: "holo", icon: "◎", label: "Hologram" },
  wind: { id: "wind", icon: "💨", label: "Wind" },
  room: { id: "room", icon: "▦", label: "This screen is for…" },
  exit: { id: "exit", icon: "⏻", label: "Exit" },
};

export const ROOMS: Room[] = [
  { id: "home", icon: "🛋", label: "Home", who: "For the living room",
    about: "The Earth live, great places, the world's markets, your home and your trips",
    scenes: ["live", "places", "markets", "home"],
    tools: ["search", "trip", "trips", "myplace", "work", "scene:live", "scene:places", "scene:markets", "lens:day", "wind"] },
  { id: "classroom", icon: "🎓", label: "Classroom", who: "For teachers",
    about: "Lessons with your notes on the phone, class quizzes, a pointer and pen, a timer, and the world through time",
    scenes: ["wherein", "places", "live"],
    tools: ["lesson", "quiz", "wherein", "timemachine", "pointer", "spotlight", "pen", "timer", "search"] },
  { id: "ops", icon: "🛰", label: "Operations", who: "For control rooms and site offices",
    about: "Every site you run with its local time and weather, hazards near them, and your Work tools",
    scenes: ["sites", "hazards", "clocks", "live"],
    tools: ["sites", "hazards", "clocks", "work", "search", "pointer", "timer", "wind", "scene:live"] },
  { id: "lobby", icon: "🏨", label: "Lobby", who: "For reception, shops and waiting rooms",
    about: "A welcome, the weather and time here, the world's great places and the Earth live",
    scenes: ["welcome", "places", "clocks", "live"],
    tools: ["welcome", "search", "scene:places", "clocks", "scene:live"] },
  { id: "meeting", icon: "💬", label: "Meeting room", who: "For briefings and reviews",
    about: "Present from your phone, point at the map, search anywhere, and the world's markets and hazards",
    scenes: ["live", "markets", "hazards"],
    tools: ["present", "pointer", "spotlight", "pen", "timer", "search", "work", "sites", "clocks", "scene:markets"] },
];
export const roomOf = (id: string | null | undefined): Room => ROOMS.find((r) => r.id === id) ?? ROOMS[0];

/** The menu on the TV for a room: its own tools, then what every room has (pure). */
export function menuFor(room: Room): Tool[][] {
  return [room.tools.map((t) => TOOLS[t]).filter(Boolean), [TOOLS.room, TOOLS.exit]];
}

export const SCENE_LABELS: Record<SceneId, string> = {
  live: "Live Earth", places: "Great places", markets: "Markets", home: "Home", wherein: "Where in the world?",
  sites: "Our sites", hazards: "Hazards", clocks: "World clocks", welcome: "Welcome",
};

// ---- Sites from Pro workspaces --------------------------------------------------------------------------

/** Where each tool keeps its workspaces on a device, and what to call it on the wall. */
export const WORKSPACES: [key: string, tool: string][] = [
  ["atlas.pro.build.v1", "Build Pro"], ["atlas.pro.con.v1", "Construction"], ["atlas.pro.city.v1", "City Ops"],
  ["atlas.pro.edu.v1", "Schools"], ["atlas.pro.shipping.v1", "Freight"], ["atlas.pro.relief.v1", "Relief"],
  ["atlas.pro.mines.v1", "Mining"], ["atlas.pro.field.v1", "Field Ops"], ["atlas.pro.services.v1", "Field Network"],
  ["atlas.pro.networks.v1", "Business network"], ["atlas.pro.clubs.v1", "Sports"], ["atlas.pro.offices.v1", "Office"],
  ["atlas.work.fields.v1", "Fields"], ["atlas.work.build.v1", "Build"],
];

export interface WallSite { name: string; lon: number; lat: number; tool: string }

/**
 * Every named place in a tool's saved workspaces (pure). Tools store sites in different shapes, so this walks
 * the data for anything with a name and a real longitude and latitude, a few levels deep.
 */
export function sitesIn(data: unknown, tool: string, max = 80): WallSite[] {
  const out: WallSite[] = [], seen = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (out.length >= max || depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    const lon = Number(o.lon ?? o.lng ?? o.longitude), lat = Number(o.lat ?? o.latitude);
    const name = typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : "";
    if (name && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lon === 0 && lat === 0)) {
      const key = `${name.toLowerCase()}|${lon.toFixed(3)}|${lat.toFixed(3)}`;
      if (!seen.has(key)) { seen.add(key); out.push({ name: name.slice(0, 60), lon: +lon.toFixed(4), lat: +lat.toFixed(4), tool }); }
    }
    for (const x of Object.values(o)) if (x && typeof x === "object") walk(x, depth + 1);
  };
  walk(data, 0);
  return out;
}

/** All sites on a device, from a getter for its storage (pure given `get`). Duplicates across tools are dropped. */
export function allSites(get: (key: string) => string | null, max = 60): WallSite[] {
  const out: WallSite[] = [], seen = new Set<string>();
  for (const [key, tool] of WORKSPACES) {
    let data: unknown;
    try { data = JSON.parse(get(key) ?? "null"); } catch { continue; }
    for (const s of sitesIn(data, tool)) {
      const k = `${s.lon.toFixed(3)}|${s.lat.toFixed(3)}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push(s);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Merges sites (from the TV and from a phone), dropping ones at the same spot (pure). */
export function mergeSites(a: WallSite[], b: WallSite[]): WallSite[] {
  const seen = new Set(a.map((s) => `${s.lon.toFixed(3)}|${s.lat.toFixed(3)}`));
  return [...a, ...b.filter((s) => !seen.has(`${s.lon.toFixed(3)}|${s.lat.toFixed(3)}`))];
}

/** The smallest view that shows every site, as a centre and a camera height in metres (pure). */
export function frameSites(sites: { lon: number; lat: number }[]): { lon: number; lat: number; height: number } {
  if (!sites.length) return { lon: 0, lat: 20, height: 18_000_000 };
  const lats = sites.map((s) => s.lat), lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Longitudes around the shortest way (a fleet across the date line stays together).
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = sites.reduce((a, s) => a + Math.cos(rad(s.lon)), 0), y = sites.reduce((a, s) => a + Math.sin(rad(s.lon)), 0);
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  const spread = Math.max(...sites.map((s) => Math.hypot(((((s.lon - lon) % 360) + 540) % 360 - 180) * Math.cos(rad(lat)), s.lat - lat)));
  return { lon, lat, height: Math.min(20_000_000, Math.max(60_000, spread * 111_000 * 2.6)) };
}

// ---- Hazards near sites -------------------------------------------------------------------------------

export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = (d: number) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How far an earthquake of a magnitude is worth knowing about, km (pure): felt widely past 5, locally below. */
export const quakeReachKm = (mag: number) => Math.round(Math.min(1500, 25 * 10 ** (0.35 * (mag - 2.5))));

export interface Near<Q> { quake: Q; site: WallSite; km: number }
/** Earthquakes within reach of a site, the nearest site for each, biggest first (pure). */
export function quakesNear<Q extends { lon: number; lat: number; mag: number }>(quakes: Q[], sites: WallSite[]): Near<Q>[] {
  const out: Near<Q>[] = [];
  for (const q of quakes) {
    let best: Near<Q> | null = null;
    for (const s of sites) { const km = kmBetween(q, s); if (km <= quakeReachKm(q.mag) && (!best || km < best.km)) best = { quake: q, site: s, km }; }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.quake.mag - a.quake.mag);
}

// ---- Clocks -------------------------------------------------------------------------------------------

export const DEFAULT_CLOCKS: { name: string; tz: string }[] = [
  { name: "Los Angeles", tz: "America/Los_Angeles" }, { name: "New York", tz: "America/New_York" }, { name: "São Paulo", tz: "America/Sao_Paulo" },
  { name: "London", tz: "Europe/London" }, { name: "Lagos", tz: "Africa/Lagos" }, { name: "Dubai", tz: "Asia/Dubai" },
  { name: "Mumbai", tz: "Asia/Kolkata" }, { name: "Singapore", tz: "Asia/Singapore" }, { name: "Tokyo", tz: "Asia/Tokyo" }, { name: "Sydney", tz: "Australia/Sydney" },
];

/** "14:05" and the day's part, in a time zone (pure given `now`). */
export function localTime(tz: string, now = new Date()): { time: string; hour: number; day: string } {
  try {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
    const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
    return { time: `${parts.hour}:${parts.minute}`, hour: Number(parts.hour), day: parts.weekday };
  } catch { return { time: "--:--", hour: 12, day: "" }; }
}
/** Whether people are likely at work there (pure): 8 to 18 on a weekday. */
export const workingHours = (hour: number, day: string) => hour >= 8 && hour < 18 && day !== "Sat" && day !== "Sun";

// ---- Classroom -----------------------------------------------------------------------------------------

/** Countdown text: "4:05", "0:09" (pure). */
export const clockText = (seconds: number) => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The next year the borders exist for, moving `dir` steps through the list (pure). */
export function stepYear(years: number[], year: number, dir: 1 | -1): number {
  const i = years.findIndex((y) => y >= year);
  const at = i < 0 ? years.length - 1 : years[i] === year ? i : dir > 0 ? i - 1 : i;
  return years[Math.min(years.length - 1, Math.max(0, at + dir))];
}

/** A quick quiz from a list of places, four choices each (pure given `rnd`). */
export function placeQuiz(places: { name: string; hint: string; lon: number; lat: number }[], n = 8, rnd: () => number = Math.random) {
  const pool = [...places].sort(() => rnd() - 0.5);
  return pool.slice(0, n).map((p, i) => {
    const others = pool.filter((x) => x !== p).sort(() => rnd() - 0.5).slice(0, 3).map((x) => x.name);
    const options = [...others, p.name].sort(() => rnd() - 0.5);
    return { id: `q${i}`, kind: "choice" as const, prompt: p.hint, options, answer: options.indexOf(p.name), place: { lon: p.lon, lat: p.lat, name: p.name } };
  });
}

/** Splits a long message into parts small enough for the relay, and puts them back together (pure). */
export function splitText(text: string, size = 2800): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}
export function joiner() {
  const parts = new Map<string, { got: string[]; have: Set<number> }>();
  return (key: string, i: number, n: number, data: string): string | null => {
    const p = parts.get(key) ?? { got: Array.from({ length: n }, () => ""), have: new Set<number>() };
    p.got[i] = data; p.have.add(i); parts.set(key, p);
    if (p.have.size < n) return null;
    parts.delete(key);
    return p.got.join("");
  };
}
