# Atlas

**Tap anywhere on Earth and learn about it.**

Atlas aims to do for GIS what Canva did for graphic design: make questions about any place on Earth
answerable in a tap, for anyone, while staying honest about the data. It starts simple (one card, eight
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

**One map, many lenses.** The themes aren't separate dashboards; they're lenses on one shared map, the
canvas. What you put on it stays as you move between them: follow the rain in Water, then open Built and the
path is still there, next to the city's roads and rail. Layers you switch on (railways, earthquakes, the
geologic map) stay on everywhere. Results about the chosen place stay while you look at it through other
themes, and clear when you pick a new place. A theme's own suggested layers show in that theme. The
"On the map" tray lists everything that's drawn: pin something to keep it everywhere, or take it off.
Every view ends with **Connected** links: the next questions people ask about that place in other themes
("How water moves through the city here", "Power for the mines"), and layers you can add without leaving.

**My Places.** The house button (top right) keeps the places you care about: home, a family hotel, a farm.
Save a spot you tapped or searched for, or start from where you are. Each place gets a dashboard:
a **3D view** of the buildings around it (OpenStreetMap footprints extruded to their mapped height or
number of floors, yours in orange, with an orbit), **energy** (solar panels, battery, generator: expected
solar output month by month from five years of sunshine at that exact spot, share of your use covered,
hours of battery backup), **water** (source, tank, daily use: rain the roof could collect, using the
building's own footprint, and how long the tank lasts, with links to where rain from there flows and the
pipes and drains around it), and **cameras & security** (cameras placed with two taps, their field of view
drawn on the ground, optional links to live feeds, plus gates, alarms, lights and sensors). Everything is
stored only in the browser, with export and import. The task robot knows your places too: *"weather at my
hotel"*. When you open Atlas it flies to your place.

**Ask it to do things.** The search box also takes requests: *"Where does rain go in downtown Chicago,
and show the storm drains and railways"*, *"Lithium mines in Chile"*, *"Earthquakes and tectonic plates in
Japan"*. A small task robot (rules, not a language model; it runs in the browser) works out the place, the views
and the layers, shows the plan as you type, and on Enter carries it out step by step with a live checklist.
Because the themes share one map, the results pile up together. Anything it didn't understand is shown, not
guessed. Vocabulary and rules are in `src/robot/plan.ts`.

**Satellite first.** Everything draws over satellite imagery, which is the default. Zoom in and street and place
names appear, relief shading fades away, and you can see which street a canal or culvert runs under.

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
| **Land** | Overview · Profile · Rocks | Elevation, slope, landform and bedrock; a slice through the land; the rock layers below (and a sliced, time-lapse rock section) |
| **Minerals** | Here · Mines nearby · Commodities | The bedrock here, the minerals in it and what rocks like it can hold; the nearest landmark mines; where the country ranks in world mining; every mapped mine and quarry nearby; 20 commodities (copper, lithium, cobalt, rare earths, gold, uranium, potash…) with uses, ores, geology and top producers |
| **Water** | Overview · Nearby · City water · Rain path · Watershed | The nearest rivers and lakes, springs and wells; how water moves through the city (drains, buried streams in culverts, stormwater basins, canals, water works, sewage treatment); where rain falling here flows; the land that drains to here |
| **Climate** | Now · Climate · Change | Current weather and 7-day forecast with live rain radar; the climate type and a monthly climograph; warming since 1950 |
| **Plants** | Species · Life zones · At risk | What grows here, with photos and icons (conifer, palm, cactus, orchid, lily, vine, fern, moss, mushroom, kelp…); where each species lives by elevation; threatened plants |
| **Animals** | Species · Life zones · At risk | The same for birds, mammals, reptiles, insects and more, each with its own icon on the card and the map (62 in all, from owls and penguins to seals, jellyfish and coral) |
| **Built** | Overview · Transport · Energy · Internet · Water | How a place connects: nearest airport, seaport, main railway, highway and shipping lane; power plants and the power mix around it and nationally; undersea cable landings; and everything OpenStreetMap maps nearby |
| **Countries** | Overview · People · Economy · Environment | Flag, capital, languages and neighbours; population, income, forests and emissions over time |

**Minerals, worldwide.** With no place chosen, Minerals is a commodity explorer: pick copper or lithium
to see what it's for, which minerals it's mined from, how it forms, who produces it, and its landmark mines
on the globe (about 60, from Escondida and Grasberg to Kiruna, Cigar Lake and Jwaneng). There's a guide to
30-odd common minerals, and a switch for the bedrock geology map.

**Infrastructure, worldwide.** Built opens on the world's networks, each a switch: railways (with every
track from OpenRailwayMap when zoomed in), highways and ferries, shipping lanes, a thousand ports, major
airports, 35,000 power plants coloured by fuel and sized by capacity, and the undersea cables that carry
the internet. Tap a dot for the plant, port or airport.

Keyboard: `1`–`9` switch themes, `/` searches, `Esc` cancels a line or closes a chart.

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
- **My Places:** building footprints and heights from OpenStreetMap; sunshine and rainfall from ERA5 via Open-Meteo.
- **Search and place names:** [Photon](https://photon.komoot.io) (by komoot) and OpenStreetMap Nominatim
  (light, interactive use only, per its usage policy).

## How it works

```
src/
  main.ts              wiring: globe, themes, search, map-style and about popovers, Connected links
  canvas.ts            the shared canvas: what's on the map, across themes and places
  robot/               the task robot: plan.ts turns a request into steps, run.ts carries them out
  myplaces/            My Places: store (saved in the browser), scene (3D buildings, devices), estimates (solar, rain), panel
  app.ts               place selection, place card, theme tab bar and subtabs, hosting tools inside subtabs
  themes/              one file per theme (explore, land, minerals, water, climate, life, built, countries)
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
