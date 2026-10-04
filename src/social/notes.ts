// Field notes: what you see where you're standing. A photo (straight from
// the camera on a phone), a line or two, and what it is (a sighting, a view,
// something to eat), pinned to your location and kept in your journal.
// Photos are made small on the device first and kept in its database; with
// Terreno's servers on, they're uploaded so the note shows everywhere.
import "./notes.css";
import type { App } from "../app";
import { cloudOn, upload } from "../cloud/client";
import { live } from "../cloud/sync";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import type { Post, Profile } from "./model";
import { me, saveProfile } from "./store";

// ---- Photos on the device ----
const DB = "atlas-notes", STORE = "photos";
const db = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function putPhoto(id: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(blob, id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function getPhoto(id: string): Promise<Blob | null> {
  const d = await db();
  return new Promise((res) => { const r = d.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res((r.result as Blob) ?? null); r.onerror = () => res(null); });
}
const urls = new Map<string, string>();
/** A displayable URL for a note's photo ("idb:…" on this device, or a web address). */
export async function photoUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith("idb:")) return ref;
  if (urls.has(ref)) return urls.get(ref)!;
  const b = await getPhoto(ref.slice(4)).catch(() => null);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(ref, u);
  return u;
}

/** Makes a photo small enough to keep and send (longest side 1600 px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
}

export const NOTE_KINDS: { id: string; emoji: string; label: string }[] = [
  { id: "sighting", emoji: "🐦", label: "Sighting" }, { id: "view", emoji: "🌄", label: "View" },
  { id: "food", emoji: "🍽️", label: "Something to eat" }, { id: "note", emoji: "📝", label: "Note" },
];

/** The capture sheet. */
export function openFieldNote(app: App, deps: { signIn(then: () => void): void; saved(p: Profile, post: Post): void }) {
  const p = me();
  if (!p) { deps.signIn(() => openFieldNote(app, deps)); return; }
  document.querySelector(".fn-veil")?.remove();
  let kind = "note", photo: Blob | null = null, where: { lon: number; lat: number; label: string; acc?: number } | null = app.place ? { lon: app.place.lon, lat: app.place.lat, label: app.place.name?.title ?? "The place you chose" } : null;
  const veil = h("div", { class: "signin-veil fn-veil" });
  const close = () => { veil.classList.add("out"); setTimeout(() => veil.remove(), 220); };
  const file = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true }) as HTMLInputElement;
  const shot = h("button", { class: "fn-photo", "aria-label": "Add a photo" }, h("span", {}, "📷"), h("small", {}, "Add a photo"));
  shot.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    photo = await shrink(f);
    shot.replaceChildren(h("img", { src: URL.createObjectURL(photo), alt: "Your photo" }));
    shot.classList.add("has");
  });
  const text = h("textarea", { class: "si-input", rows: 3, placeholder: "What did you see? (“A kingfisher on the low branch, 7:10am”)", "aria-label": "Your note" }) as HTMLTextAreaElement;
  const kinds = h("div", { class: "fn-kinds", role: "radiogroup", "aria-label": "What is it" }, ...NOTE_KINDS.map((k) => {
    const b = h("button", { class: "pf-chip", role: "radio", "aria-checked": String(k.id === kind), onclick: () => { kind = k.id; kinds.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b))); } }, `${k.emoji} ${k.label}`);
    return b;
  }));
  const loc = h("div", { class: "fn-where" });
  const paintWhere = () => loc.replaceChildren(
    h("span", {}, "📍"),
    h("span", { class: "fn-where-text" }, where ? h("strong", {}, where.label) : h("strong", {}, "No place yet"), where?.acc ? h("small", {}, `within ${Math.round(where.acc)} m`) : ""),
    "geolocation" in navigator ? h("button", { class: "link-btn", onclick: locate }, where?.acc ? "Update" : "Use where I am") : "");
  function locate() {
    loc.querySelector(".fn-where-text")?.replaceChildren(h("strong", {}, "Finding you…"));
    navigator.geolocation.getCurrentPosition(
      (pos) => { where = { lon: pos.coords.longitude, lat: pos.coords.latitude, label: "Where I'm standing", acc: pos.coords.accuracy }; paintWhere(); },
      () => { paintWhere(); app.toast("Couldn't get your location. Allow location for Terreno, or choose a place on the map first.", 4500); },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
  }
  paintWhere();
  // On a phone, where you are is almost always what you mean.
  if (matchMedia("(pointer: coarse)").matches && "geolocation" in navigator) locate();
  const err = h("p", { class: "si-err", role: "alert" });
  const save = h("button", { class: "primary-btn" }, "Save note") as HTMLButtonElement;
  save.addEventListener("click", async () => {
    if (!text.value.trim() && !photo) { err.textContent = "Add a photo or a line first."; return; }
    if (!where) { err.textContent = "Where was it? Use your location, or choose a place on the map first."; return; }
    save.disabled = true; save.textContent = "Saving…";
    const id = Math.random().toString(36).slice(2, 10);
    let ref: string | undefined;
    if (photo) {
      try {
        ref = cloudOn() && live() ? await upload(`notes/${id}.jpg`, photo) : (await putPhoto(id, photo), `idb:${id}`);
      } catch { await putPhoto(id, photo).catch(() => {}); ref = `idb:${id}`; }
    }
    const cur = me()!;
    const k = NOTE_KINDS.find((x) => x.id === kind)!;
    const first = text.value.trim().split(/[.!?\n]/)[0].slice(0, 70);
    const post: Post = { id, at: new Date().toISOString().slice(0, 10), title: first || `${k.label} at ${where.label}`, body: text.value.trim().length > first.length ? text.value.trim() : "", photo: ref, lon: where.lon, lat: where.lat, kind };
    cur.posts.unshift(post);
    saveProfile(cur);
    close();
    app.toast(`${k.emoji} Field note saved to your journal`, 3000);
    deps.saved(cur, post);
  });
  veil.append(h("div", { class: "signin fn", role: "dialog", "aria-modal": "true", "aria-label": "Field note" },
    h("div", { class: "si-head" }, h("h2", {}, "Field note"), h("p", {}, "What's here, right now."), h("button", { class: "icon-btn si-close", "aria-label": "Close", html: icons.close, onclick: close })),
    shot, file, kinds, text, loc, err,
    h("div", { class: "si-actions" }, h("span"), save)));
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  document.body.append(veil);
}
