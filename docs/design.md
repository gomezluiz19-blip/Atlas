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
| `--cobalt` (`--accent`) | #2e7cf6 | #4c8df8 | You, routes, the main action, focus |
| `--terra` (`--link`) | #c8553d | #e07a62 | People, avatars, links |
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

- **Figtree** for everything you read, as in the deck: 15 px for interface text, 600 for names, 700 for section
  heads ("Favorites", "From your circle") in sentence case, 800 for titles. **Axiforma Heavy** stays the wordmark,
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

- **Surfaces**: 18 px radius for sheets and panels, 16 for cards, 12 for controls, buttons and chips, 22 for the
  dock. A soft lift (`--shadow`), no outline; cards sit white on the panel with a whisper of shadow.
- **Buttons**: primary is solid blue, 12 px radius, bold. Secondary is a quiet fill. The strongest choice (Follow,
  View on map) is the near-black pill; links are terracotta text.
- **Chips**: a quiet fill, 12 px radius, 600; on is the near-black pill.
- **Segmented**: a fill track; the chosen one is a white card with a small shadow.
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

- **The band**: Terreno's mark and name, white on a field of cyan, across the top. It opens About.
- **The bubble**: under the band the map is a big rounded window, framed by a light wash of the band's cyan.
  The button at its top right opens it to the whole screen (the band slides away) and back. Presenting, filming
  and a TV always have the whole screen.
- **Person first.** Each button in the dock opens on the person, then the place:
  - **Navigate** asks *How are you going?* with big tiles that fill the panel: **Walk**, **Drive**, **Train**,
    **Taxi**, and **More** (Bike, Fly, Guide me). Walking is the default and the last choice is remembered.
    Below them, *Where to, walking?* and your places and people. A walk, a drive or a ride is routed on the
    map; the train opens a transit planner (Google or Apple Maps) and a taxi a ride app (Uber, Lyft) with the
    drop-off filled in, with the journey drawn here alongside. Fly opens the trip planner; Guide me starts
    on-foot guidance (`src/ui/travelModes.ts`).
  - **Search** shows what people look for as big tiles (Food, Coffee, Parks, Shops, Stay, Fuel) above the field;
    a tap searches near the map. Its own suggestions come once you type.
  - **Me** shows what you came for as tiles (My page, Field note, My Place, Watching), then the rest as rows.
- **The dock**, along the bottom inside the bubble, big and plain: **Search**, **Navigate**, **Me** and **＋**, each
  a big icon with its word under it, ＋ in the action colour.
- **＋** opens Explore, Create and Work; then the **views** (People, Nature, Countries as tiles, the rest as
  chips), which work like map layers: choosing one changes the map and leaves its card as just a heading; choose
  it again, or tap the heading, to read it; then the tools (Pulse, Time, map style, Lenses, a TV, My Place).

On a TV the menu is the same frame: Search, Go to, Me, ＋ in the first row, the views in the second, and the
room's own tools only once ＋ is opened.

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
