// Sports Pro: a club on the map. One screen for the club (what's next, the
// season's travel, the fans, the scouting pipeline, the people it deals with)
// and four ways to see it on the globe: the season's journeys as living
// streams, where the fans are with rings around the ground, match day with
// crowds flowing in, and the players being scouted around the world.
import type { App } from "../../app";
import { peopleNear, populationPoints } from "../../data/people";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { note } from "../../themes/common";
import { days, fmt, kmBetween, kmText, moodOf, ring, today, type Party } from "../kit/ops";
import { ageBadge, arcFlow, empty, field, frame, hoursText, input, kpis, lines, list, OpsMap, partyScreen, row, select, siteAdder, title } from "../kit/ui";
import { demoClub } from "./demo";
import { blankClub, fanReach, matchDay, PARTY_KINDS, pipeline, scheduleShape, seasonTravel, SITE_KINDS, TARGET_STATUS, type Club, type Fixture, type Target, type TargetStatus } from "./model";
import { forget, leagueMap, leaguePanel, loadSchedule, orgMap, orgPanel, startFromTeam } from "./leagueUi";
import { findLeague } from "./leagues";
import { printReport } from "../kit/report";

const clubs = new ListStore<Club>("atlas.pro.clubs.v1");
const current = () => clubs.all()[0];
const save = (c: Club) => clubs.save(c);
let map: OpsMap | null = null;
type View = "travel" | "league" | "org" | "fans" | "matchday" | "scouting";
let needFrame = false;
let view: View = "travel";
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
/** "Maracanã, Rio de Janeiro" → "Rio de Janeiro"; a name without a town stays whole. */
const short = (name: string) => name.split(",")[1]?.trim() || name;
const COLORS = { travel: "#0a84ff", league: "#5e5ce6", org: "#ff9f0a", fans: "#bf5af2", matchday: "#ff375f", scouting: "#ff9f0a" };

function draw(app: App, c: Club) {
  map ??= new OpsMap(app, "pro:sports", "#ff375f");
  const fs: WorkFeature[] = [{ id: "ground", kind: "point", pts: [[c.ground.lon, c.ground.lat]], color: "#ff375f", label: `🏟 ${c.ground.name.split(",")[0]}` }];
  const flows = [];
  if (view === "travel") {
    const s = seasonTravel(c);
    const seen = new Set<string>();
    s.legs.forEach((l, i) => {
      const a = arcFlow(`leg${i}`, l.from, l.to, l.mode === "air" ? "#0a84ff" : "#64d2ff", 0.5);
      fs.push(a.line); flows.push(a.flow);
      if (l.fixture && !seen.has(l.to.name)) { seen.add(l.to.name); fs.push({ id: `v${i}`, kind: "point", pts: [[l.to.lon, l.to.lat]], color: "#0a84ff", label: `${fmtDate(l.fixture.date)} · ${short(l.to.name)}` }); }
    });
  } else if (view === "league" || view === "org") {
    const redraw = () => { if (current()?.id === c.id) { draw(app, c); if (ctxRef) home(ctxRef, c); } };
    const got = view === "league" ? leagueMap(c, redraw) : orgMap(c, redraw);
    fs.push(...got.features); flows.push(...got.flows);
    if (needFrame && got.features.length) { needFrame = false; frame(app, c.name, got.features.filter((f) => f.kind === "point").map((f) => ({ lon: f.pts[0][0], lat: f.pts[0][1] })), 20_000); }
  } else if (view === "fans") {
    for (const km of [25, 100, 250]) fs.push({ id: `r${km}`, kind: "line", pts: [...ring(c.ground.lon, c.ground.lat, km), ring(c.ground.lon, c.ground.lat, km)[0]], color: "#bf5af2", dashed: true });
    for (const f of c.fans) fs.push({ id: f.id, kind: "point", pts: [[f.lon, f.lat]], color: "#bf5af2", label: `${f.name} · ${fmt(f.members)}` });
  } else if (view === "matchday") {
    const m = matchDay(c), biggest = Math.max(1, ...m.flows.map((x) => x.fans));
    for (const x of m.flows) { const a = arcFlow(x.f.id, x.f, c.ground, "#ff375f", x.fans / biggest); fs.push({ id: `p${x.f.id}`, kind: "point", pts: [[x.f.lon, x.f.lat]], color: "#ff375f", label: `${x.f.name} · ${fmt(x.fans)}` }); flows.push(a.flow); }
  } else {
    for (const t of c.targets) {
      fs.push({ id: t.id, kind: "point", pts: [[t.lon, t.lat]], color: TARGET_STATUS[t.status].color, label: `${t.name.replace(/ \(demo\)/, "")} · ${t.position}` });
      if (t.status !== "passed") fs.push(arcFlow(`l${t.id}`, t, c.ground, TARGET_STATUS[t.status].color, 0.2, true).line);
    }
  }
  if (view !== "scouting") for (const s of c.sites) fs.push({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: "#ff9f0a", label: view === "fans" ? undefined : `${SITE_KINDS[s.kind as keyof typeof SITE_KINDS]?.emoji ?? "•"} ${s.name}` });
  map.draw(`Club · ${c.name}`, fs, flows);
}

