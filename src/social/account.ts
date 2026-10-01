// Signing in, and the account button in the top corner. Signed out, the
// button is a quiet person glyph; signed in, it's your avatar. Its menu is
// where Atlas keeps the things about you and about Atlas itself: your page,
// the lenses you've made, switching accounts, the tour, sounds, Atlas AI.
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { DEMO_PROFILES } from "./demo";
import { AVATAR_COLORS, AVATAR_EMOJI, ROLES, blankProfile, slugHandle, type Profile, type Role } from "./model";
import { cloudOn, sendCode, verifyCode } from "../cloud/client";
import { handleFree, linkHandle, pullMine, pushProfile } from "../cloud/sync";
import { account, handleTaken, localAccounts, me, onAccount, signIn, signOut } from "./store";

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
  const veil = h("div", { class: "signin-veil", hidden: true });
  const sheet = h("div", { class: "signin", role: "dialog", "aria-modal": "true", "aria-label": "Sign in to Atlas" });
  veil.append(sheet);
  document.body.append(veil);

  const paint = () => {
    const p = me();
    button.replaceChildren();
    if (p) { button.append(avatarEl(p, 30)); button.classList.add("signed-in"); button.setAttribute("aria-label", `${p.name}: your account`); }
    else { button.innerHTML = PERSON; button.classList.remove("signed-in"); button.setAttribute("aria-label", "Sign in, and about Atlas"); }
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
          h("strong", {}, "Your own Atlas"),
          h("p", {}, "A page of the places you love, lenses you make, and your place's daily brief."),
          h("button", { class: "primary-btn", onclick: () => { close(); openSignIn(); } }, "Sign in or join")),
      p ? h("div", { class: "am-group" },
        row("Edit my page", () => opts.openProfile(p.handle, true), icons.pencil),
        row("Field note", () => document.dispatchEvent(new CustomEvent("atlas:note")), icons.pin),
        row("Make a lens", () => opts.lenses(), icons.sparkle)) : "",
      others.length || p ? h("div", { class: "am-group" },
        ...others.slice(0, 4).map((o) => h("button", { class: "am-row", role: "menuitem", onclick: () => { close(); signIn(o); opts.welcome(o, false); } }, avatarEl(o, 22), h("span", {}, `Switch to ${o.name}`))),
        p ? row("Sign out", () => { signOut(); }) : "") : "",
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
  addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") { close(); if (!veil.hidden) hideSignIn(); } });

  // ---- Sign in ----------------------------------------------------------------------------------
  let then: ((p: Profile) => void) | undefined;
  const hideSignIn = () => { veil.classList.add("out"); setTimeout(() => { veil.hidden = true; veil.classList.remove("out"); }, 220); };
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) hideSignIn(); });
  const done = (p: Profile, fresh: boolean) => { hideSignIn(); opts.welcome(p, fresh); then?.(p); then = undefined; };

  const head = (title: string, sub: string) => h("div", { class: "si-head" },
    h("div", { class: "si-mark", "aria-hidden": "true" }),
    h("h2", {}, title), h("p", {}, sub),
    h("button", { class: "icon-btn si-close", "aria-label": "Close", html: icons.close, onclick: hideSignIn }));

  function startStep() {
    const email = h("input", { type: "email", class: "si-input", placeholder: "you@example.com", autocomplete: "email", "aria-label": "Email" }) as HTMLInputElement;
    const err = h("p", { class: "si-err", role: "alert" });
    const go = () => {
      const v = email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { err.textContent = "That doesn't look like an email address."; email.focus(); return; }
      if (!cloudOn()) { createStep(v); return; }
      err.textContent = "";
      cont.disabled = true; cont.textContent = "Sending…";
      sendCode(v).then(() => codeStep(v)).catch((e) => { err.textContent = (e as Error).message; cont.disabled = false; cont.textContent = "Continue"; });
    };
    const cont = h("button", { class: "primary-btn", onclick: go }, "Continue") as HTMLButtonElement;
    email.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    const mine = localAccounts();
    sheet.replaceChildren(
      head("Your own Atlas", "Keep a page of the places you love, make lenses to share, and follow the people who map the world with you."),
      mine.length ? h("div", { class: "si-block" }, h("h3", {}, "On this device"),
        h("div", { class: "si-people" }, ...mine.slice(0, 4).map((p) => h("button", { class: "si-person", onclick: () => { signIn(p); done(p, false); } }, avatarEl(p, 40), h("strong", {}, p.name), h("small", {}, `@${p.handle}`))))) : "",
      h("div", { class: "si-block" },
        h("label", { class: "si-label" }, "Sign in or join with email"),
        h("div", { class: "si-row" }, email, cont), err),
      h("div", { class: "si-or" }, h("span", {}, "or be someone for a while")),
      h("div", { class: "si-people" }, ...DEMO_PROFILES.slice(0, 6).map((d) => {
        const role = ROLES.find((r) => r.id === d.role)!;
        return h("button", { class: "si-person", onclick: () => { const copy = structuredClone(d); signIn(copy); done(copy, false); } }, avatarEl(d, 40), h("strong", {}, d.name.split(" ")[0]), h("small", {}, role.short ?? role.label));
      })),
      h("p", { class: "si-fine" }, cloudOn()
        ? "We'll email you a six-digit code: no password to remember. Your page is public, so people can find it; everything else you make stays yours."
        : "This is a preview: your account lives in this browser, and nothing is sent anywhere. When Atlas's servers are switched on, you'll be able to sign in from any device."));
    setTimeout(() => email.focus(), 60);
  }

  /** With Atlas's servers: the six-digit code from the email. */
  function codeStep(email: string) {
    const code = h("input", { class: "si-input si-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "••••••", "aria-label": "Six-digit code" }) as HTMLInputElement;
    const err = h("p", { class: "si-err", role: "alert" });
    const check = async () => {
      const t = code.value.replace(/\D/g, "");
      if (t.length !== 6) { err.textContent = "The code has six digits."; return; }
      err.textContent = "";
      code.disabled = true;
      try {
        await verifyCode(email, t);
        const mine = await pullMine().catch(() => null);
        if (mine) { linkHandle(mine.handle); signIn(mine, email); done(mine, false); }
        else createStep(email);
      } catch (e) { err.textContent = (e as Error).message.replace(/token/i, "code"); code.disabled = false; code.focus(); }
    };
    code.addEventListener("input", () => { if (code.value.replace(/\D/g, "").length === 6) void check(); });
    sheet.replaceChildren(
      head("Check your email", `We sent a six-digit code to ${email}.`),
      code, err,
      h("div", { class: "si-actions" }, h("button", { class: "link-btn", onclick: startStep }, "Use another email"), h("button", { class: "link-btn", onclick: () => void sendCode(email).then(() => (err.textContent = "Sent again.")).catch((e) => (err.textContent = (e as Error).message)) }, "Send it again")));
    setTimeout(() => code.focus(), 60);
  }

  function createStep(email: string) {
    let role: Role = "explorer";
    let emoji = AVATAR_EMOJI[Math.floor(Math.random() * AVATAR_EMOJI.length)], color = AVATAR_COLORS[0];
    const guess = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
    const name = h("input", { class: "si-input", placeholder: "Your name", autocomplete: "name", value: guess ? guess.replace(/\b\w/g, (c) => c.toUpperCase()) : "", "aria-label": "Your name" }) as HTMLInputElement;
    const handle = h("input", { class: "si-input si-handle", placeholder: "yourname", autocomplete: "username", "aria-label": "Your handle" }) as HTMLInputElement;
    let handleTouched = false;
    const free = (base: string) => { let hdl = slugHandle(base) || "explorer", n = 1; while (handleTaken(hdl)) hdl = `${slugHandle(base) || "explorer"}${++n}`; return hdl; };
    handle.value = free(name.value);
    name.addEventListener("input", () => { if (!handleTouched) handle.value = free(name.value); preview(); });
    handle.addEventListener("input", () => { handleTouched = true; handle.value = slugHandle(handle.value); });
    const err = h("p", { class: "si-err", role: "alert" });
    const av = h("span", { class: "si-avatar" });
    const preview = () => av.replaceChildren(avatarEl({ avatar: { emoji, color }, name: name.value || "?" }, 64));
    preview();
    const roles = h("div", { class: "si-roles", role: "radiogroup", "aria-label": "What brings you here" }, ...ROLES.map((r) => {
      const b = h("button", { class: "si-role", role: "radio", "aria-checked": String(r.id === role), onclick: () => { role = r.id; roles.querySelectorAll(".si-role").forEach((x) => x.setAttribute("aria-checked", String(x === b))); } },
        h("span", { class: "si-role-emoji" }, r.emoji), h("strong", {}, r.label), h("small", {}, r.about));
      return b;
    }));
    const emojis = h("div", { class: "si-emojis" }, ...AVATAR_EMOJI.slice(0, 12).map((e) => h("button", { class: "si-emoji", "aria-label": `Avatar ${e}`, onclick: () => { emoji = e; preview(); } }, e)));
    const colors = h("div", { class: "si-colors" }, ...AVATAR_COLORS.map((c) => h("button", { class: "si-color", style: `--c:${c}`, "aria-label": "Avatar colour", onclick: () => { color = c; preview(); } })));
    const create = () => {
      const n = name.value.trim(), hd = slugHandle(handle.value);
      if (!n) { err.textContent = "What should we call you?"; name.focus(); return; }
      if (hd.length < 2) { err.textContent = "Your handle needs at least two letters or numbers."; handle.focus(); return; }
      if (handleTaken(hd)) { err.textContent = `@${hd} is taken. Try another.`; handle.focus(); return; }
      const finish = () => {
        const p = blankProfile(n, hd, role);
        p.avatar = { emoji, color };
        if (cloudOn()) linkHandle(hd);
        signIn(p, email);
        pushProfile(p);
        done(p, true);
      };
      if (!cloudOn()) { finish(); return; }
      handleFree(hd).then((ok) => { if (ok) finish(); else { err.textContent = `@${hd} is taken. Try another.`; handle.focus(); } }).catch(() => (err.textContent = "Couldn't reach Atlas's servers. Try again in a moment."));
    };
    sheet.replaceChildren(
      head("Make your page", email),
      h("div", { class: "si-who" }, av, h("div", { class: "si-who-fields" }, name, h("div", { class: "si-at" }, h("span", {}, "@"), handle))),
      h("div", { class: "si-block" }, h("h3", {}, "Pick a face"), emojis, colors),
      h("div", { class: "si-block" }, h("h3", {}, "What brings you to Atlas?"), roles),
      err,
      h("div", { class: "si-actions" }, h("button", { class: "link-btn", onclick: startStep }, "Back"), h("button", { class: "primary-btn", onclick: create }, "Create my page")));
    setTimeout(() => name.focus(), 60);
  }

  function openSignIn(next?: (p: Profile) => void) {
    then = next;
    startStep();
    veil.hidden = false;
  }

  return { button, menu, signIn: openSignIn, close };
}

export const signedIn = () => !!account();
