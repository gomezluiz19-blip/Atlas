// App shell: routes globe input to the active tool and hosts the shared panels.
import { Cartesian2, ScreenSpaceEventHandler, ScreenSpaceEventType } from "cesium";
import type { Globe } from "./globe/viewer";
import { Chart, type ChartData, type ChartOptions } from "./ui/chart";
import { h } from "./ui/dom";
import { icons } from "./ui/icons";

export interface GeoPoint {
  lon: number;
  lat: number;
  height: number;
}

export interface Tool {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  /** One-line description shown in the tool rail tooltip. */
  hint: string;
  activate(app: App): void;
  deactivate(): void;
  onClick?(p: GeoPoint): void;
  onMove?(p: GeoPoint | null): void;
  onCancel?(): void;
}

/** The results panel on the right. */
export class Panel {
  readonly el = h("aside", { class: "panel", hidden: true, "aria-live": "polite" });
  private title = h("h2", { class: "panel-title" });
  private body = h("div", { class: "panel-body" });

  constructor() {
    const close = h("button", { class: "icon-btn", "aria-label": "Close panel", html: icons.close, onclick: () => this.hide() });
    this.el.append(h("header", { class: "panel-head" }, this.title, close), this.body);
  }
  show(title: string, ...content: (Node | string)[]) {
    this.title.textContent = title;
    this.body.replaceChildren(...content);
    this.el.hidden = false;
  }
  hide() {
    this.el.hidden = true;
  }
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

export class App {
  readonly panel = new Panel();
  readonly drawer = new Drawer();
  private tools = new Map<string, Tool>();
  private buttons = new Map<string, HTMLButtonElement>();
  private active: Tool | null = null;
  private toastEl = h("div", { class: "toast", role: "status" });
  private toastTimer = 0;

  constructor(readonly globe: Globe, readonly rail: HTMLElement, root: HTMLElement) {
    root.append(this.panel.el, this.drawer.el, this.toastEl);
    const handler = new ScreenSpaceEventHandler(globe.viewer.scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const p = globe.pick(e.position);
      if (p) this.active?.onClick?.(p);
    }, ScreenSpaceEventType.LEFT_CLICK);
    let frame = 0;
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const p = globe.pick(e.endPosition);
        this.active?.onMove?.(p);
        this.onPointer?.(p);
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        this.active?.onCancel?.();
        return;
      }
      for (const t of this.tools.values()) {
        if (e.key.toLowerCase() === t.shortcut.toLowerCase()) this.use(t.id);
      }
    });
  }

  /** Called on every pointer move with the point under the cursor. */
  onPointer?: (p: GeoPoint | null) => void;

  private lastGroup = "";

  register(tool: Tool, group?: string) {
    this.tools.set(tool.id, tool);
    if (group && group !== this.lastGroup) {
      this.rail.append(h("div", { class: "rail-group" }, group));
      this.lastGroup = group;
    }
    const btn = h(
      "button",
      {
        class: "rail-btn",
        "data-tool": tool.id,
        "aria-pressed": "false",
        title: `${tool.hint} (${tool.shortcut.toUpperCase()})`,
        onclick: () => this.use(tool.id),
      },
      h("span", { class: "rail-icon", html: tool.icon }),
      h("span", { class: "rail-label" }, tool.label),
    );
    this.buttons.set(tool.id, btn);
    this.rail.append(btn);
  }

  use(id: string) {
    const tool = this.tools.get(id);
    if (!tool) return;
    if (this.active === tool) return;
    this.active?.deactivate();
    this.active = tool;
    for (const [tid, b] of this.buttons) b.setAttribute("aria-pressed", String(tid === id));
    this.globe.viewer.container.classList.toggle("tool-precise", id !== "explore");
    tool.activate(this);
  }

  tool<T extends Tool>(id: string): T {
    return this.tools.get(id) as T;
  }

  toast(message: string, ms = 3500) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), ms);
  }
}
