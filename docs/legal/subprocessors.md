# Subprocessors and data sources

## Subprocessors (they may process Customer Data)

| Provider | What for | Data | Location |
|---|---|---|---|
| Supabase, Inc. | Database, sign-in, file storage | Account email, saved content, team workspaces | United States |
| Cloudflare, Inc. | Edge service (keys, caching), content delivery | Request metadata (IP address, URL); no saved content | Global network |
| GitHub, Inc. (Microsoft) | Hosting the web app | Request metadata | Global network |
| Email delivery provider (to be confirmed: e.g. Resend or Postmark) | Sign-in codes and account email | Email address | United States |
| Anthropic, PBC | Atlas AI, only when switched on | The requests you type, and the place in view | United States |

We'll give organizations at least 30 days' notice before adding a subprocessor (see the Data Processing Addendum).

## Public data providers (they receive requests, not account details)

When you look at a place, the Service asks public services about it. They receive the request (for example
coordinates or a search term) and, unless the request goes through our edge service, your IP address. They
don't receive your account details or saved content.

- **Maps and places:** Esri (satellite imagery), OpenStreetMap services (Nominatim search, Overpass map data,
  the Valhalla router run by FOSSGIS), Photon (Komoot), terrain tiles on Amazon Web Services, NASA GIBS, EOX.
- **Weather and science:** Open-Meteo, RainViewer, NOAA, USGS, Macrostrat, ISRIC SoilGrids, iNaturalist, GBIF.
- **Knowledge and statistics:** Wikidata and Wikipedia, World Bank, REST Countries, US Census Bureau, FCC.
- **Government open data:** NYC Open Data and other city and county portals you choose to load.
- **Live traffic and space:** OpenSky Network, adsb.lol, Digitraffic, CelesTrak, The Space Devs.
- **Optional, when configured:** Ticketmaster, SeatGeek, Eventbrite (events), Finnhub (stock quotes),
  Google (photorealistic 3D tiles), Cesium ion (terrain).

Licences and attributions for each are in the data sources document.
