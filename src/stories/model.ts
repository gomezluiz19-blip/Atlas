// Stories: presentations made to be shared. A story is a deck of places with
// an author, topics and a place on the map, links to other stories ("continue
// with the Aswan High Dam"), and a remix trail: every remix credits the story
// it came from, and that one's source, so a good idea keeps its authors as it
// spreads. Pure functions only; the library (library.ts) stores and finds them.
import { deckFromJson, type Deck, type Slide } from "../work/presentModel";

export interface Author { name: string }
export interface StoryRef { id: string; title: string; author: string }

export interface Story {
  /** Library id (for stories only on this device: "local:…"). */
  id: string;
  title: string;
  summary: string;
  author: Author;
  tags: string[];
  /** Who it's for: "Ages 8–11", "University", "Everyone". */
  level?: string;
  slides: Slide[];
  /** The story this was remixed from, then that one's source, nearest first (up to 5). */
  lineage: StoryRef[];
  /** Other stories this one leads to. */
  links: StoryRef[];
  /** West, south, east, north of its places (for "stories here"). */
  bbox: [number, number, number, number];
  created: number;
  updated: number;
  stats: { uses: number; remixes: number; likes: number };
  featured?: boolean;
}

/** What a list shows. */
export type StoryCard = Omit<Story, "slides"> & { slideCount: number; cover?: string };

export const TOPICS = ["Rivers and water", "History", "Earth and rocks", "Climate", "Wildlife", "Cities", "Countries", "Space", "Exploration"] as const;
export const LEVELS = ["Ages 5–7", "Ages 8–11", "Ages 11–14", "Ages 14–18", "University", "Everyone"] as const;

export function bboxOf(slides: Slide[]): [number, number, number, number] {
  if (!slides.length) return [0, 0, 0, 0];
  let w = 180, s = 90, e = -180, n = -90;
  for (const sl of slides) {
    // Wide views count for more ground than the point under the camera.
    const r = Math.min(40, sl.camera.height / 222_000);
    w = Math.min(w, sl.camera.lon - r); e = Math.max(e, sl.camera.lon + r);
    s = Math.min(s, sl.camera.lat - r / 2); n = Math.max(n, sl.camera.lat + r / 2);
  }
  return [Math.max(-180, w), Math.max(-90, s), Math.min(180, e), Math.min(90, n)];
}

export const toCard = (s: Story): StoryCard => {
  const { slides, ...rest } = s;
  return { ...rest, slideCount: slides.length, cover: slides.find((x) => x.thumb)?.thumb };
};

export const refOf = (s: Pick<Story, "id" | "title" | "author">): StoryRef => ({ id: s.id, title: s.title, author: s.author.name });

/** A story from a deck the user made. */
export function storyFromDeck(d: Deck, meta: Partial<Story>, now = Date.now()): Story {
  return {
    id: meta.id ?? `local:${d.id}`,
    title: meta.title ?? d.name,
    summary: meta.summary ?? "",
    author: meta.author ?? { name: "Anonymous" },
    tags: meta.tags ?? [],
    level: meta.level,
    slides: d.slides,
    lineage: meta.lineage ?? [],
    links: meta.links ?? [],
    bbox: bboxOf(d.slides),
    created: meta.created ?? now,
    updated: now,
    stats: meta.stats ?? { uses: 0, remixes: 0, likes: 0 },
  };
}

/** A remix: your own editable copy, crediting where it came from. */
export function remixOf(s: Story, newId: () => string): { deck: Deck; lineage: StoryRef[]; links: StoryRef[]; tags: string[]; level?: string; summary: string } {
  return {
    deck: { id: newId(), name: s.title, created: Date.now(), slides: s.slides.map((x) => ({ ...x, id: newId() })) },
    lineage: [refOf(s), ...s.lineage].slice(0, 5),
    links: [...s.links],
    tags: [...s.tags],
    level: s.level,
    summary: s.summary,
  };
}

