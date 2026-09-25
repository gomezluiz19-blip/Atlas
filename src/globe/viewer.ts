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
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";
import { config } from "../config";
import { createAnalyticLayer, type AnalyticKind } from "./analyticLayers";
import { createTerrariumTerrain, terrainOptions } from "./terrain";

export type BaseMap = "satellite" | "plain";

export interface LayerState {
  base: BaseMap;
  overlays: Record<AnalyticKind, { on: boolean; opacity: number }>;
  exaggeration: number;
  bathymetry: boolean;
  photorealistic: boolean;
}

export class Globe {
  readonly viewer: Viewer;
  private satellite: ImageryLayer;
  private overlays = new Map<AnalyticKind, ImageryLayer>();
  private photoreal: Cesium3DTileset | null = null;
  readonly state: LayerState = {
    base: "satellite",
    overlays: {
      hillshade: { on: true, opacity: 0.55 },
      elevation: { on: false, opacity: 0.6 },
      slope: { on: false, opacity: 0.7 },
      contours: { on: false, opacity: 0.9 },
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
    });
    const { scene } = this.viewer;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.maximumScreenSpaceError = 1.5;
    scene.globe.baseColor = Color.fromCssColorString("#0b1d33");
    scene.globe.showGroundAtmosphere = true;
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    scene.postProcessStages.fxaa.enabled = true;

    // Offline fallback imagery bundled with Cesium, under the satellite layer.
    TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")).then((p) =>
      this.viewer.imageryLayers.add(new ImageryLayer(p), 0),
    );
    this.satellite = new ImageryLayer(
      new UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
        credit: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      }),
    );
    this.viewer.imageryLayers.add(this.satellite);
    for (const kind of ["hillshade", "elevation", "slope", "contours"] as AnalyticKind[]) {
      const layer = createAnalyticLayer(kind);
      this.overlays.set(kind, layer);
      this.viewer.imageryLayers.add(layer);
    }
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

  /** Pushes `state` onto the scene. Call after mutating state. */
  apply() {
    const s = this.state;
    this.satellite.show = s.base === "satellite";
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
