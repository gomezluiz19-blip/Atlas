import { describe, expect, it } from "vitest";
import { applyLog, parseLog } from "../src/work/flockLog";
import type { Flock } from "../src/work/flockModel";

const flock = (): Flock => ({ org: "farm", name: "", paddocks: [], animals: [
  { id: "d", species: "cattle", name: "Daisy", tag: "101", status: "Active", weights: [], health: [], bred: "2025-12-01" },
  { id: "b", species: "cattle", name: "Bramble", tag: "102", status: "Active", weights: [], health: [] },
  { id: "s1", species: "sheep", name: "", tag: "201", status: "Active", weights: [], health: [] },
  { id: "s2", species: "sheep", name: "", tag: "202", status: "Active", weights: [], health: [] },
  { id: "s3", species: "sheep", name: "", tag: "203", status: "Sold", weights: [], health: [] },
] });

describe("plain-words logging", () => {
  it("reads births with the number of young", () => {
    const e = parseLog("Daisy had twins", flock())!;
    expect(e.action).toEqual({ kind: "birth", young: 2 });
    const f = applyLog(flock(), e, () => "x");
    expect(f.animals[0].bred).toBeUndefined();
    expect(f.animals[0].health[0].text).toBe("Gave birth: 2");
    expect(parseLog("log that 201 lambed", flock())!.action).toEqual({ kind: "birth", young: 1 });
  });
  it("reads weights by name or tag", () => {
    expect(parseLog("weighed 101 at 590 kg", flock())!.action).toEqual({ kind: "weight", kg: 590 });
    expect(parseLog("Bramble weighs 612kg", flock())!.animals[0].name).toBe("Bramble");
  });
  it("applies group treatments to the active animals of a species", () => {
    const e = parseLog("wormed all the sheep with Cydectin", flock())!;
    expect(e.animals.map((a) => a.id)).toEqual(["s1", "s2"]);
    expect(e.action.kind).toBe("health");
    if (e.action.kind === "health") { expect(e.action.event.text).toBe("Worming: Cydectin"); expect(e.action.event.due).toBeTruthy(); }
  });
  it("keeps other remarks as notes, and ignores what it can't place", () => {
    expect(parseLog("Bramble is lame on the left fore", flock())!.action.kind).toBe("note");
    expect(parseLog("Daisy was served today", flock())!.action.kind).toBe("bred");
    expect(parseLog("it rained a lot", flock())).toBeNull();
    expect(parseLog("Rosie had twins", flock())).toBeNull();
  });
});
