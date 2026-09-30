// App shell. The model is simple: tap anywhere to choose a place, pick a theme
// from the tab bar, and every subtab of that theme describes the chosen place.
import { Cartesian2, Cartesian3, Color, HeightReference, ScreenSpaceEventHandler, ScreenSpaceEventType, type Entity } from "cesium";
import { Canvas } from "./canvas";
import { reverseGeocode, type PlaceName } from "./data/geocode";
import { pickFeature, tapHandler } from "./globe/pickables";
import type { Globe } from "./globe/viewer";
import { Chart, type ChartData, type ChartOptions } from "./ui/chart";
import { formatDms } from "./data/locationParse";
import { formatLonLat, h } from "./ui/dom";
import { icons } from "./ui/icons";

export interface GeoPoint {
  lon: number;
  lat: number;
  height: number;
}

export interface Place extends GeoPoint {
  name?: PlaceName | null;
  /** Set when the place is a named feature (a label or map marker was tapped). */
  feature?: unknown;
  /** Its page address ("nile", "eiffel-tower~q243"), once known. */
  slug?: string;
}

/** An interactive analysis that renders into its own panel. */
export interface Tool {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  hint: string;
  activate(app: App): void;
  deactivate(): void;
  onClick?(p: GeoPoint): void;
  onMove?(p: GeoPoint | null): void;
  onCancel?(): void;
  /** True while the tool is waiting for more clicks on the globe (e.g. a line's end point). */
  wantsClicks?(): boolean;
  /** Its results stay on the map (the canvas) after you leave its subtab. */
  keepsOnMap?: boolean;
}

/** A panel that a tool writes its content into. */
export class Panel {
  readonly el = h("div", { class: "tool-panel", "aria-live": "polite" });
  show(_title: string, ...content: (Node | string)[]) {
    this.el.replaceChildren(...content);
  }
  hide() {}
}

/** The bottom drawer: holds a chart, or any custom view (e.g. a geologic section). */
export class Drawer {
  readonly el = h("section", { class: "drawer", hidden: true });
  readonly chart = new Chart();
  private title = h("h3", { class: "drawer-title" });
  private actions = h("div", { class: "drawer-actions" });
  private body = h("div", { class: "drawer-body" });
  onHide?: () => void;

  constructor() {
    const close = h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => this.hide() });
    this.el.append(h("header", { class: "drawer-head" }, this.title, this.actions, close), this.body);
  }
  show(title: string, data: ChartData, opts: ChartOptions, actions: HTMLElement[] = []) {
    this.open(title, this.chart.el, actions, false);
    this.chart.render(data, opts);
  }
  showCustom(title: string, content: HTMLElement, actions: HTMLElement[] = [], tall = true) {
    this.open(title, content, actions, tall);
  }
  private open(title: string, content: HTMLElement, actions: HTMLElement[], tall: boolean) {
    this.onHide?.();
    this.onHide = undefined;
    this.title.textContent = title;
    this.actions.replaceChildren(...actions);
    this.body.replaceChildren(content);
    this.el.classList.toggle("tall", tall);
    this.el.hidden = false;
    document.body.classList.add("has-drawer");
    document.body.classList.toggle("has-tall-drawer", tall);
  }
  hide() {
    this.el.hidden = true;
    document.body.classList.remove("has-drawer", "has-tall-drawer");
    this.onHide?.();
    this.onHide = undefined;
  }
}

export interface SubtabContext {
  app: App;
  place: Place;
  /** Where the subtab renders. Replaced on every visit. */
  body: HTMLElement;
}

export interface Subtab {
  id: string;
  label: string;
  render(ctx: SubtabContext): void;
  leave?(app: App): void;
}

export interface Theme {
  id: string;
  label: string;
  icon: string;
  /** Accent colour for this theme (CSS). */
  color: string;
  /** One sentence shown before a place is chosen. */
  intro: string;
  subtabs: Subtab[];
  enter?(app: App): void;
  leave?(app: App): void;
  /** Content before a place is chosen; defaults to the app's empty state. */
  renderEmpty?(app: App, body: HTMLElement): void;
  /** A topic: kept off the main bar, under "More". */
  more?: boolean;
}

