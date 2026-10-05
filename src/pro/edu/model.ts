// Education Pro: a district's or a principal's schools, staff and day, on the
// map (pure). Who's out today and who covers them, every room's status, work
// orders, incidents and drills, certificates coming due, attendance, where
// students live, the buses, field trips waiting for a yes, and the lessons and
// quizzes classes are working through (from Teach). The screens are in ui.ts.

export type Level = "elementary" | "middle" | "high";
export interface Building { id: string; name: string; w: number; d: number; dx: number; dy: number; bearing: number; floors: number }
export type RoomKind = "classroom" | "lab" | "gym" | "library" | "office" | "cafeteria" | "arts" | "special";
export interface Room { id: string; name: string; building: string; floor: number; kind: RoomKind; capacity: number; teacher?: string }
export type Role = "principal" | "assistant principal" | "teacher" | "aide" | "counselor" | "nurse" | "custodian" | "security" | "office" | "substitute";
export interface Absence { date: string; reason: "sick" | "personal" | "training" | "family"; coveredBy?: string }
export interface Observation { date: string; by: string; rating: 1 | 2 | 3 | 4; note: string }
export interface Staff { id: string; name: string; role: Role; school: string; subject?: string; room?: string; cert?: { name: string; expires: string }; absences: Absence[]; observations: Observation[] }
export interface WorkOrder { id: string; room: string; what: string; opened: string; priority: "urgent" | "high" | "normal"; status: "open" | "in progress" | "done" }
export interface Incident { id: string; date: string; kind: "safety" | "behavior" | "medical" | "facility" | "visitor"; text: string; status: "open" | "closed" }
export type DrillKind = "fire" | "lockdown" | "evacuation" | "shelter";
export interface Drill { kind: DrillKind; date: string }
export interface BusRoute { id: string; name: string; stops: [number, number][]; students: number; onTime: number }
export interface Trip { id: string; teacher: string; title: string; place: { name: string; lon: number; lat: number }; date: string; students: number; status: "requested" | "approved" | "declined" }
export interface Assignment { id: string; teacher: string; group: string; title: string; kind: "lesson" | "quiz" | "game" | "trip"; due: string; done: number }
export interface School {
  id: string; name: string; level: Level; lon: number; lat: number; enrollment: number; capacity: number;
  buildings: Building[]; rooms: Room[];
  /** Attendance, % present, the last ten school days (oldest first). */
  attendance: number[];
  workOrders: WorkOrder[]; incidents: Incident[]; drills: Drill[]; buses: BusRoute[];
  /** Where students live, gathered into blocks: [lon, lat, students]. */
  catchment: [number, number, number][];
  trips: Trip[]; assignments: Assignment[];
  budget: { allocated: number; spent: number };
}
export interface District { id: string; name: string; demo?: boolean; schools: School[]; staff: Staff[] }

/** How often each drill is required: days between drills (a common state pattern: fire monthly, lockdown twice a year). */
export const DRILL_EVERY: Record<DrillKind, number> = { fire: 30, lockdown: 120, evacuation: 180, shelter: 180 };
export const DRILL_LABEL: Record<DrillKind, string> = { fire: "Fire drill", lockdown: "Lockdown drill", evacuation: "Evacuation drill", shelter: "Shelter-in-place drill" };

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const staffOf = (d: District, school: string) => d.staff.filter((s) => s.school === school || (s.role === "substitute" && s.school === "pool"));
export const teachers = (d: District, school: string) => d.staff.filter((s) => s.school === school && s.role === "teacher");

/** Who's out today at a school. */
export const outToday = (d: District, school: string, day: string) => d.staff.filter((s) => s.school === school && s.absences.some((a) => a.date === day));

export interface Cover { absent: Staff; room?: Room; cover?: Staff; reason: Absence["reason"] }
/** Today's cover plan: each absent teacher's class gets the substitute already named, or the next free one (the school's own first, then the district pool), pure. */
export function coverPlan(d: District, s: School, day: string): Cover[] {
  const out = outToday(d, s.id, day).filter((x) => x.role === "teacher" || x.role === "aide");
  const busy = new Set(out.flatMap((x) => x.absences.filter((a) => a.date === day && a.coveredBy).map((a) => a.coveredBy!)));
  const absentIds = new Set(d.staff.filter((x) => x.absences.some((a) => a.date === day)).map((x) => x.id));
  const subs = d.staff.filter((x) => x.role === "substitute" && (x.school === s.id || x.school === "pool") && !absentIds.has(x.id))
    .sort((a, b) => (a.school === s.id ? 0 : 1) - (b.school === s.id ? 0 : 1));
  return out.map((x) => {
    const ab = x.absences.find((a) => a.date === day)!;
    const room = s.rooms.find((r) => r.teacher === x.id);
    let cover = ab.coveredBy ? d.staff.find((y) => y.id === ab.coveredBy) : undefined;
    if (!cover && x.role === "teacher") { cover = subs.find((y) => !busy.has(y.id)); if (cover) busy.add(cover.id); }
    return { absent: x, room, cover, reason: ab.reason };
  });
}

