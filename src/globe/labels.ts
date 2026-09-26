// Live, decluttered HTML labels pinned to places on the globe. Several
// sources (world, rivers, notable places…) feed one layer; the most important
// labels win where they would overlap.
import { Cartesian2, Cartesian3, Cartographic, type Scene } from "cesium";
import type { PlaceKind } from "../analysis/placeKinds";

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
}

const POINT_KINDS = new Set<PlaceKind>(["landmark", "sports", "culture", "worship", "transport", "education", "park", "nature", "peak", "water", "other", "district"]);

export class LabelLayer {
  readonly el: HTMLDivElement;
  private sources = new Map<string, MapLabel[]>();
  private nodes = new Map<string, Node>();
  private scratch = new Cartesian2();
  private dirty = true;
  visible = true;
  maxLabels = 45;
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
    this.dirty = true;
  }

  private createNode(l: MapLabel): Node {
    const el = document.createElement("button");
    el.className = `map-label k-${l.kind}${POINT_KINDS.has(l.kind) ? " pt" : ""}`;
    el.type = "button";
    const text = document.createElement("span");
    text.className = "ml-text";
    text.textContent = l.name;
    if (POINT_KINDS.has(l.kind)) {
      const dot = document.createElement("span");
      dot.className = "ml-dot";
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
    return { label: l, el, pos, normal: Cartesian3.normalize(pos, new Cartesian3()), heightKnown: false, w: 0, h: 0 };
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
    const nodes = [...this.nodes.values()].sort((a, b) => b.label.rank - a.label.rank);
    let shown = 0;
    for (const n of nodes) {
      if (!n.heightKnown) {
        const hgt = scene.globe.getHeight(Cartographic.fromDegrees(n.label.lon, n.label.lat));
        if (hgt !== undefined) {
          Cartesian3.fromDegrees(n.label.lon, n.label.lat, Math.max(0, hgt) * ex, undefined, n.pos);
          n.heightKnown = true;
        }
      }
      // Behind the horizon?
      Cartesian3.subtract(cam, n.pos, toCam);
      if (Cartesian3.dot(toCam, n.normal) < 0 || shown >= this.maxLabels) { n.el.hidden = true; continue; }
      const p = scene.cartesianToCanvasCoordinates(n.pos, this.scratch);
      if (!p || p.x < -40 || p.y < -20 || p.x > W + 40 || p.y > H + 20) { n.el.hidden = true; continue; }
      if (!n.w) {
        n.el.hidden = false;
        n.w = n.el.offsetWidth;
        n.h = n.el.offsetHeight;
      }
      const pointy = n.el.classList.contains("pt");
      const x0 = pointy ? p.x - 6 : p.x - n.w / 2, y0 = p.y - n.h / 2;
      const box: [number, number, number, number] = [x0 - 3, y0 - 2, x0 + n.w + 3, y0 + n.h + 2];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { n.el.hidden = true; continue; }
      placed.push(box);
      shown++;
      n.el.hidden = false;
      n.el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    }
  }

  /** Labels currently drawn (for "in view" lists). */
  shownLabels(): MapLabel[] {
    return [...this.nodes.values()].filter((n) => !n.el.hidden).map((n) => n.label).sort((a, b) => b.rank - a.rank);
  }

  refresh() {
    this.dirty = true;
  }
}
