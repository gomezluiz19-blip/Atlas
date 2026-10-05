// Grades: the whole picture treated the way a film colourist, a photographer or an architect's renderer would.
// Real GPU post-processing on the globe (not CSS filters), so captures, buildings and terrain are all graded
// together, and the time of day and sun shadows are real:
//   Natural · Cinematic (ACES tone mapping, bloom, ambient occlusion, sun shadows, vignette and grain)
//   Golden hour (the sun set low for this place, long shadows, warm) · Night (the dark side, cool, glowing)
//   Blueprint (edges from depth and colour, white on blue) · Thermal (false colour by brightness)
//   Tilt-shift (the miniature look: a sharp band and blurred top and bottom, from large-format photography)
// Expensive parts (shadows, ambient occlusion, HDR) are only switched on where the device has the headroom.
import { Cartographic, JulianDate, PostProcessStage, PostProcessStageLibrary, ShadowMode, Tonemapper, type PostProcessStageComposite, type Viewer } from "cesium";
import type { App } from "../app";
import { wake } from "../globe/motion";
import { currentQuality } from "../globe/quality";

export type GradeId = "natural" | "cinematic" | "golden" | "night" | "blueprint" | "thermal" | "tiltshift";
export const GRADES: { id: GradeId; label: string; about: string }[] = [
  { id: "natural", label: "Natural", about: "The globe as it is" },
  { id: "cinematic", label: "Cinematic", about: "Film tone curve, bloom, soft contact shadows, sun shadows, vignette and grain" },
  { id: "golden", label: "Golden hour", about: "The sun low for this place, long real shadows, warm light" },
  { id: "night", label: "Night", about: "The dark side of the planet, cool and glowing" },
  { id: "blueprint", label: "Blueprint", about: "Edges from depth and colour, drawn white on blue" },
  { id: "thermal", label: "Thermal", about: "False colour by brightness, like a heat camera" },
  { id: "tiltshift", label: "Tilt-shift", about: "The miniature look: a sharp band, the top and bottom blurred" },
];

const FILM = `
uniform sampler2D colorTexture;
uniform float vignette;
uniform float grain;
uniform vec3 tint;
in vec2 v_textureCoordinates;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  vec2 d = v_textureCoordinates - 0.5;
  float v = 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.15, 1.0)));
  float n = (hash(v_textureCoordinates * 1024.0 + mod(czm_frameNumber, 97.0)) - 0.5) * grain;
  out_FragColor = vec4((c.rgb * tint) * v + n, c.a);
}`;

const THERMAL = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
vec3 ramp(float t) {
  vec3 a = vec3(0.02, 0.0, 0.08), b = vec3(0.45, 0.05, 0.6), c = vec3(0.95, 0.2, 0.15), d = vec3(1.0, 0.85, 0.1), e = vec3(1.0);
  return t < 0.25 ? mix(a, b, t / 0.25) : t < 0.5 ? mix(b, c, (t - 0.25) / 0.25) : t < 0.8 ? mix(c, d, (t - 0.5) / 0.3) : mix(d, e, (t - 0.8) / 0.2);
}
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  out_FragColor = vec4(ramp(clamp(l * 1.15, 0.0, 1.0)), c.a);
}`;

const BLUEPRINT = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;
float lum(vec2 uv) { return dot(texture(colorTexture, uv).rgb, vec3(0.299, 0.587, 0.114)); }
float dep(vec2 uv) { return czm_unpackDepth(texture(depthTexture, uv)); }
void main() {
  vec2 px = 1.0 / czm_viewport.zw;
  float gx = lum(v_textureCoordinates + vec2(px.x, 0.0)) - lum(v_textureCoordinates - vec2(px.x, 0.0));
  float gy = lum(v_textureCoordinates + vec2(0.0, px.y)) - lum(v_textureCoordinates - vec2(0.0, px.y));
  float dx = dep(v_textureCoordinates + vec2(px.x, 0.0)) - dep(v_textureCoordinates - vec2(px.x, 0.0));
  float dy = dep(v_textureCoordinates + vec2(0.0, px.y)) - dep(v_textureCoordinates - vec2(0.0, px.y));
  float e = clamp(length(vec2(gx, gy)) * 3.0 + length(vec2(dx, dy)) * 400.0, 0.0, 1.0);
  vec2 grid = abs(fract(v_textureCoordinates * czm_viewport.zw / 40.0) - 0.5);
  float g = (1.0 - smoothstep(0.0, 0.03, min(grid.x, grid.y))) * 0.12;
  vec3 paper = vec3(0.06, 0.24, 0.52);
  out_FragColor = vec4(mix(paper + g, vec3(0.92, 0.96, 1.0), e), 1.0);
}`;

const TILTSHIFT = `
uniform sampler2D colorTexture;
uniform float focus;
uniform float band;
in vec2 v_textureCoordinates;
void main() {
  float b = smoothstep(band, band + 0.25, abs(v_textureCoordinates.y - focus)) * 6.0;
  vec2 px = b / czm_viewport.zw;
  vec4 acc = vec4(0.0);
  float w = 0.0;
  for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
    float k = exp(-float(i * i + j * j) / 8.0);
    acc += texture(colorTexture, v_textureCoordinates + vec2(float(i), float(j)) * px) * k;
    w += k;
  }
  vec4 c = acc / w;
  // Miniatures look saturated and bright.
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  out_FragColor = vec4(mix(vec3(l), c.rgb, 1.35) * 1.05, c.a);
}`;

