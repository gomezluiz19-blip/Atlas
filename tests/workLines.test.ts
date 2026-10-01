import { describe, expect, it } from "vitest";
import { fit, LINES, rank } from "../src/work/workLines";

const top = (q: string) => rank(q)[0]?.station.id;

describe("the Work map", () => {
  it("puts each pro tool on an industry line, specialists after the tool they serve", () => {
    const ids = (l: string) => LINES.find((x) => x.id === l)!.stations.map((s) => s.id);
    expect(ids("build")).toEqual(["build", "buildpro", "fn-construction"]);
    expect(ids("mine")).toEqual(["mining", "fn-mining"]);
    expect(LINES.flatMap((l) => l.stations).filter((s) => s.tool.startsWith("services:")).map((s) => s.tool.slice(9)).sort()).toEqual(["agriculture", "construction", "energy", "medical", "mining", "sports", "telecom"]);
  });
  it("matches what people say they do", () => {
    expect(top("we hire out cranes")).toBe("fn-construction");
    expect(top("I'm a general contractor")).toBe("buildpro");
    expect(top("freight forwarder")).toBe("shipping");
    expect(top("we service wind turbines")).toBe("fn-energy");
    expect(top("tractor dealer")).toBe("fn-agriculture");
    expect(top("humanitarian logistics")).toBe("relief");
    expect(top("city councillor")).toBe("office");
    expect(top("we sell drill rigs to mines")).toBe("fn-mining");
  });
  it("ignores filler words", () => {
    expect(rank("we run our company")).toEqual([]);
    expect(fit(LINES[0].stations[0], LINES[0], "")).toBe(0);
  });
});
