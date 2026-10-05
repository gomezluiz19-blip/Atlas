// Signing in, and the account button in the top corner. Signed out, the
// button is a quiet person glyph; signed in, it's your avatar. Its menu is
// where Terreno keeps the things about you and about Terreno itself: your page,
// the lenses you've made, switching accounts, the tour, sounds, Terreno AI.
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import type { Profile } from "./model";
import { cloudOn, deleteCloudAccount, takeOAuthReturn } from "../cloud/client";
import { openJoin } from "../auth/join";
import { friendlyError, parseOAuthReturn } from "../auth/model";
import { linkHandle, pullMine } from "../cloud/sync";
import { account, localAccounts, me, onAccount, removeAccount, signIn, signOut } from "./store";

/** A round avatar: the person's emoji on their colour. */
export function avatarEl(p: Pick<Profile, "avatar" | "name">, size = 32): HTMLElement {
  // A monogram: the first letters of the first and last names.
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  const mono = words.length ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() : "·";
  return h("span", { class: "avatar", style: `--av:${p.avatar.color};--size:${size}px`, "aria-hidden": "true" }, mono);
}

const PERSON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.5c1.3-3.3 4-5 7.2-5s5.9 1.7 7.2 5"/></svg>`;

export interface AccountMenuItem { label: string; run: () => void; icon?: string }
export interface AccountUi {
  button: HTMLButtonElement;
  menu: HTMLElement;
  /** Opens sign-in (on the "create" step, or the start). */
  signIn(then?: (p: Profile) => void): void;
  close(): void;
}

export function createAccount(opts: {
  /** Opens a profile page. */
  openProfile(handle: string, edit?: boolean): void;
  /** After someone new signs in: what their role suggests trying first. */
  welcome(p: Profile, fresh: boolean): void;
  /** Extra rows at the bottom of the menu (About, tour, sounds…). */
  extras(): (AccountMenuItem | HTMLElement)[];
  /** Lens Studio. */
  lenses(): void;
}): AccountUi {
  const button = h("button", { class: "round-btn account-btn", "aria-label": "Your account", "aria-haspopup": "menu", "aria-expanded": "false" }) as HTMLButtonElement;
  const menu = h("div", { class: "popover account-menu", hidden: true, role: "menu" });

  const paint = () => {
    const p = me();
    button.replaceChildren();
    if (p) { button.append(avatarEl(p, 30)); button.classList.add("signed-in"); button.setAttribute("aria-label", `${p.name}: your account`); }
    else { button.innerHTML = PERSON; button.classList.remove("signed-in"); button.setAttribute("aria-label", "Sign in, and about Terreno"); }
  };
  paint();
  onAccount(() => { paint(); if (!menu.hidden) renderMenu(); });

  const close = () => { menu.hidden = true; button.setAttribute("aria-expanded", "false"); };
  const row = (label: string, run: () => void, icon = "", extra?: string) =>
    h("button", { class: "am-row", role: "menuitem", onclick: () => { close(); run(); } }, icon ? h("span", { class: "am-ico", html: icon }) : "", h("span", {}, label), extra ? h("small", {}, extra) : "");

  function renderMenu() {
    const p = me();
    const others = localAccounts().filter((a) => a.handle !== p?.handle);
    menu.replaceChildren(
      p
        ? h("button", { class: "am-me", onclick: () => { close(); opts.openProfile(p.handle); } }, avatarEl(p, 44), h("span", {}, h("strong", {}, p.name), h("small", {}, `@${p.handle} · See your page`)))
        : h("div", { class: "am-signin" },
          h("strong", {}, "Your own Terreno"),
          h("p", {}, "A page of the places you love, lenses you make, and your place's daily brief."),
          h("button", { class: "primary-btn", onclick: () => { close(); openSignIn(); } }, "Sign in or join")),
      p ? h("div", { class: "am-group" },
        row("Edit my page", () => opts.openProfile(p.handle, true), icons.pencil),
        row("Field note", () => document.dispatchEvent(new CustomEvent("atlas:note")), icons.pin),
        row("Make a lens", () => opts.lenses(), icons.sparkle)) : "",
      others.length || p ? h("div", { class: "am-group" },
        ...others.slice(0, 4).map((o) => h("button", { class: "am-row", role: "menuitem", onclick: () => { close(); signIn(o); opts.welcome(o, false); } }, avatarEl(o, 22), h("span", {}, `Switch to ${o.name}`))),
        p ? row("Sign out", () => { signOut(); }) : "",
        p && !p.demo ? row("Delete my account", () => void deleteMine(p)) : "") : "",
      h("div", { class: "am-group" }, ...opts.extras().map((x) => x instanceof HTMLElement ? x : row(x.label, x.run, x.icon))));
  }

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    if (open) renderMenu();
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) close(); });
  addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") close(); });

  /** Deletes the account, after asking: the page, everything synced, and the account on Terreno's servers. */
  async function deleteMine(p: Profile) {
    if (!confirm(`Delete @${p.handle}? Your page, your lenses and guides, and everything synced to Terreno's servers go for good. What's saved only on this device (My Place, plans) stays here.`)) return;
    try { if (cloudOn()) await deleteCloudAccount(); }
    catch (e) { document.dispatchEvent(new CustomEvent("atlas:toast", { detail: (e as Error).message })); return; }
    removeAccount(p.handle);
    document.dispatchEvent(new CustomEvent("atlas:toast", { detail: "Your account is deleted." }));
  }

  /** The join flow (auth/join.ts): email, code, your page, home. */
  function openSignIn(next?: (p: Profile) => void, profileFor?: string) {
    openJoin({
      avatar: avatarEl,
      profileFor,
      setHome: (home) => document.dispatchEvent(new CustomEvent("atlas:home", { detail: home })),
      done: (p, fresh) => { opts.welcome(p, fresh); next?.(p); },
    });
  }

  // Back from Google or Apple: keep the session, then either sign in to the page you have or make one.
  const back = parseOAuthReturn(location.hash);
  if (back) {
    history.replaceState(null, "", location.pathname + location.search);
    if ("error" in back) setTimeout(() => document.dispatchEvent(new CustomEvent("atlas:toast", { detail: friendlyError(back.error) })), 400);
    else void takeOAuthReturn(back).then(async (user) => {
      const mine = await pullMine().catch(() => null);
      if (mine) { linkHandle(mine.handle); signIn(mine, user.email); opts.welcome(mine, false); }
      else openSignIn(undefined, user.email ?? "");
    }).catch((e) => document.dispatchEvent(new CustomEvent("atlas:toast", { detail: friendlyError((e as Error).message) })));
  }

  return { button, menu, signIn: openSignIn, close };
}

export const signedIn = () => !!account();
