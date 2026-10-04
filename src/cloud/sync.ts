// What goes to Terreno's servers and what comes back. The device stays the
// source of truth while you're using it (everything works offline); your own
// page and lenses are pushed shortly after each change, and other people's
// pages, lenses and guestbooks are fetched when you open them.
import { lensFromJson, type LensDef } from "../lenses/custom";
import { profileFromJson, type Profile, type Signature } from "../social/model";
import { cloudOn, cloudUser, rest } from "./client";

const enc = encodeURIComponent;
const LINK = "atlas.cloud.handle.v1";
/** The handle of the page that belongs to the signed-in server account. */
export const linkedHandle = (): string | null => { try { return localStorage.getItem(LINK); } catch { return null; } };
export const linkHandle = (h: string | null) => { try { if (h) localStorage.setItem(LINK, h); else localStorage.removeItem(LINK); } catch { /* private mode */ } };
export const live = () => cloudOn() && !!cloudUser();

// ---- Pages ----
type Row = { body: unknown; handle: string };
const rowToProfile = (r: Row) => { const p = profileFromJson(r.body); return p ? { ...p, handle: r.handle } : null; };

/** The signed-in account's page, if it has one on the servers. */
export async function pullMine(): Promise<Profile | null> {
  const u = cloudUser();
  if (!u) return null;
  const [r] = await rest<Row[]>(`profiles?user_id=eq.${u.id}&select=body,handle`);
  return r ? rowToProfile(r) : null;
}

let pushTimer = 0;
/** Publishes your page (debounced: many small edits become one save). */
export function pushProfile(p: Profile) {
  if (!live() || p.demo || linkedHandle() !== p.handle) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    const { guestbook: _g, ...body } = p; // guestbooks live in their own table
    void rest("profiles?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ user_id: cloudUser()!.id, handle: p.handle, name: p.name, body, lon: p.home?.lon ?? null, lat: p.home?.lat ?? null, updated_at: new Date().toISOString() }) }).catch(() => {});
  }, 1200);
}

export async function handleFree(handle: string): Promise<boolean> {
  const rows = await rest<{ handle: string }[]>(`profiles?handle=eq.${enc(handle)}&select=handle`);
  return rows.length === 0;
}

/** Someone's page, with their guestbook. */
export async function fetchProfile(handle: string): Promise<Profile | null> {
  const [rows, sigs] = await Promise.all([
    rest<Row[]>(`profiles?handle=eq.${enc(handle)}&select=body,handle`),
    fetchSignatures(handle).catch(() => [] as Signature[]),
  ]);
  const p = rows[0] ? rowToProfile(rows[0]) : null;
  return p ? { ...p, guestbook: sigs } : null;
}

/** Recently active pages (optionally near a point). */
export async function directory(near?: { lon: number; lat: number; deg: number }): Promise<Profile[]> {
  const where = near ? `&lat=gte.${near.lat - near.deg}&lat=lte.${near.lat + near.deg}&lon=gte.${near.lon - near.deg}&lon=lte.${near.lon + near.deg}` : "";
  const rows = await rest<Row[]>(`profiles?select=body,handle&order=updated_at.desc&limit=40${where}`);
  return rows.flatMap((r) => rowToProfile(r) ?? []);
}

// ---- Guestbooks and follows ----
export async function fetchSignatures(handle: string): Promise<Signature[]> {
  const rows = await rest<{ from_handle: string; name: string; text: string; at: string }[]>(`signatures?page=eq.${enc(handle)}&select=from_handle,name,text,at&order=at.desc&limit=100`);
  return rows.map((r) => ({ from: r.from_handle, name: r.name, text: r.text, at: r.at.slice(0, 10) }));
}
export async function signRemote(page: string, sig: Signature) {
  if (!live()) return;
  await rest("signatures", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ page, from_handle: sig.from, name: sig.name, text: sig.text }) });
}
export async function followRemote(handle: string, on: boolean) {
  if (!live()) return;
  if (on) await rest("follows", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: JSON.stringify({ handle }) });
  else await rest(`follows?handle=eq.${enc(handle)}&follower=eq.${cloudUser()!.id}`, { method: "DELETE" });
}
export async function followerCount(handle: string): Promise<number> {
  const rows = await rest<{ handle: string }[]>(`follows?handle=eq.${enc(handle)}&select=handle`);
  return rows.length;
}

// ---- Lenses ----
export async function pushLens(d: LensDef) {
  if (!live()) return;
  await rest("lenses?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ id: d.id, body: d, updated_at: new Date().toISOString() }) });
}
export async function deleteLensRemote(id: string) { if (live()) await rest(`lenses?id=eq.${enc(id)}`, { method: "DELETE" }).catch(() => {}); }
export async function fetchLens(id: string): Promise<LensDef | null> {
  const [r] = await rest<{ body: unknown }[]>(`lenses?id=eq.${enc(id)}&select=body`);
  return r ? lensFromJson(r.body) : null;
}
export async function recentLenses(): Promise<LensDef[]> {
  const rows = await rest<{ body: unknown }[]>("lenses?select=body&order=updated_at.desc&limit=40");
  return rows.flatMap((r) => lensFromJson(r.body) ?? []);
}

// ---- Guides ----
export async function pushGuide(g: { id: string; stops: { lon: number; lat: number }[] }) {
  if (!live()) return;
  const s = g.stops[0];
  await rest("guides?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ id: g.id, body: g, lon: s?.lon ?? null, lat: s?.lat ?? null, updated_at: new Date().toISOString() }) });
}
export async function deleteGuideRemote(id: string) { if (live()) await rest(`guides?id=eq.${enc(id)}`, { method: "DELETE" }).catch(() => {}); }
export async function fetchGuide(id: string): Promise<unknown | null> {
  const [r] = await rest<{ body: unknown }[]>(`guides?id=eq.${enc(id)}&select=body`);
  return r?.body ?? null;
}

// ---- Private things that follow you between devices ----
export function pushPrivate(kind: string, id: string, body: unknown) {
  if (!live()) return;
  void rest("private_items?on_conflict=user_id,kind,id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ kind, id, body, updated_at: new Date().toISOString() }) }).catch(() => {});
}
export function deletePrivate(kind: string, id: string) {
  if (!live()) return;
  void rest(`private_items?kind=eq.${enc(kind)}&id=eq.${enc(id)}`, { method: "DELETE" }).catch(() => {});
}
export async function pullPrivate(kind: string): Promise<{ id: string; body: unknown }[]> {
  if (!live()) return [];
  return rest<{ id: string; body: unknown }[]>(`private_items?kind=eq.${enc(kind)}&select=id,body`);
}
