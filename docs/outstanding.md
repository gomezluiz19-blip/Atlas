# Outstanding

Things agreed and pinned for later. Ask "what's outstanding?" and this is the list.

## Back end to a workable state (pinned 2026-09-29; built 2026-09-29, waiting on accounts)

Built: Supabase schema and client (sign-in by emailed code, pages, guestbooks, follows, lenses, guides,
private sync), and the edge Worker (cache + keys). To switch on: `docs/backend.md` (about 25 minutes).
Still to build once Supabase is connected: the scheduled job that sends push alerts for watches.

The original plan, for reference:

Atlas is a static site; every figure comes from the browser calling ~30 public services directly, and
everything people make lives only in their browser. Before real users:

1. **Keys out of the browser.** Build-time `VITE_*` keys ship in the public JavaScript. The Eventbrite token
   is a real secret; Ticketmaster and SeatGeek keys would be scraped. Move them behind a small server proxy.
2. **A caching proxy between users and free services** (Cloudflare Workers or Supabase Edge Functions):
   Nominatim allows 1 request/second across all users; Open-Meteo's free tier is non-commercial; Wikidata's
   query service throttles; Esri imagery has usage terms. Cache answers, hold keys, swap providers. Decisions
   for the founder: a hosted geocoder (Stadia, MapTiler…), Open-Meteo commercial, imagery licensing
   (see `data-licensing.md`).
3. **Accounts and sync** (Supabase: auth, Postgres, storage). Saved places, trips, farms, stories, follows kept
   on the server so they survive devices; publishing stories for the network effect (`stories-backend.sql`
   is written for it). Build sign-in behind a switch that stays on-device until Supabase is connected.
   The preview sign-in (`src/social/`) already has the shape: accounts, profiles (Top 8, spots, journal,
   guestbook, follows) and made lenses (`src/lenses/library.ts`) all go through small stores that can swap
   localStorage for the server without touching the UI. Guestbooks and follows only become shared then.
4. **Nightly data jobs** (GitHub Actions on a schedule): refresh place pages and the sitemap; pre-fetch
   politics snapshots, next elections, governors and country figures into static files, so pages load
   instantly and survive outages.
5. **Error monitoring and privacy-friendly analytics** (e.g. Sentry, Plausible).

Can wait: Pro connectors to booking systems, AI at scale behind the proxy, paid tiers.

Plan when unpinned: build 1, 2 and 4 plus the sync layer (none needs the founder's accounts), then a short
checklist for connecting Supabase and Cloudflare.

## Also pending

- Campuses and standard places in My Places (on hold).
- Party seat splits for other countries' legislatures (Wikidata doesn't hold them reliably).
