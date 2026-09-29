// Profiles: a page about you, made of places. Your Top 8 (the places you'd
// show a friend first), the spots you love by kind (restaurants, cafés,
// bars, trails, beaches…), a journal pinned to places, the lenses you've
// made, and a guestbook. Pages wear a skin, like the personal pages of the
// early web, and travel as links until Atlas's servers are switched on.
export type Role = "explorer" | "student" | "teacher" | "owner";
export const ROLES: { id: Role; label: string; short?: string; emoji: string; about: string }[] = [
  { id: "explorer", label: "Explorer", emoji: "🧭", about: "I love maps, places and the planet" },
  { id: "student", label: "Student", emoji: "🎒", about: "Games, a passport and places to learn" },
  { id: "teacher", label: "Teacher", emoji: "🍎", about: "Lessons, quizzes and field trips" },
  { id: "owner", label: "Home, farm or site", short: "Owner", emoji: "🏡", about: "A daily brief for my own place" },
];

export type SpotKind = "restaurant" | "cafe" | "bar" | "park" | "trail" | "view" | "beach" | "surf" | "museum" | "music" | "market" | "sky" | "wild" | "place";
export const SPOT_KINDS: Record<SpotKind, { emoji: string; label: string; plural: string }> = {
  restaurant: { emoji: "🍽️", label: "Restaurant", plural: "Places to eat" },
  cafe: { emoji: "☕", label: "Café", plural: "Cafés" },
  bar: { emoji: "🍸", label: "Bar", plural: "Bars" },
  park: { emoji: "🌳", label: "Park", plural: "Parks and gardens" },
  trail: { emoji: "🥾", label: "Trail", plural: "Trails and hikes" },
  view: { emoji: "🌄", label: "Viewpoint", plural: "Views" },
  beach: { emoji: "🏖️", label: "Beach", plural: "Beaches" },
  surf: { emoji: "🏄", label: "Surf break", plural: "Surf" },
  museum: { emoji: "🏛️", label: "Museum", plural: "Museums" },
  music: { emoji: "🎶", label: "Music venue", plural: "Music" },
  market: { emoji: "🧺", label: "Market or shop", plural: "Markets and shops" },
  sky: { emoji: "🌌", label: "Dark sky", plural: "Dark skies" },
  wild: { emoji: "🐦", label: "Wildlife spot", plural: "Wildlife" },
  place: { emoji: "📍", label: "Place", plural: "Places" },
};

export interface Spot {
  id: string;
  name: string;
  kind: SpotKind;
  lon: number;
  lat: number;
  /** Where it is, in words ("Lisbon, Portugal"). */
  where?: string;
  country?: string;
  note?: string;
  /** Its Atlas page, when it has one. */
  slug?: string;
}

export interface Post {
  id: string;
  at: string;
  title: string;
  body: string;
  /** The spot it's about (an id in spots), if any. */
  spot?: string;
  /** Field notes: a photo ("idb:…" on the device, or a web address), where it was, and what it is. */
  photo?: string;
  lon?: number;
  lat?: number;
  kind?: string;
}

export interface Signature { from: string; name: string; text: string; at: string }

/** A guide: some of your places, in order, with what to do at each ("Lisbon in a day"). */
export interface GuideStop { spot: string; note: string; time?: string }
export interface Guide { id: string; title: string; blurb: string; stops: GuideStop[]; updated: string }

export type Skin = "dawn" | "ocean" | "forest" | "desert" | "night" | "paper" | "2006";
export const SKINS: { id: Skin; label: string }[] = [
  { id: "dawn", label: "Dawn" }, { id: "ocean", label: "Ocean" }, { id: "forest", label: "Forest" }, { id: "desert", label: "Desert" },
  { id: "night", label: "Night sky" }, { id: "paper", label: "Paper" }, { id: "2006", label: "2006" },
];
export const AVATAR_EMOJI = ["🦉", "🦊", "🐢", "🐋", "🦅", "🌵", "🌋", "🏔️", "🌊", "🌙", "⭐", "🌻", "🍄", "🐝", "🦋", "🚲", "🛶", "🎒", "📷", "🎸"];
export const AVATAR_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#a2845e", "#5e5ce6"];

export interface Profile {
  handle: string;
  name: string;
  role: Role;
  avatar: { emoji: string; color: string };
  bio: string;
  /** The one line at the top: what they're up to. */
  now?: string;
  home?: { name: string; lon: number; lat: number };
  skin: Skin;
  /** The banner: the place seen from above. */
  banner?: { lon: number; lat: number };
  /** Up to eight spot ids, in order. */
  top: string[];
  spots: Spot[];
  posts: Post[];
  /** Ids of lenses this person made. */
  lenses: string[];
  guestbook: Signature[];
  guides?: Guide[];
  joined: string;
  /** Shipped with Atlas as an example. */
  demo?: boolean;
}

export const TOP = 8;

export const slugHandle = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9._]+/g, "").replace(/^[._]+|[._]+$/g, "").slice(0, 24);

export function blankProfile(name: string, handle: string, role: Role): Profile {
  return {
    handle, name, role, bio: "", skin: role === "student" ? "2006" : role === "teacher" ? "paper" : role === "owner" ? "forest" : "dawn",
    avatar: { emoji: AVATAR_EMOJI[Math.floor(Math.random() * AVATAR_EMOJI.length)], color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] },
    top: [], spots: [], posts: [], lenses: [], guestbook: [], joined: new Date().toISOString().slice(0, 10),
  };
}

