// The story library in Make › Stories: find a story (by words, topic, or the
// part of the world on the map), play it, teach with it, remix it into your
// own, and publish your own for others to find. Every remix credits where it
// came from, and stories point on to other stories.
import type { App } from "../app";
import { copyText } from "../app";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { decks, flyToView, openBorders, openDeck, openFile, play, saveDeck } from "../work/present";
import type { Deck } from "../work/presentModel";
import { newId } from "../work/store";
import { isMine, library, liked, markLiked, remember } from "./library";
import { creditLine, LEVELS, packStory, remixOf, storyFromDeck, TOPICS, type Query, type Story, type StoryCard, type StoryRef } from "./model";
import { iconFor, labelled } from "../ui/glyph";

// ---- What a deck needs to be a story (kept beside the deck) ------------------------------------

export interface DeckMeta { storyId?: string; summary: string; tags: string[]; level?: string; lineage: StoryRef[]; links: StoryRef[] }
const META = "atlas.stories.deckmeta.v1";
const readMeta = (): Record<string, DeckMeta> => { try { return JSON.parse(localStorage.getItem(META) ?? "{}") ?? {}; } catch { return {}; } };
export const deckMeta = (deckId: string): DeckMeta => readMeta()[deckId] ?? { summary: "", tags: [], lineage: [], links: [] };
export const setDeckMeta = (deckId: string, m: DeckMeta) => { const all = readMeta(); all[deckId] = m; try { localStorage.setItem(META, JSON.stringify(all)); } catch { /* storage full */ } };
const authorName = () => { try { return localStorage.getItem("atlas.stories.author") ?? ""; } catch { return ""; } };
const setAuthorName = (v: string) => { try { localStorage.setItem("atlas.stories.author", v); } catch { /* ignore */ } };

const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
const TOPIC_EMOJI: Record<string, string> = { "Rivers and water": "🌊", History: "🏛️", "Earth and rocks": "⛰️", Climate: "🌦️", Wildlife: "🦓", Cities: "🏙️", Countries: "🗺️", Space: "🪐", Exploration: "🧭" };

/** A link that opens the story: its library id when it's shared, else the whole story packed in. */
async function shareLink(s: Story): Promise<string> {
  const base = `${location.origin}${location.pathname}`;
  if (library().kind === "shared" && !s.id.startsWith("local:")) return `${base}#story=${encodeURIComponent(s.id)}`;
  if (s.featured) return `${base}#story=${encodeURIComponent(s.id)}`;
  return `${base}#s=${await packStory(s)}`;
}

// ---- Cards --------------------------------------------------------------------------------------

function card(s: StoryCard, open: () => void): HTMLElement {
  const emoji = TOPIC_EMOJI[s.tags[0]] ?? "🌍";
  return h("button", { class: "story-card", onclick: open },
    h("span", { class: "story-cover" }, s.cover ? h("img", { src: s.cover, alt: "", loading: "lazy" }) : h("span", { class: "story-cover-emoji" }, iconFor(emoji, 30)),
      s.featured ? h("span", { class: "story-badge" }, "Featured") : s.lineage.length ? h("span", { class: "story-badge remix" }, "Remix") : ""),
    h("span", { class: "story-card-body" },
      h("strong", {}, s.title),
      h("small", {}, [s.author.name, s.level, plural(s.slideCount, "place")].filter(Boolean).join(" · ")),
      s.stats.uses || s.stats.remixes ? h("small", { class: "story-stats" }, [s.stats.uses ? `▶ ${s.stats.uses.toLocaleString()}` : "", s.stats.remixes ? `⑂ ${s.stats.remixes.toLocaleString()}` : "", s.stats.likes ? `♥ ${s.stats.likes.toLocaleString()}` : ""].filter(Boolean).join("  ")) : ""));
}

