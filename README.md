# Atlas

**An intuitive, in-depth 3D Earth for people who study it.**

Atlas aims to do for GIS what Canva did for graphic design: make the common
terrain questions answerable in one click, without a semester of training, while
staying scientifically honest. The first audience is university students in the
earth sciences (geology, geomorphology, hydrology, environmental science).

## What it does today

| Tool | Ask it… | You get |
| --- | --- | --- |
| **Explore** | "What's here?" | Coordinates, elevation, slope and aspect of any point |
| **Cross-section** | "How deep is this gorge?" | Elevation profile, depth below the rims, rim-to-rim width, slopes, CSV export |
| **Water flow** | "Where does rain falling here go?" | The downhill flow path (even hundreds of km to the sea), a river long profile, CSV export |
| **Watershed** | "What land drains through this point?" | Basin outline and stream network, area, relief, mean slope, hypsometric integral and curve |
| **Layers** | "Show me the landforms" | Relief shading, elevation colours, slope map, contour lines, vertical exaggeration, seafloor |

Plus place search, curated field sites (Grand Canyon, Yarlung Tsangpo, Mount St. Helens, Þingvellir…),
and keyboard shortcuts: `E` explore · `S` cross-section · `F` water flow · `W` watershed · `L` layers · `Esc` cancel.

## Run it

```bash
npm install     # also copies Cesium's static assets into public/cesium
npm run dev     # http://localhost:5173
npm test        # unit tests for the analysis code
npm run build   # static site in dist/
```

It works with **no accounts or API keys**. Optional keys (copy `.env.example` to `.env`):

- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps Platform key with the *Map Tiles API* enabled.
  Adds a "Photorealistic 3D (Google)" toggle: Google Earth-style 3D cities and terrain.
- `VITE_CESIUM_ION_TOKEN`: switches the terrain to Cesium World Terrain (lit, high-resolution mesh).

## Data

- **Elevation:** [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen),
  which blends SRTM, USGS 3DEP, ETOPO1 bathymetry, GMTED and others. About 30 m resolution in most places.
- **Imagery:** Esri World Imagery (check Esri's terms before commercial use), with Natural Earth II as an offline fallback.
- **Search:** OpenStreetMap Nominatim (light, interactive use only, per its usage policy).

## How it works

```
src/
  main.ts              wiring: globe, tools, search, layers, status bar
  app.ts               tool routing, results panel, chart drawer
  data/                Web Mercator math; Terrarium elevation tiles (fetch, decode, cache, sample)
  analysis/            pure, tested algorithms
    profile.ts         profile statistics, incision depth
    hydrology.ts       Priority-Flood+ε depression filling, D8 routing, flow accumulation, watersheds
    water.ts           multi-window flow tracing and adaptive watershed delineation
    hydrology.worker   runs the flow model off the main thread
  globe/               Cesium viewer, keyless terrain provider, analytical imagery layers, drawing helpers
  tools/               one file per tool
  ui/                  chart, search, layers panel, DOM helpers
legacy/                the original single-file prototype
```

Every analysis reads the same elevation tiles that draw the 3D terrain, so what you see is what is measured.

## Honest limits

- Water routing uses the ground surface only: no infiltration, groundwater, or human structures such as culverts and dams.
  Reaches that cross closed hollows (lakes, closed basins, DEM artefacts) are drawn dashed.
- Elevation models smooth out narrow features. Slot canyons and cliffs narrower than a few cells look shallower than they are.
- Watersheds larger than the biggest analysis window (~470 km across) are flagged as truncated.

## Roadmap

1. **Groundwater:** aquifer maps (WHYMAP, USGS principal aquifers), live well levels (USGS NWIS), GRACE water-storage anomalies,
   each labelled with how certain it is.
2. **Live Earth:** earthquakes (USGS), active fires (NASA FIRMS), weather and precipitation radar, river gauges.
3. **Geology:** bedrock and fault maps (Macrostrat), with a click-to-see stratigraphic column.
4. **Time:** swipe and compare satellite imagery across years (Landsat/Sentinel-2).
5. **3D cut-away:** slice the terrain open along a cross-section and view it from the side.
6. **Projects:** save and share views, annotations and results; templates such as "Field site report".
