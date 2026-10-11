// The frame around the map: one dock at the bottom, big and plain, with four buttons: Search, Navigate, Me and
// ＋. Each opens on the person first: Navigate asks how you're going (big tiles: walk, drive, train, taxi, more)
// before where; Search offers what people look for before the field; ＋ holds Explore, Create and Work, then the
// views (People, Nature, Countries, and more), switched like map layers, then the tools.
import type { App, Place, Theme } from "../app";
import { gettingThere } from "../place/venueCard";
import { appleDirections, googleDirections, rideLinks } from "../place/around";
import { lastTravel, MAIN, MORE, rememberTravel, TRAVEL, type TravelChoice } from "./travelModes";
import { h } from "./dom";
import { icons } from "./icons";
import { flyToPlace, geocode } from "./search";
import { morphBetween } from "./motion";
import { savedSpots } from "../myplaces/saved";
import { loadList } from "../util/storage";

interface PlusItem { label: string; sub?: string; icon: string; color?: string; run: () => void }

const NAV = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.2 20 4l-7.2 16-2-6.8z"/></svg>';
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

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
    // At once, not as a morph: the first keystroke must land in the field. It rises out of the dock (CSS).
    document.body.classList.toggle("search-open", open);
    searchBtn.setAttribute("aria-expanded", String(open));
    if (open) input()?.focus({ preventScroll: true });
  };
  // What people look for, as big tiles above the field: one tap searches near the map's centre.
  const ico = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const QUICK: [string, string, string, string][] = [
    ["Food", "restaurant", "var(--terra)", icons.fork],
    ["Coffee", "cafe", "var(--ochre)", ico('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>')],
    ["Parks", "park", "var(--sage)", icons.tree],
    ["Shops", "shop", "var(--cobalt)", icons.tag],
    ["Stay", "hotel", "var(--teal)", ico('<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>')],
    ["Fuel", "fuel", "var(--umber)", ico('<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-3-3"/>')],
  ];
  const quick = h("div", { class: "search-quick", role: "group", "aria-label": "Look for" }, ...QUICK.map(([label, q, c, icon]) =>
    h("button", { class: "quick-tile", style: `--c:${c}`, onmousedown: (e: Event) => e.preventDefault(), onclick: () => {
      const f = input();
      if (!f) return;
      f.value = q; f.focus({ preventScroll: true }); f.dispatchEvent(new Event("input", { bubbles: true }));
    } }, h("span", { class: "quick-dot", html: icon }), h("span", {}, label))));
  const searchBtn = h("button", { class: "dock-btn", "data-label": "Search", "aria-label": "Search", title: "Search (/)", "aria-expanded": "false", html: icons.search, onclick: () => openSearch() }) as HTMLButtonElement;
  opts.search.addEventListener("focusout", () => setTimeout(() => { if (!opts.search.contains(document.activeElement) && !input()?.value) openSearch(false); }, 150));
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "/" && !/input|textarea/i.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); openSearch(true); }
    if (e.key === "Escape") { if (document.body.classList.contains("search-open")) openSearch(false); close(); }
  });

  // ---- Navigate: where to, and the way there ----
  const navPanel = h("div", { class: "popover nav-panel", role: "dialog", "aria-label": "Navigate", hidden: true });
  const navBtn = h("button", { class: "dock-btn", "data-label": "Navigate", "aria-label": "Navigate", title: "Navigate", "aria-expanded": "false", html: NAV, onclick: () => {
    const open = navPanel.hidden;
    close(); openSearch(false);
    if (open) morphBetween(navBtn, () => navPanel, "nav", () => { drawNav(); navPanel.hidden = false; navBtn.setAttribute("aria-expanded", "true"); setTimeout(() => navPanel.querySelector<HTMLElement>(".nav-mode[aria-checked=true]")?.focus({ preventScroll: true }), 30); });
  } }) as HTMLButtonElement;

  const saved = (): { name: string; sub: string; lon: number; lat: number }[] => {
    const out: { name: string; sub: string; lon: number; lat: number }[] = [];
    for (const p of savedSpots()) out.push({ name: p.name, sub: p.kind === "home" ? "Home" : "My Place", lon: p.lon, lat: p.lat });
    for (const p of loadList<{ name: string; where: string; lon: number; lat: number }>("atlas.people.v1"))
      if (Number.isFinite(p.lon)) out.push({ name: p.name, sub: p.where.split(",")[0], lon: p.lon, lat: p.lat });
    return out.slice(0, 8);
  };

  /** How you're going: chosen first, walking until you pick another. */
  let how: TravelChoice = lastTravel();

  /** A destination chosen: it goes on the map, and the panel becomes the way there, by the way you chose. */
  const goTo = (d: { name: string; sub?: string; lon: number; lat: number }) => {
    void flyToPlace(app.globe, { name: d.name, lon: d.lon, lat: d.lat, radius: 1200 });
    app.select({ lon: d.lon, lat: d.lat, height: 0 }, { title: d.name, context: d.sub ?? "" });
    const place: Place = { lon: d.lon, lat: d.lat, height: 0, name: { title: d.name, context: d.sub ?? "" } };
    const way = gettingThere(app, place, d.name);
    const t = TRAVEL[how];
    // The train hands over to a transit planner; a taxi to a ride app (with the drive drawn here alongside).
    const handOff = how === "train"
      ? h("div", { class: "nav-handoff", style: `--c:${t.color}` }, h("p", {}, "Trains, buses and their times"),
        h("div", { class: "nav-handoff-row" },
          h("a", { class: "primary-btn", href: googleDirections(place, "transit"), target: "_blank", rel: "noopener" }, "Google Maps"),
          h("a", { class: "pill-btn", href: appleDirections(place, d.name, "transit"), target: "_blank", rel: "noopener" }, "Apple Maps")))
      : how === "taxi"
        ? h("div", { class: "nav-handoff", style: `--c:${t.color}` }, h("p", {}, "Get a ride there"),
          h("div", { class: "nav-handoff-row" }, ...rideLinks(place, d.name).map((r, i) => h("a", { class: i ? "pill-btn" : "primary-btn", href: r.href, target: "_blank", rel: "noopener" }, r.label))))
        : "";
    navPanel.replaceChildren(
      h("div", { class: "nav-head" }, h("button", { class: "icon-btn", "aria-label": "Back", html: "&larr;", onclick: drawNav }),
        h("span", { class: "nav-head-ico", style: `--c:${t.color}`, html: t.icon }),
        h("div", {}, h("small", {}, `${t.label} to`), h("strong", {}, d.name))),
      handOff, way.el);
    way.directions(t.route ?? "walk");
  };

  function drawNav() {
    const field = h("input", { class: "po-input nav-input", autocomplete: "off" }) as HTMLInputElement;
    const label = () => { const p = `Where to, ${TRAVEL[how].doing}?`; field.placeholder = p; field.setAttribute("aria-label", p); };
    label();
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
    // The ways of going, big: the person first, then the place.
    const tile = (c: TravelChoice, big: boolean) => h("button", {
      class: big ? "nav-mode" : "nav-mode-chip", role: "radio", "aria-checked": String(how === c), style: `--c:${TRAVEL[c].color}`,
      onclick: () => {
        if (c === "fly") { close(); app.actions.get("travel:plan")?.run(); return; }
        if (c === "guide") { close(); app.actions.get("wayfind:guide")?.run(); return; }
        how = c; rememberTravel(c); label();
        navPanel.querySelectorAll<HTMLElement>("[role=radio]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === c)));
        field.focus({ preventScroll: true });
      },
      "data-c": c,
    }, h("span", { class: "nav-mode-ico", html: TRAVEL[c].icon }), h("span", {}, TRAVEL[c].label));
    const more = h("div", { class: "nav-more", hidden: !MORE.includes(how) }, ...MORE.map((c) => tile(c, false)));
    const moreBtn = h("button", { class: "nav-mode more", "aria-expanded": String(!more.hidden), onclick: () => { more.hidden = !more.hidden; moreBtn.setAttribute("aria-expanded", String(!more.hidden)); } },
      h("span", { class: "nav-mode-ico", html: DOTS }), h("span", {}, "More"));
    const modes = h("div", { class: "nav-modes", role: "radiogroup", "aria-label": "How are you going?" }, ...MAIN.map((c) => tile(c, true)), moreBtn);
    const mine = saved();
    navPanel.replaceChildren(
      h("p", { class: "nav-title" }, "How are you going?"),
      modes, more,
      h("div", { class: "nav-where" }, field, hits),
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
  /** A view, as a tile (the main three) or a chip (the rest); the one you're on is marked. */
  const view = (t: Theme, big: boolean) => h("button", {
    class: big ? "plus-view" : "plus-chip", role: "menuitemradio", "aria-checked": String(app.theme?.id === t.id), style: `--c:${t.color}`,
    onclick: () => { close(); if (app.theme?.id !== t.id) app.setTheme(t.id); else app.sheet.el.classList.remove("collapsed"); },
  }, h("span", { class: "plus-ico", html: t.icon }), h("span", {}, big ? t.label : t.tabLabel ?? t.label));
  const views = () => {
    const { main, more } = app.views();
    return [
      h("p", { class: "plus-head" }, "Views"),
      h("div", { class: "plus-views" }, ...main.map((t) => view(t, true))),
      h("div", { class: "plus-chips" }, ...more.map((t) => view(t, false))),
    ];
  };
  const plusBtn = h("button", { class: "dock-btn dock-plus", "data-label": "More", "aria-label": "More: Explore, Create, Work, the views and tools", title: "Explore, Create, Work, views", "aria-expanded": "false", html: PLUS, onclick: () => {
    const open = plusMenu.hidden;
    close(); openSearch(false);
    if (!open) return;
    // ＋ grows into its menu: the three ways in, then the views, then the tools.
    morphBetween(plusBtn, () => plusMenu, "plus", () => {
      plusMenu.replaceChildren(h("div", { class: "plus-row" }, ...opts.primary.map((x) => item(x, true))), ...views(), h("div", { class: "plus-tools" }, ...opts.tools.map((x) => item(x))));
      plusMenu.hidden = false; plusBtn.setAttribute("aria-expanded", "true");
    });
  } }) as HTMLButtonElement;

  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (!plusMenu.hidden && !plusMenu.contains(t) && !plusBtn.contains(t)) { plusMenu.hidden = true; plusBtn.setAttribute("aria-expanded", "false"); }
    if (!navPanel.hidden && !navPanel.contains(t) && !navBtn.contains(t) && !(t as HTMLElement).closest?.(".search-results")) { navPanel.hidden = true; navBtn.setAttribute("aria-expanded", "false"); }
  });

  // The account button redraws itself on sign-in, so its label is an attribute the dock's CSS shows.
  opts.me.classList.add("dock-btn");
  opts.me.dataset.label = "Me";
  // Search opens just above the dock, its suggestions rising from it.
  const dock = h("nav", { class: "dock", "aria-label": "Terreno" },
    h("div", { class: "dock-search" }, quick, opts.search),
    h("div", { class: "dock-row" }, searchBtn, navBtn, opts.me, plusBtn));
  return { dock, plusMenu, navPanel, openSearch, openNavigate: () => navBtn.click() };
}
