# Atlas

**Tap anywhere on Earth and learn about it.**

Atlas aims to do for GIS what Canva did for graphic design: make questions about any place on Earth
answerable in a tap, for anyone, while staying honest about the data. It starts simple (one card, seven
themes) and goes deep when you want it to: rock sections, watersheds, life zones, climate trends.

## How it works for you

**Explore (the default).** Just move the map. Atlas labels what's worth knowing as you go: seas, mountain
ranges and cities when zoomed out; rivers, landmarks, stadiums, parks and museums when zoomed in (the Hudson,
the Empire State Building and Madison Square Garden in Manhattan; the Thames, Big Ben and Wembley in London).
Places are ranked by how many Wikipedia language editions write about them. The card follows the map with
"Worth knowing here": whether you're in the northern-lights zone (with tonight's live chance and Kp), midnight
sun and daylight, nearby plate boundaries, this week's earthquakes, World Heritage sites. One-touch toggles
show labels, the live aurora forecast, earthquakes, plate boundaries, night lights, rain radar and wildlife
records. Tap a label for its photo and summary; tap the ground for a quick glance across every theme.

Filter what's in view by category (landmarks, nature, water, sport, culture, transport); the map's labels
follow the filter, and each label carries a small glyph for its kind (stadium, bridge, volcano, museum…).

**Search anything.** The search bar takes place names and street addresses (Photon, with Nominatim as a
fallback), and whatever you paste: decimal or degrees-minutes-seconds coordinates, Google, Apple, Bing and
OpenStreetMap links, `geo:` URIs and plus codes. Press `/` to focus it. Every view has a shareable URL, and
the place card's share menu copies coordinates, the name or a link, or opens the spot in Google or Apple Maps.

**Places to start.** Every theme opens with hand-picked collections (canyons and volcanoes, deltas and
waterfalls, climate records, the oldest and largest trees, great migrations, megaprojects, country
curiosities, aurora spots), about a hundred places in all, each with a one-line reason to look.

Then pick a theme from the tab bar; each theme's subtabs describe the chosen place:

| Theme | Subtabs | What you learn |
| --- | --- | --- |
| **Land** | Overview · Profile · Rocks · Minerals | Elevation, slope, landform and bedrock; a slice through the land; the rock layers below (and a sliced, time-lapse rock section); mines and quarries |
| **Water** | Overview · Nearby · Rain path · Watershed | The nearest rivers and lakes, springs and wells; where rain falling here flows; the land that drains to here |
| **Climate** | Now · Climate · Change | Current weather and 7-day forecast with live rain radar; the climate type and a monthly climograph; warming since 1950 |
| **Plants** | Species · Life zones · At risk | What grows here, with photos and icons (conifer, palm, cactus, orchid, lily, vine, fern, moss, mushroom, kelp…); where each species lives by elevation; threatened plants |
| **Animals** | Species · Life zones · At risk | The same for birds, mammals, reptiles, insects and more, each with its own icon on the card and the map (62 in all, from owls and penguins to seals, jellyfish and coral) |
| **Built** | Overview · Transport · Energy · Water | Roads, rail, power, pipelines, dams and airports, with totals; Earth at night |
| **Countries** | Overview · People · Economy · Environment | Flag, capital, languages and neighbours; population, income, forests and emissions over time |

