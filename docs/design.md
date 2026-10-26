# Terreno design system

Terreno is an instrument for reading the Earth. The globe is the subject. Everything else is the frame around it:
quiet, exact and warm, the way a good field notebook or a surveyor's tool is. These notes are the rules. The code
that carries them is `src/styles.css` (tokens at the top), `src/brand.css` (the component layer),
`src/ui/brand.ts` (the mark) and `src/ui/glyph.ts` with `src/ui/noEmoji.ts` (icons).

## Where it comes from

**The look follows the Terreno Mobile deck** (a design canvas in the team's projects: the map home, the drive, a
profile and the circle feed). A rendered map in warm paper and white clay buildings, rounded panels that float over
it without outlines, Figtree, blue for where you are and what to do, terracotta for people and links; at night the
same map in slate. What follows puts that into rules.

The brand board: four earth pigments (cobalt blue, yellow ochre, green-grey, brown), the name set wide under a
horizon arc, the Earth as a **mosaic of tesserae**, and map tiles framed by **registration marks**, the crosshairs a
printer uses to line up a plate. Terreno means terrain. A tessera is one tile of a mosaic. So the product is made of
tiles, and what you choose is framed like a plate on press.

## Principles

1. **The map is rendered, and it is the brightest thing on screen.** A drawn street map in warm paper with white clay
   buildings, the way an architect's model or a good maps app reads, not a photograph by default (satellite is one
   tap away in Map style). Panels are off-white by day and slate by night, lifted by a soft shadow, never outlined.
   No glossy gradients, no candy colours, no glow.
2. **Blue for where you are and what to do.** The location dot, routes and the main button are blue. Terracotta is
   for people and links (avatars, "More", "See all"). The strongest choice is a near-black pill. Everything else
   is ink, paper and their warm greys.
3. **Pigments mean things.** Blue is you and water, green is parks and growth, amber is food and attention,
   terracotta is people and places to eat, teal is getting around, earth is work. A colour is never decoration.
4. **Discs, not outlines.** An icon sits on a filled disc in its pigment with the icon in white, like the deck's
   favourites and map pins, ringed in white where it stands on the map.
5. **Registration marks frame what's chosen.** The selected mode, theme or lens is framed by four corner ticks in
   the action colour (`.reg`). It's the brand's signature: precise, printed, unmistakably ours.
6. **Fewer, better.** A surface offers what fits the moment, not everything Terreno can do. Lenses show at most
   four views that suit the place; the rest wait behind *More*. A tool appears where it makes sense (a 3D block
   for a mountain, not for a city street).
7. **No borrowed emoji.** A phone's emoji never match the type, the palette or each other. Terreno draws its own:
   line icons in the text's colour, a country's two letters instead of a flag, a tessera for anything else. Text
   people type is left as they wrote it.
8. **Plain words.** Name things by who they're for and what they do. Sentences, not jargon. (See `docs/work-design.md`.)

## Colour

| Token | Day | Night | Use |
| --- | --- | --- | --- |
| `--paper` | #ece8e1 | #151a20 | The map's ground, page backgrounds |
| `--material` | #f9f8f6 (94%) | #101418 (92%) | Panels, the dock, the place card |
| `--card` | #ffffff | 5% white | Cards on a panel |
| `--ink` / `--label` | #1c1b19 | #f4f6f8 | Text |
| `--secondary` | #6b6760 | #a9b3be | Supporting text |
| `--fill` | #e9e6e0 | 7% white | Search fields, chips, quiet buttons |
| `--clay` (`--accent`, `--link`) | #9c4a32 | #c8714f | Terreno's own colour: the band, the main action, focus, links, the one accent in every pictogram |
| `--cobalt` | #2e7cf6 | #4c8df8 | You and your routes on the map |
| `--terra` | #c8553d | #e07a62 | People, avatars |
| `--pill` | #1c1b19 | #f4f6f8 | The strongest choice, toasts |
| `--ochre` | #b7741f | #d9973f | Food, attention |
| `--sage` | #3e7a2e | #4ade80 | Parks, growth, on time |
| `--teal` | #1f7a72 | #3fb3a8 | Getting around |
| `--danger` | #e5484d | #e5484d | Stop, end, delete |

