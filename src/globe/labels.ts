// Live, decluttered HTML labels pinned to places on the globe. Several
// sources (world, rivers, notable places…) feed one layer; the most important
// labels win where they would overlap.
import { Cartesian2, Cartesian3, Cartographic, type Scene } from "cesium";
import type { PlaceKind } from "../analysis/placeKinds";
import { glyphFor } from "../ui/placeGlyphs";

export interface MapLabel {
  id: string;
  name: string;
  lon: number;
  lat: number;
  kind: PlaceKind;
  /** Higher wins when labels collide. */
  rank: number;
  /** Small secondary text (e.g. a peak's elevation). */
  sub?: string;
  heritage?: boolean;
  /** Anything the click handler needs. */
  data?: unknown;
}

interface Node {
  label: MapLabel;
  el: HTMLButtonElement;
  pos: Cartesian3;
  normal: Cartesian3;
  heightKnown: boolean;
  w: number;
  h: number;
  /** What's on screen now, so unchanged labels cost no DOM writes. */
  shown: boolean;
  tx: number;
  ty: number;
}

const POINT_KINDS = new Set<PlaceKind>([
  "landmark", "monument", "castle", "bridge", "dam", "lighthouse", "sports", "culture", "worship", "transport", "education",
  "park", "zoo", "nature", "peak", "volcano", "waterfall", "glacier", "island", "beach", "water", "other", "district",
]);

export class LabelLayer {
  readonly el: HTMLDivElement;
  private sources = new Map<string, MapLabel[]>();
  private nodes = new Map<string, Node>();
  private scratch = new Cartesian2();
  private dirty = true;
  /** Nodes by rank, highest first (re-sorted only when the set changes). */
  private sorted: Node[] = [];
  private heightTry = 0;
  visible = true;
  maxLabels = 45;
  /** When set, notable places outside these kinds are hidden (world-scale names stay). */
  private filter: Set<PlaceKind> | null = null;
  onClick?: (label: MapLabel) => void;

  constructor(private scene: Scene, private exaggeration: () => number) {
    this.el = document.createElement("div");
    this.el.className = "map-labels";
    scene.postRender.addEventListener(() => this.update());
    scene.camera.changed.addEventListener(() => (this.dirty = true));
    scene.camera.percentageChanged = 0.001;
    scene.globe.tileLoadProgressEvent.addEventListener(() => (this.dirty = true));
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.el.hidden = !v;
    this.dirty = true;
  }

  setFilter(kinds: PlaceKind[] | null) {
    this.filter = kinds ? new Set(kinds) : null;
    this.dirty = true;
    this.scene.requestRender();
  }

  set(source: string, labels: MapLabel[]) {
    this.sources.set(source, labels);
    const wanted = new Map<string, MapLabel>();
    for (const list of this.sources.values()) for (const l of list) {
      const prev = wanted.get(l.id);
      if (!prev || l.rank > prev.rank) wanted.set(l.id, l);
    }
    // Different sources can name the same feature; keep the highest-ranked per name.
    const byName = new Map<string, MapLabel>();
    for (const l of wanted.values()) {
      const key = l.name.toLowerCase();
      const prev = byName.get(key);
      if (!prev || l.rank > prev.rank) byName.set(key, l);
    }
    const keep = new Set([...byName.values()].map((l) => l.id));
    for (const [id, node] of this.nodes) if (!keep.has(id)) { node.el.remove(); this.nodes.delete(id); }
    for (const l of byName.values()) {
      const existing = this.nodes.get(l.id);
      if (existing) { existing.label = l; continue; }
      this.nodes.set(l.id, this.createNode(l));
    }
    this.sorted = [...this.nodes.values()].sort((a, b) => b.label.rank - a.label.rank);
    this.dirty = true;
  }

  private show(n: Node, on: boolean) {
    if (n.shown !== on) { n.shown = on; n.el.hidden = !on; }
  }

