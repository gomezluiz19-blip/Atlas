import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fill, LEGAL_PAGES, legalPage, toHtml, type Company } from "../src/legal/markdown";

const blank: Company = { company: "", product: "Atlas", contact_email: "", security_email: "", address: "", governing_law: "", effective_date: "", reviewed_by_counsel: false };

describe("Legal pages", () => {
  it("renders the Markdown subset safely", () => {
    const html = toHtml("# Title\n\nSome **bold** and a [link](privacy.html) and <script>x</script>.\n\n- one\n- two\n  continued\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[bad](javascript:alert(1))");
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="privacy.html">link</a>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<li>two continued</li>");
    expect(html).toContain("<td>1</td><td>2</td>");
    expect(html).toContain('<a href="#">bad</a>');
  });
  it("fills company details, shows blanks clearly, and marks drafts", () => {
    expect(fill("{{COMPANY}} at {{CONTACT_EMAIL}}", { ...blank, company: "Acme Maps Inc." })).toBe("Acme Maps Inc. at [contact email]");
    const page = legalPage("terms", "# Terms of Service\n\nHi {{COMPANY}}.", blank);
    expect(page).toContain("Draft for review");
    expect(legalPage("terms", "# T", { ...blank, reviewed_by_counsel: true })).not.toContain("Draft for review");
  });
  it("has every page, with no unknown placeholders", () => {
    for (const [name] of LEGAL_PAGES) {
      const md = readFileSync(`docs/legal/${name}.md`, "utf8");
      expect(fill(md, blank)).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});
