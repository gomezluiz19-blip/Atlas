// The globe's finish: how the Earth looks when nothing else is asking for a special view.
//   - A house grade on the satellite imagery: Esri's World Imagery is mosaicked flat, so a touch of
//     contrast and colour (and a slightly lower gamma) gives land its depth and sea its weight.
//   - Real sunlight from orbit: the day and night line where it truly is right now, with NASA's Black
//     Marble city lights on the night side, both fading out as you come down to a city, where you want
//     an evenly lit map, not night.
//   - A thinner, richer haze, so land and sea read deep rather than milky, and a blue limb.
//   - A deep-ocean ground colour under tiles still loading, and a softer sun.
//   - From orbit, NASA's Blue Marble with shaded relief and the sea floor: one cloud-free, colour-true
//     mosaic of the whole planet with the ocean ridges and trenches showing through the blue. It hands over
//     to the satellite imagery as you come down, so the Earth is crisp at every height.
import { Color, DynamicAtmosphereLightingType, ImageryLayer, UrlTemplateImageryProvider, type Viewer } from "cesium";

/** The grade every satellite layer wears by default (looks blend away from these). */
export const HOUSE = { brightness: 1.02, contrast: 1.1, saturation: 1.12, gamma: 0.95, hue: 0 } as const;
/** Sunlight shows fully above `from` metres up and has faded out by `to`: orbit lit by the real sun, cities even. */
export const LIGHT_FADE = { from: 7_000_000, to: 2_500_000 } as const;
/** Earth's mean radius: Cesium measures its lighting fades from the centre, not the ground. */
const EARTH_R = 6_371_000;
export const OCEAN = "#0d2033";

/** Blue Marble shows fully above `full` metres and is gone below `gone`: orbit is NASA's, the ground is the satellite's. */
export const FAR = { full: 5_000_000, gone: 1_800_000 } as const;
const BLUE_MARBLE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";

/** How much of the Blue Marble to show from a camera height (pure, smoothstepped). */
export function farAlpha(heightM: number): number {
  const t = Math.min(1, Math.max(0, (heightM - FAR.gone) / (FAR.full - FAR.gone)));
  return t * t * (3 - 2 * t);
}

/** How much of the city lights to show from a camera height (pure): all of them from orbit, none at street level. */
export function lightsAlpha(heightM: number): number {
  const t = Math.min(1, Math.max(0, (heightM - LIGHT_FADE.to) / (LIGHT_FADE.from - LIGHT_FADE.to)));
  return t * t * (3 - 2 * t);
}

/** Where the sun is overhead right now, to a degree or so (pure). */
export function subsolar(d: Date): { lon: number; lat: number } {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0), doy = (d.getTime() - start) / 864e5;
  const g = (2 * Math.PI / 365) * (doy - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lon = -((utcMin + eot) / 4 - 180);
  return { lon: ((lon + 540) % 360) - 180, lat: (decl * 180) / Math.PI };
}

/** The far-field layer: Blue Marble, faded in by height (the caller adds it above the satellite imagery). */
export function blueMarble(viewer: Viewer): ImageryLayer {
  const provider = new UrlTemplateImageryProvider({ url: BLUE_MARBLE, maximumLevel: 8, credit: "Blue Marble: NASA Earth Observatory, via NASA GIBS" });
  // A missing tile isn't worth three retries: the satellite imagery is right underneath.
  provider.errorEvent.addEventListener((e: { retry: boolean }) => { e.retry = false; });
  const layer = new ImageryLayer(provider, { alpha: farAlpha(viewer.camera.positionCartographic.height) });
  // After each frame, set the fade for the height the camera is at (postRender, so it never keeps the globe redrawing).
  viewer.scene.postRender.addEventListener(() => {
    const a = farAlpha(viewer.camera.positionCartographic.height);
    if (Math.abs(a - layer.alpha) > 0.004) { layer.alpha = a; viewer.scene.requestRender(); }
  });
  return layer;
}

const NIGHT_LIGHTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";

export function finishGlobe(viewer: Viewer) {
  const { scene } = viewer, globe = scene.globe;
  globe.baseColor = Color.fromCssColorString(OCEAN);
  // Sunlight, faded by height (Cesium's fade distances run from the Earth's centre).
  globe.enableLighting = true;
  globe.lightingFadeInDistance = EARTH_R + LIGHT_FADE.from;
  globe.lightingFadeOutDistance = EARTH_R + LIGHT_FADE.to;
  // The haze follows the real sun too, so the terminator is a true line of dusk across the planet. Cesium would
  // also swap the whole night side for dark haze from far out, hiding the land and its city lights: the night
  // fade is set so that never happens (the ground's own shading carries the night instead).
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;
  globe.nightFadeInDistance = 0;
  globe.nightFadeOutDistance = 1;
  // Kept for when terrain brings vertex normals (Cesium ion): night at about a third of daylight.
  globe.vertexShadowDarkness = 0.32;
  globe.lambertDiffuseMultiplier = 0.75;
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = 11;
  const atm = (scene as unknown as { atmosphere?: { dynamicLighting: DynamicAtmosphereLightingType; brightnessShift: number; saturationShift: number } }).atmosphere;
  // Less haze, more colour: the land and sea read deep rather than milky (tuned by eye from orbit, day and night).
  if (atm) { atm.dynamicLighting = DynamicAtmosphereLightingType.NONE; atm.brightnessShift = -0.25; atm.saturationShift = 0.1; }
  const sky = scene.skyAtmosphere;
  if (sky) { sky.perFragmentAtmosphere = true; sky.saturationShift = 0.06; sky.brightnessShift = 0.03; sky.hueShift = -0.01; }
  // A sun, not a lens flare.
  if (scene.sun) scene.sun.glowFactor = 0.55;
  // The skybox's stars, dimmed so the Earth is the brightest thing on screen.
  if (scene.skyBox) (scene.skyBox as unknown as { alpha?: number }).alpha = 0.75;
  // City lights on the night side, nothing by day.
  const lights = new ImageryLayer(new UrlTemplateImageryProvider({ url: NIGHT_LIGHTS, maximumLevel: 8, credit: "Night lights: NASA Black Marble" }), { dayAlpha: 0, nightAlpha: 0.7 });
  lights.brightness = 1.6;
  // The lights are a view from orbit: they fade with the sunlight as you come down to a city.
  viewer.scene.postRender.addEventListener(() => {
    const a = lightsAlpha(viewer.camera.positionCartographic.height);
    if (Math.abs(a - lights.alpha) > 0.004) { lights.alpha = a; viewer.scene.requestRender(); }
  });
  return lights;
}

/** Applies the house grade to a satellite layer. */
export function gradeLayer(layer: ImageryLayer) {
  layer.brightness = HOUSE.brightness; layer.contrast = HOUSE.contrast; layer.saturation = HOUSE.saturation; layer.gamma = HOUSE.gamma; layer.hue = HOUSE.hue;
}
