// Work › Teach › Field trips: from school to the destination and back, with
// the day's timetable, adults and buses needed, cost per student, the weather,
// the nearest hospital, a checklist and a permission slip to print.
import type { App } from "../app";
import { forecast } from "../data/openmeteo";
import { elementPoint, overpass } from "../data/overpass";
import { stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace, geocode } from "../ui/search";
import { fmtDist, metres } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { CHECKLIST, GRADES, tripNumbers, type FieldTrip, type Stop } from "./tripModel";
import { ListStore, download, newId } from "./store";

const store = new ListStore<FieldTrip>("atlas.work.trips.v1");
let layer: WorkLayer | null = null;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDay = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

function draw(app: App, t: FieldTrip) {
  layer ??= new WorkLayer(app, "work:trip", "Field trip", "#ff9f0a");
  const pts = [t.school, t.dest].filter(Boolean) as Stop[];
  layer.set([
    ...(pts.length === 2 ? [{ id: "route", kind: "line" as const, pts: pts.map((p) => [p.lon, p.lat] as [number, number]), color: "#ff9f0a", dashed: true }] : []),
    ...pts.map((p, i) => ({ id: `p${i}`, kind: "point" as const, pts: [[p.lon, p.lat] as [number, number]], color: i ? "#ff375f" : "#0a84ff", label: `${i ? "🎒" : "🏫"} ${p.name}` })),
  ], `Field trip · ${t.title}`);
}

export function openTrips(ctx: WorkCtx, back: () => void) {
  ctx.show("Field trips", back,
    h("p", { class: "mp-intro" }, "Plan a class trip: the route and timetable, adults and buses, the cost per student, the weather, the nearest hospital, and a permission slip."),
    h("div", { class: "chips wrap" }, h("button", { class: "chip", onclick: () => {
      const d = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      const t: FieldTrip = { id: newId(), title: "Class field trip", school: null, dest: null, date: d, depart: "08:30", hours: 3, students: 28, grade: "35", ratio: 8, seats: 50, busPerKm: 3, fee: 0, notes: "", checklist: CHECKLIST.map((text) => ({ text, done: false })) };
      store.save(t);
      openTrip(ctx, t.id, back);
    } }, "+ New field trip")),
    store.all().length ? h("div", { class: "list" }, ...store.all().map((t) =>
      h("button", { class: "list-row", onclick: () => openTrip(ctx, t.id, back) },
        h("span", { class: "work-badge", style: "background:#ff9f0a" }, "🎒"),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, t.title), h("span", { class: "list-sub" }, `${t.dest?.name ?? "No destination yet"} · ${fmtDay(t.date)}`)),
        h("span", { class: "chev", html: "&rsaquo;" })))) : "",
  );
}

