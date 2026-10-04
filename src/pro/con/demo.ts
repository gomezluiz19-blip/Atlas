// A made-up region to try Construction Pro with: two dozen sites across the
// DMV (DC, suburban Maryland and Northern Virginia) at every stage, from a
// cleared lot to closeout. Every company name here is invented, and so is
// every union status: nothing describes a real firm or a real job.
import { addDays, isoDay, personName, rng } from "../../enterprise/seed";
import type { Kind, Signatory, Site, TradeOnSite, UnionStatus } from "./model";

/** [name, neighbourhood, lon, lat, kind, stories] */
const PLACES: [string, string, number, number, Kind, number][] = [
  ["Navy Yard Tower", "Navy Yard, DC", -77.0007, 38.8752, "mixed-use", 13],
  ["Union Market Block C", "Union Market, DC", -76.9967, 38.9085, "residential", 11],
  ["Wharf Phase 3 Hotel", "Southwest Waterfront, DC", -77.0242, 38.8789, "commercial", 10],
  ["NoMa Lofts", "NoMa, DC", -77.0053, 38.9071, "residential", 12],
  ["Anacostia Library Annex", "Anacostia, DC", -76.9852, 38.8635, "institutional", 3],
  ["Walter Reed Commons", "Brightwood, DC", -77.0291, 38.9752, "residential", 7],
  ["Rhode Island Ave Senior Living", "Brookland, DC", -76.9925, 38.9227, "residential", 6],
  ["Crystal City Office Retrofit", "Crystal City, VA", -77.0510, 38.8566, "commercial", 14],
  ["Columbia Pike Apartments", "Arlington, VA", -77.0864, 38.8620, "residential", 8],
  ["Potomac Yard Campus Hall", "Alexandria, VA", -77.0466, 38.8306, "institutional", 6],
  ["Eisenhower Ave Data Hall", "Alexandria, VA", -77.0782, 38.8034, "industrial", 3],
  ["Tysons Spring Hill Tower", "Tysons, VA", -77.2412, 38.9286, "mixed-use", 16],
  ["Reston Town Square", "Reston, VA", -77.3596, 38.9585, "mixed-use", 9],
  ["Fairfax County Fire Station 46", "Fairfax, VA", -77.3060, 38.8462, "institutional", 2],
  ["Silver Spring Ripley South", "Silver Spring, MD", -77.0301, 38.9917, "residential", 14],
  ["Bethesda Woodmont Place", "Bethesda, MD", -77.0960, 38.9853, "mixed-use", 12],
  ["Rockville Pike Medical Office", "Rockville, MD", -77.1180, 39.0640, "commercial", 6],
  ["College Park Graduate Housing", "College Park, MD", -76.9367, 38.9897, "residential", 7],
  ["Hyattsville Arts District East", "Hyattsville, MD", -76.9440, 38.9567, "residential", 5],
  ["Largo Regional Hospital Wing", "Largo, MD", -76.8327, 38.8975, "institutional", 5],
  ["National Harbor Garage & Retail", "National Harbor, MD", -77.0153, 38.7840, "commercial", 6],
  ["Purple Line Station Plaza", "New Carrollton, MD", -76.8726, 38.9478, "civil", 2],
  ["Bladensburg Road Bridge", "Bladensburg, MD", -76.9384, 38.9380, "civil", 1],
  ["Gaithersburg School Modernization", "Gaithersburg, MD", -77.2014, 39.1434, "institutional", 3],
];

