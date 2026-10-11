// The frame around the map, kept to four buttons: Search, Navigate, Me, and a small ＋ that opens everything
// else (Explore, Create, Work, then the tools: Pulse, Time, map style, a TV, views). The map is the page.
import type { App, Place } from "../app";
import { gettingThere } from "../place/venueCard";
import { h } from "./dom";
import { icons } from "./icons";
import { flyToPlace, geocode } from "./search";
import { morphBetween } from "./motion";
import { savedSpots } from "../myplaces/saved";
import { loadList } from "../util/storage";

interface PlusItem { label: string; sub?: string; icon: string; color?: string; run: () => void }

const NAV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.2 20 4l-7.2 16-2-6.8z"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

export function createChrome(app: App, opts: {
  search: HTMLElement;
  me: HTMLElement;
  primary: PlusItem[];
  tools: PlusItem[];
}) {
  const close = () => { plusMenu.hidden = true; navPanel.hidden = true; plusBtn.setAttribute("aria-expanded", "false"); navBtn.setAttribute("aria-expanded", "false"); };

  // ---- Search: an icon that opens the field ----
  const input = () => opts.search.querySelector("input") as HTMLInputElement | null;
  const openSearch = (open = !document.body.classList.contains("search-open")) => {
    close();
    const was = document.body.classList.contains("search-open");
    const apply = () => {
      document.body.classList.toggle("search-open", open);
      searchBtn.setAttribute("aria-expanded", String(open));
    };
    // The icon opens out into the field.
    if (open && !was) morphBetween(searchBtn, () => opts.search, "search", apply); else apply();
    if (open) setTimeout(() => input()?.focus(), 30);
  };
  const searchBtn = h("button", { class: "round-btn chrome-btn", "aria-label": "Search", title: "Search (/)", "aria-expanded": "false", html: icons.search, onclick: () => openSearch() }) as HTMLButtonElement;
  opts.search.addEventListener("focusout", () => setTimeout(() => { if (!opts.search.contains(document.activeElement) && !input()?.value) openSearch(false); }, 150));
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "/" && !/input|textarea/i.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); openSearch(true); }
    if (e.key === "Escape") { if (document.body.classList.contains("search-open")) openSearch(false); close(); }
  });

  // ---- Navigate: where to, and the way there ----
  const navPanel = h("div", { class: "popover nav-panel", role: "dialog", "aria-label": "Navigate", hidden: true });
  const navBtn = h("button", { class: "round-btn chrome-btn", "aria-label": "Navigate", title: "Navigate", "aria-expanded": "false", html: NAV, onclick: () => {
    const open = navPanel.hidden;
    close(); openSearch(false);
    if (open) morphBetween(navBtn, () => navPanel, "nav", () => { drawNav(); navPanel.hidden = false; navBtn.setAttribute("aria-expanded", "true"); setTimeout(() => navPanel.querySelector("input")?.focus(), 30); });
  } }) as HTMLButtonElement;

  const saved = (): { name: string; sub: string; lon: number; lat: number }[] => {
    const out: { name: string; sub: string; lon: number; lat: number }[] = [];
    for (const p of savedSpots()) out.push({ name: p.name, sub: p.kind === "home" ? "Home" : "My Place", lon: p.lon, lat: p.lat });
    for (const p of loadList<{ name: string; where: string; lon: number; lat: number }>("atlas.people.v1"))
      if (Number.isFinite(p.lon)) out.push({ name: p.name, sub: p.where.split(",")[0], lon: p.lon, lat: p.lat });
    return out.slice(0, 8);
  };

  /** A destination chosen: it goes on the map, and the panel becomes the way there. */
  const goTo = (d: { name: string; sub?: string; lon: number; lat: number }) => {
    void flyToPlace(app.globe, { name: d.name, lon: d.lon, lat: d.lat, radius: 1200 });
    app.select({ lon: d.lon, lat: d.lat, height: 0 }, { title: d.name, context: d.sub ?? "" });
    const place: Place = { lon: d.lon, lat: d.lat, height: 0, name: { title: d.name, context: d.sub ?? "" } };
    const way = gettingThere(app, place, d.name);
    navPanel.replaceChildren(
      h("div", { class: "nav-head" }, h("button", { class: "icon-btn", "aria-label": "Back", html: "&larr;", onclick: drawNav }), h("div", {}, h("small", {}, "Directions to"), h("strong", {}, d.name))),
      way.el);
    way.directions();
  };

  function drawNav() {
    const field = h("input", { class: "po-input nav-input", placeholder: "Where to?", autocomplete: "off", "aria-label": "Where to?" }) as HTMLInputElement;
    const hits = h("div", { class: "list nav-hits" });
    const row = (d: { name: string; sub: string; lon: number; lat: number }, icon = icons.pin) =>
      h("button", { class: "list-row", onclick: () => goTo(d) }, h("span", { class: "nav-ico", html: icon }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, d.name), h("span", { class: "list-sub" }, d.sub)));
    let t = 0;
    field.oninput = () => {
      clearTimeout(t);
      const q = field.value.trim();
      if (q.length < 2) { hits.replaceChildren(); return; }
      t = window.setTimeout(() => void geocode(q).then((rs) => hits.replaceChildren(...rs.slice(0, 6).map((r) => row({ name: r.name, sub: r.detail ?? "", lon: r.lon, lat: r.lat })))).catch(() => {}), 300);
    };
    const mine = saved();
    navPanel.replaceChildren(
      h("p", { class: "nav-title" }, "Navigate"),
      field, hits,
      h("button", { class: "list-row nav-here", onclick: () => {
        navigator.geolocation?.getCurrentPosition((p) => { close(); void flyToPlace(app.globe, { name: "You", lon: p.coords.longitude, lat: p.coords.latitude, radius: 1500 }); },
          () => app.toast("Couldn't get your location. Allow it in the browser.", 3500), { timeout: 8000 });
      } }, h("span", { class: "nav-ico here", html: NAV }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, "My location"), h("span", { class: "list-sub" }, "Centre the map on you"))),
      mine.length ? h("p", { class: "nav-sub" }, "Your places and people") : "",
      ...mine.map((d) => row(d, d.sub === "Home" ? icons.home : icons.pin)));
  }

  // ---- ＋: the rest of Terreno ----
  const plusMenu = h("div", { class: "popover plus-menu", role: "menu", hidden: true });
  const item = (x: PlusItem, big = false) => h("button", { class: big ? "plus-big" : "plus-item", role: "menuitem", style: x.color ? `--c:${x.color}` : "", onclick: () => { close(); x.run(); } },
    h("span", { class: "plus-ico", html: x.icon }), h("span", {}, h("strong", {}, x.label), x.sub ? h("small", {}, x.sub) : ""));
  const plusBtn = h("button", { class: "round-btn chrome-btn chrome-plus", "aria-label": "More: Explore, Create, Work and tools", title: "Explore, Create, Work", "aria-expanded": "false", html: PLUS, onclick: () => {
    const open = plusMenu.hidden;
    close(); openSearch(false);
    if (!open) return;
    // ＋ grows into its menu: the three ways in, then the tools.
    morphBetween(plusBtn, () => plusMenu, "plus", () => {
      plusMenu.replaceChildren(h("div", { class: "plus-row" }, ...opts.primary.map((x) => item(x, true))), h("div", { class: "plus-tools" }, ...opts.tools.map((x) => item(x))));
      plusMenu.hidden = false; plusBtn.setAttribute("aria-expanded", "true");
    });
  } }) as HTMLButtonElement;

  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (!plusMenu.hidden && !plusMenu.contains(t) && !plusBtn.contains(t)) { plusMenu.hidden = true; plusBtn.setAttribute("aria-expanded", "false"); }
    if (!navPanel.hidden && !navPanel.contains(t) && !navBtn.contains(t) && !(t as HTMLElement).closest?.(".search-results")) { navPanel.hidden = true; navBtn.setAttribute("aria-expanded", "false"); }
  });

  opts.me.classList.add("chrome-btn");
  const cluster = h("div", { class: "chrome" }, searchBtn, navBtn, opts.me, plusBtn);
  return { cluster, plusMenu, navPanel, openSearch, openNavigate: () => navBtn.click() };
}
