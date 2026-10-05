// Writes the app icon and favicon from the mark's generator (src/ui/brand.ts), so they never drift from the app.
import { writeFileSync, readFileSync } from "node:fs";
// Run with Node's type stripping: node --experimental-strip-types scripts/brand-icons.mjs
const mod = await import("../src/ui/brand.ts");
writeFileSync("public/icon.svg", mod.markSvg({ size: 512 }) + "\n");
// The favicon: no corner marks at 16 px, where they'd only be noise.
const fav = mod.markSvg({ size: 32, compact: true });
const html = readFileSync("index.html", "utf8").replace(/<link rel="icon" href="data:image\/svg\+xml,[^"]*" \/>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(fav).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/%2C/g, ",")}" />`);
writeFileSync("index.html", html);
console.log("icon.svg and favicon written");