  private createNode(l: MapLabel): Node {
    const el = document.createElement("button");
    el.className = `map-label k-${l.kind}${POINT_KINDS.has(l.kind) ? " pt" : ""}`;
    el.type = "button";
    const text = document.createElement("span");
    text.className = "ml-text";
    text.textContent = l.name;
    if (POINT_KINDS.has(l.kind)) {
      const glyph = l.kind === "district" || (l.kind === "water" && !(l.data as { notable?: unknown } | undefined)?.notable) ? undefined : glyphFor(l.kind);
      const dot = document.createElement("span");
      dot.className = glyph ? "ml-glyph" : "ml-dot";
      if (glyph) dot.innerHTML = glyph;
      el.append(dot);
    }
    el.append(text);
    if (l.sub) {
      const sub = document.createElement("span");
      sub.className = "ml-sub";
      sub.textContent = l.sub;
      el.append(sub);
    }
    if (l.heritage) el.classList.add("heritage");
    el.title = l.name;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onClick?.(l);
    });
    el.hidden = true;
    this.el.append(el);
    const pos = Cartesian3.fromDegrees(l.lon, l.lat, 0);
    return { label: l, el, pos, normal: Cartesian3.normalize(pos, new Cartesian3()), heightKnown: false, w: 0, h: 0, shown: false, tx: NaN, ty: NaN };
  }

  private update() {
    if (!this.visible || !this.dirty) return;
    this.dirty = false;
    const scene = this.scene;
    const cam = scene.camera.positionWC;
    const ex = this.exaggeration();
    const canvas = scene.canvas;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const toCam = new Cartesian3();
    const placed: [number, number, number, number][] = [];
    // Ground heights: a few lookups a frame, not every label every frame.
    const now = performance.now();
    let heightBudget = now - this.heightTry > 250 ? 25 : 0;
    if (heightBudget) this.heightTry = now;
    let shown = 0;
    for (const n of this.sorted) {
      if (!n.heightKnown && heightBudget > 0) {
        heightBudget--;
        const hgt = scene.globe.getHeight(Cartographic.fromDegrees(n.label.lon, n.label.lat));
        if (hgt !== undefined) {
          Cartesian3.fromDegrees(n.label.lon, n.label.lat, Math.max(0, hgt) * ex, undefined, n.pos);
          n.heightKnown = true;
        }
      }
      if (this.filter && (n.label.data as { source?: string } | undefined)?.source === "notable" && !this.filter.has(n.label.kind)) { this.show(n, false); continue; }
      // Behind the horizon?
      Cartesian3.subtract(cam, n.pos, toCam);
      if (Cartesian3.dot(toCam, n.normal) < 0 || shown >= this.maxLabels) { this.show(n, false); continue; }
      const p = scene.cartesianToCanvasCoordinates(n.pos, this.scratch);
      if (!p || p.x < -40 || p.y < -20 || p.x > W + 40 || p.y > H + 20) { this.show(n, false); continue; }
      if (!n.w) {
        this.show(n, true);
        n.w = n.el.offsetWidth;
        n.h = n.el.offsetHeight;
      }
      const pointy = n.el.classList.contains("pt");
      const x0 = pointy ? p.x - 6 : p.x - n.w / 2, y0 = p.y - n.h / 2;
      const box: [number, number, number, number] = [x0 - 3, y0 - 2, x0 + n.w + 3, y0 + n.h + 2];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { this.show(n, false); continue; }
      placed.push(box);
      shown++;
      this.show(n, true);
      const tx = Math.round(x0), ty = Math.round(y0);
      if (tx !== n.tx || ty !== n.ty) { n.tx = tx; n.ty = ty; n.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`; }
    }
    // Keep going until every label in view has its ground height.
    if (this.sorted.some((n) => !n.heightKnown && n.shown)) this.dirty = true;
  }

  /** Labels on screen with their positions (CSS pixels from the map's corner), to draw them into a video. */
  drawn(): { name: string; sub?: string; x: number; y: number; w: number; h: number; point: boolean; italic: boolean; color: string }[] {
    if (!this.visible) return [];
    return this.sorted.filter((n) => n.shown && Number.isFinite(n.tx)).map((n) => ({
      name: n.label.name, sub: n.label.sub, x: n.tx, y: n.ty, w: n.w, h: n.h,
      point: n.el.classList.contains("pt"), italic: n.label.kind === "water" && !n.el.classList.contains("pt"),
      color: getComputedStyle(n.el).getPropertyValue("--c").trim() || "#b8496a",
    }));
  }

  /** Labels currently drawn (for "in view" lists). */
  shownLabels(): MapLabel[] {
    return this.sorted.filter((n) => n.shown).map((n) => n.label);
  }

  refresh() {
    this.dirty = true;
  }
}
