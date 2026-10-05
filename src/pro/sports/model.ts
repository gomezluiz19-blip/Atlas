// Sports Pro: a club run on the map. Its ground and training sites, the
// season's fixtures and what travelling to them costs (kilometres, hours,
// carbon, and turnarounds too tight for the distance), where its fans are and
// how far they come, match-day crowds flowing in, and the players it's
// scouting. Pure functions here; the screens in ui.ts.
import { kmBetween, MODES, type Mode } from "../kit/ops";
import type { Log, Mood, Party, Site } from "../kit/ops";

export interface Venue { name: string; lon: number; lat: number }
export interface Fixture { id: string; date: string; time?: string; opponent: string; home: boolean; venue: Venue; comp?: string; result?: string; crowd?: number }
export interface FanGroup { id: string; name: string; lon: number; lat: number; members: number }
export type TargetStatus = "watch" | "shortlist" | "bid" | "signed" | "passed";
export const TARGET_STATUS: Record<TargetStatus, { label: string; color: string }> = {
  watch: { label: "Watching", color: "#8c8f87" }, shortlist: { label: "Shortlist", color: "#3563d6" }, bid: { label: "Bid in", color: "#d19a2e" },
  signed: { label: "Signed", color: "#5b9467" }, passed: { label: "Passed", color: "#636366" },
};
export interface Target { id: string; name: string; position: string; age?: number; club: string; lon: number; lat: number; status: TargetStatus; rating?: number; notes?: string; log: Log[] }
export interface Club {
  id: string; name: string; sport: string;
  ground: Venue & { capacity: number };
  sites: Site[]; fixtures: Fixture[]; fans: FanGroup[]; targets: Target[]; parties: Party[];
  /** Who travels to an away game. */
  party: number;
  /** The league it plays in (Wikidata id or "baseball"), to see it among its rivals. */
  league?: { id: string; name: string };
  /** Baseball: the club's Stats API id and level, for live schedules, affiliates and moves. */
  mlbId?: number; sportId?: number; level?: string;
  /** Affiliates and partner clubs (a farm system, a feeder club, a women's or reserve side). */
  affiliates?: { id: string; name: string; venue: string; lon: number; lat: number; level?: string; mlbId?: number; sportId?: number }[];
  created: number; demo?: boolean;
}

export const SITE_KINDS = {
  ground: { label: "Home ground", emoji: "🏟" }, training: { label: "Training ground", emoji: "⚽" }, academy: { label: "Academy", emoji: "🎓" },
  office: { label: "Club office", emoji: "🏢" }, shop: { label: "Club shop", emoji: "🛍" }, community: { label: "Community programme", emoji: "🤝" },
};
export const PARTY_KINDS = {
  sponsor: { label: "Sponsor", emoji: "💼" }, supporters: { label: "Supporters' group", emoji: "📣" }, council: { label: "Council or police", emoji: "🏛" },
  league: { label: "League or federation", emoji: "🏆" }, agent: { label: "Agent", emoji: "🧾" }, media: { label: "Media", emoji: "📺" }, partner: { label: "Partner", emoji: "🤝" },
};

/** How the team gets there: coach under 500 km, else a flight (pure). */
export const modeFor = (km: number): Mode => (km < 500 ? "truck" : "air");
const modeLabel = (m: Mode) => (m === "truck" ? "Coach" : MODES[m].label);

export interface Leg { from: Venue; to: Venue; km: number; hours: number; mode: Mode; how: string; co2t: number; fixture?: Fixture }
export interface Turnaround { a: Fixture; b: Fixture; days: number; km: number }

const road = (a: Venue, b: Venue, party: number, fixture?: Fixture): Leg => {
  const straight = kmBetween(a, b), mode = modeFor(straight), m = MODES[mode];
  const km = straight * m.detour;
  return { from: a, to: b, km, hours: km / m.kmh + m.handling, mode, how: modeLabel(mode), co2t: (party * km * (mode === "truck" ? 0.03 : m.peopleCO2)) / 1000, fixture };
};
const dayGap = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * The season's travel, game by game (pure). The team goes out from home and
 * comes back, except when the next away game is within four days: then it goes
 * straight on. A coach carries the travelling party (0.03 kg CO2 per
 * passenger-km); flights use the air factor.
 */
