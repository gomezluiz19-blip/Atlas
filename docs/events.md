# Events near a place

**People › Events** lists what's on near the chosen place: concerts, games, shows and talks, with
filters for today, this weekend, this week and the next 30 days. The venues are pinned on the map.
Without any service connected it still shows the festivals and annual events held nearby (from
Wikidata).

Connect any of these (repository **Settings → Secrets and variables → Actions**, then re-run the
deploy), or put them in `.env.local` for development:

| Service | What it gives | Set |
| --- | --- | --- |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com/) | Events near any place, worldwide (strongest in North America and Europe). Free key, 5,000 calls a day. | Variable `TICKETMASTER_KEY` |
| [SeatGeek](https://seatgeek.com/account/develop) | Events near any place (US-focused). Free client id. | Variable `SEATGEEK_CLIENT_ID` |
| [Eventbrite](https://www.eventbrite.com/platform/api) | One organisation's own events (Eventbrite closed its public search in 2020). | Secret `EVENTBRITE_TOKEN`, variable `EVENTBRITE_ORG_ID` |

Listings from several services are merged, and an event listed twice appears once.

**About keys in a website.** Everything Atlas uses is sent to the browser, so these keys are visible to
anyone who looks. Ticketmaster and SeatGeek keys are meant for this (they identify the app and are
rate-limited). An Eventbrite private token can do more than read events; use one from an account that
only owns the public events you want to show, or route Eventbrite through a small proxy (like the AI
proxy in `docs/ai-proxy.md`) before relying on it.
