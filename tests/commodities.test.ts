import { describe, expect, it } from "vitest";
import { commodityOf, isHistoric, mineKind } from "../src/analysis/commodities";

describe("commodities", () => {
  it("groups resources", () => {
    expect(commodityOf({ resource: "gold" }).group).toBe("precious");
    expect(commodityOf({ resource: "copper;molybdenum" })).toEqual({ text: "copper, molybdenum", group: "metals" });
    expect(commodityOf({ resource: "coal" }).group).toBe("energy");
    expect(commodityOf({ resource: "gravel" }).group).toBe("construction");
    expect(commodityOf({ resource: "potash" }).group).toBe("industrial");
    expect(commodityOf({ landuse: "quarry" }).group).toBe("construction");
    expect(commodityOf({ man_made: "mineshaft", name: "Orphan Uranium Mine" }).group).toBe("energy");
    expect(commodityOf({ man_made: "mineshaft" }).group).toBe("unknown");
  });

  it("detects historic sites and kinds", () => {
    expect(isHistoric({ historic: "mine" })).toBe(true);
    expect(isHistoric({ "disused:landuse": "quarry" })).toBe(true);
    expect(isHistoric({ landuse: "quarry" })).toBe(false);
    expect(mineKind({ landuse: "quarry" })).toBe("Quarry / open pit");
    expect(mineKind({ man_made: "adit" })).toBe("Mine entrance (adit)");
  });
});
