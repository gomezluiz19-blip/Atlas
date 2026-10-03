// Soil profile: the ground under a field, dug out as a block you can turn,
// layer by layer to two metres (ISRIC SoilGrids, CC BY 4.0). Each layer is
// coloured by what it's made of and darker with organic matter; rain falls on
// it and soaks down as fast as that soil really lets water through. Beside it:
// texture, acidity, carbon, the water it holds for roots, how many dry days
// that lasts, what it suits, and a what-if for a dry spell or a cloudburst.
import * as THREE from "three";
import type { App } from "../app";
import { getJson } from "../data/http";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { Cartesian2 } from "cesium";
import { dryDays, readSoil, readSoilGrids, soakHours, type SoilRead } from "./soilModel";

const PROPS = ["clay", "sand", "silt", "phh2o", "soc", "bdod", "nitrogen"];
const url = (lon: number, lat: number) => `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&${PROPS.map((p) => `property=${p}`).join("&")}&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&depth=60-100cm&depth=100-200cm&value=mean`;

/** A soil's colour from its texture and organic carbon: sandy is pale tan, silty is grey-brown, clay is red-brown; carbon darkens all of them towards near-black. */
function soilColor(sand: number, clay: number, soc: number): THREE.Color {
  const tan = new THREE.Color("#c9a874"), brown = new THREE.Color("#8a6a4a"), red = new THREE.Color("#9c5b3c"), black = new THREE.Color("#2a1d14");
  const base = brown.clone().lerp(tan, Math.max(0, Math.min(1, (sand - 30) / 50))).lerp(red, Math.max(0, Math.min(0.7, (clay - 25) / 30)));
  return base.lerp(black, Math.min(0.75, soc / 45));
}

/** The block, turning slowly, with rain soaking down. Returns a stop function. */
function monolith(host: HTMLElement, s: SoilRead, rainMm: () => number): () => void {
  const W = host.clientWidth || 300, H = 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(W, H);
  host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  cam.position.set(4.2, 2.4, 5.2);
  cam.lookAt(0, -0.2, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 5, 4); scene.add(sun);
  const block = new THREE.Group(); scene.add(block);
  // Two metres of soil as 2.4 units of height; each layer a slab, with a fine noise texture for grain.
  const scale = 2.4 / 200, top = 1.2;
  for (const l of s.layers) {
    const hgt = (l.to - l.from) * scale;
    const c = soilColor(l.sand, l.clay, l.soc);
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d")!; g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 380; i++) { const k = Math.random(); g.fillStyle = `rgba(${k > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + Math.random() * (l.sand / 900)})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1 + l.sand / 50, 1 + l.sand / 50); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, Math.max(1, hgt * 2));
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.6, hgt, 1.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    slab.position.y = top - l.from * scale - hgt / 2;
    block.add(slab);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    edge.position.copy(slab.position); block.add(edge);
  }
  // Grass on top.
  const grass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 1.62), new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 1 }));
  grass.position.y = top + 0.025; block.add(grass);
  // The wetting front: a translucent blue sheet sinking at the soil's own pace, and rain falling onto it.
  const front = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.02, 1.64), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.5 }));
  block.add(front);
  const N = 260, drops = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 1.6; pos[i * 3 + 1] = top + Math.random() * 1.6; pos[i * 3 + 2] = (Math.random() - 0.5) * 1.6; }
  drops.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.Points(drops, new THREE.PointsMaterial({ color: 0x8fd1ff, size: 0.035, transparent: true, opacity: 0.85 }));
  block.add(rain);
  let raf = 0, t0 = performance.now(), drag = 0, spin = 0.25;
  renderer.domElement.addEventListener("pointerdown", (e) => { const x0 = e.clientX, r0 = spin; renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.onpointermove = (ev) => { drag = (ev.clientX - x0) / 120; spin = r0; }; renderer.domElement.onpointerup = () => { spin = r0 + drag; drag = 0; renderer.domElement.onpointermove = null; }; });
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!host.isConnected) { stop(); return; }
    block.rotation.y = spin + drag + (now / 1000) * 0.12;
    // The front cycles: it reaches the depth the rain gets to in its soak time, played in about 6 s.
    const mm = rainMm(), reach = Math.min(200, mm * 2.2), cycle = ((now - t0) / 6000) % 1;
    front.position.y = top - reach * scale * cycle;
    (front.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - cycle * 0.6);
    const p = drops.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) { let y = p.getY(i) - 0.03; if (y < top) y = top + 1.6; p.setY(i, y); }
    p.needsUpdate = true;
    rain.visible = mm > 0;
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);
  const stop = () => { cancelAnimationFrame(raf); renderer.dispose(); };
  return stop;
}

