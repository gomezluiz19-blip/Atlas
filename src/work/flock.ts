// Work › Flock: animals in your care, for farms, vets, rescue centres and
// adoption agencies. Records for each animal (weights, health, breeding,
// photos), what's due, paddocks drawn on the satellite map with how long the
// grass lasts, heat stress from the weather, and your animals wandering about
// their paddocks on the globe.
import { Cartesian3, CallbackProperty, CustomDataSource, HeightReference, VerticalOrigin } from "cesium";
import type { App } from "../app";
import { forecast } from "../data/openmeteo";
import { inlineChart, stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { drawOnMap } from "./draw";
import { areaM2, fmtArea, inside, type LonLat } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { ORGS, SPECIES, age, counts, dueDate, dueList, gain, grazing, speciesById, thi, type Animal, type Flock, type HealthEvent, type Org } from "./flockModel";
import { download, newId } from "./store";
import { CARE, breedsFor, findBreed } from "./breeds";
import { applyLog, parseLog, type LogEntry } from "./flockLog";

/** Logs one plain-words line ("Daisy had twins") to the records; null if it couldn't be read. */
export function logText(text: string): LogEntry | null {
  flock = load() ?? flock;
  if (!flock) return null;
  const e = parseLog(text, flock);
  if (!e) return null;
  applyLog(flock, e, newId);
  save();
  return e;
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void };

/** "Say or type what happened": the log bar at the top of Flock. */
function logBar(ctx: WorkCtx): HTMLElement {
  const input = h("input", { class: "pro-url", placeholder: "Say or type what happened: \u201cDaisy had twins\u201d", "aria-label": "Log what happened" }) as HTMLInputElement;
  const preview = h("p", { class: "muted small flock-log-preview" }, "Try: \u201cweighed 101 at 590 kg\u201d, \u201cwormed all the sheep\u201d, \u201cBramble is lame\u201d.");
  const commit = () => {
    const e = logText(input.value);
    if (!e) { preview.textContent = "Couldn't tell which animal or what happened. Use a name or tag number."; preview.classList.add("warn"); return; }
    ctx.app.toast(`Logged: ${e.summary}`, 4000);
    openFlock(ctx);
  };
  input.addEventListener("input", () => {
    preview.classList.remove("warn");
    const e = flock && input.value.trim() ? parseLog(input.value, flock) : null;
    preview.textContent = e ? `Will log: ${e.summary}` : input.value.trim() ? "…" : preview.textContent;
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
  const Speech = ((window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition);
  const mic: HTMLElement | "" = Speech ? h("button", { class: "pill-btn flock-mic", title: "Speak", "aria-label": "Speak", onclick: () => {
    const btn = mic as HTMLElement;
    const r = new Speech();
    r.lang = navigator.language || "en-GB";
    r.interimResults = false;
    btn.classList.add("on");
    preview.textContent = "Listening…";
    r.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.dispatchEvent(new Event("input")); };
    r.onerror = () => { preview.textContent = "Didn't catch that. Try again, or type it."; };
    r.onend = () => btn.classList.remove("on");
    r.start();
  } }, "🎙") : "";
  return h("div", { class: "flock-log" }, h("div", { class: "build-log-form" }, input, mic, h("button", { class: "pill-btn", onclick: commit }, "Log")), preview);
}

/** A text box that suggests the breeds of a species (any other text is fine too). */
function breedInput(species: () => string, value = "", onChange?: (v: string) => void): HTMLElement {
  const id = `breeds-${newId()}`;
  const list = h("datalist", { id });
  const fill = () => list.replaceChildren(...breedsFor(species()).map((b) => h("option", { value: b.name }, `${b.use} · ${b.origin}`)));
  fill();
  const input = h("input", { value, placeholder: "Breed (optional)", list: id, "aria-label": "Breed", onfocus: fill, onchange: (e: Event) => onChange?.((e.target as HTMLInputElement).value.trim()) });
  return h("span", { class: "breed-input" }, input, list);
}

const KEY = "atlas.work.flock.v1";
function load(): Flock | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && Array.isArray(v.animals) ? v : null;
  } catch {
    return null;
  }
}
let flock: Flock | null = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(flock));
  } catch {
    alert("Browser storage is full: remove some photos, or save your records as a file.");
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const label = (a: Animal) => a.name || a.tag || speciesById(a.species).label;

// ---- On the map: paddocks, and animals ambling about in them -------------------------------

let paddockLayer: WorkLayer | null = null;
let herd: CustomDataSource | null = null;
const emojiCache = new Map<string, string>();
function emojiImage(e: string): string {
  let url = emojiCache.get(e);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 72;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath();
    g.arc(36, 36, 30, 0, Math.PI * 2);
    g.fill();
    g.font = "40px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(e, 36, 39);
    url = c.toDataURL();
    emojiCache.set(e, url);
  }
  return url;
}

