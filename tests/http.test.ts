import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRetry } from "../src/data/http";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number) => new Response("x", { status });

describe("fetchRetry", () => {
  it("retries transient failures then succeeds", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", f);
    const res = await fetchRetry("https://x", {}, 3, 1);
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 404", async () => {
    const f = vi.fn().mockResolvedValue(reply(404));
    vi.stubGlobal("fetch", f);
    expect((await fetchRetry("https://x", {}, 3, 1)).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last try", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", f);
    await expect(fetchRetry("https://x", {}, 2, 1)).rejects.toThrow("Failed to fetch");
    expect(f).toHaveBeenCalledTimes(2);
  });
});