export type RoomState = "ok" | "covered" | "cover" | "repair" | "empty";
export const ROOM_COLOR: Record<RoomState, string> = { ok: "#5b9467", covered: "#4c9ac9", cover: "#c4513a", repair: "#d19a2e", empty: "#8c8f87" };
export const ROOM_LABEL: Record<RoomState, string> = { ok: "Teaching", covered: "Covered by a sub", cover: "Needs cover", repair: "Needs repair", empty: "Not timetabled" };

/** Every room's state today (pure): a class whose teacher is out and uncovered beats a repair, which beats a covered class. */
export function roomStates(d: District, s: School, day: string): Map<string, RoomState> {
  const plan = coverPlan(d, s, day), out = new Map<string, RoomState>();
  for (const r of s.rooms) out.set(r.id, r.teacher || r.kind !== "classroom" ? "ok" : "empty");
  for (const w of s.workOrders) if (w.status !== "done" && w.priority !== "normal") out.set(w.room, "repair");
  for (const c of plan) if (c.room) out.set(c.room.id, c.cover ? (out.get(c.room.id) === "repair" ? "repair" : "covered") : "cover");
  return out;
}
const RANK: RoomState[] = ["cover", "repair", "covered", "ok", "empty"];
/** A floor's state: its worst room (pure). */
export function floorState(s: School, states: Map<string, RoomState>, building: string, floor: number): RoomState {
  const rooms = s.rooms.filter((r) => r.building === building && r.floor === floor);
  if (!rooms.length) return "empty";
  return rooms.map((r) => states.get(r.id) ?? "ok").sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
}

/** Drills: when each was last held and whether it's overdue (pure). */
export function drillStatus(s: School, day: string): { kind: DrillKind; last?: string; days?: number; due: boolean }[] {
  return (Object.keys(DRILL_EVERY) as DrillKind[]).map((kind) => {
    const last = s.drills.filter((x) => x.kind === kind).map((x) => x.date).sort().pop();
    const days = last ? daysBetween(last, day) : undefined;
    return { kind, last, days, due: days === undefined || days > DRILL_EVERY[kind] };
  });
}

/** Certificates expired or expiring within `within` days (pure). */
export const certsDue = (d: District, school: string, day: string, within = 45) =>
  d.staff.filter((x) => x.school === school && x.cert && daysBetween(day, x.cert.expires) <= within).map((x) => ({ s: x, days: daysBetween(day, x.cert!.expires) })).sort((a, b) => a.days - b.days);

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface Flag { level: "now" | "soon" | "fyi"; text: string; go?: "cover" | "rooms" | "safety" | "staff" | "learning" | "students" }
/** What a principal needs to know first, most urgent first (pure). */
export function schoolFlags(d: District, s: School, day: string): Flag[] {
  const f: Flag[] = [];
  const plan = coverPlan(d, s, day), uncovered = plan.filter((c) => !c.cover && c.absent.role === "teacher");
  if (uncovered.length) f.push({ level: "now", text: `${uncovered.length} class${uncovered.length > 1 ? "es" : ""} without cover: ${uncovered.map((c) => c.room?.name ?? c.absent.name).join(", ")}`, go: "cover" });
  const urgent = s.workOrders.filter((w) => w.status !== "done" && w.priority === "urgent");
  if (urgent.length) f.push({ level: "now", text: `${urgent.length} urgent repair${urgent.length > 1 ? "s" : ""}: ${urgent.map((w) => w.what).join("; ")}`, go: "rooms" });
  const open = s.incidents.filter((i) => i.status === "open");
  if (open.length) f.push({ level: open.some((i) => i.kind === "safety" || i.kind === "medical") ? "now" : "soon", text: `${open.length} open incident${open.length > 1 ? "s" : ""}`, go: "safety" });
  for (const dr of drillStatus(s, day).filter((x) => x.due)) f.push({ level: dr.kind === "fire" ? "soon" : "fyi", text: `${DRILL_LABEL[dr.kind]} ${dr.last ? `overdue: last held ${dr.days} days ago` : "not on record this year"}`, go: "safety" });
  for (const c of certsDue(d, s.id, day)) f.push({ level: c.days < 0 ? "now" : "soon", text: `${c.s.name}'s ${c.s.cert!.name} ${c.days < 0 ? `expired ${-c.days} days ago` : `expires in ${c.days} days`}`, go: "staff" });
  const recent = avg(s.attendance.slice(-3)), before = avg(s.attendance.slice(0, -3));
  if (recent < 92) f.push({ level: recent < 88 ? "now" : "soon", text: `Attendance ${recent.toFixed(1)}% over the last three days${before ? ` (was ${before.toFixed(1)}%)` : ""}`, go: "students" });
  if (s.enrollment > s.capacity) f.push({ level: "fyi", text: `Over capacity: ${s.enrollment.toLocaleString()} students for ${s.capacity.toLocaleString()} places`, go: "students" });
  const asked = s.trips.filter((t) => t.status === "requested");
  if (asked.length) f.push({ level: "soon", text: `${asked.length} field trip${asked.length > 1 ? "s" : ""} waiting for your approval`, go: "learning" });
  const late = s.buses.filter((b) => b.onTime < 0.85);
  if (late.length) f.push({ level: "fyi", text: `${late.map((b) => b.name).join(", ")} on time under 85%`, go: "students" });
  return f.sort((a, b) => ["now", "soon", "fyi"].indexOf(a.level) - ["now", "soon", "fyi"].indexOf(b.level));
}

