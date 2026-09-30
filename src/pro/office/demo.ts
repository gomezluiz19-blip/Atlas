// A demo office to try Politics Pro with: a made-up member for Colorado's
// 2nd district (Boulder and the mountain towns), with made-up constituents,
// casework and events, and a made-up bill. No real member of Congress is
// given a stance: the whip count starts empty for you to fill in.
import { newId } from "../../work/store";
import type { Contact, Office } from "./model";
import type { Message, Position } from "./mail";

const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const at = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export function demoOffice(): Office {
  const bill = newId();
  const c = (name: string, kind: Contact["kind"], lon: number, lat: number, topics: string[], extra: Partial<Contact> = {}): Contact =>
    ({ id: newId(), name, kind, lon, lat, topics, stance: {}, log: [], ...extra });
  const contacts: Contact[] = [
    c("Maria Gonzalez", "constituent", -105.2705, 40.0176, ["Broadband", "Small business"], { address: "Pearl St, Boulder", stance: { [bill]: "yes" }, log: [{ at: at(-3), text: "Called about slow internet at her shop; supports the broadband bill." }] }),
    c("Tom Becker", "constituent", -105.5108, 39.9611, ["Wildfire", "Broadband"], { address: "Nederland", stance: { [bill]: "yes" }, log: [{ at: at(-9), text: "Wildfire mitigation grant question." }] }),
    c("Aisha Rahman", "constituent", -105.2519, 40.0274, ["Housing"], { address: "North Boulder", log: [{ at: at(-1), text: "Rent increases; asked about housing vouchers." }] }),
    c("Sgt. Luis Ortega (ret.)", "constituent", -105.1019, 40.1672, ["Veterans"], { address: "Longmont", log: [{ at: at(-12), text: "VA disability claim delayed 8 months." }] }),
    c("Priya Nair", "constituent", -105.1311, 39.9778, ["Transit", "Climate"], { address: "Louisville", stance: { [bill]: "undecided" } }),
    c("Rocky Mountain Rural Co-op", "organisation", -105.3505, 40.0869, ["Broadband", "Energy"], { org: "Rural electric co-op", role: "Member services", stance: { [bill]: "yes" }, log: [{ at: at(-5), text: "Will testify for the bill if it funds middle-mile fibre." }] }),
    c("Front Range Realtors Assn.", "organisation", -105.2211, 40.0149, ["Housing"], { stance: { [bill]: "undecided" } }),
    c("Boulder Chamber of Commerce", "organisation", -105.2796, 40.0189, ["Small business", "Broadband"], { stance: { [bill]: "lean-yes" } }),
    c("TeleWest Cable", "stakeholder", -104.9903, 39.7392, ["Broadband"], { org: "TeleWest Cable", role: "Government affairs", stance: { [bill]: "lean-no" }, log: [{ at: at(-2), text: "Concerned about subsidies to co-ops competing in their footprint." }] }),
    c("Colorado Farm Bureau (demo)", "stakeholder", -105.0844, 40.5853, ["Agriculture", "Water"], { stance: { [bill]: "lean-yes" } }),
    c("Estes Park Trail-Gazette desk", "press", -105.5217, 40.3772, ["Tourism", "Wildfire"], { role: "Reporter" }),
    c("Daily Camera politics desk", "press", -105.2774, 40.0155, ["Housing", "Broadband"], { role: "Reporter" }),
    c("Mayor's office, Nederland", "official", -105.5105, 39.9614, ["Wildfire", "Broadband"], { stance: { [bill]: "yes" } }),
    c("Boulder County Commissioners", "official", -105.2791, 40.0162, ["Housing", "Wildfire", "Transit"], { stance: { [bill]: "lean-yes" } }),
    c("Jamal Carter", "constituent", -105.2445, 39.9936, ["Student loans"], { address: "University Hill" }),
    c("Helen Park", "constituent", -105.3378, 40.2408, ["Wildfire", "Veterans"], { address: "Lyons" }),
    c("Ben Whitaker", "constituent", -105.5211, 40.3769, ["Tourism", "Broadband"], { address: "Estes Park", stance: { [bill]: "lean-yes" } }),
    c("Grace Liu", "constituent", -105.0898, 40.1628, ["Immigration"], { address: "Longmont" }),
  ];
  const find = (n: string) => contacts.find((x) => x.name.startsWith(n))!.id;
  return {
    id: newId(), name: "Office of Rep. Jordan Ellis (demo)", demo: true, created: Date.now(),
    member: { name: "Rep. Jordan Ellis (demo)", party: "Democrat", chamber: "house", state: "CO", district: 2 },
    sites: [
      { id: newId(), kind: "capitol", name: "Washington office", address: "Longworth House Office Building", lon: -77.0100, lat: 38.8866, hours: "Mon–Fri 9–6 ET" },
      { id: newId(), kind: "district", name: "Boulder district office", address: "Pearl St, Boulder", lon: -105.2790, lat: 40.0180, hours: "Mon–Fri 9–5" },
      { id: newId(), kind: "district", name: "Estes Park satellite office", address: "Estes Park", lon: -105.5217, lat: 40.3772, hours: "Tue, Thu 10–3" },
    ],
    contacts,
    events: [
      { id: newId(), title: "Town hall on broadband", kind: "town hall", date: day(4), time: "18:30", place: { name: "Boulder Public Library", lon: -105.2830, lat: 40.0138 }, expected: 150 },
      { id: newId(), title: "Wildfire readiness visit", kind: "visit", date: day(9), time: "10:00", place: { name: "Nederland fire station", lon: -105.5108, lat: 39.9611 } },
      { id: newId(), title: "Co-op fibre site tour", kind: "visit", date: day(15), time: "13:00", place: { name: "Rural co-op substation", lon: -105.3505, lat: 40.0869 } },
      { id: newId(), title: "Press call: housing", kind: "press", date: day(2), time: "11:00", place: { name: "Boulder district office", lon: -105.2790, lat: 40.0180 } },
    ],
    cases: [
      { id: newId(), subject: "VA disability claim delayed", agency: "VA", contact: find("Sgt."), status: "open", opened: day(-58), updated: day(-20), release: true },
      { id: newId(), subject: "Wildfire mitigation grant", agency: "FEMA", contact: find("Tom"), status: "waiting", opened: day(-24), updated: day(-4), release: true },
      { id: newId(), subject: "Green card renewal", agency: "USCIS", contact: find("Grace"), status: "open", opened: day(-11), updated: day(-11) },
      { id: newId(), subject: "Tax refund missing", agency: "IRS", contact: find("Jamal"), status: "open", opened: day(-6), updated: day(-2) },
      { id: newId(), subject: "Social Security survivor benefits", agency: "SSA", contact: find("Helen"), status: "closed", opened: day(-70), updated: day(-15) },
    ],
    messages: mailbag(contacts),
    templates: [
      { id: newId(), topic: "Broadband", body: "Dear {first},\n\nThank you for writing to me about broadband. Too many homes and shops in our district still can't get a reliable connection, and I'm working to pass the Rural Broadband Buildout Act to fund middle-mile fibre and co-op networks.\n\nI'll keep you posted as it moves.\n\nSincerely,\nJordan Ellis" },
      { id: newId(), topic: "Housing", body: "Dear {first},\n\nThank you for contacting me about housing costs. I hear this from families across the district every week. My office can help you find local rental assistance; reply to this letter or call the Boulder office.\n\nSincerely,\nJordan Ellis" },
      { id: newId(), topic: "*", body: "Dear {first},\n\nThank you for writing to me about {topic}. I read every message, and your views help shape my work in Congress.\n\nSincerely,\nJordan Ellis" },
    ],
    bills: [{ id: bill, title: "Rural Broadband Buildout Act (demo)", number: "H.R. 2718", chamber: "house", sponsorParty: "Democrat", summary: "Grants for middle-mile fibre and co-op networks in rural districts.", members: {} }],
  };
}

