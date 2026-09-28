/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any static host or subfolder.
  base: "./",
  worker: { format: "es" },
  build: {
    chunkSizeWarningLimit: 6000,
    // Cesium in its own file, so it stays cached when only Atlas changes.
    rollupOptions: { output: { manualChunks: (id) => (/node_modules\/@?cesium/.test(id) ? "cesium" : undefined) } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
