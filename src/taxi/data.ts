// Where the taxis come from: ranks and companies in OpenStreetMap, plus the firms that listed themselves with
// Terreno (kept in this browser, and on Terreno's servers when they're on). And where a booking goes: a
// reference kept here (and in the cloud), so a firm can match the rides Terreno brought them.
import { cloudOn, cloudUser, rest } from "../cloud/client";
import { overpass } from "../data/overpass";
import { loadList, saveJson } from "../util/storage";
import { firmFromOsm, type Need, type TaxiFirm } from "./model";

export const FIRMS_KEY = "atlas.taxi.firms.v1";
export const BOOKINGS_KEY = "atlas.taxi.bookings.v1";

/** A firm's listing as it's sent in: the firm plus who to contact and which tier. */
export interface Listing extends TaxiFirm { email: string; tier: "free" | "partner"; listedAt: number }
export interface Booking { ref: string; firm: string; firmName: string; via: "call" | "whatsapp" | "book"; to: string; at: number }

interface FirmRow {
  id: string; name: string; lon: number; lat: number; radius_km: number; phone: string | null; whatsapp: string | null; booking: string | null;
  needs: Need[] | null; fixed: { label: string; price: string }[] | null; licence: string | null; verified: boolean; drivers_keep_fare: boolean;
}
const fromRow = (r: FirmRow): TaxiFirm => ({
  id: `listing:${r.id}`, name: r.name, lon: r.lon, lat: r.lat, radiusKm: r.radius_km, phone: r.phone ?? undefined, whatsapp: r.whatsapp ?? undefined,
  booking: r.booking ?? undefined, needs: r.needs ?? undefined, fixed: r.fixed ?? undefined, licence: r.licence ?? undefined,
  verified: r.verified, driversKeepFare: r.drivers_keep_fare, source: "listing",
});

/** Every taxi firm and rank that might take a ride from here (unranked: see rankFirms). */
export async function firmsNear(at: { lon: number; lat: number }): Promise<TaxiFirm[]> {
  const { lat, lon } = at;
  const q = `[out:json][timeout:25];(nwr["amenity"="taxi"](around:3000,${lat.toFixed(4)},${lon.toFixed(4)});nwr["office"="taxi"](around:25000,${lat.toFixed(4)},${lon.toFixed(4)});nwr["shop"="taxi"](around:25000,${lat.toFixed(4)},${lon.toFixed(4)}););out center tags 80;`;
  const box = `lat=gte.${(lat - 0.6).toFixed(3)}&lat=lte.${(lat + 0.6).toFixed(3)}&lon=gte.${(lon - 0.9).toFixed(3)}&lon=lte.${(lon + 0.9).toFixed(3)}`;
  const [osm, cloud] = await Promise.all([
    overpass(q).catch(() => []),
    cloudOn() ? rest<FirmRow[]>(`taxi_firms?select=id,name,lon,lat,radius_km,phone,whatsapp,booking,needs,fixed,licence,verified,drivers_keep_fare&live=eq.true&${box}`).catch(() => []) : Promise.resolve([] as FirmRow[]),
  ]);
  const listed = [...loadList<Listing>(FIRMS_KEY), ...cloud.map(fromRow)];
  // A firm that listed itself wins over its OpenStreetMap entry (same name), since it keeps it up to date.
  const names = new Set(listed.map((f) => f.name.trim().toLowerCase()));
  const fromOsm = osm.map(firmFromOsm).filter((f): f is TaxiFirm => !!f && !(f.rank === false && names.has(f.name.trim().toLowerCase())));
  return [...listed, ...fromOsm];
}

/** Keeps a booking's reference here, and sends it to the firm's records when the cloud is on. */
export function recordBooking(b: Booking) {
  saveJson(BOOKINGS_KEY, [b, ...loadList<Booking>(BOOKINGS_KEY)].slice(0, 200));
  if (cloudOn() && b.firm.startsWith("listing:") && !b.firm.startsWith("listing:local-")) {
    void rest("taxi_bookings", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ ref: b.ref, firm_id: b.firm.slice(8), via: b.via, destination: b.to, rider: cloudUser()?.id ?? null }) }).catch(() => {});
  }
}

/** Saves a firm's listing: here at once, and to Terreno's servers for review when they're on. */
export async function submitListing(l: Listing): Promise<"cloud" | "here"> {
  saveJson(FIRMS_KEY, [l, ...loadList<Listing>(FIRMS_KEY).filter((x) => x.id !== l.id)]);
  if (!cloudOn()) return "here";
  try {
    await rest("taxi_firms", {
      method: "POST", prefer: "return=minimal",
      body: JSON.stringify({
        name: l.name, lon: l.lon, lat: l.lat, radius_km: l.radiusKm, phone: l.phone ?? null, whatsapp: l.whatsapp ?? null, booking: l.booking ?? null,
        needs: l.needs ?? [], fixed: l.fixed ?? [], licence: l.licence ?? null, drivers_keep_fare: !!l.driversKeepFare, email: l.email, tier: l.tier,
      }),
    });
    return "cloud";
  } catch { return "here"; }
}
