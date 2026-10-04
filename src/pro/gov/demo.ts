// A made-up New York City to try City Ops with: eleven agencies, about 150
// facilities placed near real neighbourhood centres (but not at real
// addresses), capital projects, incidents, a day of 311 requests and open
// bids. Budgets and headcounts are illustrative round numbers, not official
// figures, and every name of a person here is invented.
import { addDays, isoDay, personName, rng } from "../../enterprise/seed";
import type { Agency, Bid, City, Facility, FacilityKind, Incident, Project, Request311 } from "./model";

/** [neighbourhood, borough, lon, lat] */
const HOODS: [string, string, number, number][] = [
  ["Lower Manhattan", "Manhattan", -74.009, 40.7075], ["Chinatown", "Manhattan", -73.997, 40.7158], ["East Village", "Manhattan", -73.984, 40.7265], ["Chelsea", "Manhattan", -74.001, 40.7465],
  ["Midtown", "Manhattan", -73.9845, 40.7549], ["Upper West Side", "Manhattan", -73.975, 40.787], ["Upper East Side", "Manhattan", -73.959, 40.7736], ["Harlem", "Manhattan", -73.9465, 40.8116],
  ["Washington Heights", "Manhattan", -73.9396, 40.8417], ["Inwood", "Manhattan", -73.9214, 40.8677],
  ["Downtown Brooklyn", "Brooklyn", -73.9874, 40.6928], ["Williamsburg", "Brooklyn", -73.9571, 40.7081], ["Bushwick", "Brooklyn", -73.9213, 40.6944], ["Bedford-Stuyvesant", "Brooklyn", -73.9442, 40.6872],
  ["Park Slope", "Brooklyn", -73.9786, 40.671], ["Crown Heights", "Brooklyn", -73.9442, 40.6694], ["Flatbush", "Brooklyn", -73.959, 40.6409], ["Sunset Park", "Brooklyn", -74.0103, 40.6455],
  ["Bay Ridge", "Brooklyn", -74.0287, 40.626], ["Brownsville", "Brooklyn", -73.9086, 40.663], ["East New York", "Brooklyn", -73.8822, 40.6667], ["Coney Island", "Brooklyn", -73.986, 40.5755], ["Canarsie", "Brooklyn", -73.902, 40.64],
  ["Long Island City", "Queens", -73.9485, 40.7447], ["Astoria", "Queens", -73.923, 40.7644], ["Jackson Heights", "Queens", -73.883, 40.7557], ["Flushing", "Queens", -73.8303, 40.758],
  ["Jamaica", "Queens", -73.7949, 40.7027], ["Forest Hills", "Queens", -73.8448, 40.7181], ["Ridgewood", "Queens", -73.9057, 40.7044], ["Far Rockaway", "Queens", -73.7555, 40.6054], ["Elmhurst", "Queens", -73.878, 40.7365],
  ["Mott Haven", "Bronx", -73.9235, 40.809], ["Hunts Point", "Bronx", -73.8803, 40.8094], ["Fordham", "Bronx", -73.8981, 40.8615], ["Riverdale", "Bronx", -73.912, 40.8999],
  ["Parkchester", "Bronx", -73.8605, 40.8382], ["Co-op City", "Bronx", -73.829, 40.874], ["Morrisania", "Bronx", -73.9073, 40.8295],
  ["St. George", "Staten Island", -74.0776, 40.6437], ["New Dorp", "Staten Island", -74.1104, 40.5713], ["Tottenville", "Staten Island", -74.24, 40.51], ["Port Richmond", "Staten Island", -74.13, 40.634],
];

