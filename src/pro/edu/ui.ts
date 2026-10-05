// Education Pro's screens. The district on the globe: every campus a floor-by-
// floor model coloured by today's state (a red floor has a class without
// cover; amber, a repair), alerts pulsing; the bus routes and where students
// live, and a "morning arrival" that streams buses and walkers into each
// school. Each school: Today (flags, cover), Rooms, Staff, Safety, Students,
// Learning (lessons and quizzes from Teach, field trips to approve), a report.
import type { App } from "../../app";
import { Massing, type MassBuilding } from "../../enterprise/massing";
import { addDays, isoDay } from "../../enterprise/seed";
import { FlowOverlay, type FlowLine } from "../../globe/flow";
import { h } from "../../ui/dom";
import { loadJson, saveJson } from "../../util/storage";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { WorkLayer, type WorkFeature } from "../../work/layer";
import { kpis, list, row, title } from "../kit/ui";
import { teamCard, teamSync } from "../kit/team";
import { downloadCsv, printReport } from "../kit/report";
import { demoDistrict } from "./demo";
import {
  avg, catchmentStats, certsDue, coverPlan, daysBetween, DRILL_LABEL, drillStatus, districtKpis, floorState, learning, outToday, ROOM_COLOR, ROOM_LABEL, roomStates, schoolFlags, staffOf,
  type District, type DrillKind, type Incident, type Role, type School, type Staff,
} from "./model";

const KEY = "atlas.pro.edu.v1";
const load = () => loadJson<District | null>(KEY, null, (v) => !!v && Array.isArray((v as District).schools));
const save = (d: District) => saveJson(KEY, d);
const LEVEL = { elementary: "Elementary", middle: "Middle school", high: "High school" } as const;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const ROLE_ORDER: Role[] = ["principal", "assistant principal", "teacher", "aide", "counselor", "nurse", "office", "security", "custodian", "substitute"];

let mass: Massing | null = null, lines: WorkLayer | null = null, flow: FlowOverlay | null = null;

