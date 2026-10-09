// Your network, one tap from anywhere: a row of the people you follow, each tile showing whether they're free.
// Tap one for their card: what they're up to and since when, the time and weather where they live, and the
// ways to reach them (a message here, or the apps they've chosen to show). Your own status is set from here too.
import type { App } from "../app";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { timeThere } from "../people/mine";
import { weatherAt } from "../people/mineUi";
import { avatarEl } from "./account";
import { canDeliver, conversation, markRead, onMessages, refresh, send, unreadFor } from "./messages";
import { accentOf, ROLES, type Profile } from "./model";
import { byDay, REACH, reachFromJson, reachLink, STATES, statusNow, type Reach, type StatusState } from "./presence";
import { allProfiles, findProfile, follow, following, isFollowing, me, onAccount, saveProfile } from "./store";

const now = () => new Date();

/** How to ask someone to sign in first (set once by the app's wiring). */
let askSignIn: (then: () => void) => void = () => {};
export const setSignIn = (fn: (then: () => void) => void) => { askSignIn = fn; };
const first = (p: Profile) => p.name.split(" ")[0];

/** A person's tile with their status as a small pigment square in the corner. */
export function faceWithStatus(p: Profile, size = 44): HTMLElement {
  const st = statusNow(p.status, now());
  return h("span", { class: "fr-face", style: `--size:${size}px` }, avatarEl(p, size),
    st ? h("i", { class: `fr-dot${st.stale ? " stale" : ""}`, style: `--c:${st.color}`, title: st.stale ? `${st.label} (last set ${st.when.toLowerCase()})` : st.label }) : "");
}

/** The status line: pigment, words, and how long ago (faded once a day old). */
export function statusLine(p: Profile, opts: { long?: boolean } = {}): HTMLElement | "" {
  const st = statusNow(p.status, now());
  if (!st) return "";
  return h("p", { class: `fr-status${st.stale ? " stale" : ""}`, style: `--c:${st.color}` },
    h("i", {}), h("strong", {}, st.label),
    st.line ? h("span", {}, st.line) : "",
    h("time", {}, st.stale ? `Last set ${st.when.toLowerCase()}` : st.when),
    opts.long && !st.stale ? h("small", {}, STATES[st.state].hint) : "");
}

/** "14:05 in Lisbon · 21° Clear": the time and weather where they live (filled in when it arrives). */
export function clockThere(p: Profile): HTMLElement | "" {
  if (!p.home) return "";
  const el = h("p", { class: "fr-clock" });
  const place = p.home.name.split(",")[0];
  void weatherAt(p.home).then((w) => {
    if (!w) return;
    const t = timeThere(w.tz, now());
    el.replaceChildren(t ? h("span", { class: "fr-mono" }, t.clock) : "", ` in ${place}`, h("span", { class: "fr-sep" }, "·"), h("span", { class: "fr-mono" }, `${w.temp}°`), ` ${w.text}`,
      t && t.diff !== "same time" ? h("span", { class: "fr-diff" }, t.diff) : "");
  });
  return el;
}

/** The ways someone has chosen to be reached, as tiles. */
function reachTiles(p: Profile, hello: string): HTMLElement | "" {
  const rs = p.reach ?? [];
  if (!rs.length) return "";
  return h("div", { class: "fr-reach" }, ...rs.map((r) => h("a", { class: "fr-reach-tile", href: reachLink(r, hello), target: r.kind === "call" || r.kind === "text" || r.kind === "email" ? "_self" : "_blank", rel: "noopener" },
    h("span", { html: r.kind === "call" ? icons.phone : r.kind === "email" ? icons.link : icons.message }), REACH[r.kind].verb)));
}

// ---- The card ----------------------------------------------------------------------------------------

