# Terreno for Claude: the MCP server

Terreno's knowledge of the real Earth as tools Claude (or any MCP client) can call. Ask Claude "what's the ground
and climate like at the farm I'm looking at?", "will it rain on my trip to Lisbon on the 18th?" or "show me Everest",
and it calls Terreno, gets values that each say where they came from, and can hand back a link that opens the
place on Terreno's live 3D globe.

- Code: `src/mcp/tools.ts` (the tools: plain functions over public data) and `src/mcp/worker.ts` (MCP over
  Streamable HTTP, stateless JSON). Tests: `tests/mcp.test.ts`.
- Transport: `POST /mcp` with JSON-RPC 2.0; answers are JSON (no sessions, no event stream). `GET /` describes
  the server.

## Tools

| Tool | Arguments | What comes back |
|---|---|---|
| `place_read` | `lon`, `lat` | Name (OpenStreetMap), height (Copernicus DEM GLO-90), climate type with yearly mean temperature and rain (ERA5, last ten years), weather now (Open-Meteo), country (Natural Earth), and a link to open it in Terreno |
| `weather_on` | `lon`, `lat`, `date` (YYYY-MM-DD) | That day's forecast in plain words with what to do about it, high and low, rain and its chance, gusts, snow; or, past the 16-day reach, that it isn't forecast yet |
| `country` | `lon`, `lat` | The country with its capital, region, population, area, languages, currencies, neighbours, side of the road |
| `scene` | `lon`, `lat`, optional `radius_m`, `view` | A terreno.site link that opens the globe on the place, framed to the radius, in a view (people, nature, countries, climate, water, land, built) |

Every value is `{ value, unit?, source, as_of?, note? }`, so Claude can say where a number came from and how far to
trust it. Bad input (a longitude of 400, a date of "tomorrow") comes back as a tool error the model can read and
correct; a service that can't be reached comes back the same way, never as a made-up value.

## Deploy (Cloudflare Workers)

```bash
npm run build:mcp                                   # → dist-mcp/worker.js (one file, ~280 kB gzipped)
npx wrangler deploy dist-mcp/worker.js --name terreno-mcp --compatibility-date 2026-10-01
```

Optionally route it at `mcp.terreno.site`. It holds no keys or personal data; each caller is limited to 60
requests a minute. To keep the public services it reads polite under load, set `VITE_ATLAS_EDGE` at build time
to Terreno's edge Worker (docs/backend.md › The edge), which caches their answers.

## Connect

- **Claude (claude.ai, Desktop):** Settings › Connectors › Add custom connector, URL `https://mcp.terreno.site/mcp`.
- **Claude Code:** `claude mcp add --transport http terreno https://mcp.terreno.site/mcp`
- **The API (MCP connector):** pass `{ "type": "url", "url": "https://mcp.terreno.site/mcp", "name": "terreno" }` in
  `mcp_servers`.

## Next

1. `water_path` (where rain from here flows, and the watershed), `find_land` (places meeting many conditions at
   once), `reach` (how far on foot, by bike, by car) and `around` (gathering places and how busy they likely are).
   They need the elevation tiles decoded off the browser (a small PNG decoder behind `src/data/elevation.ts`).
2. Signed-in tools for your own world: your people and their weather, your plans, your places. Only with your
   sign-in and your say-so; nothing personal is on the public server.
3. A "film this" scene export (camera path, data, captions) for Claude Motion or Terreno's Video studio.
