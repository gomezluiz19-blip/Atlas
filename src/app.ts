// App shell. The model is simple: tap anywhere to choose a place, pick a theme
// from the tab bar, and every subtab of that theme describes the chosen place.
import { Cartesian2, Cartesian3, Color, HeightReference, ScreenSpaceEventHandler, ScreenSpaceEventType, type Entity } from "cesium";
import { reverseGeocode, type PlaceName } from "./data/geocode";
import { pickFeature } from "./globe/pickables";
import type { Globe } from "./globe/viewer";
import { Chart, type ChartData, type ChartOptions } from "./ui/chart";
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

  constructor() {
    this.el.append(
      this.grip,
      h("header", { class: "sheet-head" }, h("div", { class: "sheet-heading" }, this.title, this.subtitle), this.close),
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
  place: Place | null = null;
  theme!: Theme;
  subtab!: Subtab;
  private tabbar: HTMLElement;
  private tabButtons = new Map<string, HTMLButtonElement>();
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
  /** Content shown before a place is chosen (field sites etc.). */
  emptyState?: (theme: Theme) => HTMLElement;
  /** The map's label layer, when present. */
  labels?: import("./globe/labels").LabelLayer;

  constructor(readonly globe: Globe, root: HTMLElement) {
    this.tabbar = h("nav", { class: "tabbar", role: "tablist", "aria-label": "Themes" });
    root.append(this.sheet.el, this.drawer.el, this.tabbar, this.toastEl);
    this.sheet.close.addEventListener("click", () => this.clearPlace());

    const handler = new ScreenSpaceEventHandler(globe.viewer.scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const tool = this.interaction;
      if (!tool?.wantsClicks?.()) {
        const f = pickFeature(globe.viewer.scene.pick(e.position));
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
    }, ScreenSpaceEventType.LEFT_CLICK);
    let frame = 0;
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
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
      if (n >= 1 && n <= this.themes.length) this.setTheme(this.themes[n - 1].id);
    });
  }

  addTheme(theme: Theme) {
    this.themes.push(theme);
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
    this.tabbar.append(btn);
    if (!this.theme) this.setTheme(theme.id);
  }

  /** Remembers which theme/subtab hosts a tool, so tools can link to each other. */
  home(toolId: string, themeId: string, subtabId: string) {
    this.toolHome.set(toolId, [themeId, subtabId]);
  }

  setTheme(id: string, subtabId?: string) {
    const theme = this.themes.find((t) => t.id === id);
    if (!theme) return;
    if (theme !== this.theme) {
      this.subtab?.leave?.(this);
      this.theme?.leave?.(this);
      this.theme = theme;
      this.subtab = theme.subtabs[0];
      for (const [tid, b] of this.tabButtons) b.setAttribute("aria-selected", String(tid === id));
      document.documentElement.style.setProperty("--theme", theme.color);
      theme.enter?.(this);
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
    this.setInteraction(null);
    this.subtab?.leave?.(this);
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
        })
        .catch(() => {
          if (this.place === place) place.name = null;
          this.renderHeader();
        });
    }
  }

  clearPlace() {
    this.subtab?.leave?.(this);
    this.setInteraction(null);
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

  private emptyHeader: [string, string] | null = null;

  /** Header text while no place is chosen (e.g. the area in view). */
  setHeader(title: string, subtitle: string) {
    this.emptyHeader = [title, subtitle];
    if (!this.place) this.renderHeader();
  }

  private renderHeader() {
    const p = this.place;
    if (!p) {
      const [t, sub] = this.theme.renderEmpty && this.emptyHeader ? this.emptyHeader : [this.theme.label, this.theme.intro];
      this.sheet.title.textContent = t;
      this.sheet.subtitle.textContent = sub;
      this.sheet.close.hidden = true;
      return;
    }
    this.sheet.close.hidden = false;
    this.sheet.title.textContent = p.name === undefined ? "Finding this place…" : p.name?.title ?? "Unnamed place";
    this.sheet.subtitle.textContent = p.name?.context || formatLonLat(p.lon, p.lat);
  }

  render() {
    this.renderToken++;
    this.renderHeader();
    const { tabs, body } = this.sheet;
    const theme = this.theme;
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
      if (theme.renderEmpty) theme.renderEmpty(this, content);
      else content.append(this.emptyState?.(theme) ?? h("p", {}, "Tap anywhere on Earth."));
      return;
    }
    if (this.place.feature && theme.id !== "explore" && this.themes.some((t) => t.id === "explore")) {
      const title = this.place.name?.title ?? "this place";
      content.append(h("button", { class: "about-link", onclick: () => this.setTheme("explore") }, h("span", { html: icons.compass }), h("span", {}, `About ${title}`), h("span", { class: "chev", html: "&rsaquo;" })));
    }
    this.subtab.render({ app: this, place: this.place, body: content });
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
    const view = Object.create(this, { panel: { value: entry.panel } }) as App;
    body.append(entry.panel.el);
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
