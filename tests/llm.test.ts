import { describe, expect, it } from "vitest";
import { looksLikeAsk } from "../src/robot/llm";

describe("when to ask Claude", () => {
  it("sends questions and requests, not place names", () => {
    expect(looksLikeAsk("What's the tallest mountain in Africa?")).toBe(true);
    expect(looksLikeAsk("show me volcanoes near Naples")).toBe(true);
    expect(looksLikeAsk("compare the Nile and the Amazon rivers")).toBe(true);
    expect(looksLikeAsk("Paris")).toBe(false);
    expect(looksLikeAsk("350 Fifth Avenue, New York")).toBe(false);
    expect(looksLikeAsk("40.7, -74.0")).toBe(false);
    expect(looksLikeAsk("https://maps.google.com/?q=x")).toBe(false);
  });
});