/** Where students come from: share within 1, 2 and 5 km and the median distance (pure). */
export function catchmentStats(s: School): { median: number; within: [number, number][] } {
  const km = (lon: number, lat: number) => Math.hypot((lon - s.lon) * 111.32 * Math.cos((s.lat * Math.PI) / 180), (lat - s.lat) * 110.57);
  const pts = s.catchment.map(([lon, lat, n]) => ({ d: km(lon, lat), n })).sort((a, b) => a.d - b.d);
  const total = pts.reduce((a, p) => a + p.n, 0) || 1;
  let acc = 0, median = 0;
  for (const p of pts) { acc += p.n; if (acc >= total / 2) { median = p.d; break; } }
  const within = [1, 2, 5].map((r) => [r, Math.round((pts.filter((p) => p.d <= r).reduce((a, p) => a + p.n, 0) / total) * 100)] as [number, number]);
  return { median: Math.round(median * 10) / 10, within };
}

/** Learning: each group's assignments and how far through, and quiz averages from Teach's results (pure). */
export function learning(s: School, results: { title: string; score: number; total: number }[] = []) {
  const groups = new Map<string, Assignment[]>();
  for (const a of s.assignments) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  const quizzes = new Map<string, { n: number; pct: number }>();
  for (const r of results) { const q = quizzes.get(r.title) ?? { n: 0, pct: 0 }; q.pct = (q.pct * q.n + (r.score / Math.max(1, r.total)) * 100) / (q.n + 1); q.n++; quizzes.set(r.title, q); }
  return { groups: [...groups].map(([group, list]) => ({ group, list, done: Math.round(avg(list.map((a) => a.done)) * 100) })), quizzes: [...quizzes].map(([title, q]) => ({ title, ...q, pct: Math.round(q.pct) })) };
}

/** The district at a glance (pure). */
export function districtKpis(d: District, day: string) {
  const students = d.schools.reduce((a, s) => a + s.enrollment, 0), places = d.schools.reduce((a, s) => a + s.capacity, 0);
  const tch = d.staff.filter((x) => x.role === "teacher").length;
  const out = d.staff.filter((x) => x.absences.some((a) => a.date === day)).length;
  const uncovered = d.schools.reduce((a, s) => a + coverPlan(d, s, day).filter((c) => !c.cover && c.absent.role === "teacher").length, 0);
  const attendance = avg(d.schools.map((s) => s.attendance[s.attendance.length - 1] ?? 0));
  const budget = d.schools.reduce((a, s) => ({ allocated: a.allocated + s.budget.allocated, spent: a.spent + s.budget.spent }), { allocated: 0, spent: 0 });
  return { students, places, ratio: tch ? Math.round((students / tch) * 10) / 10 : 0, staff: d.staff.length, out, uncovered, attendance: Math.round(attendance * 10) / 10, budget };
}
