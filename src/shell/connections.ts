// Under every view of a place: where to go next (another view of the same place, or a layer added to the map
// while you stay where you are), from content/links.ts.
import type { App } from "../app";
import { LINKS } from "../content/links";
import { venueOfPlace } from "../place/venue";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";

export const connections = (app: App) => (themeId: string, subtabId: string): HTMLElement | null => {
  // A venue's card ends with every theme, one tap each; these would repeat it.
  if (themeId === "explore" && venueOfPlace(app.place)) return null;
  const links = LINKS[`${themeId}/${subtabId}`];
  if (!links?.length) return null;
  const rows = links.map((l) => {
    if (l.to) {
      const [tid, sid] = l.to;
      const th = app.themes.find((x) => x.id === tid);
      const sub = th?.subtabs.find((s) => s.id === sid);
      if (!th || !sub) return null;
      return h("button", { class: "list-row link-row", onclick: () => { app.setTheme(tid, sid); app.sheet.body.scrollTop = 0; } },
        h("span", { class: "link-icon", style: `--c:${th.color}`, html: th.icon }),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.label), h("span", { class: "list-sub" }, `${th.label} › ${sub.label}`)),
        h("span", { class: "chev", html: "&rsaquo;" }));
    }
    const act = l.action ? app.actions.get(l.action) : undefined;
    if (!act) return null;
    const on = act.isOn?.() ?? false;
    const btn = h("button", { class: "list-row link-row", disabled: on, onclick: () => {
      act.run();
      btn.disabled = true;
      btn.querySelector(".list-sub")!.textContent = "On the map";
    } },
      h("span", { class: "link-icon add", html: icons.layers }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.label), h("span", { class: "list-sub" }, on ? "On the map" : "Adds a layer; you stay here")),
      h("span", { class: "chev", html: on ? "✓" : "+" }));
    return btn;
  }).filter((r): r is HTMLButtonElement => r !== null);
  return rows.length ? h("section", { class: "group connected" }, h("h2", { class: "group-title" }, "Connected"), h("div", { class: "list" }, ...rows)) : null;
};
