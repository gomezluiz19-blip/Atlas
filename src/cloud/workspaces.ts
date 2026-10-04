// Team workspaces: one Pro tool's whole state (a district, a construction region, a city) shared with the
// people who work on it, in three roles (owner, editor, viewer), with every version kept. Tables and
// policies are in docs/workspaces.sql. The device stays the source of truth while you work (everything
// works offline); saves go up a moment after each change, and a save from an out-of-date copy is refused
// rather than silently overwriting a colleague's work.
import { cloudOn, cloudUser, rest } from "./client";

export type Role = "owner" | "editor" | "viewer";
export interface Workspace { id: string; name: string; kind: string; role: Role }
export interface Doc { body: unknown; version: number; updated_at: string; updated_by: string | null }
export interface Member { email: string; role: Role; user_id: string | null; added_at: string }
export interface Version { version: number; updated_at: string; updated_by: string | null }
/** How this device's copy of a tool is linked to a workspace. */
export interface Link { id: string; name: string; role: Role; version: number; syncedAt: string }

type Api = <T>(path: string, init?: RequestInit & { prefer?: string }) => Promise<T>;
const enc = encodeURIComponent;
const jsonBody = (v: unknown) => JSON.stringify(v);

export const teamReady = () => cloudOn() && !!cloudUser();

/** The workspaces of one kind the signed-in person belongs to. */
export async function myWorkspaces(kind: string, api: Api = rest, uid = cloudUser()?.id): Promise<Workspace[]> {
  if (!uid) return [];
  const rows = await api<{ role: Role; workspaces: { id: string; name: string; kind: string } | null }[]>(
    `workspace_members?user_id=eq.${enc(uid)}&select=role,workspaces(id,name,kind)&workspaces.kind=eq.${enc(kind)}`);
  return rows.flatMap((r) => (r.workspaces && r.workspaces.kind === kind ? [{ ...r.workspaces, role: r.role }] : []));
}

/** Creates a workspace from this device's copy; the creator is its owner. */
export async function createWorkspace(kind: string, name: string, body: unknown, api: Api = rest): Promise<Link> {
  const [ws] = await api<{ id: string; name: string }[]>("workspaces", { method: "POST", prefer: "return=representation", body: jsonBody({ kind, name: name.slice(0, 120) }) });
  const [doc] = await api<Doc[]>("workspace_docs", { method: "POST", prefer: "return=representation", body: jsonBody({ workspace_id: ws.id, body, version: 1 }) });
  return { id: ws.id, name: ws.name, role: "owner", version: doc?.version ?? 1, syncedAt: doc?.updated_at ?? new Date().toISOString() };
}

export async function pullDoc(id: string, api: Api = rest): Promise<Doc | null> {
  const [d] = await api<Doc[]>(`workspace_docs?workspace_id=eq.${enc(id)}&select=body,version,updated_at,updated_by`);
  return d ?? null;
}

/**
 * Saves a new version, only if nobody has saved since `version`. On a conflict nothing is written and the
 * latest copy comes back, for the caller to load (and tell the person).
 */
export async function pushDoc(id: string, body: unknown, version: number, api: Api = rest): Promise<{ ok: true; version: number; at: string } | { ok: false; latest: Doc | null }> {
  const rows = await api<Doc[]>(`workspace_docs?workspace_id=eq.${enc(id)}&version=eq.${version}`, { method: "PATCH", prefer: "return=representation", body: jsonBody({ body, version: version + 1 }) });
  if (rows?.length) return { ok: true, version: rows[0].version, at: rows[0].updated_at };
  return { ok: false, latest: await pullDoc(id, api) };
}

export const members = (id: string, api: Api = rest) => api<Member[]>(`workspace_members?workspace_id=eq.${enc(id)}&select=email,role,user_id,added_at&order=added_at`);
export const invite = (id: string, email: string, role: Role, api: Api = rest) =>
  api<void>("workspace_members", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: jsonBody({ workspace_id: id, email: email.trim().toLowerCase(), role }) });
export const setRole = (id: string, email: string, role: Role, api: Api = rest) =>
  api<void>(`workspace_members?workspace_id=eq.${enc(id)}&email=eq.${enc(email)}`, { method: "PATCH", prefer: "return=minimal", body: jsonBody({ role }) });
export const removeMember = (id: string, email: string, api: Api = rest) =>
  api<void>(`workspace_members?workspace_id=eq.${enc(id)}&email=eq.${enc(email)}`, { method: "DELETE" });
export const history = (id: string, api: Api = rest) =>
  api<Version[]>(`workspace_history?workspace_id=eq.${enc(id)}&select=version,updated_at,updated_by&order=version.desc&limit=50`);
export async function versionBody(id: string, version: number, api: Api = rest): Promise<unknown> {
  const [r] = await api<{ body: unknown }[]>(`workspace_history?workspace_id=eq.${enc(id)}&version=eq.${version}&select=body`);
  return r?.body ?? null;
}
/** Links any invitations sent to this person's email to their account (run after signing in). */
export const claimInvites = (api: Api = rest) => api<number>("rpc/claim_invites", { method: "POST", body: "{}" });

/** A valid email for an invitation (pure). */
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
