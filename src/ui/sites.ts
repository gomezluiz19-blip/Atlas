// "Places to start": a theme's curated collections as chips over a list.
import type { SiteCollection, Site } from "../content/sites";
import { h } from "./dom";

export function siteBrowser(collections: SiteCollection[], onPick: (s: Site) => void, opts: { color?: string; title?: string } = {}): HTMLElement {
  let active = 0;
  const list = h("div", { class: "list" });
  const chips = h("div", { class: "chips", role: "radiogroup", "aria-label": "Collections" });
  const row = (site: Site) =>
    h("button", { class: "list-row curated-row", onclick: () => onPick(site) },
      h("span", { class: "site-dot", style: opts.color ? `--c:${opts.color}` : "" }),
      h("span", { class: "list-text" },
        h("span", { class: "list-title" }, site.name, h("span", { class: "site-where" }, site.where)),
        h("span", { class: "list-sub" }, site.why)),
      h("span", { class: "chev", html: "&rsaquo;" }));
  const render = () => {
    chips.replaceChildren(
      ...collections.map((c, i) =>
        h("button", { class: "chip", role: "radio", "aria-checked": String(i === active), onclick: () => { active = i; render(); } }, c.title)));
    list.replaceChildren(...collections[active].sites.map(row));
  };
  render();
  return h("section", { class: "group" },
    h("h2", { class: "group-title" }, opts.title ?? "Places to start"),
    collections.length > 1 ? chips : "",
    list);
}
