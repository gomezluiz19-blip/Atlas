import { describe, expect, it } from "vitest";
import { clipSentence } from "../src/pro/vision/cameras";
import type { ClipSummary } from "../src/pro/vision/monitor";

const clip = (c: Partial<ClipSummary>): ClipSummary => ({ duration: 102, done: true, peak: 0, peakT: 0, entered: 0, exited: 0, moments: 0, readings: 100, moving: 0, ...c });

describe("a recorded clip in a sentence", () => {
  it("sums up people, the door and the busiest zone", () => {
    const s = clipSentence({ mode: "people", moments: [], clip: clip({ moving: 64, entered: 5, exited: 3, peak: 4, peakT: 48 }) }, [{ name: "Shoe wall", share: 0.38 }, { name: "Till", share: 0.1 }], true);
    expect(s).toBe("In this clip (1:42): someone was in view 64% of the time; 5 people came in and 3 went out; the busiest moment was at 0:48, with 4 people in view; most of the time people spent was at Shoe wall (38%).");
  });
  it("speaks of movement when only motion is watched, and says so while still playing", () => {
    const s = clipSentence({ mode: "motion", moments: [], clip: clip({ done: false, moving: 100, peak: 9, peakT: 65 }) }, [], false);
    expect(s).toBe("So far (1:42): there was movement the whole time; the busiest moment was at 1:05.");
    expect(clipSentence({ mode: "motion", moments: [], clip: clip({}) }, [], false)).toMatch(/nothing moved/);
  });
});
