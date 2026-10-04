// "Your team" for a Pro tool: share this device's district / region / city as a team workspace, invite
// people as owners, editors or viewers, see who saved what and when, roll back to an earlier version, and
// back up or restore the workspace as a file. Saves sync a moment after each change; a save made from an
// out-of-date copy is refused by the server, and the newer copy is loaded instead, with a clear message.
import type { App } from "../../app";
import { cloudOn, cloudUser } from "../../cloud/client";
import { claimInvites, createWorkspace, history, invite, members, myWorkspaces, pullDoc, pushDoc, removeMember, setRole, teamReady, validEmail, versionBody, type Link, type Role } from "../../cloud/workspaces";
import { h } from "../../ui/dom";
import { loadJson, saveJson } from "../../util/storage";
import { pickFile } from "./report";

const LINKS = "atlas.team.links.v1";
type Status = "local" | "saved" | "saving" | "offline" | "viewer";
interface Bound { title: () => string; get: () => unknown; set: (body: unknown) => void; reload: () => void }

const links = () => loadJson<Record<string, Link>>(LINKS, {});
const putLink = (key: string, l: Link | null) => { const all = links(); if (l) all[key] = l; else delete all[key]; saveJson(LINKS, all); };
export const linkOf = (key: string): Link | null => links()[key] ?? null;

/** "2 min ago" (pure). */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString();
}

class TeamSync {
  status: Status = "local";
  private timer = 0;
  private pending = false;
  private b: Bound | null = null;
  private listeners = new Set<() => void>();
  constructor(private app: App, readonly key: string) {
    addEventListener("online", () => { if (this.pending) this.flush(); });
    const l = linkOf(key);
    this.status = l ? (l.role === "viewer" ? "viewer" : "saved") : "local";
  }
  bind(b: Bound) { this.b = b; }
  get link() { return linkOf(this.key); }
  onStatus(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(s: Status) { this.status = s; for (const f of this.listeners) f(); }

  /** Call after every local save: the change goes to the team a moment later. */
  changed() {
    const l = this.link;
    if (!l || l.role === "viewer" || !teamReady()) { if (l && l.role !== "viewer") { this.pending = true; this.set("offline"); } return; }
    this.pending = true;
    this.set("saving");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 1500);
  }

  async flush() {
    const l = this.link, b = this.b;
    if (!l || !b || !teamReady()) return;
    try {
      const r = await pushDoc(l.id, b.get(), l.version);
      if (r.ok) { this.pending = false; putLink(this.key, { ...l, version: r.version, syncedAt: r.at }); this.set("saved"); return; }
      // Someone saved first: take theirs, so nobody's work is silently overwritten.
      if (r.latest) this.load(r.latest.body, r.latest.version, r.latest.updated_at);
      this.pending = false;
      this.app.toast("A teammate saved a newer version, so it's loaded here. Your last change wasn't applied: please make it again.", 9000);
    } catch { this.set("offline"); }
  }

  /** Brings in the team's latest copy if it's newer (on opening the tool). */
  async refresh() {
    const l = this.link;
    if (!l || !teamReady()) return;
    try {
      const d = await pullDoc(l.id);
      if (!d) return;
      if (d.version > l.version) {
        if (this.pending) this.app.toast("The team's copy changed while you were offline; loaded the latest. Re-check your recent edits.", 9000);
        this.pending = false;
        this.load(d.body, d.version, d.updated_at);
      } else if (this.pending) void this.flush();
      else this.set(l.role === "viewer" ? "viewer" : "saved");
    } catch { this.set("offline"); }
  }

  private load(body: unknown, version: number, at: string) {
    const l = this.link;
    if (!l || !this.b) return;
    putLink(this.key, { ...l, version, syncedAt: at });
    this.b.set(body);
    this.set(l.role === "viewer" ? "viewer" : "saved");
    this.b.reload();
  }

  async share(name: string) {
    const b = this.b; if (!b) return;
    const l = await createWorkspace(this.key, name, b.get());
    putLink(this.key, l); this.pending = false; this.set("saved");
  }
  async open(id: string, name: string, role: Role) {
    const d = await pullDoc(id);
    if (!d) throw new Error("That workspace is empty.");
    putLink(this.key, { id, name, role, version: d.version, syncedAt: d.updated_at });
    this.load(d.body, d.version, d.updated_at);
  }
  unlink() { putLink(this.key, null); this.pending = false; this.set("local"); }
  async restoreVersion(v: number) {
    const l = this.link, b = this.b; if (!l || !b) return;
    const body = await versionBody(l.id, v);
    if (body === null) throw new Error("That version isn't available.");
    b.set(body); b.reload(); this.changed();
  }
}

