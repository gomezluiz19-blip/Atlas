// Photos floating over the globe where they were taken: round portraits of
// the animals and plants seen around a place, drifting gently, each at its own
// spot. They sit on the map (under the panels), fade in one after another,
// hide behind the Earth's curve, and grow when you point at one.
import { Cartesian2, Cartesian3, SceneTransforms, type Viewer } from "cesium";

export interface Bubble { lon: number; lat: number; photo: string; name: string; color: string; onClick?: () => void }

export class Bubbles {
  private box = document.createElement("div");
  private items: { el: HTMLElement; pos: Cartesian3 }[] = [];
  private win = new Cartesian2();
  private off: () => void;

  constructor(private viewer: Viewer, private opts: { maxHeight?: number } = {}) {
    this.box.className = "bubbles";
    viewer.canvas.after(this.box);
    this.off = viewer.scene.postRender.addEventListener(() => this.frame());
  }

  set(list: Bubble[]) {
    this.box.replaceChildren();
    this.items = list.map((b, i) => {
      const el = document.createElement("button");
      el.className = "bubble";
      el.style.setProperty("--c", b.color);
      el.style.setProperty("--i", String(i));
      el.title = b.name;
      el.innerHTML = `<span class="bubble-in"><img alt="" loading="lazy" referrerpolicy="no-referrer"><span class="bubble-name"></span></span>`;
      (el.querySelector("img") as HTMLImageElement).src = b.photo;
      (el.querySelector(".bubble-name") as HTMLElement).textContent = b.name;
      el.onclick = () => b.onClick?.();
      this.box.append(el);
      return { el, pos: Cartesian3.fromDegrees(b.lon, b.lat, 20) };
    });
  }

  show(v: boolean) { this.box.hidden = !v; }
  destroy() { this.off(); this.box.remove(); }

  private frame() {
    if (this.box.hidden || !this.items.length) return;
    const cam = this.viewer.camera;
    const far = cam.positionCartographic.height > (this.opts.maxHeight ?? 400_000);
    this.box.classList.toggle("far", far);
    if (far) return;
    const c = cam.positionWC, d = new Cartesian3();
    // On the near side of the Earth: the camera is above the point's horizon.
    const facing = (p: Cartesian3) => Cartesian3.dot(p, Cartesian3.subtract(c, p, d)) > 0;
    const w = this.viewer.canvas.clientWidth, h = this.viewer.canvas.clientHeight;
    for (const it of this.items) {
      const s = facing(it.pos) ? SceneTransforms.worldToWindowCoordinates(this.viewer.scene, it.pos, this.win) : undefined;
      if (!s || s.x < -40 || s.y < -40 || s.x > w + 40 || s.y > h + 40) { it.el.style.visibility = "hidden"; continue; }
      it.el.style.visibility = "";
      it.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
  }
}
