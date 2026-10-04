// Terreno's servers: one Supabase project (auth, Postgres, storage). Set
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and sign-in becomes real (a
// six-digit code by email), pages and lenses are published for everyone, and
// what you make follows you to any device. Without them, everything keeps
// working on the device, exactly as before (see docs/backend.md).
import { config } from "../config";

export const cloudOn = () => !!(config.supabaseUrl && config.supabaseKey);
const base = () => config.supabaseUrl.replace(/\/$/, "");

interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } }
const SESSION = "atlas.cloud.session.v1";
let session: Session | null = (() => { try { return JSON.parse(localStorage.getItem(SESSION) ?? "null") as Session | null; } catch { return null; } })();
const keep = (s: Session | null) => { session = s; try { if (s) localStorage.setItem(SESSION, JSON.stringify(s)); else localStorage.removeItem(SESSION); } catch { /* private mode */ } };

export const cloudUser = () => session?.user ?? null;

async function auth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}/auth/v1/${path}`, { method: "POST", headers: { apikey: config.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { msg?: string; error_description?: string }).msg ?? (json as { error_description?: string }).error_description ?? `Sign-in failed (HTTP ${res.status})`);
  return json as T;
}
const fromAuth = (r: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }): Session =>
  ({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000, user: { id: r.user.id, email: r.user.email } });

/** Emails a six-digit sign-in code (creating the account if it's new). */
export async function sendCode(email: string) { await auth("otp", { email, create_user: true }); }
/** Checks the code; on success the device is signed in. */
export async function verifyCode(email: string, token: string) { keep(fromAuth(await auth("verify", { type: "email", email, token }))); return session!.user; }
export async function cloudSignOut() {
  const s = session;
  keep(null);
  if (s) await fetch(`${base()}/auth/v1/logout`, { method: "POST", headers: { apikey: config.supabaseKey, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}

let refreshing: Promise<void> | null = null;
async function token(): Promise<string | null> {
  if (!session) return null;
  if (session.expires_at - Date.now() < 60_000) {
    refreshing ??= auth<Parameters<typeof fromAuth>[0]>("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then((r) => keep(fromAuth(r)))
      .catch(() => keep(null))
      .finally(() => { refreshing = null; });
    await refreshing;
  }
  return session?.access_token ?? null;
}

/** A PostgREST call as the signed-in person (or anonymously). */
export async function rest<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const t = await token();
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${t ?? config.supabaseKey}`, "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Terreno servers: HTTP ${res.status}`);
  return res.status === 204 || res.headers.get("content-length") === "0" ? (undefined as T) : ((await res.json()) as T);
}

/** Uploads a file to the public media bucket under the person's own folder; returns its public URL. */
export async function upload(name: string, blob: Blob): Promise<string> {
  const t = await token();
  const user = session?.user.id;
  if (!t || !user) throw new Error("Sign in first");
  const path = `${user}/${name}`;
  const res = await fetch(`${base()}/storage/v1/object/media/${path}`, { method: "POST", headers: { apikey: config.supabaseKey, Authorization: `Bearer ${t}`, "Content-Type": blob.type || "application/octet-stream", "x-upsert": "true" }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
  return `${base()}/storage/v1/object/public/media/${path}`;
}
