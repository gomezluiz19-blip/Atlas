# Atlas on a TV (demo)

**What it is.** TV mode is Atlas for a screen across the room: no panels, big type, and a playlist that runs by itself (Live Earth with wind and planes, great places, the world's markets, your home as a hologram). A QR code in the corner turns any phone into the remote: search on the phone and the TV flies there; tap a lens and it opens on the big screen. Remote commands pause the playlist for a minute.

**How to open it**
- The 📺 button at the top of Atlas › *Cast to a TV* (Chrome and Edge show their own cast picker), or *TV mode on this screen*.
- Any link ending `#/tv` (or `#/tv/ABC234` to use a known code), e.g. on a smart TV's browser.
- For a meeting: a laptop on HDMI, or AirPlay/Chrome Cast from a laptop or iPad, then TV mode on that screen. The device does the 3D drawing, so this looks best.

**The remote** is its own small page, `remote.html#CODE` (no globe, so it opens instantly on a phone).

**How the two talk.** Two tabs in one browser use a BroadcastChannel. Two devices go through [ntfy.sh](https://ntfy.sh), a free public relay; anyone who knows a code can drive that TV, which is fine for a demo. For the product, replace it with Supabase Realtime (already the back end) and a short-lived pairing token; `src/tv/link.ts` is the only file that changes.

**Later**: Google TV / Android TV and Fire TV apps wrapping TV mode, then Samsung and LG web apps; Apple TV is covered by AirPlay (see the discussion in the PR).
