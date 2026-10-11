# Terreno

**Tap anywhere on Earth and learn about it.** · [terreno.site](https://terreno.site)

Terreno aims to do for GIS what Canva did for graphic design: make questions about any place on Earth
answerable in a tap, for anyone, while staying honest about the data. It starts simple (one card, eight
themes) and goes deep when you want it to: rock sections, watersheds, life zones, climate trends.

## How it works for you

The map is the page. Terreno opens over where you are, and around the map there are four things:

- **Search:** a place, an address, a year or a question ("flat land near an airport, warm in winter").
- **Navigate:** where to, and the way there on foot, by bike or by car.
- **Me:** your account, your page, your people and My Place.
- **＋:** **Explore** (the world now, games, space), **Create** (trips, stories, videos, lessons) and **Work**
  (tools for your field), then Pulse, Time, map style and layers, and Terreno on a TV.

Along the bottom are the views, which work like map layers: **People**, **Nature** and **Countries**, with the
rest (Earth, Water, Climate, Built, Space, Money and the other topics) under **More**. Tapping a view changes the
map, and its card waits as a heading until you open it. On a TV the menu is the same frame, driven from a phone.

Everything each part does, tool by tool, is in [docs/features.md](docs/features.md).

## Run it

```bash
npm install     # also copies Cesium's static assets into public/cesium
npm run dev     # http://localhost:5173
npm test        # unit tests for the analysis code
npm run build   # static site in dist/
```

**Live site:** pushes to `main` deploy automatically to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: repo *Settings → Pages → Source: GitHub Actions*.

It works with **no accounts or API keys**. Optional keys (copy `.env.example` to `.env`):

- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps Platform key with the *Map Tiles API* enabled.
  Adds a "Photorealistic 3D (Google)" toggle: Google Earth-style 3D cities and terrain.
- `VITE_CESIUM_ION_TOKEN`: switches the terrain to Cesium World Terrain (lit, high-resolution mesh).

For the live site, add the same names as repository secrets (*Settings → Secrets and variables → Actions*).
These keys end up in the public page, so restrict them to your site's domain in the Google/Cesium consoles.

## Data

- **Elevation:** [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen),
  which blends SRTM, USGS 3DEP, ETOPO1 bathymetry, GMTED and others. About 30 m resolution in most places.
- **Imagery:** Esri World Imagery (check Esri's terms before commercial use). If its tiles keep failing, Terreno
  switches in [Sentinel-2 cloudless](https://s2maps.eu) by EOX; Natural Earth II is the offline fallback.
- **Geology:** [Macrostrat](https://macrostrat.org) stratigraphic columns, bedrock maps and map tiles (CC-BY 4.0).
- **Life:** [iNaturalist](https://www.inaturalist.org) research-grade observations; [GBIF](https://www.gbif.org) occurrence-density tiles.
- **Mines and infrastructure near you:** OpenStreetMap via the [Overpass API](https://overpass-api.de) (ODbL).
- **World networks:** Natural Earth railways, roads, ports and airports; shipping lanes from
  [Benden (2022)](https://github.com/newzealandpaul/Shipping-Lanes) (CC BY 4.0); the
  [WRI Global Power Plant Database](https://github.com/wri/global-power-plant-database) (CC BY 4.0);
  [OpenRailwayMap](https://www.openrailwaymap.org) detail tiles (CC-BY-SA); undersea cables from
  [TeleGeography's Submarine Cable Map](https://www.submarinecablemap.com) (CC BY-NC-SA 3.0, loaded live).
  Rebuilt with `scripts/build-infra.mjs`.
- **Commodities:** production shares from USGS Mineral Commodity Summaries 2024 (uranium: World Nuclear
  Association; coal: Energy Institute; diamonds: Kimberley Process), rounded; landmark mines and the
  mineral guide hand-compiled in `src/content/minerals.ts`.
- **Weather and climate:** [Open-Meteo](https://open-meteo.com) forecasts and ERA5 history (CC-BY 4.0); [RainViewer](https://www.rainviewer.com) radar.
- **Countries:** Natural Earth borders via [world-atlas](https://github.com/topojson/world-atlas), [REST Countries](https://restcountries.com), [World Bank](https://data.worldbank.org) indicators.
- **Earth at night:** NASA Black Marble via GIBS.
- **Labels:** Natural Earth (world scale, bundled in `public/data`, rebuilt with `scripts/build-geodata.mjs`),
  [Wikidata](https://www.wikidata.org) and Wikipedia (notable places and summaries), OpenStreetMap (rivers).
- **Aurora and geomagnetic activity:** NOAA Space Weather Prediction Center (OVATION, Kp). **Earthquakes:** USGS.
  **Plate boundaries:** Bird (2003) PB2002 via [fraxen/tectonicplates](https://github.com/fraxen/tectonicplates).
- **Street and place names over imagery:** Esri World Transportation and World Boundaries and Places reference layers.
- **Historical borders:** [historical-basemaps](https://github.com/aourednik/historical-basemaps) by A. Ourednik
  and contributors (GPL-3.0), loaded live when used. Borders before about 1800 are approximate.
- **Grow:** daily temperature, rain and FAO-56 reference evapotranspiration from Open-Meteo; NDVI from NASA
  GIBS (MODIS Terra, 8-day). Crop coefficients from FAO-56; degree-day targets are typical values.
- **Satellites:** element sets from [CelesTrak](https://celestrak.org), propagated with SGP4
  ([satellite.js](https://github.com/shashwatak/satellite-js)). **Launches:** [The Space Devs](https://thespacedevs.com)
  Launch Library 2. **Planets:** JPL approximate Keplerian elements (Standish).
- **Places to learn:** OpenStreetMap via Overpass; the list of free and discounted museums is hand-compiled
  (prices change; check before going).
- **Gazetteer:** Natural Earth 10 m physical and cultural data (seas, regions, elevation points, lakes
  with the Europe and North America supplements, rivers, glaciers, playas, populated places, US parks),
  built with `scripts/build-geodata.mjs`; detailed rivers are tiled in 15° cells under `public/data/rivers/`.
- **Feature facts, breeds, crops and care:** hand-compiled in `src/content/features.ts`, `src/work/breeds.ts`
  and `src/work/growModel.ts` from commonly cited figures (FAO-56 crop coefficients; breed society weights);
  sources differ, so they're rounded and marked "about".
- **Lenses:** past imagery from [Esri World Imagery Wayback](https://livingatlas.arcgis.com/wayback/);
  plate reconstructions from the [GPlates Web Service](https://gws.gplates.org) (Merdith et al. 2021 model);
  forests, park and lake outlines and metro lines from OpenStreetMap; ocean currents are a hand-drawn schematic
  of the major surface currents. The 3D block uses [three.js](https://threejs.org), loaded only when opened.
- **My Place:** building footprints and heights from OpenStreetMap; sunshine and rainfall from ERA5 via Open-Meteo.
- **Search and place names:** [Photon](https://photon.komoot.io) (by komoot) and OpenStreetMap Nominatim
  (light, interactive use only, per its usage policy).

## Design

Terreno's look is a system, written down in [docs/design.md](docs/design.md): quiet paper and basalt surfaces
around the globe, one action colour (cobalt), four mineral pigments that carry meaning (cobalt, ochre, sage,
terracotta), Axiforma (Heavy for the wordmark; Plus Jakarta Sans until the licensed files are in `public/fonts/`)
with Geist Mono for figures, tiles rather than bubbles, and registration marks framing what's chosen. The
mark is a dome of tesserae, generated in code (`src/ui/brand.ts`). No emoji: every one that reaches the page
becomes Terreno's own icon (`src/ui/noEmoji.ts`). The globe has a house finish (`src/globe/finish.ts`).
The wayfinder (`src/wayfind/`) gives the Earth a voice: a compass ribbon of what's ahead, a card for what you
pass, a guess at where you're going, and Guide on phones (GPS, chase camera, turn-by-turn). Web, phone and TV
hand off to each other (continue on your phone, open the TV's view here, show on TV).

## How it works

```
src/
  main.ts              wiring: the globe, the views, the hubs behind ＋, and the actions everything else calls
  shell/               the frame's parts: search box, About, the opening view, My Place as a hologram, the card
                       that follows the map, Connected links, analysis layers on the canvas
  util/                shared helpers: geo (distances), storage (saved JSON), later (load on first use)
  canvas.ts            the shared canvas: what's on the map, across themes and places
  robot/               the task robot: plan.ts turns a request into steps, run.ts carries them out
  tv/                  TV mode: rooms (what each screen is for), classroom (quiz, time machine), wall (sites,
                       hazards, clocks, welcome), overlays (pointer, spotlight, pen, timer), the phone remote
  render/              3D Studio: splat/ (formats, worker, globe), import3d (tiles, glTF), cinema (shot splines),
                       play (camera), grade (post-processing), facade (procedural windows), store (IndexedDB)
  lenses/              lenses on a feature: identify.ts decides what it is, bar.ts offers lenses, one file per family
  myplaces/            My Place: store (saved in the browser), scene (3D buildings, devices), estimates (solar, rain), panel
  pro/                 Terreno Pro: model (bookings → rooms, floors, forecast), sources (demo, CSV, live link), panel,
                       vision/ (on-device camera analytics: detection, tracking, line counts, map positions)
  app.ts               place selection, place card, theme tab bar and subtabs, hosting tools inside subtabs
  themes/              one file per theme (explore, land and minerals (Earth), water, climate, life, built, countries); space/theme.ts
  globe/looks.ts       each theme's view of the planet; explore/featureLayers.ts its one-tap layers
  explore/             view tracking, label feeds and the "worth knowing" insights engine
  data/                Web Mercator math; elevation tiles; API clients; location parsing (links, DMS, plus codes)
  analysis/            pure, tested algorithms
    profile.ts         profile statistics, incision depth
    geosection.ts      layer-cake subsurface model fitted to mapped outcrops (elevation + apparent dip)
    commodities.ts     mine commodity groups and status
    infrastructure.ts  infrastructure categories, lengths, plant capacity
    climate.ts         monthly normals, Köppen–Geiger climate type, warming trend
    insights.ts        magnetic latitude and aurora zones, daylight and sun position, distance to plate boundaries
    cityWater.ts       sorts a city's water system into channels, buried streams, drains, basins, supply and wastewater
    placeKinds.ts      sorts Wikidata places into kinds (landmark, sport, bridge, volcano, museum…) and categories
    hydrology.ts       Priority-Flood+ε depression filling, D8 routing, flow accumulation, watersheds
    water.ts           multi-window flow tracing and adaptive watershed delineation
    hydrology.worker   runs the flow model off the main thread
  globe/               Cesium viewer, keyless terrain provider, analytical and network tile layers, drawing helpers
  tools/               the analyses the themes host (profile, rock section, rain path, species, …)
  content/sites.ts     curated places to start, per theme
  content/minerals.ts  commodities, landmark mines, mineral guide, rock → mineral links
  content/links.ts     how the themes connect: next questions and layers for every view
  ui/                  the frame (chrome.ts: Search, Navigate, Me, ＋), chart, search, layers panel, glyphs, DOM helpers
```

Every analysis reads the same elevation tiles that draw the 3D terrain, so what you see is what is measured.

Rendering is built to recover on its own. Tile and API requests retry with backoff. A terrain tile that
can't be fetched is filled from a coarser one rather than left as a hole. Failing satellite tiles bring in
backup imagery. Cesium's render loop is restarted after an error, and a lost WebGL context reloads the
page at the same view.

## Honest limits

- 3D Studio: splats are drawn with their base colour only (spherical-harmonic view-dependent shading is
  dropped to fit SPZ degree 0), and a capture is one tile, so very large scenes are trimmed to the device's
  budget rather than streamed. A .gltf with separate files needs a link (or a .glb). Grades with shadows and
  ambient occlusion are GPU-heavy and stay off on low-tier devices.
- Water routing uses the ground surface only: no infiltration, groundwater, or human structures such as culverts and dams.
  Reaches that cross closed hollows (lakes, closed basins, DEM artefacts) are drawn dashed.
- Elevation models smooth out narrow features. Slot canyons and cliffs narrower than a few cells look shallower than they are.
- Watersheds larger than the biggest analysis window (~470 km across) are flagged as truncated.
- Rock sections assume planar layers of constant thickness, fitted to the bedrock map. That suits flat-lying
  sequences like the Grand Canyon and misses folds, faults and layers that pinch out. Macrostrat columns are
  densest in North America.
- Species, mines and infrastructure show what people have recorded or mapped, which is never complete.
- Grow's degree-day targets and crop coefficients are typical values; varieties, soils and management differ,
  and the irrigation figure ignores soil storage and system losses. NDVI pixels are about 250 m.
- Build's cost rates and schedule durations are typical first estimates, not a quantity surveyor's figures.
- Flock's grazing estimate ignores regrowth; gestation lengths are species averages.
- Quizzes, results and games are kept in each browser; nothing is sent to a server, so results travel as codes or files.
- The Today brief and Grow's harvest windows are estimates from the weather and typical crop values;
  plain-words logging understands common phrasings and shows what it will save, but not every way of
  saying things. Routine-care intervals are common practice, not veterinary advice.
- Records stay in the browser until there's an account and sync: use Back up everything. Offline terrain
  is what you've already looked at (up to about 4,000 tiles).
- Several data sources are free for non-commercial use only; see [docs/data-licensing.md](docs/data-licensing.md)
  for what each allows and what's needed before charging for Terreno.
- Lenses: what a feature is gets guessed from its name and the ground, and can be wrong; the lens strip
  says what it assumed. Rock below mapped units in Slice and Block is drawn to typical depths where no
  column exists. Sea level floods everything below the line, including land protected by dykes or not
  connected to the sea. Metro depths in the underground view are typical, not surveyed. Deep-time positions
  come from one plate model and grow less certain with age.
- Plan's travel times use straight-line distance with a detour factor, not a road network.

## Roadmap

1. **Groundwater:** aquifer maps (WHYMAP, USGS principal aquifers), live well levels (USGS NWIS), GRACE water-storage anomalies,
   each labelled with how certain it is.
2. **Live Earth:** earthquakes (USGS), active fires (NASA FIRMS), weather and precipitation radar, river gauges.
3. **Geology:** faults and folds in sections; multiple columns along a section; borehole data.
4. **Time:** Landsat/Sentinel-2 time series beyond Wayback's years, for change before 2014.
5. **More lenses:** glaciers then and now, a volcano's lava and ash reach, a city's growth, flood reach
   along a river, and more feature templates (reefs, deltas, dunes).
6. **Campuses and standard places:** map a whole campus into My Place (e.g. a university), and with a
   connected CRM or student system reserve rooms, book appointments and office hours, request services and see
   how busy each area is; then templates for schools, hospitals and similar places.
7. **Projects:** save and share views, annotations and results; templates such as "Field site report".
