/// <reference types="vitest/config" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { FEATURES } from "./src/content/features";
import { pagesFor, renderPage, sitemap, type LabelRow } from "./src/place/prerender";

/** Writes a real page for every named place (p/<address>/), and a sitemap when the site's URL is known. */
function placePages(): Plugin {
  let outDir = "dist";
  return {
    name: "atlas-place-pages",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const json = (f: string) => JSON.parse(readFileSync(join("public", "data", f), "utf8")) as LabelRow[];
      const pages = pagesFor(FEATURES, json("world-labels.json"), json("detail-labels.json"));
      // Place pages carry their own title and description for link previews.
      const app = readFileSync(join(outDir, "index.html"), "utf8").replace(/\s*<meta property="og:(title|description|url)"[^>]*>/g, "");
      const site = (process.env.ATLAS_SITE_URL ?? "").replace(/\/?$/, "/").replace(/^\/$/, "");
      for (const p of pages) {
        const dir = join(outDir, "p", p.slug);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.html"), renderPage(app, p, site));
      }
      if (site) {
        writeFileSync(join(outDir, "sitemap.xml"), sitemap(site, pages.map((p) => p.slug)));
        writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
      }
      console.log(`Place pages: ${pages.length}${site ? " (with sitemap)" : ""}`);
    },
  };
}

/** Link previews (iMessage, Slack, social): the card image, title and line, with absolute URLs when the site's address is known. */
function linkPreview(): Plugin {
  return {
    name: "atlas-link-preview",
    transformIndexHtml() {
      const site = (process.env.ATLAS_SITE_URL ?? "").replace(/\/?$/, "/").replace(/^\/$/, "");
      const img = `${site || "./"}og.png`;
      const meta = (property: string, content: string) => ({ tag: "meta", attrs: { property, content }, injectTo: "head" as const });
      return [
        meta("og:title", "Atlas"),
        meta("og:description", "The whole Earth, and your own corner of it: every place on one page, lenses you can make, time travel, and a page of the places you love."),
        meta("og:type", "website"),
        meta("og:image", img),
        meta("og:image:width", "1200"),
        meta("og:image:height", "630"),
        ...(site ? [meta("og:url", site)] : []),
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" }, injectTo: "head" as const },
      ];
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any static host or subfolder.
  base: "./",
  worker: { format: "es" },
  plugins: [linkPreview(), placePages()],
  build: {
    chunkSizeWarningLimit: 6000,
    // Cesium in its own file, so it stays cached when only Atlas changes.
    rollupOptions: { output: { manualChunks: (id) => (/node_modules\/@?cesium/.test(id) ? "cesium" : undefined) } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
