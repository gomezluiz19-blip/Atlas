// How a crowd leaves a venue (pure). Those going by public transport split
// between the nearby stations by how much each can carry and how far it is;
// each station then clears at its own rate. Throughputs are planning rules of
// thumb (people a minute through the gates and onto trains), to be replaced
// with a venue's own figures.
export type StationKind = "rail" | "subway" | "tram" | "bus";
export interface Station { id: string; name: string; kind: StationKind; lon: number; lat: number; km: number; closed?: boolean }
export const THROUGHPUT: Record<StationKind, number> = { rail: 450, subway: 320, tram: 140, bus: 60 };
export const WALK_M_PER_MIN = 75;

export interface Split { s: Station; people: number; perMin: number; walk: number; clear: number }

/** Shares the transit crowd between open stations and works out when each is clear (minutes after the end), pure. */
export function disperse(crowd: number, transitShare: number, stations: Station[], boost = 1): Split[] {
  const open = stations.filter((s) => !s.closed);
  const riders = Math.round(crowd * Math.max(0, Math.min(1, transitShare)));
  const pull = open.map((s) => (THROUGHPUT[s.kind] * boost) / Math.pow(s.km + 0.25, 1.6));
  const total = pull.reduce((a, b) => a + b, 0) || 1;
  return open.map((s, i) => {
    const people = Math.round((riders * pull[i]) / total), perMin = THROUGHPUT[s.kind] * boost, walk = Math.round((s.km * 1000) / WALK_M_PER_MIN);
    return { s, people, perMin, walk, clear: walk + Math.ceil(people / perMin) };
  }).sort((a, b) => b.people - a.people);
}

/** The minute the last rider has left, and the worst station (pure). */
export function clearance(splits: Split[]): { minutes: number; worst?: Split } {
  const worst = splits.reduce<Split | undefined>((a, s) => (!a || s.clear > a.clear ? s : a), undefined);
  return { minutes: worst?.clear ?? 0, worst };
}

/** Classifies an OpenStreetMap stop or station. */
export function kindOf(tags: Record<string, string>): StationKind | null {
  if (tags.station === "subway" || tags.subway === "yes" || tags.railway === "subway_entrance") return "subway";
  if (tags.railway === "station" || tags.railway === "halt" || tags.train === "yes") return "rail";
  if (tags.railway === "tram_stop" || tags.tram === "yes") return "tram";
  if (tags.highway === "bus_stop" || tags.bus === "yes") return "bus";
  return null;
}
