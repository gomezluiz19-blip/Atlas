# Data sources and licences: what's needed to charge for Atlas

Atlas runs today on free and open services. Most can stay; several can't be
used in a paid product (or at scale) as they are. This list covers every
external service the code calls, what its terms allow, and what to do before
launch. Terms change: confirm each one with the provider before relying on it.

**Legend:** ✅ fine for a commercial product (with attribution) · ⚠️ fine at
small scale, needs a plan, key or self-hosting to grow · ❌ not allowed
commercially as used, needs a licence or a replacement.

## Base map and terrain

| Source | Used for | Status | What to do |
|---|---|---|---|
| Esri World Imagery (`server.arcgisonline.com`) | Satellite imagery, Block lens texture, Save picture | ❌ | Commercial apps need an Esri account (Location Platform / ArcGIS) with API keys and usage billing; check whether exporting images (Block "Save picture") and offline storage are allowed. Alternatives: MapTiler Satellite, Mapbox Satellite, Cesium ion (Bing / Google 3D tiles), Maxar. |
| open.er-api.com (ExchangeRate-API, free tier) | Money & trade: today's exchange rate | ⚠️ attribution | Free without a key, updated daily; the terms ask for a "Rates By Exchange Rate API" link (it is in the page's data note). For commercial volume, a paid ExchangeRate-API plan, or the ECB rates via Frankfurter (fewer currencies). |
| Esri Wayback (`wayback.maptiles.arcgis.com`) | Rewind: then and now | ❌ | Same Esri terms. Alternative: Sentinel-2 (Copernicus, free) time series via Sentinel Hub or your own tiles. |
| Esri reference overlays (roads, places) | Street and place names over imagery | ❌ | Same Esri terms, or switch to a vector basemap provider's labels. |
| EOX Sentinel-2 cloudless 2020 (`tiles.maps.eox.at`) | Backup imagery | ❌ | The 2018+ mosaics are CC BY-NC-SA: non-commercial. Buy a licence from EOX, or use the 2016 mosaic (CC BY 4.0). |
| Terrain Tiles on AWS (Mapzen/Tilezen) | Elevation everywhere (terrain, profiles, lenses) | ✅ | Open data with source attributions (already in the credits). |
| Natural Earth | Labels, rivers, lakes, borders, networks | ✅ | Public domain. |
| Cesium (library) | The globe | ✅ | Apache 2.0. Cesium ion isn't required. |

The service worker now caches only terrain tiles for offline use; imagery
relies on the browser's normal cache until a licence allows storing it.

## Places, search and OpenStreetMap

| Source | Used for | Status | What to do |
|---|---|---|---|
| Photon (`photon.komoot.io`) | Search suggestions | ⚠️ | The public instance is for fair, light use. Self-host Photon or use a provider (Geoapify, Stadia, MapTiler, LocationIQ). |
| Nominatim (`nominatim.openstreetmap.org`) | Geocoding fallback, reverse geocoding | ⚠️ | Usage policy: at most 1 request a second, no heavy use, a real User-Agent. Same fix as above. |
| Overpass API (3 public mirrors) | Buildings, water, mines, transit, forests, places to learn | ⚠️ | Public instances are for light use. Atlas now caches answers for a week. At scale, self-host Overpass (or a hosted plan). OSM data is ODbL: keep "© OpenStreetMap contributors" visible, and share-alike applies to any database you build from it. |
| Valhalla routing (`valhalla1.openstreetmap.de`, run by FOSSGIS) | Getting around: walk, bike and drive reach, times to your places | ⚠️ | The public server is for fair, light use. Valhalla itself is MIT-licensed: self-host it (or use a hosted plan such as Stadia Maps) before launch. Routes are over OSM data (ODbL): keep the credit. Without the router, Atlas falls back to estimated circles. |
| Booking sites (Google Flights, Skyscanner, Kayak, Booking.com, Airbnb, Google Hotels, Rome2Rio) | Travel: "Book it" links | ✅ | Plain links that open each site already searched; no data is taken from them. To earn on bookings, join their affiliate programmes and add the partner IDs to the links. |
| OpenRailwayMap tiles | Railway detail layer | ⚠️ | CC BY-SA, with a tile-usage policy against heavy use; self-host from OSM data if it matters. |

## Weather, climate, geology and life

