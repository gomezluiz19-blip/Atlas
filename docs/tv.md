# Atlas on a TV (demo)

**What it is.** TV mode is Atlas for a screen across the room: no panels, big type, and a playlist that runs by itself (Live Earth with wind and planes, great places, the world's markets, your home as a hologram). A QR code in the corner turns any phone into the remote: search on the phone and the TV flies there; tap a lens and it opens on the big screen. Remote commands pause the playlist for a minute.

**How to open it**
- The 📺 button at the top of Atlas › *Cast to a TV* (Chrome and Edge show their own cast picker), or *TV mode on this screen*.
- Any link ending `#/tv` (or `#/tv/ABC234` to use a known code), e.g. on a smart TV's browser.
- For a meeting: a laptop on HDMI, or AirPlay/Chrome Cast from a laptop or iPad, then TV mode on that screen. The device does the 3D drawing, so this looks best.

**The TV has to run Atlas itself.** Mirroring (AirPlay, Screen Mirroring, casting your screen) shows the phone's own screen, so that phone can't be the remote at the same time. So: open `…/Atlas/tv` on the TV's browser or a laptop plugged into the TV, or *Cast to a TV* from Chrome (the Chromecast loads Atlas by itself and the phone turns into the remote). Once a phone connects, the QR code steps aside; it comes back if the remote goes quiet.

**The remote** is its own small page, `remote.html#CODE` (no globe, so it opens instantly), built as a controller:
- **The orb**: drag to spin the Earth (its meridians turn under your thumb), flick and it coasts, pinch to zoom, tap to pick what's in the middle, double-tap to dive in, hold for the menu.
- **The ring**: up, down, left, right through the TV's menu (search, the playlist, lenses, hologram, wind, exit).
- **Search**: the orb gives way to a search bar and the keyboard; what you type appears big on the TV with suggestions on both screens.
- **Voice**: say where to go; the TV shows your words as you speak (where the browser supports speech recognition).

**How the two talk.** Two tabs in one browser use a BroadcastChannel. Two devices meet through [ntfy.sh](https://ntfy.sh), a free public relay, just long enough to open a direct WebRTC channel (the remote shows "⚡ direct"); the orb's dragging then goes phone to TV directly. If the direct channel can't open, everything goes through the relay, with dragging thinned to a few updates a second. Anyone who knows a code can drive that TV, which is fine for a demo. For the product, replace it with Supabase Realtime (already the back end) and a short-lived pairing token; `src/tv/link.ts` is the only file that changes.

**Later**: Google TV / Android TV and Fire TV apps wrapping TV mode, then Samsung and LG web apps; Apple TV is covered by AirPlay (see the discussion in the PR).
