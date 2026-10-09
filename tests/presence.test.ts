import { describe, expect, it } from "vitest";
import { ago, byDay, cleanText, reachFromJson, reachLink, statusFromJson, statusNow, thread, unread, validReach, type Message } from "../src/social/presence";
import { profileFromJson } from "../src/social/model";

const now = new Date("2026-10-09T15:00:00Z");
const minus = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("status", () => {
  it("says how long ago, plainly", () => {
    expect(ago(minus(1), now)).toBe("Just now");
    expect(ago(minus(12), now)).toBe("12 min ago");
    expect(ago(minus(180), now)).toBe("3 h ago");
    expect(ago(minus(60 * 30), now)).toBe("Yesterday");
    expect(ago(minus(60 * 24 * 4), now)).toBe("4 days ago");
  });
  it("reads fresh, then fades after a day", () => {
    const fresh = statusNow({ state: "free", text: "At the lake", where: "Cold Spring", at: minus(30) }, now)!;
    expect(fresh).toMatchObject({ label: "Free to talk", color: "#5b9467", line: "At the lake · Cold Spring", stale: false });
    const old = statusNow({ state: "busy", at: minus(60 * 26) }, now)!;
    expect(old.stale).toBe(true);
    expect(old.color).toBe("#8c8f87");
    expect(statusNow(undefined, now)).toBeNull();
  });
  it("drops a malformed status", () => {
    expect(statusFromJson({ state: "partying", at: minus(1) })).toBeUndefined();
    expect(statusFromJson({ state: "free", at: "never" })).toBeUndefined();
    expect(statusFromJson({ state: "out", at: minus(5), text: "  Hiking  " })).toEqual({ state: "out", at: minus(5), text: "Hiking" });
  });
});

describe("ways to reach someone", () => {
  it("checks each kind", () => {
    expect(validReach({ kind: "text", value: "+1 (914) 555-0100" })).toBe(true);
    expect(validReach({ kind: "call", value: "555" })).toBe(false);
    expect(validReach({ kind: "telegram", value: "@kenji_sky" })).toBe(true);
    expect(validReach({ kind: "email", value: "ada@school" })).toBe(false);
  });
  it("opens the right app", () => {
    expect(reachLink({ kind: "whatsapp", value: "+351 912 345 678" }, "Hi!")).toBe("https://wa.me/351912345678?text=Hi!");
    expect(reachLink({ kind: "text", value: "+1 914 555 0100" })).toBe("sms:+19145550100");
    expect(reachLink({ kind: "signal", value: "44 7700 900123" })).toBe("https://signal.me/#p/+447700900123");
    expect(reachLink({ kind: "telegram", value: "@kenji_sky" })).toBe("https://t.me/kenji_sky");
    expect(reachLink({ kind: "email", value: "ada@school.org" }, "Hello there")).toBe("mailto:ada@school.org?body=Hello%20there");
  });
  it("keeps one of each, well formed, from a page", () => {
    expect(reachFromJson([{ kind: "email", value: "a@b.co" }, { kind: "email", value: "c@d.co" }, { kind: "fax", value: "1" }, { kind: "call", value: "12" }]))
      .toEqual([{ kind: "email", value: "a@b.co" }]);
    expect(reachFromJson("nope")).toEqual([]);
  });
  it("travels with a profile", () => {
    const p = profileFromJson({ handle: "ada", name: "Ada", status: { state: "free", at: minus(3) }, reach: [{ kind: "telegram", value: "ada_ok" }] })!;
    expect(p.status?.state).toBe("free");
    expect(p.reach).toEqual([{ kind: "telegram", value: "ada_ok" }]);
  });
});

describe("messages", () => {
  const m = (id: string, from: string, to: string, at: string, read = false): Message => ({ id, from, to, text: id, at, via: "device", read });
  const all = [m("a", "me", "maya", "2026-10-09T09:00:00Z"), m("b", "maya", "me", "2026-10-09T09:05:00Z"), m("c", "kenji", "me", "2026-10-08T22:00:00Z"), m("d", "maya", "me", "2026-10-07T10:00:00Z", true)];
  it("threads a conversation, oldest first", () => {
    expect(thread(all, "me", "maya").map((x) => x.id)).toEqual(["d", "a", "b"]);
  });
  it("counts unread per person", () => {
    expect(unread(all, "me")).toEqual({ maya: 1, kenji: 1 });
  });
  it("groups by day", () => {
    expect(byDay(thread(all, "me", "maya"), now).map((d) => [d.day, d.items.length])).toEqual([["7 Oct", 1], ["Today", 2]]);
  });
  it("tidies what's typed", () => {
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("  hi there \n")).toBe("hi there");
    expect(cleanText("x".repeat(3000))).toHaveLength(2000);
  });
});
