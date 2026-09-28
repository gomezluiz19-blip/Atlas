import { describe, expect, it } from "vitest";
import { dateIn, parseSiteLog } from "../src/work/buildLog";
import type { BuildProject } from "../src/work/buildModel";

const p = (name: string): BuildProject => ({ id: name, name, use: "apartments", floors: 4, storey: 3, ring: [], costRate: 1, created: 0, phases: [], log: [], issues: [], deliveries: [] });
const now = new Date("2026-05-06T10:00:00Z"); // a Wednesday

describe("site diary in plain words", () => {
  it("logs work with crew and progress", () => {
    const e = parseSiteLog("Oak Street: poured the level 2 slab, 14 crew, structure 60%", [p("Oak Street"), p("Mill Lane")], now)!;
    expect(e.project.name).toBe("Oak Street");
    expect(e.log).toEqual({ text: "poured the level 2 slab, 14 crew, structure 60%", crew: 14 });
    expect(e.phase).toEqual({ id: "structure", done: 60 });
    expect(parseSiteLog("Mill Lane roof complete", [p("Oak Street"), p("Mill Lane")], now)!.phase).toEqual({ id: "envelope", done: 100 });
  });
  it("books deliveries on a day", () => {
    const e = parseSiteLog("Oak Street delivery of steel on Friday", [p("Oak Street")], now)!;
    expect(e.delivery).toEqual({ date: "2026-05-08", text: "steel" });
    expect(dateIn("tomorrow", now)).toBe("2026-05-07");
    expect(dateIn("on 12 june", now)).toBe("2026-06-12");
  });
  it("uses the only project for 'site' lines, and ignores the rest", () => {
    expect(parseSiteLog("site: scaffold inspected", [p("Oak Street")], now)!.project.name).toBe("Oak Street");
    expect(parseSiteLog("site: scaffold inspected", [p("Oak Street"), p("Mill Lane")], now)).toBeNull();
    expect(parseSiteLog("poured the slab", [p("Oak Street")], now)).toBeNull();
  });
});