/** A person's card, over the map: status, their time and weather, Message, the ways to reach them, their page. */
export function openFriend(app: App, handle: string, opts: { thread?: boolean; signIn?: (then: () => void) => void } = {}) {
  const p = findProfile(handle);
  if (!p) return;
  document.querySelector(".fr-veil")?.remove();
  const panel = h("div", { class: "fr-card", role: "dialog", "aria-label": `${p.name}` });
  const veil = h("div", { class: "fr-veil" }, panel);
  const close = () => { veil.remove(); removeEventListener("keydown", esc); off(); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  addEventListener("keydown", esc);
  let view: "card" | "thread" = opts.thread ? "thread" : "card";
  const off = onMessages(() => { if (view === "thread") draw(); });
  panel.style.setProperty("--pf-accent", accentOf(p));

  const head = () => h("div", { class: "fr-head" },
    view === "thread" ? h("button", { class: "fr-icon", "aria-label": "Back", html: "&larr;", onclick: () => { view = "card"; draw(); } }) : "",
    faceWithStatus(p, view === "thread" ? 36 : 56),
    h("div", { class: "fr-id" }, h("strong", {}, p.name), h("small", { class: "fr-mono" }, `@${p.handle}`),
      view === "card" ? h("small", {}, [ROLES.find((r) => r.id === p.role)?.label, p.home?.name].filter(Boolean).join(" · ")) : ""),
    h("button", { class: "fr-icon", "aria-label": "Close", html: icons.close, onclick: close }));

  const message = () => {
    if (!me()) { (opts.signIn ?? askSignIn)(() => { view = "thread"; draw(); }); return; }
    view = "thread"; draw();
  };

  const card = () => {
    const mine = me();
    const followingNow = isFollowing(p.handle);
    const unread = mine ? unreadFor(mine.handle)[p.handle] ?? 0 : 0;
    return [
      head(),
      statusLine(p, { long: true }) || h("p", { class: "fr-status none" }, `${first(p)} hasn't set a status.`),
      clockThere(p),
      h("div", { class: "fr-actions" },
        mine?.handle === p.handle ? "" : h("button", { class: "fr-btn primary", onclick: message }, h("span", { html: icons.message }), unread ? `Message · ${unread} new` : "Message"),
        h("button", { class: "fr-btn", onclick: () => { close(); app.actions.get("profile:open")?.run(p.handle); } }, "Page"),
        p.home ? h("button", { class: "fr-btn", onclick: () => { close(); void flyToPlace(app.globe, { name: p.home!.name, lon: p.home!.lon, lat: p.home!.lat, radius: 20_000 }); } }, "On the map") : "",
        mine?.handle === p.handle ? "" : h("button", { class: "fr-btn", "aria-pressed": String(followingNow), onclick: () => { follow(p.handle, !followingNow); draw(); } }, followingNow ? "Following" : "Follow")),
      reachTiles(p, mine ? `Hi ${first(p)}, it's ${first(mine)}. ` : ""),
      p.demo ? h("p", { class: "fr-fine" }, `${first(p)} is an example person: messages to them stay on this device.`) : "",
    ];
  };

  const threadView = () => {
    const mine = me()!;
    markRead(mine.handle, p.handle);
    const ms = conversation(mine.handle, p.handle);
    const list = h("div", { class: "fr-thread" },
      ...(ms.length ? byDay(ms, now()).flatMap((d) => [h("p", { class: "fr-day" }, d.day), ...d.items.map((m) =>
        h("div", { class: `fr-msg ${m.from === mine.handle ? "out" : "in"}` }, h("p", {}, m.text),
          h("small", { class: "fr-mono" }, new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), m.from === mine.handle ? ` · ${m.via === "sent" ? "Sent" : "On this device"}` : "")))])
        : [h("p", { class: "fr-empty" }, `Say hello to ${first(p)}.`)]));
    const box = h("textarea", { class: "fr-input", rows: 1, placeholder: `Message ${first(p)}`, "aria-label": "Message", maxlength: "2000" }) as HTMLTextAreaElement;
    const go = async () => {
      const text = box.value;
      if (!text.trim()) return;
      box.value = "";
      await send(mine.handle, p.handle, text, { example: p.demo });
      draw();
      panel.querySelector<HTMLTextAreaElement>(".fr-input")?.focus();
    };
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void go(); } });
    box.addEventListener("input", () => { box.style.height = "auto"; box.style.height = `${Math.min(140, box.scrollHeight)}px`; });
    const note = p.demo ? `${first(p)} is an example person, so messages stay on this device.`
      : canDeliver() ? "" : `Terreno's servers aren't on here yet, so messages stay on this device.${p.reach?.length ? ` Reach ${first(p)} another way:` : ""}`;
    setTimeout(() => { list.scrollTop = list.scrollHeight; box.focus(); }, 0);
    return [head(), statusLine(p), list,
      note ? h("div", { class: "fr-note" }, h("p", {}, note), p.demo ? "" : reachTiles(p, "")) : "",
      h("div", { class: "fr-compose" }, box, h("button", { class: "fr-send", "aria-label": "Send", html: icons.send, onclick: () => void go() }))];
  };

  const draw = () => {
    panel.classList.toggle("thread", view === "thread");
    panel.replaceChildren(...(view === "card" ? card() : threadView()));
  };
  draw();
  (document.getElementById("ui") ?? document.body).append(veil);
  const mine = me();
  if (mine) void refresh(mine.handle).then(() => { if (view === "thread") draw(); });
}

