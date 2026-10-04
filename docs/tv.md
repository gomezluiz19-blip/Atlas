# Terreno on a TV (demo)

**What it is.** TV mode is Terreno for a screen across the room: no panels, big type, and a playlist that runs by itself (Live Earth with wind and planes, great places, the world's markets, your home as a hologram). A QR code in the corner turns any phone into the remote: search on the phone and the TV flies there; tap a lens and it opens on the big screen. Remote commands pause the playlist for a minute.

**How to open it**
- The 📺 button at the top of Terreno › *Cast to a TV* (Chrome and Edge show their own cast picker), or *TV mode on this screen*.
- Any link ending `#/tv` (or `#/tv/ABC234` to use a known code), e.g. on a smart TV's browser.
- For a meeting: a laptop on HDMI, or AirPlay/Chrome Cast from a laptop or iPad, then TV mode on that screen. The device does the 3D drawing, so this looks best.

**The TV has to run Terreno itself.** Mirroring (AirPlay, Screen Mirroring, casting your screen) shows the phone's own screen, so that phone can't be the remote at the same time. So: open `…/Terreno/tv` on the TV's browser or a laptop plugged into the TV, or *Cast to a TV* from Chrome (the Chromecast loads Terreno by itself and the phone turns into the remote). Once a phone connects, the QR code steps aside; it comes back if the remote goes quiet.

**The remote** is its own small page, `remote.html#CODE` (no globe, so it opens instantly), built as a controller:
- **The orb**: drag to spin the Earth (its meridians turn under your thumb), flick and it coasts, pinch to zoom, tap to pick what's in the middle, double-tap to dive in, hold for the menu.
- **The ring**: up, down, left, right through the TV's menu (search, plan a trip, my trips, my place, work, the playlist, lenses, hologram, wind, exit) and through whatever is open on the TV.
- **Search**: the orb gives way to a search bar and the keyboard; what you type appears big on the TV with suggestions on both screens.
- **Voice**: say where to go; the TV shows your words as you speak (where the browser supports speech recognition).

**The real product, not a screensaver.** The TV runs the same Terreno, so its tools work there too, driven from the phone:
- **My place** boots your home as the hologram with everything under it: the dock (Today, Packages, Cameras, What's on, Plans, Grow, Flock, Build, Energy & water), Trace my building, Add trees & pool, Still, Film, Fly in on the globe, and your other places. The ring moves a focus ring between them; tap the orb to press one; Back returns to the hologram.
- **Plan a trip**: on the phone, a sheet for where, from, the dates and how many people; *Plan it on the TV* opens Travel on the TV with the journey drawn: the flight or drive, the boarding pass, the time change, the weather, where to stay. *▶ Play the trip* flies it step by step with big captions ("✈️ Fly to Lisbon · 1,666 km · about 4 h 38 min", then "Lisbon · 5 nights"). *Save to my trips* keeps it.
- **My trips**: your saved journeys as big cards; pick one and it plays.
- **Work**: the industry tools, on the big screen.
- **Any panel is drivable** (`src/tv/spatial.ts`): the focus ring goes to the nearest button, link or field in the direction pressed, and scrolls long panels. Selecting a text, date or number field opens the phone's keyboard or date picker, and what you type fills the TV's field live; *Done* submits it. While you're working on something, the playlist waits.

**How the two talk.** Two tabs in one browser use a BroadcastChannel. Two devices meet through [ntfy.sh](https://ntfy.sh), a free public relay, just long enough to open a direct WebRTC channel (the remote shows "⚡ direct"); the orb's dragging then goes phone to TV directly. If the direct channel can't open, everything goes through the relay, with dragging thinned to a few updates a second. Anyone who knows a code can drive that TV, which is fine for a demo. For the product, replace it with Supabase Realtime (already the back end) and a short-lived pairing token; `src/tv/link.ts` is the only file that changes.

**Later**: Google TV / Android TV and Fire TV apps wrapping TV mode, then Samsung and LG web apps; Apple TV is covered by AirPlay (see the discussion in the PR).