/** The place card: header, theme subtabs and content. */
class Sheet {
  readonly el = h("aside", { class: "sheet", "aria-label": "Place details" });
  readonly title = h("h1", { class: "sheet-title" });
  readonly subtitle = h("p", { class: "sheet-subtitle" });
  readonly tabs = h("div", { class: "segmented", role: "tablist" });
  readonly body = h("div", { class: "sheet-body", role: "tabpanel" });
  readonly grip = h("button", { class: "sheet-grip", "aria-label": "Expand or collapse" });
  readonly close = h("button", { class: "icon-btn close-btn", "aria-label": "Clear place", html: icons.close });
  readonly share = h("button", { class: "icon-btn close-btn", "aria-label": "Copy or share this place", "aria-expanded": "false", html: icons.share });
  readonly shareMenu = h("div", { class: "share-menu", role: "menu", hidden: true });

  constructor() {
    this.el.append(
      this.grip,
      h("header", { class: "sheet-head" }, h("div", { class: "sheet-heading" }, this.title, this.subtitle), this.share, this.close),
      this.shareMenu,
      this.tabs,
      this.body,
    );
    this.grip.addEventListener("click", () => this.el.classList.toggle("collapsed"));
  }
}

export class App {
  /** Tools write here; each hosted tool gets its own panel (see hostTool). */
  readonly panel = new Panel();
  readonly drawer = new Drawer();
  readonly sheet = new Sheet();
  readonly themes: Theme[] = [];
  /** Everything on the globe, shared by all themes. */
  readonly canvas = new Canvas();
  /** Named actions other themes can trigger (e.g. "net:rail" switches railways on). */
  readonly actions = new Map<string, { label: string; run(arg?: string): void; isOn?(): boolean; stop?(): void }>();
  place: Place | null = null;
  theme!: Theme;
  subtab!: Subtab;
  private tabbar: HTMLElement;
  private tabButtons = new Map<string, HTMLButtonElement>();
  /** "More": the topics that aren't on the main bar, plus whatever main adds (your lenses). */
  private moreBtn: HTMLButtonElement | null = null;
  private moreMenu = h("div", { class: "more-menu", role: "menu", hidden: true });
  /** Extra rows for the More menu (set by main). */
  moreExtras?: () => (Node | string)[];
  private tools = new Map<string, { tool: Tool; panel: Panel; placeKey: string; active: boolean }>();
  private toolHome = new Map<string, [string, string]>();
  private interaction: Tool | null = null;
  private pin: Entity | null = null;
  private toastEl = h("div", { class: "toast", role: "status" });
  private toastTimer = 0;
  private renderToken = 0;
  /** Called on every pointer move with the point under the cursor. */
  onPointer?: (p: GeoPoint | null) => void;
  /** Called when a place is chosen (for example to update the status bar). */
  onPlace?: (p: Place | null) => void;
  /** Called when a place's name arrives (reverse geocoding). */
  onName?: (p: Place) => void;
  /** Called when the theme changes. */
  onTheme?: (id: string) => void;
  /** A link that reopens the current view (set by main). */
  shareLink?: () => string;
  /** Content shown before a place is chosen (field sites etc.). */
  emptyState?: (theme: Theme) => HTMLElement;
  /** Links to related views of the same place, shown under each subtab. */
  connections?: (themeId: string, subtabId: string) => HTMLElement | null;
  /** The map's label layer, when present. */
  labels?: import("./globe/labels").LabelLayer;
  /** The theme looks (relief, depths, night…), for tools that switch them directly. */
  looks?: import("./globe/looks").Looks;
  /** "On the map" switches for a theme (peaks, lakes, migrations…). */
  layerChips?: (themeId: string) => HTMLElement | null;

  private handleClick: (pos: Cartesian2) => void = () => {};

