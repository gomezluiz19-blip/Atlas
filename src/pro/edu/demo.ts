// A made-up district to try Education Pro with: three schools around Silver
// Spring, Maryland, with buildings, rooms, staff (some out today), repairs,
// incidents, drills, buses, where students live, field trips and lessons.
import { addDays, isoDay, personName, rng } from "../../enterprise/seed";
import type { Assignment, Building, BusRoute, District, Level, Room, RoomKind, School, Staff, Trip } from "./model";

const SUBJECTS: Record<Level, string[]> = {
  elementary: ["Grade K", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Art", "Music"],
  middle: ["English 6", "Math 6", "Science 7", "Social Studies 7", "English 8", "Math 8", "Spanish", "Art"],
  high: ["English 9", "Algebra I", "Biology", "US History", "Chemistry", "AP Calculus", "Physics", "Spanish III", "Computer Science", "Art"],
};

function school(id: string, name: string, level: Level, lon: number, lat: number, seed: number, today: string, staff: Staff[]): School {
  const r = rng(seed);
  const buildings: Building[] = level === "high"
    ? [{ id: `${id}-main`, name: "Main building", w: 110, d: 38, dx: 0, dy: 0, bearing: 20, floors: 3 }, { id: `${id}-sci`, name: "Science wing", w: 55, d: 28, dx: 75, dy: -45, bearing: 110, floors: 2 }, { id: `${id}-gym`, name: "Gym", w: 48, d: 36, dx: -80, dy: -40, bearing: 20, floors: 1 }]
    : level === "middle"
      ? [{ id: `${id}-main`, name: "Main building", w: 90, d: 32, dx: 0, dy: 0, bearing: -15, floors: 3 }, { id: `${id}-gym`, name: "Gym", w: 40, d: 30, dx: 60, dy: -38, bearing: -15, floors: 1 }]
      : [{ id: `${id}-main`, name: "Main building", w: 75, d: 30, dx: 0, dy: 0, bearing: 5, floors: 2 }, { id: `${id}-annex`, name: "Annex", w: 30, d: 18, dx: -50, dy: 30, bearing: 95, floors: 1 }];
  const rooms: Room[] = [];
  const subjects = SUBJECTS[level];
  let n = 0;
  for (const b of buildings) for (let f = 0; f < b.floors; f++) {
    const kinds: RoomKind[] = b.name === "Gym" ? ["gym"] : b.name === "Science wing" ? ["lab", "lab", "lab", "lab"] : f === 0 ? ["office", "cafeteria", "library", "classroom", "classroom"] : ["classroom", "classroom", "classroom", "classroom", "arts"];
    for (const k of kinds) rooms.push({ id: `${id}-r${++n}`, name: k === "classroom" || k === "lab" ? `Room ${f + 1}${String(n).padStart(2, "0")}` : k[0].toUpperCase() + k.slice(1), building: b.id, floor: f, kind: k, capacity: k === "gym" ? 200 : k === "cafeteria" ? 260 : 28 });
  }
  // Staff: a teacher per teaching room, then the people who run the place.
  const teachRooms = rooms.filter((x) => x.kind === "classroom" || x.kind === "lab" || x.kind === "arts");
  teachRooms.forEach((room, i) => {
    const t: Staff = { id: `${id}-t${i}`, name: personName(r), role: "teacher", school: id, subject: subjects[i % subjects.length], room: room.id,
      cert: { name: "Teaching certificate", expires: addDays(today, r.int(-10, 900)) }, absences: [], observations: r.next() < 0.6 ? [{ date: addDays(today, -r.int(5, 90)), by: "Principal", rating: (r.int(2, 4) as 2 | 3 | 4), note: r.pick(["Strong questioning", "Pacing could tighten", "Great use of small groups", "Clear objectives"]) }] : [] };
    room.teacher = t.id;
    staff.push(t);
  });
  for (const [role, count] of [["principal", 1], ["assistant principal", level === "high" ? 2 : 1], ["counselor", level === "elementary" ? 1 : 2], ["nurse", 1], ["custodian", 2], ["security", level === "high" ? 2 : 1], ["office", 2], ["aide", level === "elementary" ? 3 : 1], ["substitute", 1]] as const)
    for (let i = 0; i < count; i++) staff.push({ id: `${id}-${role.replace(/ /g, "")}${i}`, name: personName(r), role, school: id, absences: [], observations: [],
      cert: role === "nurse" ? { name: "Nursing licence", expires: addDays(today, r.int(20, 400)) } : role === "security" ? { name: "First aid / CPR", expires: addDays(today, r.int(-5, 300)) } : undefined });
  // Today: a few out, one already covered.
  const tch = staff.filter((x) => x.school === id && x.role === "teacher");
  const out = tch.filter(() => r.next() < 0.14).slice(0, level === "high" ? 4 : 2);
  if (!out.length) out.push(tch[0]);
  out.forEach((x) => x.absences.push({ date: today, reason: r.pick(["sick", "sick", "personal", "training", "family"] as const) }));
  for (const x of tch) for (let k = 0; k < 3; k++) if (r.next() < 0.12) x.absences.push({ date: addDays(today, -r.int(1, 40)), reason: "sick" });
  const kms = level === "high" ? 4.5 : level === "middle" ? 3 : 1.8;
  const catchment: [number, number, number][] = Array.from({ length: 70 }, () => { const [x, y] = r.near(lon, lat, kms); return [x, y, r.int(2, 18)]; });
  // About 22–26 students a class, spread over the catchment's blocks.
  const enrollment = teachRooms.length * r.int(22, 26) * (level === "high" ? 1.15 : 1);
  const perBlock = enrollment / catchment.reduce((a, c) => a + c[2], 0);
  for (const c of catchment) c[2] = Math.max(1, Math.round(c[2] * perBlock));
  const buses: BusRoute[] = Array.from({ length: level === "elementary" ? 2 : 3 }, (_, i) => {
    const start = r.near(lon, lat, kms * 0.9);
    const stops: [number, number][] = [start];
    for (let k = 1; k < 6; k++) { const f = k / 6; stops.push([start[0] + (lon - start[0]) * f + (r.next() - 0.5) * 0.008, start[1] + (lat - start[1]) * f + (r.next() - 0.5) * 0.008]); }
    stops.push([lon, lat]);
    return { id: `${id}-bus${i}`, name: `Bus ${i + 1}${String.fromCharCode(65 + i)}`, stops, students: r.int(28, 62), onTime: Math.round((0.78 + r.next() * 0.2) * 100) / 100 };
  });
  const teacherOf = (i: number) => tch[i % tch.length].id;
  const trips: Trip[] = [
    { id: `${id}-trip1`, teacher: teacherOf(1), title: level === "high" ? "Biology at the Natural History Museum" : "Dinosaurs at the Natural History Museum", place: { name: "Smithsonian National Museum of Natural History", lon: -77.026, lat: 38.8913 }, date: addDays(today, 12), students: 54, status: "requested" },
    { id: `${id}-trip2`, teacher: teacherOf(3), title: "Animals and habitats", place: { name: "Smithsonian's National Zoo", lon: -77.0498, lat: 38.9296 }, date: addDays(today, 26), students: 48, status: level === "elementary" ? "requested" : "approved" },
  ];
  const assignments: Assignment[] = tch.slice(0, 6).flatMap((t, i) => [
    { id: `${t.id}-a1`, teacher: t.id, group: t.subject ?? "Class", title: ["Continents and oceans", "Volcanoes and earthquakes", "Ancient civilisations", "Rivers and the water cycle"][i % 4], kind: "lesson" as const, due: addDays(today, r.int(-3, 10)), done: Math.round(r.next() * 100) / 100 },
    { id: `${t.id}-a2`, teacher: t.id, group: t.subject ?? "Class", title: r.pick(["Capitals quiz", "Plate tectonics check-in", "Map skills quiz"]), kind: "quiz" as const, due: addDays(today, r.int(1, 14)), done: Math.round(r.next() * 70) / 100 },
  ]);
  const roomIds = rooms.map((x) => x.id);
  return {
    id, name, level, lon, lat, enrollment, capacity: Math.round(enrollment * (0.92 + r.next() * 0.2)), buildings, rooms,
    attendance: Array.from({ length: 10 }, (_, i) => Math.round((95.5 - r.next() * 3 - (i > 6 && level === "high" ? 3 : 0)) * 10) / 10),
    workOrders: [
      { id: `${id}-w1`, room: r.pick(roomIds), what: r.pick(["No heat in the room", "Ceiling leak over the windows", "Smartboard not working", "Broken window latch"]), opened: addDays(today, -r.int(1, 6)), priority: "urgent", status: "open" },
      { id: `${id}-w2`, room: r.pick(roomIds), what: r.pick(["Flickering lights", "Door closer broken", "Water fountain out", "Projector bulb"]), opened: addDays(today, -r.int(3, 20)), priority: "high", status: "in progress" },
      { id: `${id}-w3`, room: r.pick(roomIds), what: "Repaint corridor", opened: addDays(today, -r.int(10, 40)), priority: "normal", status: "open" },
    ],
    incidents: [
      { id: `${id}-i1`, date: today, kind: level === "elementary" ? "medical" : "behavior", text: level === "elementary" ? "Student fell at recess; nurse assessed, parent called" : "Altercation in the cafeteria; two students with the AP", status: "open" },
      { id: `${id}-i2`, date: addDays(today, -4), kind: "visitor", text: "Unsigned visitor at the side door; escorted to the office", status: "closed" },
    ],
    drills: [{ kind: "fire", date: addDays(today, -r.int(12, 44)) }, { kind: "lockdown", date: addDays(today, -r.int(40, 150)) }, { kind: "evacuation", date: addDays(today, -r.int(60, 200)) }],
    buses, catchment, trips, assignments,
    budget: { allocated: level === "high" ? 2_400_000 : level === "middle" ? 1_500_000 : 900_000, spent: 0 },
  };
}

export function demoDistrict(today = isoDay()): District {
  const staff: Staff[] = [];
  const schools = [
    school("rbe", "Riverbend Elementary", "elementary", -77.0265, 39.0003, 11, today, staff),
    school("ovm", "Oakview Middle", "middle", -77.0102, 39.0167, 23, today, staff),
    school("rbh", "Riverbend High", "high", -77.0385, 39.0201, 37, today, staff),
  ];
  for (const s of schools) s.budget.spent = Math.round(s.budget.allocated * (0.48 + (s.id.length % 3) * 0.08));
  // The district's substitute pool.
  const r = rng(99);
  for (let i = 0; i < 2; i++) staff.push({ id: `pool-sub${i}`, name: personName(r), role: "substitute", school: "pool", absences: [], observations: [] });
  return { id: "demo", name: "Riverbend Public Schools (demo)", demo: true, schools, staff };
}