export function seasonTravel(club: Club) {
  const games = [...club.fixtures].sort((a, b) => a.date.localeCompare(b.date));
  const legs: Leg[] = [];
  let at: Venue = club.ground;
  for (let i = 0; i < games.length; i++) {
    const g = games[i], next = games[i + 1];
    if (g.home) { if (at !== club.ground) legs.push(road(at, club.ground, club.party)); at = club.ground; continue; }
    legs.push(road(at, g.venue, club.party, g));
    at = g.venue;
    if (!next || next.home || dayGap(g.date, next.date) > 4) { legs.push(road(at, club.ground, club.party)); at = club.ground; }
  }
  const tight: Turnaround[] = [];
  for (let i = 0; i + 1 < games.length; i++) {
    const a = games[i], b = games[i + 1], d = dayGap(a.date, b.date), km = kmBetween(a.home ? club.ground : a.venue, b.home ? club.ground : b.venue);
    // Tight: the next day with a real journey, or three days or fewer for a long one.
    if ((d <= 1 && km > 800) || (d <= 3 && km > 2500)) tight.push({ a, b, days: d, km });
  }
  const aways = legs.filter((l) => l.fixture);
  return {
    legs, tight,
    km: legs.reduce((s, l) => s + l.km, 0),
    hours: legs.reduce((s, l) => s + l.hours, 0),
    co2t: legs.reduce((s, l) => s + l.co2t, 0),
    flights: legs.filter((l) => l.mode === "air").length,
    furthest: [...aways].sort((a, b) => b.km - a.km)[0],
  };
}

/**
 * The shape of the schedule (pure): road trips (runs of away games), games on
 * back-to-back days in different places, and the clock shifts travel brings,
 * estimated from longitude (15 degrees an hour; real time zones differ).
 */
export function scheduleShape(club: Club) {
  const games = [...club.fixtures].sort((a, b) => a.date.localeCompare(b.date));
  const where = (f: Fixture) => (f.home ? club.ground : f.venue);
  const trips: { games: Fixture[]; km: number; days: number }[] = [];
  let run: Fixture[] = [];
  const close = () => {
    if (!run.length) return;
    let km = kmBetween(club.ground, run[0].venue) + kmBetween(run[run.length - 1].venue, club.ground);
    for (let i = 1; i < run.length; i++) km += kmBetween(run[i - 1].venue, run[i].venue);
    trips.push({ games: run, km, days: dayGap(run[0].date, run[run.length - 1].date) + 1 });
    run = [];
  };
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (g.home) { close(); continue; }
    if (run.length && dayGap(run[run.length - 1].date, g.date) > 4) close();
    run.push(g);
  }
  close();
  let backToBack = 0, east = 0, west = 0;
  for (let i = 1; i < games.length; i++) {
    const a = games[i - 1], b = games[i], pa = where(a), pb = where(b);
    if (dayGap(a.date, b.date) <= 1 && kmBetween(pa, pb) > 50) backToBack++;
    const h = Math.round((pb.lon - pa.lon) / 15);
    if (h > 0) east += h; else west -= h;
  }
  return { trips: trips.sort((a, b) => b.km - a.km), backToBack, east, west, longestTrip: trips.reduce((m, t) => Math.max(m, t.games.length), 0) };
}

/** Where the fans are: shares within 25, 100 and 250 km of the ground, and the furthest group (pure). */
export function fanReach(club: Club) {
  const total = club.fans.reduce((s, f) => s + f.members, 0) || 1;
  const withD = club.fans.map((f) => ({ f, km: kmBetween(club.ground, f) }));
  const share = (km: number) => withD.filter((x) => x.km <= km).reduce((s, x) => s + x.f.members, 0) / total;
  return {
    total: club.fans.reduce((s, f) => s + f.members, 0),
    local: share(25), region: share(100), wide: share(250),
    furthest: [...withD].sort((a, b) => b.km - a.km)[0],
    /** Average distance a member lives from the ground, weighted by members. */
    meanKm: withD.reduce((s, x) => s + x.km * x.f.members, 0) / total,
  };
}

/**
 * Match day: who's expected from each group within 400 km, by share of members
 * that come to a home game (fewer the further they live), against the capacity (pure).
 */
export function matchDay(club: Club, turnout = 0.35) {
  const flows = club.fans.map((f) => {
    const km = kmBetween(club.ground, f);
    const rate = turnout * (km <= 25 ? 1 : km <= 100 ? 0.6 : km <= 400 ? 0.25 : 0.05);
    return { f, km, fans: Math.round(f.members * rate) };
  }).filter((x) => x.fans > 0 && x.km <= 400);
  const expected = flows.reduce((s, x) => s + x.fans, 0);
  return { flows, expected, capacity: club.ground.capacity, fill: expected / Math.max(1, club.ground.capacity) };
}

/** The scouting pipeline: counts by status and the furthest active target (pure). */
export function pipeline(club: Club) {
  const counts = Object.fromEntries((Object.keys(TARGET_STATUS) as TargetStatus[]).map((s) => [s, club.targets.filter((t) => t.status === s).length])) as Record<TargetStatus, number>;
  const active = club.targets.filter((t) => t.status !== "passed" && t.status !== "signed").map((t) => ({ t, km: kmBetween(club.ground, t) }));
  return { counts, active: active.length, furthest: active.sort((a, b) => b.km - a.km)[0] };
}

export const blankClub = (name: string, ground: Venue, capacity: number, id: string): Club =>
  ({ id, name, sport: "Football", ground: { ...ground, capacity }, sites: [], fixtures: [], fans: [], targets: [], parties: [], party: 40, created: Date.now() });

export type { Mood };