  constructor(readonly globe: Globe, root: HTMLElement) {
    this.tabbar = h("nav", { class: "tabbar", role: "tablist", "aria-label": "Themes" });
    root.append(this.sheet.el, this.drawer.el, this.tabbar, this.toastEl);
    this.sheet.close.addEventListener("click", () => this.clearPlace());
    this.sheet.share.addEventListener("click", () => this.toggleShare());

    const handler = new ScreenSpaceEventHandler(globe.viewer.scene.canvas);
    // A tap selects after a short pause, so a double-click (zoom in) doesn't also select.
    let pendingClick = 0;
    handler.setInputAction(() => clearTimeout(pendingClick), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const tool = this.interaction;
      if (!tool?.wantsClicks?.()) {
        clearTimeout(pendingClick);
        const at = Cartesian2.clone(e.position);
        pendingClick = window.setTimeout(() => this.handleClick(at), 230);
        return;
      }
      this.handleClick(e.position);
    }, ScreenSpaceEventType.LEFT_CLICK);
    const clickHandler = (e: { position: Cartesian2 }) => {
      const tool = this.interaction;
      if (!tool?.wantsClicks?.()) {
        const picked = globe.viewer.scene.pick(e.position);
        const tap = tapHandler(picked);
        if (tap) { tap(); return; }
        const f = pickFeature(picked);
        if (f) {
          this.select({ lon: f.lon, lat: f.lat, height: 0 }, { title: f.title, context: f.context }, f.feature);
          return;
        }
      }
      const p = globe.pick(e.position);
      if (!p) return;
      if (tool?.wantsClicks?.()) {
        tool.onClick?.(p);
        if (!tool.wantsClicks()) this.setInteraction(null);
        return;
      }
      this.select(p);
    };
    this.handleClick = (pos: Cartesian2) => clickHandler({ position: pos });
    // Picking the ground under the pointer is costly: skip it while dragging the map
    // (unless a drawing tool needs it) and update the coordinate readout ~12 times a second.
    let frame = 0, dragging = false, lastPick = 0;
    globe.viewer.canvas.addEventListener("pointerdown", () => (dragging = true));
    window.addEventListener("pointerup", () => (dragging = false));
    window.addEventListener("pointercancel", () => (dragging = false));
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      const wants = !!this.interaction?.onMove;
      if (!wants && (dragging || performance.now() - lastPick < 80)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        lastPick = performance.now();
        const p = globe.pick(e.endPosition);
        this.interaction?.onMove?.(p);
        this.onPointer?.(p);
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (this.interaction) {
          this.interaction.onCancel?.();
          this.setInteraction(null);
        } else if (!this.drawer.el.hidden) this.drawer.hide();
        return;
      }
      const n = Number(e.key);
      const bar = this.themes.filter((t) => !t.more);
      if (n >= 1 && n <= bar.length) this.setTheme(bar[n - 1].id);
    });
  }

  addTheme(theme: Theme) {
    this.themes.push(theme);
    if (theme.more) { this.moreButton(); return; }
    const btn = h(
      "button",
      {
        class: "tab",
        role: "tab",
        "aria-selected": "false",
        style: `--tab-color:${theme.color}`,
        onclick: () => this.setTheme(theme.id),
      },
      h("span", { class: "tab-icon", html: theme.icon }),
      h("span", { class: "tab-label" }, theme.label),
    );
    this.tabButtons.set(theme.id, btn);
    this.tabbar.insertBefore(btn, this.moreBtn);
    if (!this.theme) this.setTheme(theme.id);
  }

  /** The last tab: the topics that aren't on the main bar. */
  private moreButton() {
    if (this.moreBtn) return;
    this.moreBtn = h("button", { class: "tab more-tab", role: "tab", "aria-selected": "false", "aria-haspopup": "menu", "aria-expanded": "false", style: "--tab-color:var(--accent)", onclick: () => this.toggleMore() },
      h("span", { class: "tab-icon", html: icons.grid }), h("span", { class: "tab-label" }, "More"));
    this.tabbar.append(this.moreBtn);
    this.tabbar.after(this.moreMenu);
    document.addEventListener("pointerdown", (e) => {
      if (!this.moreMenu.hidden && !this.moreMenu.contains(e.target as Node) && !this.moreBtn!.contains(e.target as Node)) this.toggleMore(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.moreMenu.hidden) this.toggleMore(false); });
  }

  toggleMore(open = this.moreMenu.hidden) {
    if (open) {
      this.moreMenu.replaceChildren(
        h("p", { class: "more-title" }, "More ways to see a place"),
        h("div", { class: "more-grid" }, ...this.themes.filter((t) => t.more).map((t) =>
          h("button", { class: "more-item", role: "menuitem", style: `--tab-color:${t.color}`, "aria-current": String(t === this.theme), onclick: () => { this.toggleMore(false); this.setTheme(t.id); } },
            h("span", { class: "more-icon", html: t.icon }),
            h("span", { class: "more-text" }, h("strong", {}, t.label), h("span", {}, t.intro))))),
        ...(this.moreExtras?.() ?? []));
    }
    this.moreMenu.hidden = !open;
    this.moreBtn?.setAttribute("aria-expanded", String(open));
  }

  /** Remembers which theme/subtab hosts a tool, so tools can link to each other. */
  home(toolId: string, themeId: string, subtabId: string) {
    this.toolHome.set(toolId, [themeId, subtabId]);
  }

  /** Old theme ids that now live inside another theme ("minerals" is part of Earth). */
  readonly aliases = new Map<string, string>();

  setTheme(id: string, subtabId?: string) {
    id = this.aliases.get(id) ?? id;
    const theme = this.themes.find((t) => t.id === id);
    if (!theme) return;
    if (theme !== this.theme) {
      this.subtab?.leave?.(this);
      this.theme?.leave?.(this);
      this.theme = theme;
      this.subtab = theme.subtabs[0];
      for (const [tid, b] of this.tabButtons) b.setAttribute("aria-selected", String(tid === id));
      // A topic shows on the More tab while it's open.
      if (this.moreBtn) {
        this.moreBtn.setAttribute("aria-selected", String(!!theme.more));
        this.moreBtn.style.setProperty("--tab-color", theme.more ? theme.color : "var(--accent)");
        this.moreBtn.querySelector(".tab-icon")!.innerHTML = theme.more ? theme.icon : icons.grid;
        this.moreBtn.querySelector(".tab-label")!.textContent = theme.more ? theme.label.split(" ")[0] : "More";
      }
      document.documentElement.style.setProperty("--theme", theme.color);
      theme.enter?.(this);
      this.canvas.setTheme(theme.id);
      this.onTheme?.(id);
    }
    this.setSubtab(subtabId ?? this.subtab.id, true);
  }

  setSubtab(id: string, force = false) {
    const next = this.theme.subtabs.find((s) => s.id === id) ?? this.theme.subtabs[0];
    if (next === this.subtab && !force) return;
    if (next !== this.subtab) this.subtab?.leave?.(this);
    this.subtab = next;
    this.render();
  }

  /** Opens the theme/subtab that hosts a tool. */
  use(toolId: string) {
    const home = this.toolHome.get(toolId);
    if (home) this.setTheme(home[0], home[1]);
  }

  tool<T extends Tool>(id: string): T {
    return this.tools.get(id)?.tool as T;
  }

  select(p: GeoPoint, name?: PlaceName | null, feature?: unknown) {
    this.lastPlace = null;
    this.setInteraction(null);
    this.subtab?.leave?.(this);
    this.canvas.newPlace();
    this.place = { ...p, name, feature };
    this.drawPin(p);
    this.drawer.hide();
    this.sheet.el.classList.remove("collapsed");
    this.render();
    this.onPlace?.(this.place);
    if (name === undefined) {
      const place = this.place;
      reverseGeocode(p.lon, p.lat)
        .then((n) => {
          if (this.place !== place) return;
          place.name = n;
          this.renderHeader();
          this.onName?.(place);
        })
        .catch(() => {
          if (this.place === place) place.name = null;
          this.renderHeader();
        });
    }
  }

  /** The place the card let go of when the map moved away from it (for "Back to …"). */
  lastPlace: Place | null = null;
  /** Called to go back to a place the card let go of. */
  onReturn?: (p: Place) => void;

  /** True while a tool is waiting for clicks on the globe (drawing a line, picking a point). */
  get interacting(): boolean {
    return this.interaction !== null;
  }

  /** Lets go of the chosen place because the map has moved away from it; the card follows the map. */
  release() {
    const p = this.place;
    if (!p) return;
    this.clearPlace();
    this.lastPlace = p;
    this.render();
  }

  clearPlace() {
    this.lastPlace = null;
    this.subtab?.leave?.(this);
    this.setInteraction(null);
    this.canvas.newPlace();
    this.place = null;
    if (this.pin) this.globe.viewer.entities.remove(this.pin);
    this.pin = null;
    this.drawer.hide();
    this.render();
    this.onPlace?.(null);
  }

  private drawPin(p: GeoPoint) {
    if (this.pin) this.globe.viewer.entities.remove(this.pin);
    this.pin = this.globe.viewer.entities.add({
      position: Cartesian3.fromDegrees(p.lon, p.lat),
      point: {
        pixelSize: 16,
        color: Color.fromCssColorString("#ff3b30"),
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  private toggleShare(open = this.sheet.shareMenu.hidden) {
    const menu = this.sheet.shareMenu;
    menu.hidden = !open;
    this.sheet.share.setAttribute("aria-expanded", String(open));
    if (!open || !this.place) return;
    const p = this.place;
    const name = p.name?.title;
    const address = [name, p.name?.context].filter(Boolean).join(", ");
    const item = (label: string, text: () => string, done: string) =>
      h("button", { role: "menuitem", class: "share-item", onclick: async () => {
        this.toggleShare(false);
        this.toast((await copyText(text())) ? done : "Couldn't copy. Select and copy the text instead.");
      } }, label);
    menu.replaceChildren(
      item("Copy link to this place", () => this.shareLink?.() ?? location.href, "Link copied"),
      this.actions.has("place:card") ? h("button", { role: "menuitem", class: "share-item", onclick: () => { this.toggleShare(false); this.actions.get("place:card")?.run(); } }, "Make a picture card") : "",
      item("Copy coordinates", () => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`, "Coordinates copied"),
      item("Copy as degrees, minutes, seconds", () => formatDms(p.lat, p.lon), "Coordinates copied"),
      address ? item("Copy name and area", () => address, "Copied") : "",
      h("a", { role: "menuitem", class: "share-item", href: `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`, target: "_blank", rel: "noopener" }, "Open in Google Maps"),
      h("a", { role: "menuitem", class: "share-item", href: `https://maps.apple.com/?ll=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&q=${encodeURIComponent(name ?? "Dropped pin")}`, target: "_blank", rel: "noopener" }, "Open in Apple Maps"),
    );
  }

  private emptyHeader: [string, string, string] | null = null;

  /** Header text while no place is chosen (e.g. the area in view). */
  setHeader(title: string, subtitle: string, themeId = this.theme.id) {
    this.emptyHeader = [themeId, title, subtitle];
    if (!this.place) this.renderHeader();
  }

  private renderHeader() {
    const p = this.place;
    if (!p) {
      const own = this.emptyHeader?.[0] === this.theme.id ? this.emptyHeader : null;
      const [t, sub] = own ? [own[1], own[2]] : [this.theme.label, this.theme.intro];
      this.sheet.title.textContent = t;
      this.sheet.subtitle.textContent = sub;
      this.sheet.close.hidden = true;
      this.sheet.share.hidden = true;
      this.sheet.shareMenu.hidden = true;
      return;
    }
    this.sheet.close.hidden = false;
    this.sheet.share.hidden = false;
    this.sheet.title.textContent = p.name === undefined ? "Finding this place…" : p.name?.title ?? "Unnamed place";
    this.sheet.subtitle.textContent = p.name?.context || formatLonLat(p.lon, p.lat);
  }

  render() {
    this.renderToken++;
    this.renderHeader();
    const { tabs, body } = this.sheet;
    const theme = this.theme;
    this.sheet.el.classList.toggle("has-place", !!this.place);
    tabs.hidden = !this.place || theme.subtabs.length < 2;
    tabs.style.setProperty("--count", String(theme.subtabs.length));
    tabs.replaceChildren(
      ...theme.subtabs.map((s) =>
        h("button", { role: "tab", "aria-selected": String(s === this.subtab), onclick: () => this.setSubtab(s.id) }, s.label),
      ),
    );
    const content = h("div", { class: "sheet-content" });
    body.replaceChildren(content);
    body.scrollTop = 0;
    if (!this.place) {
      // The place the map moved away from, one tap back.
      const last = this.lastPlace;
      if (last) content.append(h("button", { class: "back-to", onclick: () => this.onReturn?.(last) }, h("span", { class: "back-to-arrow", html: "&larr;" }), h("span", {}, "Back to ", h("strong", {}, last.name?.title ?? "the place you chose"))));
      if (theme.renderEmpty) theme.renderEmpty(this, content);
      else content.append(this.emptyState?.(theme) ?? h("p", {}, "Tap anywhere on Earth."));
      // The theme's own switches for the map, just under the first hint.
      const chips = this.layerChips?.(theme.id);
      if (chips) {
        const host = content.firstElementChild?.classList.contains("empty") ? content.firstElementChild : content;
        host.insertBefore(chips, host.children[1] ?? null);
      }
      return;
    }
    if (this.place.feature && theme.id !== "explore" && this.themes.some((t) => t.id === "explore")) {
      const title = this.place.name?.title ?? "this place";
      content.append(h("button", { class: "about-link", onclick: () => this.setTheme("explore") }, h("span", { html: icons.compass }), h("span", {}, `About ${title}`), h("span", { class: "chev", html: "&rsaquo;" })));
    }
    this.subtab.render({ app: this, place: this.place, body: content });
    const links = this.connections?.(theme.id, this.subtab.id);
    if (links) content.append(links);
  }

  /** True while `token` is still the latest render (for async subtab content). */
  isCurrent(token = this.renderToken): boolean {
    return token === this.renderToken;
  }
  get token() {
    return this.renderToken;
  }

  /**
   * Shows a tool inside `body`, running it for `place` unless it already has
   * results for that place. `mode` says how the place feeds the tool:
   * "point" clicks it once; "line" starts a line at it and waits for the end.
   */
  hostTool(tool: Tool, body: HTMLElement, place: Place, mode: "point" | "line") {
    let entry = this.tools.get(tool.id);
    if (!entry) {
      const panel = new Panel();
      entry = { tool, panel, placeKey: "", active: false };
      this.tools.set(tool.id, entry);
    }
    const view = this.toolView(entry);
    body.append(entry.panel.el);
    // Back in its own subtab: it's the subtab's again, not a leftover on the canvas.
    this.canvas.drop(`tool:${tool.id}`);
    tool.activate(view);
    entry.active = true;
    const key = `${place.lon.toFixed(6)},${place.lat.toFixed(6)}`;
    if (entry.placeKey !== key) {
      entry.placeKey = key;
      tool.onCancel?.();
      tool.onClick?.(place);
    }
    this.setInteraction(mode === "line" && tool.wantsClicks?.() ? tool : null);
  }

  /**
   * The App as a hosted tool sees it: its own panel, and a drawer it can only
   * open while its subtab is showing (a result that finishes after you've
   * moved on stays on the map without popping up a chart).
   */
  private toolView(entry: { panel: Panel; active: boolean }): App {
    const real = this.drawer;
    const drawer = Object.assign(Object.create(real) as Drawer, {
      show: (...a: Parameters<Drawer["show"]>) => { if (entry.active) real.show(...a); },
      showCustom: (...a: Parameters<Drawer["showCustom"]>) => { if (entry.active) real.showCustom(...a); },
      hide: () => real.hide(),
    });
    return Object.create(this, { panel: { value: entry.panel }, drawer: { value: drawer } }) as App;
  }

  /** Waits for the next tap on the globe (e.g. to place a camera), with a prompt. */
  pickOnce(prompt: string | null, cb: (p: GeoPoint) => void, onCancel?: () => void) {
    let done = false;
    this.setInteraction({
      id: "pick-once", label: "", icon: "", shortcut: "", hint: prompt ?? "",
      activate() {}, deactivate() {},
      wantsClicks: () => !done,
      onClick: (p) => { done = true; cb(p); },
      onCancel: () => { done = true; onCancel?.(); },
    });
    if (prompt) this.toast(prompt, 8000);
  }

  /** Stops waiting for a tap started with pickOnce. */
  cancelPick() {
    if (this.interaction?.id === "pick-once") {
      this.interaction.onCancel?.();
      this.setInteraction(null);
    }
  }

  /** Re-runs a hosted tool's line from the current place (after a finished line). */
  restartLine(tool: Tool) {
    if (!this.place) return;
    tool.onCancel?.();
    tool.onClick?.(this.place);
    this.setInteraction(tool);
  }

  /** Hides a hosted tool's results. Safe to call for tools that aren't showing. */
  releaseTool(tool: Tool) {
    if (this.interaction === tool) this.setInteraction(null);
    const entry = this.tools.get(tool.id);
    if (!entry?.active) return;
    entry.active = false;
    if (tool.keepsOnMap && this.place && entry.placeKey) {
      // Leave its results on the map while the place is looked at through other themes.
      this.drawer.hide();
      const view = this.toolView(entry);
      const where = this.place.name?.title;
      this.canvas.put({
        id: `tool:${tool.id}`,
        label: `${this.theme.label} › ${this.subtab.label}${where ? ` · ${where}` : ""}`,
        color: this.theme.color,
        theme: this.theme.id,
        scope: "place",
        pinned: false,
        show: (on) => {
          if (on) {
            tool.activate(view);
            this.drawer.hide();
          } else tool.deactivate();
        },
        remove: () => {
          entry.placeKey = "";
          tool.onCancel?.();
        },
      }, true);
      return;
    }
    tool.deactivate();
  }

  private setInteraction(tool: Tool | null) {
    this.interaction = tool;
    this.globe.viewer.container.classList.toggle("tool-precise", Boolean(tool));
  }

  toast(message: string, ms = 3500) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), ms);
  }
}

/** A subtab that hosts an existing tool for the chosen place. */
export function toolSubtab(id: string, label: string, tool: Tool, mode: "point" | "line", intro?: () => HTMLElement): Subtab {
  return {
    id,
    label,
    render({ app, place, body }) {
      if (intro) body.append(intro());
      app.hostTool(tool, body, place, mode);
    },
    leave(app) {
      app.releaseTool(tool);
    },
  };
}

/** Copies text, falling back to a hidden text area where the Clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
