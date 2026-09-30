// A person's page. It opens beside the globe, which lights up with every
// place on it; the banner is their place seen from above, the Top 8 are the
// places they'd show you first, and "Fly my places" takes you round them.
// Your own page edits in place: skin, face, words, and places added by
// search, from what you're looking at, or from what's around it.
import { Cartesian3, Color, HeightReference, LabelStyle, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { reverseGeocode } from "../data/geocode";
import { overpass, elementPoint } from "../data/overpass";
import { packJson, unpackJson } from "../data/pack";
import { cloudOn } from "../cloud/client";
import { fetchProfile, fetchSignatures } from "../cloud/sync";
import { h } from "../ui/dom";
import { canvasUrl } from "../ui/canvasUrl";
import { icons } from "../ui/icons";
import { flyToPlace, geocode } from "../ui/search";
import { avatarEl } from "./account";
import { ROLES, SKINS, SPOT_KINDS, AVATAR_EMOJI, AVATAR_COLORS, TOP, byKind, countriesOf, dayText, profileFromJson, topSpots, type Post, type Profile, type Spot, type SpotKind } from "./model";
import { findProfile, follow, isFollowing, isMe, me, remember, saveProfile, sign } from "./store";
import { guideCards, guideEditor, playGuide, publishGuide } from "./guides";
import { NOTE_KINDS, photoUrl } from "./notes";
import type { Guide } from "./model";

// ---- Pictures from above ----------------------------------------------------------------------

const tileXY = (lon: number, lat: number, z: number) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n), n };
};
const tileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
/** One satellite tile around a point. */
export const aerial = (lon: number, lat: number, z = 15) => { const t = tileXY(lon, lat, z); return tileUrl(z, t.x, t.y); };
/** A strip of tiles for the banner. */
function bannerTiles(lon: number, lat: number, z = 13): HTMLElement {
  const t = tileXY(lon, lat, z);
  const strip = h("div", { class: "pf-aerial", "aria-hidden": "true" });
  for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++)
    strip.append(h("img", { src: tileUrl(z, (t.x + dx + t.n) % t.n, t.y + dy), alt: "", decoding: "async", onerror: (e: Event) => ((e.target as HTMLElement).style.visibility = "hidden") }));
  return strip;
}

// ---- Pins on the globe --------------------------------------------------------------------------

