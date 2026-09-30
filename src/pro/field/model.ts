// Field Ops: a humanitarian or development programme run on the map. The
// communities it serves (with how many people and what they need), its
// warehouses, clinics, water points and schools, the supply lines that feed
// them, incidents, and deliveries due. Its sharpest question: who is too far
// from a service, and where one more site would reach the most people. Pure
// functions; the screens in ui.ts.
import { kmBetween, type Dated, type Issue, type Move, type Party, type Site } from "../kit/ops";

export type Service = "water" | "health" | "school" | "food";
export const SERVICES: Record<Service, { label: string; site: string; emoji: string; color: string; km: number }> = {
  water: { label: "Water", site: "water", emoji: "💧", color: "#0a84ff", km: 5 },
  health: { label: "Health", site: "clinic", emoji: "🏥", color: "#ff375f", km: 15 },
  school: { label: "School", site: "school", emoji: "🏫", color: "#ff9f0a", km: 10 },
  food: { label: "Food", site: "distribution", emoji: "🌾", color: "#30d158", km: 25 },
};
export const SITE_KINDS = {
  warehouse: { label: "Warehouse", emoji: "📦" }, office: { label: "Field office", emoji: "🏢" }, clinic: { label: "Clinic", emoji: "🏥" },
  water: { label: "Water point", emoji: "💧" }, school: { label: "School", emoji: "🏫" }, distribution: { label: "Distribution point", emoji: "🌾" },
  airstrip: { label: "Airstrip", emoji: "🛬" }, port: { label: "Port", emoji: "⚓" }, supplier: { label: "Supplier", emoji: "🚚" },
};
export const PARTY_KINDS = {
  community: { label: "Community leaders", emoji: "🏘" }, government: { label: "Government", emoji: "🏛" }, partner: { label: "Partner organisation", emoji: "🤝" },
  donor: { label: "Donor", emoji: "💚" }, cluster: { label: "Coordination cluster", emoji: "🧩" }, security: { label: "Security", emoji: "🛡" },
};

export interface Community { id: string; name: string; lon: number; lat: number; people: number; needs: Service[]; notes?: string }
export interface Programme {
  id: string; name: string; sites: Site[]; communities: Community[]; moves: Move[]; parties: Party[];
  incidents: Issue[]; deliveries: Dated[];
  activities?: import("./mne").Activity[]; indicators?: import("./mne").Indicator[]; stock?: import("./mne").Stock[];
  /** How far is too far, km, per service. */
  reach: Record<Service, number>;
  created: number; demo?: boolean;
}

/** Each community's nearest site for a service, and whether it's within reach (pure). */
export function coverage(p: Programme, service: Service) {
  const kind = SERVICES[service].site, max = p.reach[service];
  const sites = p.sites.filter((s) => s.kind === kind);
  return p.communities.map((c) => {
    let best: Site | undefined, km = Infinity;
    for (const s of sites) { const d = kmBetween(c, s); if (d < km) { km = d; best = s; } }
    return { c, site: best, km, covered: km <= max };
  });
}

/** For a service: people within reach, people beyond it, and the gaps, most people first (pure). */
export function gaps(p: Programme, service: Service) {
  const rows = coverage(p, service);
  const out = rows.filter((r) => !r.covered).sort((a, b) => b.c.people - a.c.people);
  return {
    rows,
    reached: rows.filter((r) => r.covered).reduce((s, r) => s + r.c.people, 0),
    missed: out.reduce((s, r) => s + r.c.people, 0),
    out,
  };
}

/**
 * Where one more site would reach the most people who are now too far (pure).
 * Candidates are the communities themselves: a site placed in one reaches
 * every uncovered community within the service's reach of it.
 */
export function bestNextSite(p: Programme, service: Service) {
  const max = p.reach[service];
  const out = gaps(p, service).out.map((r) => r.c);
  let best: { at: Community; reaches: Community[]; people: number } | null = null;
  for (const cand of out) {
    const reaches = out.filter((c) => kmBetween(cand, c) <= max);
    const people = reaches.reduce((s, c) => s + c.people, 0);
    if (!best || people > best.people) best = { at: cand, reaches, people };
  }
  return best;
}

/** Everyone the programme serves, and how many say they need each service (pure). */
export function needsTally(p: Programme) {
  return (Object.keys(SERVICES) as Service[]).map((s) => ({ s, people: p.communities.filter((c) => c.needs.includes(s)).reduce((n, c) => n + c.people, 0) }));
}

export const defaultReach = (): Record<Service, number> => ({ water: SERVICES.water.km, health: SERVICES.health.km, school: SERVICES.school.km, food: SERVICES.food.km });

/** Natural events and quakes near the programme's communities (within `km` of any; pure). */
export function hazardsNear<T extends { lon: number; lat: number }>(items: T[], p: Programme, km = 300) {
  return items.map((x) => ({ x, km: Math.min(...p.communities.map((c) => kmBetween(c, x)), ...p.sites.map((s) => kmBetween(s, x))) })).filter((r) => r.km <= km).sort((a, b) => a.km - b.km);
}

export type { Dated, Issue, Move, Party, Site };
