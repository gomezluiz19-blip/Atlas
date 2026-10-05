// Joining Terreno: a full-screen flow over the turning Earth, in four short steps (the tiles at the top fill as
// you go):
//   1. You: an invite code when the beta is closed, then email (or Google or Apple when they're switched on).
//      People who already have an account on this device pick themselves; anyone just looking can try Terreno
//      as one of the example people.
//   2. The code: six digits from the email, typed or pasted, with a resend that waits its turn. (Without
//      Terreno's servers this step is skipped: the account lives in this browser.)
//   3. Your page: name, handle (checked as you type), a colour, what brings you here, and the terms.
//   4. Home: where you live, so My Place, the wayfinder and the opening shot start there. Optional.
// Everything that can be decided without a screen is in ./model.ts and tested.
import "./join.css";
import { cloudOn, oauthUrl, sendCode, verifyCode } from "../cloud/client";
import { handleFree, linkHandle, pullMine, pushProfile } from "../cloud/sync";
import { config } from "../config";
import { DEMO_PROFILES } from "../social/demo";
import { AVATAR_COLORS, ROLES, blankProfile, type Profile, type Role } from "../social/model";
import { handleTaken, localAccounts, signIn } from "../social/store";
import { markSvg } from "../ui/brand";
import { h } from "../ui/dom";
import { anyIconHtml } from "../ui/glyph";
import { geocode } from "../ui/search";
import { HANDLE_WORDS, cleanHandle, codeDigits, emailSuggestion, friendlyError, handleProblem, inviteOk, nameFromEmail, resendIn, validEmail } from "./model";

export interface JoinOptions {
  /** Signed in: `fresh` when the account was just made. */
  done(p: Profile, fresh: boolean): void;
  /** Saves home as a My Place (name and point). */
  setHome?(home: { name: string; lon: number; lat: number }): void;
  /** A monogram avatar for a profile. */
  avatar(p: Pick<Profile, "avatar" | "name">, size: number): HTMLElement;
  /** Start at "Make your page" for an email already signed in (after Google or Apple). */
  profileFor?: string;
}

const INVITED = "atlas.invited";
const STEPS = 4;

let open: HTMLElement | null = null;