/** The part of the world on screen, as a box (for "stories here"). */
export function viewBox(app: App): [number, number, number, number] | null {
  const r = app.globe.viewer.camera.computeViewRectangle();
  if (!r) return null;
  const d = 180 / Math.PI;
  return [r.west * d, r.south * d, r.east * d, r.north * d];
}

// ---- The library ----------------------------------------------------------------------------------

const state: Query & { here: boolean } = { text: "", sort: "popular", here: false };

export function openLibrary(ctx: WorkCtx, back: (() => void) | null = ctx.home) {
  const { app } = ctx;
  const lib = library();
  const results = h("div", { class: "story-grid", "aria-live": "polite" });
  const refresh = async () => {
    results.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Finding stories…"));
    const list = await lib.find({ ...state, bbox: state.here ? viewBox(app) ?? undefined : undefined });
    results.replaceChildren(...(list.length ? list.map((s) => card(s, () => void openStory(ctx, s.id, () => openLibrary(ctx, back)))) : [h("p", { class: "muted small" }, state.here ? "No stories here yet. Make the first one." : "Nothing matches. Try other words, or make it yourself.")]));
  };
  let timer = 0;
  const q = h("input", { class: "story-search", type: "search", value: state.text ?? "", placeholder: "Search stories: the Nile, volcanoes, the Romans…", "aria-label": "Search stories", oninput: (e: Event) => { state.text = (e.target as HTMLInputElement).value; clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 250); } });
  const chip = (label: string, on: boolean, act: () => void) => h("button", { class: `chip${on ? " on" : ""}`, "aria-pressed": String(on), onclick: () => { act(); openLibrary(ctx, back); } }, ...labelled(label, 14));
  const mineDecks = decks();

  ctx.show("Stories", back,
    h("p", { class: "mp-intro" }, "Stories told on the globe: follow a river, a war, a migration. Play one, teach with it, or remix it into your own. Publish yours and others can build on it."),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => newStory(ctx) }, "+ Make a story"),
      mineDecks.length ? h("button", { class: "pill-btn", onclick: () => openMine(ctx) }, `Your stories (${mineDecks.length})`) : ""),
    q,
    h("div", { class: "chips wrap" },
      chip("🔥 Most used", state.sort !== "new", () => (state.sort = "popular")),
      chip("🆕 Newest", state.sort === "new", () => (state.sort = "new")),
      chip("📍 On the map now", state.here, () => (state.here = !state.here))),
    h("div", { class: "chips wrap story-topics" },
      ...TOPICS.map((t) => chip(`${TOPIC_EMOJI[t]} ${t}`, state.tag === t, () => (state.tag = state.tag === t ? undefined : t)))),
    results,
    lib.kind === "device" ? h("p", { class: "fineprint" }, "This copy of Atlas isn't connected to the shared library yet, so published stories stay on this device and travel by link. Setup: docs/stories-backend.md.") : "");
  void refresh();
}

/** Your own stories (the decks you've made), with how each is shared. */
function openMine(ctx: WorkCtx) {
  ctx.show("Your stories", () => openLibrary(ctx),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => newStory(ctx) }, "+ Make a story"),
      h("button", { class: "pill-btn", onclick: () => openBorders(ctx) }, "Borders through time"),
      h("button", { class: "pill-btn", onclick: () => openFile(ctx) }, "Open a file…")),
    h("div", { class: "list" }, ...decks().map((d) => {
      const m = deckMeta(d.id);
      return h("button", { class: "list-row", onclick: () => openDeck(ctx, d.id) },
        d.slides[0]?.thumb ? h("img", { class: "present-mini", src: d.slides[0].thumb, alt: "" }) : h("span", { class: "story-mini-emoji" }, iconFor(TOPIC_EMOJI[m.tags[0]] ?? "🌍", 18)),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, d.name), h("span", { class: "list-sub" }, [plural(d.slides.length, "place"), m.storyId ? "Published" : "Draft", m.lineage.length ? "Remix" : ""].filter(Boolean).join(" · "))),
        h("span", { class: "chev", html: "&rsaquo;" }));
    })));
}