/** The hour (local solar time) of sunset for a latitude and day of the year (pure; −1 for polar day or night). */
export function sunsetSolarHour(lat: number, dayOfYear: number): number {
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const x = -Math.tan((lat * Math.PI) / 180) * Math.tan((decl * Math.PI) / 180);
  if (x <= -1 || x >= 1) return -1;
  return 12 + (Math.acos(x) * 180) / Math.PI / 15;
}
/** A moment, as a UTC Date, a given number of hours of local solar time on a day, at a longitude (pure). */
export function solarMoment(day: Date, lon: number, solarHour: number): Date {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  return new Date(d.getTime() + (solarHour - lon / 15) * 3_600_000);
}

interface Saved { lighting: boolean; hdr: boolean; tonemapper: Tonemapper; shadows: boolean; time: JulianDate; animate: boolean; bloom: boolean; ao: boolean }
let saved: Saved | null = null, stages: (PostProcessStage | PostProcessStageComposite)[] = [], active: GradeId = "natural";
export const currentGrade = () => active;

function restore(viewer: Viewer) {
  const s = viewer.scene;
  for (const st of stages) s.postProcessStages.remove(st);
  stages = [];
  if (saved) {
    s.globe.enableLighting = saved.lighting; s.highDynamicRange = saved.hdr; s.postProcessStages.tonemapper = saved.tonemapper;
    viewer.shadows = saved.shadows; viewer.clock.currentTime = saved.time; viewer.clock.shouldAnimate = saved.animate;
    s.postProcessStages.bloom.enabled = saved.bloom; s.postProcessStages.ambientOcclusion.enabled = saved.ao;
    saved = null;
  }
}

/** Applies a grade to the globe (and undoes the last one). */
export function applyGrade(app: App, id: GradeId) {
  const viewer = app.globe.viewer, s = viewer.scene, pp = s.postProcessStages;
  restore(viewer);
  active = id;
  if (id === "natural") { wake(500); return; }
  saved = { lighting: s.globe.enableLighting, hdr: s.highDynamicRange, tonemapper: pp.tonemapper, shadows: viewer.shadows, time: viewer.clock.currentTime.clone(), animate: viewer.clock.shouldAnimate, bloom: pp.bloom.enabled, ao: pp.ambientOcclusion.enabled };
  const tier = currentQuality().tier, rich = tier !== "low", richest = tier === "high";
  const add = <T extends PostProcessStage | PostProcessStageComposite>(st: T) => { pp.add(st); stages.push(st); return st; };
  const film = (vignette: number, grain: number, tint: [number, number, number]) => add(new PostProcessStage({ fragmentShader: FILM, uniforms: { vignette, grain, tint: { x: tint[0], y: tint[1], z: tint[2] } as never } }));
  const sunAt = (hour: number) => {
    const c = Cartographic.fromCartesian(viewer.camera.positionWC);
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = JulianDate.fromDate(solarMoment(new Date(), (c.longitude * 180) / Math.PI, hour));
    s.globe.enableLighting = true;
  };
  const shadows = () => { if (!rich) return; viewer.shadows = true; viewer.terrainShadows = ShadowMode.RECEIVE_ONLY; if (viewer.shadowMap) { viewer.shadowMap.softShadows = richest; viewer.shadowMap.darkness = 0.45; viewer.shadowMap.maximumDistance = 3000; } };

  if (id === "cinematic") {
    if (rich) { s.highDynamicRange = true; pp.tonemapper = Tonemapper.ACES; }
    pp.bloom.enabled = true;
    pp.bloom.uniforms.contrast = 119; pp.bloom.uniforms.brightness = -0.3; pp.bloom.uniforms.sigma = 3; pp.bloom.uniforms.stepSize = 1;
    if (richest) { pp.ambientOcclusion.enabled = true; pp.ambientOcclusion.uniforms.intensity = 2.2; pp.ambientOcclusion.uniforms.lengthCap = 0.06; }
    shadows();
    film(0.55, 0.035, [1.02, 1.0, 0.97]);
  } else if (id === "golden") {
    const c = Cartographic.fromCartesian(viewer.camera.positionWC), now = new Date();
    const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
    const set = sunsetSolarHour((c.latitude * 180) / Math.PI, doy);
    sunAt(set > 0 ? set - 0.6 : 17.5);
    shadows();
    if (rich) { s.highDynamicRange = true; pp.tonemapper = Tonemapper.ACES; }
    film(0.45, 0.02, [1.12, 0.98, 0.82]);
  } else if (id === "night") {
    sunAt(0.5);
    pp.bloom.enabled = true; pp.bloom.uniforms.contrast = 128; pp.bloom.uniforms.brightness = -0.15; pp.bloom.uniforms.sigma = 4;
    film(0.6, 0.03, [0.75, 0.85, 1.15]);
  } else if (id === "blueprint") {
    add(new PostProcessStage({ fragmentShader: BLUEPRINT }));
  } else if (id === "thermal") {
    add(new PostProcessStage({ fragmentShader: THERMAL }));
  } else if (id === "tiltshift") {
    add(new PostProcessStage({ fragmentShader: TILTSHIFT, uniforms: { focus: 0.55, band: 0.08 } }));
  }
  // Silhouette edges make 3D captures and buildings read cleanly in the cinematic grade on strong devices.
  if (id === "cinematic" && richest) add(PostProcessStageLibrary.createSilhouetteStage());
  wake(800);
}
