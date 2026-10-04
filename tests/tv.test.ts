import { describe, expect, it } from "vitest";
import { cleanCode, newCode, remoteUrl } from "../src/tv/link";

describe("TV pairing", () => {
  it("makes short codes without look-alike characters", () => {
    for (let i = 0; i < 50; i++) { const c = newCode(); expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); }
    let n = 0; expect(newCode(() => (n++ % 10) / 10)).toHaveLength(6);
  });
  it("cleans what people type", () => { expect(cleanCode(" abc-23 4x ")).toBe("ABC234"); });
  it("points the remote next to the app", () => {
    expect(remoteUrl("ABC234", "https://x.github.io/Terreno/#/tv/ABC234")).toBe("https://x.github.io/Terreno/remote.html#ABC234");
    expect(remoteUrl("ABC234", "https://x.github.io/Terreno/index.html")).toBe("https://x.github.io/Terreno/remote.html#ABC234");
  });
});
