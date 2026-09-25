/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any static host or subfolder.
  base: "./",
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
