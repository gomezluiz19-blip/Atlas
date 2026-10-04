// The Packages screen: paste a tracking number or a shipping email, see
// what's coming and when, open the carrier's page, and mark each one's step.
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { newId } from "../work/store";
import { carrierOf, findDate, findNumbers, packageSummary, readPackages, STATUS, trackUrl, writePackages, type Package, type Status } from "./packages";

const today = () => new Date().toISOString().slice(0, 10);

export function openPackages(ctx: WorkCtx, back?: () => void) {
  const ps = readPackages();
  const s = packageSummary(ps, today());
  const box = h("textarea", { class: "pro-url pk-paste", rows: 3, placeholder: "Paste a tracking number, or the whole shipping email" }) as HTMLTextAreaElement;
  const label = h("input", { class: "pro-url", placeholder: "What is it? (optional)" }) as HTMLInputElement;
  const found = h("p", { class: "muted small" });
  box.addEventListener("input", () => {
    const n = findNumbers(box.value), d = findDate(box.value, today());
    found.textContent = n.length ? `Found ${n.map((x) => `${x.carrier} ${x.number}`).join(", ")}${d ? `, arriving ${d}` : ""}.` : box.value.trim() ? "No tracking number found yet." : "";
  });
  const add = () => {
    const n = findNumbers(box.value), d = findDate(box.value, today());
    const single = box.value.trim().replace(/\s/g, "");
    const list = n.length ? n : carrierOf(single) ? [{ number: single.toUpperCase(), carrier: carrierOf(single)! }] : [];
    if (!list.length) { found.textContent = "That doesn't look like a tracking number. Check it, or paste the carrier's email."; return; }
    const all = readPackages();
    for (const x of list) if (!all.some((p) => p.number === x.number)) all.push({ id: newId(), label: label.value.trim() || `${x.carrier} parcel`, number: x.number, carrier: x.carrier, status: "shipped", eta: d, added: today() });
    writePackages(all);
    openPackages(ctx, back);
  };
  const open = ps.filter((p) => p.status !== "delivered").sort((a, b) => (a.eta ?? "9").localeCompare(b.eta ?? "9"));
  const done = ps.filter((p) => p.status === "delivered");
  const set = (p: Package, patch: Partial<Package>) => { writePackages(readPackages().map((x) => (x.id === p.id ? { ...x, ...patch } : x))); openPackages(ctx, back); };
  const card = (p: Package) => h("div", { class: "pk-card", style: `--c:${STATUS[p.status].color}` },
    h("div", { class: "pk-head" }, h("strong", {}, p.label), h("span", { class: "pk-status" }, STATUS[p.status].label)),
    h("p", { class: "muted small" }, `${p.carrier} · ${p.number}${p.eta ? ` · ${p.eta === today() ? "today" : `due ${p.eta}`}` : ""}`),
    h("div", { class: "pk-steps" }, ...(["shipped", "out", "delivered"] as Status[]).map((st) => h("button", { class: "chip" + (p.status === st ? " on" : ""), style: p.status === st ? `--c:${STATUS[st].color}` : "", onclick: () => set(p, { status: st }) }, STATUS[st].label)),
      h("button", { class: "chip" + (p.status === "problem" ? " on" : ""), onclick: () => set(p, { status: p.status === "problem" ? "shipped" : "problem" }) }, "Problem")),
    h("div", { class: "row" },
      h("a", { class: "pill-btn", href: trackUrl(p.carrier, p.number), target: "_blank", rel: "noopener" }, `Track on ${p.carrier === "Post" ? "the post" : p.carrier} ↗`),
      h("input", { type: "date", class: "pro-url pk-date", value: p.eta ?? "", "aria-label": "Expected", onchange: (e: Event) => set(p, { eta: (e.target as HTMLInputElement).value || undefined }) }),
      h("button", { class: "link-btn danger", onclick: () => { writePackages(readPackages().filter((x) => x.id !== p.id)); openPackages(ctx, back); } }, "Remove")));
  ctx.show("Packages", back ?? ctx.home,
    h("p", { class: "muted small" }, s.coming ? `${s.coming} on the way${s.today ? `, ${s.today} arriving today` : ""}${s.problems ? `, ${s.problems} with a problem` : ""}.` : "Nothing on the way."),
    box, label, found,
    h("button", { class: "primary-btn", onclick: add }, "Add"),
    ...open.map(card),
    done.length ? h("details", {}, h("summary", { class: "group-title" }, `Delivered · ${done.length}`), ...done.map(card)) : "",
    h("p", { class: "muted small" }, "Terreno knows the carrier from the number and links to its tracking page. Carriers only share live tracking with their own accounts, so set the step and the date here (or paste the next email)."));
}
