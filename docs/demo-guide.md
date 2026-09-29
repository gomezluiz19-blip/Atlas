# Showing Atlas

A guide for demo days: students, teachers, early users and investors. What to set up, what to show each
audience, and what to say when something's slow.

## The day before

- [ ] **Deploy the latest `main`** and open the live site once on the demo machine, so the service worker
      caches the app and the tiles for the places you'll show.
- [ ] **Connect Atlas AI** if you can: account button › Connect Atlas AI › a proxy URL (docs/ai-proxy.md)
      or your own key. Without it, search requests and Lens Studio use the built-in planner and designer,
      which cover the demos below.
- [ ] **Feedback**: set `VITE_FEEDBACK_URL` (a Formspree or similar endpoint) to collect notes centrally.
      Without it, notes stay on the device; read them from account › Send feedback › *Notes left on this
      device*, and download them after.
- [ ] **A clean slate for each visitor**: account button › About Atlas › *Start fresh* (tap twice). The
      next visitor gets the opening titles and the one-minute tour; Atlas AI and feedback notes are kept.
- [ ] **Link previews**: deploy with the site's address known (the GitHub Pages workflow sets
      `ATLAS_SITE_URL`), so links you send show the Atlas card with its image.
- [ ] Chrome or Safari, full screen, a mouse or trackpad. On phones, Atlas works one-handed; add it to the
      home screen for full screen.

## Five minutes for anyone

1. **The opening.** Let the titles play from black; the Earth settles on your side of the planet in real
   sunlight. The tour offers itself once; finish or skip it.
2. **One box for everything.** Type `Mount Fuji`, then press Enter. Its page arrives: the camera comes in,
   the name and one fact are set over the map. Scroll the card: every layer at once.
3. **A lens.** In the card, tap *Block*: the mountain lifts out as a block you can turn. Then *A day here*:
   real shadows sweeping across it through the day.
4. **Time.** Tap the hourglass and drag to 1914: the empires of the time. Then to 2070: projections.
5. **People.** Account button › *or be someone for a while* › Maya. Her page opens: a Top 8 of bird spots
   around Vancouver with the places pinned on the globe. Tap *▶ Fly my places*.
6. **Make a lens.** From Maya's page, her *Birdwatching* lens: it opens on Reifel sanctuary with what's been
   seen this month, the hides, the best window for the weather, and a verdict. Then Lens Studio: type
   `a coffee crawl with bakeries` and press *Make it*; try it on any city.
7. **Watch it.** On any lens with a verdict, *🔔 Tell me when*: Atlas checks and tells you when it's a
   good time (Kenji's *Aurora watch* on Tromsø is the showstopper on a stormy night).
8. **A guide.** Priya's page › *Lisbon in a day* › ▶: the route draws itself and the globe flies stop to
   stop with her words.

## For students (10 minutes)

- Sign in as **Maya** (student). Show her page, her journal, her guestbook (sign it).
- On a phone: account › *Field note*: a photo, a line, pinned where they're standing, in their journal.
- Look › Learn: the daily challenge, games and the passport (each country you explore stamps it).
- Search `1914`, or ask *"Show me the Roman Empire"* (with Atlas AI).
- Let them make their own page: account › Sign in or join › any email (nothing is sent) › pick a face and
  *Student*. Their page opens in edit mode: add their Top 8 by searching (`Eiffel Tower`, a local park) or
  *Restaurants, cafés, bars and parks near …*. Then *Share* copies a link that carries the whole page.

## For teachers (10 minutes)

- Sign in as **Ada Okafor** (teacher). Her page: the Seven Sisters chalk cliffs, the Thames Barrier, her
  *Rock detective* lens.
- Make › Teach: a lesson from the map, a quiz with a link for students (`#quiz=…`), a field trip.
- Make › Stories: a story told on the globe, shared as a link, remixable.
- Ms Okafor's guide *A geography day along the Thames*: a field trip as a guide students can play.
- The *Sea level* lens on London; *Rewind* on the chalk cliffs (250 million years in one slider).

## For investors (7 minutes)

The pitch in the product: *the whole Earth, and your own corner of it*.

1. **Breadth that feels like one thing**: the search box answers places, questions, years and layers
   (`flat land under 800 m near an airport` → *Answer on the map*).
2. **Depth on any spot**: a place page reads every layer at once; ~12,000 places are pre-rendered as real
   web pages (`/p/<name>/`) for search engines, which is the growth loop.
3. **People and making**: pages of places people love, and lenses anyone can make by describing them.
   Every page and lens is a shareable link, so each user brings the next.
4. **A daily reason to return**: My Place › *Or try a demo farm*: today's brief (frost, heat, animals due);
   and *Watch* on any lens (alerts when it's a good time).
5. **Businesses**: a shop's own cameras in My Place (see *Cameras* below): who came in, where people
   spend their time, the moments worth seeing, all on the device.
6. **What's real and what's next**: every figure comes from live public data (sources in About). The back
   end is built and switches on with a Supabase project (`docs/backend.md`, about 25 minutes).

## Cameras (5 minutes, for owners and investors)

Have the shop's recorded clip on the laptop (Flor Boutique's works). My Place › the business › Cameras &
security › Live › *Open a recorded clip*. While it plays: *🔥 Where people spend time*, drag a zone over a
rack, tap a moment to jump there. At the end, the clip's summary in a sentence. Setup notes, including
CCTV recorders: `docs/cameras.md`.

## If something's slow

- Public data services occasionally rate-limit. Every panel says what it's reading and fails gracefully;
  move on and come back.
- A place card that seems stuck: move the map away and the card lets go ("← Back to …" returns).
- Anything odd: reload. Nothing you made is lost; it's kept on the device.

## Resetting the demo machine

About › *Start fresh* between visitors. For a complete wipe (feedback notes and the AI key too), clear the
site's data in the browser's settings. The example people, lenses and demo farm are always there.