const syncs = new Map<string, TeamSync>();
/** The one sync for a tool's store (bind it to the tool's current state each time the tool opens). */
export function teamSync(app: App, key: string, b: Bound): TeamSync {
  let s = syncs.get(key);
  if (!s) { s = new TeamSync(app, key); syncs.set(key, s); }
  s.bind(b);
  void s.refresh();
  return s;
}

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
const STATUS: Record<Status, string> = { local: "On this device only", saved: "Synced with your team", saving: "Saving…", offline: "Offline: will sync", viewer: "View only" };

/** The "Your team" card for a tool's home screen. */
export function teamCard(app: App, s: TeamSync, b: Bound): HTMLElement {
  const pill = h("span", { class: "team-pill" });
  const body = h("div", { class: "team-body" });
  const card = h("details", { class: "team-card" }, h("summary", {}, h("span", {}, "👥 Team, versions and backup"), pill), body);
  let shown = false;
  const paint = () => {
    // Once the card has left the screen, stop listening.
    if (card.isConnected) shown = true; else if (shown) { off(); return; }
    const l = s.link;
    pill.className = `team-pill ${s.status}`;
    pill.textContent = l && s.status === "saved" ? `Synced ${ago(l.syncedAt)}` : STATUS[s.status];
  };
  const off: () => void = s.onStatus(() => paint()) as () => void;
  paint();
  const msg = h("p", { class: "muted small" });
  const fail = (e: unknown) => { msg.textContent = (e as Error).message || "Couldn't reach Atlas's servers."; };

  const backup = () => h("div", { class: "team-row" },
    h("button", { class: "pill-btn", onclick: () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ app: "atlas", kind: s.key, saved: new Date().toISOString(), body: b.get() })], { type: "application/json" }));
      const a = h("a", { href: url, download: `${b.title().replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json` }) as HTMLAnchorElement;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } }, "Download a backup"),
    h("button", { class: "link-btn", onclick: async () => {
      const t = await pickFile("application/json,.json"); if (!t) return;
      try {
        const f = JSON.parse(t) as { app?: string; kind?: string; body?: unknown };
        if (f.app !== "atlas" || f.kind !== s.key || !f.body) throw new Error("That file isn't a backup of this tool.");
        if (!confirm("Replace what's here with the backup?")) return;
        b.set(f.body); b.reload(); s.changed(); app.toast("Restored from the backup.");
      } catch (e) { app.toast((e as Error).message || "That file couldn't be read."); }
    } }, "Restore a backup…"));

  async function render() {
    msg.textContent = "";
    const l = s.link;
    if (!cloudOn()) {
      body.replaceChildren(h("p", { class: "muted small" }, "This workspace lives in this browser. To share it with your team (roles, live sync, version history), Atlas's back end needs switching on: see docs/backend.md › Team workspaces."), backup());
      return;
    }
    if (!cloudUser()) {
      body.replaceChildren(h("p", { class: "muted small" }, "Sign in to share this with your team, or to open a workspace you've been invited to."),
        h("button", { class: "pill-btn", onclick: () => app.actions.get("account:signin")?.run() }, "Sign in"), backup());
      return;
    }
    if (!l) {
      const name = h("input", { class: "pro-url", value: b.title(), "aria-label": "Workspace name" }) as HTMLInputElement;
      const list = h("div", { class: "team-list" }, h("p", { class: "muted small" }, "Looking for workspaces you've been invited to…"));
      body.replaceChildren(h("p", { class: "muted small" }, "Share this as a team workspace: you become its owner and can invite people as editors or viewers."),
        h("div", { class: "pf-add con-base" }, name, h("button", { class: "pill-btn", onclick: async () => { try { await s.share(name.value.trim() || b.title()); app.toast("Shared. Invite your team below."); void render(); } catch (e) { fail(e); } } }, "Share")),
        list, msg, backup());
      try {
        await claimInvites().catch(() => 0);
        const ws = await myWorkspaces(s.key);
        list.replaceChildren(...(ws.length ? [h("strong", { class: "small" }, "Or open a team workspace"), ...ws.map((w) => h("button", { class: "team-ws", onclick: async () => {
          if (!confirm(`Open "${w.name}"? It replaces what's on this device for this tool.`)) return;
          try { await s.open(w.id, w.name, w.role); void render(); } catch (e) { fail(e); }
        } }, h("span", {}, w.name), h("small", {}, ROLE_LABEL[w.role])))] : []));
      } catch { list.replaceChildren(); }
      return;
    }
    // Linked.
    const people = h("div", { class: "team-list" }, h("p", { class: "muted small" }, "Loading the team…"));
    const versions = h("div", { class: "team-list" });
    const email = h("input", { class: "pro-url", type: "email", placeholder: "name@agency.gov", "aria-label": "Email to invite" }) as HTMLInputElement;
    const role = h("select", { class: "pro-url", "aria-label": "Role" }, ...(["editor", "viewer", "owner"] as Role[]).map((r) => h("option", { value: r }, ROLE_LABEL[r]))) as HTMLSelectElement;
    const owner = l.role === "owner";
    body.replaceChildren(
      h("p", { class: "team-head" }, h("strong", {}, l.name), h("span", {}, ` · you're ${ROLE_LABEL[l.role].toLowerCase()} · version ${l.version}`)),
      h("div", { class: "team-row" },
        l.role !== "viewer" ? h("button", { class: "pill-btn", onclick: () => void s.flush().then(render) }, "Save now") : "",
        h("button", { class: "pill-btn", onclick: () => void s.refresh().then(render) }, "Get the latest"),
        h("button", { class: "link-btn danger", onclick: () => { if (confirm("Stop syncing on this device? The team's copy stays as it is.")) { s.unlink(); void render(); } } }, "Stop syncing here")),
      h("strong", { class: "small" }, "People"), people,
      owner ? h("div", { class: "pf-add team-invite" }, email, role, h("button", { class: "pill-btn", onclick: async () => {
        if (!validEmail(email.value)) { msg.textContent = "That email doesn't look right."; return; }
        try { await invite(l.id, email.value, role.value as Role); email.value = ""; void render(); app.toast("Invited. They'll see it when they sign in with that email."); } catch (e) { fail(e); }
      } }, "Invite")) : "",
      h("strong", { class: "small" }, "Earlier versions"), versions, msg, backup());
    try {
      const ms = await members(l.id);
      people.replaceChildren(...ms.map((m) => h("div", { class: "team-person" }, h("span", {}, m.email, m.user_id ? "" : h("small", {}, " · invited")),
        owner && m.user_id !== cloudUser()?.id ? h("span", { class: "team-actions" },
          (() => { const sel = h("select", { class: "pro-url", "aria-label": `Role for ${m.email}` }, ...(["owner", "editor", "viewer"] as Role[]).map((r) => h("option", { value: r, selected: r === m.role }, ROLE_LABEL[r]))) as HTMLSelectElement;
            sel.addEventListener("change", () => void setRole(l.id, m.email, sel.value as Role).catch(fail)); return sel; })(),
          h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${m.email}?`)) void removeMember(l.id, m.email).then(render, fail); } }, "Remove"))
          : h("small", {}, ROLE_LABEL[m.role]))));
    } catch (e) { people.replaceChildren(); fail(e); }
    try {
      const vs = await history(l.id);
      versions.replaceChildren(...(vs.length ? vs.slice(0, 12).map((v) => h("div", { class: "team-person" }, h("span", {}, `Version ${v.version}`, h("small", {}, ` · ${ago(v.updated_at)}`)),
        l.role !== "viewer" ? h("button", { class: "link-btn", onclick: async () => { if (!confirm(`Bring back version ${v.version}? It's saved as a new version, so nothing is lost.`)) return; try { await s.restoreVersion(v.version); app.toast(`Version ${v.version} restored.`); } catch (e) { fail(e); } } }, "Restore") : ""))
        : [h("p", { class: "muted small" }, "Each save is kept here.")]));
    } catch { versions.replaceChildren(); }
  }
  card.addEventListener("toggle", () => { if ((card as HTMLDetailsElement).open) void render(); });
  return card;
}

export type { TeamSync };
