# Cameras in My Places

Connect a place's cameras and Atlas watches them for you, on the device: who's in view, who came in
and went out across a line drawn over the doorway, where people spend their time (a heatmap, and
named zones like "Shoe wall" or "Till"), and the moments worth seeing, each a picture you can tap to
jump to. A recorded clip ends with a summary in a sentence.

## Setting one up

1. **My Places › your place › Cameras & security › + Camera.** Tap where the camera is, then the far
   edge of what it sees. Its view is drawn on the ground.
2. **Live › Connect** with one of:
   - **A recorded clip** (MP4 or MOV exported from the recorder, or a phone video of the screen).
     Best for trying it: Atlas watches the whole clip and sums it up.
   - **A live link**: HLS (`…/stream.m3u8`), MJPEG (`…/video.cgi`, `…/mjpg/video.mjpg`), or a snapshot
     image the camera refreshes (`…/snapshot.jpg`).
   - **This device's camera** (a laptop or tablet pointed at the room).
3. **🚪 Count people at the door**: tap two points across the doorway. Crossing it in the arrow's
   direction counts as coming in.
4. **▭ Add a zone**: drag a box over an area and name it. Zones and the door line are saved with the
   camera.

## Home cameras, brand by brand

Pick the camera's maker and Atlas lists the ways in, best first, each marked *Works now*, *Needs a bridge
at home* or *Coming*:

| Brand | Best way now | With a home bridge | Notes |
|---|---|---|---|
| Ring | Share the Ring web live view's window into Atlas (computers); Open in Ring (phones) | Scrypted (Ring plugin) or Home Assistant → WebRTC/HLS | No official API for live video |
| Google Nest | Share window; Open in Google Home | Scrypted / Home Assistant | Official Device Access API: needs Atlas's server (coming) |
| Arlo, Wyze, eufy, SimpliSafe | Share window; Open the app | Scrypted, docker-wyze-bridge, eufy RTSP | |
| Blink | Open the app | Home Assistant (snapshots only) | No web live view |
| Reolink, Tapo, UniFi, Hikvision/Dahua, Amcrest | Their own RTSP stream through go2rtc | — | Atlas writes the go2rtc config and the link for you |
| Home Assistant | Its MJPEG camera link (`/api/camera_proxy_stream/…`) | — | Use the https address |

**Share its window** uses the browser's screen sharing: the person opens the camera's own live view in another tab or
app and picks it. Nothing is sent anywhere, and Atlas's people counting works on it. Phones can't share other apps'
windows, so there it's *Open in the app*.

**WebRTC links** (go2rtc's `…/api/webrtc?src=…`, MediaMTX's `…/whep`) play about a second behind live: Atlas
posts an offer to receive video and plays the answer (WHEP).

**https:** Atlas runs on a secure address, and browsers block plain `http://` video from home networks. Give the
bridge an https address: Home Assistant Cloud, Tailscale Funnel or a Cloudflare Tunnel.

**Coming:** sign in with Google (Nest's official API) once Atlas's server is on, and *Use an old phone*: open Atlas on
a spare phone, point it at the room, and pair it with this one.

## Most CCTV recorders speak RTSP

Browsers can't open `rtsp://` links. A small bridge on the shop's network turns them into HLS:

- [go2rtc](https://github.com/AlexxIT/go2rtc) (one small program, runs on a Raspberry Pi or the shop
  PC). Add the camera's RTSP address in its config, and use its `…/api/stream.m3u8?src=camera1` link.
- [MediaMTX](https://github.com/bluenviron/mediamtx) does the same.

Most Hikvision/Dahua-style recorders (the "Camera 01" overlay kind) use
`rtsp://user:password@recorder-ip:554/Streaming/Channels/101` for the first camera.

If the stream plays but Atlas says it "can't be analysed here", the bridge needs to allow
cross-origin requests (go2rtc does by default; for others, serve it through the edge Worker).

## What it can and can't do

- **People mode** (the default): a small detector (COCO-SSD) counts people, vehicles and bikes. It
  loads from the web the first time.
- **Motion mode**: if the detector can't load (offline, blocked), Atlas watches for movement
  instead: activity, the heatmap, zones and moments still work; counts at the door need people mode.
- It never identifies anyone: no faces, no identities. Video and pictures stay in the browser; only
  what you save (the camera's place, line and zones) is kept with My Places.
- Positions on the map are approximate (worked out from where the camera is and which way it faces).

## Trying it: Flor Boutique

Save the shop in My Places (search "Parque Duarte, Eugenio María de Hostos" and tap the shop), set it
to *Business*, add a camera over the shop floor, then *Open a recorded clip* with the recorder's
export. Draw the door line across the entrance and a zone over each rack; play the clip through for
the summary.