function randomInside(ring: LonLat[]): LonLat {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  for (let i = 0; i < 40; i++) {
    const p: LonLat = [w + Math.random() * (e - w), s + Math.random() * (n - s)];
    if (inside(ring, p)) return p;
  }
  return [(w + e) / 2, (s + n) / 2];
}

function drawFlock(app: App) {
  if (!flock) return;
  paddockLayer ??= new WorkLayer(app, "work:flock", "Paddocks", "#30d158");
  paddockLayer.set(flock.paddocks.map((p) => {
    const n = flock!.animals.filter((a) => a.paddock === p.id).length;
    return { id: p.id, kind: "area" as const, pts: p.pts, color: "#8bd346", fill: 0.12, label: `${p.name}${n ? ` · ${n}` : ""}` };
  }), `${flock.name} · paddocks`);
  if (!herd) {
    herd = new CustomDataSource("work-flock");
    void app.globe.viewer.dataSources.add(herd);
  }
  herd.entities.removeAll();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shown = flock.animals.filter((a) => a.paddock && !/sold|deceased|released|adopted|discharged/i.test(a.status)).slice(0, 250);
  for (const a of shown) {
    const pad = flock.paddocks.find((p) => p.id === a.paddock);
    if (!pad) continue;
    // Each animal strolls to a random spot, grazes a while, and strolls on.
    let at = randomInside(pad.pts), to = at, pauseUntil = 0, last = performance.now();
    const speed = (0.4 + Math.random() * 0.5) / 111_000; // degrees per second, about walking pace for a grazer
    const phase = Math.random() * 10;
    const pos = new CallbackProperty(() => {
      const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (!reduced) {
        if (now > pauseUntil) {
          const dx = to[0] - at[0], dy = to[1] - at[1], d = Math.hypot(dx, dy);
          if (d < speed * 2) { to = randomInside(pad.pts); pauseUntil = now + 2000 + Math.random() * 6000; }
          else at = [at[0] + (dx / d) * speed * dt * 8, at[1] + (dy / d) * speed * dt * 8];
        }
      }
      return Cartesian3.fromDegrees(at[0], at[1]);
    }, false);
    const sp = speciesById(a.species);
    herd.entities.add({
      name: label(a),
      position: pos as never,
      billboard: {
        image: emojiImage(sp.emoji), width: 30, height: 30, verticalOrigin: VerticalOrigin.BOTTOM, heightReference: HeightReference.CLAMP_TO_GROUND,
        // A little hop while walking.
        scale: new CallbackProperty(() => (reduced ? 1 : 1 + 0.06 * Math.sin(performance.now() / 180 + phase)), false) as never,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  app.canvas.put({ id: "work:herd", label: `${flock.name} · animals`, color: "#8bd346", scope: "world", pinned: true, show: (v) => { if (herd) herd.show = v; }, remove: () => herd?.entities.removeAll() }, true);
}

// ---- Screens ----------------------------------------------------------------------------------

/** A little parade of your animals across the top of the panel. */
function parade(): HTMLElement {
  const kinds = flock ? counts(flock.animals).map((c) => speciesById(c.species).emoji) : [];
  const line = (kinds.length ? kinds : ["🐄", "🐑", "🐕", "🐈", "🐔", "🐐"]).slice(0, 6);
  return h("div", { class: "flock-parade", "aria-hidden": "true" }, ...line.map((e, i) => h("span", { style: `--i:${i}` }, e)));
}

export function openFlock(ctx: WorkCtx) {
  // Pick up anything logged from the search box since this was last open.
  flock = load() ?? flock;
  if (!flock) return setup(ctx);
  const f = flock;
  drawFlock(ctx.app);
  const due = dueList(f.animals, today());
  const heat = h("div", {});
  const pts = f.paddocks.flatMap((p) => p.pts);
  const [lon, lat] = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [ctx.app.place?.lon, ctx.app.place?.lat];
  if (lon !== undefined && lat !== undefined && f.animals.length)
    forecast(lon, lat).then((w) => {
      const t = thi(w.current.temperature_2m, w.current.relative_humidity_2m);
      const hot = w.daily.temperature_2m_max.some((x) => x >= 30);
      heat.replaceChildren(t.level === "none" && !hot
        ? h("p", { class: "muted small" }, `Now ${w.current.temperature_2m.toFixed(0)} °C, humidity ${w.current.relative_humidity_2m}%: no heat stress (THI ${t.value.toFixed(0)}).`)
        : h("p", { class: "pro-warn" }, t.level === "none"
          ? `Hot days ahead (up to ${Math.max(...w.daily.temperature_2m_max).toFixed(0)} °C): plan shade and extra water.`
          : `Heat stress ${t.level} now (THI ${t.value.toFixed(0)}): shade, water and handle animals only in the cool of the day.`));
    }).catch(() => {});
  const q = h("input", { class: "pro-url", placeholder: "Find by name, tag or species", "aria-label": "Find an animal" }) as HTMLInputElement;
  const statusSel = h("select", { class: "flock-filter", "aria-label": "Status" }, h("option", { value: "" }, "All"), ...ORGS[f.org].statuses.map((s) => h("option", { value: s }, s))) as HTMLSelectElement;
  const list = h("div", { class: "list" });
  const renderList = () => {
    const needle = q.value.trim().toLowerCase();
    const rows = f.animals.filter((a) => (!statusSel.value || a.status === statusSel.value) && (!needle || `${a.name} ${a.tag ?? ""} ${speciesById(a.species).label}`.toLowerCase().includes(needle)));
    list.replaceChildren(...rows.slice(0, 80).map((a) =>
      h("button", { class: "list-row", onclick: () => openAnimal(ctx, a.id) },
        a.photo ? h("img", { class: "flock-avatar", src: a.photo, alt: "" }) : h("span", { class: "flock-avatar emoji" }, speciesById(a.species).emoji),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, label(a), a.tag && a.name ? h("span", { class: "muted small" }, ` #${a.tag}`) : ""),
          h("span", { class: "list-sub" }, [a.status, a.sex === "F" ? "♀" : a.sex === "M" ? "♂" : "", age(a.born, today()), f.paddocks.find((p) => p.id === a.paddock)?.name].filter(Boolean).join(" · "))),
        h("span", { class: "chev", html: "&rsaquo;" }))),
      rows.length > 80 ? h("p", { class: "muted small" }, `…and ${rows.length - 80} more. Search to narrow down.`) : "");
  };
  q.addEventListener("input", renderList);
  statusSel.addEventListener("change", renderList);
  renderList();

  ctx.show(f.name, ctx.home,
    parade(),
    f.animals.length ? logBar(ctx) : "",
    h("div", { class: "flock-counts" }, ...counts(f.animals).map((c) => h("span", { class: "chip" }, `${speciesById(c.species).emoji} ${c.n}`)),
      h("span", { class: "muted small" }, `${f.animals.length} animal${f.animals.length === 1 ? "" : "s"} · ${ORGS[f.org].label}`)),
    heat,
    due.length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Due in the next 30 days"),
      h("div", { class: "list" }, ...due.slice(0, 10).map((d) =>
        h("button", { class: "list-row", onclick: () => openAnimal(ctx, d.animal.id) },
          h("span", { class: "flock-due" + (d.overdue ? " late" : "") }, fmtDate(d.date)),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, d.what), h("span", { class: "list-sub" }, `${speciesById(d.animal.species).emoji} ${label(d.animal)}${d.overdue ? " · overdue" : ""}`)),
          h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: () => addAnimals(ctx, 1) }, "+ Add an animal"),
      f.org === "farm" ? h("button", { class: "chip", onclick: () => addAnimals(ctx, 10) }, "+ Add a group") : "",
      h("button", { class: "chip", onclick: () => void addPaddock(ctx) }, f.org === "farm" ? "+ Draw a paddock" : "+ Draw an enclosure or yard")),
    f.paddocks.length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, f.org === "farm" ? "Paddocks" : "Enclosures"),
      h("div", { class: "list" }, ...f.paddocks.map((p) => {
        const ha = areaM2(p.pts) / 1e4, here = f.animals.filter((a) => a.paddock === p.id);
        const g = grazing(ha, p.forage ?? 2000, here);
        return h("button", { class: "list-row", onclick: () => openPaddock(ctx, p.id) },
          h("span", { class: "dot big", style: "background:#8bd346" }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name),
            h("span", { class: "list-sub" }, `${fmtArea(ha * 1e4)} · ${here.length} animal${here.length === 1 ? "" : "s"}${g.au > 0 ? ` · ${g.auPerHa.toFixed(1)} AU/ha · grass for ~${Number.isFinite(g.days) ? Math.round(g.days) : "∞"} days` : ""}`)),
          h("span", { class: "chev", html: "&rsaquo;" }));
      }))) : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Animals"),
      h("div", { class: "pro-url-row" }, q, statusSel), list),
    h("div", { class: "pro-actions" },
      f.org === "adoption" || f.org === "rescue" ? h("button", { class: "pill-btn", onclick: listing }, f.org === "adoption" ? "Share an adoption listing" : "Share a care update") : "",
      h("button", { class: "link-btn", onclick: exportCsv }, "Export (CSV)"),
      h("button", { class: "link-btn", onclick: () => download(`${f.name}.atlas-flock.json`, JSON.stringify(f)) }, "Save as a file"),
      h("button", { class: "link-btn", onclick: () => setup(ctx) }, "Settings")),
  );
}

