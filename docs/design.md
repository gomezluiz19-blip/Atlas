# Terreno design system

Terreno is an instrument for reading the Earth. The globe is the subject. Everything else is the frame around it:
quiet, exact and warm, the way a good field notebook or a surveyor's tool is. These notes are the rules. The code
that carries them is `src/styles.css` (tokens at the top), `src/brand.css` (the component layer),
`src/ui/brand.ts` (the mark) and `src/ui/glyph.ts` with `src/ui/noEmoji.ts` (icons).

## Where it comes from

The brand board: four earth pigments (cobalt blue, yellow ochre, green-grey, brown), the name set wide under a
horizon arc, the Earth as a **mosaic of tesserae**, and map tiles framed by **registration marks**, the crosshairs a
printer uses to line up a plate. Terreno means terrain. A tessera is one tile of a mosaic. So the product is made of
tiles, and what you choose is framed like a plate on press.

## Principles

1. **The Earth is the brightest thing on screen.** Panels are paper by day and basalt by night, a little translucent,
   edged with a hairline. No glossy gradients, no candy colours, no glow. If the interface competes with the
   globe, the interface is wrong.
2. **One action colour.** Cobalt means "you can press this". Everything else is ink, paper and their greys.
3. **Pigments mean things.** Cobalt and cerulean are water. Sage is land and growth. Ochre is attention and earth.
   Terracotta is warning and the built world. Madder and umber fill out charts. A colour is never decoration.
4. **Tiles, not bubbles.** An icon sits on a tessera: a square tile, lightly tinted in its pigment, with the icon
   drawn as a line in that pigment. Never a filled circle of saturated colour.
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
| `--paper` | #f5f2eb | #141613 | Surfaces |
| `--ink` / `--label` | #1b1d1a | #ece8de | Text |
| `--secondary` | #5e625a | #a5a79c | Supporting text |
| `--cobalt` (`--accent`) | #2f58c8 | #7f9cf0 | Action, focus, selection |
| `--ochre` | #c4922b | #dcae4c | Attention, highlights |
| `--sage` | #56705a | #94ad93 | Land, growth, all-clear |
| `--terra` | #a9502f | #d9805d | Warnings, the built world |

Data colours (map layers, charts) use the full pigment range, mid-toned to read on satellite imagery and on paper:
cobalt #3563d6, cerulean #4c9ac9, sage #5b9467, sap #8faa5a, ochre #d19a2e, Naples #e1b843, terracotta #c4513a,
madder #b8496a, violet #8b5fa8, ultramarine #5160c2, umber #9a7552, stone #8c8f87.

## Type

- **Axiforma** for everything you read (Kastelov's geometric sans): 13–15 px for interface text, 700 for titles,
  small capitals tracked 0.14 em for section labels. **Axiforma Heavy** for the wordmark, tracked wide (0.3 em).
- **Geist Mono** only for figures: coordinates, distances, headings, counters, the remote's readouts.
- Axiforma is licensed. Drop the licensed webfonts into `public/fonts/` as `Axiforma-Regular`, `-Medium`,
  `-SemiBold`, `-Bold` and `-Heavy` (`.woff2`, `.woff` or `.otf`) and the build serves them (`src/ui/fonts.ts`
  writes the `@font-face` rules, under the family name "Terreno Sans"). A machine with Axiforma installed uses
  its own copy. Until then everyone else sees **Plus Jakarta Sans**, the nearest open face (geometric, wide, a
  two-storey a), at the same weights.

## The mark

A dome of tesserae: half the Earth seen at the horizon, laid as a mosaic in the four pigments, under the horizon arc,
with registration marks at the corners. `markSvg()` makes every size from one definition. The compact cut (bigger
dome, no arc or marks) is for 32 px and below. `scripts/brand-icons.mjs` writes `public/icon.svg` and the favicon.

## Components

- **Surfaces**: 14 px radius for panels, 12 for cards, 10 for buttons in the top bar, 8 for controls, 7 for chips.
  One shadow: a hairline ring and a soft drop.
- **Buttons**: primary is solid cobalt. Secondary is a hairline outline. Never a pill of saturated colour.
- **Chips**: hairline, 7 px radius; on is a cobalt tint with cobalt text.
- **Icon tiles**: `--c` sets the pigment; the brand layer tints and outlines the tile and draws the icon in it.
- **Motion**: one curve (`--ease`), 150–250 ms, nothing bouncy; `prefers-reduced-motion` turns it off.

## The globe

`src/globe/finish.ts` sets the house look. The satellite imagery gets a grade (a little more contrast and colour,
slightly lower gamma). Sunlight from orbit shows the real day and night, with NASA's city lights on the night side;
it fades out as you come down to a city, where an evenly lit map matters more. Night is dusk, not black. The
haze is thin and rich so land and sea read deep, the sun is a sun rather than a lens flare, and the stars are
dimmed so the Earth is the brightest thing on screen.

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