| Source | Used for | Status | What to do |
|---|---|---|---|
| Open-Meteo (forecast, ERA5 archive) | Weather, the Today brief, Grow, frost dates, place report | ❌ free tier | The free API is non-commercial. Commercial use needs an Open-Meteo API plan (reasonably priced); the data itself is CC BY 4.0. Highest priority: My Places depends on it. |
| RainViewer | Rain radar | ⚠️ | Check current API terms for commercial use and limits. |
| Macrostrat | Geology: rock columns, bedrock map | ✅ | CC BY 4.0; be gentle with request volume and cache. |
| GPlates Web Service | Rewind: deep time | ⚠️ | An academic service; ask before heavy use, or run pyGPlates yourself. |
| iNaturalist API | Plants and animals seen nearby, Forest lens | ⚠️ | API guidelines limit volume (about 1 request a second); observations carry their own licences (some non-commercial). Cache, attribute, and ask iNaturalist about product use. |
| GBIF | Species density tiles | ✅ | Most records are CC0 or CC BY; some datasets are CC BY-NC. Attribute GBIF. |
| NASA GIBS (MODIS NDVI, Black Marble) | Plant health, Earth at night | ✅ | US government, public. |
| NOAA SWPC, USGS earthquakes | Aurora, geomagnetic activity, quakes | ✅ | US government, public. |

## Knowledge, countries and images

| Source | Used for | Status | What to do |
|---|---|---|---|
| Wikipedia REST feed (In the news, most read, on this day) | World now | ✅ attribution | Text CC BY-SA 4.0: credit Wikipedia and link the articles (Atlas links every story). |
| GDELT DOC API | World now headlines, In the news | ✅ | Free and open, with attribution ("GDELT Project"); headlines link to the publishers' own pages, which Atlas never copies. |
| NASA EONET | Natural events | ✅ | Public domain (US government); credit NASA EONET. |
| adsb.lol | Live planes, flight routes | ✅ | Data under ODbL; attribution required. Free, no key; be polite (Atlas polls every 10 s per viewer, 5 s edge cache). |
| airplanes.live | Live planes (fallback) | ⚠️ non-commercial | Free for non-commercial use; commercial use needs their permission. |
| OpenSky Network | Live planes (fallback; the whole world when zoomed out) | ⚠️ non-commercial | Anonymous access is rate-limited and for research/non-commercial use; commercial use needs a licence from OpenSky. |
| Finland Digitraffic (AIS) | Live ships in the Baltic | ✅ | CC BY 4.0 (Fintraffic). |
| AISStream | Live ships worldwide (optional, via the edge) | ⚠️ key | Free key, fair use; check their terms for commercial volume. For a commercial product consider a paid AIS provider (Spire, MarineTraffic, Kpler). |
| Open-Meteo air quality | Right now: AQI, UV | ❌ free tier | Same terms as the Open-Meteo forecast: non-commercial on the free tier; the data (CAMS) is open. |
| Census Bureau (TIGERweb districts, ACS 5-year) | Politics Pro: district outlines and figures | ✅ | Public domain (US government). The ACS API works without a key at light use; add a free Census API key for volume. |
| congress-legislators (@unitedstates) | Members of Congress | ✅ | Public domain (CC0). |
| Wikidata query service | Notable places | ✅ | CC0; respect the query service limits and cache. |
| Wikipedia REST | Place summaries | ✅ | CC BY-SA text: attribute (already linked). |
| Wikimedia Commons | Place photos | ⚠️ | Every image has its own licence and author: show the credit and licence with each photo. |
| REST Countries, World Bank | Country facts and indicators | ✅ | Open (World Bank data is CC BY 4.0). |
| historical-basemaps (A. Ourednik) | Borders through history | ⚠️ | GPL-3.0 data. Get legal advice, or ask the author about a licence for a closed-source product. |
| TeleGeography Submarine Cable Map | Undersea cables | ❌ | CC BY-NC-SA 3.0: non-commercial. License it from TeleGeography or drop the layer in paid tiers. |
| Shipping lanes (Benden 2022), WRI power plants | Built › networks | ✅ | CC BY 4.0. |
| CelesTrak | Satellites | ✅ | Free; follow the polling guidelines (Atlas fetches once per session). |
| Launch Library 2 (The Space Devs) | Rocket launches | ⚠️ | Free tier is 15 requests an hour; paid plans exist for products. |
| Hand-compiled content (features, breeds, crops, care, sowing, sites) | Facts and guidance | ✅ | Written for Atlas from commonly cited figures; keep sources noted. |

## AI

| Source | Used for | Status | What to do |
|---|---|---|---|
| Anthropic API (Claude) | Atlas AI | ✅ paid | Keep the key server-side: use the proxy in `docs/ai-proxy.md`, add per-user rate limits, and budget for usage. |

## Launch checklist, in order

1. **Weather:** an Open-Meteo commercial plan (My Places depends on it).
2. **Imagery:** choose a satellite provider with a commercial licence (Esri with keys, MapTiler, Mapbox, or Google/Bing via Cesium ion); decide on Rewind's source.
3. **Search and OSM:** a geocoding provider (or self-hosted Photon and Nominatim) and a self-hosted or paid Overpass.
4. **Non-commercial layers:** license or remove the cable map and the EOX 2020 mosaic; resolve the historical borders licence.
5. **Attribution:** photo credits per image; keep the credits line for every source on screen.
6. **Rate limits:** a small proxy with caching in front of the free APIs you keep (iNaturalist, Wikidata, Launch Library, GPlates).
