// Copies Cesium's static runtime (web workers, textures, widget CSS) into
// public/cesium so Vite serves it in dev and bundles it in production.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "cesium", "Build", "Cesium");
const dest = join(root, "public", "cesium");

if (!existsSync(src)) {
  console.warn("[copy-cesium] cesium is not installed yet; skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const dir of ["Workers", "Assets", "Widgets", "ThirdParty"]) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("[copy-cesium] copied Cesium static assets to public/cesium");
