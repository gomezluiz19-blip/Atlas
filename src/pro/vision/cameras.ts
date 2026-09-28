// The Cameras section of Atlas Pro: connect each camera placed in My Places to
// its feed and see, live, what it counts. The cards persist across the panel's
// refreshes so video keeps playing.
import type { App } from "../../app";
import type { PlaceScene } from "../../myplaces/scene";
import type { Device, MyPlace } from "../../myplaces/store";
import { h } from "../../ui/dom";
import { groundPoint, type Kind } from "./analytics";
import { CameraMonitor, type FeedKind } from "./monitor";

const COLORS: Record<Kind, string> = { person: "#ff375f", vehicle: "#0a84ff", bike: "#ffd60a" };
const WORD: Record<Kind, [string, string]> = { person: ["person", "people"], vehicle: ["vehicle", "vehicles"], bike: ["bike", "bikes"] };
const n = (k: Kind, v: number) => `${v} ${WORD[k][v === 1 ? 0 : 1]}`;

export function createCameraSection(app: App, scene: PlaceScene) {
  const monitors = new Map<string, CameraMonitor>();
  const cards = new Map<string, HTMLElement>();
  const summary = h("p", { class: "muted small cam-summary" });
  const list = h("div", { class: "cam-list" });
  const el = h("section", { class: "group" }, h("h2", { class: "group-title" }, "Cameras"), summary, list,
    h("p", { class: "fineprint" }, "Counting runs on this device with a small detection model; video never leaves the browser, and it recognises kinds of things (people, vehicles, bikes), never who someone is. Map positions are approximate."));
  let place: MyPlace | null = null;

  const pushToMap = () => {
    const pts: { lon: number; lat: number; color: string }[] = [];
    for (const m of monitors.values()) {
      if (m.state.status !== "running") continue;
      for (const d of m.state.detections) {
        const [lon, lat] = groundPoint(m.camera, d.box[0] + d.box[2] / 2, d.box[1] + d.box[3]);
        pts.push({ lon, lat, color: COLORS[d.kind] });
      }
    }
    scene.setLive(pts);
    const totals: Record<Kind, number> = { person: 0, vehicle: 0, bike: 0 };
    let live = 0;
    for (const m of monitors.values()) if (m.state.status === "running") { live++; for (const d of m.state.detections) totals[d.kind]++; }
    summary.textContent = live
      ? `On camera now: ${n("person", totals.person)}, ${n("vehicle", totals.vehicle)}${totals.bike ? `, ${n("bike", totals.bike)}` : ""} (${live} camera${live === 1 ? "" : "s"} live)`
      : "Connect a camera's feed to count people and vehicles as they come and go.";
  };

  const card = (cam: Device) => {
    const mon = monitors.get(cam.id) ?? new CameraMonitor(cam);
    monitors.set(cam.id, mon);
    const status = h("span", { class: "cam-status" });
    const body = h("div", { class: "cam-body" });
    const box = h("div", { class: "cam-preview" });
    const overlay = h("canvas", { class: "cam-overlay" }) as HTMLCanvasElement;
    const counts = h("div", { class: "cam-counts" });
    const spark = h("div", { class: "cam-spark", "aria-label": "People seen, last hour" });
    let drawing: [number, number][] | null = null;

    const draw = () => {
      const r = box.getBoundingClientRect();
      overlay.width = r.width * devicePixelRatio;
      overlay.height = r.height * devicePixelRatio;
      const ctx = overlay.getContext("2d")!;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineWidth = 2;
      ctx.font = "600 11px -apple-system, system-ui, sans-serif";
      for (const d of mon.state.detections) {
        const [x, y, w, hh] = d.box;
        ctx.strokeStyle = ctx.fillStyle = COLORS[d.kind];
        ctx.strokeRect(x * r.width, y * r.height, w * r.width, hh * r.height);
        ctx.fillText(`${d.kind} ${Math.round(d.score * 100)}%`, x * r.width + 3, y * r.height + 12);
      }
      const l = mon.analyzer.line;
      if (l) {
        ctx.strokeStyle = "#30d158";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(l.a[0] * r.width, l.a[1] * r.height);
        ctx.lineTo(l.b[0] * r.width, l.b[1] * r.height);
        ctx.stroke();
      }
    };

    const update = () => {
      const s = mon.state;
      status.textContent = s.status === "running" ? `Live · ${n("person", s.tick?.counts.person ?? 0)}` : s.status === "loading-model" ? "Loading the detector…" : s.status === "starting" ? "Connecting…" : s.status === "error" ? "Problem" : "Not connected";
      status.className = `cam-status ${s.status}`;
      if (s.status === "running" || s.status === "loading-model") {
        if (mon.el && mon.el.parentElement !== box) box.replaceChildren(mon.el, overlay);
        const t = s.tick;
        counts.replaceChildren(
          ...(["person", "vehicle", "bike"] as Kind[]).map((k) => h("span", { class: "cam-count", style: `--c:${COLORS[k]}` }, h("strong", {}, String(t?.counts[k] ?? 0)), WORD[k][1])),
          mon.analyzer.line ? h("span", { class: "cam-count", style: "--c:#30d158" }, h("strong", {}, `${t?.entered ?? 0} / ${t?.exited ?? 0}`), "in / out") : "");
        const hist = mon.analyzer.history.slice(-60);
        const max = Math.max(1, ...hist.map((x) => x.people));
        spark.replaceChildren(...hist.map((x) => h("span", { style: `height:${Math.max(4, (x.people / max) * 100)}%`, title: `${x.people} people` })));
        body.replaceChildren(box, counts, hist.length > 1 ? h("div", { class: "cam-spark-wrap" }, h("span", { class: "muted small" }, "People, last hour"), spark) : "",
          h("div", { class: "chips wrap" },
            h("button", { class: "chip", onclick: () => { drawing = []; app.toast("Tap two points on the picture to draw the counting line (e.g. across a doorway)"); } }, mon.analyzer.line ? "Redraw counting line" : "Draw a counting line"),
            mon.analyzer.line ? h("button", { class: "chip", onclick: () => { mon.analyzer.setLine(null); update(); } }, "Remove line") : "",
            h("button", { class: "chip", onclick: () => { mon.stop(); update(); pushToMap(); } }, "Stop")));
        requestAnimationFrame(draw);
      } else {
        const url = h("input", { type: "url", class: "pro-url", placeholder: "Feed link: video or snapshot image", value: cam.url ?? "" }) as HTMLInputElement;
        const file = h("input", { type: "file", accept: "video/*", hidden: true, onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void mon.start("file", f); } });
        const start = (kind: FeedKind, v: string | File) => void mon.start(kind, v);
        body.replaceChildren(
          s.error ? h("p", { class: "error" }, s.error) : "",
          h("div", { class: "pro-url-row" }, url, h("button", { class: "primary-btn", onclick: () => { const v = url.value.trim(); if (!/^https?:\/\//.test(v)) { app.toast("Paste the camera's http(s) video or snapshot link"); return; } start("link", v); } }, "Connect")),
          h("div", { class: "chips wrap" },
            "mediaDevices" in navigator ? h("button", { class: "chip", onclick: () => start("webcam", "") }, "Use this device's camera") : "",
            h("button", { class: "chip", onclick: () => file.click() }, "Try a video file"), file));
      }
    };

    overlay.addEventListener("click", (e) => {
      if (!drawing) return;
      const r = overlay.getBoundingClientRect();
      drawing.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
      if (drawing.length === 2) {
        mon.analyzer.setLine({ a: drawing[0], b: drawing[1] });
        drawing = null;
        update();
      }
    });
    mon.subscribe(() => { update(); pushToMap(); });
    update();
    return h("div", { class: "cam-card" }, h("div", { class: "cam-head" }, h("strong", {}, cam.label ?? "Camera"), status), body);
  };

  return {
    /** The section for a place's cameras (cards are reused so feeds keep running). */
    el(p: MyPlace): HTMLElement {
      if (place?.id !== p.id) this.stopAll();
      place = p;
      const cams = p.devices.filter((d) => d.type === "camera");
      if (!cams.length) {
        list.replaceChildren(h("p", { class: "muted small" }, "No cameras yet. Place them in My Places (Cameras & security), then connect their feeds here."));
      } else {
        list.replaceChildren(...cams.map((c) => {
          let cardEl = cards.get(c.id);
          if (!cardEl) cards.set(c.id, (cardEl = card(c)));
          return cardEl;
        }));
      }
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