Keyboard: `1`–`8` switch themes, `/` searches, `Esc` cancels a line or closes a chart.

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
- **Imagery:** Esri World Imagery (check Esri's terms before commercial use). If its tiles keep failing, Atlas
  switches in [Sentinel-2 cloudless](https://s2maps.eu) by EOX; Natural Earth II is the offline fallback.
- **Geology:** [Macrostrat](https://macrostrat.org) stratigraphic columns, bedrock maps and map tiles (CC-BY 4.0).
- **Life:** [iNaturalist](https://www.inaturalist.org) research-grade observations; [GBIF](https://www.gbif.org) occurrence-density tiles.
- **Mines and infrastructure:** OpenStreetMap via the [Overpass API](https://overpass-api.de) (ODbL).
- **Weather and climate:** [Open-Meteo](https://open-meteo.com) forecasts and ERA5 history (CC-BY 4.0); [RainViewer](https://www.rainviewer.com) radar.
- **Countries:** Natural Earth borders via [world-atlas](https://github.com/topojson/world-atlas), [REST Countries](https://restcountries.com), [World Bank](https://data.worldbank.org) indicators.
- **Earth at night:** NASA Black Marble via GIBS.
- **Labels:** Natural Earth (world scale, bundled in `public/data`, rebuilt with `scripts/build-geodata.mjs`),
  [Wikidata](https://www.wikidata.org) and Wikipedia (notable places and summaries), OpenStreetMap (rivers).
- **Aurora and geomagnetic activity:** NOAA Space Weather Prediction Center (OVATION, Kp). **Earthquakes:** USGS.
  **Plate boundaries:** Bird (2003) PB2002 via [fraxen/tectonicplates](https://github.com/fraxen/tectonicplates).
- **Search and place names:** [Photon](https://photon.komoot.io) (by komoot) and OpenStreetMap Nominatim
  (light, interactive use only, per its usage policy).

## How it works

```
src/
  main.ts              wiring: globe, themes, search, map-style and about popovers
  app.ts               place selection, place card, theme tab bar and subtabs, hosting tools inside subtabs
  themes/              one file per theme (explore, land, water, climate, life, built, countries)
  explore/             view tracking, label feeds and the "worth knowing" insights engine
  data/                Web Mercator math; elevation tiles; API clients; location parsing (links, DMS, plus codes)
  analysis/            pure, tested algorithms
    profile.ts         profile statistics, incision depth
    geosection.ts      layer-cake subsurface model fitted to mapped outcrops (elevation + apparent dip)
    commodities.ts     mine commodity groups and status
    infrastructure.ts  infrastructure categories, lengths, plant capacity
    climate.ts         monthly normals, Köppen–Geiger climate type, warming trend
    insights.ts        magnetic latitude and aurora zones, daylight and sun position, distance to plate boundaries
    placeKinds.ts      sorts Wikidata places into kinds (landmark, sport, bridge, volcano, museum…) and categories
    hydrology.ts       Priority-Flood+ε depression filling, D8 routing, flow accumulation, watersheds
    water.ts           multi-window flow tracing and adaptive watershed delineation
    hydrology.worker   runs the flow model off the main thread
  globe/               Cesium viewer, keyless terrain provider, analytical imagery layers, drawing helpers
  tools/               the analyses the themes host (profile, rock section, rain path, species, …)
  content/sites.ts     curated places to start, per theme
  ui/                  chart, search, layers panel, taxon icons, label glyphs, DOM helpers
legacy/                the original single-file prototype
```

Every analysis reads the same elevation tiles that draw the 3D terrain, so what you see is what is measured.

Rendering is built to recover on its own. Tile and API requests retry with backoff. A terrain tile that
can't be fetched is filled from a coarser one rather than left as a hole. Failing satellite tiles bring in
backup imagery. Cesium's render loop is restarted after an error, and a lost WebGL context reloads the
page at the same view.

## Honest limits

- Water routing uses the ground surface only: no infiltration, groundwater, or human structures such as culverts and dams.
  Reaches that cross closed hollows (lakes, closed basins, DEM artefacts) are drawn dashed.
- Elevation models smooth out narrow features. Slot canyons and cliffs narrower than a few cells look shallower than they are.
- Watersheds larger than the biggest analysis window (~470 km across) are flagged as truncated.
- Rock sections assume planar layers of constant thickness, fitted to the bedrock map. That suits flat-lying
  sequences like the Grand Canyon and misses folds, faults and layers that pinch out. Macrostrat columns are
  densest in North America.
- Species, mines and infrastructure show what people have recorded or mapped, which is never complete.

## Roadmap

1. **Groundwater:** aquifer maps (WHYMAP, USGS principal aquifers), live well levels (USGS NWIS), GRACE water-storage anomalies,
   each labelled with how certain it is.
2. **Live Earth:** earthquakes (USGS), active fires (NASA FIRMS), weather and precipitation radar, river gauges.
3. **Geology:** faults and folds in sections; multiple columns along a section; borehole data.
4. **Time:** swipe and compare satellite imagery across years (Landsat/Sentinel-2).
5. **3D cut-away:** slice the terrain open along a cross-section and view it from the side.
6. **Projects:** save and share views, annotations and results; templates such as "Field site report".