Data colours (map layers, charts) use the full pigment range, mid-toned to read on satellite imagery and on paper:
cobalt #3563d6, cerulean #4c9ac9, ice #a3bfd4, sage #5b9467, sap #8faa5a, ochre #d19a2e, Naples #e1b843, terracotta #c4513a,
madder #b8496a, violet #8b5fa8, ultramarine #5160c2, umber #9a7552, stone #8c8f87. Each kind of feature
has one pigment wherever it's drawn (`src/content/kindColor.ts`): umber for peaks and ranges, terracotta for
volcanoes and the plates, ice for glaciers, madder for reefs, sap for wetlands and islands, violet for caves.

## Type

- **Figtree** for everything you read, on one scale (the type block at the end of `src/styles.css`):
  `--t-display` 800 at 26–32 px, tight, for what a panel is about; `--t-title` 750 20 px; `--t-row` 650 16 px for
  the things you tap; `--t-small` 13.5 px for what supports them; `--t-kicker` 750 11.5 px, spaced capitals, above
  each group ("GETTING THERE"). **Axiforma Heavy** stays the wordmark,
  tracked wide (0.3 em).
- **Geist Mono** only for figures: coordinates, distances, headings, counters, the remote's readouts.
- Axiforma is licensed. Drop the licensed webfonts into `public/fonts/` as `Axiforma-Regular`, `-Medium`,
  `-SemiBold`, `-Bold` and `-Heavy` (`.woff2`, `.woff` or `.otf`) and the build serves them (`src/ui/fonts.ts`
  writes the `@font-face` rules, under the family name "Terreno Sans") for the wordmark. Figtree comes from Google
  Fonts; Axiforma and then Plus Jakarta Sans stand in if it can't load.

## The mark

A dome of tesserae: half the Earth seen at the horizon, laid as a mosaic in the four pigments, under the horizon arc,
with registration marks at the corners. `markSvg()` makes every size from one definition. The compact cut (bigger
dome, no arc or marks) is for 32 px and below. `scripts/brand-icons.mjs` writes `public/icon.svg` and the favicon.

## Components

- **Surfaces**: 26 px radius for sheets and panels, 18 for cards, 14 for fields. A deep, soft lift and no outline.
- **Menus**: rows at least 56 px tall, the title in `--t-row`, the icon in a clay-tinted disc, no separators; a row
  dips slightly when pressed.
- **Buttons**: pills. Primary is solid clay, bold 15 px, with a clay glow under it; secondary is a quiet fill.
  Links are clay text.
- **Chips**: pills, 650; on is solid clay.
- **Segmented**: a pill track; the chosen one is a white pill with a small shadow.
- **Icon discs**: `--c` sets the pigment; the disc is filled with it and the icon drawn in white.
- **Toasts**: the near-black pill, centred, white text.
- The Terreno Mobile layer at the end of `src/styles.css` carries these over every component.
- **Motion**: one curve (`--ease`), 150–250 ms, nothing bouncy; `prefers-reduced-motion` turns it off.

## The map

The default is **rendered** (`src/globe/viewer.ts`, `src/globe/imagery.ts`): a drawn street map (CARTO's Voyager
by day, Dark Matter by night, from OpenStreetMap) graded to the deck's warm paper or slate, with its own muted street
and place names, and, as you come down over a town, the buildings themselves standing up in white clay (slate by
night) with trees in the parks (`src/city/life.ts`). Over the satellite photo the same buildings keep their
coloured roofs. Night follows the device's setting. Map style offers Rendered, Satellite and Plain, and remembers the
choice. Another drawn style is a setting away (`VITE_RENDERED_TILES`, `VITE_RENDERED_LABELS`; see
docs/data-licensing.md). Map names over the light map are ink with a white halo; pins are filled discs ringed in
white.

## The globe