function setup(ctx: WorkCtx) {
  const name = h("input", { class: "mp-name", value: flock?.name ?? "", placeholder: "Name (e.g. Hilltop Farm)", "aria-label": "Name" }) as HTMLInputElement;
  const fileIn = h("input", { type: "file", accept: ".json", hidden: true, onchange: async () => {
    try {
      const v = JSON.parse(await fileIn.files![0].text());
      if (!v || !Array.isArray(v.animals)) throw new Error();
      flock = v;
      save();
      openFlock(ctx);
    } catch {
      ctx.app.toast("That file isn't an Atlas Flock file.", 5000);
    }
  } }) as HTMLInputElement;
  ctx.show("Flock", ctx.home,
    parade(),
    h("p", { class: "mp-intro" }, "Keep track of the animals in your care: who they are, their health and weights, what's due, and where they graze."),
    name,
    h("div", { class: "work-types" }, ...(Object.keys(ORGS) as Org[]).map((o) =>
      h("button", { class: "work-type" + (flock?.org === o ? " on" : ""), style: "--c:#8bd346", onclick: () => {
        if (flock) flock.org = o;
        else flock = { org: o, name: "", animals: [], paddocks: [] };
        flock.name = name.value.trim() || flock.name || ORGS[o].label;
        save();
        openFlock(ctx);
      } }, h("strong", {}, ORGS[o].label), h("span", {}, ORGS[o].about)))),
    h("button", { class: "link-btn", onclick: () => fileIn.click() }, "Open a saved file…"), fileIn,
  );
}

