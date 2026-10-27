// Creates and configures the Cesium globe, and owns its layer stack.
import {
  buildModuleUrl,
  Cartesian2,
  Cartographic,
  Cesium3DTileset,
  CesiumTerrainProvider,
  createGooglePhotorealistic3DTileset,
  type Credit,
  Google2DImageryProvider,
  GoogleMaps,
  type ImageryProvider,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  TileMapServiceImageryProvider,
  type TileProviderError,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";
import { config } from "../config";
import { GEOLOGIC_MAP_TILES } from "../data/macrostrat";
import { GBIF_DENSITY_TILES } from "../data/inaturalist";
import { createAnalyticLayer, type AnalyticKind } from "./analyticLayers";
import { initMotion } from "./motion";
import { currentQuality } from "./quality";
import { imagery, renderedMap } from "./imagery";
import { googleLocale, googleSessionBody, OSM_FALLBACK, tileWorks, type GoogleLayer } from "./basemap";
import { createTerrariumTerrain, terrainOptions } from "./terrain";
import { blueMarble, finishGlobe, gradeLayer, HOUSE, RENDERED, RENDERED_NIGHT, type Grade } from "./finish";

/** Rendered: a drawn street map with clay buildings, the default (docs/design.md › The map). */
export type BaseMap = "rendered" | "satellite" | "plain";
const BASE_KEY = "atlas.base";
const savedBase = (): BaseMap => {
  try { const v = localStorage.getItem(BASE_KEY); if (v === "rendered" || v === "satellite" || v === "plain") return v; } catch { /* storage unavailable */ }
  return "rendered";
};
/** Night by the device's setting: the rendered map goes to slate with the rest of the interface. */
const darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
export type OverlayKind = Exclude<AnalyticKind, "depth"> | "geology" | "species";

interface LayerState {
  base: BaseMap;
  overlays: Record<OverlayKind, { on: boolean; opacity: number }>;
  exaggeration: number;
  bathymetry: boolean;
  photorealistic: boolean;
  /** Street and place names over the imagery, once zoomed in. */
  streets: boolean;
}

export class Globe {
  readonly viewer: Viewer;
  private satellite: ImageryLayer;
  /** The rendered map's ground, by day and by night, and its names on top. */
  private rendered: { day: ImageryLayer; night: ImageryLayer; dayLabels: ImageryLayer | null; nightLabels: ImageryLayer | null };
  /** Blue Marble, the far-field base (globe/finish.ts). */
  private far: ImageryLayer;
  private streetLayers: ImageryLayer[] = [];
  private backup: ImageryLayer;
  /** Messages worth showing the user (e.g. imagery failover). */
  onNotice?: (message: string) => void;
  private overlays = new Map<OverlayKind, ImageryLayer>();
  private photoreal: Cesium3DTileset | null = null;
  readonly state: LayerState = {
    base: savedBase(),
    overlays: {
      hillshade: { on: true, opacity: 0.4 },
      elevation: { on: false, opacity: 0.6 },
      slope: { on: false, opacity: 0.7 },
      contours: { on: false, opacity: 0.9 },
      geology: { on: false, opacity: 0.6 },
      species: { on: false, opacity: 0.85 },
    },
    exaggeration: 1,
    bathymetry: false,
    photorealistic: Boolean(config.googleMapsKey),
    streets: true,
  };
  /** Google's photorealistic 3D, while the key works for it (it turns itself off if Google refuses). */
  get hasPhotoreal() { return Boolean(config.googleMapsKey) && !this.photorealFailed; }
  private photorealFailed = false;
  /** Which source the drawn map and the photographs come from now (for the credits and the docs). */
  source: { map: "google" | "esri" | "custom" | "osm"; photos: "google" | "esri" | "maptiler" | "mapbox" | "eox" } = { map: config.renderedTiles ? "custom" : "esri", photos: imagery().id };
  private applied: (() => void)[] = [];
  /** Calls `fn` after every apply() (to mirror layer state elsewhere, or restyle with the map). */
  whenApplied(fn: () => void) {
    this.applied.push(fn);
  }
  readonly hasIonTerrain = Boolean(config.cesiumIonToken);

  constructor(container: HTMLElement, creditContainer: HTMLElement) {
    Ion.defaultAccessToken = config.cesiumIonToken;
    this.viewer = new Viewer(container, {
      baseLayer: false,
      terrainProvider: createTerrariumTerrain(),
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer,
      // Errors are handled in keepRendering() rather than with Cesium's modal.
      showRenderLoopErrors: false,
      // Order-independent translucency costs extra render passes and buffers every frame. Worth it where the
      // GPU has headroom (overlapping glassy models blend exactly); on low-tier devices plain sorting is fine.
      orderIndependentTranslucency: currentQuality().tier !== "low",
    });
    const { scene } = this.viewer;
    scene.globe.depthTestAgainstTerrain = true;
    // Smooth movement: the tiles around the view and a few more levels at a time load ahead, so panning and zooming
    // never show blank paper; slower devices keep to the view itself.
    const q = currentQuality();
    scene.globe.preloadSiblings = q.tier !== "low";
    scene.globe.loadingDescendantLimit = q.tier === "high" ? 48 : q.tier === "mid" ? 32 : 20;
    scene.globe.showGroundAtmosphere = true;
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    this.keepRendering();
    // Pixels, terrain detail, tile cache and redraws, fitted to this device (globe/quality.ts).
    initMotion(this.viewer);

    // Offline fallback imagery bundled with Cesium, under the satellite layer.
    TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")).then((p) =>
      this.viewer.imageryLayers.add(new ImageryLayer(p), 0),
    );
    // Backup satellite imagery (Sentinel-2 cloudless), shown only if Esri's tiles start failing.
    this.backup = new ImageryLayer(
      new UrlTemplateImageryProvider({
        url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
        maximumLevel: 15,
        credit: "Sentinel-2 cloudless 2020 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020)",
      }),
      { show: false },
    );
    this.viewer.imageryLayers.add(this.backup);
    const src = imagery();
    const esri = new UrlTemplateImageryProvider({ url: src.template, maximumLevel: src.maximumLevel, credit: src.credit });
    this.satellite = new ImageryLayer(esri);
    this.viewer.imageryLayers.add(this.satellite);
    // The rendered map, over the satellite imagery and under Blue Marble (which still takes over from orbit).
    const map = renderedMap();
    const tiles = (url: string, dark: boolean, show = true, minimumTerrainLevel?: number) =>
      new ImageryLayer(new UrlTemplateImageryProvider({ url, subdomains: map.subdomains, maximumLevel: dark ? map.darkMaximumLevel ?? map.maximumLevel : map.maximumLevel, credit: map.credit }), { show, minimumTerrainLevel });
    // Its own names (muted, like the deck), once past the whole-planet view.
    this.rendered = {
      day: tiles(map.ground(false), false), night: tiles(map.ground(true), true, false),
      dayLabels: map.labels(false) ? tiles(map.labels(false), false, true, 3) : null, nightLabels: map.labels(true) ? tiles(map.labels(true), true, false, 3) : null,
    };
    this.viewer.imageryLayers.add(this.rendered.day);
    this.viewer.imageryLayers.add(this.rendered.night);
    // From orbit: NASA's Blue Marble over the satellite imagery, fading out as the camera comes down.
    this.far = blueMarble(this.viewer);
    this.viewer.imageryLayers.add(this.far);
    // The house finish (globe/finish.ts): the grade on every base layer, sunlight from orbit, city lights at night.
    const nightLights = finishGlobe(this.viewer);
    this.addUnder(nightLights);
    for (const l of this.baseLayers()) gradeLayer(l, this.gradeOf(l));
    this.watchImagery(esri);
    const geology = new ImageryLayer(
      new UrlTemplateImageryProvider({ url: GEOLOGIC_MAP_TILES, maximumLevel: 16, credit: "Geology: Macrostrat (CC-BY 4.0)" }),
    );
    this.overlays.set("geology", geology);
    this.viewer.imageryLayers.add(geology);
    for (const kind of ["hillshade", "elevation", "slope", "contours"] as const) {
      const layer = createAnalyticLayer(kind);
      this.overlays.set(kind, layer);
      this.viewer.imageryLayers.add(layer);
    }
    const species = new ImageryLayer(
      new UrlTemplateImageryProvider({ url: GBIF_DENSITY_TILES, maximumLevel: 14, credit: "Species records: GBIF.org" }),
    );
    this.overlays.set("species", species);
    this.viewer.imageryLayers.add(species);
    // Relief shading reads best over satellite; the order above keeps contours on top.
    this.viewer.imageryLayers.raiseToTop(this.overlays.get("contours")!);
    // Street and place names from Esri's reference overlays (made for satellite
    // imagery), shown once zoomed in far enough to read them. Layers added later
    // (networks, analysis results) draw on top.
    for (const [service, level] of [["World_Transportation", 11], ["World_Boundaries_and_Places", 9]] as const) {
      const l = new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/${service}/MapServer/tile/{z}/{y}/{x}`,
          maximumLevel: 19,
          credit: "Street and place names: Esri, HERE, Garmin, © OpenStreetMap contributors",
        }),
        { minimumTerrainLevel: level },
      );
      this.streetLayers.push(l);
      this.viewer.imageryLayers.add(l);
    }
    for (const l of [this.rendered.dayLabels, this.rendered.nightLabels]) if (l) this.viewer.imageryLayers.add(l);
    darkQuery?.addEventListener("change", () => this.apply());

    if (this.hasIonTerrain) {
      CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true }).then((t) => {
        this.viewer.terrainProvider = t;
      });
    }
    this.apply();
    void this.secureBase();
  }

  /** Puts a new layer where an old one was, keeping its visibility and the house grade. */
  private swapLayer(old: ImageryLayer, provider: ImageryProvider | Google2DImageryProvider, opts: { minimumTerrainLevel?: number } = {}): ImageryLayer {
    const layers = this.viewer.imageryLayers, i = layers.indexOf(old);
    // (Cesium's typings disagree with themselves on getTileCredits' return; the provider is a real imagery provider.)
    const next = new ImageryLayer(provider as unknown as ImageryProvider, { show: old.show, ...opts });
    layers.remove(old, true);
    layers.add(next, i);
    return next;
  }

  /**
   * Makes sure there's a real map underneath (globe/basemap.ts): Google's tiles when the key works for them,
   * else the drawn map and photographs as configured, checked, with OpenStreetMap standing in if they don't answer.
   */
  private async secureBase() {
    const key = config.googleMapsKey;
    if (key) {
      try {
        const loc = googleLocale(), dpr = window.devicePixelRatio || 1;
        // Our own sessions (Cesium's don't ask for sharp tiles): on a sharp screen, 512 px tiles drawn at 2x.
        const google = async (layer: GoogleLayer) => {
          const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(googleSessionBody(layer, dpr, loc)),
          });
          if (!res.ok) throw new Error(`Google Map Tiles: HTTP ${res.status}`);
          const s = await res.json() as { session: string; tileWidth: number; tileHeight: number };
          // (Cesium's typings call the tile size a string and leave out getDefaultCredit, the Google logo credit.)
          const credit = (GoogleMaps as unknown as { getDefaultCredit(): Credit }).getDefaultCredit();
          return new Google2DImageryProvider({ session: s.session, key, tileWidth: s.tileWidth, tileHeight: s.tileHeight, credit } as unknown as ConstructorParameters<typeof Google2DImageryProvider>[0]);
        };
        const [day, night, photos, names] = await Promise.all([google("day"), google("night"), google("photos"), google("names")]);
        this.rendered.day = this.swapLayer(this.rendered.day, day);
        this.rendered.night = this.swapLayer(this.rendered.night, night);
        // Google's roadmap carries its own names; CARTO's would double them.
        for (const l of [this.rendered.dayLabels, this.rendered.nightLabels]) if (l) this.viewer.imageryLayers.remove(l, true);
        this.rendered.dayLabels = this.rendered.nightLabels = null;
        this.satellite = this.swapLayer(this.satellite, photos);
        // Over the photographs, Google's own road and place names (its "hybrid" view) instead of Esri's.
        const [first, ...rest] = this.streetLayers;
        for (const l of rest) this.viewer.imageryLayers.remove(l, true);
        this.streetLayers = first ? [this.swapLayer(first, names, { minimumTerrainLevel: 3 })] : [];
        this.source = { map: "google", photos: "google" };
        for (const l of this.baseLayers()) gradeLayer(l, this.gradeOf(l));
        this.apply();
        return;
      } catch (e) {
        console.warn("Google map tiles unavailable; using the open map instead.", e);
      }
    }
    // No Google: check the drawn map and the photographs answer, and stand in for whichever doesn't.
    const map = renderedMap();
    const nightLabels = map.labels(true);
    const [mapOk, nightOk, photosOk, namesOk] = await Promise.all([
      tileWorks(map.ground(false), map.subdomains), tileWorks(map.ground(true), map.subdomains), tileWorks(imagery().template),
      tileWorks("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"),
    ]);
    if (!mapOk || !nightOk) this.useOsm();
    else if (nightLabels && !(await tileWorks(nightLabels, map.subdomains)) && this.rendered.nightLabels) {
      this.viewer.imageryLayers.remove(this.rendered.nightLabels, true);
      this.rendered.nightLabels = null;
    }
    // Names over the photographs: if they don't come back as names, the photographs go without.
    if (!namesOk) { for (const l of this.streetLayers) this.viewer.imageryLayers.remove(l, true); this.streetLayers = []; }
    if (!photosOk) {
      this.satellite.show = false;
      this.satellite = this.backup;
      this.source.photos = "eox";
      this.apply();
    }
  }

  /** OpenStreetMap's own tiles for the drawn map, day and night alike (labels included). */
  private useOsm() {
    if (this.source.map === "osm") return;
    const osm = () => new UrlTemplateImageryProvider({ url: OSM_FALLBACK.url, maximumLevel: OSM_FALLBACK.maximumLevel, credit: OSM_FALLBACK.credit });
    this.rendered.day = this.swapLayer(this.rendered.day, osm());
    this.rendered.night = this.swapLayer(this.rendered.night, osm());
    for (const l of [this.rendered.dayLabels, this.rendered.nightLabels]) if (l) this.viewer.imageryLayers.remove(l, true);
    this.rendered.dayLabels = this.rendered.nightLabels = null;
    this.source.map = "osm";
    for (const l of this.baseLayers()) gradeLayer(l, this.gradeOf(l));
    this.apply();
  }

  /** Retries failed imagery tiles, and brings in the backup imagery if failures pile up. */
  private watchImagery(provider: UrlTemplateImageryProvider) {
    let failures = 0;
    provider.errorEvent.addEventListener((err: TileProviderError) => {
      if (err.timesRetried < 2) {
        err.retry = true;
        return;
      }
      if (++failures >= 6 && !this.backup.show && this.state.base === "satellite") {
        this.backup.show = true;
        this.onNotice?.("Satellite imagery is slow to load, so a backup source is filling the gaps.");
      }
    });
  }

  /**
   * Cesium stops drawing after an exception in the render loop. Restart it
   * (a few times, then ask for a reload), and recover from a lost WebGL context.
   */
  private keepRendering() {
    const v = this.viewer;
    // Errors can surface via scene.renderError or straight from the frame loop,
    // and either way Cesium just clears useDefaultRenderLoop. Watch for that.
    let lastError: unknown = null;
    v.scene.renderError.addEventListener((_scene: unknown, error: unknown) => { lastError = error; });
    const recent: number[] = [];
    let gaveUp = false;
    const watchdog = window.setInterval(() => {
      if (v.isDestroyed()) return clearInterval(watchdog);
      if (v.useDefaultRenderLoop || gaveUp) return;
      console.error("Rendering stopped; restarting", lastError);
      const now = Date.now();
      while (recent.length && now - recent[0] > 60_000) recent.shift();
      recent.push(now);
      if (recent.length > 4) {
        gaveUp = true;
        this.onNotice?.("The map stopped drawing. Reload the page to continue where you were.");
        return;
      }
      v.useDefaultRenderLoop = true;
    }, 500);
    const canvas = v.scene.canvas;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.onNotice?.("Graphics were reset by the browser. Reloading the map…");
    });
    // Cesium can't rebuild its GPU state in place; the URL keeps the view, so reload.
    canvas.addEventListener("webglcontextrestored", () => location.reload());
  }

  /** The satellite imagery, the fallbacks beneath it and Blue Marble above it (all tinted together). */
  baseLayers(): ImageryLayer[] {
    const layers = this.viewer.imageryLayers, out: ImageryLayer[] = [];
    for (let i = 0; i <= layers.indexOf(this.far); i++) out.push(layers.get(i));
    return out;
  }

  /** The grade a base layer wears when no look asks otherwise: the rendered map its own, imagery the house grade. */
  gradeOf(layer: ImageryLayer): Grade {
    if (layer === this.rendered.day) return RENDERED;
    if (layer === this.rendered.night) return RENDERED_NIGHT;
    return HOUSE;
  }

  /** Whether the map is showing its night version. */
  get dark(): boolean {
    return !!darkQuery?.matches;
  }

  /** Adds a layer just above the satellite imagery, under every overlay and label layer. */
  addUnder(layer: ImageryLayer) {
    const layers = this.viewer.imageryLayers;
    layers.add(layer, layers.indexOf(this.far) + 1);
  }

  /** Pushes `state` onto the scene. Call after mutating state. */
  apply() {
    const s = this.state, rendered = s.base === "rendered", dark = this.dark;
    try { localStorage.setItem(BASE_KEY, s.base); } catch { /* storage unavailable */ }
    // The interface reads the map: labels go dark-on-light over the light rendered map.
    document.body.classList.toggle("map-rendered", rendered && !dark);
    this.satellite.show = s.base === "satellite";
    this.rendered.day.show = rendered && !dark;
    this.rendered.night.show = rendered && dark;
    this.far.show = s.base !== "plain";
    if (s.base !== "satellite") this.backup.show = false;
    // Esri's names are made for photographs; the rendered map brings its own.
    for (const l of this.streetLayers) l.show = s.streets && s.base !== "rendered";
    if (this.rendered.dayLabels) this.rendered.dayLabels.show = s.streets && rendered && !dark;
    if (this.rendered.nightLabels) this.rendered.nightLabels.show = s.streets && rendered && dark;
    for (const [kind, layer] of this.overlays) {
      layer.show = s.overlays[kind].on;
      layer.alpha = s.overlays[kind].opacity;
    }
    this.viewer.scene.verticalExaggeration = s.exaggeration;
    if (s.bathymetry !== terrainOptions.showBathymetry) {
      terrainOptions.showBathymetry = s.bathymetry;
      if (!this.hasIonTerrain) this.viewer.terrainProvider = createTerrariumTerrain();
    }
    this.setPhotoreal(s.photorealistic);
    for (const fn of this.applied) fn();
  }

  private photorealLoading: Promise<void> | null = null;
  private async setPhotoreal(on: boolean) {
    if (!this.hasPhotoreal) { this.viewer.scene.globe.show = true; return; }
    if (on && !this.photoreal) {
      // The globe stays until the city has actually arrived, so a refused key never leaves an empty screen.
      this.photorealLoading ??= createGooglePhotorealistic3DTileset({ key: config.googleMapsKey }).then((t) => {
        let failed = 0;
        t.tileFailed.addEventListener(() => { if (++failed === 4) this.dropPhotoreal("Google's 3D city isn't loading right now, so the map is showing instead."); });
        this.photoreal = t;
        this.viewer.scene.primitives.add(t);
      }).catch((e) => { console.warn("Photorealistic 3D unavailable", e); this.dropPhotoreal(); });
      await this.photorealLoading;
    }
    if (!this.hasPhotoreal) return;
    const show = this.state.photorealistic;
    if (this.photoreal) this.photoreal.show = show;
    this.viewer.scene.globe.show = !(show && this.photoreal);
  }

  /** Turns the 3D city off for this visit and goes back to the globe and its map. */
  private dropPhotoreal(notice?: string) {
    this.photorealFailed = true;
    this.state.photorealistic = false;
    if (this.photoreal) { this.viewer.scene.primitives.remove(this.photoreal); this.photoreal = null; }
    this.viewer.scene.globe.show = true;
    if (notice) this.onNotice?.(notice);
    for (const fn of this.applied) fn();
  }

  /** The point on the Earth's surface under a screen position. */
  pick(pos: Cartesian2): { lon: number; lat: number; height: number } | null {
    const { scene, camera } = this.viewer;
    let cart = null;
    if (this.state.photorealistic && scene.pickPositionSupported) cart = scene.pickPosition(pos);
    if (!cart) {
      const ray = camera.getPickRay(pos);
      if (ray) cart = scene.globe.pick(ray, scene);
    }
    if (!cart) return null;
    const c = Cartographic.fromCartesian(cart);
    if (!c) return null;
    return {
      lon: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      height: c.height / (this.state.exaggeration || 1),
    };
  }

  cameraHeight(): number {
    return this.viewer.camera.positionCartographic.height;
  }
}