`src/globe/finish.ts` sets the house look. From orbit the planet is NASA's Blue Marble with shaded relief and
the sea floor: one cloud-free, colour-true mosaic in which the ocean ridges and trenches show through the blue. It
hands over to the map (rendered or satellite) as you come down (gone by about 1,800 km up), so the Earth is crisp at
every height. The real sun lights it: the terminator lies where dusk really is right now, the haze follows the sun,
and the night side is night, carried by NASA's city lights; both the shading and the lights fade away below a
few thousand kilometres, where an evenly lit map matters more. The first frame is composed on the sun: the
Earth opens as a crescent over the night side's cities and turns into the day over your part of the world.
Strong devices render with 4× multisampling and finer terrain; the stars are dimmed so the Earth is the
brightest thing on screen.

## A medium, not a map app

Terreno should feel less like looking something up and more like being somewhere, the way a good open-world game
does: you always know which way you're facing, the world tells you about itself as you move through it, and it
seems to know where you're headed. Three rules carry that:

1. **The world speaks up.** As you glide over the globe, walk, drive or fly, what you pass gets a card: its
   name, the one line worth knowing, which side it's on. Each one is counted ("No. 014 found"), quietly.
2. **You always have a bearing.** The compass ribbon under the top bar shows your heading and the landmarks
   ahead as tiles; the place you seem to be making for is the cobalt diamond.
