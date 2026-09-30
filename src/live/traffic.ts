// Planes and ships, live. Aircraft report where they are over ADS-B, and a
// worldwide network of volunteer receivers shares it (adsb.lol, then
// airplanes.live, then the OpenSky Network). Ships report over AIS: Finland's
// Digitraffic shares the Baltic's openly; anywhere else takes an AISStream
// key held by Atlas's edge (it relays the live stream).
//
// Reports arrive every few seconds to a minute; between them each craft is
// moved on along its heading at its speed (dead reckoning), so they glide
// rather than jump.
import { config, edgeHas } from "../config";
import { getJson } from "../data/http";

export type TrackKind = "plane" | "ship";

export interface Track {
  id: string;
  kind: TrackKind;
  lon: number;
  lat: number;
  /** Metres above sea level. */
  alt: number;
  /** Metres a second over the ground. */
  speed: number;
  /** Degrees clockwise from north. */
  heading: number;
  /** Metres a second, up positive. */
  climb: number;
  /** When the position was reported (ms). */
  t: number;
  ground: boolean;
  /** Callsign or ship's name. */
  label: string;
  /** For colour and the card: "Cargo", "Airliner"… */
  group: string;
  // Planes
  callsign?: string;
  reg?: string;
  type?: string;
  typeName?: string;
  operator?: string;
  squawk?: string;
  // Ships
  mmsi?: string;
  destination?: string;
  status?: string;
  length?: number;
}

// ---- Motion ----------------------------------------------------------------

const M_PER_DEG = 111_320;

/** Where a craft is `now`, carried on from its last report along its heading. */
export function advance(t: Track, now: number, maxSeconds = t.kind === "plane" ? 90 : 900): { lon: number; lat: number; alt: number } {
  const dt = Math.max(0, Math.min(maxSeconds, (now - t.t) / 1000));
  if (t.ground || t.speed < 0.3 || dt === 0) return { lon: t.lon, lat: t.lat, alt: t.alt };
  const d = t.speed * dt, th = (t.heading * Math.PI) / 180;
  const lat = t.lat + (d * Math.cos(th)) / M_PER_DEG;
  const lon = t.lon + (d * Math.sin(th)) / (M_PER_DEG * Math.max(0.05, Math.cos((t.lat * Math.PI) / 180)));
  return { lon: ((lon + 540) % 360) - 180, lat: Math.max(-89.9, Math.min(89.9, lat)), alt: Math.max(0, t.alt + t.climb * dt) };
}

/** Points along the way ahead, for drawing where it's heading (every `step` seconds). */
export function pathAhead(t: Track, from: number, seconds: number, step = 15): { lon: number; lat: number; alt: number }[] {
  const out = [];
  for (let s = 0; s <= seconds; s += step) out.push(advance({ ...t, t: from }, from + s * 1000, seconds));
  return out;
}

// ---- Planes ----------------------------------------------------------------

/** Common aircraft by ICAO type designator. */
export const AIRCRAFT: Record<string, string> = {
  A19N: "Airbus A319neo", A20N: "Airbus A320neo", A21N: "Airbus A321neo", A318: "Airbus A318", A319: "Airbus A319", A320: "Airbus A320", A321: "Airbus A321",
  A332: "Airbus A330-200", A333: "Airbus A330-300", A339: "Airbus A330-900neo", A343: "Airbus A340-300", A359: "Airbus A350-900", A35K: "Airbus A350-1000", A388: "Airbus A380",
  B737: "Boeing 737-700", B738: "Boeing 737-800", B739: "Boeing 737-900", B37M: "Boeing 737 MAX 7", B38M: "Boeing 737 MAX 8", B39M: "Boeing 737 MAX 9", B3XM: "Boeing 737 MAX 10",
  B744: "Boeing 747-400", B748: "Boeing 747-8", B752: "Boeing 757-200", B763: "Boeing 767-300", B772: "Boeing 777-200", B77W: "Boeing 777-300ER", B77L: "Boeing 777-200LR",
  B788: "Boeing 787-8", B789: "Boeing 787-9", B78X: "Boeing 787-10", BCS1: "Airbus A220-100", BCS3: "Airbus A220-300",
  E170: "Embraer 170", E175: "Embraer 175", E190: "Embraer 190", E195: "Embraer 195", E290: "Embraer E190-E2", E295: "Embraer E195-E2",
  CRJ2: "Bombardier CRJ200", CRJ7: "Bombardier CRJ700", CRJ9: "Bombardier CRJ900", DH8D: "De Havilland Dash 8-400", AT72: "ATR 72", AT76: "ATR 72-600", AT45: "ATR 42-500",
  C172: "Cessna 172", C182: "Cessna 182", C208: "Cessna Caravan", PC12: "Pilatus PC-12", SR22: "Cirrus SR22", DA40: "Diamond DA40", PA28: "Piper Cherokee",
  GLF6: "Gulfstream G650", GLEX: "Bombardier Global Express", CL35: "Challenger 350", C68A: "Cessna Latitude", E55P: "Embraer Phenom 300",
  EC35: "Airbus H135", EC45: "Airbus H145", R44: "Robinson R44", B06: "Bell 206", AS50: "Airbus H125", S76: "Sikorsky S-76",
  C17: "Boeing C-17 Globemaster", C130: "Lockheed C-130 Hercules", K35R: "Boeing KC-135", A400: "Airbus A400M",
};