function newStory(ctx: WorkCtx) {
  const d: Deck = { id: newId(), name: "My story", created: Date.now(), slides: [] };
  saveDeck(d);
  openDeck(ctx, d.id);
}

// ---- One story ------------------------------------------------------------------------------------

export async function openStory(ctx: WorkCtx, idOrStory: string | Story, back: () => void = () => openLibrary(ctx)) {
  const { app } = ctx;
  const lib = library();
  ctx.show("Story", back, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Opening the story…"));
  const s = typeof idOrStory === "string" ? await lib.get(idOrStory) : idOrStory;
  if (!s) { ctx.show("Story", back, h("p", { class: "error" }, "That story couldn't be found. It may have been removed.")); return; }
  const deck: Deck = { id: `view:${s.id}`, name: s.title, created: s.created, slides: s.slides };
  const next = s.links.map((l) => ({ title: l.title, go: () => { ctx.open(); void openStory(ctx, l.id, back); } }));
  const run = (mode: "slides" | "tour" | "teach") => {
    lib.count(s.id, "use");
    ctx.close();
    const p = play(app, deck, { tour: mode === "tour", teach: mode === "teach", next });
    void p.done.then(() => ctx.unhide());
  };
  const remix = () => {
    const r = remixOf(s, newId);
    saveDeck(r.deck);
    setDeckMeta(r.deck.id, { summary: r.summary, tags: r.tags, level: r.level, lineage: r.lineage, links: r.links });
    lib.count(s.id, "remix");
    app.toast(`Your copy of “${s.title}” is ready to change. It credits the original.`, 4500);
    openDeck(ctx, r.deck.id);
  };
  const likeBtn = h("button", { class: `pill-btn${liked(s.id) ? " on" : ""}`, disabled: liked(s.id), onclick: () => { markLiked(s.id); lib.count(s.id, "like"); likeBtn.textContent = "♥ Thanks"; likeBtn.setAttribute("disabled", ""); } }, liked(s.id) ? "♥ Liked" : "♥ Useful");
  const credit = creditLine(s.lineage);

  ctx.show("Story", back,
    h("div", { class: "story-hero" },
      s.slides.find((x) => x.thumb)?.thumb ? h("img", { src: s.slides.find((x) => x.thumb)!.thumb!, alt: "" }) : h("span", { class: "story-cover-emoji big" }, iconFor(TOPIC_EMOJI[s.tags[0]] ?? "🌍", 40)),
      h("div", {}, h("h2", { class: "story-title" }, s.title), h("p", { class: "story-by" }, `by ${s.author.name}`, s.level ? ` · ${s.level}` : "", ` · ${plural(s.slides.length, "place")}`))),
    s.summary ? h("p", { class: "story-summary" }, s.summary) : "",
    s.tags.length ? h("div", { class: "chips wrap" }, ...s.tags.map((t) => h("span", { class: "chip static" }, ...labelled(`${TOPIC_EMOJI[t] ?? ""} ${t}`, 13)))) : "",
    credit ? h("p", { class: "story-credit" }, "⑂ ", ...s.lineage.flatMap((r, i) => [i ? ", from " : "Remixed from ", h("button", { class: "link-btn", onclick: () => void openStory(ctx, r.id, back) }, `“${r.title}”`), ` by ${r.author}`])) : "",
    h("div", { class: "story-actions" },
      h("button", { class: "primary-btn", onclick: () => run("tour") }, "▶ Play"),
      h("button", { class: "pill-btn", onclick: () => run("slides") }, "Step through"),
      h("button", { class: "pill-btn", title: "Bigger text, a pen to draw on the globe, notes and a timer", onclick: () => run("teach") }, "Teach with it"),
      h("button", { class: "pill-btn", title: "Your own copy to change; it credits this story", onclick: remix }, ...labelled("⑂ Remix", 15)),
      likeBtn,
      h("button", { class: "pill-btn", onclick: async () => app.toast((await copyText(await shareLink(s))) ? "Link copied. Anyone with it can open, play and remix this story." : "Couldn't copy the link.", 4000) }, "Share link")),
    s.stats.uses || s.stats.remixes || s.stats.likes ? h("p", { class: "muted small" }, [s.stats.uses ? `Used ${plural(s.stats.uses, "time")}` : "", s.stats.remixes ? `remixed ${plural(s.stats.remixes, "time")}` : "", s.stats.likes ? `${plural(s.stats.likes, "like")}` : ""].filter(Boolean).join(" · ") + ".") : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "The places"),
      h("ol", { class: "story-places" }, ...s.slides.map((x) => h("li", {}, h("button", { class: "story-place", onclick: () => void flyToView(app, x.camera) }, h("strong", {}, x.title || "Untitled"), x.text ? h("span", {}, x.text) : ""))))),
    s.links.length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Continues with"),
      h("div", { class: "list" }, ...s.links.map((l) => h("button", { class: "list-row", onclick: () => void openStory(ctx, l.id, back) },
        h("span", { class: "story-mini-emoji" }, iconFor("📖", 18)), h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.title), h("span", { class: "list-sub" }, `by ${l.author}`)), h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
    lib.kind === "shared" && !s.featured && !s.id.startsWith("local:") && !isMine(s.id)
      ? h("button", { class: "link-btn danger story-report", onclick: () => { if (confirm("Report this story as inappropriate? It's hidden after a few reports until someone reviews it.")) { lib.count(s.id, "report"); app.toast("Thanks. Reported for review.", 3000); } } }, "Report") : "");
  void flyToView(app, s.slides[0].camera, 2);
}

