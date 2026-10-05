# Terreno on a TV (demo)

**What it is.** TV mode is Terreno for a screen across the room: no panels, big type, and a playlist that runs by itself. A QR code in the corner turns any phone into the remote. Remote commands pause the playlist for a minute.

**What the screen is for.** A living-room TV, a classroom display, an operations wall, a lobby screen and a meeting-room screen need different things, so the first time the TV asks *What's this screen for?* (one question, remembered on that screen; *This screen is for…* on the menu or the phone changes it). If nobody answers within a minute it starts as Home, so a screen left alone never sits on a question. Each room has the same shape: what plays by itself, and the tools the remote reaches for (on the TV's menu, first row; and as a strip on the phone).

| Room | Who it's for | Plays by itself | Tools |
| --- | --- | --- | --- |
| Home | the living room | Live Earth, great places, markets, your home | search, plan a trip, my trips, my place, Work, lenses, hologram, wind |
| Classroom | teachers | Where in the world?, great places, Live Earth | lessons, class quiz, Where in the world?, time machine, pointer, spotlight, pen, timer, search, lenses |
| Operations | control rooms, site offices | our sites, hazards, world clocks, Live Earth | sites, hazards, clocks, Work, search, pointer, timer |
| Lobby | reception, shops, waiting rooms | welcome, great places, clocks, Live Earth | welcome message, search, clocks |
| Meeting room | briefings and reviews | Live Earth, markets, hazards | present, pointer, spotlight, pen, timer, search, Work, sites, clocks |

**For teachers.**
- *Lessons*: any deck from Stories/Present, or a ready-made one. The room sees the slides (with the borders of the slide's year); the phone shows the slide's notes, what's next, the time since you started, and big ‹ and Next › buttons.
- *Class quiz*: the question big enough for the back row, four lettered answers in four colours, a countdown bar. The answer shows only on the teacher's phone until *Reveal*, then the right one lights up and the globe flies to the place. Uses the teacher's own quizzes (from Teach) or a ready-made one (capitals and famous places, asked fairly: capitals among capitals).
- *Where in the world?*: a clue and a spinning Earth, ten seconds to call it out, then the reveal. It plays by itself between lessons, a starter that needs no setting up.
- *Time machine*: the world's borders from 123,000 BC to today, stepped with the remote's left and right.
- *Pointer, spotlight, pen*: the phone's pad becomes the TV's screen in miniature; a thumb moves a red laser dot (with a fading tail), a spotlight that dims everything else, or a pen that draws over the globe.
- *Timer*: 1 to 30 minutes, a ring in the corner the whole room can read, a chime at zero.

**For operations.** *Our sites* gathers every named place in the Pro tools' workspaces (Build Pro, Construction, City Ops, Schools, Freight, Relief, Mining, Field Ops, Field Network, Business network, Sports, Office, Fields), frames them all, then visits each with its local time, weather and wind beside a board of all of them. *Hazards* lists this week's earthquakes (USGS) within reach of a site, the reach growing with magnitude. *World clocks* shows one clock per time zone your sites are in, green when it's working hours there, over the day and night on the globe.

**The phone hands over what's on it.** The TV usually isn't the device where the lessons, quizzes and sites were made. The remote is part of Terreno, so it reads the phone's own saved decks, quizzes and Pro workspaces and sends them to the TV (📱 in its lists; 📺 marks what's saved on the TV itself). Big things go through the relay in pieces and are put back together on the TV.

**For screens left on all day.** The screen is kept awake (Screen Wake Lock, asked again when the tab comes back) and the fixed titles drift a few pixels every few minutes so they don't burn in.

**How to open it**
- The 📺 button at the top of Terreno › *Cast to a TV* (Chrome and Edge show their own cast picker), or *TV mode on this screen*.
- Any link ending `#/tv` (or `#/tv/ABC234` to use a known code), e.g. on a smart TV's browser.
- For a meeting: a laptop on HDMI, or AirPlay/Chrome Cast from a laptop or iPad, then TV mode on that screen. The device does the 3D drawing, so this looks best.

**The TV has to run Terreno itself.** Mirroring (AirPlay, Screen Mirroring, casting your screen) shows the phone's own screen, so that phone can't be the remote at the same time. So: open `…/Terreno/tv` on the TV's browser or a laptop plugged into the TV, or *Cast to a TV* from Chrome (the Chromecast loads Terreno by itself and the phone turns into the remote). Once a phone connects, the QR code steps aside; it comes back if the remote goes quiet.