function addAnimals(ctx: WorkCtx, n: number) {
  const f = flock!;
  const sp = h("select", {}, ...SPECIES.map((s) => h("option", { value: s.id }, `${s.emoji} ${s.label}`))) as HTMLSelectElement;
  if (f.animals.length) sp.value = counts(f.animals)[0].species;
  const name = h("input", { placeholder: n > 1 ? "Name prefix (optional)" : "Name" }) as HTMLInputElement;
  const tag = h("input", { placeholder: n > 1 ? "First tag number, e.g. 101" : "Tag or ID (optional)" }) as HTMLInputElement;
  const breedBox = breedInput(() => sp.value);
  const breed = breedBox.querySelector("input") as HTMLInputElement;
  const count = h("input", { type: "number", min: 1, max: 500, value: n }) as HTMLInputElement;
  const sex = h("select", {}, h("option", { value: "" }, "Unknown"), h("option", { value: "F" }, "Female"), h("option", { value: "M" }, "Male")) as HTMLSelectElement;
  const born = h("input", { type: "date", max: today() }) as HTMLInputElement;
  const status = h("select", {}, ...ORGS[f.org].statuses.map((s) => h("option", { value: s }, s))) as HTMLSelectElement;
  const pad = h("select", {}, h("option", { value: "" }, "None"), ...f.paddocks.map((p) => h("option", { value: p.id }, p.name))) as HTMLSelectElement;
  const field = (l: string, el: HTMLElement) => h("label", { class: "mp-field" }, h("span", {}, l), el);
  ctx.show(n > 1 ? "Add a group" : "Add an animal", () => openFlock(ctx),
    field("Species", sp), field("Breed", breedBox), n > 1 ? field("How many", count) : "", field(n > 1 ? "Name prefix" : "Name", name), field("Tag", tag), field("Sex", sex), field("Born (or best guess)", born), field("Status", status),
    f.paddocks.length ? field(f.org === "farm" ? "Paddock" : "Enclosure", pad) : "",
    h("div", { class: "pro-actions" }, h("button", { class: "primary-btn", onclick: () => {
      const k = n > 1 ? Math.max(1, Math.min(500, Number(count.value) || 1)) : 1;
      const start = parseInt(tag.value, 10);
      for (let i = 0; i < k; i++)
        f.animals.push({
          id: newId(), species: sp.value, name: k > 1 ? (name.value ? `${name.value} ${i + 1}` : "") : name.value.trim(),
          tag: k > 1 && Number.isFinite(start) ? String(start + i) : tag.value.trim() || undefined,
          breed: breed.value.trim() || undefined,
          sex: (sex.value || undefined) as Animal["sex"], born: born.value || undefined, status: status.value, paddock: pad.value || undefined, weights: [], health: [],
        });
      save();
      openFlock(ctx);
    } }, n > 1 ? "Add group" : "Add")),
  );
}