const GCS = ["Potomac Ridge Construction", "Beltway Structures", "Chesapeake Build Group", "Anacostia General Contracting", "Keystone Mid-Atlantic", "Old Line Builders"];
const OWNERS = ["Riverside Development Partners", "Capital Crescent Holdings", "Foggy Bottom Realty", "Tidal Basin Investors", "Rock Creek Housing Trust", "Northgate Properties"];
const PUBLIC_OWNERS: Record<string, string> = { "Anacostia Library Annex": "District public library (demo)", "Fairfax County Fire Station 46": "County capital program (demo)", "Purple Line Station Plaza": "State transit authority (demo)", "Bladensburg Road Bridge": "State highway administration (demo)", "Gaithersburg School Modernization": "County public schools (demo)", "Largo Regional Hospital Wing": "Regional health system (demo)" };
const SUBS: Record<string, string[]> = {
  Bricklayers: ["Rock Creek Masonry", "Old Line Brick & Block", "Patapsco Masonry", "Shenandoah Stone & Brick", "Quick Wall Masonry"],
  Ironworkers: ["Ironbridge Steel Erectors", "Capitol Rebar"],
  Electricians: ["Bright Line Electric", "Monument Electrical"],
  "Concrete / cement masons": ["Mid-Atlantic Concrete Forming", "Seneca Flatwork"],
  Glaziers: ["Capital Curtainwall", "Clearview Glass"],
  "Plumbers & pipefitters": ["Fall Line Mechanical"],
  Carpenters: ["Rappahannock Drywall", "Monocacy Carpentry"],
};
const MASONRY: Record<Kind, Site["masonry"][]> = { residential: ["brick", "brick", "block"], "mixed-use": ["brick", "stone", "block"], commercial: ["block", "stone", "none"], institutional: ["brick", "brick", "stone"], industrial: ["block", "block"], civil: ["none", "stone"] };

export function demoRegion(today = isoDay()): Site[] {
  const r = rng(4417);
  return PLACES.map(([name, hood, lon, lat, kind, stories], i) => {
    const area = kind === "civil" ? 2400 : stories * (kind === "residential" ? 1700 : 2100);
    const value = Math.round((area * (kind === "institutional" ? 5200 : kind === "industrial" ? 6800 : kind === "civil" ? 9000 : 3900)) / 100_000) * 100_000;
    const months = Math.round(10 + stories * 1.6 + r.int(0, 6));
    // Spread the region across the life of a job: some not started, a few nearly done.
    const into = r.next() * 1.25 - 0.12;
    const start = addDays(today, -Math.round(into * months * 30.4));
    const finish = addDays(start, Math.round(months * 30.4));
    const pub = name in PUBLIC_OWNERS;
    const union: UnionStatus = pub ? r.pick(["union", "union", "mixed"] as const) : r.pick(["union", "open shop", "mixed", "unknown", "union"] as const);
    const masonry = r.pick(MASONRY[kind]);
    const sig = (): Signatory => union === "union" ? "yes" : union === "open shop" ? r.pick(["no", "no", "unknown"] as const) : r.pick(["yes", "no", "unknown"] as const);
    const trades: TradeOnSite[] = [];
    for (const [trade, subs] of Object.entries(SUBS)) {
      if (trade === "Bricklayers" && masonry === "none") continue;
      if (r.next() < 0.75) trades.push({ trade, contractor: r.pick(subs), signatory: sig(), workers: r.int(4, Math.max(6, Math.round(stories * 2.2))) });
    }
    const visits = Array.from({ length: r.int(0, 3) }, () => {
      const w = r.int(15, 90);
      return { date: addDays(today, -r.int(4, 120)), by: personName(r), workers: w, members: union === "union" ? Math.round(w * 0.9) : Math.round(w * r.next() * 0.5), notes: r.pick(["Talked to the foreman at the gate", "Masonry sub on site, crew of 8", "Gate closed; came back at lunch", "Handed out flyers on safety rights", "Spoke with two apprentices", "Scaffold looked short of tie-ins: reported"]) };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const safety = r.next() < 0.3 ? [{ date: addDays(today, -r.int(3, 50)), kind: r.pick(["OSHA inspection", "complaint", "incident", "stop-work order"] as const), text: r.pick(["Fall protection on the leading edge", "Silica dust during block cutting", "Crane lift plan questioned", "Missing guardrails on level 4", "Trench without shoring"]) }] : [];
    return {
      id: `dmv${i}`, name, address: `${hood} (demo)`, lon, lat, kind, owner: PUBLIC_OWNERS[name] ?? r.pick(OWNERS), gc: i % 5 === 0 ? GCS[0] : r.pick(GCS.slice(1)), value, stories,
      footprint: { w: kind === "civil" ? 90 : r.int(36, 70), d: kind === "civil" ? 22 : r.int(24, 40), bearing: r.int(-30, 30) },
      start, finish, progress: into > 0.05 && into < 1 && r.next() < 0.5 ? Math.max(0.01, Math.min(0.99, into + (r.next() - 0.6) * 0.12)) : undefined,
      public: pub, union, masonry, trades, visits, safety, mine: i % 5 === 0, source: "demo",
      permit: `Demo permit ${2025 + (i % 2)}-${String(1000 + i * 37)}`,
    } satisfies Site;
  });
}
