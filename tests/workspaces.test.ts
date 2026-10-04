import { describe, expect, it } from "vitest";
import { ago } from "../src/pro/kit/team";
import { createWorkspace, myWorkspaces, pushDoc, validEmail } from "../src/cloud/workspaces";

type Call = { path: string; init?: RequestInit & { prefer?: string } };
const fake = (answers: ((c: Call) => unknown)[]) => {
  const calls: Call[] = [];
  const api = async <T,>(path: string, init?: RequestInit & { prefer?: string }) => { const c = { path, init }; calls.push(c); return answers[calls.length - 1](c) as T; };
  return { api, calls };
};

describe("Team workspaces", () => {
  it("creates a workspace with its first version", async () => {
    const { api, calls } = fake([() => [{ id: "w1", name: "NYC" }], () => [{ version: 1, updated_at: "2026-10-04T10:00:00Z" }]]);
    const l = await createWorkspace("atlas.pro.city.v1", "NYC", { a: 1 }, api);
    expect(l).toMatchObject({ id: "w1", role: "owner", version: 1 });
    expect(calls[1].path).toBe("workspace_docs");
    expect(JSON.parse(String(calls[1].init!.body))).toEqual({ workspace_id: "w1", body: { a: 1 }, version: 1 });
  });
  it("only saves on top of the version it was based on", async () => {
    const ok = fake([() => [{ version: 4, updated_at: "t" }]]);
    expect(await pushDoc("w1", { x: 1 }, 3, ok.api)).toEqual({ ok: true, version: 4, at: "t" });
    expect(ok.calls[0].path).toContain("version=eq.3");
    expect(JSON.parse(String(ok.calls[0].init!.body)).version).toBe(4);
    const stale = fake([() => [], () => [{ body: { theirs: true }, version: 7, updated_at: "u", updated_by: "x" }]]);
    const r = await pushDoc("w1", { mine: true }, 3, stale.api);
    expect(r).toEqual({ ok: false, latest: { body: { theirs: true }, version: 7, updated_at: "u", updated_by: "x" } });
  });
  it("lists only workspaces of the tool's kind", async () => {
    const { api } = fake([() => [{ role: "editor", workspaces: { id: "a", name: "A", kind: "k" } }, { role: "viewer", workspaces: null }, { role: "owner", workspaces: { id: "b", name: "B", kind: "other" } }]]);
    expect(await myWorkspaces("k", api, "u1")).toEqual([{ id: "a", name: "A", kind: "k", role: "editor" }]);
  });
  it("checks emails and says how long ago", () => {
    expect(validEmail("ops@nyc.gov")).toBe(true);
    expect(validEmail("not an email")).toBe(false);
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(ago("2026-10-04T11:59:50Z", now)).toBe("just now");
    expect(ago("2026-10-04T11:50:00Z", now)).toBe("10 min ago");
    expect(ago("2026-10-04T09:00:00Z", now)).toBe("3 h ago");
  });
});