/** Airlines by the ICAO prefix of their callsigns. */
export const AIRLINES: Record<string, string> = {
  AAL: "American Airlines", DAL: "Delta Air Lines", UAL: "United Airlines", SWA: "Southwest Airlines", JBU: "JetBlue", ASA: "Alaska Airlines", NKS: "Spirit Airlines", FFT: "Frontier Airlines",
  SKW: "SkyWest", RPA: "Republic Airways", ENY: "Envoy Air", ACA: "Air Canada", WJA: "WestJet", AMX: "Aeroméxico", VOI: "Volaris", AVA: "Avianca", LAN: "LATAM", CMP: "Copa Airlines",
  GLO: "Gol", AZU: "Azul", ARG: "Aerolíneas Argentinas", BAW: "British Airways", VIR: "Virgin Atlantic", EZY: "easyJet", RYR: "Ryanair", AFR: "Air France", KLM: "KLM",
  DLH: "Lufthansa", SWR: "Swiss", AUA: "Austrian", SAS: "SAS", FIN: "Finnair", IBE: "Iberia", VLG: "Vueling", TAP: "TAP Air Portugal", AZA: "ITA Airways", THY: "Turkish Airlines",
  PGT: "Pegasus", WZZ: "Wizz Air", NAX: "Norwegian", LOT: "LOT Polish", EIN: "Aer Lingus", UAE: "Emirates", QTR: "Qatar Airways", ETD: "Etihad", SVA: "Saudia", ELY: "El Al",
  ETH: "Ethiopian Airlines", KQA: "Kenya Airways", SAA: "South African Airways", MSR: "EgyptAir", RAM: "Royal Air Maroc", AIC: "Air India", IGO: "IndiGo", SIA: "Singapore Airlines",
  CPA: "Cathay Pacific", QFA: "Qantas", ANZ: "Air New Zealand", JAL: "Japan Airlines", ANA: "All Nippon Airways", KAL: "Korean Air", AAR: "Asiana", CCA: "Air China",
  CES: "China Eastern", CSN: "China Southern", HAL: "Hawaiian Airlines", FDX: "FedEx", UPS: "UPS Airlines", GTI: "Atlas Air", CLX: "Cargolux", DHK: "DHL", BOX: "AeroLogic",
};

export const planeGroup = (category?: string, type?: string, alt?: number | "ground"): string => {
  if (alt === "ground") return "On the ground";
  if (category === "A7" || /^(EC|R44|B06|AS|S76|H)/.test(type ?? "")) return "Helicopter";
  if (category === "A5" || category === "A4" || category === "A3") return "Airliner";
  if (category === "A1" || category === "A2") return "Light aircraft";
  if (type && AIRCRAFT[type]) return /Airbus A3|Boeing|Embraer|Bombardier CRJ|ATR|Dash|A220/.test(AIRCRAFT[type]) ? "Airliner" : "Light aircraft";
  return "Aircraft";
};