const AGENCIES: Omit<Agency, "head">[] = [
  { id: "fdny", name: "Fire Department", short: "FDNY", color: "#ff453a", emoji: "🚒", budget: 2_600_000_000, headcount: 17_000, vacancies: 700, overtime: 0.16 },
  { id: "nypd", name: "Police Department", short: "NYPD", color: "#0a84ff", emoji: "🚓", budget: 6_000_000_000, headcount: 49_000, vacancies: 3_400, overtime: 0.18 },
  { id: "doe", name: "Department of Education", short: "DOE", color: "#5e5ce6", emoji: "🏫", budget: 33_000_000_000, headcount: 140_000, vacancies: 7_000, overtime: 0.02 },
  { id: "hh", name: "Health + Hospitals", short: "H+H", color: "#30d158", emoji: "🏥", budget: 2_500_000_000, headcount: 43_000, vacancies: 3_900, overtime: 0.09 },
  { id: "lib", name: "Public Libraries", short: "Libraries", color: "#ff9f0a", emoji: "📚", budget: 450_000_000, headcount: 4_500, vacancies: 270, overtime: 0.01 },
  { id: "dsny", name: "Sanitation", short: "DSNY", color: "#a2845e", emoji: "🗑️", budget: 2_000_000_000, headcount: 10_000, vacancies: 400, overtime: 0.12 },
  { id: "parks", name: "Parks & Recreation", short: "Parks", color: "#66d17a", emoji: "🌳", budget: 650_000_000, headcount: 7_500, vacancies: 750, overtime: 0.04 },
  { id: "dhs", name: "Homeless Services", short: "DHS", color: "#bf5af2", emoji: "🏠", budget: 3_900_000_000, headcount: 2_000, vacancies: 240, overtime: 0.07 },
  { id: "dep", name: "Environmental Protection", short: "DEP", color: "#64d2ff", emoji: "💧", budget: 1_600_000_000, headcount: 6_000, vacancies: 540, overtime: 0.08 },
  { id: "dot", name: "Transportation", short: "DOT", color: "#ffcc00", emoji: "🚦", budget: 1_400_000_000, headcount: 5_700, vacancies: 630, overtime: 0.1 },
  { id: "dcas", name: "Citywide Administrative Services", short: "DCAS", color: "#8e8e93", emoji: "🏛️", budget: 600_000_000, headcount: 2_300, vacancies: 300, overtime: 0.03 },
];

/** Per kind: agency, [floors, w, d], staff range. */
const KIND: Record<Exclude<FacilityKind, "other">, [string, [number, number, number], [number, number]]> = {
  firehouse: ["fdny", [2, 16, 30], [24, 60]], precinct: ["nypd", [3, 32, 26], [150, 320]], school: ["doe", [4, 72, 34], [60, 160]], hospital: ["hh", [11, 90, 52], [1800, 4200]],
  library: ["lib", [2, 32, 24], [10, 30]], garage: ["dsny", [2, 96, 42], [120, 260]], park: ["parks", [1, 52, 40], [12, 40]], shelter: ["dhs", [6, 30, 24], [20, 60]],
  plant: ["dep", [2, 170, 90], [80, 220]], yard: ["dot", [1, 120, 60], [60, 140]], office: ["dcas", [24, 54, 40], [600, 1800]],
};
const PLANTS: [string, number, number][] = [["Newtown Creek treatment plant", -73.944, 40.735], ["Wards Island treatment plant", -73.925, 40.788], ["Hunts Point treatment plant", -73.88, 40.8], ["Owls Head treatment plant", -74.033, 40.642]];

