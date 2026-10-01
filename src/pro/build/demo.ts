// A demo builder: a made-up general contractor with four sites around Austin,
// Texas: mid-rise flats, a distribution warehouse, a school extension and a
// creek culvert. Progress and spend are set against each baseline so the
// picture has a story: one site behind, one over budget, one on track, one
// just started. The firm, projects, suppliers and people are made up.
import { newId } from "../../work/store";
import { addDays, isoDay, schedule, workdaysBetween, onWorkday, type Firm, type Project, type Task, type Weather } from "./model";

type Row = [id: string, name: string, trade: string, days: number, after: string[], weather: Weather, share: number, crew: number];
const BUILDING: Row[] = [
  ["mob", "Mobilise and set up", "General", 5, [], "none", 0.02, 6],
  ["earth", "Excavation and earthworks", "Civils", 15, ["mob"], "earth", 0.05, 8],
  ["found", "Foundations", "Concrete", 20, ["earth"], "pour", 0.1, 14],
  ["frame", "Structural frame", "Structure", 55, ["found"], "crane", 0.2, 22],
  ["slabs", "Floor slab pours", "Concrete", 30, ["found"], "pour", 0.08, 12],
  ["roof", "Roof", "Roofing", 15, ["frame"], "roof", 0.05, 8],
  ["env", "Envelope and cladding", "Facade", 40, ["frame"], "crane", 0.12, 14],
  ["mep", "Mechanical, electrical, plumbing", "MEP", 50, ["frame", "slabs"], "none", 0.16, 18],
  ["int", "Interiors and fit-out", "Finishes", 55, ["env", "mep", "roof"], "none", 0.13, 26],
  ["paint", "Exterior finishes", "Finishes", 10, ["env"], "paint", 0.02, 6],
  ["ext", "External works and landscape", "Civils", 20, ["env"], "earth", 0.03, 8],
  ["comm", "Testing and commissioning", "MEP", 15, ["int"], "none", 0.03, 8],
  ["hand", "Snagging and handover", "General", 5, ["comm", "ext", "paint"], "none", 0.01, 6],
];
const CULVERT: Row[] = [
  ["mob", "Mobilise and traffic management", "General", 4, [], "none", 0.05, 6],
  ["div", "Creek diversion", "Civils", 8, ["mob"], "earth", 0.12, 8],
  ["demo", "Remove old culvert", "Civils", 6, ["div"], "crane", 0.1, 8],
  ["base", "Base slab pour", "Concrete", 6, ["demo"], "pour", 0.15, 10],
  ["box", "Precast box sections", "Structure", 8, ["base"], "crane", 0.3, 10],
  ["wing", "Wing walls and headwalls", "Concrete", 10, ["box"], "pour", 0.12, 10],
  ["fill", "Backfill and road", "Civils", 10, ["wing"], "earth", 0.12, 8],
  ["open", "Reopen the road", "General", 2, ["fill"], "none", 0.04, 4],
];

function tasks(rows: Row[], value: number, scale = 1): Task[] {
  const budget = value * 0.85; // the rest is margin and preliminaries
  return rows.map(([id, name, trade, days, after, weather, share, crew]) => ({ id, name, trade, days: Math.max(1, Math.round(days * scale)), after, weather, progress: 0, budget: Math.round(budget * share), crew }));
}

/** Sets progress to where the baseline says it should be, times a pace (pure-ish helper for the demo). */
function progressAt(p: Project, today: string, pace: number) {
  const base = schedule(p, p.start), elapsed = Math.max(0, workdaysBetween(onWorkday(p.start), today) + 1);
  for (const s of base.slots) s.task.progress = Math.round(Math.min(1, Math.max(0, ((elapsed * pace) - s.es) / Math.max(1, s.ef - s.es))) * 100) / 100;
}

