// Lens Studio: say what you want to see anywhere on Earth ("birdwatching",
// "a coffee crawl with bakeries", "is it a surf day?") and Terreno builds the
// lens. Then try it on a real place, tweak its blocks, keep it, and share it
// as a link. Everyone's lenses are in the gallery to try and remix.
import type { App } from "../app";
import { aiOn, askForTool } from "../robot/llm";
import { cloudOn } from "../cloud/client";
import { recentLenses } from "../cloud/sync";
import { avatarEl } from "../social/account";
import { findProfile, me, saveProfile } from "../social/store";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { packJson, unpackJson } from "../data/pack";
import { IDEAS, LENS_SCHEMA, LENS_SYSTEM, composeLens } from "./compose";
import { BLOCK_INFO, SPECIES_GROUPS, lensFromJson, type Block, type LensDef } from "./custom";
import { allLenses, deleteLens, findLens, isKept, isMade, keep, madeLenses, rememberLens, saveLens } from "./library";

const COLORS = ["#30b0c7", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#34c759", "#a2845e"];

/** One line about what a block will show. */
export function blockDetail(b: Block): string {
  switch (b.type) {
    case "species": return `${SPECIES_GROUPS[b.group]?.label ?? "Wildlife"}, last ${b.days ?? 30} days`;
    case "places": return `${b.title}: ${b.tags.join(", ")}`;
    case "weather": {
      const g = b.good ?? {};
      const r = [g.windMax !== undefined && `wind < ${g.windMax} km/h`, g.rainMax !== undefined && (g.rainMax === 0 ? "dry" : `rain < ${g.rainMax} mm`), g.cloudMax !== undefined && `cloud < ${g.cloudMax}%`, g.cloudMin !== undefined && `cloud > ${g.cloudMin}%`, g.tempMin !== undefined && `≥ ${g.tempMin}°`, g.tempMax !== undefined && `≤ ${g.tempMax}°`].filter(Boolean);
      return `${b.when === "night" ? "After dark" : b.when === "any" ? "Day and night" : "Daytime"}${r.length ? `, good when ${r.join(", ")}` : ""}`;
    }
    case "marine": return "Wave height, period, swell direction, sea temperature";
    case "tip": return b.text;
    default: return BLOCK_INFO[b.type].about;
  }
}

export interface LensStudio {
  open(def?: LensDef): void;
  openPacked(packed: string): Promise<boolean>;
  close(): void;
  readonly isOpen: boolean;
}

export function createLensStudio(app: App, deps: {
  /** Adds (or refreshes) a lens in the strip and opens it on the chosen place, or its home. */
  tryLens(def: LensDef): void;
  /** Lenses kept or made changed: refresh the strip. */
  changed(): void;
  openProfile(handle: string): void;
}): LensStudio {
  const el = h("section", { class: "lens-studio", hidden: true, role: "dialog", "aria-label": "Lens Studio" });
  const back = h("button", { class: "pf-return", hidden: true }, h("span", { html: "&larr;" }), h("span", {}, "✨ Lens Studio"));
  (document.getElementById("ui") ?? document.body).append(el, back);
  let def: LensDef | null = null;
  let busy = false;
  let status = "";
  let draftPrompt = "";

  const close = () => { el.hidden = true; back.hidden = true; document.body.classList.remove("studio-open"); };
  const show = () => { el.hidden = false; back.hidden = true; document.body.classList.add("studio-open"); render(); };
  back.addEventListener("click", show);

  async function design(prompt: string, refine = false) {
    const p = prompt.trim();
    if (!p || busy) return;
    busy = true;
    status = aiOn() ? "Claude is designing your lens…" : "Building your lens…";
    render();
    let next: LensDef | null = null;
    try {
      if (aiOn()) {
        const request = refine && def ? `Here is a lens:\n${JSON.stringify({ ...def, id: undefined, home: undefined })}\n\nChange it like this: ${p}` : `Make a lens for: ${p}`;
        const raw = await askForTool(LENS_SYSTEM, { name: "make_lens", description: "Create the lens recipe.", input_schema: LENS_SCHEMA }, request);
        next = lensFromJson({ ...raw, id: refine && def ? def.id : undefined });
      }
    } catch (e) {
      app.toast(`Terreno AI couldn't answer (${(e as Error).message}). Using the built-in designer.`, 4500);
    }
    if (!next) {
      const made = composeLens(p);
      if (refine && def && made) {
        // Merge: keep what's there, add what's new.
        const have = new Set(def.blocks.map((b) => JSON.stringify(b.type === "places" ? b.tags : b.type === "species" ? b.group : b.type)));
        next = { ...def, blocks: [...def.blocks, ...made.blocks.filter((b) => !have.has(JSON.stringify(b.type === "places" ? b.tags : b.type === "species" ? b.group : b.type)) && b.type !== "tip")].slice(0, 10) };
      } else next = made;
    }
    busy = false;
    status = "";
    if (!next) { status = "I couldn't make a lens from that. Try naming an activity (“birdwatching”, “surfing”) or kinds of place (“cafés and bookshops”)."; render(); return; }
    const who = me();
    def = { ...next, author: def?.author && refine ? def.author : who?.handle, id: refine && def ? def.id : `${next.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 6)}` };
    draftPrompt = refine ? draftPrompt : p;
    render();
    el.querySelector(".ls-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function tryIt(d: LensDef) {
    el.hidden = true;
    document.body.classList.remove("studio-open");
    back.hidden = false;
    deps.tryLens(d);
  }

  function saveIt(d: LensDef) {
    saveLens(d);
    keep(d.id, true);
    const p = me();
    if (p && d.author === p.handle && !p.lenses.includes(d.id)) { p.lenses.unshift(d.id); saveProfile(p); }
    deps.changed();
    app.toast(`${d.icon} ${d.name} is in your lenses. It's offered for every place you tap.`, 4000);
    render();
  }

  async function share(d: LensDef) {
    const link = (findLens(d.id) && !isMade(d.id) && !d.id.includes("-")) || (cloudOn() && isMade(d.id)) ? `${location.origin}${location.pathname}#/lens/${d.id}` : `${location.origin}${location.pathname}#/lens/~${await packJson(d)}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: `${d.name}: a lens on Terreno`, url: link });
      else { await navigator.clipboard.writeText(link); app.toast("Link copied. Anyone who opens it gets the lens.", 3000); }
    } catch { /* dismissed */ }
  }

  // ---- Rendering ----
  function editor(d: LensDef): HTMLElement {
    const upd = (f: (x: LensDef) => void) => { f(d); render(); };
    const name = h("input", { class: "ls-name", value: d.name, maxlength: 40, "aria-label": "Lens name", onchange: (e: Event) => upd((x) => (x.name = (e.target as HTMLInputElement).value.trim() || x.name)) });
    const blurb = h("input", { class: "ls-blurb", value: d.blurb, maxlength: 140, "aria-label": "What it shows", onchange: (e: Event) => upd((x) => (x.blurb = (e.target as HTMLInputElement).value.trim())) });
    const icon = h("input", { class: "ls-icon", value: d.icon, maxlength: 4, "aria-label": "Icon (an emoji)", style: `--lc:${d.color}`, onchange: (e: Event) => upd((x) => (x.icon = (e.target as HTMLInputElement).value.trim() || x.icon)) });
    const move = (i: number, by: number) => upd((x) => { const [b] = x.blocks.splice(i, 1); x.blocks.splice(Math.max(0, Math.min(x.blocks.length, i + by)), 0, b); });
    const addPlaces = h("input", { class: "pf-input", placeholder: "Add places… (“bookshops”, “ramen”, “waterfalls”)", "aria-label": "Add places", onkeydown: (ev: Event) => { const e = ev as KeyboardEvent;
      if (e.key !== "Enter") return;
      const words = (e.target as HTMLInputElement).value;
      const made = composeLens(words);
      const extra = made?.blocks.filter((b) => b.type === "places" || b.type === "species") ?? [];
      if (!extra.length) { app.toast("I don't know that kind of place yet. Try another word.", 3000); return; }
      upd((x) => { x.blocks.push(...extra.filter((b) => !x.blocks.some((y) => JSON.stringify(y) === JSON.stringify(b)))); });
    } });
    const missing = (["sky", "aurora", "sun", "marine", "ground", "weather"] as const).filter((t) => !d.blocks.some((b) => b.type === t));
    const species = h("select", { class: "pf-input", "aria-label": "Add wildlife", onchange: (e: Event) => { const g = (e.target as HTMLSelectElement).value; if (g) upd((x) => x.blocks.push({ type: "species", group: g, days: 30 })); } },
      h("option", { value: "" }, "Add wildlife…"), ...Object.entries(SPECIES_GROUPS).map(([k, v]) => h("option", { value: k }, `${v.emoji} ${v.label}`)));
    return h("div", { class: "ls-result", style: `--lc:${d.color}` },
      h("div", { class: "ls-head" }, icon, h("div", { class: "ls-head-text" }, name, blurb)),
      h("div", { class: "ls-colors" }, ...COLORS.map((c) => h("button", { class: "si-color", style: `--c:${c}`, "aria-pressed": String(c === d.color), "aria-label": "Colour", onclick: () => upd((x) => (x.color = c)) }))),
      h("ol", { class: "ls-blocks" }, ...d.blocks.map((b, i) => h("li", { class: "ls-block" },
        h("span", { class: "ls-block-emoji" }, b.type === "species" ? SPECIES_GROUPS[b.group]?.emoji ?? "🔭" : b.type === "places" ? b.emoji ?? "📍" : BLOCK_INFO[b.type].emoji),
        h("span", { class: "ls-block-text" }, h("strong", {}, b.type === "places" ? b.title : b.type === "species" ? b.title ?? `${SPECIES_GROUPS[b.group]?.label} seen lately` : BLOCK_INFO[b.type].label), h("small", {}, blockDetail(b))),
        h("span", { class: "ls-block-tools" },
          i > 0 ? h("button", { class: "icon-btn", "aria-label": "Move up", onclick: () => move(i, -1) }, "↑") : "",
          h("button", { class: "icon-btn", "aria-label": "Remove", html: icons.close, onclick: () => upd((x) => x.blocks.splice(i, 1)) }))))),
      h("div", { class: "ls-add" },
        addPlaces, species,
        h("div", { class: "ls-add-chips" }, ...missing.map((t) => h("button", { class: "pf-chip", onclick: () => upd((x) => x.blocks.push(t === "weather" ? { type: "weather", when: "day" } : { type: t })) }, `${BLOCK_INFO[t].emoji} ${BLOCK_INFO[t].label}`)),
),
        !d.blocks.some((b) => b.type === "tip") ? h("input", { class: "pf-input", placeholder: "💬 Add a tip for people who use it (press Enter)", "aria-label": "Add a tip", onkeydown: (ev: Event) => { const e = ev as KeyboardEvent; const t = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && t) upd((x) => x.blocks.push({ type: "tip", text: t.slice(0, 400) })); } }) : ""),
      h("div", { class: "ls-refine" },
        h("input", { class: "pf-input", placeholder: aiOn() ? "Ask Claude to change it… (“only after dark”, “add cafés”)" : "Change it… (“add cafés”, “and waterfalls”)", "aria-label": "Change the lens", onkeydown: (ev: Event) => { const e = ev as KeyboardEvent; if (e.key === "Enter") void design((e.target as HTMLInputElement).value, true); } })),
      h("div", { class: "ls-actions" },
        h("button", { class: "primary-btn", onclick: () => tryIt(d) }, app.place ? `Try it on ${app.place.name?.title ?? "this place"}` : d.home ? `Try it at ${d.home.name}` : "Try it"),
        h("button", { class: "pill-btn", onclick: () => saveIt(d) }, isMade(d.id) ? "Save changes" : "Keep it"),
        h("button", { class: "pill-btn", onclick: () => void share(d) }, "Share")));
  }

  function galleryCard(d: LensDef): HTMLElement {
    const author = d.author ? findProfile(d.author) : null;
    return h("div", { class: "ls-card", style: `--lc:${d.color}` },
      h("span", { class: "ls-card-icon" }, d.icon),
      h("div", { class: "ls-card-text" }, h("strong", {}, d.name), h("small", {}, d.blurb),
        author ? h("button", { class: "ls-by", onclick: () => { close(); deps.openProfile(author.handle); } }, avatarEl(author, 18), h("span", {}, author.name)) : d.author ? h("small", {}, `@${d.author}`) : ""),
      h("div", { class: "ls-card-actions" },
        h("button", { class: "pill-btn", onclick: () => tryIt(d) }, "Try"),
        h("button", { class: "link-btn", onclick: () => { def = { ...structuredClone(d), id: `${d.id}-${Math.random().toString(36).slice(2, 6)}`, from: d.id, author: me()?.handle, name: d.name }; render(); el.querySelector(".ls-result")?.scrollIntoView({ behavior: "smooth", block: "start" }); } }, "Remix"),
        isMade(d.id) ? h("button", { class: "link-btn danger", onclick: () => { deleteLens(d.id); deps.changed(); render(); } }, "Delete")
          : h("button", { class: "link-btn", "aria-pressed": String(isKept(d.id)), onclick: () => { keep(d.id, !isKept(d.id)); deps.changed(); render(); app.toast(isKept(d.id) ? `${d.name} added to your lenses` : `${d.name} removed from your lenses`, 2500); } }, isKept(d.id) ? "✓ Kept" : "Keep")));
  }

  function render() {
    const input = h("textarea", { class: "ls-prompt", rows: 2, placeholder: "Describe a lens… “Birdwatching: what's been seen lately and whether it's calm enough”", "aria-label": "Describe a lens" }, draftPrompt) as HTMLTextAreaElement;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void design(input.value); } });
    const mine = madeLenses();
    const others = allLenses().filter((d) => !mine.some((m) => m.id === d.id));
    el.replaceChildren(
      h("header", { class: "ls-top" },
        h("div", {}, h("span", { class: "ls-kicker" }, "✨ Lens Studio"), h("h2", {}, "Make a lens"), h("p", {}, "Describe what you want to see anywhere on Earth. Terreno builds a lens you can try on any place, tweak, keep and share.")),
        h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: close })),
      h("div", { class: "ls-ask" }, input,
        h("button", { class: "primary-btn", disabled: busy, onclick: () => void design(input.value) }, busy ? "Making…" : aiOn() ? "Design with Claude" : "Make it")),
      status ? h("p", { class: busy ? "ls-status busy" : "ls-status" }, busy ? h("span", { class: "spinner small" }) : "", status) : "",
      !def ? h("div", { class: "ls-ideas" }, ...IDEAS.map((i) => h("button", { class: "pf-chip", onclick: () => void design(i) }, i))) : "",
      def ? editor(def) : "",
      !aiOn() ? h("p", { class: "ls-fine" }, "Connect Terreno AI (in the account menu) and Claude designs lenses from any description. Without it, Terreno's built-in designer knows the common ones.") : "",
      mine.length ? h("section", { class: "ls-gallery" }, h("h3", {}, "Made by you"), ...mine.map(galleryCard)) : "",
      h("section", { class: "ls-gallery" }, h("h3", {}, "Made by people"), ...[...others, ...remote.filter((r) => !others.some((o) => o.id === r.id) && !mine.some((m) => m.id === r.id))].map(galleryCard)));
    if (cloudOn() && !remoteAsked) {
      remoteAsked = true;
      void recentLenses().then((ls) => { remote = ls; if (!el.hidden) render(); }).catch(() => {});
    }
  }
  let remote: LensDef[] = [];
  let remoteAsked = false;

  return {
    get isOpen() { return !el.hidden; },
    open(d) { if (d) def = structuredClone(d); show(); },
    async openPacked(packed) {
      const d = lensFromJson(await unpackJson(packed));
      if (!d) return false;
      rememberLens(d);
      def = d;
      show();
      app.toast(`${d.icon} ${d.name}: a lens someone shared. Try it, keep it or remix it.`, 4500);
      return true;
    },
    close,
  };
}