/** Eight weeks of made-up mail: broadband surging with the town hall, housing steady, a wildfire spike. */
function mailbag(contacts: Contact[]): Message[] {
  const out: Message[] = [];
  const names = ["Ana Lopez", "Chris Doyle", "Mei Chen", "Sam Patel", "Olivia Brown", "Diego Ramos", "Hannah Kim", "Noah Fischer", "Leila Haddad", "Ethan Moore", "Zoe Walker", "Omar Siddiqui"];
  let k = 0;
  const add = (topic: string, position: Position, daysAgo: number, replied?: number) => {
    const c = contacts[k % contacts.length];
    const useContact = k % 3 === 0 && c.kind === "constituent";
    out.push({ id: newId(), contact: useContact ? c.id : undefined, name: useContact ? c.name : names[k % names.length], email: `person${k}@example.com`, topic, position, channel: ["Email", "Web form", "Phone", "Letter"][k % 4], received: day(-daysAgo),
      replied: replied !== undefined ? day(-replied) : undefined, lon: useContact ? c.lon : -105.27 + ((k * 37) % 50) / 100 - 0.25, lat: useContact ? c.lat : 40.02 + ((k * 53) % 40) / 100 - 0.2 });
    k++;
  };
  for (let d = 55; d > 0; d -= 3) { add("Housing", d % 2 ? "question" : "neutral", d, d > 20 ? d - 9 : undefined); }
  for (let d = 50; d > 10; d -= 6) add("Broadband", "support", d, d - 12);
  for (let d = 6; d >= 0; d--) { add("Broadband", "support", d); if (d % 2) add("Broadband", "oppose", d); }
  for (let d = 30; d > 22; d--) add("Wildfire", "question", d, d > 25 ? d - 16 : undefined);
  for (let d = 40; d > 0; d -= 10) add("Veterans", "question", d, d > 15 ? d - 5 : undefined);
  for (let d = 20; d > 0; d -= 5) add("Immigration", d % 2 ? "support" : "oppose", d);
  return out;
}