async function addPaddock(ctx: WorkCtx) {
  ctx.hide();
  const pts = await drawOnMap(ctx.app, "area", "#8bd346", "Tap around the fence line");
  ctx.unhide();
  if (!pts) return openFlock(ctx);
  const p = { id: newId(), name: `${flock!.org === "farm" ? "Paddock" : "Enclosure"} ${flock!.paddocks.length + 1}`, pts, forage: 2000 };
  flock!.paddocks.push(p);
  save();
  openPaddock(ctx, p.id);
}

function openPaddock(ctx: WorkCtx, id: string) {
  const f = flock!, p = f.paddocks.find((x) => x.id === id);
  if (!p) return openFlock(ctx);
  drawFlock(ctx.app);
  const ha = areaM2(p.pts) / 1e4, here = f.animals.filter((a) => a.paddock === p.id);
  const g = grazing(ha, p.forage ?? 2000, here);
  const [lon, lat] = [p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length, p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length];
  const move = h("select", { "aria-label": "Move animals here" }, h("option", { value: "" }, "Move animals here…"),
    ...counts(f.animals.filter((a) => a.paddock !== p.id)).map((c) => h("option", { value: c.species }, `All ${speciesById(c.species).label.toLowerCase()} (${c.n})`))) as HTMLSelectElement;
  move.addEventListener("change", () => {
    for (const a of f.animals) if (a.species === move.value) a.paddock = p.id;
    save();
    openPaddock(ctx, id);
  });
  ctx.show(p.name, () => openFlock(ctx),
    h("input", { class: "mp-name", value: p.name, "aria-label": "Name", onchange: (e: Event) => { p.name = (e.target as HTMLInputElement).value || p.name; save(); drawFlock(ctx.app); } }),
    f.org === "farm" ? h("label", { class: "mp-field" }, h("span", {}, "Grass on offer (kg dry matter/ha)"),
      h("input", { type: "number", min: 0, step: 100, value: p.forage ?? 2000, onchange: (e: Event) => { p.forage = Number((e.target as HTMLInputElement).value) || 0; save(); openPaddock(ctx, id); } })) : "",
    stats(
      ["Area", `${fmtArea(ha * 1e4)} (${ha.toFixed(2)} ha)`],
      ["Animals", `${here.length}`],
      g.au > 0 ? ["Stocking", `${g.au.toFixed(1)} animal units · ${g.auPerHa.toFixed(2)} AU/ha`, "An animal unit is a 450 kg cow"] : null,
      f.org === "farm" && g.intake > 0 ? ["Grass lasts", `about ${Number.isFinite(g.days) ? Math.round(g.days) : "∞"} days`, "Half the grass on offer, at 2.5% of body weight eaten a day; regrowth not counted"] : null,
    ),
    move,
    h("p", { class: "muted small" }, f.org === "farm" ? "Measure grass with a plate meter or by eye: a short sward is about 1,500 kg DM/ha, a thick one 3,000 or more." : ""),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => void flyToPlace(ctx.app.globe, { name: p.name, lon, lat, radius: Math.max(80, Math.sqrt(ha * 1e4)) }) }, "Show on map"),
      h("button", { class: "link-btn danger", onclick: () => { f.paddocks = f.paddocks.filter((x) => x !== p); for (const a of here) a.paddock = undefined; save(); openFlock(ctx); } }, "Delete")),
  );
}

