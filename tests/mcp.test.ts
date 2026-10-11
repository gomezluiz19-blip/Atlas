import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseHash } from "../src/data/locationParse";
import { sceneUrl } from "../src/mcp/tools";
import worker, { handle } from "../src/mcp/worker";

// The public services stood in for: a place in the Hudson Valley, a warm wet day, ten years of mild climate.
const dates = (from: string, days: number) => Array.from({ length: days }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10));
const today = new Date().toISOString().slice(0, 10);
const lastYear = new Date().getUTCFullYear() - 1;
function fake(url: string): unknown {
  if (url.includes("nominatim")) return { name: "Peekskill", address: { city: "Peekskill", state: "New York", country: "United States" } };
  if (url.includes("/v1/elevation")) return { elevation: [42] };
  if (url.includes("archive-api")) {
    const t = dates(`${lastYear - 9}-01-01`, 3653);
    return { daily: { time: t, temperature_2m_mean: t.map((d) => 11 - 12 * Math.cos(((Number(d.slice(5, 7)) - 1) / 12) * 2 * Math.PI)), precipitation_sum: t.map(() => 3.2) } };
  }
  if (url.includes("current=")) return { current: { time: `${today}T09:00`, temperature_2m: 17.4, weather_code: 61, wind_speed_10m: 12 } };
  if (url.includes("forecast_days=16")) {
    const t = dates(today, 16);
    return { timezone: "America/New_York", daily: { time: t, weather_code: t.map(() => 61), temperature_2m_max: t.map(() => 19), temperature_2m_min: t.map(() => 9), precipitation_sum: t.map(() => 6), precipitation_probability_max: t.map(() => 70), wind_gusts_10m_max: t.map(() => 30), snowfall_sum: t.map(() => 0) } };
  }
  if (url.includes("restcountries")) return [{ name: { common: "United States", official: "United States of America" }, cca2: "US", cca3: "USA", capital: ["Washington, D.C."], region: "Americas", subregion: "North America", population: 340110988, area: 9525067, languages: { eng: "English" }, currencies: { USD: { name: "United States dollar" } }, borders: ["CAN", "MEX"], landlocked: false, car: { side: "right" } }];
  throw new Error(`unexpected ${url}`);
}
beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(fake(String(u))), { status: 200, headers: { "content-type": "application/json" } }))); });
afterAll(() => vi.unstubAllGlobals());

const call = async (name: string, args: Record<string, unknown>) =>
  (await handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } })) as { result: { isError: boolean; structuredContent: Record<string, any>; content: { text: string }[] } };

describe("the MCP protocol", () => {
  it("introduces itself, lists its tools and answers pings", async () => {
    const init = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })) as any;
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeTruthy();
    expect(init.result.serverInfo.name).toBe("terreno");
    const list = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as any;
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["place_read", "weather_on", "country", "scene"]);
    for (const t of list.result.tools) expect(t.inputSchema.required).toEqual(expect.arrayContaining(["lon", "lat"]));
    expect(await handle({ jsonrpc: "2.0", id: 3, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(((await handle({ jsonrpc: "2.0", id: 4, method: "resources/list" })) as any).error.code).toBe(-32601);
  });
  it("speaks HTTP as Streamable HTTP expects", async () => {
    const post = (body: unknown) => worker.fetch(new Request("https://mcp.terreno.site/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const r = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await worker.fetch(new Request("https://mcp.terreno.site/mcp"))).status).toBe(405);
    expect((await worker.fetch(new Request("https://mcp.terreno.site/mcp", { method: "POST", body: "{" }))).status).toBe(400);
  });
});

describe("the tools", () => {
  it("reads a place, every value with its source", async () => {
    const r = await call("place_read", { lon: -73.92, lat: 41.29 });
    expect(r.result.isError).toBe(false);
    const p = r.result.structuredContent;
    expect(p.name).toMatchObject({ value: "Peekskill, New York, United States", source: expect.stringContaining("OpenStreetMap") });
    expect(p.height).toMatchObject({ value: 42, unit: expect.stringContaining("m"), source: expect.stringContaining("Copernicus") });
    expect(p.country.value).toBe("United States of America");
    expect(p.climate.value).toMatch(/^[A-E]/);
    expect(p.climate.source).toContain("ERA5");
    expect(p.yearly_rain.value).toBeGreaterThan(1000);
    expect(p.weather_now.value).toContain("17°C");
    expect(p.open_in_terreno).toMatch(/^https:\/\/terreno\.site\/#/);
  });
  it("says what a day's weather means and what to do", async () => {
    const day = dates(today, 16)[3];
    const r = await call("weather_on", { lon: -73.92, lat: 41.29, date: day });
    const w = r.result.structuredContent;
    expect(w.available).toBe(true);
    expect(w.summary.value).toContain("Rain likely");
    expect(w.advice).toBeTruthy();
    expect(w.rain_chance_pct).toBe(70);
    const far = await call("weather_on", { lon: -73.92, lat: 41.29, date: "2099-01-01" });
    expect(far.result.structuredContent.available).toBe(false);
  });
  it("names the country with its facts", async () => {
    const c = (await call("country", { lon: -73.92, lat: 41.29 })).result.structuredContent;
    expect(c.country.value).toBe("United States");
    expect(c.capital).toBe("Washington, D.C.");
    expect(c.neighbours).toEqual(["CAN", "MEX"]);
  });
  it("tells the model what was wrong with its input, as a result it can correct", async () => {
    const r = await call("place_read", { lon: 400, lat: 10 });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("lon must be");
    expect((await call("weather_on", { lon: 1, lat: 1, date: "tomorrow" })).result.content[0].text).toContain("YYYY-MM-DD");
  });
});

describe("scene links", () => {
  it("open Terreno on the place, in the view, framed by the radius", () => {
    const url = sceneUrl(-73.92, 41.29, 1500, "nature");
    const s = parseHash(new URL(url).hash);
    expect(s.place).toEqual({ lon: -73.92, lat: 41.29 });
    expect(s.theme).toBe("nature");
    expect(s.camera!.height).toBeGreaterThan(1000);
    expect(s.camera!.lat).toBeLessThan(41.29);
    expect(parseHash(new URL(sceneUrl(0, 0, 3_000_000)).hash).camera!.pitch).toBe(-89);
  });
});
