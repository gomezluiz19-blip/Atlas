// Example books, one per kind of worker, so the desk can be tried before your own records come in. Real places;
// made-up companies and people. Dates are set from today, so there's always something happening.
import { addDays, type Book, type Rec, type Role } from "./model";

/** A container's way from Shanghai to Rotterdam, by Singapore, Colombo, the Red Sea and Suez. */
const ASIA_EUROPE: [number, number][] = [[122.07, 30.62], [121.9, 25.5], [114.5, 14.5], [104.3, 1.25], [96.5, 5.8], [79.85, 6.95], [60, 12.8], [43.4, 12.6], [38.8, 20], [32.56, 29.95], [32.33, 31.27],
  [20, 34.2], [11, 37.4], [-5.6, 35.95], [-9.6, 38.6], [-9.6, 43.2], [-5.2, 48.6], [1.4, 50.9], [4.05, 51.95]];

export function demoBook(role: Role, today: string): Book {
  const d = (n: number) => addDays(today, n);
  const log = (n: number, text: string) => ({ at: d(n), text });
  const recs: Rec[] = role === "company" ? [
    { id: "c-halden", kind: "client", title: "Halden Foods", sub: "Oslo · key account", lon: 10.752, lat: 59.913, status: "Active", health: "ok", owner: "You" },
    { id: "c-bright", kind: "client", title: "Brightwell Retail", sub: "London · 14 stores", lon: -0.1245, lat: 51.5145, status: "Renewal due", health: "watch", owner: "You" },
    { id: "c-ferro", kind: "client", title: "Ferro Kitchens", sub: "Milan", lon: 9.19, lat: 45.464, status: "Active", health: "ok" },
    { id: "o-1042", kind: "order", title: "1042", sub: "320 commercial ovens", parent: "c-halden", lon: 10.79, lat: 59.92, status: "Awaiting stock", health: "watch", due: d(9), value: 48_000, currency: "EUR", needs: ["s-msku", "x-customs"] },
    { id: "s-msku", kind: "shipment", title: "MSKU 7714200", sub: "40ft container · Shanghai → Rotterdam", parent: "o-1042", lon: 43.4, lat: 12.6, status: "At sea, held in the Red Sea queue", health: "late",
      due: d(5), eta: d(11), track: { number: "MSKU7714200", url: "https://www.maersk.com/tracking/MSKU7714200" }, route: ASIA_EUROPE, history: [log(-18, "Loaded at Yangshan"), log(-6, "Left Colombo"), log(-1, "Held at Bab-el-Mandeb: 6 days added")] },
    { id: "x-customs", kind: "case", title: "Customs entry 1042", sub: "Import declaration at Rotterdam", parent: "o-1042", lon: 4.13, lat: 51.95, status: "Ready to file on arrival", health: "watch", due: d(8), needs: ["s-msku"], services: ["customs", "freight"] },
    { id: "w-rtm", kind: "site", title: "Rotterdam warehouse", sub: "Maasvlakte · cross-dock", lon: 4.03, lat: 51.96, status: "62% full", health: "ok" },
    { id: "o-1043", kind: "order", title: "1043", sub: "Shelving for 6 stores", parent: "c-bright", lon: -0.12, lat: 51.51, status: "On the road", health: "ok", due: d(2), value: 12_400, currency: "GBP", needs: ["s-truck"] },
    { id: "s-truck", kind: "shipment", title: "Truck NL-48-KX", sub: "Rotterdam → London via Harwich", parent: "o-1043", lon: 1.29, lat: 51.95, status: "On the ferry", health: "ok", due: d(1), route: [[4.03, 51.96], [4.13, 51.98], [1.29, 51.95], [-0.12, 51.51]] },
    { id: "k-renew", kind: "case", title: "Brightwell contract renewal", sub: "Terms for 2026 with their counsel", parent: "c-bright", lon: -0.112, lat: 51.515, status: "Waiting on their lawyers", health: "watch", due: d(12), value: 210_000, currency: "GBP", services: ["legal", "notary"] },
    { id: "o-1040", kind: "order", title: "1040", sub: "Spare parts", parent: "c-ferro", lon: 9.19, lat: 45.46, status: "Delivered", health: "done", due: d(-3), value: 3_100, currency: "EUR" },
  ] : role === "field" ? [
    { id: "dep", kind: "site", title: "Trafford Park depot", sub: "Van stock and parts", lon: -2.32, lat: 53.465, status: "Open 7–6", health: "ok" },
    { id: "c-hughes", kind: "client", title: "Mrs Hughes", sub: "Didsbury", lon: -2.231, lat: 53.416, status: "Customer since 2019", health: "ok" },
    { id: "c-ancoats", kind: "client", title: "Ancoats Lofts", sub: "Managing agent: Pennine Homes", lon: -2.226, lat: 53.484, status: "Contract", health: "ok" },
    { id: "j-1", kind: "job", title: "Boiler service", sub: "14 Barlow Moor Rd, Didsbury", parent: "c-hughes", lon: -2.2305, lat: 53.4165, status: "Booked 9:00", health: "ok", due: today },
    { id: "j-2", kind: "job", title: "Hot water repair, flat 4B", sub: "Ancoats Lofts", parent: "c-ancoats", lon: -2.2262, lat: 53.4842, status: "Needs a diverter valve", health: "watch", due: today, value: 380, currency: "GBP", needs: ["p-valve"] },
    { id: "p-valve", kind: "shipment", title: "Diverter valve 87161", sub: "From the supplier in Leeds", lon: -1.55, lat: 53.8, status: "Out for delivery to the depot", health: "late", due: d(-1), eta: d(1), track: { number: "JD0002231148", url: "https://www.dpd.co.uk/apps/tracking/?parcel=JD0002231148" }, route: [[-1.55, 53.8], [-2.0, 53.62], [-2.32, 53.465]] },
    { id: "j-3", kind: "job", title: "Radiator install", sub: "Chorlton, 3 Beech Rd", lon: -2.275, lat: 53.441, status: "Booked 11:30", health: "ok", due: today, value: 640, currency: "GBP" },
    { id: "v-4", kind: "visit", title: "Quote: new boiler", sub: "Salford Quays, 22 Anchorage", lon: -2.29, lat: 53.471, status: "Booked 14:00", health: "ok", due: today, value: 3_200, currency: "GBP" },
    { id: "j-5", kind: "job", title: "Annual gas safety check", sub: "Stockport, 9 Hall St", lon: -2.157, lat: 53.408, status: "Booked 16:00", health: "ok", due: today },
    { id: "a-van", kind: "asset", title: "Van MA21 KXT", sub: "Service due in 900 miles", lon: -2.32, lat: 53.466, status: "MOT in 3 weeks", health: "watch", due: d(21) },
  ] : [
    { id: "c-ortiz", kind: "client", title: "Ortiz family", sub: "East Austin", lon: -97.716, lat: 30.262, status: "Retained", health: "ok" },
    { id: "c-lakeline", kind: "client", title: "Lakeline Dental", sub: "Cedar Park", lon: -97.799, lat: 30.477, status: "Retained", health: "ok" },
    { id: "c-mendez", kind: "client", title: "R. Mendez", sub: "Round Rock", lon: -97.678, lat: 30.508, status: "New enquiry", health: "watch" },
    { id: "k-ortiz", kind: "case", title: "Ortiz v. Crestline Builders", sub: "Construction defect · Travis County", parent: "c-ortiz", lon: -97.7461, lat: 30.2747, status: "Hearing set", health: "ok", due: d(6), value: 85_000, currency: "USD", needs: ["k-expert"], services: ["court", "legal"] },
    { id: "k-expert", kind: "job", title: "Expert report on the foundation", sub: "From the structural engineer", parent: "k-ortiz", lon: -97.743, lat: 30.268, status: "Engineer running late", health: "late", due: d(2), eta: d(8), services: ["legal"] },
    { id: "k-lease", kind: "case", title: "Lakeline lease review", sub: "New suite, 10-year term", parent: "c-lakeline", lon: -97.799, lat: 30.477, status: "Draft sent", health: "ok", due: d(10), value: 6_500, currency: "USD", services: ["notary"] },
    { id: "v-mendez", kind: "visit", title: "First meeting", sub: "Round Rock library, room 2", parent: "c-mendez", lon: -97.677, lat: 30.509, status: "Tomorrow 10:00", health: "ok", due: d(1) },
    { id: "k-filing", kind: "job", title: "File the Lakeline deed", sub: "Williamson County Clerk", parent: "k-lease", lon: -97.678, lat: 30.508, status: "Needs a notary", health: "blocked", due: d(4), services: ["notary", "court"] },
  ];
  return { role, recs };
}
