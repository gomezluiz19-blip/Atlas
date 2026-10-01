// What moves in an intro when the place is alive rather than built: the
// aurora's curtains over a night sky, a herd crossing the plinth, a river
// running, clouds drifting over mountains, fireflies or glowing water.
// Sizes are symbolic (a wildebeest drawn at true size on a plinth kilometres
// across would vanish), so each effect says how big to draw what moves.
// Offsets are metres east (dx) and north (dy), as for the massing forms.
import * as THREE from "three";

export type Fx =
  /** Curtains of light over a night sky. */
  | { fx: "aurora"; colors?: [string, string] }
  /** Animals (or butterflies, crabs, fish) moving from one side to the other; `fly` lifts them off the ground. */
  | { fx: "herd"; n: number; from: [number, number]; to: [number, number]; spread: number; size: number; color?: string; seconds?: number; fly?: number }
  /** Light running along a river's course. */
  | { fx: "river"; pts: [number, number][]; color?: string; n?: number }
  /** Clouds drifting over the top. */
  | { fx: "clouds"; n?: number }
  /** Points of light near the ground at night: fireflies, glow-worms, glowing water. */
  | { fx: "glow"; n: number; color: string; spread: number; at?: [number, number]; low?: number };

/** Effects that need the night: the scene goes dark around them. */
export const isNight = (fx?: Fx[]) => !!fx?.some((f) => f.fx === "aurora" || f.fx === "glow");

export interface FxScene { update(t: number): void; dispose(): void }

interface Opts {
  model: THREE.Group;
  size: number;
  /** Ground height (model units before the vertical lift) at x east, z south. */
  ground: (x: number, z: number) => number;
  /** The top of the terrain (model units). */
  top: number;
  /** The vertical lift applied to the model, so effects keep their proportions. */
  ex: number;
}

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function makeFx(list: Fx[], o: Opts): FxScene {
  seed = 11;
  const parts: { update(t: number): void; dispose(): void }[] = list.map((f) => {
    switch (f.fx) {
      case "aurora": return aurora(f, o);
      case "herd": return herd(f, o);
      case "river": return river(f, o);
      case "clouds": return clouds(f, o);
      case "glow": return glow(f, o);
    }
  });
  return { update: (t) => parts.forEach((p) => p.update(t)), dispose: () => parts.forEach((p) => p.dispose()) };
}

function aurora(f: Extract<Fx, { fx: "aurora" }>, o: Opts) {
  const [c1, c2] = (f.colors ?? ["#4dffb0", "#9b6bff"]).map((c) => new THREE.Color(c));
  const grp = new THREE.Group();
  const S = o.size, X = 72, Y = 10;
  const base = o.top + (S * 0.05) / o.ex, tall = (S * 0.22) / o.ex;
  const curtains = [0, 1, 2, 3].map((i) => {
    const g = new THREE.PlaneGeometry(S * (1.3 - i * 0.12), tall * (1 - i * 0.12), X - 1, Y - 1);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(X * Y * 3), 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((i - 1.5) * S * 0.08, base + tall * 0.5 + i * tall * 0.08, -S * (0.3 + i * 0.1));
    m.renderOrder = 5;
    grp.add(m);
    return { g, m, phase: i * 1.7, x0: Float32Array.from({ length: X * Y }, (_, q) => (g.attributes.position as THREE.BufferAttribute).getX(q)) };
  });
  o.model.add(grp);
  const col = new THREE.Color();
  return {
    update(t: number) {
      for (const c of curtains) {
        const pos = c.g.attributes.position as THREE.BufferAttribute, cl = c.g.attributes.color as THREE.BufferAttribute;
        for (let q = 0; q < X * Y; q++) {
          const ix = q % X, iy = Math.floor(q / X), u = ix / (X - 1), v = 1 - iy / (Y - 1); // v: 0 bottom, 1 top
          const x = c.x0[q];
          pos.setZ(q, Math.sin(u * 7 + t * 0.35 + c.phase) * S * 0.05 + Math.sin(u * 17 - t * 0.6) * S * 0.012);
          pos.setX(q, x + Math.sin(v * 2 + t * 0.4 + u * 3) * S * 0.006);
          const ray = 0.45 + 0.55 * Math.max(0, Math.sin(u * 23 + t * 0.9 + c.phase) * Math.sin(u * 9 - t * 0.3));
          const fade = Math.pow(1 - v, 1.4) * (0.35 + 0.65 * Math.sin(u * Math.PI)) * ray * 0.55;
          col.copy(c1).lerp(c2, Math.min(1, v * 1.3)).multiplyScalar(fade);
          cl.setXYZ(q, col.r, col.g, col.b);
        }
        pos.needsUpdate = cl.needsUpdate = true;
      }
    },
    dispose() { o.model.remove(grp); curtains.forEach((c) => { c.g.dispose(); (c.m.material as THREE.Material).dispose(); }); },
  };
}

