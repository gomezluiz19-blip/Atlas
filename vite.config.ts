/// <reference types="vitest/config" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import { FEATURES } from "./src/content/features";
import { LEGAL_PAGES, legalPage, type Company } from "./src/legal/markdown";
import { pagesFor, renderPage, sitemap, type LabelRow } from "./src/place/prerender";

/** Gzipped bytes every visitor downloads at startup; the build fails in CI past these. */
const BUDGET = { app: 700 * 1024, cesium: 1250 * 1024 };

/** Startup data (intros, sites, features, minerals) changes less often than the code: its own file. */
const DATA = /src\/(intros\/(heritage|more|footholds|nature)|content\/(features|links|minerals|sites|wildlife)|ui\/taxonIcons)\.ts$/;
const VENDOR = /node_modules\/(satellite\.js|lucide|topojson-client)\//;

/**
 * A Content Security Policy for the built site (GitHub Pages can't send headers, so it's a meta tag). Scripts
 * only from the site itself (and WebAssembly for Cesium), so an injected <script> from anywhere else, or an inline
 * one, can't run; no plugins; no <base> hijacking. 'unsafe-eval' is needed because Cesium's widgets use Knockout,
 * which compiles its bindings from strings. Data, tiles and images still come from the public services it reads.
 */
export const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "media-src 'self' blob: https:", "connect-src 'self' https: wss: data: blob:",
  "frame-src https:", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join("; ");
function contentSecurityPolicy(): Plugin {
  return { name: "atlas-csp", apply: "build", transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) };
}

/** The legal and trust pages (docs/legal) at /legal/<name>.html, and /.well-known/security.txt once there's a security contact. */
function legalPages(): Plugin {
  let outDir = "dist";
  return {
    name: "atlas-legal-pages",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const company = JSON.parse(readFileSync("docs/legal/company.json", "utf8")) as Company;
      mkdirSync(join(outDir, "legal"), { recursive: true });
      for (const [name] of LEGAL_PAGES) writeFileSync(join(outDir, "legal", `${name}.html`), legalPage(name, readFileSync(join("docs", "legal", `${name}.md`), "utf8"), company));
      const contact = company.security_email || company.contact_email;
      if (contact) {
        mkdirSync(join(outDir, ".well-known"), { recursive: true });
        const expires = new Date(Date.now() + 300 * 86_400_000).toISOString();
        writeFileSync(join(outDir, ".well-known", "security.txt"), `Contact: mailto:${contact}\nExpires: ${expires}\nPreferred-Languages: en\nPolicy: legal/security.html\n`);
      }
    },
  };
}

/** Writes a real page for every named place (p/<address>/), and a sitemap when the site's URL is known. */
function placePages(): Plugin {
  let outDir = "dist";
  let precache: string[] = [];
  return {
    name: "atlas-place-pages",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    generateBundle(_o, bundle) {
      // What the app needs to start: the entry, everything it imports statically, and their styles.
      const chunks = new Map(Object.values(bundle).filter((b) => b.type === "chunk").map((c) => [c.fileName, c]));
      const seen = new Set<string>();
      const walk = (f: string) => {
        const c = chunks.get(f);
        if (!c || seen.has(f)) return;
        seen.add(f);
        for (const css of (c as { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss ?? []) seen.add(css);
        c.imports.forEach(walk);
      };
      for (const c of chunks.values()) if (c.isEntry) walk(c.fileName);
      precache = [...seen];
      // A budget for what every visitor downloads before the globe shows (gzipped).
      const gz = (f: string) => { const b = bundle[f]; return gzipSync(b.type === "chunk" ? b.code : b.source).length; };
      const app = precache.filter((f) => f.endsWith(".js") && !/cesium/.test(f)).reduce((t, f) => t + gz(f), 0);
      const cesium = precache.filter((f) => /cesium/.test(f)).reduce((t, f) => t + gz(f), 0);
      const kb = (n: number) => `${Math.round(n / 1024)} kB`;
      console.log(`Startup download (gzip): Atlas ${kb(app)}, Cesium ${kb(cesium)}, in ${precache.length} files`);
      const over = [app > BUDGET.app && `Atlas startup code is ${kb(app)}, over its ${kb(BUDGET.app)} budget`, cesium > BUDGET.cesium && `Cesium is ${kb(cesium)}, over its ${kb(BUDGET.cesium)} budget`].filter(Boolean);
      if (over.length) { if (process.env.CI) this.error(over.join("; ")); else this.warn(over.join("; ")); }
    },
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
      // A fresh offline cache for each deploy (the service worker clears the last one).
      const sw = join(outDir, "sw.js");
      writeFileSync(sw, readFileSync(sw, "utf8")
        .replace('const VERSION = "atlas-dev";', `const VERSION = "atlas-${Date.now().toString(36)}";`)
        .replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(precache)};`));
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
  plugins: [contentSecurityPolicy(), linkPreview(), placePages(), legalPages()],
  build: {
    chunkSizeWarningLimit: 6000,
    // Cesium, small libraries and the bundled data each in their own file, so a deploy that
    // only changes Atlas's code leaves them cached, and they download in parallel.
    // The app, and the phone remote for TV mode (a page of its own, no globe).
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), remote: resolve(__dirname, "remote.html") }, output: { manualChunks: (id) => (/node_modules\/@?cesium/.test(id) ? "cesium" : VENDOR.test(id) ? "vendor" : DATA.test(id) ? "atlas-data" : undefined) } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
