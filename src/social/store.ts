// Who's signed in, and every profile Atlas knows: the example people, the
// accounts made on this device, and pages opened from links. Until the
// servers are switched on, an account lives in this browser (so signing in is
// a preview: nothing is sent anywhere).
import { DEMO_PROFILES } from "./demo";
import { cloudSignOut } from "../cloud/client";
import { followRemote, linkHandle, pushProfile, signRemote } from "../cloud/sync";
import { profileFromJson, type Profile, type Signature } from "./model";

const ACCOUNT = "atlas.account.v1";
const MINE = "atlas.profiles.v1";
const SEEN = "atlas.profiles.seen.v1";
const FOLLOWS = "atlas.follows.v1";
const SIGNED = "atlas.guestbook.v1";

const read = <T>(key: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export interface Account { handle: string; email?: string; since: string }

const listeners = new Set<() => void>();
/** Runs fn whenever someone signs in or out, or their profile changes. */
export const onAccount = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => { for (const f of listeners) { try { f(); } catch { /* keep notifying */ } } };

const mine = (): Record<string, Profile> => {
  const raw = read<Record<string, unknown>>(MINE, {});
  const out: Record<string, Profile> = {};
  for (const [k, v] of Object.entries(raw)) { const p = profileFromJson(v); if (p) out[k] = { ...p, demo: (v as Profile).demo }; }
  return out;
};

export const account = (): Account | null => { const a = read<Account | null>(ACCOUNT, null); return a && mine()[a.handle] ? a : null; };
/** The signed-in person's profile. */
export const me = (): Profile | null => { const a = account(); return a ? mine()[a.handle] ?? null : null; };
export const isMe = (handle: string) => account()?.handle === handle;

export function signIn(p: Profile, email?: string) {
  const all = mine();
  if (!all[p.handle]) all[p.handle] = p;
  write(MINE, all);
  write(ACCOUNT, { handle: p.handle, email, since: new Date().toISOString() } satisfies Account);
  changed();
}
export function signOut() {
  try { localStorage.removeItem(ACCOUNT); } catch { /* ignore */ }
  linkHandle(null);
  void cloudSignOut();
  changed();
}
export function saveProfile(p: Profile) {
  write(MINE, { ...mine(), [p.handle]: p });
  pushProfile(p);
  changed();
}
/** Accounts made on this device (to switch between). */
export const localAccounts = (): Profile[] => Object.values(mine());
export function removeAccount(handle: string) {
  const all = mine();
  delete all[handle];
  write(MINE, all);
  if (account()?.handle === handle) signOut(); else changed();
}
export const handleTaken = (handle: string) => !!mine()[handle] || DEMO_PROFILES.some((d) => d.handle === handle);

/** Keeps a page opened from a link, so it can be found again. */
export function remember(p: Profile) {
  if (mine()[p.handle]) return;
  const seen = read<unknown[]>(SEEN, []).flatMap((x) => profileFromJson(x) ?? []).filter((x) => x.handle !== p.handle);
  write(SEEN, [p, ...seen].slice(0, 30));
}

/** Everyone: your accounts first, then pages from links, then the examples. */
export function allProfiles(): Profile[] {
  const out = new Map<string, Profile>();
  for (const p of Object.values(mine())) out.set(p.handle, p);
  for (const p of read<unknown[]>(SEEN, []).flatMap((x) => profileFromJson(x) ?? [])) if (!out.has(p.handle)) out.set(p.handle, p);
  for (const p of DEMO_PROFILES) if (!out.has(p.handle)) out.set(p.handle, p);
  // Signatures left from this device on other people's pages.
  const signed = read<Record<string, Signature[]>>(SIGNED, {});
  return [...out.values()].map((p) => signed[p.handle]?.length && !mine()[p.handle] ? { ...p, guestbook: [...signed[p.handle], ...p.guestbook] } : p);
}
export const findProfile = (handle: string) => allProfiles().find((p) => p.handle === handle.replace(/^@/, "").toLowerCase()) ?? null;

export function sign(p: Profile, sig: Signature) {
  const own = mine()[p.handle];
  if (own) { own.guestbook.unshift(sig); saveProfile(own); void signRemote(p.handle, sig).catch(() => {}); return; }
  const signed = read<Record<string, Signature[]>>(SIGNED, {});
  signed[p.handle] = [sig, ...(signed[p.handle] ?? [])].slice(0, 50);
  write(SIGNED, signed);
  void signRemote(p.handle, sig).catch(() => {});
  changed();
}

export const following = (): string[] => read<string[]>(FOLLOWS, []);
export const isFollowing = (handle: string) => following().includes(handle);
export function follow(handle: string, on: boolean) {
  write(FOLLOWS, on ? [...new Set([...following(), handle])] : following().filter((h) => h !== handle));
  void followRemote(handle, on).catch(() => {});
  changed();
}

/** People whose spots are near a point, nearest first. */
export function profilesNear(lon: number, lat: number, km: number): { p: Profile; spot: Profile["spots"][number]; km: number }[] {
  const out: { p: Profile; spot: Profile["spots"][number]; km: number }[] = [];
  const R = 6371, rad = Math.PI / 180;
  for (const p of allProfiles()) {
    let best: { spot: Profile["spots"][number]; km: number } | null = null;
    for (const s of p.spots) {
      const d = 2 * R * Math.asin(Math.sqrt(Math.sin(((s.lat - lat) * rad) / 2) ** 2 + Math.cos(lat * rad) * Math.cos(s.lat * rad) * Math.sin(((s.lon - lon) * rad) / 2) ** 2));
      if (d <= km && (!best || d < best.km)) best = { spot: s, km: d };
    }
    if (best) out.push({ p, ...best });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Profiles matching a search ("maya", "@kenjiskies", "surf"). */
export function searchProfiles(q: string): Profile[] {
  const t = q.trim().toLowerCase().replace(/^@/, "");
  if (t.length < 2) return [];
  return allProfiles().filter((p) => p.handle.startsWith(t) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(t)) || (t.length >= 4 && p.name.toLowerCase().includes(t)));
}