interface AdsbAc {
  hex: string; flight?: string; r?: string; t?: string; desc?: string; ownOp?: string; category?: string; squawk?: string;
  lat?: number; lon?: number; alt_baro?: number | "ground"; alt_geom?: number; gs?: number; track?: number; true_heading?: number; baro_rate?: number; geom_rate?: number; seen_pos?: number;
}

/** adsb.lol / airplanes.live "v2" answers (the readsb format). */
export function readAdsb(body: { ac?: AdsbAc[]; now?: number }, now = Date.now()): Track[] {
  const at = body.now ?? now;
  return (body.ac ?? []).filter((a) => a.lat !== undefined && a.lon !== undefined).map((a) => {
    const ground = a.alt_baro === "ground";
    const ft = ground ? 0 : a.alt_geom ?? (typeof a.alt_baro === "number" ? a.alt_baro : 0);
    const callsign = a.flight?.trim() || undefined;
    return {
      id: `p:${a.hex}`, kind: "plane", lon: a.lon!, lat: a.lat!, alt: Math.max(0, ft * 0.3048), speed: (a.gs ?? 0) * 0.514444,
      heading: a.track ?? a.true_heading ?? 0, climb: ((a.baro_rate ?? a.geom_rate ?? 0) * 0.3048) / 60, t: at - (a.seen_pos ?? 0) * 1000, ground,
      label: callsign ?? a.r ?? a.hex.toUpperCase(), group: planeGroup(a.category, a.t, a.alt_baro),
      callsign, reg: a.r, type: a.t, typeName: (a.t && AIRCRAFT[a.t]) || a.desc, operator: a.ownOp || (callsign && AIRLINES[callsign.slice(0, 3)]) || undefined, squawk: a.squawk,
    } satisfies Track;
  });
}

/** OpenSky "states" answers. */
export function readOpenSky(body: { time?: number; states?: (string | number | boolean | null)[][] | null }): Track[] {
  const at = (body.time ?? Date.now() / 1000) * 1000;
  return (body.states ?? []).filter((s) => s[5] !== null && s[6] !== null).map((s) => {
    const callsign = String(s[1] ?? "").trim() || undefined;
    const ground = !!s[8];
    return {
      id: `p:${s[0]}`, kind: "plane", lon: Number(s[5]), lat: Number(s[6]), alt: Math.max(0, Number(s[13] ?? s[7] ?? 0)), speed: Number(s[9] ?? 0),
      heading: Number(s[10] ?? 0), climb: Number(s[11] ?? 0), t: s[3] ? Number(s[3]) * 1000 : at, ground,
      label: callsign ?? String(s[0]).toUpperCase(), group: ground ? "On the ground" : "Aircraft",
      callsign, operator: callsign ? AIRLINES[callsign.slice(0, 3)] : undefined, squawk: s[14] ? String(s[14]) : undefined,
    } satisfies Track;
  });
}

/** Planes around a point, from whichever network answers first. Radius in km (at most ~460). */
export async function planesAround(lon: number, lat: number, km: number): Promise<{ tracks: Track[]; source: string }> {
  const nm = Math.max(5, Math.min(250, Math.round(km / 1.852)));
  const la = lat.toFixed(3), lo = lon.toFixed(3);
  try {
    return { tracks: readAdsb(await getJson("adsb.lol", `https://api.adsb.lol/v2/point/${la}/${lo}/${nm}`, undefined, 10_000, true)), source: "adsb.lol" };
  } catch { /* next network */ }
  try {
    return { tracks: readAdsb(await getJson("airplanes.live", `https://api.airplanes.live/v2/point/${la}/${lo}/${nm}`, undefined, 10_000, true)), source: "airplanes.live" };
  } catch { /* next network */ }
  const d = km / 111;
  const box = `lamin=${(lat - d).toFixed(2)}&lamax=${(lat + d).toFixed(2)}&lomin=${(lon - d / Math.max(0.2, Math.cos((lat * Math.PI) / 180))).toFixed(2)}&lomax=${(lon + d / Math.max(0.2, Math.cos((lat * Math.PI) / 180))).toFixed(2)}`;
  return { tracks: readOpenSky(await getJson("OpenSky", `https://opensky-network.org/api/states/all?${box}`, undefined, 12_000, true)), source: "OpenSky Network" };
}

