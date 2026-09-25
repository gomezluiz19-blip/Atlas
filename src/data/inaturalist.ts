// Plants, animals and fungi observed by people, from iNaturalist
// (https://api.inaturalist.org). Research-grade observations only.
import { getJson } from "./http";

const API = "https://api.inaturalist.org/v1";

export interface TaxonGroup {
  id: string;
  label: string;
  /** iNaturalist query parameters selecting the group. */
  query: string;
}

export const PLANT_GROUPS: TaxonGroup[] = [
  { id: "plants", label: "All plants", query: "iconic_taxa=Plantae" },
  { id: "trees", label: "Conifers", query: "taxon_id=136329" },
  { id: "flowers", label: "Flowering plants", query: "taxon_id=47125" },
  { id: "ferns", label: "Ferns", query: "taxon_id=121943" },
  { id: "fungi", label: "Fungi", query: "iconic_taxa=Fungi" },
];

export const ANIMAL_GROUPS: TaxonGroup[] = [
  { id: "animals", label: "All animals", query: "taxon_id=1" },
  { id: "birds", label: "Birds", query: "iconic_taxa=Aves" },
  { id: "mammals", label: "Mammals", query: "iconic_taxa=Mammalia" },
  { id: "reptiles", label: "Reptiles", query: "iconic_taxa=Reptilia" },
  { id: "amphibians", label: "Amphibians", query: "iconic_taxa=Amphibia" },
  { id: "fish", label: "Fish", query: "iconic_taxa=Actinopterygii" },
  { id: "insects", label: "Insects", query: "iconic_taxa=Insecta" },
  { id: "spiders", label: "Spiders & kin", query: "iconic_taxa=Arachnida" },
  { id: "molluscs", label: "Molluscs", query: "iconic_taxa=Mollusca" },
];

export interface Taxon {
  id: number;
  name: string;
  preferred_common_name?: string;
  rank: string;
  iconic_taxon_name?: string;
  default_photo?: { square_url?: string; medium_url?: string; attribution?: string };
  wikipedia_url?: string;
  conservation_status?: { status?: string; status_name?: string; iucn?: number };
  threatened?: boolean;
  endemic?: boolean;
  introduced?: boolean;
  native?: boolean;
}

export interface SpeciesCount {
  count: number;
  taxon: Taxon;
}

export interface Observation {
  id: number;
  lon: number;
  lat: number;
  observed_on?: string;
  taxon?: Taxon;
}

interface Area {
  lon: number;
  lat: number;
  radiusKm: number;
}

const area = (a: Area) => `lat=${a.lat.toFixed(5)}&lng=${a.lon.toFixed(5)}&radius=${a.radiusKm.toFixed(2)}`;

export async function speciesCounts(a: Area, query: string, opts: { threatened?: boolean; perPage?: number } = {}) {
  let url = `${API}/observations/species_counts?${area(a)}&quality_grade=research&per_page=${opts.perPage ?? 60}`;
  if (query) url += `&${query}`;
  if (opts.threatened) url += "&threatened=true";
  const body = await getJson<{ total_results: number; results: SpeciesCount[] }>("iNaturalist", url);
  return { total: body.total_results ?? 0, results: body.results ?? [] };
}

export async function observations(a: Area, taxonId: number, perPage = 200): Promise<Observation[]> {
  const url = `${API}/observations?${area(a)}&taxon_id=${taxonId}&quality_grade=research&geo=true&per_page=${perPage}&order_by=observed_on`;
  const body = await getJson<{ results: { id: number; geojson?: { coordinates: [number, number] }; location?: string; observed_on?: string; taxon?: Taxon }[] }>("iNaturalist", url);
  const out: Observation[] = [];
  for (const r of body.results ?? []) {
    let lon: number | undefined, lat: number | undefined;
    if (r.geojson?.coordinates) [lon, lat] = r.geojson.coordinates;
    else if (r.location) [lat, lon] = r.location.split(",").map(Number);
    if (lon === undefined || lat === undefined || Number.isNaN(lon) || Number.isNaN(lat)) continue;
    out.push({ id: r.id, lon, lat, observed_on: r.observed_on, taxon: r.taxon });
  }
  return out;
}

export function taxonPageUrl(t: Taxon): string {
  return `https://www.inaturalist.org/taxa/${t.id}`;
}

/** GBIF occurrence-density map tiles (all recorded species, or one taxon). */
export const GBIF_DENSITY_TILES =
  "https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?style=purpleYellow.point&srs=EPSG:3857";

/** GBIF density tiles for one kingdom: 6 = plants, 1 = animals. */
export function gbifTiles(taxonKey: number, style = "purpleYellow.point"): string {
  return `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?style=${style}&srs=EPSG:3857&taxonKey=${taxonKey}`;
}
