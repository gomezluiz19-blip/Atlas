// Where stories live. With a Supabase project configured (VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY; see docs/stories-backend.md), stories are published
// to one shared library that everyone searches, uses and remixes. Without it,
// the library is the featured stories that ship with Terreno, the stories made
// on this device, and any story opened from a link; sharing still works,
// because a link can carry the whole story.
import { config } from "../config";
import { FEATURED } from "../content/stories";
import { newId } from "../work/store";
import { search, storyFromJson, toCard, type Query, type Story, type StoryCard } from "./model";

export interface Library {
  /** "shared": one library for everyone; "device": featured + this device + links. */
  readonly kind: "shared" | "device";
  find(q: Query): Promise<StoryCard[]>;
  get(id: string): Promise<Story | null>;
  /** Publishes (or, for a story you published before, updates) and returns its id. */
  publish(s: Story): Promise<string>;
  count(id: string, what: "use" | "remix" | "like" | "report"): void;
}

const read = <T>(key: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

const MINE = "atlas.stories.mine.v1";      // stories published from this device
const SEEN = "atlas.stories.seen.v1";      // stories opened from links
const KEYS = "atlas.stories.keys.v1";      // edit keys for stories published to the shared library
const LIKED = "atlas.stories.liked.v1";
const COUNTS = "atlas.stories.counts.v1";

export const liked = (id: string) => read<string[]>(LIKED, []).includes(id);
export const markLiked = (id: string) => write(LIKED, [...new Set([...read<string[]>(LIKED, []), id])]);
/** Stories this device published (so their authors can update them). */
export const mine = (): Story[] => read<unknown[]>(MINE, []).flatMap((x) => storyFromJson(x, newId) ?? []);
export const isMine = (id: string) => mine().some((s) => s.id === id) || id in read<Record<string, string>>(KEYS, {});

/** Keeps a story opened from a link, so it can be found again here. */
export function remember(s: Story) {
  const seen = read<unknown[]>(SEEN, []).flatMap((x) => storyFromJson(x, newId) ?? []).filter((x) => x.id !== s.id);
  write(SEEN, [s, ...seen].slice(0, 40));
}

const featured = () => FEATURED.map((s) => storyFromJson({ ...s, featured: true }, newId)!).filter(Boolean);

function localAll(): Story[] {
  const counts = read<Record<string, Story["stats"]>>(COUNTS, {});
  const all = [...mine(), ...read<unknown[]>(SEEN, []).flatMap((x) => storyFromJson(x, newId) ?? []), ...featured()];
  const seenIds = new Set<string>();
  return all.filter((s) => (seenIds.has(s.id) ? false : (seenIds.add(s.id), true))).map((s) => {
    const c = counts[s.id];
    return c ? { ...s, stats: { uses: s.stats.uses + c.uses, remixes: s.stats.remixes + c.remixes, likes: s.stats.likes + c.likes } } : s;
  });
}

class DeviceLibrary implements Library {
  readonly kind = "device" as const;
  async find(q: Query) { return search(localAll(), q).map(toCard); }
  async get(id: string) { return localAll().find((s) => s.id === id) ?? null; }
  async publish(s: Story) {
    const id = s.id.startsWith("local:") ? s.id : `local:${newId()}`;
    const saved = { ...s, id, updated: Date.now() };
    write(MINE, [saved, ...mine().filter((x) => x.id !== id)]);
    return id;
  }
  count(id: string, what: "use" | "remix" | "like" | "report") {
    if (what === "report") return;
    const counts = read<Record<string, Story["stats"]>>(COUNTS, {});
    const c = (counts[id] ??= { uses: 0, remixes: 0, likes: 0 });
    c[what === "use" ? "uses" : what === "remix" ? "remixes" : "likes"]++;
    write(COUNTS, counts);
  }
}

/** The shared library on Supabase (PostgREST + three small functions; see docs/stories-backend.sql). */
class SharedLibrary implements Library {
  readonly kind = "shared" as const;
  private device = new DeviceLibrary();
  constructor(private url: string, private key: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Story library: HTTP ${res.status}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private static card(r: Record<string, unknown>): StoryCard | null {
    const s = storyFromJson({ ...r, slides: [{ title: "", text: "", camera: { lon: 0, lat: 0, height: 1, heading: 0, pitch: 0, roll: 0 } }], created: Date.parse(String(r.created_at)), updated: Date.parse(String(r.updated_at)), stats: { uses: r.uses, remixes: r.remixes, likes: r.likes } }, newId);
    if (!s) return null;
    const bbox: [number, number, number, number] = [Number(r.west), Number(r.south), Number(r.east), Number(r.north)];
    return { ...toCard(s), id: String(r.id), bbox, slideCount: Number(r.slide_count) || 0, cover: typeof r.cover === "string" && r.cover.startsWith("data:image/") ? r.cover : undefined };
  }

  async find(q: Query): Promise<StoryCard[]> {
    const p = new URLSearchParams({ select: "id,title,summary,author,tags,level,lineage,links,west,south,east,north,created_at,updated_at,uses,remixes,likes,slide_count,cover", limit: "60" });
    p.set("order", q.sort === "new" ? "updated_at.desc" : "score.desc,updated_at.desc");
    if (q.text?.trim()) p.set("search", `wfts(simple).${q.text.trim()}`);
    if (q.tag) p.set("tags", `cs.{"${q.tag.replace(/"/g, "")}"}`);
    if (q.bbox) { const [w, s, e, n] = q.bbox; p.append("west", `lte.${e}`); p.append("east", `gte.${w}`); p.append("south", `lte.${n}`); p.append("north", `gte.${s}`); }
    try {
      const rows = await this.call<Record<string, unknown>[]>(`stories?${p}`);
      const shared = rows.flatMap((r) => SharedLibrary.card(r) ?? []);
      // Featured stories and this device's own come along too, without duplicates.
      const local = await this.device.find(q);
      const ids = new Set(shared.map((s) => s.id));
      return [...shared, ...local.filter((s) => !ids.has(s.id) && (s.featured || s.id.startsWith("local:")))];
    } catch {
      return this.device.find(q);
    }
  }

  async get(id: string): Promise<Story | null> {
    if (id.startsWith("local:") || FEATURED.some((f) => f.id === id)) return this.device.get(id);
    const [r] = await this.call<Record<string, unknown>[]>(`stories?id=eq.${encodeURIComponent(id)}&select=id,body,created_at,updated_at,uses,remixes,likes`).catch(() => []);
    if (!r) return this.device.get(id);
    return storyFromJson({ ...(r.body as object), id: r.id, created: Date.parse(String(r.created_at)), updated: Date.parse(String(r.updated_at)), stats: { uses: r.uses, remixes: r.remixes, likes: r.likes } }, newId);
  }

  async publish(s: Story): Promise<string> {
    const keys = read<Record<string, string>>(KEYS, {});
    // Slide pictures stay on the device except the cover (the player draws them again).
    const body = { ...s, slides: s.slides.map((x, i) => ({ ...x, thumb: i === 0 ? x.thumb : undefined })) };
    if (!s.id.startsWith("local:") && keys[s.id]) {
      await this.call("rpc/update_story", { method: "POST", body: JSON.stringify({ p_id: s.id, p_key: keys[s.id], p: body }) });
      return s.id;
    }
    const key = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const id = await this.call<string>("rpc/publish_story", { method: "POST", body: JSON.stringify({ p: body, p_key: key }) });
    keys[id] = key;
    write(KEYS, keys);
    write(MINE, [{ ...s, id }, ...mine().filter((x) => x.id !== s.id && x.id !== id)]);
    return id;
  }

  count(id: string, what: "use" | "remix" | "like" | "report") {
    if (id.startsWith("local:") || FEATURED.some((f) => f.id === id)) return this.device.count(id, what);
    void this.call("rpc/bump", { method: "POST", body: JSON.stringify({ p_id: id, p_what: what }) }).catch(() => {});
  }
}

let lib: Library | null = null;
export function library(): Library {
  lib ??= config.supabaseUrl && config.supabaseKey ? new SharedLibrary(config.supabaseUrl, config.supabaseKey) : new DeviceLibrary();
  return lib;
}