// ---- Publishing (in the story editor) -------------------------------------------------------------

/** The editor's "Share as a story" section: details, what it leads on to, publish or update. */
export function publishSection(ctx: WorkCtx, d: Deck, again: () => void): HTMLElement {
  const { app } = ctx;
  const m = deckMeta(d.id);
  const save = () => setDeckMeta(d.id, m);
  const lib = library();
  const author = h("input", { value: authorName(), placeholder: "Your name as it should appear (e.g. Ms Adeyemi, Year 5)", "aria-label": "Author", onchange: (e: Event) => setAuthorName((e.target as HTMLInputElement).value.trim()) }) as HTMLInputElement;
  const summary = h("textarea", { class: "mp-notes", rows: 2, placeholder: "One or two sentences: what will people learn?", "aria-label": "Summary", onchange: (e: Event) => { m.summary = (e.target as HTMLTextAreaElement).value; save(); } }, m.summary);
  const topics = h("div", { class: "chips wrap" }, ...TOPICS.map((t) => {
    const on = m.tags.includes(t);
    return h("button", { class: `chip${on ? " on" : ""}`, "aria-pressed": String(on), onclick: () => { m.tags = on ? m.tags.filter((x) => x !== t) : [...m.tags, t].slice(0, 4); save(); again(); } }, ...labelled(`${TOPIC_EMOJI[t]} ${t}`, 14));
  }));
  const level = h("select", { "aria-label": "Who it's for", onchange: (e: Event) => { m.level = (e.target as HTMLSelectElement).value || undefined; save(); } },
    h("option", { value: "" }, "Who it's for…"), ...LEVELS.map((l) => h("option", { value: l, selected: m.level === l }, l)));

  // Leads on to: find other stories and connect them.
  const linkResults = h("div", { class: "story-link-results" });
  const linkIn = h("input", { type: "search", placeholder: "Connect another story: search the library", "aria-label": "Connect a story", oninput: async (e: Event) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (v.length < 2) { linkResults.replaceChildren(); return; }
    const found = (await lib.find({ text: v })).filter((s) => s.id !== m.storyId && !m.links.some((l) => l.id === s.id)).slice(0, 5);
    linkResults.replaceChildren(...found.map((s) => h("button", { class: "chip", onclick: () => { m.links.push({ id: s.id, title: s.title, author: s.author.name }); save(); again(); } }, `+ ${s.title}`)));
  } });

  const status = h("p", { class: "muted small" });
  const publish = async () => {
    if (!d.slides.length) { app.toast("Add at least one place first.", 3000); return; }
    const name = author.value.trim();
    if (!name) { author.focus(); app.toast("Add your name so people know whose story it is.", 3500); return; }
    setAuthorName(name);
    status.textContent = "Publishing…";
    try {
      const story = storyFromDeck(d, { id: m.storyId, title: d.name, summary: m.summary, author: { name }, tags: m.tags, level: m.level, lineage: m.lineage, links: m.links });
      m.storyId = await lib.publish(story);
      save();
      const link = await shareLink({ ...story, id: m.storyId });
      await copyText(link);
      app.toast(lib.kind === "shared" ? "Published to the library. Link copied." : "Saved as a story. Link copied: anyone with it can play and remix it.", 5000);
      again();
    } catch (e) {
      status.textContent = `Couldn't publish: ${(e as Error).message}`;
    }
  };

  return h("section", { class: "group story-publish" }, h("h2", { class: "group-title" }, m.storyId ? "Shared as a story" : "Share as a story"),
    m.lineage.length ? h("p", { class: "story-credit" }, "⑂ ", creditLine(m.lineage), ". The credit stays with your version.") : "",
    h("label", { class: "mp-field" }, h("span", {}, "By"), author),
    h("label", { class: "mp-field" }, h("span", {}, "Summary"), summary),
    h("div", { class: "mp-field" }, h("span", {}, "Topics"), topics),
    h("label", { class: "mp-field" }, h("span", {}, "For"), level),
    h("div", { class: "mp-field" }, h("span", {}, "Continues with"),
      m.links.length ? h("div", { class: "chips wrap" }, ...m.links.map((l) => h("span", { class: "chip static" }, `→ ${l.title} `, h("button", { class: "chip-x", "aria-label": `Remove ${l.title}`, onclick: () => { m.links = m.links.filter((x) => x.id !== l.id); save(); again(); } }, "✕")))) : "",
      linkIn, linkResults),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => void publish() }, m.storyId ? "Update the published story" : lib.kind === "shared" ? "Publish to the library" : "Publish (share by link)"),
      m.storyId ? h("button", { class: "pill-btn", onclick: async () => { const s = await lib.get(m.storyId!); if (s) void openStory(ctx, s, () => openDeck(ctx, d.id)); } }, "See it as others do") : ""),
    status);
}

// ---- Opening stories from links -----------------------------------------------------------------------

/** "#story=<id>" (the library) or "#s=<packed story>" (a story carried in the link). */
export async function openFromHash(ctx: WorkCtx, hash: string): Promise<boolean> {
  const byId = /^#story=([^&]+)/.exec(hash), packed = /^#s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!byId && !packed) return false;
  ctx.open();
  if (byId) { void openStory(ctx, decodeURIComponent(byId[1])); return true; }
  const { unpackStory } = await import("./model");
  const s = await unpackStory(packed![1], newId);
  if (!s) { ctx.app.toast("That story link is incomplete. Ask for it again.", 5000); return true; }
  remember(s);
  void openStory(ctx, s);
  return true;
}

/** The stories about the part of the world on screen (for the Explore card). */
/** Stories that visit somewhere within about `km` of a point. */
export async function storiesNear(lon: number, lat: number, km = 150, limit = 3): Promise<StoryCard[]> {
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return (await library().find({ bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat], sort: "popular" })).slice(0, limit);
}

export async function storiesHere(app: App, limit = 3): Promise<StoryCard[]> {
  const box = viewBox(app);
  if (!box) return [];
  return (await library().find({ bbox: box, sort: "popular" })).slice(0, limit);
}
