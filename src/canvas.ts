// The canvas: everything currently drawn on the globe, from any theme. Themes
// are lenses on one shared map, so what you put on it stays as you move
// between them:
//   - Layers you switch on (railways, earthquakes, the geologic map…) stay on
//     everywhere until you switch them off.
//   - Results about the chosen place (a rain path, the mines around it) stay
//     on as you look at the place through other themes, and clear when you
//     choose a new place, unless pinned.
//   - A theme's own suggested layers (Built's default networks, Minerals'
//     landmark mines) show while you're in that theme, unless pinned.

export interface CanvasItem {
  id: string;
  label: string;
  color: string;
  /** Theme that made it (a theme's own items show in it even when not pinned). */
  theme?: string;
  /** "world" layers, or results about the chosen "place". */
  scope: "world" | "place";
  /** Kept across themes and places. */
  pinned: boolean;
  /** Draws or hides it on the globe. */
  show(on: boolean): void;
  /** Takes it off the map for good (e.g. switches the layer off). */
  remove(): void;
}

export class Canvas {
  private items = new Map<string, CanvasItem & { visible: boolean }>();
  private listeners = new Set<() => void>();
  private theme = "";

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Adds or replaces an item and shows it if it belongs in the current view.
   * `drawn`: it is already on the globe (so show() isn't called again).
   */
  put(item: CanvasItem, drawn = false) {
    const prev = this.items.get(item.id);
    const next = { ...item, pinned: item.pinned || (prev?.pinned ?? false), visible: drawn };
    this.items.set(item.id, next);
    this.sync(next);
    this.emit();
  }

  has(id: string) {
    return this.items.has(id);
  }

  /** Forgets an item without calling its remove() (its owner already turned it off). */
  drop(id: string) {
    if (this.items.delete(id)) this.emit();
  }

  /** Takes an item off the map (asks its owner to turn it off). */
  remove(id: string) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    it.show(false);
    it.remove();
    this.emit();
  }

  setPinned(id: string, pinned: boolean) {
    const it = this.items.get(id);
    if (!it) return;
    it.pinned = pinned;
    this.sync(it);
    this.emit();
  }

  /** Items currently drawn, for the tray. */
  visible(): (CanvasItem & { visible: boolean })[] {
    return [...this.items.values()].filter((i) => i.visible);
  }

  setTheme(theme: string) {
    this.theme = theme;
    for (const it of this.items.values()) this.sync(it);
    this.emit();
  }

  /** A new place was chosen: results about the old one go, unless pinned. */
  newPlace() {
    for (const [id, it] of [...this.items]) {
      if (it.scope === "place" && !it.pinned) {
        this.items.delete(id);
        it.show(false);
        it.remove();
      }
    }
    this.emit();
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  private sync(it: CanvasItem & { visible: boolean }) {
    const want = it.pinned || it.scope === "place" || !it.theme || it.theme === this.theme;
    if (want !== it.visible) {
      it.visible = want;
      it.show(want);
    }
  }
}