// ---- Your status -------------------------------------------------------------------------------------

/** Set what you're up to: a state, a line, and where (a town, if you like). */
export function statusEditor(p: Profile, done: () => void): HTMLElement {
  let state: StatusState = p.status?.state ?? "free";
  const text = h("input", { class: "fr-input", placeholder: "What you're up to (optional)", maxlength: "100", value: p.status?.text ?? "" }) as HTMLInputElement;
  const where = h("input", { class: "fr-input", placeholder: "Where, in a word or two (optional)", maxlength: "60", value: p.status?.where ?? "" }) as HTMLInputElement;
  const chips = h("div", { class: "fr-states", role: "radiogroup", "aria-label": "Status" });
  const drawChips = () => chips.replaceChildren(...(Object.keys(STATES) as StatusState[]).map((s) =>
    h("button", { class: `fr-state${s === state ? " on reg" : ""}`, role: "radio", "aria-checked": String(s === state), style: `--c:${STATES[s].color}`, onclick: () => { state = s; drawChips(); } }, h("i"), STATES[s].label)));
  drawChips();
  return h("div", { class: "fr-editor" }, chips, text, where,
    h("div", { class: "fr-actions" },
      p.status ? h("button", { class: "fr-btn", onclick: () => { p.status = undefined; saveProfile(p); done(); } }, "Clear") : "",
      h("button", { class: "fr-btn primary", onclick: () => { p.status = { state, at: new Date().toISOString(), ...(text.value.trim() ? { text: text.value.trim() } : {}), ...(where.value.trim() ? { where: where.value.trim() } : {}) }; saveProfile(p); done(); } }, "Set status")),
    h("p", { class: "fr-fine" }, "Shown on your page and to people who follow you. It fades after a day."));
}

