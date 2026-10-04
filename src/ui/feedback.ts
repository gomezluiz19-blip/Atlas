// "Send feedback": how Terreno felt, in a tap and a sentence. With a form
// endpoint configured (VITE_FEEDBACK_URL, e.g. Formspree), it's posted there;
// otherwise it's kept on this device (handy when visitors try Terreno on your
// laptop), with a way to read it all back and download it.
import type { App } from "../app";
import { me } from "../social/store";
import { h } from "./dom";
import { icons } from "./icons";
import { download } from "../work/store";
import { recentProblems } from "./errors";

const KEY = "atlas.feedback.v1";
const URL_ = (import.meta.env?.VITE_FEEDBACK_URL as string | undefined) || "";
const EMAIL = (import.meta.env?.VITE_FEEDBACK_EMAIL as string | undefined) || "";

interface Note { at: string; mood: number; text: string; who?: string; contact?: string; where: string; problems?: { at: string; message: string }[] }
const read = (): Note[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[]; } catch { return []; } };
const write = (n: Note[]) => { try { localStorage.setItem(KEY, JSON.stringify(n.slice(0, 500))); } catch { /* full */ } };
const FACES = ["😣", "😕", "🙂", "😀", "🤩"];

export function openFeedback(app: App) {
  document.querySelector(".feedback-veil")?.remove();
  let mood = -1;
  const veil = h("div", { class: "signin-veil feedback-veil" });
  const faces = h("div", { class: "fb-faces", role: "radiogroup", "aria-label": "How is Terreno?" }, ...FACES.map((f, i) => {
    const b = h("button", { class: "fb-face", role: "radio", "aria-checked": "false", "aria-label": ["Frustrating", "Meh", "Good", "Great", "Wonderful"][i], onclick: () => { mood = i; faces.querySelectorAll(".fb-face").forEach((x, k) => x.setAttribute("aria-checked", String(k === i))); } }, f);
    return b;
  }));
  const text = h("textarea", { class: "si-input", rows: 4, placeholder: "What did you love? What got in the way? What should Terreno do next?", "aria-label": "Your feedback" }) as HTMLTextAreaElement;
  const who = me();
  const contact = h("input", { class: "si-input", type: "email", placeholder: "Email, if you'd like a reply (optional)", autocomplete: "email", "aria-label": "Email" }) as HTMLInputElement;
  const err = h("p", { class: "si-err", role: "alert" });
  const close = () => { veil.classList.add("out"); setTimeout(() => veil.remove(), 220); };
  const send = async () => {
    if (mood < 0 && !text.value.trim()) { err.textContent = "Pick a face or write a line first."; return; }
    const note: Note = { at: new Date().toISOString(), mood: mood + 1, text: text.value.trim(), who: who ? `${who.name} (@${who.handle})` : undefined, contact: contact.value.trim() || undefined, where: `${app.theme?.label ?? ""}${app.place?.name?.title ? ` · ${app.place.name.title}` : ""}`, problems: recentProblems().slice(0, 5).map(({ at, message }) => ({ at, message })) };
    write([note, ...read()]);
    if (URL_) {
      try { await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(note) }); } catch { /* kept locally anyway */ }
    }
    close();
    app.toast("Thank you. Every note is read.", 3000);
  };
  const kept = read();
  veil.append(h("div", { class: "signin fb", role: "dialog", "aria-modal": "true", "aria-label": "Send feedback" },
    h("div", { class: "si-head" }, h("h2", {}, "How's Terreno?"), h("p", {}, "A tap and a sentence helps more than you'd think."), h("button", { class: "icon-btn si-close", "aria-label": "Close", html: icons.close, onclick: close })),
    faces, text, contact, err,
    h("div", { class: "si-actions" },
      EMAIL ? h("a", { class: "link-btn", href: `mailto:${EMAIL}?subject=${encodeURIComponent("Terreno feedback")}` }, "Email instead") : h("span"),
      h("button", { class: "primary-btn", onclick: () => void send() }, "Send")),
    kept.length ? h("details", { class: "fb-kept" },
      h("summary", {}, `Notes left on this device (${kept.length})`),
      h("div", { class: "fb-list" }, ...kept.slice(0, 30).map((n) => h("div", { class: "fb-note" }, h("span", {}, n.mood ? FACES[n.mood - 1] : "📝"), h("div", {}, h("p", {}, n.text || "(no words)"), h("small", {}, [new Date(n.at).toLocaleString(), n.who, n.contact, n.where].filter(Boolean).join(" · ")))))),
      h("button", { class: "pill-btn", onclick: () => download(`atlas-feedback-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(kept, null, 2)) }, "Download all")) : ""));
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  document.body.append(veil);
  setTimeout(() => (faces.querySelector(".fb-face") as HTMLElement | null)?.focus(), 60);
}
