// How to get a home camera into Atlas, brand by brand. Most home cameras
// (Ring, Nest, Arlo, Blink) send video only to their maker's cloud and app,
// with no stream link to paste; others (Reolink, Tapo, UniFi, most CCTV)
// speak RTSP on the home network. So each brand gets its ways in, best
// first, each honest about what it takes:
//   share   show the camera's own app or web page inside Atlas (screen share; computers)
//   app     open the camera's app or website from its spot on the map
//   bridge  a small program at home turns the camera into a stream Atlas plays (WebRTC or HLS)
//   rtsp    the camera's own RTSP stream, through the same kind of bridge
//   link    a stream link the camera or its software already gives (HLS, MJPEG, snapshot, WebRTC)
//   official  the maker's own API for other apps (needs Atlas's server; coming)
//   phone   an old phone as a camera, paired to Atlas (coming)
// Pure data and a few pure helpers; the screens are in cameras.ts.

export type Way = "share" | "app" | "bridge" | "rtsp" | "link" | "official" | "phone";
export type Ready = "now" | "setup" | "soon";

export interface WayInfo { id: Way; label: string; emoji: string; ready: Ready; short: string }
export const WAYS: Record<Way, WayInfo> = {
  share: { id: "share", label: "Show its live view here", emoji: "🖥", ready: "now", short: "Open the camera's app or website on this computer and share that window into Atlas. Nothing is sent anywhere." },
  app: { id: "app", label: "Open its app", emoji: "📱", ready: "now", short: "Jump from the camera's spot on the map straight to its live view in the maker's app or website." },
  bridge: { id: "bridge", label: "Through a home bridge", emoji: "🏠", ready: "setup", short: "Free software on an always-on computer at home signs in to the camera and gives Atlas a live stream, about a second behind." },
  rtsp: { id: "rtsp", label: "Its own stream (RTSP)", emoji: "📡", ready: "setup", short: "The camera streams on your home network; a small bridge (go2rtc) turns that into a link Atlas plays." },
  link: { id: "link", label: "Paste a stream link", emoji: "🔗", ready: "now", short: "An HLS (.m3u8), MJPEG, snapshot or WebRTC link from the camera or its software." },
  official: { id: "official", label: "Sign in with the maker", emoji: "🔐", ready: "soon", short: "The maker's own API for other apps. Needs Atlas's server; coming when accounts are switched on." },
  phone: { id: "phone", label: "Use an old phone", emoji: "♻️", ready: "soon", short: "Open Atlas on a spare phone, point it at the room, and pair it with this one. Coming with accounts." },
};

export interface Brand {
  id: string; name: string;
  /** The ways in, best first. */
  ways: Way[];
  /** The maker's web live view, if there is one (else its app page). */
  web?: string;
  /** What the bridge needs, in plain words. */
  bridge?: string;
  /** The RTSP address pattern, if the camera has one. */
  rtsp?: string;
  note?: string;
}

export const BRANDS: Brand[] = [
  { id: "ring", name: "Ring", ways: ["share", "app", "bridge"], web: "https://account.ring.com/account/dashboard",
    bridge: "Scrypted (Ring plugin) or Home Assistant (Ring integration) signs in to your Ring account at home and gives a WebRTC or HLS link.",
    note: "Ring sends video only to its own app; there's no stream link to paste." },
  { id: "nest", name: "Google Nest", ways: ["share", "app", "official", "bridge"], web: "https://home.google.com",
    bridge: "Scrypted's Google Device Access plugin or Home Assistant's Nest integration gives a WebRTC link.",
    note: "Google offers an official camera API (Device Access); Atlas will connect to it once its server is on." },
  { id: "arlo", name: "Arlo", ways: ["share", "app", "bridge"], web: "https://my.arlo.com", bridge: "Scrypted's Arlo plugin gives a stream link." },
  { id: "blink", name: "Blink", ways: ["app", "bridge"], web: "https://blinkforhome.com", bridge: "Home Assistant's Blink integration gives snapshots (Blink doesn't allow continuous streaming).", note: "Blink has no web live view, so window sharing needs its app on a computer." },
  { id: "wyze", name: "Wyze", ways: ["share", "app", "bridge"], web: "https://view.wyze.com", bridge: "docker-wyze-bridge on a home computer turns each Wyze camera into an RTSP, HLS and WebRTC stream." },
  { id: "eufy", name: "eufy", ways: ["share", "app", "rtsp", "bridge"], web: "https://mysecurity.eufylife.com", rtsp: "Turn on RTSP for the camera in the eufy app (supported models), then add it to go2rtc.", bridge: "Scrypted's eufy plugin." },
  { id: "simplisafe", name: "SimpliSafe", ways: ["share", "app"], web: "https://webapp.simplisafe.com" },
  { id: "reolink", name: "Reolink", ways: ["rtsp", "link", "app"], rtsp: "rtsp://USER:PASS@CAMERA-IP:554/h264Preview_01_main", note: "Reolink cameras stream on your network out of the box; also a snapshot link: http://CAMERA-IP/cgi-bin/api.cgi?cmd=Snap&channel=0&user=USER&password=PASS." },
  { id: "tapo", name: "TP-Link Tapo", ways: ["rtsp", "app"], rtsp: "rtsp://USER:PASS@CAMERA-IP:554/stream1", note: "Create a camera account in the Tapo app (Advanced settings) first." },
  { id: "unifi", name: "UniFi Protect", ways: ["rtsp", "share", "app"], web: "https://unifi.ui.com", rtsp: "Turn on RTSPS for the camera in Protect; it shows the address (rtsps://NVR-IP:7441/…)." },
  { id: "hikvision", name: "Hikvision / Dahua / CCTV", ways: ["rtsp", "link", "share"], web: "https://www.hik-connect.com", rtsp: "rtsp://USER:PASS@RECORDER-IP:554/Streaming/Channels/101 (Hikvision) · rtsp://USER:PASS@RECORDER-IP:554/cam/realmonitor?channel=1&subtype=0 (Dahua)" },
  { id: "amcrest", name: "Amcrest", ways: ["rtsp", "link", "app"], rtsp: "rtsp://USER:PASS@CAMERA-IP:554/cam/realmonitor?channel=1&subtype=0", note: "Also MJPEG: http://CAMERA-IP/cgi-bin/mjpg/video.cgi" },
  { id: "homeassistant", name: "Home Assistant", ways: ["link", "bridge"], bridge: "Any camera in Home Assistant has a live MJPEG link: https://YOUR-HA/api/camera_proxy_stream/camera.NAME?token=…", note: "Use its https address (Home Assistant Cloud or your own), not the local http one." },
  { id: "other", name: "Something else", ways: ["link", "share", "rtsp", "phone"] },
];