/** The spots in the Top 8, in order (missing ones skipped). */
export const topSpots = (p: Profile) => p.top.map((id) => p.spots.find((s) => s.id === id)).filter((s): s is Spot => !!s);

/** Countries among a profile's spots. */
export const countriesOf = (p: Profile) => new Set(p.spots.map((s) => s.country).filter(Boolean)).size;

/** Spots grouped by kind, in the order kinds are listed. */
export function byKind(p: Profile): { kind: SpotKind; spots: Spot[] }[] {
  return (Object.keys(SPOT_KINDS) as SpotKind[]).map((kind) => ({ kind, spots: p.spots.filter((s) => s.kind === kind) })).filter((g) => g.spots.length);
}

/** Checks and tidies a profile from a link or storage (anything malformed is dropped). */
export function profileFromJson(v: unknown): Profile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown, max = 400) => (typeof x === "string" ? x.slice(0, max) : "");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
  const handle = slugHandle(str(o.handle, 40));
  if (!handle || !str(o.name)) return null;
  const spots: Spot[] = (Array.isArray(o.spots) ? o.spots : []).slice(0, 200).flatMap((x: Record<string, unknown>) => {
    const lon = num(x?.lon), lat = num(x?.lat);
    if (!x || !str(x.id) || !str(x.name) || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return [];
    const kind = (str(x.kind) in SPOT_KINDS ? str(x.kind) : "place") as SpotKind;
    return [{ id: str(x.id, 40), name: str(x.name, 120), kind, lon, lat, where: str(x.where, 120) || undefined, country: str(x.country, 80) || undefined, note: str(x.note, 600) || undefined, slug: str(x.slug, 120) || undefined }];
  });
  const ids = new Set(spots.map((s) => s.id));
  const role = (["explorer", "student", "teacher", "owner"].includes(str(o.role)) ? str(o.role) : "explorer") as Role;
  const skin = (SKINS.some((s) => s.id === o.skin) ? o.skin : "dawn") as Skin;
  const av = (o.avatar ?? {}) as Record<string, unknown>;
  const home = o.home as Record<string, unknown> | undefined, banner = o.banner as Record<string, unknown> | undefined;
  return {
    handle, name: str(o.name, 60), role, skin,
    avatar: { emoji: str(av.emoji, 8) || "🧭", color: /^#[0-9a-f]{6}$/i.test(str(av.color)) ? str(av.color) : "#0a84ff" },
    bio: str(o.bio, 1200), now: str(o.now, 140) || undefined,
    home: home && Number.isFinite(num(home.lon)) ? { name: str(home.name, 120), lon: num(home.lon), lat: num(home.lat) } : undefined,
    banner: banner && Number.isFinite(num(banner.lon)) ? { lon: num(banner.lon), lat: num(banner.lat) } : undefined,
    top: (Array.isArray(o.top) ? o.top : []).map((x) => str(x, 40)).filter((id) => ids.has(id)).slice(0, TOP),
    spots,
    posts: (Array.isArray(o.posts) ? o.posts : []).slice(0, 100).flatMap((x: Record<string, unknown>) => x && str(x.id) && (str(x.title) || str(x.body)) ? [{ id: str(x.id, 40), at: str(x.at, 30), title: str(x.title, 140), body: str(x.body, 4000), spot: ids.has(str(x.spot, 40)) ? str(x.spot, 40) : undefined,
      photo: /^(https:\/\/|idb:[a-z0-9]+$)/.test(str(x.photo, 500)) ? str(x.photo, 500) : undefined,
      ...(Math.abs(num(x.lat)) <= 90 && Math.abs(num(x.lon)) <= 180 ? { lon: num(x.lon), lat: num(x.lat) } : {}),
      kind: str(x.kind, 20) || undefined }] : []),
    lenses: (Array.isArray(o.lenses) ? o.lenses : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 40),
    guestbook: (Array.isArray(o.guestbook) ? o.guestbook : []).slice(0, 100).flatMap((x: Record<string, unknown>) => x && str(x.text) ? [{ from: slugHandle(str(x.from, 40)), name: str(x.name, 60), text: str(x.text, 500), at: str(x.at, 30) }] : []),
    guides: (Array.isArray(o.guides) ? o.guides : []).slice(0, 20).flatMap((g: Record<string, unknown>) => {
      if (!g || !str(g.id) || !str(g.title)) return [];
      const stops = (Array.isArray(g.stops) ? g.stops : []).slice(0, 30).flatMap((x: Record<string, unknown>) => x && ids.has(str(x.spot, 40)) ? [{ spot: str(x.spot, 40), note: str(x.note, 1500), time: str(x.time, 30) || undefined }] : []);
      return stops.length ? [{ id: str(g.id, 40), title: str(g.title, 80), blurb: str(g.blurb, 300), stops, updated: str(g.updated, 30) }] : [];
    }),
    joined: str(o.joined, 30) || new Date().toISOString().slice(0, 10),
  };
}

/** A friendly date: "3 May 2026". */
export const dayText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
