// Field trips: distance and bus times, how many adults and buses, the cost per
// student, and the day's timetable.
import { metres } from "./geo";
import type { Journey, Timeline } from "./journeyModel";

export interface Stop { name: string; lon: number; lat: number }

export interface FieldTrip {
  id: string;
  title: string;
  school: Stop | null;
  dest: Stop | null;
  date: string;
  /** Leave school, HH:MM. */
  depart: string;
  /** Hours at the destination. */
  hours: number;
  students: number;
  grade: string;
  /** Students per adult. */
  ratio: number;
  seats: number;
  /** Bus hire per km (both ways are counted). */
  busPerKm: number;
  /** Entry fee per student. */
  fee: number;
  notes: string;
  checklist: { text: string; done: boolean }[];
  /** The day step by step (bus there, stops, walks, bus back). */
  journey?: Journey;
}

/** The day as steps, from an older trip that only had a school and a destination. */
export function tripJourney(t: FieldTrip): Journey {
  if (t.journey) return t.journey;
  const id = () => Math.random().toString(36).slice(2, 10);
  return {
    id: t.id, name: t.title, start: t.date, time: t.depart, origin: t.school, created: 0,
    steps: t.school && t.dest ? [
      { id: id(), kind: "move", mode: "bus", to: t.dest },
      { id: id(), kind: "stay", place: t.dest, hours: t.hours, visits: [] },
      { id: id(), kind: "move", mode: "bus", to: t.school },
    ] : [],
  };
}

/** Adults, buses and cost for the day, from its steps: bus hire counts every bus leg. */
export function groupNumbers(t: FieldTrip, tl: Timeline) {
  const busKm = tl.byMode.bus?.km ?? 0;
  const adults = Math.max(1, Math.ceil(t.students / Math.max(1, t.ratio)));
  const people = t.students + adults;
  const buses = busKm ? Math.max(1, Math.ceil(people / Math.max(1, t.seats))) : 0;
  const busCost = buses * busKm * t.busPerKm;
  const total = busCost + t.fee * t.students;
  const minutes = tl.end - tl.start;
  return { busKm, adults, buses, busCost, total, perStudent: t.students ? total / t.students : 0, leave: hhmm(tl.start), back: hhmm(tl.end), long: minutes > 10 * 60 };
}

/** Typical students per adult by grade band; schools and venues set their own rules. */
export const GRADES: { id: string; label: string; ratio: number }[] = [
  { id: "pre", label: "Preschool", ratio: 4 },
  { id: "k2", label: "Kindergarten to grade 2", ratio: 6 },
  { id: "35", label: "Grades 3 to 5", ratio: 8 },
  { id: "68", label: "Grades 6 to 8", ratio: 10 },
  { id: "912", label: "Grades 9 to 12", ratio: 12 },
];

export const CHECKLIST = [
  "Book the venue and confirm group rate", "Book buses", "Risk assessment approved", "Permission slips sent",
  "Permission slips returned", "Medical forms and allergies collected", "First-aid kit and medicines packed",
  "Emergency contacts list printed", "Packed lunches or lunch plan", "Name badges and groups assigned",
];

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const hhmm = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(Math.round(((min % 60) + 60) % 60)).padStart(2, "0")}`;

export function tripNumbers(t: FieldTrip) {
  const straight = t.school && t.dest ? metres([t.school.lon, t.school.lat], [t.dest.lon, t.dest.lat]) / 1000 : 0;
  // Roads wind: about 1.3× the straight line; buses average ~45 km/h door to door, plus loading.
  const km = straight * 1.3;
  const busMin = Math.round((km / 45) * 60 + 15);
  const adults = Math.max(1, Math.ceil(t.students / Math.max(1, t.ratio)));
  const people = t.students + adults;
  const buses = Math.max(1, Math.ceil(people / Math.max(1, t.seats)));
  const busCost = buses * km * 2 * t.busPerKm;
  const total = busCost + t.fee * t.students;
  const leave = toMin(t.depart), arrive = leave + busMin, leaveVenue = arrive + t.hours * 60, back = leaveVenue + busMin;
  return { straight, km, busMin, adults, buses, busCost, total, perStudent: t.students ? total / t.students : 0, times: { leave: hhmm(leave), arrive: hhmm(arrive), leaveVenue: hhmm(leaveVenue), back: hhmm(back) }, long: back - leave > 10 * 60 };
}