/** The ways you're happy to be reached: shown on your page, so only add what you'd share. */
export function reachEditor(p: Profile, done: () => void): HTMLElement {
  const rows = (Object.keys(REACH) as Reach["kind"][]).map((kind) => {
    const input = h("input", { class: "fr-input", placeholder: REACH[kind].placeholder, value: p.reach?.find((r) => r.kind === kind)?.value ?? "", "aria-label": REACH[kind].label }) as HTMLInputElement;
    return { kind, input, el: h("label", { class: "fr-reach-row" }, h("span", {}, REACH[kind].label), input) };
  });
  const err = h("p", { class: "fr-fine danger" });
  return h("div", { class: "fr-editor" }, ...rows.map((r) => r.el), err,
    h("div", { class: "fr-actions" }, h("button", { class: "fr-btn primary", onclick: () => {
      const raw = rows.filter((r) => r.input.value.trim()).map((r) => ({ kind: r.kind, value: r.input.value.trim() }));
      const ok = reachFromJson(raw);
      if (ok.length < raw.length) { err.textContent = `Check ${raw.filter((r) => !ok.some((o) => o.kind === r.kind)).map((r) => REACH[r.kind].label).join(", ")}.`; return; }
      p.reach = ok; saveProfile(p); done();
    } }, "Save")),
    h("p", { class: "fr-fine" }, "These show on your page as buttons that open the app. Leave any empty."));
}

// ---- The network row ---------------------------------------------------------------------------------

/** The people you follow as tiles, busiest-to-reach last; tap one for their card. */
export function networkStrip(app: App, opts: { signIn?: (then: () => void) => void; title?: string } = {}): HTMLElement {
  const box = h("section", { class: "group fr-network" });
  const draw = () => {
    const mine = me();
    const unread = mine ? unreadFor(mine.handle) : {};
    const order: Record<StatusState, number> = { free: 0, out: 1, travelling: 2, busy: 3, quiet: 4 };
    const people = following().flatMap((hdl) => findProfile(hdl) ?? []).sort((a, b) => {
      const sa = statusNow(a.status, now()), sb = statusNow(b.status, now());
      return (unread[b.handle] ?? 0) - (unread[a.handle] ?? 0) || (sa && !sa.stale ? order[sa.state] : 9) - (sb && !sb.stale ? order[sb.state] : 9);
    });
    const freeNow = people.filter((p) => { const s = statusNow(p.status, now()); return s && !s.stale && s.state === "free"; }).length;
    const tile = (p: Profile) => h("button", { class: "fr-tile", onclick: () => openFriend(app, p.handle, { signIn: opts.signIn }), title: p.name },
      faceWithStatus(p, 48), h("span", {}, first(p)), unread[p.handle] ? h("b", { class: "fr-badge" }, String(unread[p.handle])) : "");
    const meTile = mine ? h("button", { class: "fr-tile me", onclick: () => {
      const slot = box.querySelector(".fr-slot")!;
      slot.replaceChildren(statusEditor(mine, () => { slot.replaceChildren(); draw(); }));
    } }, faceWithStatus(mine, 48), h("span", {}, mine.status ? "You" : "Set status")) : "";
    const suggestions = people.length ? [] : findSuggestions();
    box.replaceChildren(
      h("div", { class: "fr-net-head" }, h("h2", { class: "group-title" }, opts.title ?? "Your network"),
        people.length ? h("small", { class: "fr-mono" }, `${freeNow} free now`) : ""),
      h("div", { class: "fr-row" }, meTile, ...people.map(tile)),
      h("div", { class: "fr-slot" }),
      !people.length ? h("div", { class: "fr-suggest" },
        h("p", {}, "Follow people to see here whether they're free, and message them in one tap."),
        ...suggestions.map((p) => h("div", { class: "fr-suggest-row" },
          h("button", { class: "fr-suggest-main", onclick: () => openFriend(app, p.handle, { signIn: opts.signIn }) }, faceWithStatus(p, 34), h("span", {}, h("strong", {}, p.name), h("small", {}, p.home?.name ?? ""))),
          h("button", { class: "fr-btn", onclick: () => { follow(p.handle, true); draw(); } }, "Follow")))) : "");
  };
  const findSuggestions = () => {
    const mine = me();
    return allProfiles().filter((p) => p.handle !== mine?.handle && !isFollowing(p.handle)).slice(0, 4);
  };
  draw();
  const offA = onAccount(() => (box.isConnected ? draw() : offA()));
  const offM = onMessages(() => (box.isConnected ? draw() : offM()));
  return box;
}
