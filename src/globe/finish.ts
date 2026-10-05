// The globe's finish: how the Earth looks when nothing else is asking for a special view.
//   - A house grade on the satellite imagery: Esri's World Imagery is mosaicked flat, so a touch of
//     contrast and colour (and a slightly lower gamma) gives land its depth and sea its weight.
//   - Real sunlight from orbit: the day and night line where it truly is right now, with NASA's Black
//     Marble city lights on the night side, both fading out as you come down to a city, where you want
//     an evenly lit map, not night.
//   - A thinner, richer haze, so land and sea read deep rather than milky, and a blue limb.
//   - A deep-ocean ground colour under tiles still loading, and a softer sun.
import { Color, DynamicAtmosphereLightingType, ImageryLayer, UrlTemplateImageryProvider, type Viewer } from "cesium";

/** The grade every satellite layer wears by default (looks blend away from these). */
export const HOUSE = { brightness: 1.02, contrast: 1.1, saturation: 1.12, gamma: 0.95, hue: 0 } as const;
/** Lighting shows from this high up and fades out by this height (metres): orbit lit, cities even. */
export const LIGHT_FADE = { from: 1.6e7, to: 6.5e6 } as const;
export const OCEAN = "#0d2033";

const NIGHT_LIGHTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";

export function finishGlobe(viewer: Viewer) {
  const { scene } = viewer, globe = scene.globe;
  globe.baseColor = Color.fromCssColorString(OCEAN);
  // Sunlight, faded by height.
  globe.enableLighting = true;
  // The ground's haze is lit evenly: sun-lit haze paints the whole night side black from orbit.
  globe.dynamicAtmosphereLighting = false;
  globe.lightingFadeInDistance = LIGHT_FADE.from;
  globe.lightingFadeOutDistance = LIGHT_FADE.to;
  globe.nightFadeInDistance = LIGHT_FADE.from;
  globe.nightFadeOutDistance = LIGHT_FADE.to;
  // Night is dusk, not a black hole: the land still reads at about half light under its city lights.
  globe.vertexShadowDarkness = 0.6;
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
  const lights = new ImageryLayer(new UrlTemplateImageryProvider({ url: NIGHT_LIGHTS, maximumLevel: 8, credit: "Night lights: NASA Black Marble" }), { dayAlpha: 0, nightAlpha: 0.55 });
  lights.brightness = 1.6;
  return lights;
}

/** Applies the house grade to a satellite layer. */
export function gradeLayer(layer: ImageryLayer) {
  layer.brightness = HOUSE.brightness; layer.contrast = HOUSE.contrast; layer.saturation = HOUSE.saturation; layer.gamma = HOUSE.gamma; layer.hue = HOUSE.hue;
}