export function openSoil(ctx: WorkCtx, app: App) {
  const cv = app.globe.viewer.canvas, mid = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  const at = app.place ? { lon: app.place.lon, lat: app.place.lat, name: app.place.name?.title ?? "Here" } : mid ? { lon: mid.lon, lat: mid.lat, name: "The middle of the map" } : { lon: -93.6, lat: 42.0, name: "Iowa farmland" };
  const view = h("div", { class: "sl-3d" }, h("p", { class: "muted small" }, "Digging…"));
  const facts = h("div", { class: "sl-facts" });
  const layersBox = h("div", { class: "sl-layers" });
  const wi = h("div", { class: "sl-wi" });
  let rainMm = 25, stop: (() => void) | null = null;
  ctx.show("Soil profile", () => { stop?.(); ctx.home(); },
    h("p", { class: "mp-intro" }, `The ground under ${at.name === "Here" ? "this place" : at.name.replace(/^The /, "the ")}, two metres down, layer by layer. Drag the block to turn it; rain soaks in as fast as this soil really lets it.`),
    view, facts, layersBox, wi,
    h("p", { class: "fineprint" }, "ISRIC SoilGrids 2.0 (250 m, CC BY 4.0): a modelled estimate, not a soil test. Water held and soak rates from textbook values for each texture (Rawls et al., 1982)."));
  void (async () => {
    try {
      const s = readSoil(readSoilGrids(await getJson("SoilGrids", url(at.lon, at.lat), undefined, 30_000)));
      if (!s) { view.replaceChildren(h("p", { class: "muted" }, "No soil mapped here: water, rock, ice or a city centre.")); return; }
      stop = monolith(view, s, () => rainMm);
      facts.replaceChildren(
        h("div", { class: "sl-kpi" }, h("small", {}, "Topsoil"), h("strong", {}, s.top), h("span", {}, `${Math.round(s.layers[0].sand)}% sand · ${Math.round(s.layers[0].silt)}% silt · ${Math.round(s.layers[0].clay)}% clay`)),
        h("div", { class: "sl-kpi" }, h("small", {}, "Acidity"), h("strong", {}, `pH ${s.ph}`), h("span", {}, s.phText)),
        h("div", { class: "sl-kpi" }, h("small", {}, "Water for roots"), h("strong", {}, `${s.awc} mm`), h("span", {}, `in the top metre · drains ${s.drainage === "good" ? "well" : s.drainage}`)),
        h("div", { class: "sl-kpi" }, h("small", {}, "Organic carbon"), h("strong", {}, `${s.carbon} g/kg`), h("span", {}, s.carbonText)),
        h("div", { class: "sl-suits" }, h("small", {}, "Suits"), ...s.suits.map((x) => h("span", { class: "ec-co" }, x))));
      layersBox.replaceChildren(h("h3", { class: "group-title" }, "Layer by layer"),
        ...s.layers.map((l) => h("div", { class: "sl-layer", style: `--c:#${soilColor(l.sand, l.clay, l.soc).getHexString()}` }, h("i", {}), h("span", { class: "sl-depth" }, `${l.from}–${l.to} cm`), h("strong", {}, l.cls), h("small", {}, `pH ${l.ph.toFixed(1)} · carbon ${Math.round(l.soc)} g/kg`))));
      // What if: a cloudburst or a dry spell.
      const rainIn = h("input", { type: "range", min: 0, max: 100, step: 5, value: rainMm, "aria-label": "Rain" }) as HTMLInputElement;
      const etIn = h("input", { type: "range", min: 2, max: 8, step: 0.5, value: 5, "aria-label": "Daily evaporation" }) as HTMLInputElement;
      const out = h("div", { class: "sl-wi-out" });
      const say = () => {
        rainMm = Number(rainIn.value);
        const et = Number(etIn.value), hrs = soakHours(s, rainMm, 30), days = dryDays(s.awc, et);
        const runoff = s.layers[0].ksat < rainMm / 2;
        out.replaceChildren(
          h("p", {}, rainMm ? h("span", {}, h("strong", {}, `${rainMm} mm of rain`), ` reaches 30 cm in about ${hrs != null && hrs < 1 ? "under an hour" : `${hrs} hours`}${runoff ? "; a downpour that size runs off before it soaks in, so expect puddles and erosion on slopes." : "."}`) : "No rain: the block stays dry."),
          h("p", {}, h("strong", {}, `${days} dry days`), ` of water for crops at ${et} mm of evaporation a day (${et >= 6 ? "a hot, sunny spell" : et <= 3 ? "a cool, cloudy spell" : "a typical summer day"}), from a full profile to the point crops start to suffer.`));
      };
      for (const el of [rainIn, etIn]) el.addEventListener("input", say);
      wi.replaceChildren(h("section", { class: "wi on" }, h("header", {}, h("strong", {}, "What if…")),
        h("label", { class: "wi-sev" }, h("span", {}, "Rain"), rainIn, h("output", {}, "")), h("label", { class: "wi-sev" }, h("span", {}, "Evaporation"), etIn, h("output", {}, "")), out));
      const outs = wi.querySelectorAll("output");
      const label = () => { outs[0].textContent = `${rainIn.value} mm`; outs[1].textContent = `${etIn.value} mm/day`; };
      rainIn.addEventListener("input", label); etIn.addEventListener("input", label);
      label(); say();
    } catch {
      view.replaceChildren(h("p", { class: "muted" }, "SoilGrids didn't answer. It's a free research service and can be slow; try again in a minute."));
    }
  })();
}