export function openJoin(o: JoinOptions) {
  open?.remove();
  const close = () => { root.classList.add("out"); setTimeout(() => root.remove(), 260); if (open === root) open = null; removeEventListener("keydown", esc); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", esc);

  const progress = h("div", { class: "jn-progress", "aria-hidden": "true" }, ...Array.from({ length: STEPS }, () => h("i")));
  const body = h("div", { class: "jn-body" });
  const card = h("section", { class: "jn-card reg", role: "dialog", "aria-modal": "true", "aria-label": "Join Terreno" },
    h("header", { class: "jn-head" },
      h("span", { class: "jn-mark", html: markSvg({ size: 34, background: null, ticks: false }) }),
      h("span", { class: "jn-word" }, "TERRENO"),
      progress,
      h("button", { class: "jn-x", "aria-label": "Close", onclick: close }, "×")),
    body);
  const root = h("div", { class: "jn" }, h("div", { class: "jn-scrim", onclick: close }), card);
  document.body.append(root);
  open = root;
  requestAnimationFrame(() => root.classList.add("in"));

  /** Shows a step: its number fills the tiles, its parts replace the body, focus goes to `focus`. */
  const show = (n: number, parts: (Node | string | null)[], focus?: HTMLElement) => {
    progress.querySelectorAll("i").forEach((t, i) => t.classList.toggle("on", i < n));
    body.replaceChildren(...parts.filter((x): x is Node | string => x !== null));
    body.classList.remove("enter"); void body.offsetWidth; body.classList.add("enter");
    setTimeout(() => focus?.focus(), 80);
  };
  const title = (t: string, sub?: string) => h("div", { class: "jn-title" }, h("h2", {}, t), sub ? h("p", {}, sub) : "");
  const err = () => h("p", { class: "jn-err", role: "alert" });
  const busy = (b: HTMLButtonElement, on: boolean, label: string) => { b.disabled = on; b.textContent = label; };

  // ---- 1. You -----------------------------------------------------------------------------------
  async function start() {
    const needInvite = config.inviteHashes.length > 0 && localStorage.getItem(INVITED) !== "1";
    const invite = needInvite ? h("input", { class: "jn-input", placeholder: "Invite code", autocomplete: "off", autocapitalize: "characters", "aria-label": "Invite code" }) as HTMLInputElement : null;
    const email = h("input", { class: "jn-input", type: "email", placeholder: "you@example.com", autocomplete: "email", "aria-label": "Email", inputmode: "email" }) as HTMLInputElement;
    const hint = h("button", { class: "jn-hint", hidden: true, type: "button" });
    const e = err();
    const go = h("button", { class: "jn-primary", type: "submit" }, "Continue") as HTMLButtonElement;
    email.addEventListener("input", () => {
      const s = emailSuggestion(email.value);
      hint.hidden = !s;
      if (s) { hint.textContent = `Did you mean ${s}?`; hint.onclick = () => { email.value = s; hint.hidden = true; email.focus(); }; }
    });
    const form = h("form", { class: "jn-form", novalidate: true },
      invite ? h("label", { class: "jn-label" }, "Your invite code", invite) : "",
      h("label", { class: "jn-label" }, "Email", email), hint, e, go);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      e.textContent = "";
      if (invite && !(await inviteOk(invite.value, config.inviteHashes))) { e.textContent = "That invite code isn't one of ours. Check it and try again."; invite.focus(); return; }
      if (invite) try { localStorage.setItem(INVITED, "1"); } catch { /* private mode */ }
      const v = email.value.trim().toLowerCase();
      if (!validEmail(v)) { e.textContent = "That doesn't look like an email address."; email.focus(); return; }
      if (!cloudOn()) { profile(v); return; }
      busy(go, true, "Sending your code…");
      try { await sendCode(v); code(v, Date.now()); }
      catch (x) { e.textContent = friendlyError((x as Error).message); busy(go, false, "Continue"); }
    });
    const providers = cloudOn() && config.authProviders.length && !needInvite ? h("div", { class: "jn-oauth" },
      ...config.authProviders.map((p) => h("a", { class: "jn-oauth-btn", href: oauthUrl(p as "google" | "apple") }, h("b", {}, p === "google" ? "G" : "A"), `Continue with ${p === "google" ? "Google" : "Apple"}`)),
      h("div", { class: "jn-or" }, h("span", {}, "or with email"))) : null;
    const mine = localAccounts().filter((p) => !p.demo);
    show(1, [
      title("Your own Terreno", "A page of the places you love, lenses you make and share, and a daily brief for your own place."),
      mine.length ? h("div", { class: "jn-block" }, h("p", { class: "jn-eyebrow" }, "On this device"),
        h("div", { class: "jn-people" }, ...mine.slice(0, 4).map((p) => h("button", { class: "jn-person", type: "button", onclick: () => { signIn(p); finish(p, false); } }, o.avatar(p, 36), h("span", {}, h("strong", {}, p.name), h("small", {}, `@${p.handle}`)))))) : null,
      providers, form,
      h("details", { class: "jn-try" }, h("summary", {}, "Just looking? Try Terreno as someone else"),
        h("div", { class: "jn-people" }, ...DEMO_PROFILES.slice(0, 6).map((d) => {
          const role = ROLES.find((r) => r.id === d.role)!;
          return h("button", { class: "jn-person", type: "button", onclick: () => { const copy = structuredClone(d); signIn(copy); finish(copy, false); } }, o.avatar(d, 32), h("span", {}, h("strong", {}, d.name), h("small", {}, role.short ?? role.label)));
        }))),
      h("p", { class: "jn-fine" }, cloudOn()
        ? "We'll email you a six-digit code: no password to remember. Your page is public; everything else you make stays yours."
        : "Preview: your account lives in this browser and nothing is sent anywhere. Once Terreno's servers are on, you'll sign in from any device."),
    ], invite ?? email);
  }

  // ---- 2. The code ------------------------------------------------------------------------------
  function code(email: string, sentAt: number) {
    const boxes = Array.from({ length: 6 }, (_, i) => h("input", { class: "jn-digit", inputmode: "numeric", autocomplete: i === 0 ? "one-time-code" : "off", maxlength: 6, "aria-label": `Digit ${i + 1}` }) as HTMLInputElement);
    const e = err();
    const again = h("button", { class: "jn-link", type: "button" }) as HTMLButtonElement;
    let last = sentAt, tick = 0;
    const paint = () => { const s = resendIn(last, Date.now()); again.disabled = s > 0; again.textContent = s > 0 ? `Send a new code in ${s}s` : "Send a new code"; if (s === 0) clearInterval(tick); };
    tick = window.setInterval(() => { if (!again.isConnected) { clearInterval(tick); return; } paint(); }, 1000);
    paint();
    again.addEventListener("click", async () => {
      try { await sendCode(email); last = Date.now(); e.textContent = "A new code is on its way."; clearInterval(tick); tick = window.setInterval(paint, 1000); paint(); }
      catch (x) { e.textContent = friendlyError((x as Error).message); }
    });
    const value = () => boxes.map((b) => b.value).join("");
    let checking = false;
    const check = async () => {
      if (checking || value().length !== 6) return;
      checking = true; e.textContent = ""; boxes.forEach((b) => (b.disabled = true));
      try {
        await verifyCode(email, value());
        const existing = await pullMine().catch(() => null);
        if (existing) { linkHandle(existing.handle); signIn(existing, email); finish(existing, false); }
        else profile(email);
      } catch (x) {
        e.textContent = friendlyError((x as Error).message);
        boxes.forEach((b) => { b.disabled = false; b.value = ""; });
        boxes[0].focus(); checking = false;
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      }
    };
    // Typing moves along; backspace moves back; a paste (or the phone's autofill) fills them all.
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => {
        const d = codeDigits(b.value);
        if (d.length > 1) { d.split("").forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(5, d.length - 1)].focus(); void check(); return; }
        b.value = d;
        if (d && i < 5) boxes[i + 1].focus();
        void check();
      });
      b.addEventListener("keydown", (ev) => { if (ev.key === "Backspace" && !b.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ""; } });
    });
    show(2, [
      title("Check your email", `We sent a six-digit code to ${email}. Enter it here; it expires after a while, so use it soon.`),
      h("div", { class: "jn-digits" }, ...boxes), e,
      h("div", { class: "jn-row" }, h("button", { class: "jn-link", type: "button", onclick: () => void start() }, "Use another email"), again),
    ], boxes[0]);
  }

  // ---- 3. Your page -----------------------------------------------------------------------------
  function profile(email: string) {
    let role: Role = "explorer", color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const name = h("input", { class: "jn-input", placeholder: "Your name", autocomplete: "name", "aria-label": "Your name", value: nameFromEmail(email), maxlength: 60 }) as HTMLInputElement;
    const handle = h("input", { class: "jn-input jn-handle-in", placeholder: "yourname", autocomplete: "username", "aria-label": "Your handle", maxlength: 24, autocapitalize: "none", spellcheck: "false" }) as HTMLInputElement;
    const status = h("p", { class: "jn-status", "aria-live": "polite" });
    const av = h("span", { class: "jn-av" });
    const terms = h("input", { type: "checkbox", class: "jn-check" }) as HTMLInputElement;
    const e = err();
    const create = h("button", { class: "jn-primary", type: "submit" }, "Make my page") as HTMLButtonElement;
    let touched = false, checkSeq = 0, free = false;
    const suggest = (base: string) => { const root0 = cleanHandle(base.replace(/\s+/g, ".")) || "explorer"; let hd = root0, n = 1; while (handleTaken(hd) || handleProblem(hd)) hd = `${root0}${++n}`.slice(0, 24); return hd; };
    const paintAv = () => av.replaceChildren(o.avatar({ avatar: { emoji: "", color }, name: name.value || "?" }, 64));
    /** Says whether the handle is free, asking the servers (a moment after typing stops) when they're on. */
    const checkHandle = () => {
      const hd = cleanHandle(handle.value), seq = ++checkSeq;
      free = false;
      const problem = handleProblem(hd);
      if (problem) { status.textContent = HANDLE_WORDS[problem]; status.dataset.ok = "no"; return; }
      if (handleTaken(hd)) { status.textContent = `@${hd} is taken on this device.`; status.dataset.ok = "no"; return; }
      if (!cloudOn()) { status.textContent = `terreno.site/@${hd} is yours.`; status.dataset.ok = "yes"; free = true; return; }
      status.textContent = "Checking…"; status.dataset.ok = "";
      setTimeout(() => { if (seq !== checkSeq) return; handleFree(hd).then((ok) => { if (seq !== checkSeq) return; free = ok; status.textContent = ok ? `terreno.site/@${hd} is yours.` : `@${hd} is taken. Try another.`; status.dataset.ok = ok ? "yes" : "no"; }).catch(() => { if (seq === checkSeq) { status.textContent = "Couldn't check just now; we'll check again when you finish."; status.dataset.ok = ""; } }); }, 350);
    };
    handle.value = suggest(name.value);
    name.addEventListener("input", () => { paintAv(); if (!touched) { handle.value = suggest(name.value); checkHandle(); } });
    handle.addEventListener("input", () => { touched = true; const c = cleanHandle(handle.value); if (c !== handle.value) handle.value = c; checkHandle(); });
    paintAv(); checkHandle();
    const colours = h("div", { class: "jn-colours", role: "radiogroup", "aria-label": "Your colour" }, ...AVATAR_COLORS.map((c) => {
      const b = h("button", { class: "jn-colour", type: "button", role: "radio", style: `--c:${c}`, "aria-label": "Colour", "aria-checked": String(c === color), onclick: () => { color = c; paintAv(); colours.querySelectorAll(".jn-colour").forEach((x) => x.setAttribute("aria-checked", String(x === b))); } });
      return b;
    }));
    const roles = h("div", { class: "jn-roles", role: "radiogroup", "aria-label": "What brings you to Terreno" }, ...ROLES.map((r) => {
      const b = h("button", { class: "jn-role", type: "button", role: "radio", "aria-checked": String(r.id === role), onclick: () => { role = r.id; roles.querySelectorAll(".jn-role").forEach((x) => x.setAttribute("aria-checked", String(x === b))); } },
        h("span", { class: "jn-role-ico", html: anyIconHtml(r.emoji, 18) }), h("strong", {}, r.label), h("small", {}, r.about));
      return b;
    }));
    const form = h("form", { class: "jn-form", novalidate: true },
      h("div", { class: "jn-who" }, av, h("div", { class: "jn-who-fields" },
        h("label", { class: "jn-label" }, "Name", name),
        h("label", { class: "jn-label" }, "Handle", h("div", { class: "jn-handle" }, h("span", {}, "@"), handle)), status)),
      h("div", { class: "jn-block" }, h("p", { class: "jn-eyebrow" }, "Your colour"), colours),
      h("div", { class: "jn-block" }, h("p", { class: "jn-eyebrow" }, "What brings you here"), roles),
      h("label", { class: "jn-terms" }, terms, h("span", {}, "I agree to the ", h("a", { href: "legal/terms.html", target: "_blank", rel: "noopener" }, "Terms"), " and the ", h("a", { href: "legal/privacy.html", target: "_blank", rel: "noopener" }, "Privacy Policy"), ".")),
      e, create);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      e.textContent = "";
      const n = name.value.trim().replace(/\s+/g, " "), hd = cleanHandle(handle.value);
      if (!n) { e.textContent = "What should we call you?"; name.focus(); return; }
      const problem = handleProblem(hd);
      if (problem) { e.textContent = HANDLE_WORDS[problem]; handle.focus(); return; }
      if (handleTaken(hd)) { e.textContent = `@${hd} is taken. Try another.`; handle.focus(); return; }
      if (!terms.checked) { e.textContent = "Please agree to the Terms and the Privacy Policy to make your page."; terms.focus(); return; }
      busy(create, true, "Making your page…");
      if (cloudOn() && !free) {
        const ok = await handleFree(hd).catch(() => null);
        if (ok === null) { e.textContent = friendlyError("network"); busy(create, false, "Make my page"); return; }
        if (!ok) { e.textContent = `@${hd} is taken. Try another.`; busy(create, false, "Make my page"); handle.focus(); return; }
      }
      const p = blankProfile(n, hd, role);
      p.avatar = { emoji: "", color };
      if (cloudOn()) linkHandle(hd);
      signIn(p, email);
      pushProfile(p);
      home(p);
    });
    show(3, [title("Make your page", email), form], name.value ? handle : name);
  }

  // ---- 4. Home ----------------------------------------------------------------------------------
  function home(p: Profile) {
    if (!o.setHome) { finish(p, true); return; }
    const q = h("input", { class: "jn-input", placeholder: "Your town, street or address", autocomplete: "street-address", "aria-label": "Where's home?" }) as HTMLInputElement;
    const list = h("div", { class: "jn-results", role: "listbox" });
    const e = err();
    let seq = 0, t = 0;
    const search = () => {
      const s = q.value.trim(), my = ++seq;
      if (s.length < 3) { list.replaceChildren(); return; }
      list.replaceChildren(h("p", { class: "jn-fine" }, "Looking…"));
      geocode(s).then((rs) => {
        if (my !== seq) return;
        if (!rs.length) { list.replaceChildren(h("p", { class: "jn-fine" }, "Nothing found. Try a town or a fuller address.")); return; }
        list.replaceChildren(...rs.slice(0, 5).map((r) => h("button", { class: "jn-result", type: "button", role: "option", onclick: () => { o.setHome!({ name: r.name, lon: r.lon, lat: r.lat }); finish(p, true, r.name); } },
          h("span", { class: "jn-result-ico", html: anyIconHtml("📍", 16) }), h("span", {}, h("strong", {}, r.name), r.detail ? h("small", {}, r.detail) : ""))));
      }).catch(() => { if (my === seq) list.replaceChildren(h("p", { class: "jn-fine" }, "Couldn't search just now. You can set home later in My Place.")); });
    };
    q.addEventListener("input", () => { clearTimeout(t); t = window.setTimeout(search, 300); });
    show(4, [
      title("Where's home?", "My Place gives it a daily brief, Guide knows the way back, and Terreno opens on your side of the world. Only you see it."),
      h("label", { class: "jn-label" }, "Home", q), list, e,
      h("div", { class: "jn-row" }, h("button", { class: "jn-link", type: "button", onclick: () => finish(p, true) }, "Skip for now")),
    ], q);
  }

  // ---- Done -------------------------------------------------------------------------------------
  function finish(p: Profile, fresh: boolean, homeName?: string) {
    progress.querySelectorAll("i").forEach((t) => t.classList.add("on"));
    body.replaceChildren(h("div", { class: "jn-done" }, o.avatar(p, 72), h("h2", {}, fresh ? `Welcome, ${p.name.split(" ")[0]}` : `Welcome back, ${p.name.split(" ")[0]}`),
      homeName ? h("p", {}, `Home is ${homeName}.`) : ""));
    setTimeout(() => { close(); o.done(p, fresh); }, fresh ? 1100 : 600);
  }

  if (o.profileFor) profile(o.profileFor); else void start();
}