**The remote** is its own small page, `remote.html#CODE` (no globe, so it opens instantly), built as a controller:
- **The deck**: a big rounded square with a trackball orb inside, keys down both sides (back, menu, zoom in and out; search, voice, OK, next), in a dark neon instrument style.
- **The orb**: a wireframe globe that rolls under your thumb in any direction (its grid turns about the screen's own axes, like a real trackball) while the Earth on the TV turns with it; flick and it coasts, pinch to zoom, tap to pick what's in the middle, double-tap to dive in, hold for the menu. Under the square, the orb's yaw and pitch read out live.
- **The square's edges**: up, down, left, right through the TV's menu (the room's tools on the first row; change room and exit on the second) and through whatever is open on the TV. During a lesson they turn the slides; during a quiz they move between questions; in the time machine they move through the years.
- **The tool strip** under the title: the room's tools, filled in by the TV, so the phone always matches the screen.
- **Search**: the orb gives way to a search bar and the keyboard; what you type appears big on the TV with suggestions on both screens.
- **Voice**: say where to go; the TV shows your words as you speak (where the browser supports speech recognition).

**The real product, not a screensaver.** The TV runs the same Terreno, so its tools work there too, driven from the phone:
- **My place** boots your home as the hologram with everything under it: the dock (Today, Packages, Cameras, What's on, Plans, Grow, Flock, Build, Energy & water), Trace my building, Add trees & pool, Still, Film, Fly in on the globe, and your other places. The ring moves a focus ring between them; tap the orb to press one; Back returns to the hologram.
- **Plan a trip**: on the phone, a sheet for where, from, the dates and how many people; *Plan it on the TV* opens Travel on the TV with the journey drawn: the flight or drive, the boarding pass, the time change, the weather, where to stay. *▶ Play the trip* flies it step by step with big captions ("✈️ Fly to Lisbon · 1,666 km · about 4 h 38 min", then "Lisbon · 5 nights"). *Save to my trips* keeps it.
- **My trips**: your saved journeys as big cards; pick one and it plays.
- **Work**: the industry tools, on the big screen.
- **Any panel is drivable** (`src/tv/spatial.ts`): the focus ring goes to the nearest button, link or field in the direction pressed, and scrolls long panels. Selecting a text, date or number field opens the phone's keyboard or date picker, and what you type fills the TV's field live; *Done* submits it. While you're working on something, the playlist waits.

**A keyboard works too** (a laptop on HDMI): arrows move, Enter picks, M opens the menu, Escape goes back (or leaves). With a mouse, the pointer and spotlight follow it.

**How the two talk.** Two tabs in one browser use a BroadcastChannel. Two devices meet through [ntfy.sh](https://ntfy.sh), a free public relay, just long enough to open a direct WebRTC channel (the remote shows "⚡ direct"); the orb's dragging then goes phone to TV directly. If the direct channel can't open, everything goes through the relay, with dragging thinned to a few updates a second. Anyone who knows a code can drive that TV, which is fine for a demo. For the product, replace it with Supabase Realtime (already the back end) and a short-lived pairing token; `src/tv/link.ts` is the only file that changes.

**Later**: Google TV / Android TV and Fire TV apps wrapping TV mode, then Samsung and LG web apps; Apple TV is covered by AirPlay (see the discussion in the PR).

**The remote.** The pad takes the whole width of the phone. One finger rolls the Earth (flick and it coasts); an edge tap moves through the TV's menus; a tap in the middle is OK, two taps dive in, a hold opens the menu. Two fingers pinch to zoom, twist to turn the view around what's in the middle, and slide together to tilt toward the horizon (`orbit`). Under the pad: a zoom fader (drag for smooth zoom, tap the ends for a step) and Back, Menu, Search, Voice. The pad's corners read out where the TV's camera settled (`cam`: latitude, longitude, height, heading).

**Phone and TV together.** As the TV flies, the wayfinder tells the room what it's passing (a panel under the brand), and hands each one to the phone (`passing`) with *Open on phone*. *Open here* takes the TV's whole view onto the phone. The other way: a phone that has driven a TV in the last twelve hours gets *Show on TV* on any place (`goto`).