export function demoFirm(now = Date.now()): Firm {
  const today = isoDay(now), d = (n: number) => addDays(today, n);
  const proj = (name: string, client: string, kind: Project["kind"], lon: number, lat: number, value: number, start: number, finish: number, rows: Row[], scale: number, pace: number, costFactor: number, extra: Partial<Project> = {}): Project => {
    const p: Project = { id: newId(), name: `${name} (demo)`, client: `${client} (demo)`, kind, lon, lat, value, start: d(start), finish: d(finish), cost: 0, tasks: tasks(rows, value, scale), deliveries: [], permits: [], rfis: [], log: [], hours: "07:00–18:00 weekdays", ...extra };
    progressAt(p, today, pace);
    p.cost = Math.round(p.tasks.reduce((s, t) => s + t.budget * t.progress, 0) * costFactor);
    p.log.push({ at: p.start, text: "Site possession" });
    return p;
  };
  const lofts = proj("Eastside Lofts", "Colorado Street Living", "residential", -97.7301, 30.2641, 38_000_000, -170, 215, BUILDING, 1, 0.86, 1.04);
  const dc = proj("Tech Ridge distribution centre", "Longhorn Logistics", "industrial", -97.6612, 30.4187, 22_000_000, -60, 170, BUILDING, 0.7, 1.0, 1.13);
  const school = proj("Hillview school extension", "Austin-area school district", "education", -97.7405, 30.3207, 9_500_000, -95, 120, BUILDING, 0.6, 1.02, 0.98);
  const culvert = proj("Shoal Creek culvert replacement", "City public works", "civil", -97.7521, 30.2832, 4_200_000, -8, 70, CULVERT, 1, 1.0, 1.0);
  const sup = (what: string, supplier: string, lon: number, lat: number, n: number, window: string, trucks: number, crane = false) => ({ id: newId(), what, supplier: `${supplier} (demo)`, lon, lat, date: onWorkday(d(n)), window, trucks, crane, status: "booked" as const });
  lofts.deliveries.push(
    sup("Curtain wall panels, level 4", "Facade fabricator, San Antonio", -98.4936, 29.4241, 2, "07:00–09:00", 3, true),
    sup("Rebar for level 6 slab", "Rebar yard, Round Rock", -97.6789, 30.5083, 2, "07:00–09:00", 2),
    sup("Ready-mix concrete, 120 m³", "Ready-mix plant, Austin", -97.6950, 30.2280, 4, "06:00–10:00", 15),
    sup("Drywall, levels 1–2", "Building supply, Pflugerville", -97.6200, 30.4394, 6, "10:00–12:00", 2),
  );
  dc.deliveries.push(sup("Steel portal frames", "Steel fabricator, Temple", -97.3428, 31.0982, 1, "07:00–10:00", 6, true), sup("Roof sheeting", "Metal building supply, Waco", -97.1467, 31.5493, 5, "08:00–11:00", 3));
  school.deliveries.push(sup("Classroom furniture", "Furniture supplier, Austin", -97.7000, 30.3800, 8, "13:00–15:00", 1));
  culvert.deliveries.push(sup("Precast box culvert sections", "Precast yard, Buda", -97.8403, 30.0852, 7, "07:00–09:00", 8, true));
  const pm = (title: string, kind: "permit" | "inspection", n: number, status: "pending" | "passed" | "issued") => ({ id: newId(), title, kind, date: d(n), status });
  lofts.permits.push(pm("Building permit", "permit", -200, "issued"), pm("Foundation inspection", "inspection", -120, "passed"), pm("Framing inspection, levels 1–3", "inspection", 3, "pending"), pm("Fire sprinkler rough-in inspection", "inspection", -2, "pending"));
  dc.permits.push(pm("Site development permit", "permit", -80, "issued"), pm("Steel erection inspection", "inspection", 6, "pending"));
  school.permits.push(pm("Building permit", "permit", -110, "issued"), pm("Accessibility review", "inspection", 12, "pending"));
  culvert.permits.push(pm("Floodplain and creek works permit", "permit", -20, "issued"), pm("Road closure permit renewal", "permit", 9, "pending"));
  const rfi = (title: string, n: number, cost?: number, days?: number) => ({ id: newId(), title, opened: d(n), status: "open" as const, cost, days });
  lofts.rfis.push(rfi("Balcony drainage detail at level 5 clashes with slab edge", -12, 18_000, 3), rfi("Window head height on grid C", -4));
  dc.rfis.push(rfi("Dock leveller pit depth", -9, 42_000, 5));
  return { id: newId(), name: "Keystone Builders (demo)", demo: true, created: now, projects: [lofts, dc, school, culvert] };
}