3. **It guesses, then offers.** Move steadily toward one of your places (home, a saved place, a recent search,
   today's plan) and Terreno asks "Heading home?" with one button to be taken there. Never more than a question.

The model is `src/wayfind/model.ts` (pure, tested); the screens are `src/wayfind/ui.ts`.

## The frame

The map is the page, opening over where you are (or your home), like any map you already trust.

- **The band**: Terreno's mark and name, white on a field of clay (a red-brown, `--band-c`), across the top. It
  opens About.
- **The bubble**: under the band the map is a big rounded window, framed by a light wash of the band's clay.
  The button at its top right opens it to the whole screen (the band slides away) and back. Presenting, filming
  and a TV always have the whole screen.
- **Stages, person first.** Each button in the dock opens the bubble into a *stage* (`src/ui/stage.ts`): a sheet of
  paper with a small mark and a question at the top, **four big pictograms in a row** across the middle, a line of
  more choices in words, and a **small field** at the bottom.
  - The pictograms (`src/ui/pictograms.ts`) are drawn like a new set of road and wayfinding signs that happen to
    be art: a plain, solid silhouette in ink with one accent in clay (a taxi's roof sign, a train's stripe, a sun),
    all on one 100-unit grid at one weight, so four read as a family. No tiles, no bubbles, no outlines. Every
    other one sits a little higher so the row reads as a set; they rise in one after another, and the one you
    chose keeps a clay underline while the others step back.
  - **They're alive.** The parts that would move do: the walker's leg and arms swing, the fork lifts to the mouth
    while the knife cuts, the train rocks on its rails, steam rises off the coffee, the taxi's roof sign blinks, the
    bell rings, the flag waves, the compass needle hunts. On an open stage they barely breathe (`--amp` .28, cycles
    1.7 times slower); under the pointer, on keyboard focus, or for a moment after a finger presses one, the same
    motion runs at full reach and pace. Each part names its motion, pivot, reach, cycle and phase in the 100 grid
    (`mv()` in pictograms.ts; the motions in styles.css › Living pictograms). Less motion asked for: they stand still.
  - **Navigate**: *How are you going?* Walk, Drive, Train, Taxi; Bike, Fly, Guide me in words; *Where to,
    walking?* at the bottom (your location, places and people as soon as you tap it). Walking is the default and
    the last choice is remembered. A walk, a drive or a ride is routed on the map; the train opens a transit planner.
  - **Taxi** puts local firms first (`src/taxi/`): the ranks and taxi companies near you from OpenStreetMap, plus
    firms that listed themselves, ranked by who can take you (covers the pickup, has what you need, licence checked,
    nearest; paying never moves a firm up). The meter's fare is estimated from the country's typical tariff, as a
    range ("about $10–13"), and never invented where there's no tariff. Call, WhatsApp and Book each carry a fresh
    booking reference (TRN-7K4P-2M9Q, easy to read out), kept on the device and sent to the firm's records when
    Terreno's servers are on. Uber and Lyft sit underneath, so the choice stays yours. *Run a taxi company? List
    it free* opens the listing page: Listed is free; Partner adds bookings into the firm's dispatch and a monthly
    report for a small flat fee per booking, paid by the company and never by drivers. Firms can sign a *drivers
    keep the full fare* pledge, which riders see as a badge. Tables: `taxi_firms`, `taxi_bookings` in
    `docs/backend.sql`.
  - **Search**: *Look for* Food, Coffee, Parks, A bed; Shops, Fuel, Pharmacy in words; the search field at the
    bottom.
  - **Me**: your name at the top; My page and Field note (or Sign in), My Place, Watching, the tour; everything else
    found from the field.
  - **＋**: *Way in*: Explore, Create, Work, Views (the views open as words); any view or tool found from the field.
- **The dock**, along the bottom inside the bubble: **Search**, **Navigate** and **Me** as big buttons, each a
  big icon with its word under it, and **＋** as a smaller clay disc beside them that turns into × when open.
- **The weather bubble**: a small pill at the top of the map with the weather where you're looking, a symbol and
  the temperature (°F where people read Fahrenheit), from Open-Meteo. It steps away from orbit and while a stage
  is open; tapping it opens the climate view there (`src/shell/weatherBubble.ts`). The map no longer opens on
  the population layer.
- **Quieter**: passing-by cards only for the notable (a higher bar and longer gaps between them), no counters
  or stamps popping up.
- **＋** opens Explore, Create and Work; then the **views** (People, Nature, Countries as tiles, the rest as
  chips), which work like map layers: choosing one changes the map and leaves its card as just a heading; choose
  it again, or tap the heading, to read it; then the tools (Pulse, Time, map style, Lenses, a TV, My Place).

On a TV the menu is the same frame: Search, Go to, Me, ＋ in the first row, the views in the second, and the
room's own tools only once ＋ is opened.

## The opening

Cut like a film title (`src/delight/intro.ts`, `intro.css`), about nine seconds the first time: letterbox bars
close in, a warm clay light drifts over grain, and three title cards come up out of a blur and drift away
(*Every street, every summit, every sea* · *Where you are, and where you're going* · *The whole Earth, as it
is right now*). Then the dome of tesserae falls into place, the horizon is drawn, the name settles from wide to its
own spacing, and the sun's position right now is read out. The dark opens through the dome onto the real Earth,
lit by that sun, and the camera comes down slowly over your part of the world while the bars draw back. Return
visits get the short cut; any key or tap skips.

## Haptics

Every touch answers in the hand (`src/ui/haptics.ts`), on phones only and with one vocabulary: *tick* (a detent,
a finger crossing a key), *tap* (any button), *select* (choosing: a pictogram, a dock button, a tab), *confirm*
(a booking, a chime), *success* (something done), *warn* (something missing), *heavy* (an end stop, a hold).
Android plays them through vibration; iPhone Safari, which has no vibration, gets the system's selection tick
through a hidden switch control. Every button, link, tab and chip gets one without wiring (`hapticsOn`), and an
element can name its own with `data-haptic`. Off with `atlas.haptics = "off"`.

The pictograms press back in their own rhythm (`MOTION_HAPTIC`): footsteps for Walk and Bike, an engine's purr
for Drive and Taxi, the clack of the rails for Train, a rising whoosh for Fly, two bites for Food, a sip for
Coffee, a ring for the bell, a slow breath for a bed or a park.

The TV remote is where it's richest: the pad's edges *select*, a double tap *confirms*, a hold is *heavy*, the
orb ticks as it turns, the zoom fader has detents and a firmer knock at either end, and a finger sliding across
the keys or the tool strip ticks once per key, like a real remote.

## My Place, as a paper model

A place booted in 3D (`src/myplaces/holo.ts`) is an architect's model, not a hologram: a round paper plinth with
a hairline rim and the compass's degree ticks in ink, the ground's grid faint on it, every building around in
paper with ink edges, lit by a soft sky and one low sun, and yours in the accent (clay for a place, ochre for a
site, sage for a programme). No glow, beam, motes or scan lines. The frame around it is the app's own: paper
cards for the readouts, pill buttons, a white dock with icons in tinted discs, tags as small cards.

## Hubs

Create, Explore, My Place and Work list their tools the same way: a white card per tool, the icon in a clay-tinted
disc, the name in `--t-row` and one line under it. **Create** is three things: *Plan*, *Present* and *Video*
(Video opens on *Film the globe* or *3D captures*: bring scans and models onto the Earth, then film them). Teach
sits in Explore beside Learn; *What if…* waits in Work. **Work** opens on the desk (docs/work-design.md).

## Motion

Motion is how the simple insight arrives, not decoration. One curve, three durations, one stagger step
(`src/ui/motion.ts`, the Motion block at the end of `src/styles.css`):

- **Tokens.** `--t-quick` 140 ms (a press), `--t-move` 320 ms (something changes place), `--t-arrive` 600 ms
  (something new lands); `--stagger` 40 ms between siblings. `--ease-settle` (quick to leave, long to settle)
  for the interface, `--ease-lift` (a gentle start) for the camera. On a TV everything takes half again as long.
- **The map leads.** The camera arrives first, timed by how far it travels; the card settles behind it; what the
  card says arrives top to bottom.
- **Morph, don't pop.** A view's chip grows into the card; ＋ grows into its menu; Navigate grows into its panel;
  Search rises from the dock. The morphs are View Transitions on the named pieces only, so the globe keeps moving
  underneath.
- **The marks move.** Registration ticks draw in when something is chosen; hairlines draw left to right; figures
  in Geist Mono and in an insight's headline count up to their value; pigments wash in; the hours rise like a
  skyline; your people land on the globe one after another; heat and view layers fade up rather than appear.
- **Data in the same hand.** What someone brings to a presentation is redrawn, never pasted as a picture of
  someone else's chart: bars in ochre grow in rank order, a line draws itself and its latest value lands, one figure
  counts up in Geist Mono, a share fills a grid of tesserae in the four pigments, places land on the globe one after
  another. Hairlines for axes, no gridlines more than needed, plain words for the change ("Up 33% since 1960").
- **Respectful.** With less motion asked for, everything is a 120 ms fade and nothing travels.

## Web, phone and TV

Each is a different instrument for the same Earth, and each hands off to the others.

- **Web** is the desk: the compass ribbon, passing cards top right, the guess under the ribbon, the full set of
  tools. *Share › Continue on your phone* shows the view as a code your phone's camera opens.
- **Phone** is the field: **Guide** (the arrow in the map controls) follows your GPS with a chase camera behind
  you, tells you what you pass at street level (from Wikipedia), guesses where you're going and gives
  turn-by-turn there (Valhalla over OpenStreetMap). The place card's *Guide me* starts it for any place.
- **TV** is the room: playlists, rooms and tools, with passing cards as a broadcast panel under the brand.
- **Between them**: the phone remote reads out the TV's camera (latitude, longitude, height, heading) in the
  pad's corners and keeps each place the TV passes, with *Open on phone*; *Open here* takes the TV's whole
  view onto the phone. A phone that has driven a TV in the last twelve hours gets *Show on TV* on every place.

## The remote and the TV

The phone remote is an instrument in the same family: basalt, a hairline, figures in mono, one solid cobalt
action. The pad takes the whole width of the phone: drag anywhere to roll the Earth, tap an edge to move through
menus, tap the middle for OK, hold for the menu; pinch to zoom, twist two fingers to turn the view, slide them
together to tilt. The orb in the middle is a globe drawn in the pigments (cobalt grid, ochre equator, terracotta
meridian) inside a bezel of degree ticks; registration ticks mark the pad's corners, with the TV camera's
readouts beside them. Under the pad, a zoom fader (drag for smooth zoom, tap the ends for a step) and four keys:
Back, Menu, Search, Voice. No glow, no scan lines.