/** A pin as an image URL (Cesium keys its texture atlas by URL, so redrawn pins always appear). */
const pinImage = (emoji: string, color: string, big = false) => canvasUrl(`pf|${emoji}|${color}|${big}`, () => {
  const s = big ? 2.4 : 2, W = 30 * s, H = 38 * s;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.scale(s, s);
  g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  g.beginPath();
  g.moveTo(15, 36); g.bezierCurveTo(11, 29, 2, 24, 2, 15); g.arc(15, 15, 13, Math.PI, 0); g.bezierCurveTo(28, 24, 19, 29, 15, 36);
  g.fillStyle = color; g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
  g.beginPath(); g.arc(15, 15, 10, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  g.font = "13px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, 15, 15.5);
  return c;
});

// ---- The page ---------------------------------------------------------------------------------------

const SKIN_ACCENT: Record<string, string> = { dawn: "#ff6b4a", ocean: "#0a84ff", forest: "#248a3d", desert: "#c2410c", night: "#a78bfa", paper: "#1d1d1f", "2006": "#ff2d95" };
const newId = () => Math.random().toString(36).slice(2, 10);

function kindFromTags(t: Record<string, string>): SpotKind {
  const a = t.amenity, l = t.leisure, tr = t.tourism;
  if (a === "restaurant" || a === "fast_food" || a === "food_court") return "restaurant";
  if (a === "cafe" || a === "ice_cream") return "cafe";
  if (a === "bar" || a === "pub" || a === "biergarten" || a === "nightclub") return "bar";
  if (a === "theatre" || a === "arts_centre" || a === "music_venue") return "music";
  if (a === "marketplace" || t.shop) return "market";
  if (l === "park" || l === "garden") return "park";
  if (l === "nature_reserve") return "wild";
  if (tr === "viewpoint") return "view";
  if (tr === "museum" || tr === "gallery") return "museum";
  if (t.natural === "beach") return "beach";
  if (t.natural === "peak") return "trail";
  return "place";
}
function kindFromWords(s: string): SpotKind {
  const t = s.toLowerCase();
  const rules: [RegExp, SpotKind][] = [[/caf[eé]|coffee|bakery|pastel/, "cafe"], [/restaurant|bistro|trattoria|taqueria|diner|eatery|kitchen|grill|sushi|pizz/, "restaurant"], [/\bbar\b|pub|tavern|brewery|wine|cocktail/, "bar"],
    [/beach|praia|playa|plage/, "beach"], [/surf/, "surf"], [/museum|gallery|museu|museo|mus[ée]e/, "museum"], [/market|mercado|shop|store|bazaar/, "market"], [/park|garden|jard|parque/, "park"],
    [/trail|path|peak|mount|mountain|hike|summit|volcano/, "trail"], [/view|lookout|miradouro|mirador|overlook|belvedere/, "view"], [/theat|venue|hall|amphithe|opera|club/, "music"], [/reserve|sanctuary|wetland|marsh|bird/, "wild"], [/observatory|dark sky/, "sky"]];
  return rules.find(([re]) => re.test(t))?.[1] ?? "place";
}

export interface ProfilePages {
  open(handle: string, edit?: boolean): void;
  /** Opens a profile carried whole in a link (#/u/~packed). */
  openPacked(packed: string): Promise<boolean>;
  close(): void;
  /** Plays one of someone's guides (#/g/handle/id). */
  playGuide(handle: string, id: string): void;
  /** Adds a place to your own page (from a place card), asking what kind it is. */
  addSpot(spot: { name: string; lon: number; lat: number; where?: string; slug?: string }): void;
  readonly isOpen: boolean;
}

export function createProfiles(app: App, deps: {
  openPlace(spot: Spot): void;
  openLens(id: string): void;
  lensInfo(id: string): { name: string; icon: string; blurb: string } | null;
  signIn(then?: () => void): void;
}): ProfilePages {
  const viewer = app.globe.viewer;
  const el = h("section", { class: "profile", hidden: true, role: "dialog", "aria-label": "Profile" });
  const back = h("button", { class: "pf-return", hidden: true });
  (document.getElementById("ui") ?? document.body).append(el, back);
  let current: Profile | null = null;
  let editing = false;
  /** The guide being made or changed (null: a new one; undefined: none). */
  let guideEdit: Guide | null | undefined;
  let stopGuide: (() => void) | null = null;
  let pins: Entity[] = [];
  let touring = 0;

  const clearPins = () => { pinJob++; for (const e of pins) viewer.entities.remove(e); pins = []; viewer.scene.requestRender(); };
  let pinJob = 0;
  const drawPins = (p: Profile) => {
    clearPins();
    const my = ++pinJob;
    const accent = SKIN_ACCENT[p.skin] ?? p.avatar.color;
    const top = new Set(p.top);
    const notes = p.posts.filter((post) => post.lon !== undefined && post.lat !== undefined && !post.spot);
    void Promise.all([
      Promise.all(p.spots.map((s) => pinImage(SPOT_KINDS[s.kind].emoji, accent, top.has(s.id)))),
      Promise.all(notes.map((post) => pinImage(NOTE_KINDS.find((k) => k.id === post.kind)?.emoji ?? "📝", accent))),
    ]).then(([spotImgs, noteImgs]) => {
      if (my !== pinJob || !current) return;
      p.spots.forEach((s, i) => pins.push(viewer.entities.add({
        position: Cartesian3.fromDegrees(s.lon, s.lat),
        billboard: { image: spotImgs[i], verticalOrigin: VerticalOrigin.BOTTOM, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.5 },
        label: { text: s.name, font: "600 12px Inter, system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("rgba(0,0,0,0.75)"), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.TOP, pixelOffset: { x: 0, y: 4 } as never, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: { near: 0, far: 60_000 } as never },
      })));
      // Field notes, where they were taken.
      notes.forEach((post, i) => pins.push(viewer.entities.add({
        position: Cartesian3.fromDegrees(post.lon!, post.lat!),
        billboard: { image: noteImgs[i], verticalOrigin: VerticalOrigin.BOTTOM, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.42 },
      })));
      viewer.scene.requestRender();
    });
  };
  /** Frames every place on the page. */
  const frame = (p: Profile) => {
    const pts = p.spots.length ? p.spots : p.home ? [{ ...p.home }] : [];
    if (!pts.length) return;
    const lons = pts.map((s) => s.lon), lats = pts.map((s) => s.lat);
    const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
    // Spread over the world: the planet, from above their home.
    const c = span > 40 && p.home ? p.home : { lon: (Math.max(...lons) + Math.min(...lons)) / 2, lat: (Math.max(...lats) + Math.min(...lats)) / 2 };
    void flyToPlace(app.globe, { name: p.name, lon: c.lon, lat: c.lat, radius: span > 40 ? 5_000_000 : Math.max(3000, span * 111_000 * 0.75) });
  };

  const stopTour = () => { touring++; el.classList.remove("touring"); el.querySelectorAll(".pf-tile.on").forEach((t) => t.classList.remove("on")); };
  async function tour(p: Profile) {
    const my = ++touring;
    const list = topSpots(p).length ? topSpots(p) : p.spots.slice(0, 8);
    el.classList.add("touring");
    for (const s of list) {
      if (my !== touring) return;
      el.querySelectorAll(".pf-tile").forEach((t) => t.classList.toggle("on", (t as HTMLElement).dataset.id === s.id));
      void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 900 });
      app.toast(`${SPOT_KINDS[s.kind].emoji} ${s.name}${s.note ? `: ${s.note}` : ""}`, 5200);
      await new Promise((r) => setTimeout(r, 6000));
    }
    if (my === touring) { stopTour(); frame(p); }
  }
  // Moving the map yourself ends the tour.
  viewer.scene.canvas.addEventListener("pointerdown", () => { if (el.classList.contains("touring")) stopTour(); });

  const close = () => {
    stopTour();
    el.hidden = true;
    back.hidden = true;
    clearPins();
    current = null;
    editing = false;
    guideEdit = undefined;
    document.body.classList.remove("profile-open");
  };
  /** Steps out to a place, leaving a way back. */
  const visit = (s: Spot) => {
    const p = current!;
    stopTour();
    el.hidden = true;
    document.body.classList.remove("profile-open");
    back.replaceChildren(h("span", { html: "&larr;" }), avatarEl(p, 22), h("span", {}, `${p.name.split(" ")[0]}'s page`));
    back.hidden = false;
    deps.openPlace(s);
  };
  back.addEventListener("click", () => { back.hidden = true; if (current) show(current); });

  /** Plays a guide: the page steps aside, the globe takes over. */
  function play(p: Profile, g: Guide) {
    stopTour();
    stopGuide?.();
    clearPins();
    el.hidden = true;
    back.hidden = true;
    document.body.classList.remove("profile-open");
    stopGuide = playGuide(app, p, g, {
      color: SKIN_ACCENT[p.skin] ?? p.avatar.color,
      onClose: () => { stopGuide = null; show(p); },
      onShare: () => void (async () => {
        const link = `${location.origin}${location.pathname}#/g/${p.handle}/${g.id}`;
        try {
          if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: `${g.title}: a guide on Atlas`, url: link });
          else { await navigator.clipboard.writeText(link); app.toast(p.demo || cloudOn() || !isMe(p.handle) ? "Link to this guide copied" : "Link copied. It opens the guide on your page for anyone once Atlas's servers are on; for now, share your page's link.", 4000); }
        } catch { /* dismissed */ }
      })(),
    });
  }

  function show(p: Profile) {
    current = p;
    el.hidden = false;
    back.hidden = true;
    document.body.classList.add("profile-open");
    render();
    drawPins(p);
  }

  const persist = () => { if (current && isMe(current.handle)) { saveProfile(current); drawPins(current); } };

  // ---- Rendering ----
  function render() {
    const p = current!;
    const own = isMe(p.handle);
    const role = ROLES.find((r) => r.id === p.role)!;
    el.dataset.skin = p.skin;
    el.style.setProperty("--pf-accent", SKIN_ACCENT[p.skin] ?? p.avatar.color);
    el.classList.toggle("editing", editing);
    const first = p.name.split(" ")[0];
    const banner = p.banner ?? topSpots(p)[0] ?? p.spots[0] ?? p.home;
    const edit = <K extends "name" | "now" | "bio">(key: K, multi = false, placeholder = "") => {
      const input = multi
        ? h("textarea", { class: `pf-edit pf-edit-${key}`, rows: 5, placeholder, "aria-label": key }, p[key] ?? "") as HTMLTextAreaElement
        : h("input", { class: `pf-edit pf-edit-${key}`, value: p[key] ?? "", placeholder, "aria-label": key }) as HTMLInputElement;
      input.addEventListener("change", () => { (p as unknown as Record<string, string>)[key] = input.value.trim(); if (key === "name" && !p.name) p.name = "Me"; persist(); });
      return input;
    };
    const stat = (n: number, label: string) => h("div", { class: "pf-stat" }, h("strong", {}, String(n)), h("span", {}, label));
    const following = isFollowing(p.handle);

    el.replaceChildren(
      h("header", { class: "pf-banner" },
        banner ? bannerTiles(banner.lon, banner.lat) : "",
        h("div", { class: "pf-banner-glow" }),
        h("div", { class: "pf-top-actions" },
          h("button", { class: "pf-round", "aria-label": "Share this page", html: icons.share, onclick: () => void share(p) }),
          h("button", { class: "pf-round", "aria-label": "Close", html: icons.close, onclick: close }))),
      h("div", { class: "pf-id" },
        h("div", { class: "pf-avatar" }, avatarEl(p, 96)),
        editing ? edit("name", false, "Your name") : h("h1", {}, p.name),
        h("p", { class: "pf-meta" }, `@${p.handle}`, h("span", { class: "pf-role" }, `${role.emoji} ${role.label}`), p.home ? h("span", {}, `📍 ${p.home.name}`) : ""),
        editing ? edit("now", false, "What are you up to? (“Chasing the aurora in Tromsø”)") : p.now ? h("p", { class: "pf-now" }, p.now) : "",
        h("div", { class: "pf-actions" },
          own
            ? h("button", { class: "pf-btn primary", onclick: () => { editing = !editing; render(); } }, editing ? "Done" : "Edit page")
            : h("button", { class: `pf-btn ${following ? "" : "primary"}`, "aria-pressed": String(following), onclick: () => { follow(p.handle, !following); render(); app.toast(following ? `Unfollowed ${first}` : `Following ${first}. Their places show on your map when you look nearby.`, 3000); } }, following ? "Following" : "Follow"),
          p.spots.length ? h("button", { class: "pf-btn", onclick: () => void tour(p) }, "▶  Fly my places") : "",
          !own ? h("button", { class: "pf-btn", onclick: () => el.querySelector<HTMLElement>(".pf-sign textarea")?.focus() }, "Sign guestbook") : "")),
      editing ? editor(p) : "",
      h("div", { class: "pf-stats" }, stat(p.spots.length, p.spots.length === 1 ? "place" : "places"), stat(countriesOf(p), countriesOf(p) === 1 ? "country" : "countries"), stat(p.posts.length, p.posts.length === 1 ? "post" : "posts"), stat(p.lenses.length, p.lenses.length === 1 ? "lens" : "lenses")),
      topEight(p, own, first),
      own && guideEdit !== undefined
        ? guideEditor(p, guideEdit, (g, removed) => {
          if (g && removed) p.guides = (p.guides ?? []).filter((x) => x.id !== g.id);
          else if (g) { p.guides = [g, ...(p.guides ?? []).filter((x) => x.id !== g.id)]; publishGuide(p, g); app.toast(`🧭 “${g.title}” is on your page`, 3000); }
          guideEdit = undefined;
          persist(); render();
        })
        : guideCards(p, own, editing, { play: (g) => play(p, g), edit: (g) => { if (!g && p.spots.length < 2) { editing = true; render(); return; } guideEdit = g; render(); }, aerial: (lon, lat) => aerial(lon, lat, 15) }),
      p.bio || editing ? h("section", { class: "pf-card" }, h("h2", {}, `About ${own ? "me" : first}`), editing ? edit("bio", true, "A few lines about you and the places you love.") : h("div", { class: "pf-bio" }, ...p.bio.split(/\n{2,}/).map((para) => h("p", {}, para)))) : "",
      journal(p, own),
      spotsByKind(p, own),
      lensesCard(p, own, first),
      guestbook(p, own, first),
      p.demo ? h("p", { class: "pf-fine" }, `${first} is an example person, made up to show what a page on Atlas can be. The places are real.`) : h("p", { class: "pf-fine" }, `On Atlas since ${dayText(p.joined)}.`));
  }

  function topEight(p: Profile, own: boolean, first: string): HTMLElement {
    const top = topSpots(p);
    const empty = Array.from({ length: Math.max(0, (own ? TOP : 0) - top.length) });
    let dragging: string | null = null;
    const tile = (s: Spot, i: number) => {
      const t = h("button", { class: "pf-tile", "data-id": s.id, draggable: own && editing ? "true" : undefined, title: s.note ?? s.name, onclick: () => (editing ? undefined : visit(s)) },
        h("span", { class: "pf-tile-img" }, h("img", { src: aerial(s.lon, s.lat, 15), alt: "", loading: "lazy", decoding: "async" }), h("i", {}, SPOT_KINDS[s.kind].emoji), h("b", {}, String(i + 1))),
        h("strong", {}, s.name), h("small", {}, s.where ?? SPOT_KINDS[s.kind].label),
        own && editing ? h("span", { class: "pf-tile-x", role: "button", "aria-label": `Take ${s.name} out of the Top 8`, onclick: (e: Event) => { e.stopPropagation(); p.top = p.top.filter((x) => x !== s.id); persist(); render(); } }, "✕") : "");
      if (own && editing) {
        t.addEventListener("dragstart", () => { dragging = s.id; t.classList.add("dragging"); });
        t.addEventListener("dragend", () => t.classList.remove("dragging"));
        t.addEventListener("dragover", (e) => e.preventDefault());
        t.addEventListener("drop", (e) => {
          e.preventDefault();
          if (!dragging || dragging === s.id) return;
          const from = p.top.indexOf(dragging), to = p.top.indexOf(s.id);
          p.top.splice(from, 1); p.top.splice(to, 0, dragging);
          persist(); render();
        });
      }
      return t;
    };
    if (!top.length && !own) return h("div");
    return h("section", { class: "pf-card pf-top" },
      h("h2", {}, own ? "My Top 8" : `${first}'s Top 8`, own && editing && top.length > 1 ? h("small", {}, "Drag to reorder") : ""),
      h("div", { class: "pf-grid" }, ...top.map(tile), ...empty.map(() => h("button", { class: "pf-tile ghost", onclick: () => { editing = true; render(); el.querySelector<HTMLInputElement>(".pf-add input")?.focus(); } }, h("span", { class: "pf-tile-img" }, "+"), h("small", {}, "Add a place")))));
  }

  function journal(p: Profile, own: boolean): HTMLElement | string {
    if (!p.posts.length && !own) return "";
    const spotOf = (post: Post) => p.spots.find((s) => s.id === post.spot);
    const compose = () => {
      const title = h("input", { class: "pf-input", placeholder: "Title", "aria-label": "Post title" }) as HTMLInputElement;
      const body = h("textarea", { class: "pf-input", rows: 4, placeholder: "What happened, what you saw, what you learned…", "aria-label": "Post" }) as HTMLTextAreaElement;
      const where = h("select", { class: "pf-input", "aria-label": "Which place" }, h("option", { value: "" }, "Not about one place"), ...p.spots.map((s) => h("option", { value: s.id }, `${SPOT_KINDS[s.kind].emoji} ${s.name}`))) as HTMLSelectElement;
      return h("div", { class: "pf-compose" }, title, body, h("div", { class: "pf-row" }, where, h("button", { class: "pf-btn primary", onclick: () => {
        if (!title.value.trim() && !body.value.trim()) { title.focus(); return; }
        p.posts.unshift({ id: newId(), at: new Date().toISOString().slice(0, 10), title: title.value.trim(), body: body.value.trim(), spot: where.value || undefined });
        persist(); render();
        app.toast("Posted to your journal", 2500);
      } }, "Post")));
    };
    return h("section", { class: "pf-card" }, h("h2", {}, "Journal"),
      own ? (() => { const slot = h("div", { class: "pf-row" }, h("button", { class: "pf-btn", onclick: () => { slot.replaceChildren(compose()); slot.querySelector<HTMLInputElement>("input")?.focus(); } }, "✍️  Write a post"), h("button", { class: "pf-btn", onclick: () => app.actions.get("note:new")?.run() }, "📷  Field note")); return slot; })() : "",
      ...p.posts.map((post) => {
        const s = spotOf(post);
        const img = post.photo ? h("img", { class: "pf-post-photo", alt: post.title, loading: "lazy" }) as HTMLImageElement : null;
        if (img && post.photo) void photoUrl(post.photo).then((u) => { if (u) img.src = u; else img.remove(); });
        const at = post.lon !== undefined && post.lat !== undefined ? { lon: post.lon, lat: post.lat } : null;
        const k = NOTE_KINDS.find((x) => x.id === post.kind);
        return h("article", { class: "pf-post" },
          img ?? "",
          h("div", { class: "pf-post-head" }, h("strong", {}, k ? `${k.emoji} ${post.title}` : post.title), h("time", {}, dayText(post.at))),
          ...post.body.split(/\n{2,}/).filter(Boolean).map((para) => h("p", {}, para)),
          h("div", { class: "pf-post-foot" },
            s ? h("button", { class: "pf-chip", onclick: () => visit(s) }, `${SPOT_KINDS[s.kind].emoji} ${s.name}`)
              : at ? h("button", { class: "pf-chip", onclick: () => visit({ id: post.id, name: post.title, kind: "place", lon: at.lon, lat: at.lat }) }, "📍 Where it was") : "",
            own && editing ? h("button", { class: "link-btn danger", onclick: () => { p.posts = p.posts.filter((x) => x !== post); persist(); render(); } }, "Delete") : ""));
      }),
      !p.posts.length ? h("p", { class: "pf-empty" }, "Your journal is empty. Write about a place: the day you went, what you saw.") : "");
  }

  function spotsByKind(p: Profile, own: boolean): HTMLElement | string {
    const groups = byKind(p);
    if (!groups.length) return "";
    const inTop = new Set(p.top);
    return h("section", { class: "pf-card" }, h("h2", {}, own ? "My places" : "Places"),
      ...groups.map((g) => h("div", { class: "pf-kind" },
        h("h3", {}, `${SPOT_KINDS[g.kind].emoji} ${SPOT_KINDS[g.kind].plural}`, h("small", {}, String(g.spots.length))),
        ...g.spots.map((s) => h("div", { class: "pf-spot" },
          h("button", { class: "pf-spot-main", onclick: () => visit(s) },
            h("img", { src: aerial(s.lon, s.lat, 16), alt: "", loading: "lazy" }),
            h("span", {}, h("strong", {}, s.name), h("small", {}, [s.where, s.note].filter(Boolean).join(" · ")))),
          own && editing ? h("div", { class: "pf-spot-tools" },
            h("button", { class: "icon-btn", title: inTop.has(s.id) ? "In your Top 8" : "Add to your Top 8", "aria-pressed": String(inTop.has(s.id)), onclick: () => {
              if (inTop.has(s.id)) p.top = p.top.filter((x) => x !== s.id);
              else if (p.top.length >= TOP) { app.toast("Your Top 8 is full. Take one out first.", 3000); return; }
              else p.top.push(s.id);
              persist(); render();
            } }, inTop.has(s.id) ? "★" : "☆"),
            h("button", { class: "icon-btn", title: "Use as banner", onclick: () => { p.banner = { lon: s.lon, lat: s.lat }; persist(); render(); } }, "🖼️"),
            h("button", { class: "icon-btn", title: "Remove", html: icons.close, onclick: () => { p.spots = p.spots.filter((x) => x !== s); p.top = p.top.filter((x) => x !== s.id); persist(); render(); } })) : ""))),
      ));
  }

  function lensesCard(p: Profile, own: boolean, first: string): HTMLElement | string {
    const ls = p.lenses.map((id) => ({ id, info: deps.lensInfo(id) })).filter((x) => x.info);
    if (!ls.length && !own) return "";
    return h("section", { class: "pf-card" }, h("h2", {}, own ? "Lenses I made" : `Lenses ${first} made`),
      h("div", { class: "pf-lenses" }, ...ls.map(({ id, info }) => h("button", { class: "pf-lens", onclick: () => { close(); deps.openLens(id); } }, h("span", { class: "pf-lens-icon" }, info!.icon), h("span", {}, h("strong", {}, info!.name), h("small", {}, info!.blurb))))),
      own ? h("button", { class: "pf-btn", onclick: () => { close(); app.actions.get("lens:studio")?.run(); } }, "✨ Make a lens") : "");
  }

  function guestbook(p: Profile, own: boolean, first: string): HTMLElement {
    const text = h("textarea", { class: "pf-input", rows: 2, placeholder: own ? "" : `Say hi to ${first}…`, "aria-label": "Sign the guestbook" }) as HTMLTextAreaElement;
    const post = () => {
      const t = text.value.trim();
      if (!t) return;
      const who = me();
      if (!who) { deps.signIn(() => post()); return; }
      sign(p, { from: who.handle, name: who.name, text: t, at: new Date().toISOString().slice(0, 10) });
      current = findProfile(p.handle) ?? p;
      render();
      app.toast(`Signed ${first}'s guestbook`, 2500);
    };
    return h("section", { class: "pf-card pf-guest" }, h("h2", {}, "Guestbook"),
      !own ? h("div", { class: "pf-sign" }, text, h("button", { class: "pf-btn primary", onclick: post }, "Sign")) : "",
      ...p.guestbook.map((g) => {
        const from = findProfile(g.from);
        return h("div", { class: "pf-sig" },
          from ? h("button", { class: "pf-sig-av", onclick: () => show(from), "aria-label": `${g.name}'s page` }, avatarEl(from, 34)) : h("span", { class: "pf-sig-av" }, avatarEl({ name: g.name, avatar: { emoji: g.name.slice(0, 1), color: "#8e8e93" } }, 34)),
          h("div", {}, h("div", { class: "pf-sig-head" }, from ? h("button", { class: "link-btn", onclick: () => show(from) }, g.name) : h("strong", {}, g.name), h("time", {}, dayText(g.at))), h("p", {}, g.text)));
      }),
      !p.guestbook.length ? h("p", { class: "pf-empty" }, own ? "When people sign your guestbook, it shows here." : "Be the first to sign.") : "");
  }

  // ---- Editing ----
  function editor(p: Profile): HTMLElement {
    const skins = h("div", { class: "pf-skins", role: "radiogroup", "aria-label": "Page skin" }, ...SKINS.map((s) =>
      h("button", { class: "pf-skin", "data-skin": s.id, role: "radio", "aria-checked": String(p.skin === s.id), onclick: () => { p.skin = s.id; persist(); render(); } }, h("i"), h("span", {}, s.label))));
    const faces = h("div", { class: "pf-faces" },
      ...AVATAR_EMOJI.map((e) => h("button", { class: "si-emoji", "aria-pressed": String(p.avatar.emoji === e), onclick: () => { p.avatar.emoji = e; persist(); render(); } }, e)));
    const colours = h("div", { class: "si-colors" },
      ...AVATAR_COLORS.map((c) => h("button", { class: "si-color", style: `--c:${c}`, "aria-pressed": String(p.avatar.color === c), "aria-label": "Colour", onclick: () => { p.avatar.color = c; persist(); render(); } })));
    const role = h("select", { class: "pf-input", "aria-label": "Role", onchange: (e: Event) => { p.role = (e.target as HTMLSelectElement).value as Profile["role"]; persist(); render(); } },
      ...ROLES.map((r) => h("option", { value: r.id, selected: r.id === p.role }, `${r.emoji} ${r.label}`)));
    return h("section", { class: "pf-card pf-editor" },
      h("h2", {}, "Make it yours"),
      h("h3", {}, "Skin"), skins,
      h("h3", {}, "Face"), faces, colours,
      h("h3", {}, "I'm here as"), role,
      h("h3", {}, "Home"), homePicker(p),
      h("h3", {}, "Add places"), adder(p));
  }

  function homePicker(p: Profile): HTMLElement {
    const input = h("input", { class: "pf-input", placeholder: "Your town or city", value: p.home?.name ?? "", "aria-label": "Home" }) as HTMLInputElement;
    const list = h("div", { class: "pf-results" });
    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.replaceChildren(); return; }
      timer = window.setTimeout(async () => {
        const rs = await geocode(q).catch(() => []);
        list.replaceChildren(...rs.slice(0, 4).map((r) => h("button", { class: "pf-result", onclick: () => { p.home = { name: [r.name, r.detail?.split(",").slice(-1)[0]?.trim()].filter(Boolean).join(", "), lon: r.lon, lat: r.lat }; persist(); render(); } }, h("strong", {}, r.name), h("small", {}, r.detail ?? ""))));
      }, 300);
    });
    return h("div", {}, input, list);
  }

  /** Three ways to add a place: search, what you're looking at, and what's around it. */
  function adder(p: Profile): HTMLElement {
    const box = h("div", { class: "pf-add" });
    const input = h("input", { class: "pf-input", placeholder: "Search a restaurant, park, beach, trail…", "aria-label": "Add a place" }) as HTMLInputElement;
    const list = h("div", { class: "pf-results" });
    const add = (s: Omit<Spot, "id">) => {
      if (p.spots.some((x) => x.name === s.name && Math.abs(x.lat - s.lat) < 0.001 && Math.abs(x.lon - s.lon) < 0.001)) { app.toast(`${s.name} is already on your page`, 2500); return; }
      const spot: Spot = { id: newId(), ...s };
      p.spots.push(spot);
      if (p.top.length < TOP) p.top.push(spot.id);
      persist(); render();
      app.toast(`${SPOT_KINDS[spot.kind].emoji} ${spot.name} added${p.top.includes(spot.id) ? " to your Top 8" : ""}`, 2500);
      if (!spot.country) void reverseGeocode(spot.lon, spot.lat, 10).then((n) => { const c = n?.context.split(",").slice(-1)[0]?.trim(); if (c) { spot.country = c; spot.where ??= n!.context; persist(); } }).catch(() => {});
    };
    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.replaceChildren(); return; }
      timer = window.setTimeout(async () => {
        const c = viewer.camera.positionCartographic;
        const bias = c.height < 2_000_000 ? { lon: (c.longitude * 180) / Math.PI, lat: (c.latitude * 180) / Math.PI } : p.home ?? null;
        const rs = await geocode(q, bias).catch(() => []);
        list.replaceChildren(...rs.slice(0, 5).map((r) => h("button", { class: "pf-result", onclick: () => { add({ name: r.name, kind: kindFromWords(`${r.name} ${r.detail ?? ""}`), lon: r.lon, lat: r.lat, where: r.detail?.split(",").slice(0, 2).join(",").trim() }); input.value = ""; list.replaceChildren(); } },
          h("span", {}, SPOT_KINDS[kindFromWords(`${r.name} ${r.detail ?? ""}`)].emoji), h("span", {}, h("strong", {}, r.name), h("small", {}, r.detail ?? "")))));
      }, 300);
    });
    const here = app.place;
    const nearby = h("div", { class: "pf-nearby" });
    const around = here ?? (p.home ? { lon: p.home.lon, lat: p.home.lat, name: { title: p.home.name } } : null);
    const findNear = async () => {
      if (!around) return;
      nearby.replaceChildren(h("p", { class: "pf-empty" }, "Looking around…"));
      const { lat, lon } = around;
      const q = `[out:json][timeout:25];(nwr(around:1500,${lat},${lon})[amenity~"^(restaurant|cafe|bar|pub|biergarten|ice_cream|theatre|arts_centre|marketplace|nightclub)$"][name];nwr(around:1500,${lat},${lon})[leisure~"^(park|garden|nature_reserve)$"][name];nwr(around:1500,${lat},${lon})[tourism~"^(viewpoint|museum|gallery)$"][name];);out center 60;`;
      const els = await overpass(q).catch(() => null);
      if (!els) { nearby.replaceChildren(h("p", { class: "pf-empty" }, "Couldn't reach OpenStreetMap just now. Try again in a moment.")); return; }
      const items = els.flatMap((e) => { const pt = elementPoint(e); return pt && e.tags?.name ? [{ name: e.tags.name, kind: kindFromTags(e.tags), lon: pt[0], lat: pt[1], cuisine: e.tags.cuisine?.replace(/_/g, " ").replace(/;/g, ", ") }] : []; })
        .sort((a, b) => Math.hypot(a.lon - lon, a.lat - lat) - Math.hypot(b.lon - lon, b.lat - lat)).slice(0, 24);
      nearby.replaceChildren(...(items.length ? items.map((it) => h("button", { class: "pf-result", onclick: (e: Event) => { add({ name: it.name, kind: it.kind, lon: it.lon, lat: it.lat, where: around.name?.title, note: it.cuisine ? `${it.cuisine[0].toUpperCase()}${it.cuisine.slice(1)}` : undefined }); (e.currentTarget as HTMLElement).remove(); } },
        h("span", {}, SPOT_KINDS[it.kind].emoji), h("span", {}, h("strong", {}, it.name), h("small", {}, [SPOT_KINDS[it.kind].label, it.cuisine].filter(Boolean).join(" · "))), h("span", { class: "pf-plus" }, "+"))) : [h("p", { class: "pf-empty" }, "Nothing named nearby on OpenStreetMap.")]));
    };
    box.append(input, list,
      here ? h("button", { class: "pf-btn", onclick: () => add({ name: here.name?.title ?? "A place I love", kind: kindFromWords(`${here.name?.title ?? ""} ${here.name?.context ?? ""}`), lon: here.lon, lat: here.lat, where: here.name?.context, slug: here.slug && !here.slug.startsWith("@") ? here.slug : undefined }) }, `📍 Add ${here.name?.title ?? "what you're looking at"}`) : "",
      around ? h("button", { class: "pf-btn", onclick: () => void findNear() }, `🍽️ Restaurants, cafés, bars and parks near ${around.name?.title ?? "here"}`) : "",
      nearby);
    return box;
  }

  async function share(p: Profile) {
    const lean = { ...p, demo: undefined };
    const link = p.demo || !isMe(p.handle) || cloudOn() ? `${location.origin}${location.pathname}#/u/${p.handle}` : `${location.origin}${location.pathname}#/u/~${await packJson(lean)}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: `${p.name} on Atlas`, url: link });
      else { await navigator.clipboard.writeText(link); app.toast(isMe(p.handle) ? "Link to your page copied. It carries the whole page, so it works anywhere." : "Link copied", 3500); }
    } catch { /* dismissed */ }
  }

  return {
    get isOpen() { return !el.hidden; },
    open(handle, edit = false) {
      const p = findProfile(handle);
      if (!p) {
        if (!cloudOn()) { app.toast(`There's no one called @${handle} on this device yet.`, 3500); return; }
        void fetchProfile(handle.replace(/^@/, "").toLowerCase()).then((r) => {
          if (!r) { app.toast(`There's no one called @${handle} on Atlas.`, 3500); return; }
          remember(r); show(r); el.scrollTop = 0; frame(r);
        }).catch(() => app.toast("Couldn't reach Atlas's servers just now.", 3500));
        return;
      }
      editing = edit && isMe(p.handle);
      show(isMe(p.handle) ? p : structuredClone(p));
      el.scrollTop = 0;
      frame(p);
      // The latest guestbook from the servers (a page made elsewhere, signed by anyone).
      if (cloudOn() && !p.demo) void fetchSignatures(p.handle).then((sigs) => {
        if (current?.handle !== p.handle || !sigs.length) return;
        const seen = new Set(current.guestbook.map((g) => g.from + g.text));
        current.guestbook = [...sigs.filter((g) => !seen.has(g.from + g.text)), ...current.guestbook].sort((a, b) => b.at.localeCompare(a.at));
        render();
      }).catch(() => {});
    },
    async openPacked(packed) {
      const raw = await unpackJson(packed);
      const p = profileFromJson(raw);
      if (!p) return false;
      remember(p);
      show(p);
      frame(p);
      return true;
    },
    close,
    playGuide(handle: string, id: string) {
      const go = (p: Profile) => { const g = p.guides?.find((x) => x.id === id); if (g) { current = p; play(p, g); } else show(p); };
      const p = findProfile(handle);
      if (p) go(p);
      else if (cloudOn()) void fetchProfile(handle).then((r) => { if (r) { remember(r); go(r); } else app.toast("Couldn't find that guide.", 3000); }).catch(() => {});
      else app.toast("Couldn't find that guide.", 3000);
    },
    addSpot(s) {
      const p = me();
      if (!p) { deps.signIn(() => this.addSpot(s)); return; }
      const pick = h("div", { class: "pf-kind-pick" }, ...(Object.keys(SPOT_KINDS) as SpotKind[]).map((k) => h("button", { class: "pf-chip", onclick: () => {
        veil.remove();
        if (p.spots.some((x) => x.name === s.name && Math.abs(x.lat - s.lat) < 0.001)) { app.toast(`${s.name} is already on your page`, 2500); return; }
        const spot: Spot = { id: newId(), name: s.name, kind: k, lon: s.lon, lat: s.lat, where: s.where, slug: s.slug };
        p.spots.push(spot);
        if (p.top.length < TOP) p.top.push(spot.id);
        saveProfile(p);
        app.toast(`${SPOT_KINDS[k].emoji} ${s.name} is on your page${p.top.includes(spot.id) ? `, #${p.top.length} in your Top 8` : ""}`, 3000);
        void reverseGeocode(s.lon, s.lat, 10).then((n) => { const c = n?.context.split(",").slice(-1)[0]?.trim(); if (c) { spot.country = c; spot.where ??= n!.context; saveProfile(p); } }).catch(() => {});
      } }, `${SPOT_KINDS[k].emoji} ${SPOT_KINDS[k].label}`)));
      const veil = h("div", { class: "signin-veil" }, h("div", { class: "signin pf-kind-sheet", role: "dialog", "aria-label": "What kind of place" },
        h("div", { class: "si-head" }, h("h2", {}, `Add ${s.name} to your page`), h("p", {}, "What is it to you?"), h("button", { class: "icon-btn si-close", "aria-label": "Close", html: icons.close, onclick: () => veil.remove() })),
        pick));
      veil.addEventListener("pointerdown", (e) => { if (e.target === veil) veil.remove(); });
      document.body.append(veil);
    },
  };
}