function openAnimal(ctx: WorkCtx, id: string) {
  const f = flock!, a = f.animals.find((x) => x.id === id);
  if (!a) return openFlock(ctx);
  const sp = speciesById(a.species);
  const again = () => openAnimal(ctx, id);
  const set = (patch: Partial<Animal>) => { Object.assign(a, patch); save(); };
  const w = [...a.weights].sort((x, y) => x.date.localeCompare(y.date));
  const g = gain(a.weights);
  const breedCard = findBreed(a.species, a.breed);
  const matureKg = breedCard?.kg ?? sp.kg;
  const kg = h("input", { type: "number", min: 0, step: 0.1, placeholder: "kg", class: "build-crew" }) as HTMLInputElement;
  const kgDate = h("input", { type: "date", value: today(), class: "work-date" }) as HTMLInputElement;
  const ev = { kind: h("select", {}, h("option", { value: "vaccination" }, "Vaccination"), h("option", { value: "treatment" }, "Treatment"), h("option", { value: "checkup" }, "Check-up"), h("option", { value: "note" }, "Note")) as HTMLSelectElement,
    text: h("input", { class: "pro-url", placeholder: "What (e.g. Clostridial booster, wormer, hoof trim)" }) as HTMLInputElement,
    due: h("select", {}, h("option", { value: "" }, "No follow-up"), ...[["7", "In a week"], ["14", "In 2 weeks"], ["28", "In 4 weeks"], ["42", "In 6 weeks"], ["90", "In 3 months"], ["182", "In 6 months"], ["365", "In a year"]].map(([v, l]) => h("option", { value: v }, l))) as HTMLSelectElement };
  const photoIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
    const file = photoIn.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"), k = Math.min(1, 360 / Math.max(img.width, img.height));
      c.width = img.width * k; c.height = img.height * k;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      set({ photo: c.toDataURL("image/jpeg", 0.72) });
      again();
    };
    img.src = URL.createObjectURL(file);
  } }) as HTMLInputElement;
  const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  ctx.show(label(a), () => openFlock(ctx),
    h("div", { class: "flock-hero" },
      h("button", { class: "flock-photo", title: "Add a photo", onclick: () => photoIn.click() }, a.photo ? h("img", { src: a.photo, alt: label(a) }) : h("span", { class: "flock-bob" }, sp.emoji)), photoIn,
      h("div", {},
        h("input", { class: "mp-name", value: a.name, placeholder: "Name", "aria-label": "Name", onchange: (e: Event) => set({ name: (e.target as HTMLInputElement).value }) }),
        h("span", { class: "muted small" }, [a.breed || sp.label, a.sex === "F" ? "Female" : a.sex === "M" ? "Male" : "", age(a.born, today())].filter(Boolean).join(" · ")))),
    breedCard ? h("p", { class: "breed-card small" }, h("strong", {}, breedCard.name), ` · ${breedCard.use} · from ${breedCard.origin} · adult females about ${breedCard.kg} kg`, breedCard.note ? `. ${breedCard.note}` : "") : "",
    h("div", { class: "build-fields" },
      h("label", { class: "mp-field" }, h("span", {}, "Status"), h("select", { onchange: (e: Event) => { set({ status: (e.target as HTMLSelectElement).value }); drawFlock(ctx.app); } }, ...ORGS[f.org].statuses.map((s) => h("option", { value: s, selected: s === a.status }, s)))),
      h("label", { class: "mp-field" }, h("span", {}, "Tag"), h("input", { value: a.tag ?? "", onchange: (e: Event) => set({ tag: (e.target as HTMLInputElement).value || undefined }) })),
      h("label", { class: "mp-field" }, h("span", {}, "Breed"), breedInput(() => a.species, a.breed ?? "", (v) => { set({ breed: v || undefined }); again(); })),
      h("label", { class: "mp-field" }, h("span", {}, "Born"), h("input", { type: "date", value: a.born ?? "", max: today(), onchange: (e: Event) => set({ born: (e.target as HTMLInputElement).value || undefined }) }))),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Weight"),
      w.length ? stats(["Latest", `${w[w.length - 1].kg} kg (${fmtDate(w[w.length - 1].date)})`], ["Of a typical adult", `${Math.round((w[w.length - 1].kg / matureKg) * 100)}% (${matureKg} kg${breedCard ? `, ${breedCard.name}` : ""})`], g.last !== undefined ? ["Daily gain, last period", `${(g.last * 1000).toFixed(0)} g/day`] : null, g.overall !== undefined ? ["Daily gain, overall", `${(g.overall * 1000).toFixed(0)} g/day`] : null) : "",
      w.length > 1 ? inlineChart({ x: w.map((x) => Date.parse(x.date)), y: w.map((x) => x.kg) }, { xLabel: "Date", yLabel: "kg", xFormat: (v) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }), yFormat: (v) => `${v.toFixed(0)} kg` }, 130) : "",
      h("div", { class: "build-log-form" }, kgDate, kg, h("button", { class: "pill-btn", onclick: () => { const v = Number(kg.value); if (v > 0) { a.weights.push({ date: kgDate.value || today(), kg: v }); save(); again(); } } }, "Add weight"))),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Health"),
      h("div", { class: "build-log-form" }, ev.kind, ev.text, ev.due, h("button", { class: "pill-btn", onclick: () => {
        const e: HealthEvent = { id: newId(), date: today(), kind: ev.kind.value as HealthEvent["kind"], text: ev.text.value.trim(), due: ev.due.value ? addDays(Number(ev.due.value)) : undefined };
        if (!e.text) return;
        a.health.unshift(e);
        save();
        again();
      } }, "Add")),
      (CARE[a.species] ?? []).length ? h("div", { class: "care-chips" }, h("span", { class: "muted small" }, "Routine care, one tap (next due in brackets):"),
        ...(CARE[a.species] ?? []).map((c) => h("button", { class: "chip", title: "Typical interval; follow your vet's advice", onclick: () => {
          a.health.unshift({ id: newId(), date: today(), kind: c.kind, text: c.text, due: addDays(c.every) });
          save();
          again();
        } }, `${c.text} (${c.every >= 365 ? `${Math.round(c.every / 365)} yr` : c.every >= 28 ? `${Math.round(c.every / 30)} mo` : `${c.every} d`})`))) : "",
      ...a.health.map((e) => h("div", { class: "work-check" + (e.done ? " done" : "") },
        e.due ? h("input", { type: "checkbox", checked: !!e.done, title: "Follow-up done", onchange: () => { e.done = !e.done; save(); again(); } }) : h("span", { class: "flock-kind" }, "•"),
        h("span", {}, `${e.text}${e.due ? ` · next due ${fmtDate(e.due)}` : ""}`), h("span", { class: "muted small" }, `${e.kind} · ${fmtDate(e.date)}`)))),
    a.sex !== "M" && sp.gestation ? h("section", { class: "group" }, h("h2", { class: "group-title" }, sp.id === "chicken" || sp.id === "duck" ? "Eggs" : "Breeding"),
      h("label", { class: "mp-field" }, h("span", {}, sp.id === "chicken" || sp.id === "duck" ? "Set to incubate on" : "Bred on"),
        h("input", { type: "date", value: a.bred ?? "", onchange: (e: Event) => { set({ bred: (e.target as HTMLInputElement).value || undefined }); again(); } })),
      a.bred ? h("p", {}, h("strong", {}, `Due about ${fmtDate(dueDate(a.species, a.bred))}`), h("span", { class: "muted small" }, ` (${sp.gestation} days, typical for ${sp.label.toLowerCase()})`)) : "") : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, f.org === "adoption" ? "About (for the listing)" : "Notes"),
      h("textarea", { class: "mp-notes", rows: 3, placeholder: f.org === "adoption" ? "Personality, good with kids or other pets, needs…" : "Temperament, markings, owner…", onchange: (e: Event) => set({ notes: (e.target as HTMLTextAreaElement).value }) }, a.notes ?? "")),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${label(a)}'s record?`)) { f.animals = f.animals.filter((x) => x !== a); save(); openFlock(ctx); } } }, "Remove record")),
  );
}

