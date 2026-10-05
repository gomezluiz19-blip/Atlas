// Shared set-up for the QA runs: a headless Chromium on the built site, past the opening and the tour,
// with ?qa so the page exposes window.atlas. Playwright isn't a dependency of Terreno: install it once
// (npm i -g playwright, or set PLAYWRIGHT to its path) and serve a build (npm run build && npx vite preview).
import { createRequire } from "module";

const require = createRequire(import.meta.url);
async function loadPlaywright() {
  if (process.env.PLAYWRIGHT) return require(process.env.PLAYWRIGHT);
  try { return await import("playwright"); } catch { /* not local */ }
  const { execSync } = await import("child_process");
  return require(`${execSync("npm root -g").toString().trim()}/playwright`);
}

/** Where the built site is served (vite preview by default). */
export const BASE = process.env.QA_URL ?? "http://localhost:4173/?qa=1";
/** Where screenshots and results go. */
export const OUT = process.env.QA_OUT ?? "qa-out";

/**
 * Opens Terreno in a fresh browser. `fresh` keeps the first-visit opening and tour; otherwise they're
 * marked as seen. Returns the browser, the page and the errors collected so far (a live array).
 */
export async function openTerreno({ width = 1280, height = 800, phone = false, fresh = false, gc = false } = {}) {
  const { chromium } = await loadPlaywright();
  const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (gc) args.push("--enable-precise-memory-info", "--js-flags=--expose-gc");
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
  if (!fresh) await ctx.addInitScript(() => {
    for (const [k, v] of [["atlas.welcomed", "1"], ["atlas.intro", "1"], ["atlas.tour", "done"], ["atlas.intros", "off"]]) localStorage.setItem(k, v);
    addEventListener("unhandledrejection", (e) => { (window.__rej ??= []).push(String(e.reason?.message ?? e.reason)); });
  });
  // Feedback pings go nowhere during a run.
  await ctx.route(/ntfy\.sh/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!fresh) await page.waitForFunction(() => !!window.atlas, null, { timeout: 60000 });
  await page.waitForTimeout(fresh ? 0 : 6000);
  return { browser, page, errors };
}