function herd(f: Extract<Fx, { fx: "herd" }>, o: Opts) {
  const n = Math.min(600, f.n);
  const g = new THREE.BoxGeometry(f.size * 1.7, f.size, f.size * 0.7);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: f.color ?? "#5b4a3a", roughness: 0.9 }), n);
  mesh.castShadow = true;
  const [ax, ay] = f.from, [bx, by] = f.to;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const each = Array.from({ length: n }, () => ({ o: (rnd() - 0.5) * f.spread * (0.4 + rnd() * 0.6), p: rnd(), w: rnd() * 6, s: 0.8 + rnd() * 0.4 }));
  const seconds = f.seconds ?? 14, heading = -Math.atan2(-dy, dx);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), s = new THREE.Vector3(), v = new THREE.Vector3();
  o.model.add(mesh);
  return {
    update(t: number) {
      each.forEach((a, i) => {
        const u = (a.p + t / seconds) % 1;
        const x = ax + dx * u + nx * a.o + Math.sin(t * 0.8 + a.w) * f.size;
        const yN = ay + dy * u + ny * a.o;
        const z = -yN;
        const lift = f.fly ? (f.fly + Math.sin(t * 3 + a.w) * f.size * 2) / o.ex : 0;
        v.set(x, o.ground(x, z) + (f.size * 0.5) / o.ex + lift, z);
        s.set(a.s, a.s / o.ex, a.s);
        m.compose(v, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { o.model.remove(mesh); g.dispose(); (mesh.material as THREE.Material).dispose(); },
  };
}

function river(f: Extract<Fx, { fx: "river" }>, o: Opts) {
  const pts = f.pts.map(([x, y]) => new THREE.Vector2(x, -y));
  const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const n = f.n ?? 220, r = o.size / 260;
  const g = new THREE.SphereGeometry(r, 8, 6);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: f.color ?? "#5ab0ff", transparent: true, opacity: 0.85 }), n);
  const each = Array.from({ length: n }, () => ({ p: rnd(), o: (rnd() - 0.5) * r * 6 }));
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1 / o.ex, 1);
  const at = (d: number) => { let i = 0; while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; } const a = pts[i], b = pts[i + 1] ?? a; return a.clone().lerp(b, Math.min(1, d / (lens[i] || 1))); };
  o.model.add(mesh);
  return {
    update(t: number) {
      each.forEach((a, i) => {
        const p = at(((a.p + t / 30) % 1) * total);
        v.set(p.x + a.o, o.ground(p.x, p.y) + r / o.ex, p.y + a.o);
        m.compose(v, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { o.model.remove(mesh); g.dispose(); (mesh.material as THREE.Material).dispose(); },
  };
}

function clouds(f: Extract<Fx, { fx: "clouds" }>, o: Opts) {
  const S = o.size, grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, roughness: 1, depthWrite: false });
  const g = new THREE.SphereGeometry(1, 16, 10);
  const puffs = Array.from({ length: f.n ?? 7 }, () => {
    const c = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(g, mat);
      const r = S * (0.03 + rnd() * 0.03);
      m.scale.set(r * 1.6, (r * 0.55) / o.ex, r);
      m.position.set((i - 1.5) * r * 1.2, 0, (rnd() - 0.5) * r);
      c.add(m);
    }
    c.position.set((rnd() - 0.5) * S, o.top + (S * (0.03 + rnd() * 0.05)) / o.ex, (rnd() - 0.5) * S * 0.9);
    grp.add(c);
    return { c, x0: c.position.x, v: S * (0.006 + rnd() * 0.006) };
  });
  o.model.add(grp);
  return {
    update(t: number) { for (const p of puffs) p.c.position.x = ((p.x0 + p.v * t + S * 0.6) % (S * 1.2)) - S * 0.6; },
    dispose() { o.model.remove(grp); g.dispose(); mat.dispose(); },
  };
}

function glow(f: Extract<Fx, { fx: "glow" }>, o: Opts) {
  const [cx, cy] = f.at ?? [0, 0];
  const pos = new Float32Array(f.n * 3), col = new Float32Array(f.n * 3);
  const each = Array.from({ length: f.n }, () => ({ x: cx + (rnd() - 0.5) * f.spread, z: -(cy + (rnd() - 0.5) * f.spread), h: rnd(), w: rnd() * 10, sp: 0.6 + rnd() * 1.6 }));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.renderOrder = 6;
  const c = new THREE.Color(f.color);
  o.model.add(pts);
  return {
    update(t: number) {
      each.forEach((a, i) => {
        pos[i * 3] = a.x + Math.sin(t * 0.3 + a.w) * f.spread * 0.01;
        pos[i * 3 + 1] = o.ground(a.x, a.z) + ((f.low ?? o.size * 0.004) * (0.3 + a.h)) / o.ex;
        pos[i * 3 + 2] = a.z + Math.cos(t * 0.25 + a.w) * f.spread * 0.01;
        const b = Math.pow(Math.max(0, Math.sin(t * a.sp + a.w)), 6);
        col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
      });
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() { o.model.remove(pts); g.dispose(); (pts.material as THREE.Material).dispose(); },
  };
}