export const brand = (id?: string) => BRANDS.find((b) => b.id === id);

/** What a pasted link is, from its shape (pure). */
export type LinkKind = "hls" | "mjpeg" | "snapshot" | "webrtc" | "rtsp" | "page" | "unknown";
export function linkKind(url: string): LinkKind {
  const u = url.trim().toLowerCase();
  if (/^rtsps?:\/\//.test(u)) return "rtsp";
  if (!/^https?:\/\//.test(u)) return "unknown";
  if (/\.m3u8(\?|$)/.test(u)) return "hls";
  if (/\/api\/webrtc|\/whep|webrtc\?|whep\?/.test(u)) return "webrtc";
  if (/\.(jpe?g|png|webp)(\?|$)|snapshot|cmd=snap|\/still|\/image/.test(u)) return "snapshot";
  if (/mjpe?g|\.cgi|camera_proxy_stream|\/stream|faststream|videostream/.test(u)) return "mjpeg";
  if (/ring\.com|nest\.com|home\.google\.com|arlo\.com|wyze\.com|eufylife\.com|simplisafe\.com|ui\.com|hik-connect\.com/.test(u)) return "page";
  return "unknown";
}

/**
 * What stands between a link and playing it here (pure): an RTSP link needs a
 * bridge; a maker's web page can't be embedded (share its window instead); an
 * http link on a home network is blocked from an https page (mixed content).
 */
export function linkProblem(url: string, pageIsHttps = true): string | null {
  const k = linkKind(url);
  if (k === "rtsp") return "Browsers can't open rtsp:// links. Add this address to a bridge like go2rtc, then paste the link it gives (…/api/stream.m3u8?src=… or …/api/webrtc?src=…).";
  if (k === "page") return "That's the maker's website, which can't be shown inside another site. Use “Show its live view here” to share its window instead.";
  if (k === "unknown" && !/^https?:\/\//i.test(url.trim())) return "Paste the camera's web link (it starts with http).";
  if (pageIsHttps && /^http:\/\//i.test(url.trim())) return "Atlas runs on a secure (https) address, and browsers block plain http video from home networks. Give the bridge an https address: Home Assistant Cloud, Tailscale Funnel or a Cloudflare Tunnel all do it.";
  return null;
}

/** go2rtc's links for a stream name (pure). */
export const go2rtcLinks = (base: string, name: string) => {
  const b = base.replace(/\/+$/, "");
  return { webrtc: `${b}/api/webrtc?src=${encodeURIComponent(name)}`, hls: `${b}/api/stream.m3u8?src=${encodeURIComponent(name)}`, mjpeg: `${b}/api/stream.mjpeg?src=${encodeURIComponent(name)}` };
};

/** A go2rtc config for one camera (pure): paste into go2rtc.yaml. */
export const go2rtcConfig = (name: string, rtsp: string) => `streams:\n  ${name.replace(/[^a-z0-9_]+/gi, "_").toLowerCase() || "camera"}: ${rtsp}\n`;