/** "Remixed from The Nile by Ms Adeyemi, from … by Terreno". */
export function creditLine(lineage: StoryRef[]): string {
  if (!lineage.length) return "";
  return "Remixed from " + lineage.map((r, i) => `${i ? "from " : ""}“${r.title}” by ${r.author}`).join(", ");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const refs = (v: unknown): StoryRef[] => (Array.isArray(v) ? v : []).flatMap((r) => (r && typeof r.id === "string" && typeof r.title === "string" ? [{ id: str(r.id, 80), title: str(r.title, 140), author: str(r.author, 80) || "Someone" }] : [])).slice(0, 12);

/** Reads a story from untrusted JSON (a link, a file, the library), rejecting anything malformed. */
export function storyFromJson(data: unknown, newId: () => string): Story | null {
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const deck = deckFromJson({ slides: o.slides }, newId);
  if (!deck || !deck.slides.length) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const st = (o.stats ?? {}) as Record<string, unknown>;
  const title = str(o.title, 140).trim();
  return {
    id: str(o.id, 80) || `local:${newId()}`,
    title: title || "Untitled story",
    summary: str(o.summary, 600),
    author: { name: str((o.author as Record<string, unknown> | undefined)?.name, 80).trim() || "Anonymous" },
    tags: (Array.isArray(o.tags) ? o.tags : []).filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 8),
    level: str(o.level, 40) || undefined,
    slides: deck.slides,
    lineage: refs(o.lineage).slice(0, 5),
    links: refs(o.links),
    bbox: bboxOf(deck.slides),
    created: n(o.created) || Date.now(),
    updated: n(o.updated) || Date.now(),
    stats: { uses: n(st.uses), remixes: n(st.remixes), likes: n(st.likes) },
    featured: o.featured === true || undefined,
  };
}

const words = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);

export interface Query { text?: string; tag?: string; bbox?: [number, number, number, number]; sort?: "popular" | "new" }

const overlaps = (a: [number, number, number, number], b: [number, number, number, number]) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Finds and ranks stories: words in the title count most, then topics, summary and slides; well-used stories rise. */
type Searchable = Pick<StoryCard, "title" | "tags" | "summary" | "author" | "bbox" | "stats" | "updated" | "featured"> & { slides?: Slide[] };
export function search<T extends Searchable>(all: T[], q: Query): T[] {
  const qw = words(q.text ?? "");
  const scored = all.flatMap((s) => {
    if (q.tag && !s.tags.includes(q.tag)) return [];
    if (q.bbox && !overlaps(s.bbox, q.bbox)) return [];
    let score = 0;
    if (qw.length) {
      const title = words(s.title), tags = words(s.tags.join(" ")), body = words(`${s.summary} ${s.author.name} ${(s.slides ?? []).map((x) => `${x.title} ${x.text}`).join(" ")}`);
      for (const w of qw) {
        const hit = (list: string[]) => list.some((x) => x === w || (w.length > 3 && x.startsWith(w)));
        if (hit(title)) score += 5; else if (hit(tags)) score += 3; else if (hit(body)) score += 1; else return [];
      }
    }
    const pop = Math.log1p(s.stats.uses + 3 * s.stats.remixes + 2 * s.stats.likes);
    return [{ s, score: score * 2 + (q.sort === "new" ? 0 : pop) + (s.featured ? 0.5 : 0), t: s.updated }];
  });
  scored.sort((a, b) => (q.sort === "new" ? b.t - a.t : b.score - a.score || b.t - a.t));
  return scored.map((x) => x.s);
}

// ---- Links that carry a whole story (no server needed) -------------------------------------

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Packs a story (without slide pictures, which the player redraws) into a URL-safe string. */
export async function packStory(s: Story): Promise<string> {
  const lean = { ...s, id: s.id.startsWith("local:") ? "" : s.id, slides: s.slides.map((x) => ({ ...x, thumb: undefined })) };
  const raw = new TextEncoder().encode(JSON.stringify(lean));
  if (typeof CompressionStream === "undefined") return "j" + b64url(raw);
  return "z" + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
}

export async function unpackStory(packed: string, newId: () => string): Promise<Story | null> {
  try {
    const bytes = unb64url(packed.slice(1));
    const raw = packed[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return storyFromJson(JSON.parse(new TextDecoder().decode(raw)), newId);
  } catch {
    return null;
  }
}
