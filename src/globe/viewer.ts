// Creates and configures the Cesium globe, and owns its layer stack.
import {
  buildModuleUrl,
  Cartesian2,
  Cartographic,
  Cesium3DTileset,
  CesiumTerrainProvider,
  Color,
  createGooglePhotorealistic3DTileset,
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
import { createTerrariumTerrain, terrainOptions } from "./terrain";

export type BaseMap = "satellite" | "plain";
export type OverlayKind = AnalyticKind | "geology" | "species";

export interface LayerState {
  base: BaseMap;
  overlays: Record<OverlayKind, { on: boolean; opacity: number }>;
  exaggeration: number;
  bathymetry: boolean;
  photorealistic: boolean;
}

export class Globe {
  readonly viewer: Viewer;
  private satellite: ImageryLayer;
  private backup: ImageryLayer;
  /** Messages worth showing the user (e.g. imagery failover). */
  onNotice?: (message: string) => void;
  private overlays = new Map<OverlayKind, ImageryLayer>();
  private photoreal: Cesium3DTileset | null = null;
  readonly state: LayerState = {
    base: "satellite",
    overlays: {
      hillshade: { on: true, opacity: 0.55 },
      elevation: { on: false, opacity: 0.6 },
      slope: { on: false, opacity: 0.7 },
      contours: { on: false, opacity: 0.9 },
      geology: { on: false, opacity: 0.6 },
      species: { on: false, opacity: 0.85 },
    },
    exaggeration: 1,
    bathymetry: false,
    photorealistic: false,
  };
  readonly hasPhotoreal = Boolean(config.googleMapsKey);
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
    });
    const { scene } = this.viewer;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.maximumScreenSpaceError = 1.5;
    scene.globe.baseColor = Color.fromCssColorString("#0b1d33");
    scene.globe.showGroundAtmosphere = true;
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    scene.postProcessStages.fxaa.enabled = true;
    // Sharp on high-density screens without rendering 9x the pixels on 3x phones.
    this.viewer.useBrowserRecommendedResolution = false;
    const dpr = window.devicePixelRatio || 1;
    this.viewer.resolutionScale = Math.min(dpr, 2) / dpr;
    // Keep more tiles around so panning back doesn't reload them.
    scene.globe.tileCacheSize = 400;
    this.keepRendering();

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
    const esri = new UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    });
    this.satellite = new ImageryLayer(esri);
    this.viewer.imageryLayers.add(this.satellite);
    this.watchImagery(esri);
    const geology = new ImageryLayer(
      new UrlTemplateImageryProvider({ url: GEOLOGIC_MAP_TILES, maximumLevel: 16, credit: "Geology: Macrostrat (CC-BY 4.0)" }),
    );
    this.overlays.set("geology", geology);
    this.viewer.imageryLayers.add(geology);
    for (const kind of ["hillshade", "elevation", "slope", "contours"] as AnalyticKind[]) {
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

    if (this.hasIonTerrain) {
      CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true }).then((t) => {
        this.viewer.terrainProvider = t;
        scene.globe.enableLighting = false;
      });
    }
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

  /** Pushes `state` onto the scene. Call after mutating state. */
  apply() {
    const s = this.state;
    this.satellite.show = s.base === "satellite";
    if (s.base !== "satellite") this.backup.show = false;
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
  }

  private async setPhotoreal(on: boolean) {
    if (!this.hasPhotoreal) return;
    if (on && !this.photoreal) {
      this.photoreal = await createGooglePhotorealistic3DTileset({ key: config.googleMapsKey });
      this.viewer.scene.primitives.add(this.photoreal);
    }
    if (this.photoreal) this.photoreal.show = on;
    this.viewer.scene.globe.show = !on;
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