/** Every plane in the air (for the zoomed-out globe), from the OpenSky Network. */
export async function planesEverywhere(): Promise<{ tracks: Track[]; source: string }> {
  return { tracks: readOpenSky(await getJson("OpenSky", "https://opensky-network.org/api/states/all", undefined, 20_000, true)).filter((t) => !t.ground), source: "OpenSky Network" };
}

export interface Route { from: { code: string; name: string; city?: string }; to: { code: string; name: string; city?: string } }
/** Where a flight is going (from its callsign), when adsb.lol knows the route. */
export async function routeOf(t: Track): Promise<Route | null> {
  if (!t.callsign) return null;
  const rows = await getJson<{ callsign: string; plausible?: boolean | number; _airports?: { iata?: string; icao?: string; name: string; location?: string }[] }[]>("adsb.lol", "https://api.adsb.lol/api/0/routeset",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planes: [{ callsign: t.callsign, lat: t.lat, lng: t.lon }] }) }, 8000);
  const r = rows?.[0];
  const ap = r?._airports ?? [];
  if (!r || ap.length < 2 || r.plausible === false || r.plausible === 0) return null;
  const a = (x: (typeof ap)[number]) => ({ code: x.iata ?? x.icao ?? "", name: x.name, city: x.location });
  return { from: a(ap[0]), to: a(ap[ap.length - 1]) };
}

// ---- Ships -----------------------------------------------------------------

/** What kind of ship, from its AIS type code. */
export function shipGroup(code?: number): string {
  if (!code) return "Vessel";
  if (code === 30) return "Fishing";
  if (code === 31 || code === 32 || code === 52) return "Tug";
  if (code === 35) return "Military";
  if (code === 36 || code === 37) return "Sailing and pleasure";
  if (code >= 40 && code < 50) return "High-speed craft";
  if (code === 50 || code === 51 || code === 53 || code === 54 || code === 55 || code === 58) return "Service";
  if (code >= 60 && code < 70) return "Passenger";
  if (code >= 70 && code < 80) return "Cargo";
  if (code >= 80 && code < 90) return "Tanker";
  return "Vessel";
}

const NAV_STATUS = ["Under way", "At anchor", "Not under command", "Restricted manoeuvring", "Constrained by draught", "Moored", "Aground", "Fishing", "Sailing"];
export const navStatus = (n?: number) => (n !== undefined && NAV_STATUS[n]) || undefined;

interface DtFeature { mmsi: number; geometry: { coordinates: [number, number] }; properties: { sog: number; cog: number; heading: number; navStat: number; timestampExternal: number } }
interface DtVessel { mmsi: number; name?: string; shipType?: number; destination?: string; callSign?: string; imo?: number; draught?: number }

/** Digitraffic's positions, named from its vessel register. */
export function readDigitraffic(features: DtFeature[], vessels: Map<number, DtVessel>): Track[] {
  return features.map((f) => {
    const v = vessels.get(f.mmsi);
    const p = f.properties;
    const heading = p.heading >= 0 && p.heading < 360 ? p.heading : p.cog < 360 ? p.cog : 0;
    const name = v?.name?.trim();
    return {
      id: `s:${f.mmsi}`, kind: "ship", lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], alt: 0, speed: (p.sog >= 102.3 ? 0 : p.sog) * 0.514444,
      heading, climb: 0, t: p.timestampExternal, ground: p.navStat === 1 || p.navStat === 5,
      label: name || `MMSI ${f.mmsi}`, group: shipGroup(v?.shipType), mmsi: String(f.mmsi), destination: v?.destination?.trim() || undefined, status: navStatus(p.navStat),
    } satisfies Track;
  });
}

