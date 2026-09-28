import { describe, expect, it } from "vitest";
import { parseFieldLog, type FieldLite } from "../src/work/growLog";

const fields: FieldLite[] = [
  { id: "a", name: "Top field", crop: "wheat", planted: "2026-03-01", diary: [] },
  { id: "b", name: "Barn plot", crop: "potato", planted: "2026-04-01", diary: [] },
  { id: "c", name: "Top", crop: "maize", planted: "2026-04-01", diary: [] },
];

describe("field diary in plain words", () => {
  it("records work on the named field, keeping the details", () => {
    const e = parseFieldLog("sprayed Top field with glyphosate", fields)!;
    expect(e.field.id).toBe("a");
    expect(e.text).toBe("Sprayed: with glyphosate");
    expect(parseFieldLog("harvested Barn plot, 32 t/ha", fields)!.text).toBe("Harvested: 32 t/ha");
    expect(parseFieldLog("irrigated the barn plot 20 mm", fields)!.text).toBe("Irrigated: 20 mm");
  });
  it("sets the planting date and crop when something is planted", () => {
    const e = parseFieldLog("planted Barn plot with winter wheat", fields)!;
    expect(e.patch?.crop).toBe("wheat-winter");
    expect(e.patch?.planted).toBeTruthy();
    expect(parseFieldLog("drilled Top field", fields)!.patch?.crop).toBeUndefined();
    expect(parseFieldLog("planted Top field this spring with oats", fields)!.patch?.crop).toBe("oats");
  });
  it("ignores lines without a known field or a recognised job", () => {
    expect(parseFieldLog("sprayed the orchard", fields)).toBeNull();
    expect(parseFieldLog("Top field looks lovely", fields)).toBeNull();
  });
});
