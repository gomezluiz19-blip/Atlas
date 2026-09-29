# Atlas's back end

Atlas runs as a static site with no back end, and everything keeps working that way. Two small
pieces, each switched on by a couple of settings, make it a shared, multi-device product:

| Piece | What it does | Switched on by |
|---|---|---|
| **Supabase** (auth, Postgres, storage) | Real sign-in (a six-digit code by email), pages everyone can find, guestbooks and follows between people, lenses and guides published for everyone, field notes and watches that follow you between devices | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **The edge** (a Cloudflare Worker) | One cache in front of the free public services (so a crowd of visitors looks like one polite client), and the keeper of service keys that mustn't ship in the page | `ATLAS_EDGE`, `ATLAS_EDGE_KEYS` |

Neither needs the other. Without them, Atlas behaves exactly as today: accounts, pages and lenses
live on the device and travel as links.

## Supabase (about 15 minutes)

1. Create a project at <https://supabase.com> (the free tier is plenty to start).
2. **SQL editor › New query**: paste `docs/backend.sql`, Run. Also run `docs/stories-backend.sql` for
   the shared story library.
3. **Authentication › Providers › Email**: on. Turn *Confirm email* on.
4. **Authentication › Email templates › Magic link**: Atlas signs in with the code, so make sure the
   template shows it, e.g. `Your Atlas code is {{ .Token }}`. (Keep the link too if you like.)
5. **Authentication › URL configuration**: set *Site URL* to the published site.
6. **Project settings › API**: copy the *Project URL* and the *anon public* key.
7. **GitHub › Settings › Secrets and variables › Actions › Variables**: add `SUPABASE_URL` and
   `SUPABASE_ANON_KEY`. The next deploy picks them up.

For local development: put them in `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

What changes for people:

- **Sign in** asks for an email, then the six-digit code sent to it. A returning person gets their
  page back on any device; a new one makes a page (handles are unique across Atlas).
- **Your page** is published as you edit it (a second after each change) and shared as `#/u/handle`.
- **Guestbooks, follows** go to the server, so the person whose page it is sees them.
- **People › Profiles** lists everyone who has a page, newest first.
- **Lenses** you keep are published; `#/lens/<id>` opens for anyone; Lens Studio's gallery shows
  lenses from everyone.
- **Guides** are published and open from `#/g/<id>`.
- **Field notes and watches** sync privately between your devices; photos go to the `media` bucket.
- The example people and their lenses stay local to every device (they're never uploaded).

Security: every table has row-level security (see the SQL). The anon key is designed to be public;
it can only do what the policies allow: read what's public, and write your own things once signed in.

## The edge (about 10 minutes)

```sh
npx wrangler deploy proxy/atlas-edge-worker.js --name atlas-edge
npx wrangler secret put ALLOWED_ORIGINS      # https://you.github.io,http://localhost:5173
npx wrangler secret put USER_AGENT           # Atlas (https://you.github.io; you@example.com)
# Any of these that you use (they then never appear in the web page):
npx wrangler secret put TICKETMASTER_KEY
npx wrangler secret put SEATGEEK_CLIENT_ID
npx wrangler secret put EVENTBRITE_TOKEN
```

Then add GitHub variables `ATLAS_EDGE` (the Worker's URL) and `ATLAS_EDGE_KEYS` (the keyed services
it holds, e.g. `ticketmaster,eventbrite`), and **remove** the old `EVENTBRITE_TOKEN` secret and the
`TICKETMASTER_KEY`/`SEATGEEK_CLIENT_ID` variables from the build.

What goes through it: OpenStreetMap (Nominatim, Photon, Overpass), Open-Meteo (forecast, history,
marine, climate), Wikidata and Wikipedia, iNaturalist, Macrostrat, World Bank, REST Countries, NOAA
space weather and USGS earthquakes. Weather keeps 10 minutes, sightings an hour, the rest a week.
Map tiles aren't proxied (they're already served from CDNs).

Before real traffic, still decide (see `data-licensing.md`): a commercial Open-Meteo plan or
self-hosting it; a hosted geocoder (Stadia, MapTiler, Geoapify) in place of public Nominatim; and
imagery licensing.

## Alerts when Atlas is closed

Watches (see *Watch a place*) check while Atlas is open, and show what changed when you come back.
Push notifications to a closed browser need a scheduled job that evaluates watches and sends Web
Push. The pieces are ready (the `push_subscriptions` table; `VAPID_PUBLIC_KEY`); the job itself is
a Supabase Edge Function on a schedule, next on the list once Supabase is connected.