/** Where Digitraffic sees ships (the Baltic, the Gulfs of Finland and Bothnia). */
export const BALTIC: [number, number, number, number] = [9, 53, 31, 66.5];
const overlaps = (a: [number, number, number, number], b: [number, number, number, number]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

let vesselRegister: Promise<Map<number, DtVessel>> | null = null;
/** Ships in view from Digitraffic (positions from the past 20 minutes). */
export async function balticShips(view: [number, number, number, number]): Promise<Track[]> {
  if (!overlaps(view, BALTIC)) return [];
  vesselRegister ??= getJson<DtVessel[]>("Digitraffic", "https://meri.digitraffic.fi/api/ais/v1/vessels", undefined, 30_000)
    .then((l) => new Map(l.map((v) => [v.mmsi, v])))
    .catch(() => { vesselRegister = null; return new Map(); });
  const [pos, reg] = await Promise.all([
    getJson<{ features: DtFeature[] }>("Digitraffic", `https://meri.digitraffic.fi/api/ais/v1/locations?from=${Date.now() - 20 * 60_000}`, undefined, 20_000, true),
    vesselRegister,
  ]);
  const [w, s, e, n] = view;
  return readDigitraffic(pos.features.filter((f) => { const [x, y] = f.geometry.coordinates; return x >= w && x <= e && y >= s && y <= n; }), reg);
}

/** Can ships be shown anywhere (the edge relays AISStream), or only in the Baltic? */
export const shipsWorldwide = () => edgeHas("aisstream");

interface AisMsg {
  MessageType: string;
  MetaData?: { MMSI: number; ShipName?: string; latitude: number; longitude: number; time_utc?: string };
  Message?: {
    PositionReport?: { Cog: number; Sog: number; TrueHeading: number; NavigationalStatus: number; Latitude: number; Longitude: number };
    ShipStaticData?: { Name?: string; Type?: number; Destination?: string; Dimension?: { A: number; B: number } };
  };
}

/** One AISStream message folded into what we know about that ship (null if it isn't a position yet). */
export function readAisMessage(m: AisMsg, known: Map<string, Partial<Track>>, now = Date.now()): Track | null {
  const mmsi = String(m.MetaData?.MMSI ?? "");
  if (!mmsi) return null;
  const id = `s:${mmsi}`;
  const k = known.get(id) ?? {};
  const st = m.Message?.ShipStaticData;
  if (st) {
    Object.assign(k, { label: st.Name?.trim() || k.label, group: shipGroup(st.Type), destination: st.Destination?.trim() || undefined, length: st.Dimension ? st.Dimension.A + st.Dimension.B : undefined });
    known.set(id, k);
    return k.lon !== undefined ? (k as Track) : null;
  }
  const p = m.Message?.PositionReport;
  if (!p) return null;
  const heading = p.TrueHeading >= 0 && p.TrueHeading < 360 ? p.TrueHeading : p.Cog < 360 ? p.Cog : 0;
  Object.assign(k, {
    id, kind: "ship", lon: p.Longitude, lat: p.Latitude, alt: 0, speed: (p.Sog >= 102.3 ? 0 : p.Sog) * 0.514444, heading, climb: 0,
    t: m.MetaData?.time_utc ? Date.parse(m.MetaData.time_utc.replace(" +0000 UTC", "Z").replace(" ", "T")) || now : now,
    ground: p.NavigationalStatus === 1 || p.NavigationalStatus === 5, label: k.label ?? (m.MetaData?.ShipName?.trim() || `MMSI ${mmsi}`),
    group: k.group ?? "Vessel", mmsi, status: navStatus(p.NavigationalStatus),
  });
  known.set(id, k);
  return k as Track;
}

/** A live AIS stream for a box, relayed by the edge (which holds the key). Returns a stop function. */
export function streamShips(view: [number, number, number, number], onTrack: (t: Track) => void, onError: (e: string) => void): () => void {
  if (!config.edge) { onError("no edge"); return () => {}; }
  const known = new Map<string, Partial<Track>>();
  const ws = new WebSocket(`${config.edge.replace(/^http/, "ws")}/ws/ais?bbox=${view.map((v) => v.toFixed(2)).join(",")}`);
  ws.onmessage = (e) => {
    try { const t = readAisMessage(JSON.parse(String(e.data)) as AisMsg, known); if (t) onTrack(t); } catch { /* skip a bad message */ }
  };
  ws.onerror = () => onError("The live ship feed dropped");
  return () => ws.close();
}