function show(app: App, c: Club) {
  if (view === "league" || view === "org") { needFrame = true; draw(app, c); return; }
  const pts = view === "travel" ? [c.ground, ...c.fixtures.map((f) => f.venue)] : view === "fans" ? [c.ground, ...c.fans.filter((f) => kmBetween(c.ground, f) < 400)] : view === "matchday" ? [c.ground, ...matchDay(c).flows.filter((x) => x.km < 150).map((x) => x.f)] : [c.ground, ...c.targets];
  frame(app, c.name, pts, 8000);
}

let ctxRef: WorkCtx | null = null;

export function openSports(ctx: WorkCtx) {
  ctxRef = ctx;
  const c = current();
  if (!c) return start(ctx);
  draw(ctx.app, c);
  home(ctx, c);
}

function start(ctx: WorkCtx) {
  const name = h("input", { class: "pro-url", placeholder: "Your club or team's name" }) as HTMLInputElement;
  const ground = h("input", { class: "pro-url", placeholder: "Home ground: a stadium, arena or pitch" }) as HTMLInputElement;
  const cap = h("input", { class: "pro-url", type: "number", placeholder: "Capacity", min: 0 }) as HTMLInputElement;
  const go = async () => {
    const [r] = await geocode(ground.value.trim()).catch(() => []);
    if (!r) { ctx.app.toast("Couldn't find that ground. Try its name and town.", 4000); return; }
    const c = blankClub(name.value.trim() || "My club", { name: ground.value.trim(), lon: r.lon, lat: r.lat }, Number(cap.value) || 10_000, newId());
    save(c); openSports(ctx); show(ctx.app, c);
  };
  ctx.show("Sports Pro", ctx.home,
    h("p", {}, "Run a club on the map: the season's fixtures and what the travel costs, where your fans live and how they reach the ground on match day, the players you're scouting worldwide, and the sponsors, supporters and officials you deal with."),
    name, ground, cap,
    h("button", { class: "primary-btn", onclick: () => void go() }, "Start the club"),
    h("button", { class: "pill-btn", onclick: () => { const c = demoClub(); save(c); view = "travel"; openSports(ctx); show(ctx.app, c); } }, "Or try a demo: a football club in Belo Horizonte"),
    h("button", { class: "pill-btn", onclick: () => startFromTeam(ctx, (c) => {
      save(c); view = "travel"; openSports(ctx); show(ctx.app, c);
      if (c.mlbId) void loadSchedule(c).then((n) => { save(c); ctx.app.toast(`${n} games this season, live from MLB.`, 3500); if (current()?.id === c.id) { openSports(ctx); show(ctx.app, c); } }).catch(() => ctx.app.toast("The schedule couldn't be loaded; add games by hand or try again.", 4000));
    }, () => start(ctx)) }, "Or start from a real team: MLB and the minors, NBA, NHL, NFL, MLS, the Premier League and more"));
}

