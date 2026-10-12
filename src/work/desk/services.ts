// The services a piece of work may need, found around where it is: lawyers and notaries near a client, the court
// for a hearing, customs brokers and freight forwarders at a port, a courier, a parts counter. From OpenStreetMap
// (ODbL, © OpenStreetMap contributors).
import { overpass } from "../../data/overpass";
import type { Service } from "./model";

export const SERVICES: Record<Service, { label: string; tags: string[] }> = {
  legal: { label: "Lawyers", tags: ['["office"="lawyer"]'] },
  notary: { label: "Notaries", tags: ['["office"="notary"]'] },
  court: { label: "Courts and registries", tags: ['["amenity"="courthouse"]', '["office"="government"]["government"~"register|registry|land_registry|record"]'] },
  customs: { label: "Customs", tags: ['["office"="customs"]', '["amenity"="customs"]', '["government"="customs"]'] },
  freight: { label: "Freight and logistics", tags: ['["office"="logistics"]', '["industrial"="logistics"]', '["office"="moving_company"]'] },
  courier: { label: "Couriers and post", tags: ['["amenity"="post_office"]', '["office"="courier"]', '["amenity"="parcel_locker"]'] },
  accounting: { label: "Accountants", tags: ['["office"="accountant"]', '["office"="tax_advisor"]'] },
  insurance: { label: "Insurance", tags: ['["office"="insurance"]'] },
  medical: { label: "Clinics and hospitals", tags: ['["amenity"="clinic"]', '["amenity"="hospital"]', '["amenity"="doctors"]'] },
  hotel: { label: "Places to stay", tags: ['["tourism"="hotel"]', '["tourism"="guest_house"]'] },
  parts: { label: "Parts and trade counters", tags: ['["shop"="trade"]', '["shop"="hardware"]', '["shop"="doityourself"]'] },
};

export interface Found { name: string; lon: number; lat: number; km: number; phone?: string; web?: string; address?: string }

const kmBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2));
};

/** The nearest places offering a service around a spot, nearest first (named ones only, at most 12). */
export async function servicesNear(service: Service, at: { lon: number; lat: number }, radiusM = 5000): Promise<Found[]> {
  const a = `${at.lat.toFixed(4)},${at.lon.toFixed(4)}`;
  const q = `[out:json][timeout:25];(${SERVICES[service].tags.map((t) => `nwr${t}(around:${radiusM},${a});`).join("")});out center tags 60;`;
  const els = await overpass(q);
  const out: Found[] = [];
  for (const el of els) {
    const t = el.tags ?? {}, p = el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : el.center;
    if (!p || !t.name) continue;
    const address = [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ");
    out.push({ name: t.name, lon: p.lon, lat: p.lat, km: kmBetween(at, p), phone: t.phone ?? t["contact:phone"], web: t.website ?? t["contact:website"], address: address || undefined });
  }
  return out.sort((x, y) => x.km - y.km).slice(0, 12);
}