function exportCsv() {
  const f = flock!;
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["name", "tag", "species", "breed", "sex", "born", "status", "paddock", "latest_kg", "bred", "due", "notes"],
    ...f.animals.map((a) => {
      const w = [...a.weights].sort((x, y) => x.date.localeCompare(y.date)).pop();
      return [a.name, a.tag, speciesById(a.species).label, a.breed, a.sex, a.born, a.status, f.paddocks.find((p) => p.id === a.paddock)?.name, w?.kg, a.bred, a.bred ? dueDate(a.species, a.bred) : "", a.notes];
    })];
  download(`${f.name}.csv`, rows.map((r) => r.map(q).join(",")).join("\n"), "text/csv");
}

/** A printable page of animals looking for homes (or a rescue's update). */
function listing() {
  const f = flock!;
  const pick = f.animals.filter((a) => (f.org === "adoption" ? a.status === "Available" : a.status !== "Released"));
  download(`${f.name} ${f.org === "adoption" ? "adoption listing" : "update"}.html`, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(f.name)}</title>
<style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:24px auto;max-width:960px;padding:0 16px;color:#1d1d1f}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.c{border-radius:16px;background:#f5f5f7;overflow:hidden}.p{aspect-ratio:1;background:#e8e8ed;display:grid;place-items:center;font-size:72px}.p img{width:100%;height:100%;object-fit:cover}.t{padding:10px 14px 14px}.m{color:#6e6e73;font-size:13px}</style>
<h1>${esc(f.name)}</h1><p class="m">${f.org === "adoption" ? `${pick.length} animals looking for a home` : `${pick.length} animals in our care`} · ${fmtDate(today())}</p>
<div class="g">${pick.map((a) => `<div class="c"><div class="p">${a.photo ? `<img src="${a.photo}" alt="">` : speciesById(a.species).emoji}</div><div class="t"><b>${esc(label(a))}</b><div class="m">${esc([speciesById(a.species).label, a.sex === "F" ? "Female" : a.sex === "M" ? "Male" : "", age(a.born, today())].filter(Boolean).join(" · "))}</div><p>${esc(a.notes ?? "")}</p></div></div>`).join("")}</div>`, "text/html");
}