function openTrip(ctx: WorkCtx, id: string, back: () => void) {
  const t = store.get(id);
  if (!t) return openTrips(ctx, back);
  const { app } = ctx;
  const save = () => store.save(t);
  const again = () => openTrip(ctx, id, back);
  draw(app, t);
  const n = tripNumbers(t);

  const placeField = (which: "school" | "dest", label: string) => {
    const input = h("input", { value: t[which]?.name ?? "", placeholder: which === "school" ? "Your school's name or address" : "Museum, park, farm, city…" }) as HTMLInputElement;
    const find = async () => {
      if (!input.value.trim()) return;
      const [r] = await geocode(input.value, t.school && which === "dest" ? { lat: t.school.lat, lon: t.school.lon } : null).catch(() => []);
      if (!r) { app.toast("Couldn't find that. Try adding the town, or tap it on the map.", 5000); return; }
      t[which] = { name: input.value.trim().split(",")[0], lon: r.lon, lat: r.lat };
      save();
      again();
      void flyToPlace(app.globe, { name: r.name, lon: r.lon, lat: r.lat, radius: 1500 });
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") void find(); });
    return h("div", { class: "mp-field" }, h("span", {}, label),
      h("div", { class: "pro-url-row" }, input,
        h("button", { class: "pill-btn", onclick: () => void find() }, "Find"),
        h("button", { class: "pill-btn", title: "Tap it on the map", onclick: () => {
          ctx.hide();
          app.pickOnce(`Tap the ${which === "school" ? "school" : "destination"}`, (p) => { ctx.unhide(); t[which] = { name: input.value.trim() || (which === "school" ? "School" : "Destination"), lon: p.lon, lat: p.lat }; save(); again(); }, () => ctx.unhide());
        } }, "Tap")));
  };
  const num = (label: string, key: "students" | "hours" | "seats" | "busPerKm" | "fee" | "ratio", step = 1) =>
    h("label", { class: "mp-field" }, h("span", {}, label), h("input", { type: "number", min: 0, step, value: t[key], onchange: (e: Event) => { t[key] = Number((e.target as HTMLInputElement).value) || 0; save(); again(); } }));

  const extra = h("div", { class: "work-analysis" });
  if (t.dest) {
    const days = Math.round((Date.parse(t.date) - Date.now()) / 86_400_000);
    const weather = h("p", { class: "muted small" }, days > 6 ? `The forecast opens about a week before (${days} days to go).` : "Checking the forecast…");
    const hospital = h("p", { class: "muted small" }, "Looking for the nearest hospital…");
    extra.append(weather, hospital);
    if (days <= 6 && days >= -1)
      forecast(t.dest.lon, t.dest.lat).then((f) => {
        const i = f.daily.time.indexOf(t.date);
        if (i < 0) return void (weather.textContent = "No forecast for that day yet.");
        const rain = f.daily.precipitation_probability_max[i] ?? 0;
        weather.replaceChildren(h("strong", {}, `${fmtDay(t.date)}: ${Math.round(f.daily.temperature_2m_min[i])}–${Math.round(f.daily.temperature_2m_max[i])} °C, ${rain}% chance of rain. `),
          rain >= 50 ? "Pack rain gear and plan an indoor option." : f.daily.temperature_2m_max[i] >= 30 ? "Hot: water bottles, hats and shade breaks." : f.daily.temperature_2m_max[i] <= 5 ? "Cold: warm layers, hats and gloves." : "Looks fine for being outside.",
          ` Sunset ${f.daily.sunset[i].slice(11)}.`);
      }).catch(() => (weather.textContent = "Couldn't load the forecast."));
    const d = t.dest;
    overpass(`[out:json][timeout:20];nwr(around:25000,${d.lat},${d.lon})[amenity=hospital];out center 30;`).then((els) => {
      const near = els.map((e) => ({ e, p: elementPoint(e) })).filter((x) => x.p).map((x) => ({ name: x.e.tags?.name ?? "Hospital", emergency: x.e.tags?.emergency === "yes", m: metres([d.lon, d.lat], x.p!) })).sort((a, b) => a.m - b.m);
      const er = near.find((x) => x.emergency) ?? near[0];
      hospital.textContent = er ? `Nearest hospital${er.emergency ? " with an emergency department" : ""}: ${er.name}, ${fmtDist(er.m)} from the destination (straight line). Confirm before the trip.` : "No hospital mapped within 25 km of the destination. Find the nearest emergency care before the trip.";
    }).catch(() => (hospital.textContent = "Couldn't look up hospitals (OpenStreetMap). Find the nearest emergency care before the trip."));
  }

  const slip = () => download(`${t.title} permission slip.html`, `<!doctype html><meta charset="utf-8"><title>Permission slip</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111}h1{font:700 26px -apple-system,system-ui,sans-serif}.box{border:1px solid #999;border-radius:8px;padding:12px 16px}.line{border-bottom:1px solid #333;height:28px;margin:6px 0 14px}.cut{border-top:2px dashed #999;margin:28px 0;text-align:center;color:#999;font-size:12px}@media print{button{display:none}}</style>
<button onclick="print()">Print</button>
<h1>${esc(t.title)}</h1>
<div class="box"><p><b>Where:</b> ${esc(t.dest?.name ?? "")}<br><b>When:</b> ${fmtDay(t.date)}, leaving school at ${n.times.leave} and back by about ${n.times.back}<br><b>Travel:</b> by coach, about ${Math.round(n.km)} km each way<br><b>Cost:</b> ${n.perStudent > 0 ? `$${n.perStudent.toFixed(2)} per student` : "free"}</p>
${t.notes ? `<p>${esc(t.notes)}</p>` : ""}<p>Please bring: packed lunch, water, weather-appropriate clothes and comfortable shoes.</p></div>
<div class="cut">✂ return this part to school</div>
<p>I give permission for my child to go on the trip to <b>${esc(t.dest?.name ?? "")}</b> on <b>${fmtDay(t.date)}</b>.</p>
<p>Student's name</p><div class="line"></div><p>Allergies, medicines or medical needs</p><div class="line"></div><div class="line"></div>
<p>Emergency contact name and phone</p><div class="line"></div><p>Parent or guardian signature and date</p><div class="line"></div>`, "text/html");

  ctx.show("Field trip", () => openTrips(ctx, back),
    h("input", { class: "mp-name", value: t.title, "aria-label": "Trip name", onchange: (e: Event) => { t.title = (e.target as HTMLInputElement).value || t.title; save(); } }),
    placeField("school", "From (school)"), placeField("dest", "To (destination)"),
    h("div", { class: "build-fields" },
      h("label", { class: "mp-field" }, h("span", {}, "Date"), h("input", { type: "date", value: t.date, onchange: (e: Event) => { t.date = (e.target as HTMLInputElement).value || t.date; save(); again(); } })),
      h("label", { class: "mp-field" }, h("span", {}, "Leave school"), h("input", { type: "time", value: t.depart, onchange: (e: Event) => { t.depart = (e.target as HTMLInputElement).value || t.depart; save(); again(); } })),
      num("Hours there", "hours", 0.5)),
    h("div", { class: "build-fields" },
      num("Students", "students"),
      h("label", { class: "mp-field" }, h("span", {}, "Grade"), h("select", { onchange: (e: Event) => { t.grade = (e.target as HTMLSelectElement).value; t.ratio = GRADES.find((g) => g.id === t.grade)!.ratio; save(); again(); } }, ...GRADES.map((g) => h("option", { value: g.id, selected: g.id === t.grade }, g.label)))),
      num("Students per adult", "ratio")),
    h("div", { class: "build-fields" }, num("Seats per bus", "seats"), num("Bus $/km", "busPerKm", 0.1), num("Entry $/student", "fee", 0.5)),
    t.school && t.dest ? stats(
      ["Distance", `about ${Math.round(n.km)} km by road each way`, "1.3 × the straight line; check the real route"],
      ["Bus ride", `about ${Math.floor(n.busMin / 60) ? `${Math.floor(n.busMin / 60)} h ` : ""}${n.busMin % 60} min`],
      ["Timetable", `leave ${n.times.leave} · arrive ${n.times.arrive} · leave ${n.times.leaveVenue} · back ${n.times.back}`],
      ["Adults", `${n.adults} (1 per ${t.ratio} students)`, "Typical guidance; follow your school's and the venue's rules"],
      ["Buses", `${n.buses} × ${t.seats} seats`],
      ["Cost", `$${Math.round(n.total).toLocaleString()} · $${n.perStudent.toFixed(2)} per student`],
    ) : h("p", { class: "muted small" }, "Add the school and the destination to see the timetable and costs."),
    n.long ? h("p", { class: "pro-warn" }, "That's a long day (over 10 hours). Consider an earlier start, a closer destination or less time there.") : "",
    extra,
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Checklist"),
      h("div", { class: "work-checklist" }, ...t.checklist.map((c) => h("label", { class: "work-check" + (c.done ? " done" : "") },
        h("input", { type: "checkbox", checked: c.done, onchange: () => { c.done = !c.done; save(); again(); } }), h("span", {}, c.text))))),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Notes for parents"),
      h("textarea", { class: "mp-notes", rows: 3, placeholder: "What the trip is for, what to bring…", onchange: (e: Event) => { t.notes = (e.target as HTMLTextAreaElement).value; save(); } }, t.notes)),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", disabled: !t.dest, onclick: slip }, "Permission slip"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${t.title}"?`)) { store.remove(t.id); layer?.clear(); openTrips(ctx, back); } } }, "Delete trip")),
  );
}
