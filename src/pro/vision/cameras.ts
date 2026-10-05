// A place's cameras, live. Connect each camera placed in My Places to its
// feed (a stream link, this device's camera, or a recorded clip) and it
// watches for you: who's in view now, who came in and went out across a
// line you draw over the doorway, where people spend their time (a heatmap,
// and named zones like "Shoe wall" or "Till"), and the moments worth seeing,
// each a picture you can tap to jump to. For a recorded clip it ends with a
// summary in a sentence. Everything runs on this device.
import "./cameras.css";
import type { App } from "../../app";
import type { PlaceScene } from "../../myplaces/scene";
import type { Device, MyPlace, PlaceStore } from "../../myplaces/store";
import { h } from "../../ui/dom";
import { groundPoint, type Kind } from "./analytics";
import { BRANDS, brand, go2rtcConfig, go2rtcLinks, linkKind, linkProblem, WAYS, type Way } from "./connect";
import { CameraMonitor, type FeedKind, type MonitorState } from "./monitor";

const COLORS: Record<Kind, string> = { person: "#b8496a", vehicle: "#3563d6", bike: "#e1b843" };
const WORD: Record<Kind, [string, string]> = { person: ["person", "people"], vehicle: ["vehicle", "vehicles"], bike: ["bike", "bikes"] };
const n = (k: Kind, v: number) => `${v} ${WORD[k][v === 1 ? 0 : 1]}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const wall = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** A recorded clip in a sentence (or two). */
export function clipSentence(s: Pick<MonitorState, "clip" | "mode" | "moments">, zones: { name: string; share: number }[], hasLine: boolean): string {
  const c = s.clip;
  if (!c) return "";
  const parts: string[] = [];
  const share = c.readings ? Math.round((c.moving / c.readings) * 100) : 0;
  if (s.mode === "people") {
    parts.push(share ? `someone was in view ${share}% of the time` : "nobody came into view");
    if (hasLine) parts.push(`${c.entered === 1 ? "1 person" : `${c.entered} people`} came in and ${c.exited} went out`);
    if (c.peak) parts.push(`the busiest moment was at ${clock(c.peakT)}, with ${n("person", c.peak)} in view`);
  } else {
    parts.push(share >= 95 ? "there was movement the whole time" : share ? `there was movement ${share}% of the time` : "nothing moved");
    if (c.peak) parts.push(`the busiest moment was at ${clock(c.peakT)}`);
  }
  const top = [...zones].sort((a, b) => b.share - a.share)[0];
  if (top && top.share > 0.05) parts.push(`most of the ${s.mode === "people" ? "time people spent" : "activity"} was at ${top.name} (${Math.round(top.share * 100)}%)`);
  const text = parts.join("; ");
  return `${c.done ? "In this clip" : "So far"} (${clock(c.duration)}): ${text || "nothing much happened"}.`;
}

let shared: ReturnType<typeof build> | null = null;
/** The camera section (one per app: cards and feeds carry on as panels change). */
export function createCameraSection(app: App, scene: PlaceScene, store?: PlaceStore) {
  shared ??= build(app, scene, store);
  return shared;
}

function build(app: App, scene: PlaceScene, store?: PlaceStore) {
  const monitors = new Map<string, CameraMonitor>();
  if (import.meta.env?.DEV) (window as unknown as { __cams?: unknown }).__cams = monitors;
  const cards = new Map<string, HTMLElement>();
  const summary = h("p", { class: "muted small cam-summary" });
  const list = h("div", { class: "cam-list" });
  const el = h("div", { class: "cam-section" }, summary, list,
    h("p", { class: "fineprint" }, "Everything runs on this device: video never leaves the browser. Terreno sees kinds of things (people, vehicles, bikes) and movement, never who someone is. Map positions are approximate."));
  let place: MyPlace | null = null;

  /** Saves a change to a camera (its line or zones) back to My Places. */
  const saveCam = (cam: Device) => {
    if (!store || !place) return;
    const p = store.get(place.id);
    if (p) store.save({ ...p, devices: p.devices.map((d) => (d.id === cam.id ? cam : d)) });
  };

  const pushToMap = () => {
    const pts: { lon: number; lat: number; color: string }[] = [];
    let live = 0;
    const totals: Record<Kind, number> = { person: 0, vehicle: 0, bike: 0 };
    for (const m of monitors.values()) {
      if (m.state.status !== "running") continue;
      live++;
      for (const d of m.state.detections) {
        totals[d.kind]++;
        const [lon, lat] = groundPoint(m.camera, d.box[0] + d.box[2] / 2, d.box[1] + d.box[3]);
        pts.push({ lon, lat, color: COLORS[d.kind] });
      }
    }
    scene.setLive(pts);
    summary.textContent = live
      ? `On camera now: ${n("person", totals.person)}${totals.vehicle ? `, ${n("vehicle", totals.vehicle)}` : ""}${totals.bike ? `, ${n("bike", totals.bike)}` : ""} (${live} camera${live === 1 ? "" : "s"} live)`
      : "Connect a camera to see who comes and goes, where people spend their time, and the moments worth seeing.";
  };

  const card = (cam: Device) => {
    const mon = monitors.get(cam.id) ?? new CameraMonitor(cam);
    monitors.set(cam.id, mon);
    const status = h("span", { class: "cam-status" });
    const mode = h("span", { class: "cam-mode" });
    const body = h("div", { class: "cam-body" });
    const box = h("div", { class: "cam-preview" });
    const overlay = h("canvas", { class: "cam-overlay" }) as HTMLCanvasElement;
    let heatOn = false;
    let tool: null | { kind: "line"; pts: [number, number][] } | { kind: "zone"; start?: [number, number]; now?: [number, number] } = null;
    const hint = h("div", { class: "cam-hint", hidden: true });

    const draw = () => {
      const r = box.getBoundingClientRect();
      if (!r.width) return;
      overlay.width = r.width * devicePixelRatio;
      overlay.height = r.height * devicePixelRatio;
      const ctx = overlay.getContext("2d")!;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      if (heatOn) mon.motion.paintHeat(ctx, r.width, r.height);
      ctx.font = "600 11px -apple-system, system-ui, sans-serif";
      for (const z of cam.zones ?? []) {
        const [x, y, w, hh] = z.box;
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.strokeRect(x * r.width, y * r.height, w * r.width, hh * r.height);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(0,0,0,.55)";
        const tw = ctx.measureText(z.name).width + 10;
        ctx.fillRect(x * r.width, y * r.height, tw, 16);
        ctx.fillStyle = "#fff"; ctx.fillText(z.name, x * r.width + 5, y * r.height + 12);
      }
      if (tool?.kind === "zone" && tool.start && tool.now) {
        ctx.strokeStyle = "#e1b843"; ctx.lineWidth = 2;
        ctx.strokeRect(tool.start[0] * r.width, tool.start[1] * r.height, (tool.now[0] - tool.start[0]) * r.width, (tool.now[1] - tool.start[1]) * r.height);
      }
      ctx.lineWidth = 2;
      for (const d of mon.state.detections) {
        const [x, y, w, hh] = d.box;
        ctx.strokeStyle = ctx.fillStyle = COLORS[d.kind];
        ctx.strokeRect(x * r.width, y * r.height, w * r.width, hh * r.height);
        ctx.fillText(`${d.kind} ${Math.round(d.score * 100)}%`, x * r.width + 3, y * r.height + 12);
      }
      const l = mon.analyzer.line;
      if (l) {
        ctx.strokeStyle = "#5b9467"; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
        ctx.beginPath(); ctx.moveTo(l.a[0] * r.width, l.a[1] * r.height); ctx.lineTo(l.b[0] * r.width, l.b[1] * r.height); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#5b9467"; ctx.fillText("IN →", ((l.a[0] + l.b[0]) / 2) * r.width + 6, ((l.a[1] + l.b[1]) / 2) * r.height - 6);
      }
      if (tool?.kind === "line") for (const p of tool.pts) { ctx.fillStyle = "#5b9467"; ctx.beginPath(); ctx.arc(p[0] * r.width, p[1] * r.height, 5, 0, Math.PI * 2); ctx.fill(); }
    };

    addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape" && tool) { tool = null; hint.hidden = true; draw(); } });
    const at = (e: PointerEvent): [number, number] => { const r = overlay.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    overlay.addEventListener("pointerdown", (e) => {
      if (!tool) return;
      if (tool.kind === "line") {
        tool.pts.push(at(e));
        if (tool.pts.length === 2) {
          cam.line = { a: tool.pts[0], b: tool.pts[1] };
          mon.analyzer.setLine(cam.line);
          saveCam(cam);
          tool = null; hint.hidden = true;
          app.toast("Counting line set. Crossing it in the direction of the arrow counts as coming in.", 4000);
          buildTools();
        }
        draw();
      } else { tool.start = at(e); tool.now = tool.start; overlay.setPointerCapture(e.pointerId); }
    });
    overlay.addEventListener("pointermove", (e) => { if (tool?.kind === "zone" && tool.start) { tool.now = at(e); draw(); } });
    overlay.addEventListener("pointerup", () => {
      if (tool?.kind !== "zone" || !tool.start || !tool.now) return;
      const [x1, y1] = tool.start, [x2, y2] = tool.now;
      const b: [number, number, number, number] = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      tool = null; hint.hidden = true;
      if (b[2] < 0.03 || b[3] < 0.03) { draw(); return; }
      cam.zones = [...(cam.zones ?? []), { name: `Zone ${(cam.zones?.length ?? 0) + 1}`, box: b }];
      saveCam(cam);
      buildZones();
      draw();
    });

    const sparkline = (vals: number[]) => {
      const max = Math.max(1e-6, ...vals);
      return h("div", { class: "cam-spark" }, ...vals.slice(-60).map((v) => h("span", { style: `height:${Math.max(3, (v / max) * 100)}%` })));
    };

    // The live layout is built once; each reading only updates the numbers, so buttons and
    // zone names stay put under your finger.
    let layout: "live" | "setup" | null = null;
    let momentsShown = -1;
    const sentenceEl = h("p", { class: "cam-sentence", hidden: true });
    const statsEl = h("div", { class: "cam-stats" });
    const zonesEl = h("div", { class: "cam-zones" });
    const momentsEl = h("div", { class: "cam-moments" });
    const toolsEl = h("div", { class: "chips wrap cam-tools" });
    const zoneBars: { bar: HTMLElement; pct: HTMLElement }[] = [];

    const buildTools = () => toolsEl.replaceChildren(
      h("button", { class: "chip", "aria-pressed": String(heatOn), onclick: () => { heatOn = !heatOn; buildTools(); draw(); } }, heatOn ? "Hide heatmap" : "🔥 Where people spend time"),
      h("button", { class: "chip", onclick: () => { tool = { kind: "line", pts: [] }; hint.textContent = "Tap two points across the doorway"; hint.hidden = false; } }, cam.line ? "Redraw door line" : "🚪 Count people at the door"),
      cam.line ? h("button", { class: "chip", onclick: () => { cam.line = undefined; mon.analyzer.setLine(null); saveCam(cam); buildTools(); draw(); } }, "Remove door line") : "",
      h("button", { class: "chip", onclick: () => { tool = { kind: "zone" }; hint.textContent = "Drag a box over an area (a rack, the till, a table)"; hint.hidden = false; } }, "▭ Add a zone"),
      h("button", { class: "chip", onclick: () => { mon.stop(); pushToMap(); } }, "Stop"));

    const buildZones = () => {
      zoneBars.length = 0;
      zonesEl.replaceChildren(...(cam.zones ?? []).map((z, i) => {
        const bar = h("i"), pct = h("small", {}, "0%");
        zoneBars.push({ bar, pct });
        return h("div", { class: "cam-zone" },
          h("input", { value: z.name, "aria-label": "Zone name", onchange: (e: Event) => { cam.zones![i].name = (e.target as HTMLInputElement).value.trim() || cam.zones![i].name; saveCam(cam); draw(); } }),
          h("span", { class: "cam-zone-bar" }, bar), pct,
          h("button", { class: "icon-btn", "aria-label": "Remove zone", onclick: () => { cam.zones = cam.zones!.filter((_, k) => k !== i); saveCam(cam); buildZones(); draw(); } }, "✕"));
      }));
      zonesEl.hidden = !cam.zones?.length;
    };

    const buildMoments = () => {
      const ms = mon.state.moments;
      momentsShown = ms.length;
      momentsEl.hidden = !ms.length;
      momentsEl.replaceChildren(...ms.slice(0, 24).map((m) => h("button", { class: "cam-moment", title: m.label, onclick: () => (m.t !== undefined ? mon.seek(m.t) : undefined) },
        m.thumb ? h("img", { src: m.thumb, alt: "" }) : "",
        h("small", {}, m.t !== undefined ? clock(m.t) : wall(m.at)), h("span", {}, m.label))));
    };

    const update = () => {
      const s = mon.state;
      status.textContent = s.status === "running" ? (s.mode === "people" ? `Live · ${n("person", s.tick?.counts.person ?? 0)} in view` : "Live · watching for movement") : s.status === "loading-model" ? "Getting ready…" : s.status === "starting" ? "Connecting…" : s.status === "error" ? "Problem" : "Not connected";
      status.className = `cam-status ${s.status}`;
      mode.textContent = s.status === "running" ? (s.mode === "people" ? "People" : "Motion") : "";
      mode.title = s.mode === "motion" ? "The people detector couldn't load (offline or blocked), so Terreno is watching for movement instead." : "Counting people, vehicles and bikes";
      if (s.status === "running" || s.status === "loading-model" || s.status === "starting") {
        if (mon.el && mon.el.parentElement !== box) box.replaceChildren(mon.el, overlay, hint);
        if (layout !== "live") {
          layout = "live";
          momentsShown = -1;
          buildTools(); buildZones();
          body.replaceChildren(box, sentenceEl, statsEl, zonesEl, momentsEl, toolsEl);
        }
        const t = s.tick;
        const zones = mon.motion.zoneShares(cam.zones ?? []);
        if (zones.length !== zoneBars.length) buildZones();
        zones.forEach((z, i) => { zoneBars[i].bar.style.width = `${Math.round(z.share * 100)}%`; zoneBars[i].pct.textContent = `${Math.round(z.share * 100)}%`; });
        const people = s.mode === "people";
        const peak = s.clip?.peak ?? Math.max(0, ...s.activityHistory.map((v) => (people ? v : Math.round(v * 100))));
        sentenceEl.hidden = !s.clip;
        if (s.clip) sentenceEl.textContent = clipSentence(s, zones, !!cam.line);
        statsEl.replaceChildren(
          people ? h("div", {}, h("strong", {}, String(t?.counts.person ?? 0)), h("small", {}, "in view now")) : h("div", {}, h("strong", {}, `${Math.round(s.activity * 100)}%`), h("small", {}, "of the view moving")),
          cam.line && people ? h("div", {}, h("strong", {}, `${t?.entered ?? 0} · ${t?.exited ?? 0}`), h("small", {}, "came in · went out")) : h("div", {}, h("strong", {}, String(s.moments.length)), h("small", {}, s.moments.length === 1 ? "moment" : "moments")),
          h("div", {}, h("strong", {}, people ? String(peak) : `${peak}%`), h("small", {}, s.clip ? `busiest, at ${clock(s.clip.peakT)}` : "busiest so far")),
          h("div", { class: "cam-spark-cell" }, sparkline(s.activityHistory), h("small", {}, people ? "people over time" : "movement over time")));
        if (s.moments.length !== momentsShown) buildMoments();
        requestAnimationFrame(draw);
      } else {
        if (layout === "setup" && !s.error) return;
        layout = "setup";
        const file = h("input", { type: "file", accept: "video/*", hidden: true, onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) start("file", f); } });
        const start = (kind: FeedKind, v: string | File) => {
          if (kind === "link" && store && place && cam.url !== v) { cam.url = v as string; saveCam(cam); }
          void mon.start(kind, v);
        };
        const setBrand = (id?: string) => { cam.brand = id; saveCam(cam); layout = null; update(); };
        const linkRow = (placeholder: string) => {
          const url = h("input", { type: "url", class: "pro-url", placeholder, value: cam.url ?? "", "aria-label": "Camera link" }) as HTMLInputElement;
          const warn = h("p", { class: "muted small cam-warn", hidden: true });
          const check = () => { const p = linkProblem(url.value, location.protocol === "https:"); warn.textContent = p ?? ""; warn.hidden = !p || !url.value.trim(); };
          url.addEventListener("input", check);
          check();
          return h("div", {}, h("div", { class: "pro-url-row" }, url, h("button", { class: "primary-btn", onclick: () => {
            const v = url.value.trim(), k = linkKind(v);
            if (k === "rtsp" || k === "page" || !/^https?:\/\//i.test(v)) { check(); warn.hidden = false; return; }
            start("link", v);
          } }, "Connect")), warn);
        };
        const quick = h("div", { class: "chips wrap cam-quick" },
          h("button", { class: "chip", onclick: () => file.click() }, "🎞️ Try a recorded clip"),
          "mediaDevices" in navigator ? h("button", { class: "chip", onclick: () => start("webcam", "") }, "📷 This device's camera") : "", file);
        const b = brand(cam.brand);
        if (!b) {
          body.replaceChildren(
            s.error ? h("p", { class: "error" }, s.error) : "",
            h("p", { class: "cam-ask" }, "What camera is it?"),
            h("div", { class: "cam-brands" }, ...BRANDS.map((x) => h("button", { class: "cam-brand", onclick: () => setBrand(x.id) }, h("strong", {}, x.name), h("small", {}, WAYS[x.ways[0]].label)))),
            quick);
          return;
        }
        const canShare = !!(navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown } | undefined)?.getDisplayMedia;
        const wayCard = (w: Way, i: number) => {
          const info = WAYS[w];
          const ready = w === "share" && !canShare ? "soon" : info.ready;
          const badge = h("span", { class: `cam-ready ${ready}` }, ready === "now" ? "Works now" : ready === "setup" ? "Needs a bridge at home" : w === "share" ? "On a computer" : "Coming");
          const steps: (Node | string)[] = [];
          if (w === "share") steps.push(
            h("ol", { class: "cam-steps" },
              h("li", {}, b.web ? h("a", { href: b.web, target: "_blank", rel: "noopener noreferrer" }, `Open ${b.name}'s live view ↗`) : `Open the ${b.name} app on this computer`, " and start the camera's live view."),
              h("li", {}, "Come back and tap Share; pick that window or tab.")),
            h("button", { class: "primary-btn", disabled: !canShare, onclick: () => start("screen", "") }, "Share its window"));
          if (w === "app") steps.push(h("a", { class: "primary-btn", href: b.web ?? "#", target: "_blank", rel: "noopener noreferrer" }, `Open ${b.name} ↗`), h("p", { class: "muted small" }, "On a phone this opens the app if it's installed."));
          if (w === "bridge") steps.push(h("p", { class: "small" }, b.bridge ?? "Scrypted, Home Assistant or go2rtc at home can give Terreno a stream link."), h("p", { class: "muted small" }, "Give the bridge an https address (Home Assistant Cloud, Tailscale Funnel or a Cloudflare Tunnel), then paste its WebRTC, HLS or MJPEG link:"), linkRow("https://…/api/webrtc?src=front_door"));
          if (w === "rtsp") {
            const rtsp = h("input", { class: "pro-url", placeholder: b.rtsp && /^rtsp/.test(b.rtsp) ? b.rtsp : "rtsp://user:pass@camera-ip:554/…", "aria-label": "The camera's RTSP address" }) as HTMLInputElement;
            const out = h("pre", { class: "cam-code" });
            const show = () => { const name = (cam.label ?? "camera").toLowerCase().replace(/[^a-z0-9]+/g, "_"); const l = go2rtcLinks("https://YOUR-BRIDGE", name); out.textContent = `# go2rtc.yaml\n${go2rtcConfig(name, rtsp.value.trim() || rtsp.placeholder)}\n# then paste one of these into Terreno:\n${l.webrtc}\n${l.hls}`; };
            rtsp.addEventListener("input", show); show();
            steps.push(b.rtsp && !/^rtsp/.test(b.rtsp) ? h("p", { class: "small" }, b.rtsp) : "", h("p", { class: "muted small" }, "Run go2rtc (one small program) on a computer at home, give it this camera:"), rtsp, out, linkRow("https://…/api/webrtc?src=…"));
          }
          if (w === "link") steps.push(linkRow("https://… (.m3u8, MJPEG, snapshot or WebRTC link)"));
          return h("details", { class: "cam-way" + (ready === "soon" ? " soon" : ""), ...(i === 0 ? { open: true } : {}) },
            h("summary", {}, h("span", { class: "cam-way-emoji" }, info.emoji), h("span", { class: "cam-way-label" }, info.label), badge),
            h("p", { class: "muted small" }, info.short), ...steps);
        };
        body.replaceChildren(
          s.error ? h("p", { class: "error" }, s.error) : "",
          h("div", { class: "cam-brand-head" }, h("strong", {}, b.name), h("button", { class: "link-btn", onclick: () => setBrand(undefined) }, "Change")),
          b.note ? h("p", { class: "muted small" }, b.note) : "",
          h("div", { class: "cam-ways" }, ...b.ways.map(wayCard)),
          quick);
      }
    };

    mon.subscribe(() => { update(); pushToMap(); });
    update();
    return h("div", { class: "cam-card" }, h("div", { class: "cam-head" }, h("strong", {}, cam.label ?? "Camera"), mode, status), body);
  };

  return {
    /** The section for a place's cameras (cards are reused so feeds keep running). */
    el(p: MyPlace): HTMLElement {
      if (place && place.id !== p.id) this.stopAll();
      place = p;
      const cams = p.devices.filter((d) => d.type === "camera");
      if (!cams.length) list.replaceChildren(h("p", { class: "muted small" }, "No cameras yet. Place one on the map (+ Camera), then connect its feed here."));
      else list.replaceChildren(...cams.map((c) => {
        let cardEl = cards.get(c.id);
        if (!cardEl) cards.set(c.id, (cardEl = card(c)));
        return cardEl;
      }));
      pushToMap();
      return el;
    },
    stopAll() {
      for (const m of monitors.values()) m.stop();
      monitors.clear();
      cards.clear();
      scene.setLive([]);
    },
  };
}
