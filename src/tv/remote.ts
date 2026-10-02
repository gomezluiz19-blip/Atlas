// The phone remote for Atlas TV: what the TV is showing, the playlist, a
// search that flies the TV anywhere, lenses and the hologram for the place on
// screen, and the wind. A page of its own (no globe), so it opens instantly.
import "./remote.css";
import { cleanCode, listen, send, type Cmd, type State } from "./link";

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const root = document.getElementById("remote")!;

function pairScreen(note = "") {
  const input = $("input", { inputmode: "text", autocapitalize: "characters", maxlength: "6", placeholder: "ABC123", "aria-label": "Code on the TV" }) as HTMLInputElement;
  const go = $("button", { class: "r-primary" }, "Connect");
  go.addEventListener("click", () => { const c = cleanCode(input.value); if (c.length === 6) { location.hash = c; start(c); } });
  root.replaceChildren($("div", { class: "r-pair" },
    $("div", { class: "r-brand" }, "ATLAS ", $("span", {}, "REMOTE")),
    $("p", {}, "Enter the code shown on the TV (or scan its QR code)."), input, go, note ? $("p", { class: "r-note" }, note) : ""));
  input.focus();
}

function start(code: string) {
  const cmd = (c: Cmd) => { send(code, "cmd", c); if (navigator.vibrate) navigator.vibrate(12); };
  const title = $("strong", {}, "Connecting…"), sub = $("small", {}, `TV ${code}`);
  const btn = (label: string, c: Cmd, cls = "") => { const b = $("button", { class: `r-btn ${cls}` }, label); b.addEventListener("click", () => cmd(c)); return b; };
  const scenes = [["live", "🌍 Live Earth"], ["places", "🏔 Great places"], ["markets", "📈 Markets"], ["home", "🏠 Home"]] as const;
  const sceneBtns = scenes.map(([id, label]) => { const b = btn(label, { t: "scene", id }); b.dataset.id = id; return b; });
  const q = $("input", { type: "search", placeholder: "Fly the TV to… a place, an address", "aria-label": "Fly the TV to" }) as HTMLInputElement;
  const fly = () => { if (q.value.trim()) { cmd({ t: "fly", q: q.value.trim() }); q.blur(); } };
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") fly(); });
  const goBtn = $("button", { class: "r-primary" }, "Go"); goBtn.addEventListener("click", fly);
  const chip = (name: string) => { const b = $("button", { class: "r-chip" }, name); b.addEventListener("click", () => { q.value = name; fly(); }); return b; };
  root.replaceChildren(
    $("header", { class: "r-now" }, $("span", { class: "r-live" }), $("div", {}, $("small", {}, "On the TV"), title, sub)),
    $("section", {}, $("h2", {}, "Fly the TV anywhere"), $("div", { class: "r-search" }, q, goBtn),
      $("div", { class: "r-chips" }, ...["Mount Everest", "Grand Canyon", "Tokyo", "Iceland", "Great Barrier Reef", "New York"].map(chip))),
    $("section", {}, $("h2", {}, "See it differently"), $("div", { class: "r-grid" },
      btn("⛰ Cut open", { t: "lens", id: "slice" }), btn("🧊 3D block", { t: "lens", id: "block" }), btn("☀️ A day", { t: "lens", id: "day" }),
      btn("◎ Hologram", { t: "holo" }), btn("💨 Wind", { t: "wind" }))),
    $("section", {}, $("h2", {}, "Playlist"), $("div", { class: "r-grid" }, ...sceneBtns, btn("Next ▶", { t: "next" }, "r-next"))),
    $("footer", {}, btn("Exit TV mode", { t: "exit" }, "r-exit"), $("button", { class: "r-link", id: "r-change" }, "Different TV")));
  document.getElementById("r-change")!.addEventListener("click", () => { location.hash = ""; pairScreen(); });
  let heard = false;
  listen<State>(code, "state", (s) => {
    if (s.t !== "state") return;
    heard = true;
    title.textContent = s.title || "Atlas"; sub.textContent = s.sub ?? "";
    sceneBtns.forEach((b) => b.classList.toggle("on", b.dataset.id === s.scene));
  });
  cmd({ t: "hello" });
  setTimeout(() => { if (!heard) { title.textContent = "Waiting for the TV…"; sub.textContent = `Is TV mode showing code ${code}?`; cmd({ t: "hello" }); } }, 4000);
}

const initial = cleanCode(location.hash.slice(1));
if (initial.length === 6) start(initial); else pairScreen();
