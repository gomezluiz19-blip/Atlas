// Every stylesheet parses the way the production build parses it (lightningcss): a stray rule body or a
// broken selector fails here, not at deploy time.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transform } from "lightningcss";

const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : []; });

describe("stylesheets", () => {
  for (const f of cssFiles("src")) {
    it(`${f} parses and minifies`, () => {
      expect(() => transform({ filename: f, code: readFileSync(f), minify: true })).not.toThrow();
    });
  }
});
