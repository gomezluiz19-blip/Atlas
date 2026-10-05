// Procedural facades for the enterprise buildings, from architectural visualisation: every floor slab is
// built here as its own walls and roof, with texture coordinates in metres along the facade, so a shader can
// draw windows at a real spacing (about every 3 m) on every wall. By day the glass catches the sun; when
// the sun is below the local horizon (the globe's real time of day) a random share of rooms light up warm.
// Ghost floors (planned, not built) stay plain glass-like volumes. All in one batched primitive.
import { BoundingSphere, Cartesian3, ComponentDatatype, Ellipsoid, Geometry, GeometryAttribute, GeometryAttributes, PerInstanceColorAppearance, PrimitiveType } from "cesium";

/** Spacing of window bays along a facade, metres. */
export const BAY = 3.2;

/**
 * One floor of a building between two heights above the ellipsoid: four walls (or as many as the footprint
 * has sides) and a roof, with normals and facade coordinates (s = metres along the facade / BAY, t = 0 at the
 * floor to 1 at the ceiling).
 */
export function floorGeometry(corners: [number, number][], bottom: number, top: number): Geometry {
  const pos: number[] = [], nrm: number[] = [], st: number[] = [], idx: number[] = [];
  const lo = corners.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, bottom));
  const hi = corners.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, top));
  // Outward is away from the footprint's centre.
  const centre = Cartesian3.fromDegrees(corners.reduce((a, c) => a + c[0], 0) / corners.length, corners.reduce((a, c) => a + c[1], 0) / corners.length, (bottom + top) / 2);
  const up = Ellipsoid.WGS84.geodeticSurfaceNormal(centre, new Cartesian3());
  let along = 0;
  const push = (p: Cartesian3, n: Cartesian3, s: number, t: number) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); st.push(s, t); return pos.length / 3 - 1; };
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    const edge = Cartesian3.subtract(lo[j], lo[i], new Cartesian3());
    const len = Cartesian3.magnitude(edge);
    const n = Cartesian3.normalize(Cartesian3.cross(edge, up, new Cartesian3()), new Cartesian3());
    const mid = Cartesian3.midpoint(lo[i], lo[j], new Cartesian3());
    if (Cartesian3.dot(n, Cartesian3.subtract(mid, centre, new Cartesian3())) < 0) Cartesian3.negate(n, n);
    const s0 = along / BAY, s1 = (along + len) / BAY;
    const a = push(lo[i], n, s0, 0), b = push(lo[j], n, s1, 0), c = push(hi[j], n, s1, 1), d = push(hi[i], n, s0, 1);
    idx.push(a, b, c, a, c, d);
    along += len;
  }
  // Roof: a fan (footprints are convex).
  const r0 = pos.length / 3;
  for (const p of hi) push(p, up, 0, 0);
  for (let i = 1; i < hi.length - 1; i++) idx.push(r0, r0 + i, r0 + i + 1);
  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(pos) });
  attributes.normal = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(nrm) });
  attributes.st = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(st) });
  return new Geometry({ attributes, indices: new Uint32Array(idx), primitiveType: PrimitiveType.TRIANGLES, boundingSphere: BoundingSphere.fromPoints([...lo, ...hi]) });
}

const VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in vec4 color;
in float batchId;
out vec3 v_positionEC;
out vec3 v_normalEC;
out vec3 v_upEC;
out vec4 v_color;
out vec2 v_st;
out float v_wall;
void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  vec3 upWC = normalize(position3DHigh + position3DLow);
  v_upEC = czm_normal * upWC;
  v_wall = 1.0 - abs(dot(normalize(normal), upWC));
  v_color = color;
  v_st = st;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;

const FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec3 v_upEC;
in vec4 v_color;
in vec2 v_st;
in float v_wall;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec3 n = normalize(v_normalEC);
  if (!gl_FrontFacing) n = -n;
  vec3 base = v_color.rgb;
  float alpha = v_color.a;
  vec3 L = normalize(czm_lightDirectionEC);
  float lit = 0.5 + 0.5 * max(dot(n, L), 0.0);
  vec3 col = base * lit;
  if (v_wall > 0.5 && alpha > 0.4) {
    vec2 f = vec2(fract(v_st.x), v_st.y);
    float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.3, f.y) * step(f.y, 0.8);
    // Sun height over the local horizon: day glass, night rooms.
    float sunUp = dot(normalize(czm_sunDirectionEC), normalize(v_upEC));
    float night = smoothstep(0.08, -0.12, sunUp);
    vec3 V = normalize(-v_positionEC);
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 24.0) * (1.0 - night);
    vec3 glassDay = mix(base * 0.55, vec3(0.62, 0.74, 0.86), 0.55) * lit + spec * 0.6;
    float on = step(0.42, hash(vec2(floor(v_st.x), floor(v_positionEC.z * 0.0) + v_color.r * 97.0 + v_color.g * 13.0)));
    vec3 glassNight = mix(vec3(0.05, 0.07, 0.1), vec3(1.0, 0.8, 0.48) * 1.3, on);
    vec3 glass = mix(glassDay, glassNight, night);
    // Mullions and the slab edge read as a slightly darker frame.
    col = mix(col * (1.0 - 0.25 * night), glass, win);
  }
  out_FragColor = vec4(col, alpha);
}`;

/** The appearance that draws the facades (per-floor colour from the instance, windows from the shader). */
export function facadeAppearance(): PerInstanceColorAppearance {
  return new PerInstanceColorAppearance({ translucent: true, closed: false, vertexShaderSource: VS, fragmentShaderSource: FS });
}
