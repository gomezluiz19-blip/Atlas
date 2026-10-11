// Builds Terreno's MCP server (src/mcp/worker.ts) into one self-contained file for a Cloudflare Worker:
//   npm run build:mcp   → dist-mcp/worker.js   (deploy: docs/mcp.md)
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    ssr: "src/mcp/worker.ts",
    outDir: "dist-mcp",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { output: { format: "es", entryFileNames: "worker.js", inlineDynamicImports: true } },
  },
  ssr: { noExternal: true, target: "webworker" },
});