export function openEducation(ctx: WorkCtx, app: App) {
  mass ??= new Massing(app, "edu:campus", "Schools", "#5160c2", "🏫");
  lines ??= new WorkLayer(app, "edu:routes", "School buses and students", "#e1b843");
  flow ??= new FlowOverlay(app.globe.viewer, { maxHeight: 80_000, maxDrops: 3000, fade: 0.1 });
  const today = isoDay();
  let d = load();

  // Shared with the team when this workspace is linked (pro/kit/team.ts); otherwise only on this device.
  const bound = { title: () => d?.name ?? "District", get: () => d, set: (b: unknown) => { d = b as District; save(d!); }, reload: () => home() };
  const sync = teamSync(app, KEY, bound);
  const persist = () => { if (d) { save(d); sync.changed(); } };
  const leave = () => { mass?.clear(); lines?.clear(); flow?.set([]); ctx.home(); };

  /** The campuses on the globe, coloured by today's state. */
  function drawCampuses(focus?: School) {
    if (!d) return;
    const bs: MassBuilding[] = [];
    for (const s of d.schools) {
      const states = roomStates(d, s, today), flags = schoolFlags(d, s, today);
      s.buildings.forEach((b, i) => bs.push({ id: b.id, lon: s.lon, lat: s.lat, w: b.w, d: b.d, dx: b.dx, dy: b.dy, bearing: b.bearing, floors: b.floors, floorH: 4,
        floorColor: (f) => ROOM_COLOR[floorState(s, states, b.id, f)], label: i === 0 ? s.name : undefined,
        pulse: i === 0 && flags.some((x) => x.level === "now") ? "#c4513a" : undefined, onTap: () => schoolPage(s) }));
    }
    mass!.draw(bs, d.name);
    // Bus routes and where students live, faintly.
    const feats: WorkFeature[] = [];
    for (const s of (focus ? [focus] : d.schools)) {
      for (const b of s.buses) feats.push({ id: b.id, kind: "line", pts: b.stops, color: "rgba(255, 204, 0, 0.5)", solid: true });
    }
    lines!.set(feats, focus ? `${focus.name}: buses and students` : "School buses");
  }

  /** Morning arrival: buses run their routes and walkers stream in from where they live. */
  function arrival(schools: School[]) {
    const fl: FlowLine[] = [];
    for (const s of schools) {
      for (const b of s.buses) fl.push({ pts: b.stops, color: "#e1b843", speed: 220, density: 0.6, size: 3.2 });
      for (const c of s.catchment.filter((c) => Math.hypot(c[0] - s.lon, c[1] - s.lat) < 0.02)) fl.push({ pts: [[c[0], c[1]], [s.lon, s.lat]], color: "#4c9ac9", speed: 40, density: 0.6 + c[2] / 20, size: 1.6 });
    }
    flow!.set(fl); flow!.show(true);
    setTimeout(() => flow?.set([]), 20_000);
  }

  // ---- No district yet ----
  function start() {
    mass!.clear(); lines!.clear();
    const name = h("input", { class: "pro-url", placeholder: "District or school name", "aria-label": "Name" }) as HTMLInputElement;
    ctx.show("Education Pro", leave,
      h("p", { class: "mp-intro" }, "Run your schools from the map: who's out and who covers them, every room's state in 3D, repairs, drills and incidents, certificates coming due, attendance, buses and where students live, and the lessons and trips your teachers are running."),
      h("button", { class: "primary-btn", onclick: () => { d = demoDistrict(today); persist(); home(); } }, "Open the demo district"),
      h("h3", { class: "group-title" }, "Or start your own"),
      h("div", { class: "pf-add" }, name, h("button", { class: "pill-btn", onclick: () => { if (!name.value.trim()) return; d = { id: `d${Date.now()}`, name: name.value.trim(), schools: [], staff: [] }; persist(); home(); } }, "Create")),
      h("p", { class: "fineprint" }, "Everything stays on this device until Terreno's back end is connected; then it syncs to your district's account with roles for principals, APs and office staff."));
  }

  // ---- The district ----
  function home() {
    if (!d) return start();
    const k = districtKpis(d, today);
    drawCampuses();
    if (d.schools.length) {
      const lons = d.schools.map((s) => s.lon), lats = d.schools.map((s) => s.lat);
      void flyToPlace(app.globe, { name: d.name, lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, radius: Math.max(1200, Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) * 70_000) });
    }
    const addSchool = h("details", { class: "md-adjust" }, h("summary", {}, "Add a school"));
    const q = h("input", { class: "pro-url", placeholder: "School address", "aria-label": "Address" }) as HTMLInputElement;
    const nm = h("input", { class: "pro-url", placeholder: "School name", "aria-label": "School name" }) as HTMLInputElement;
    const lv = h("select", { class: "pro-url", "aria-label": "Level" }, ...Object.entries(LEVEL).map(([v, t]) => h("option", { value: v }, t))) as HTMLSelectElement;
    const msg = h("p", { class: "muted small" });
    addSchool.append(nm, q, lv, h("button", { class: "pill-btn", onclick: async () => {
      const g = (await geocode(q.value).catch(() => []))[0];
      if (!g) { msg.textContent = "Couldn't find that address."; return; }
      const id = `s${Date.now()}`;
      d!.schools.push({ id, name: nm.value || g.name, level: lv.value as School["level"], lon: g.lon, lat: g.lat, enrollment: 0, capacity: 0,
        buildings: [{ id: `${id}-main`, name: "Main building", w: 70, d: 30, dx: 0, dy: 0, bearing: 0, floors: 2 }],
        rooms: Array.from({ length: 10 }, (_, i) => ({ id: `${id}-r${i}`, name: `Room ${i < 5 ? 100 + i : 200 + i - 5}`, building: `${id}-main`, floor: i < 5 ? 0 : 1, kind: "classroom" as const, capacity: 28 })),
        attendance: [], workOrders: [], incidents: [], drills: [], buses: [], catchment: [], trips: [], assignments: [], budget: { allocated: 0, spent: 0 } });
      persist(); home();
    } }, "Add"), msg);
    ctx.show(d.name, leave,
      d.demo ? h("p", { class: "edu-demo" }, "Demo district: made-up schools, staff and students around Silver Spring, MD.") : "",
      kpis([k.students.toLocaleString(), "students"], [`${k.attendance}%`, "attendance today", k.attendance < 92], [String(k.out), "staff out today"], [String(k.uncovered), "classes without cover", k.uncovered > 0], [String(k.ratio), "students per teacher"], [`${Math.round((k.budget.spent / Math.max(1, k.budget.allocated)) * 100)}%`, "of budget spent"]),
      h("div", { class: "edu-legend" }, ...(["cover", "repair", "covered", "ok"] as const).map((s) => h("span", { style: `--c:${ROOM_COLOR[s]}` }, h("i", {}), ROOM_LABEL[s]))),
      h("button", { class: "pill-btn", onclick: () => arrival(d!.schools) }, "▶ Morning arrival"),
      title("Schools"),
      list(...d.schools.map((s) => { const f = schoolFlags(d!, s, today); return row({ color: f.some((x) => x.level === "now") ? "#c4513a" : f.length ? "#d19a2e" : "#5b9467" }, s.name, `${LEVEL[s.level]} · ${s.enrollment.toLocaleString()} students · ${f.length ? `${f.length} to look at` : "all clear"}`, () => schoolPage(s)); })),
      addSchool,
      h("div", { class: "edu-actions" },
        h("button", { class: "pill-btn", onclick: () => districtReport() }, "District report"),
        h("button", { class: "pill-btn", onclick: () => downloadCsv("staff.csv", ["Name", "Role", "School", "Subject", "Certificate", "Expires", "Absences (all)"], d!.staff.map((x) => [x.name, x.role, d!.schools.find((s) => s.id === x.school)?.name ?? "District pool", x.subject ?? "", x.cert?.name ?? "", x.cert?.expires ?? "", x.absences.length])) }, "Staff CSV"),
        d.demo && !sync.link ? h("button", { class: "link-btn danger", onclick: () => { localStorage.removeItem(KEY); d = null; start(); } }, "Remove the demo") : ""),
      teamCard(app, sync, bound));
  }

  // ---- A school ----
  type Tab = "today" | "rooms" | "staff" | "safety" | "students" | "learning";
  function schoolPage(s: School, tab: Tab = "today") {
    if (!d) return;
    drawCampuses(s);
    void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 230 });
    const body = h("div", { class: "edu-body" });
    const tabs = h("div", { class: "segmented edu-tabs", role: "tablist" }, ...([["today", "Today"], ["rooms", "Rooms"], ["staff", "Staff"], ["safety", "Safety"], ["students", "Students"], ["learning", "Learning"]] as [Tab, string][]).map(([id, label]) => {
      const b = h("button", { role: "tab", "aria-selected": String(id === tab), onclick: () => { tab = id; tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b))); render(); } }, label);
      return b;
    }));
    const go = (t: Tab) => { tab = t; tabs.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-selected", String(["today", "rooms", "staff", "safety", "students", "learning"][i] === t))); render(); };
    const change = () => { persist(); drawCampuses(s); render(); };
    const name = (id?: string) => d!.staff.find((x) => x.id === id)?.name ?? "—";
    const roomName = (id?: string) => s.rooms.find((r) => r.id === id)?.name ?? "—";

    function render() {
      if (tab === "today") body.replaceChildren(...today_());
      else if (tab === "rooms") body.replaceChildren(...rooms());
      else if (tab === "staff") body.replaceChildren(...staff());
      else if (tab === "safety") body.replaceChildren(...safety());
      else if (tab === "students") body.replaceChildren(...students());
      else body.replaceChildren(...learn());
    }

    function today_(): (HTMLElement | string)[] {
      const flags = schoolFlags(d!, s, today), plan = coverPlan(d!, s, today);
      const subs = d!.staff.filter((x) => x.role === "substitute" && (x.school === s.id || x.school === "pool") && !x.absences.some((a) => a.date === today));
      const who = h("select", { class: "pro-url", "aria-label": "Who's out" }, h("option", { value: "" }, "Someone's out today…"), ...d!.staff.filter((x) => x.school === s.id && !x.absences.some((a) => a.date === today)).map((x) => h("option", { value: x.id }, `${x.name} · ${x.subject ?? x.role}`))) as HTMLSelectElement;
      const why = h("select", { class: "pro-url", "aria-label": "Reason" }, ...["sick", "personal", "training", "family"].map((v) => h("option", { value: v }, v))) as HTMLSelectElement;
      return [
        flags.length ? h("div", { class: "edu-flags" }, ...flags.map((f) => h("button", { class: `edu-flag ${f.level}`, onclick: () => f.go && go(f.go === "cover" ? "today" : f.go) }, h("i", {}), f.text))) : h("p", { class: "edu-ok" }, "✓ All clear this morning."),
        title(`Cover (${plan.length} out)`),
        plan.length ? list(...plan.map((c) => {
          const pickSub = h("select", { class: "pro-url edu-sub", "aria-label": `Cover for ${c.absent.name}` }, h("option", { value: "" }, c.cover ? `${c.cover.name} (suggested)` : "No one free"), ...subs.map((x) => h("option", { value: x.id }, x.name))) as HTMLSelectElement;
          pickSub.addEventListener("change", () => { const ab = c.absent.absences.find((a) => a.date === today); if (ab) { ab.coveredBy = pickSub.value || undefined; change(); } });
          const confirm = h("button", { class: "pill-btn", onclick: () => { const ab = c.absent.absences.find((a) => a.date === today); if (ab && c.cover) { ab.coveredBy = c.cover.id; change(); } } }, "Confirm");
          return h("div", { class: `edu-cover ${c.cover ? "ok" : "need"}` }, h("div", {}, h("strong", {}, c.absent.name), h("small", {}, `${c.absent.subject ?? c.absent.role} · ${c.room?.name ?? "no room"} · ${c.reason}`)),
            c.absent.role === "teacher" ? h("div", { class: "edu-cover-pick" }, pickSub, !c.absent.absences.find((a) => a.date === today)?.coveredBy && c.cover ? confirm : "") : h("small", {}, "Aide: no cover needed"));
        })) : h("p", { class: "muted small" }, "Everyone's in."),
        h("div", { class: "pf-add" }, who, why, h("button", { class: "pill-btn", onclick: () => { const x = d!.staff.find((y) => y.id === who.value); if (x) { x.absences.push({ date: today, reason: why.value as never }); change(); } } }, "Log")),
        title("At a glance"),
        kpis([s.enrollment.toLocaleString(), "students"], [`${s.attendance[s.attendance.length - 1] ?? "–"}%`, "here today"], [String(outToday(d!, s.id, today).length), "staff out"],
          [String(s.workOrders.filter((w) => w.status !== "done").length), "open repairs"], [usd(s.budget.allocated - s.budget.spent), "budget left"]),
        h("div", { class: "edu-actions" }, h("button", { class: "pill-btn", onclick: () => arrival([s]) }, "▶ Morning arrival"), h("button", { class: "pill-btn", onclick: () => schoolReport(s) }, "Print the daily report")),
      ];
    }

    function rooms(): (HTMLElement | string)[] {
      const states = roomStates(d!, s, today);
      const what = h("input", { class: "pro-url", placeholder: "What needs fixing?", "aria-label": "Repair" }) as HTMLInputElement;
      const where = h("select", { class: "pro-url", "aria-label": "Room" }, ...s.rooms.map((r) => h("option", { value: r.id }, r.name))) as HTMLSelectElement;
      const pri = h("select", { class: "pro-url", "aria-label": "Priority" }, ...["urgent", "high", "normal"].map((v) => h("option", { value: v }, v))) as HTMLSelectElement;
      return [
        ...s.buildings.map((b) => h("div", { class: "edu-bldg" }, h("h4", {}, b.name),
          ...Array.from({ length: b.floors }, (_, k) => b.floors - 1 - k).map((f) => h("div", { class: "edu-floor" }, h("span", { class: "edu-floor-n" }, f === 0 ? "G" : String(f)),
            ...s.rooms.filter((r) => r.building === b.id && r.floor === f).map((r) => { const st = states.get(r.id) ?? "ok"; return h("span", { class: "edu-room", style: `--c:${ROOM_COLOR[st]}`, title: `${r.name}: ${ROOM_LABEL[st]}${r.teacher ? ` · ${name(r.teacher)}` : ""}` }, h("strong", {}, r.name.replace("Room ", "")), h("small", {}, r.kind === "classroom" ? name(r.teacher).split(" ")[1] ?? "" : r.kind)); }))))),
        h("div", { class: "edu-legend" }, ...(["cover", "repair", "covered", "ok", "empty"] as const).map((x) => h("span", { style: `--c:${ROOM_COLOR[x]}` }, h("i", {}), ROOM_LABEL[x]))),
        title("Repairs"),
        list(...s.workOrders.filter((w) => w.status !== "done").sort((a, b) => ["urgent", "high", "normal"].indexOf(a.priority) - ["urgent", "high", "normal"].indexOf(b.priority)).map((w) =>
          h("div", { class: `edu-wo ${w.priority}` }, h("div", {}, h("strong", {}, w.what), h("small", {}, `${roomName(w.room)} · ${w.priority} · ${daysBetween(w.opened, today)} days open · ${w.status}`)),
            h("button", { class: "pill-btn", onclick: () => { w.status = w.status === "open" ? "in progress" : "done"; change(); } }, w.status === "open" ? "Start" : "Done")))),
        h("div", { class: "edu-form" }, what, h("div", { class: "md-two" }, where, pri), h("button", { class: "pill-btn", onclick: () => { if (!what.value.trim()) return; s.workOrders.push({ id: `w${Date.now()}`, room: where.value, what: what.value.trim(), opened: today, priority: pri.value as never, status: "open" }); change(); } }, "Report a repair")),
      ];
    }

    function staff(): (HTMLElement | string)[] {
      const people = staffOf(d!, s.id);
      const due = certsDue(d!, s.id, today);
      const obsWho = h("select", { class: "pro-url", "aria-label": "Teacher" }, ...people.filter((x) => x.role === "teacher").map((x) => h("option", { value: x.id }, x.name))) as HTMLSelectElement;
      const obsRate = h("select", { class: "pro-url", "aria-label": "Rating" }, ...[["4", "Highly effective"], ["3", "Effective"], ["2", "Developing"], ["1", "Needs support"]].map(([v, t]) => h("option", { value: v }, t))) as HTMLSelectElement;
      const obsNote = h("input", { class: "pro-url", placeholder: "One line: what you saw", "aria-label": "Note" }) as HTMLInputElement;
      const absences30 = (x: Staff) => x.absences.filter((a) => daysBetween(a.date, today) <= 30).length;
      return [
        kpis([String(people.filter((x) => x.school === s.id).length), "staff"], [String(people.filter((x) => x.role === "teacher").length), "teachers"], [String(due.length), "certificates due", due.some((x) => x.days < 0)],
          [String(people.filter((x) => x.role === "teacher" && !x.observations.some((o) => daysBetween(o.date, today) <= 120)).length), "not observed this term"]),
        ...ROLE_ORDER.filter((r) => people.some((x) => x.role === r)).map((r) => h("div", {}, title(r === "office" ? "Front office" : `${r[0].toUpperCase()}${r.slice(1)}s`),
          list(...people.filter((x) => x.role === r).map((x) => {
            const cd = x.cert ? daysBetween(today, x.cert.expires) : null;
            const out = x.absences.some((a) => a.date === today);
            return h("div", { class: "edu-person" }, h("div", {}, h("strong", {}, x.name, out ? h("span", { class: "edu-tag out" }, "Out today") : "", x.school === "pool" ? h("span", { class: "edu-tag" }, "District pool") : ""),
              h("small", {}, [x.subject, x.room ? roomName(x.room) : "", `${absences30(x)} absence${absences30(x) === 1 ? "" : "s"} in 30 days`, x.observations.length ? `last observed ${x.observations[x.observations.length - 1].date}` : ""].filter(Boolean).join(" · "))),
              cd !== null ? h("span", { class: `edu-cert ${cd < 0 ? "bad" : cd <= 45 ? "soon" : ""}`, title: x.cert!.name }, cd < 0 ? "Cert expired" : cd <= 45 ? `Cert ${cd}d` : "Cert ✓") : "");
          })))),
        title("Log an observation"),
        h("div", { class: "edu-form" }, h("div", { class: "md-two" }, obsWho, obsRate), obsNote, h("button", { class: "pill-btn", onclick: () => { const x = d!.staff.find((y) => y.id === obsWho.value); if (!x) return; x.observations.push({ date: today, by: "Principal", rating: Number(obsRate.value) as never, note: obsNote.value }); change(); } }, "Save")),
      ];
    }

    function safety(): (HTMLElement | string)[] {
      const drills = drillStatus(s, today);
      const kind = h("select", { class: "pro-url", "aria-label": "Kind" }, ...["safety", "behavior", "medical", "facility", "visitor"].map((v) => h("option", { value: v }, v))) as HTMLSelectElement;
      const text = h("input", { class: "pro-url", placeholder: "What happened", "aria-label": "What happened" }) as HTMLInputElement;
      return [
        title("Drills"),
        list(...drills.map((x) => h("div", { class: `edu-drill ${x.due ? "due" : ""}` }, h("div", {}, h("strong", {}, DRILL_LABEL[x.kind]), h("small", {}, x.last ? `Last held ${x.last} (${x.days} days ago)` : "None on record")),
          h("button", { class: "pill-btn", onclick: () => { s.drills.push({ kind: x.kind as DrillKind, date: today }); change(); } }, "Held today")))),
        title("Incidents"),
        list(...s.incidents.slice().sort((a, b) => b.date.localeCompare(a.date)).map((i: Incident) => h("div", { class: `edu-inc ${i.status}` }, h("div", {}, h("strong", {}, `${i.kind[0].toUpperCase()}${i.kind.slice(1)} · ${i.date}`), h("small", {}, i.text)),
          i.status === "open" ? h("button", { class: "pill-btn", onclick: () => { i.status = "closed"; change(); } }, "Close") : h("span", { class: "muted small" }, "Closed")))),
        h("div", { class: "edu-form" }, h("div", { class: "md-two" }, kind, text), h("button", { class: "pill-btn", onclick: () => { if (!text.value.trim()) return; s.incidents.push({ id: `i${Date.now()}`, date: today, kind: kind.value as never, text: text.value.trim(), status: "open" }); change(); } }, "Log an incident")),
      ];
    }

    function students(): (HTMLElement | string)[] {
      const cs = catchmentStats(s), max = Math.max(100, ...s.attendance), min = Math.min(85, ...s.attendance);
      return [
        kpis([s.enrollment.toLocaleString(), "enrolled"], [s.capacity.toLocaleString(), "places", s.enrollment > s.capacity], [`${avg(s.attendance).toFixed(1)}%`, "attendance, 10 days"], [`${cs.median} km`, "median trip to school"]),
        title("Attendance, the last ten days"),
        h("div", { class: "edu-att" }, ...s.attendance.map((a, i) => h("i", { style: `height:${((a - min) / (max - min)) * 100}%`, class: a < 92 ? "low" : "", title: `${addDays(today, i - s.attendance.length + 1)}: ${a}%` }))),
        title("Where students live"),
        h("p", { class: "ec-note" }, cs.within.map(([km, pct]) => `${pct}% within ${km} km`).join(" · "), ". The morning arrival shows them streaming in."),
        title("Buses"),
        list(...s.buses.map((b) => row({ color: b.onTime < 0.85 ? "#d19a2e" : "#5b9467" }, b.name, `${b.students} students · ${Math.round(b.onTime * 100)}% on time · ${b.stops.length - 1} stops`))),
        h("button", { class: "pill-btn", onclick: () => arrival([s]) }, "▶ Watch the morning arrival"),
      ];
    }

    function learn(): (HTMLElement | string)[] {
      const results = (() => { try { return JSON.parse(localStorage.getItem("atlas.work.results.v1") ?? "[]"); } catch { return []; } })();
      const l = learning(s, Array.isArray(results) ? results : []);
      const grp = h("select", { class: "pro-url", "aria-label": "Class" }, ...teachersOf().map((x) => h("option", { value: x.id }, `${x.subject} · ${x.name}`))) as HTMLSelectElement;
      const what = h("select", { class: "pro-url", "aria-label": "Lesson" }, ...["Continents and oceans", "Volcanoes and earthquakes", "Ancient civilisations", "Rivers and the water cycle"].map((t) => h("option", { value: t }, t))) as HTMLSelectElement;
      const due = h("input", { class: "pro-url", type: "date", value: addDays(today, 7), "aria-label": "Due" }) as HTMLInputElement;
      return [
        title("Field trips"),
        s.trips.length ? list(...s.trips.map((t) => {
          const km = Math.round(Math.hypot((t.place.lon - s.lon) * 86, (t.place.lat - s.lat) * 111));
          return h("div", { class: `edu-trip ${t.status}` }, h("div", {}, h("strong", {}, t.title), h("small", {}, `${t.place.name} · ${t.date} · ${t.students} students · ${name(t.teacher)} · ~${km} km, ${Math.round(km / 0.45)} min by bus`)),
            t.status === "requested" ? h("div", { class: "edu-cover-pick" }, h("button", { class: "pill-btn", onclick: () => { t.status = "approved"; change(); } }, "Approve"), h("button", { class: "link-btn danger", onclick: () => { t.status = "declined"; change(); } }, "Decline"))
              : h("span", { class: `edu-tag ${t.status === "approved" ? "" : "out"}` }, t.status), h("button", { class: "link-btn", onclick: () => { lines!.set([{ id: t.id, kind: "line", pts: [[s.lon, s.lat], [t.place.lon, t.place.lat]], color: "#8b5fa8", solid: true }, { id: `${t.id}-p`, kind: "point", pts: [[t.place.lon, t.place.lat]], color: "#8b5fa8", label: t.place.name }], t.title); void flyToPlace(app.globe, { name: t.place.name, lon: (s.lon + t.place.lon) / 2, lat: (s.lat + t.place.lat) / 2, radius: km * 700 + 2000 }); } }, "Show the route"));
        })) : h("p", { class: "muted small" }, "No trips planned."),
        title("Classes and what they're working on"),
        ...l.groups.map((g) => h("div", { class: "edu-group" }, h("div", { class: "edu-group-head" }, h("strong", {}, g.group), h("span", {}, `${g.done}% done`)),
          ...g.list.map((a) => h("div", { class: "edu-asg" }, h("span", {}, `${a.kind === "quiz" ? "📝" : a.kind === "trip" ? "🚌" : a.kind === "game" ? "🎲" : "🌍"} ${a.title}`), h("small", {}, `due ${a.due}`), h("span", { class: "edu-bar" }, h("i", { style: `width:${a.done * 100}%` })))))),
        l.quizzes.length ? h("div", {}, title("Quiz results from Teach"), list(...l.quizzes.map((q) => row({ color: q.pct >= 70 ? "#5b9467" : q.pct >= 50 ? "#d19a2e" : "#c4513a" }, q.title, `${q.n} result${q.n === 1 ? "" : "s"} · average ${q.pct}%`)))) : "",
        title("Assign a lesson"),
        h("div", { class: "edu-form" }, grp, h("div", { class: "md-two" }, what, due), h("button", { class: "pill-btn", onclick: () => { const t = d!.staff.find((x) => x.id === grp.value); if (!t) return; s.assignments.push({ id: `a${Date.now()}`, teacher: t.id, group: t.subject ?? t.name, title: what.value, kind: "lesson", due: due.value, done: 0 }); change(); } }, "Assign")),
        h("div", { class: "edu-actions" }, h("button", { class: "pill-btn", onclick: () => app.actions.get("work:teach")?.run() }, "Open Teach: lessons, quizzes, games"), h("button", { class: "pill-btn", onclick: () => app.actions.get("work:learn")?.run() }, "Learn: museums and places to visit")),
      ];
    }
    const teachersOf = () => d!.staff.filter((x) => x.school === s.id && x.role === "teacher");

    render();
    ctx.show(s.name, () => home(), h("p", { class: "edu-sub" }, `${LEVEL[s.level]} · ${s.enrollment.toLocaleString()} students · ${s.buildings.length} building${s.buildings.length > 1 ? "s" : ""}`), tabs, body);
  }

  function schoolReport(s: School) {
    const flags = schoolFlags(d!, s, today), plan = coverPlan(d!, s, today);
    printReport(`${s.name}: daily report`, today, [
      { heading: "Today", kpis: [[s.enrollment.toLocaleString(), "students"], [`${s.attendance[s.attendance.length - 1] ?? "–"}%`, "attendance"], [String(plan.length), "staff out"], [String(plan.filter((c) => !c.cover).length), "without cover"]] },
      { heading: "To look at", lines: flags.map((f) => f.text) },
      { heading: "Cover", table: { head: ["Out", "Room", "Reason", "Cover"], rows: plan.map((c) => [c.absent.name, c.room?.name ?? "", c.reason, c.cover?.name ?? "NONE"]) } },
      { heading: "Repairs", table: { head: ["What", "Room", "Priority", "Days open"], rows: s.workOrders.filter((w) => w.status !== "done").map((w) => [w.what, s.rooms.find((r) => r.id === w.room)?.name ?? "", w.priority, daysBetween(w.opened, today)]) } },
    ]);
  }
  function districtReport() {
    const k = districtKpis(d!, today);
    printReport(d!.name, `District summary · ${today}`, [
      { heading: "Today", kpis: [[k.students.toLocaleString(), "students"], [`${k.attendance}%`, "attendance"], [String(k.out), "staff out"], [String(k.uncovered), "without cover"]] },
      { heading: "Schools", table: { head: ["School", "Students", "Places", "Attendance", "Flags"], rows: d!.schools.map((s) => [s.name, s.enrollment, s.capacity, `${s.attendance[s.attendance.length - 1] ?? "–"}%`, schoolFlags(d!, s, today).length]) } },
    ]);
  }

  if (d) home(); else start();
}