export function demoCity(today = isoDay(), now = Date.now()): City {
  const r = rng(212);
  const agencies: Agency[] = AGENCIES.map((a) => ({ ...a, head: `${personName(r)} (demo)` }));
  const facilities: Facility[] = [];
  const add = (kind: Exclude<FacilityKind, "other">, name: string, lon: number, lat: number, borough: string, jitter = 0.5) => {
    const [agency, [floors, w, d], [s0, s1]] = KIND[kind];
    const [x, y] = jitter ? r.near(lon, lat, jitter) : [lon, lat];
    const authorized = r.int(s0, s1), condition = r.pick([1, 2, 3, 3, 4, 4, 4, 5, 5]);
    const status = r.next() < 0.04 ? "closed" : r.next() < 0.06 ? "partial" : "open";
    facilities.push({ id: `${kind}${facilities.length}`, agency, name, kind, lon: x, lat: y, borough, floors: Math.max(1, floors + r.int(-1, 1)), w, d, bearing: 29, condition, built: r.int(1905, 2018),
      staff: Math.round(authorized * (0.72 + r.next() * 0.3)), authorized, workOrders: Math.round((6 - condition) * r.int(1, 5)), status,
      note: status === "closed" ? r.pick(["Boiler replacement", "Roof repair", "Asbestos abatement"]) : status === "partial" ? r.pick(["One floor closed for repairs", "Elevator out", "Reduced hours: staffing"]) : undefined, lead: personName(r), source: "demo" });
  };
  HOODS.forEach(([hood, boro, lon, lat], i) => {
    add("firehouse", `Engine ${10 + i * 7} · ${hood}`, lon, lat, boro);
    if (i % 3 !== 2) add("firehouse", `Ladder ${3 + i * 5} · ${hood}`, lon, lat, boro, 1.2);
    if (i % 2 === 0) add("precinct", `${hood} precinct`, lon, lat, boro);
    add("school", `${hood} elementary`, lon, lat, boro, 0.8);
    if (i % 2 === 1) add("school", `${hood} high school`, lon, lat, boro, 0.9);
    if (i % 3 === 0) add("library", `${hood} library`, lon, lat, boro, 0.4);
    if (i % 4 === 1) add("park", `${hood} recreation center`, lon, lat, boro, 0.7);
    if (i % 7 === 3) add("hospital", `${hood} hospital (demo)`, lon, lat, boro, 0.6);
    if (i % 6 === 2) add("shelter", `${hood} family shelter`, lon, lat, boro, 0.6);
    if (i % 8 === 0) add("garage", `${boro} district garage ${i}`, lon, lat, boro, 0.9);
  });
  for (const [name, lon, lat] of PLANTS) add("plant", name, lon, lat, "", 0);
  add("yard", "Queens street maintenance yard", -73.912, 40.735, "Queens", 0); add("yard", "Brooklyn paving yard", -73.995, 40.664, "Brooklyn", 0); add("yard", "Bronx sign shop", -73.888, 40.82, "Bronx", 0);
  add("office", "Civic office tower", -74.004, 40.7128, "Manhattan", 0); add("office", "Brooklyn civic center", -73.99, 40.6935, "Brooklyn", 0); add("office", "Queens civic center", -73.807, 40.705, "Queens", 0);

  const P = (id: string, agency: string, name: string, hood: number, kind: Project["kind"], budget: number, startDays: number, months: number, lag: number, overBurn: number, floors: number, w: number, d: number): Project => {
    const [, boro, lon, lat] = HOODS[hood];
    const [x, y] = r.near(lon, lat, 0.4);
    const start = addDays(today, -startDays), finish = addDays(start, Math.round(months * 30.4));
    const planned = Math.max(0, Math.min(1, startDays / (months * 30.4)));
    const progress = Math.max(0, Math.min(1, planned + lag));
    return { id, agency, name, lon: x, lat: y, borough: boro, budget, spent: Math.round(budget * progress * overBurn), start, finish, progress, floors, w, d, kind };
  };
  const projects: Project[] = [
    P("p1", "fdny", "New firehouse, Far Rockaway", 30, "building", 48_000_000, 300, 26, -0.12, 1.08, 3, 24, 34),
    P("p2", "lib", "Library renovation, Jamaica", 27, "building", 32_000_000, 420, 22, 0.02, 1.0, 3, 40, 30),
    P("p3", "doe", "School addition, Flushing", 26, "building", 96_000_000, 200, 30, -0.03, 1.02, 5, 70, 30),
    P("p4", "hh", "Ambulatory care pavilion, Harlem", 7, "building", 210_000_000, 520, 40, -0.15, 1.14, 9, 60, 44),
    P("p5", "dep", "Coastal resiliency berm, Lower Manhattan", 0, "water", 380_000_000, 640, 48, -0.06, 1.05, 1, 300, 30),
    P("p6", "dot", "Street reconstruction, Fordham Road", 34, "street", 64_000_000, 150, 20, 0.01, 0.98, 1, 400, 18),
    P("p7", "parks", "Park and pool rebuild, Brownsville", 19, "park", 27_000_000, 90, 18, 0.0, 1.0, 1, 120, 80),
    P("p8", "dsny", "District garage, Sunset Park", 17, "building", 140_000_000, 380, 34, -0.08, 1.11, 4, 110, 50),
    P("p9", "dot", "Bridge deck rehabilitation, Mott Haven", 32, "bridge", 120_000_000, 700, 36, 0.04, 1.01, 1, 260, 22),
    P("p10", "dhs", "Supportive housing conversion, Bushwick", 12, "building", 75_000_000, 60, 24, 0.0, 1.0, 8, 34, 26),
  ];

  const at = (i: number) => r.near(HOODS[i][2], HOODS[i][3], 0.5);
  const inc = (id: string, kind: Incident["kind"], hood: number, minsAgo: number, severity: 1 | 2 | 3, agencies: string[], text: string): Incident => { const [lon, lat] = at(hood); return { id, kind, lon, lat, time: new Date(now - minsAgo * 60_000).toISOString(), severity, agencies, text, status: "active" }; };
  const incidents: Incident[] = [
    inc("i1", "fire", 13, 38, 3, ["FDNY", "NYPD", "Red Cross"], "Two-alarm fire in a six-storey residential building, Bedford-Stuyvesant: 12 families displaced"),
    inc("i2", "water main", 4, 95, 2, ["DEP", "DOT", "Con Ed"], "20-inch water main break, Midtown: two avenues closed, low pressure in 30 buildings"),
    inc("i3", "power", 24, 140, 2, ["Con Ed", "NYCEM"], "Power outage, Astoria: about 1,900 customers, cooling centre opened"),
    inc("i4", "collision", 16, 22, 1, ["NYPD", "FDNY EMS"], "Bus and car collision, Flatbush: three minor injuries"),
    inc("i5", "flooding", 21, 60, 2, ["DEP", "DSNY", "NYCEM"], "Street flooding after a cloudburst, Coney Island: catch basins being cleared"),
    inc("i6", "building", 38, 180, 2, ["DOB", "FDNY"], "Partial facade collapse, Morrisania: sidewalk shed ordered, block vacated"),
  ];

  const TYPES: [string, string, number, number][] = [
    // type, agency, weight, night-heavy (0..1)
    ["Noise - Residential", "NYPD", 16, 0.8], ["Illegal Parking", "NYPD", 14, 0.3], ["HEAT/HOT WATER", "HPD", 11, 0.4], ["Blocked Driveway", "NYPD", 8, 0.3], ["Street Condition", "DOT", 6, 0.1],
    ["Dirty Condition", "DSNY", 5, 0.2], ["Water System", "DEP", 4, 0.2], ["Noise - Street/Sidewalk", "NYPD", 5, 0.9], ["Rodent", "DOHMH", 3, 0.2], ["Damaged Tree", "DPR", 3, 0.1],
    ["Missed Collection", "DSNY", 3, 0.1], ["Street Light Condition", "DOT", 3, 0.7], ["Abandoned Vehicle", "NYPD", 2, 0.2], ["Sewer", "DEP", 2, 0.2], ["Homeless Person Assistance", "DHS", 2, 0.5],
  ];
  const total = TYPES.reduce((s, t) => s + t[2], 0);
  const requests: Request311[] = [];
  for (let i = 0; i < 1600; i++) {
    let w = r.next() * total, t = TYPES[0];
    for (const x of TYPES) { w -= x[2]; if (w <= 0) { t = x; break; } }
    // When: noise and lights mostly at night (9pm to 3am), the rest through the day.
    const nowH = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    const hod = r.next() < t[3] ? (21 + r.next() * 6) % 24 : 7 + r.next() * 14;
    const hoursAgo = ((nowH - hod) % 24 + 24) % 24;
    const h = HOODS[Math.floor(Math.pow(r.next(), 1.3) * HOODS.length)];
    const [lon, lat] = r.near(h[2], h[3], 1.4);
    const created = new Date(now - hoursAgo * 3_600_000).toISOString();
    requests.push({ id: `r${i}`, type: t[0], agency: t[1], lon, lat, created, status: r.next() < 0.55 ? "open" : "closed", borough: h[1] });
  }

  const bids: Bid[] = [
    { id: "b1", agency: "fdny", title: "Firehouse apparatus floor replacement, 6 sites", value: 8_400_000, due: addDays(today, 3), status: "open", bidders: 4 },
    { id: "b2", agency: "dot", title: "Resurfacing, Bronx contract 14", value: 22_000_000, due: addDays(today, 6), status: "open", bidders: 7 },
    { id: "b3", agency: "dep", title: "Green infrastructure: 240 rain gardens, Queens", value: 31_000_000, due: addDays(today, 19), status: "open", bidders: 3 },
    { id: "b4", agency: "hh", title: "Ambulatory pavilion curtain wall", value: 26_000_000, due: addDays(today, -4), status: "evaluating", project: "p4", bidders: 5 },
    { id: "b5", agency: "lib", title: "Branch HVAC upgrades, 9 libraries", value: 12_500_000, due: addDays(today, 26), status: "open", bidders: 2 },
    { id: "b6", agency: "dsny", title: "Electric collection trucks, 60 units", value: 39_000_000, due: addDays(today, 12), status: "open", bidders: 3 },
    { id: "b7", agency: "parks", title: "Pool and bathhouse, Brownsville", value: 19_000_000, due: addDays(today, -30), status: "awarded", project: "p7", bidders: 6 },
    { id: "b8", agency: "dcas", title: "Solar on 40 city roofs", value: 17_500_000, due: addDays(today, 5), status: "open", bidders: 5 },
  ];
  return { id: "nyc-demo", name: "New York City (demo)", lon: -73.94, lat: 40.71, agencies, facilities, projects, incidents, requests, bids, demo: true };
}
