// The frame around the map: one dock at the bottom, big and plain, with four buttons: Search, Navigate, Me and
// ＋. Each opens as a stage (stage.ts): the map bubble becomes a sheet with a small mark at the top, four big
// playful icons across the middle, and a small field at the bottom. The person picks what they're after first
// (how they're going, what they're looking for, which way in), and the details follow.
import type { App, Place, Theme } from "../app";
import { gettingThere } from "../place/venueCard";
import { appleDirections, googleDirections } from "../place/around";
import { taxiOptions } from "../taxi/ui";
import { lastTravel, rememberTravel, TRAVEL, type TravelChoice } from "./travelModes";
import { h } from "./dom";
import { icons } from "./icons";
import { flyToPlace, geocode } from "./search";
import { choose, stageArt, stageMore, stageView, type StageItem } from "./stage";
import { savedSpots } from "../myplaces/saved";
import { loadList } from "../util/storage";

interface PlusItem { label: string; sub?: string; icon: string; color?: string; run: () => void }
type StageKind = "nav" | "search" | "plus";

const NAV = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.2 20 4l-7.2 16-2-6.8z"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

export function createChrome(app: App, opts: {
  search: HTMLElement;
  me: HTMLElement;
  primary: PlusItem[];
  tools: PlusItem[];
}) {
  // ---- The stage every button opens into ----
  const stage = h("div", { class: "stage-panel", role: "dialog", hidden: true });
  // The search box stays in the page (other parts reach it by id); between searches it waits here, hidden.
  const parking = h("div", { class: "search-parking", hidden: true }, opts.search);
  let open: StageKind | null = null;
  const btnOf = (k: StageKind) => (k === "nav" ? navBtn : k === "search" ? searchBtn : plusBtn);
  const closeStage = () => {
    if (open) btnOf(open).setAttribute("aria-expanded", "false");
    open = null;
    stage.hidden = true;
    document.body.classList.remove("stage-open");
    parking.append(opts.search);
  };
  const show = (k: StageKind, draw: () => void) => {
    if (open === k) { closeStage(); return; }
    if (open) btnOf(open).setAttribute("aria-expanded", "false");
    navPanel.hidden = true;
    open = k;
    parking.append(opts.search);
    stage.classList.remove("typing");
    draw();
    stage.dataset.kind = k;
    stage.hidden = false;
    document.body.classList.add("stage-open");
    btnOf(k).setAttribute("aria-expanded", "true");
  };
  /** A small list of choices that rises above a stage's field as you type. */
  const hitsList = () => h("div", { class: "stage-hits list" });

  // ---- Search: what are you looking for? ----
  const input = () => opts.search.querySelector("input") as HTMLInputElement | null;
  const lookFor = (q: string) => { const f = input(); if (!f) return; f.value = q; f.focus({ preventScroll: true }); f.dispatchEvent(new Event("input", { bubbles: true })); };
  const drawSearch = () => {
    const items: StageItem[] = [
      { id: "food", label: "Food", art: "food", run: () => lookFor("restaurant") },
      { id: "coffee", label: "Coffee", art: "coffee", run: () => lookFor("cafe") },
      { id: "parks", label: "Parks", art: "parks", run: () => lookFor("park") },
      { id: "stay", label: "A bed", art: "stay", run: () => lookFor("hotel") },
    ];
    stage.replaceChildren(...stageView({
      mark: "search", title: "Look for", art: stageArt(items), close: closeStage,
      extra: [stageMore([{ label: "Shops", run: () => lookFor("shop") }, { label: "Fuel", run: () => lookFor("fuel") }, { label: "Pharmacy", run: () => lookFor("pharmacy") }])],
      field: opts.search,
    }));
  };
  const openSearch = (want = open !== "search") => {
    if (!want) { if (open === "search") closeStage(); return; }
    if (open !== "search") show("search", drawSearch);
    setTimeout(() => input()?.focus({ preventScroll: true }), 30);
  };
  const searchBtn = h("button", { class: "dock-btn", "data-haptic": "select", "data-label": "Search", "aria-label": "Search", title: "Search (/)", "aria-expanded": "false", html: icons.search, onclick: () => openSearch() }) as HTMLButtonElement;
  // A place picked from the results: the stage gives the map back.
  stage.addEventListener("click", (e) => { if (open === "search" && (e.target as HTMLElement).closest(".search-results [role=option], .search-results button, .search-results li")) setTimeout(closeStage, 0); });
  stage.addEventListener("keydown", (e) => { if (open === "search" && e.key === "Enter" && input()?.value.trim()) setTimeout(closeStage, 0); });
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "/" && !/input|textarea/i.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); openSearch(true); }
    if (e.key === "Escape") { closeStage(); navPanel.hidden = true; }
  });

  // ---- Navigate: how are you going? then where to ----
  const navPanel = h("div", { class: "popover nav-panel", role: "dialog", "aria-label": "The way there", hidden: true });
  let how: TravelChoice = lastTravel();

  const saved = (): { name: string; sub: string; lon: number; lat: number }[] => {
    const out: { name: string; sub: string; lon: number; lat: number }[] = [];
    for (const p of savedSpots()) out.push({ name: p.name, sub: p.kind === "home" ? "Home" : "My Place", lon: p.lon, lat: p.lat });
    for (const p of loadList<{ name: string; where: string; lon: number; lat: number }>("atlas.people.v1"))
      if (Number.isFinite(p.lon)) out.push({ name: p.name, sub: p.where.split(",")[0], lon: p.lon, lat: p.lat });
    return out.slice(0, 8);
  };

  /** A destination chosen: it goes on the map, and a small panel gives the way there, by the way you chose. */
  const goTo = (d: { name: string; sub?: string; lon: number; lat: number }) => {
    closeStage();
    void flyToPlace(app.globe, { name: d.name, lon: d.lon, lat: d.lat, radius: 1200 });
    app.select({ lon: d.lon, lat: d.lat, height: 0 }, { title: d.name, context: d.sub ?? "" });
    const place: Place = { lon: d.lon, lat: d.lat, height: 0, name: { title: d.name, context: d.sub ?? "" } };
    const way = gettingThere(app, place, d.name);
    const t = TRAVEL[how];
    // The train hands over to a transit planner; a taxi to the local firms and ranks, with rideshare alongside
    // (and the drive drawn here).
    const handOff = how === "train"
      ? h("div", { class: "nav-handoff", style: `--c:${t.color}` }, h("p", {}, "Trains, buses and their times"),
        h("div", { class: "nav-handoff-row" },
          h("a", { class: "primary-btn", href: googleDirections(place, "transit"), target: "_blank", rel: "noopener" }, "Google Maps"),
          h("a", { class: "pill-btn", href: appleDirections(place, d.name, "transit"), target: "_blank", rel: "noopener" }, "Apple Maps")))
      : how === "taxi" ? taxiOptions(app, place, d.name) : "";
    navPanel.replaceChildren(
      h("div", { class: "nav-head" }, h("button", { class: "icon-btn", "aria-label": "Back", html: "&larr;", onclick: () => { navPanel.hidden = true; show("nav", drawNav); } }),
        h("span", { class: "nav-head-ico", style: `--c:${t.color}`, html: t.icon }),
        h("div", {}, h("small", {}, `${t.label} to`), h("strong", {}, d.name))),
      handOff, way.el);
    navPanel.hidden = false;
    // With a hand-off on top (the taxis, the trains), that stays in view; the drive is drawn below it.
    way.directions(t.route ?? "walk", !handOff);
  };

  function drawNav() {
    const field = h("input", { class: "stage-input", type: "search", autocomplete: "off" }) as HTMLInputElement;
    const label = () => { const p = `Where to, ${TRAVEL[how].doing}?`; field.placeholder = p; field.setAttribute("aria-label", p); };
    label();
    const hits = hitsList();
    const row = (d: { name: string; sub: string; lon: number; lat: number }, icon = icons.pin) =>
      h("button", { class: "list-row", onclick: () => goTo(d) }, h("span", { class: "nav-ico", html: icon }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, d.name), h("span", { class: "list-sub" }, d.sub)));
    const mine = saved();
    const showMine = () => hits.replaceChildren(
      h("button", { class: "list-row nav-here", onclick: () => {
        navigator.geolocation?.getCurrentPosition((p) => { closeStage(); void flyToPlace(app.globe, { name: "You", lon: p.coords.longitude, lat: p.coords.latitude, radius: 1500 }); },
          () => app.toast("Couldn't get your location. Allow it in the browser.", 3500), { timeout: 8000 });
      } }, h("span", { class: "nav-ico here", html: NAV }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, "My location"), h("span", { class: "list-sub" }, "Centre the map on you"))),
      ...mine.map((d) => row(d, d.sub === "Home" ? icons.home : icons.pin)));
    let t = 0;
    field.oninput = () => {
      clearTimeout(t);
      const q = field.value.trim();
      if (q.length < 2) { showMine(); return; }
      t = window.setTimeout(() => void geocode(q).then((rs) => hits.replaceChildren(...rs.slice(0, 6).map((r) => row({ name: r.name, sub: r.detail ?? "", lon: r.lon, lat: r.lat })))).catch(() => {}), 300);
    };
    field.onfocus = () => { stage.classList.add("typing"); if (!field.value) showMine(); };
    field.onblur = () => setTimeout(() => { if (!stage.contains(document.activeElement)) stage.classList.remove("typing"); }, 150);
    const pick = (c: TravelChoice) => { how = c; rememberTravel(c); label(); choose(art, c); more.querySelectorAll<HTMLElement>("[aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === TRAVEL[c].label))); field.focus({ preventScroll: true }); };
    const art = stageArt((["walk", "drive", "train", "taxi"] as TravelChoice[]).map((c) => ({ id: c, label: TRAVEL[c].label, art: c, run: () => pick(c) })), how);
    const more = stageMore([
      { label: TRAVEL.bike.label, on: how === "bike", run: () => pick("bike") },
      { label: TRAVEL.fly.label, run: () => { closeStage(); app.actions.get("travel:plan")?.run(); } },
      { label: TRAVEL.guide.label, run: () => { closeStage(); app.actions.get("wayfind:guide")?.run(); } },
    ]);
    stage.replaceChildren(...stageView({ mark: "navigate", title: "How are you going?", art, close: closeStage, extra: [more], field: h("div", { class: "stage-field-box" }, hits, field) }));
  }
  const navBtn = h("button", { class: "dock-btn", "data-haptic": "select", "data-label": "Navigate", "aria-label": "Navigate", title: "Navigate", "aria-expanded": "false", html: NAV, onclick: () => show("nav", drawNav) }) as HTMLButtonElement;

  // ---- ＋: which way in? ----
  /** Every view and tool, to find by name from the field. */
  const everything = () => {
    const { main, more } = app.views();
    return [
      ...[...main, ...more].map((t: Theme) => ({ label: t.label, sub: "View", icon: t.icon, run: () => { closeStage(); if (app.theme?.id !== t.id) app.setTheme(t.id); else app.sheet.el.classList.remove("collapsed"); } })),
      ...opts.tools.map((x) => ({ label: x.label, sub: x.sub ?? "Tool", icon: x.icon, run: () => { closeStage(); x.run(); } })),
    ];
  };
  const drawPlus = () => {
    const viewsRow = h("div", { class: "stage-more stage-views", hidden: true }, ...[...app.views().main, ...app.views().more].map((t) =>
      h("button", { class: "stage-more-btn", "aria-pressed": String(app.theme?.id === t.id), style: `--c:${t.color}`, onclick: () => { closeStage(); if (app.theme?.id !== t.id) app.setTheme(t.id); else app.sheet.el.classList.remove("collapsed"); } }, t.tabLabel ?? t.label)));
    const [explore, create, work] = opts.primary;
    const art = stageArt([
      { id: "explore", label: explore?.label ?? "Explore", art: "explore", run: () => { closeStage(); explore?.run(); } },
      { id: "create", label: create?.label ?? "Create", art: "create", run: () => { closeStage(); create?.run(); } },
      { id: "work", label: work?.label ?? "Work", art: "work", run: () => { closeStage(); work?.run(); } },
      { id: "views", label: "Views", art: "views", run: () => { viewsRow.hidden = !viewsRow.hidden; } },
    ]);
    const field = h("input", { class: "stage-input", type: "search", autocomplete: "off", placeholder: "Find a view or a tool", "aria-label": "Find a view or a tool" }) as HTMLInputElement;
    const hits = hitsList();
    const list = (q: string) => hits.replaceChildren(...everything().filter((x) => !q || `${x.label} ${x.sub}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map((x) =>
      h("button", { class: "list-row", onclick: x.run }, h("span", { class: "nav-ico", html: x.icon }), h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.label), h("span", { class: "list-sub" }, x.sub)))));
    field.oninput = () => list(field.value.trim());
    field.onfocus = () => { stage.classList.add("typing"); list(field.value.trim()); };
    field.onblur = () => setTimeout(() => { if (!stage.contains(document.activeElement)) stage.classList.remove("typing"); }, 150);
    stage.replaceChildren(...stageView({ mark: "more", title: "Way in", art, close: closeStage, extra: [viewsRow], field: h("div", { class: "stage-field-box" }, hits, field) }));
  };
  const plusBtn = h("button", { class: "dock-btn dock-plus", "data-haptic": "select", "data-label": "More", "aria-label": "More: Explore, Create, Work, the views and tools", title: "Explore, Create, Work, views", "aria-expanded": "false", html: PLUS, onclick: () => show("plus", drawPlus) }) as HTMLButtonElement;

  document.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (!navPanel.hidden && !navPanel.contains(t) && !navBtn.contains(t) && !t.closest?.(".search-results")) navPanel.hidden = true;
  });
  // Me opens its own stage (social/account.ts); the others give way to it.
  opts.me.addEventListener("click", () => { closeStage(); navPanel.hidden = true; });

  // The account button redraws itself on sign-in, so its label is an attribute the dock's CSS shows.
  opts.me.classList.add("dock-btn"); opts.me.dataset.haptic = "select";
  opts.me.dataset.label = "Me";
  const dock = h("nav", { class: "dock", "aria-label": "Terreno" }, parking, h("div", { class: "dock-row" }, searchBtn, navBtn, opts.me, plusBtn));
  return { dock, stage, navPanel, openSearch, openNavigate: () => { if (open !== "nav") show("nav", drawNav); } };
}
