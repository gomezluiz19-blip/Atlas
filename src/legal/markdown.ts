// The legal and trust pages (docs/legal/*.md) as plain, fast HTML pages at /legal/<name>.html, built at deploy
// time. A small Markdown subset: headings, paragraphs, lists, tables, bold, inline code and links. Company
// details come from docs/legal/company.json, so a name change is one edit; anything not filled in shows as a
// bracketed blank, and until counsel has reviewed them the pages say they're drafts.

export interface Company { company: string; product: string; contact_email: string; security_email: string; address: string; governing_law: string; effective_date: string; reviewed_by_counsel: boolean }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Fills {{PLACEHOLDERS}} from the company details; blanks show as [Brackets] (pure). */
export function fill(md: string, c: Company): string {
  const v: Record<string, [string, string]> = {
    COMPANY: [c.company, "[Company name]"], PRODUCT: [c.product, "[Product]"], CONTACT_EMAIL: [c.contact_email, "[contact email]"],
    SECURITY_EMAIL: [c.security_email || c.contact_email, "[security email]"], ADDRESS: [c.address, "[address]"],
    GOVERNING_LAW: [c.governing_law, "[state]"], EFFECTIVE_DATE: [c.effective_date, "[date]"],
  };
  return md.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (v[k] ? (v[k][0] || v[k][1]) : m));
}

/** Inline Markdown: links, bold, code (pure; text is escaped first). */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => `<a href="${/^(https?:|mailto:|#|[a-z0-9-]+\.html)/i.test(u) ? u : "#"}">${t}</a>`);
}

/** Markdown (the subset above) to HTML (pure). */
export function toHtml(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const hd = l.match(/^(#{1,4})\s+(.*)$/);
    if (hd) { const t = inline(hd[2]); out.push(`<h${hd[1].length} id="${slug(t)}">${t}</h${hd[1].length}>`); i++; continue; }
    if (/^\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i].replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      out.push(`<table><thead><tr>${body[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const li = l.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(-|\d+\.)\s+(.*)$/);
        if (m) { items.push(m[2]); i++; continue; }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
        break;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||\s*(-|\d+\.)\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

export const LEGAL_PAGES: [string, string][] = [["terms", "Terms of Service"], ["privacy", "Privacy Policy"], ["acceptable-use", "Acceptable Use"], ["security", "Security"], ["subprocessors", "Subprocessors"], ["accessibility", "Accessibility"], ["dpa", "Data Processing Addendum"]];

/** A whole page (pure). */
export function legalPage(name: string, md: string, c: Company): string {
  const body = toHtml(fill(md, c));
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? name).trim();
  const draft = !c.reviewed_by_counsel ? `<p class="draft">Draft for review: not yet in effect.</p>` : "";
  const nav = LEGAL_PAGES.map(([n, t]) => `<a href="${n}.html"${n === name ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(c.product || "Terreno")}</title>
<style>:root{color-scheme:light dark;--fg:#1b1d1a;--muted:#5e625a;--line:#e3e0d8;--bg:#fbfaf7;--link:#0a64d8}@media(prefers-color-scheme:dark){:root{--fg:#ecebe6;--muted:#a19f97;--line:#34332f;--bg:#141413;--link:#6cb2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 'Terreno Sans','Plus Jakarta Sans',system-ui,"Segoe UI",Roboto,sans-serif}main{max-width:760px;margin:0 auto;padding:24px 20px 64px}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;padding:14px 20px;border-bottom:1px solid var(--line);max-width:760px;margin:0 auto}nav a{color:var(--muted);text-decoration:none}nav a[aria-current]{color:var(--fg);font-weight:600}
h1{font-size:30px;letter-spacing:-.01em;margin:16px 0 8px}h2{font-size:20px;margin:32px 0 8px}h3{font-size:16px;margin:24px 0 6px}a{color:var(--link)}code{font-size:.9em}
table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}.draft{padding:10px 14px;border-radius:10px;background:#fff4d6;color:#7a5200;font-weight:600}@media(prefers-color-scheme:dark){.draft{background:#3a2f12;color:#f5d58a}}
.meta{color:var(--muted);font-size:14px}footer{color:var(--muted);font-size:13px;margin-top:40px}</style></head>
<body><nav aria-label="Legal and trust"><a href="../">← ${esc(c.product || "Terreno")}</a>${nav}</nav><main>${draft}${body}<p class="meta">Effective: ${esc(c.effective_date || "[date]")}</p><footer>${esc(c.company || "[Company name]")} · ${esc(c.contact_email || "[contact email]")}</footer></main></body></html>`;
}
