// The 3D block view (three.js, loaded only when a block is opened).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { h } from "../ui/dom";
import { faceTexture, type BlockData } from "./block";

const W = 10; // the block is 10 units across

export function createBlockView(d: BlockData, name: string, onClose?: () => void) {
  const el = h("div", { class: "block-view", role: "dialog", "aria-label": `${name} block` });
  const canvasHost = h("div", { class: "block-canvas" });
  el.append(canvasHost,
    h("div", { class: "block-top" },
      h("button", { class: "solar-back", onclick: () => { onClose?.(); dispose(); } }, "‹ Back to the globe"),
      h("div", { class: "solar-title" }, h("strong", {}, name), h("span", { class: "solar-date" }, "Drag to turn · scroll to zoom"))));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  camera.position.set(9, 8, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.5, 0);
  controls.maxPolarAngle = Math.PI * 0.95;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-8, 14, -6);
  scene.add(sun);

  const relief = Math.max(1, d.zmax - d.bottom);
  // Auto exaggeration: flat blocks get lifted so their shape reads.
  let ex = Math.min(5, Math.max(1, Math.round(((0.35 * d.size) / relief) * 2) / 2));
  const yOf = (z: number) => ((z - d.bottom) / d.size) * W * ex;
  const N = Math.round(Math.sqrt(d.heights.length));

  // Top surface.
  const top = new THREE.PlaneGeometry(W, W, N - 1, N - 1);
  top.rotateX(-Math.PI / 2); // rows run north (−z) to south (+z)
  const topTex = d.image ? new THREE.CanvasTexture(d.image) : null;
  if (topTex) topTex.colorSpace = THREE.SRGBColorSpace;
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, color: topTex ? 0xffffff : 0x7d8c5a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const topMesh = new THREE.Mesh(top, topMat);
  scene.add(topMesh);

  // Four faces from the sections.
  const faces: { mesh: THREE.Mesh; out: THREE.Vector3; geo: THREE.BufferGeometry; tops: number[] }[] = [];
  const corners = [
    [[W / 2, -W / 2], [-W / 2, -W / 2]], // north: east → west
    [[W / 2, W / 2], [W / 2, -W / 2]], // east: south → north
    [[-W / 2, W / 2], [W / 2, W / 2]], // south: west → east
    [[-W / 2, -W / 2], [-W / 2, W / 2]], // west: north → south
  ];
  const outs = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)];
  d.sides.forEach((sd, f) => {
    const n = sd.elevation.length;
    const [[x0, z0], [x1, z1]] = corners[f];
    const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx: number[] = [];
    const tops: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      tops.push(Math.max(sd.elevation[i], 0));
      pos.set([x, 0, z], i * 6);
      pos.set([x, 0, z], i * 6 + 3);
      uv.set([t, 1, t, 0], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = new THREE.CanvasTexture(faceTexture(sd));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
    scene.add(mesh);
    faces.push({ mesh, out: outs[f], geo, tops });
  });

  // The base, and the sea surface where there is sea.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2520, side: THREE.DoubleSide }));
  scene.add(base);
  const water = d.zmin < 0 ? new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f7fd0, transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.1 })) : null;
  if (water) scene.add(water);

  const applyHeights = () => {
    const p = top.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < N * N; k++) p.setY(k, yOf(d.heights[k]));
    p.needsUpdate = true;
    top.computeVertexNormals();
    for (const f of faces) {
      const fp = f.geo.attributes.position as THREE.BufferAttribute;
      f.tops.forEach((t, i) => { fp.setY(i * 2, yOf(t)); fp.setY(i * 2 + 1, 0); });
      fp.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
    if (water) water.position.y = yOf(0);
    controls.target.set(0, yOf((d.zmin + d.zmax) / 2) * 0.7, 0);
  };
  applyHeights();

  // A north arrow.
  const northCanvas = document.createElement("canvas");
  northCanvas.width = northCanvas.height = 128;
  const ng = northCanvas.getContext("2d")!;
  ng.fillStyle = "#fff"; ng.font = "bold 72px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif"; ng.textAlign = "center"; ng.textBaseline = "middle"; ng.fillText("N", 64, 70);
  const north = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(northCanvas), transparent: true }));
  north.scale.set(0.9, 0.9, 1);
  scene.add(north);

  let xray = false, explode = 0, explodeTarget = 0, spin = false, raf = 0, disposed = false;
  const resize = () => {
    const w = canvasHost.clientWidth || innerWidth, hh = canvasHost.clientHeight || innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  const loop = () => {
    explode += (explodeTarget - explode) * 0.12;
    faces.forEach((f) => f.mesh.position.copy(f.out.clone().multiplyScalar(explode * 2.2)));
    topMesh.position.y = explode * 0.7;
    if (water) water.position.y = yOf(0) + explode * 0.7;
    base.position.y = -explode * 0.8;
    north.position.set(0, yOf(d.zmax) + 1.2 + explode * 1.6, -W / 2 - 0.9 - explode * 2.2);
    controls.autoRotate = spin;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  requestAnimationFrame(() => { el.classList.add("in"); resize(); loop(); });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    controls.dispose();
    renderer.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      (mat as THREE.MeshStandardMaterial | undefined)?.map?.dispose();
      mat?.dispose();
    });
    el.remove();
  };

  return {
    el,
    get exaggeration() { return ex; },
    setExaggeration(v: number) { ex = v; applyHeights(); },
    toggleXray() {
      xray = !xray;
      topMat.transparent = xray;
      topMat.opacity = xray ? 0.28 : 1;
      topMat.depthWrite = !xray;
      topMat.needsUpdate = true;
      return xray;
    },
    toggleExplode() { explodeTarget = explodeTarget ? 0 : 1; return !!explodeTarget; },
    toggleSpin() { spin = !spin; return spin; },
    savePng(file: string) {
      renderer.render(scene, camera);
      const a = document.createElement("a");
      a.href = renderer.domElement.toDataURL("image/png");
      a.download = file;
      a.click();
    },
    dispose,
  };
}