function home(ctx: WorkCtx, c: Club) {
  const { app } = ctx;
  const t = today();
  const s = seasonTravel(c), fr = fanReach(c), md = matchDay(c), pl = pipeline(c);
  const next = [...c.fixtures].filter((f) => f.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const nextIn = next[0] ? days(t, next[0].date) : null;
  const around = h("p", { class: "muted small" });
  void populationPoints().then((pts) => {
    const r = peopleNear(pts, c.ground.lon, c.ground.lat).rings.find((x) => x.km === 100);
    if (r && r.people) around.textContent = `${fmt(r.people)} people live in the towns and cities within 100 km of the ground; your mapped members there are ${fmt((fr.total * fr.region * 1000) / r.people, 1)} per 1,000 of them.`;
  }).catch(() => {});
  const tab = (id: View, label: string) => h("button", { class: "chip" + (view === id ? " on" : ""), style: view === id ? `--c:${COLORS[id]}` : "", onclick: () => { view = id; draw(app, c); home(ctx, c); show(app, c); } }, label);
  ctx.show("Sports Pro", ctx.home,
    h("input", { class: "mp-name", value: c.name, "aria-label": "Club name", onchange: (e: Event) => { c.name = (e.target as HTMLInputElement).value || c.name; save(c); } }),
    h("p", { class: "muted small" }, `🏟 ${c.ground.name} · ${fmt(c.ground.capacity)} seats`),
    kpis(
      [nextIn === null ? "—" : nextIn === 0 ? "Today" : `${nextIn} d`, next[0] ? `to ${next[0].home ? "home" : "away"} vs ${next[0].opponent}` : "no games set"],
      [fmt(s.km), "km of travel"],
      [fmt(fr.total), "fans mapped"],
      [String(pl.active), "players scouted"]),
    h("div", { class: "chips wrap" }, tab("travel", "Season travel"), tab("league", "League"), tab("org", c.mlbId ? "Farm system" : "Organisation"), tab("fans", "Fans"), tab("matchday", "Match day"), tab("scouting", "Scouting")),
    view === "travel" ? travelPanel(ctx, c, s) : view === "league" ? leaguePanel(c, () => { draw(app, c); home(ctx, c); }, () => chooseLeague(ctx, c))
      : view === "org" ? orgPanel(ctx, c, () => { draw(app, c); home(ctx, c); }, () => { save(c); forget(`org:${c.id}`); }) : view === "fans" ? h("div", {},
      lines(
        `${Math.round(fr.local * 100)}% of mapped members live within 25 km of the ground, ${Math.round(fr.region * 100)}% within 100 km, ${Math.round(fr.wide * 100)}% within 250 km.`,
        `On average a member lives ${kmText(fr.meanKm)} away.`,
        fr.furthest ? `Furthest group: ${fr.furthest.f.name}, ${kmText(fr.furthest.km)} away.` : ""),
      around,
      title("Fan groups"),
      c.fans.length ? list(...[...c.fans].sort((a, b) => b.members - a.members).map((f) => row({ color: "#bf5af2" }, f.name, `${fmt(f.members)} members · ${kmText(kmBetween(c.ground, f))} from the ground`, () => void flyToPlace(app.globe, { name: f.name, lon: f.lon, lat: f.lat, radius: 8000 })))) : empty("Add where your members, season-ticket holders or supporters' clubs are."),
      fanAdder(ctx, c)) : view === "matchday" ? h("div", {},
      lines(
        `Expected at a home game: about ${fmt(md.expected)}, ${Math.round(md.fill * 100)}% of ${fmt(md.capacity)} seats.`,
        md.fill > 0.95 ? "Close to full: plan for turn-aways and queues at the turnstiles." : md.fill < 0.5 ? "Under half full: the far-away groups are where the gap is; a coach scheme could help." : "",
        md.flows.length ? `Biggest single inflow: ${[...md.flows].sort((a, b) => b.fans - a.fans)[0].f.name}, about ${fmt([...md.flows].sort((a, b) => b.fans - a.fans)[0].fans)}.` : ""),
      list(...[...md.flows].sort((a, b) => b.fans - a.fans).slice(0, 8).map((x) => row({ color: "#ff375f" }, x.f.name, `about ${fmt(x.fans)} coming · ${kmText(x.km)}`)))) : scoutPanel(ctx, c, pl),
    title("People you deal with"),
    c.parties.length ? list(...c.parties.map((p) => row({ color: moodOf(p.mood).color }, p.name, `${PARTY_KINDS[p.kind as keyof typeof PARTY_KINDS]?.label ?? p.kind} · ${moodOf(p.mood).label}${p.log[0] ? ` · ${p.log[0].text}` : ""}`, () => partyEdit(ctx, c, p)))) : empty("Sponsors, supporters' groups, the council and police, the league."),
    partyAdder(ctx, c),
    title("Club sites"),
    list(...c.sites.map((x) => row(SITE_KINDS[x.kind as keyof typeof SITE_KINDS]?.emoji ?? "•", x.name, SITE_KINDS[x.kind as keyof typeof SITE_KINDS]?.label ?? x.kind, () => void flyToPlace(app.globe, { name: x.name, lon: x.lon, lat: x.lat, radius: 1500 })))),
    siteAdder(ctx, SITE_KINDS, (x) => { c.sites.push(x); save(c); openSports(ctx); }),
    h("div", { class: "mp-foot" }, h("span", {}, c.demo ? "A demo club: the club, people and numbers are made up; the grounds are real." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${c.name}?`)) { clubs.remove(c.id); map?.clear(); openSports(ctx); } } }, "Remove")),
    note("Travel assumes a coach under 500 km and a flight beyond, the team going straight on between away games four days or less apart. Match-day turnout falls with distance (all of a local group's regulars, a quarter of those 100–400 km away). Read the numbers as planning estimates."));
}

function travelPanel(ctx: WorkCtx, c: Club, s: ReturnType<typeof seasonTravel>) {
  const t = today();
  const up = [...c.fixtures].sort((a, b) => a.date.localeCompare(b.date));
  return h("div", {},
    lines(
      `${fmt(s.km)} km on the road and in the air this season, about ${hoursText(s.hours)} travelling, ${s.flights} flights.`,
      `${fmt(s.co2t, 1)} t CO₂ for a travelling party of ${c.party}.`,
      s.furthest ? `Longest trip: ${s.furthest.to.name}, ${kmText(s.furthest.km)} (${s.furthest.how.toLowerCase()}).` : "",
      ...s.tight.map((x) => `⚠️ ${fmtDate(x.a.date)} to ${fmtDate(x.b.date)}: ${x.days} days to cover ${kmText(x.km)} (${x.a.home ? "home" : short(x.a.venue.name)} → ${x.b.home ? "home" : short(x.b.venue.name)}).`)),
    shapeLines(c),
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => void loadSchedule(c).then((n) => { if (!n) return; save(c); openSports(ctx); show(ctx.app, c); ctx.app.toast(`${n} games in.`, 3000); }).catch(() => ctx.app.toast("Couldn't load the schedule.", 3500)) }, c.mlbId ? "Load this season, live" : "Import a calendar (.ics)"),
      h("button", { class: "pill-btn", onclick: () => report(c) }, "Travel report")),
    title("Fixtures"),
    up.length ? list(...up.map((f) => row(f.home ? "🏟" : "✈️", `${f.home ? "Home" : "Away"} vs ${f.opponent}${f.comp && f.comp !== "League" ? ` (${f.comp})` : ""}`,
      `${fmtDate(f.date)}${f.home ? "" : ` · ${f.venue.name} · ${kmText(kmBetween(c.ground, f.venue))}`}`,
      () => fixtureScreen(ctx, c, f), f.date < t ? ageBadge(days(f.date, t), "days ago") : ageBadge(days(t, f.date), "days")))) : empty("No fixtures yet."),
    h("button", { class: "link-btn", onclick: () => fixtureScreen(ctx, c, null) }, "+ A fixture"),
    field("Travelling party", input(c.party, (v) => { c.party = Math.max(1, Number(v) || c.party); save(c); openSports(ctx); }, { type: "number", min: 1 })));
}

function scoutPanel(ctx: WorkCtx, c: Club, pl: ReturnType<typeof pipeline>) {
  return h("div", {},
    h("div", { class: "pol-legend" }, ...(Object.keys(TARGET_STATUS) as TargetStatus[]).map((k) => h("span", {}, h("i", { style: `background:${TARGET_STATUS[k].color}` }), `${TARGET_STATUS[k].label} ${pl.counts[k]}`))),
    pl.furthest ? lines(`Furthest active target: ${pl.furthest.t.name}, ${kmText(pl.furthest.km)} away at ${pl.furthest.t.club}.`) : "",
    c.targets.length ? list(...[...c.targets].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).map((x) => row({ color: TARGET_STATUS[x.status].color }, `${x.name} · ${x.position}${x.age ? `, ${x.age}` : ""}`,
      `${x.club} · ${TARGET_STATUS[x.status].label}${x.rating ? ` · rated ${x.rating}` : ""}`, () => targetScreen(ctx, c, x)))) : empty("No players on the list yet."),
    h("button", { class: "link-btn", onclick: () => targetScreen(ctx, c, null) }, "+ A player"));
}

function fixtureScreen(ctx: WorkCtx, c: Club, f: Fixture | null) {
  const fresh = !f;
  const x: Fixture = f ?? { id: newId(), date: today(), opponent: "", home: true, venue: { name: c.ground.name, lon: c.ground.lon, lat: c.ground.lat } };
  const venue = h("input", { value: x.home ? "" : x.venue.name, placeholder: "Away ground (for away games)" }) as HTMLInputElement;
  ctx.show(fresh ? "A fixture" : `vs ${x.opponent}`, () => openSports(ctx),
    field("Opponent", input(x.opponent, (v) => (x.opponent = v))),
    field("Date", input(x.date, (v) => (x.date = v || x.date), { type: "date" })),
    field("Where", select(x.home ? "home" : "away", [["home", "Home"], ["away", "Away"]], (v) => (x.home = v === "home"))),
    field("Away ground", venue),
    field("Competition", input(x.comp ?? "League", (v) => (x.comp = v || undefined))),
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: async () => {
        if (!x.opponent) { ctx.app.toast("Who's the opponent?", 3000); return; }
        if (x.home) x.venue = { name: c.ground.name, lon: c.ground.lon, lat: c.ground.lat };
        else if (venue.value.trim() && venue.value.trim() !== x.venue.name) {
          const [r] = await geocode(venue.value.trim()).catch(() => []);
          if (!r) { ctx.app.toast("Couldn't find that ground.", 3500); return; }
          x.venue = { name: venue.value.trim(), lon: r.lon, lat: r.lat };
        }
        if (fresh) c.fixtures.push(x);
        save(c); draw(ctx.app, c); openSports(ctx);
      } }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { c.fixtures = c.fixtures.filter((y) => y !== x); save(c); draw(ctx.app, c); openSports(ctx); } }, "Remove") : ""));
}

function targetScreen(ctx: WorkCtx, c: Club, t: Target | null) {
  const fresh = !t;
  const x: Target = t ?? { id: newId(), name: "", position: "", club: "", lon: 0, lat: 0, status: "watch", log: [] };
  const where = h("input", { placeholder: "Where they play: a town or club ground" }) as HTMLInputElement;
  const entry = h("textarea", { class: "pro-url", rows: 2, placeholder: "Scouting report: a game watched, a call with the agent…" }) as HTMLTextAreaElement;
  ctx.show(fresh ? "A player" : x.name, () => { view = "scouting"; openSports(ctx); },
    field("Name", input(x.name, (v) => (x.name = v))),
    field("Position", input(x.position, (v) => (x.position = v), { placeholder: "Winger, centre-back…" })),
    field("Age", input(x.age ?? "", (v) => (x.age = Number(v) || undefined), { type: "number", min: 14 })),
    field("Club", input(x.club, (v) => (x.club = v))),
    fresh ? field("Where", where) : "",
    field("Status", select(x.status, (Object.keys(TARGET_STATUS) as TargetStatus[]).map((k) => [k, TARGET_STATUS[k].label]), (v) => (x.status = v))),
    field("Rating", input(x.rating ?? "", (v) => (x.rating = Number(v) || undefined), { type: "number", step: "0.1", min: 0, max: 10 })),
    field("Notes", input(x.notes ?? "", (v) => (x.notes = v || undefined))),
    !fresh ? h("div", {}, title("Reports"), entry, h("button", { class: "pill-btn", onclick: () => { const v = entry.value.trim(); if (!v) return; x.log.unshift({ at: today(), text: v }); save(c); targetScreen(ctx, c, x); } }, "Add a report"),
      h("div", { class: "po-log" }, ...x.log.map((l) => h("p", {}, h("small", {}, l.at), " ", l.text)))) : "",
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: async () => {
        if (!x.name) { ctx.app.toast("Give the player a name.", 3000); return; }
        if (fresh) {
          const [r] = await geocode(where.value.trim() || x.club).catch(() => []);
          if (!r) { ctx.app.toast("Couldn't place them: add the town they play in.", 3500); return; }
          x.lon = r.lon; x.lat = r.lat; c.targets.push(x);
        }
        save(c); view = "scouting"; draw(ctx.app, c); openSports(ctx);
      } }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { c.targets = c.targets.filter((y) => y !== x); save(c); draw(ctx.app, c); openSports(ctx); } }, "Remove") : ""));
}

function fanAdder(ctx: WorkCtx, c: Club) {
  const where = h("input", { class: "pro-url", placeholder: "A neighbourhood, town or supporters' club city" }) as HTMLInputElement;
  const n = h("input", { class: "pro-url po-unit", type: "number", min: 1, placeholder: "Members" }) as HTMLInputElement;
  const go = async () => {
    const q = where.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (!r) { ctx.app.toast("Couldn't find that place.", 3500); return; }
    c.fans.push({ id: newId(), name: q, lon: r.lon, lat: r.lat, members: Number(n.value) || 100 });
    save(c); draw(ctx.app, c); openSports(ctx);
  };
  return h("div", { class: "po-add" }, where, n, h("button", { class: "pill-btn", onclick: () => void go() }, "Add"));
}

function partyAdder(ctx: WorkCtx, c: Club) {
  const name = h("input", { class: "pro-url", placeholder: "A sponsor, supporters' group, official…" }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...Object.entries(PARTY_KINDS).map(([k, v]) => h("option", { value: k }, `${v.emoji} ${v.label}`))) as HTMLSelectElement;
  return h("div", { class: "po-add" }, name, kind, h("button", { class: "pill-btn", onclick: () => { const v = name.value.trim(); if (!v) return; c.parties.push({ id: newId(), name: v, kind: kind.value, mood: "neutral", log: [] }); save(c); openSports(ctx); } }, "Add"));
}

function partyEdit(ctx: WorkCtx, c: Club, p: Party) {
  partyScreen(ctx, p, PARTY_KINDS, () => save(c), () => { c.parties = c.parties.filter((x) => x !== p); save(c); openSports(ctx); }, () => openSports(ctx));
}

function shapeLines(c: Club) {
  const sh = scheduleShape(c);
  return lines(
    sh.trips.length ? `${sh.trips.length} road ${sh.trips.length === 1 ? "trip" : "trips"}; the longest has ${sh.longestTrip} ${sh.longestTrip === 1 ? "game" : "games"}, the furthest covers ${kmText(sh.trips[0].km)} over ${sh.trips[0].days} days.` : "",
    sh.backToBack ? `${sh.backToBack} back-to-backs: games on consecutive days in different places.` : "",
    sh.east + sh.west ? `About ${sh.east} hours of eastward and ${sh.west} of westward clock change across the season (by longitude).` : "");
}

async function chooseLeague(ctx: WorkCtx, c: Club) {
  const q = prompt("Which league does the club play in?", c.league?.name ?? "");
  if (!q) return;
  const [hit] = await findLeague(q).catch(() => []);
  if (!hit) { ctx.app.toast("Couldn't find that league.", 3000); return; }
  c.league = { id: hit.id, name: hit.label };
  save(c); forget("league:"); draw(ctx.app, c); openSports(ctx);
}

function report(c: Club) {
  const s = seasonTravel(c), sh = scheduleShape(c), fr = fanReach(c), md = matchDay(c);
  const fx = [...c.fixtures].sort((a, b) => a.date.localeCompare(b.date));
  printReport(`${c.name}: season travel`, [c.ground.name, c.league?.name, c.level].filter(Boolean).join(" · "), [
    { heading: "The season", kpis: [[fmt(s.km), "km travelled"], [String(s.flights), "flights"], [hoursText(s.hours), "travelling"], [`${fmt(s.co2t, 1)} t`, `CO₂ (party of ${c.party})`]] },
    { heading: "Watch points", lines: [
      ...s.tight.map((x) => `${x.a.date} to ${x.b.date}: ${x.days} days for ${kmText(x.km)}.`),
      ...(sh.backToBack ? [`${sh.backToBack} back-to-backs in different places.`] : []),
      ...(sh.trips[0] ? [`Longest road trip: ${sh.trips[0].games.length} games, ${kmText(sh.trips[0].km)}, ${sh.trips[0].days} days.`] : []),
      `Clock change: about ${sh.east} h eastward, ${sh.west} h westward (by longitude).`] },
    { heading: "Fixtures", table: { head: ["Date", "Opponent", "Where", "Distance from home"], rows: fx.map((f) => [f.date, f.opponent, f.home ? "Home" : f.venue.name, f.home ? "—" : kmText(kmBetween(c.ground, f.venue))]) } },
    ...(c.fans.length ? [{ heading: "Fans", lines: [`${fmt(fr.total)} mapped; ${Math.round(fr.local * 100)}% within 25 km, ${Math.round(fr.region * 100)}% within 100 km.`, `Expected at a home game: about ${fmt(md.expected)} of ${fmt(md.capacity)}.`] }] : []),
  ], "Travel assumes a coach under 500 km and a flight beyond. Clock change is estimated from longitude.");
}
