# Work: design notes

How Work is designed, and why. Work leads with **your area of work**: *What's your field?* (every field as a
tile, or describe what you do). Every field then reads the same simple way, in three layers
(`src/work/fields/catalog.ts`, `src/work/fields/ui.ts`):

1. **The field** (Food): anything to do with it, **live on the map** around where you're looking, for anyone.
   Restaurants, cafés, takeaways, bars, markets, bakeries, grocers, farms and producers, each a colour; filter by
   tapping; the list and the pins follow the map as it moves.
2. **The field's Pro** (Food Pro): your own work in it, **as a map you run**: a spatial CRM with the field's own
   names for things (Locations, Customers and accounts, Orders, Deliveries, Inspections and licences, Equipment,
   Staff), the people on the team as pins too (each record says who's on it; a person's card lists what's on their
   plate),
   live pins, what needs you and what it knocks on, and **your HQ**: add it and it goes on the map in ink and boots
   as a 3D paper model (like My Place) with your nearby work pinned on it by how it stands. Each field keeps its own
   records.
3. **The field's services** (Food services): **every kind of company that serves it**, not one niche. For food:
   distributors and wholesalers, produce, meat, fish, bakery and dairy suppliers, drinks, coffee, kitchens and
   equipment, refrigeration, pest control, grease and oil, linen, packaging, payments, delivery, catering hire,
   food safety and labs, fit-out, utilities, music licensing, cleaning, waste, staffing, uniforms, marketing,
   photography, accountants, insurance, lawyers, security, electricians, plumbers, builders, IT, banks and
   consultants. Tap one to see them around you on the map (OpenStreetMap tags where they're mapped; a map search
   where they're not).

The specialist tools each field already had (Freight Desk, Mining Pro, Build Pro, City Ops…) fold away under
*More tools for {field}*, so the three layers are what you see first.

## The desk: your work in real space

**Who it's for.** Three kinds of working person, each with a different first question:

- **Someone at a company** (account manager, ops, logistics, sales): *which of my clients is about to be let
  down, and why?* Their work is clients, orders, the shipments that fill them and the sites in between.
- **Someone in the field** (engineer, technician, carer, inspector): *where am I going today, in what order, and
  what can't I do yet?* Their work is jobs and visits, and the parts and people those wait on.
- **A practitioner on their own** (lawyer, accountant, consultant, contractor): *what's due, where do I have to
  be, and who do I need nearby?* Their work is clients, cases and appointments, and the courts, registries,
  notaries and services around each.

**What a CRM misses.** A CRM keeps records as rows. But work sits in places and depends on other work: an order
waits on a container that's waiting at Bab-el-Mandeb; a hearing waits on an expert's report; a repair waits on a
valve that's still in Leeds. The desk keeps the same records (a client, an order, a shipment, a job, a case, a
visit, a site, an asset), each with a place, a status, a promise date and an expected date, and two links: what
it *belongs to* (an order's client) and what it *waits on* (an order's shipment).

**Consequences, not just status.** Because records are linked, the desk carries a slip forward
(`model.ts › projected`): a record is expected no earlier than the latest thing it waits on. *Needs you* lists
where trouble starts, worst first, each told as one sentence with the money on it: "Shipment MSKU 7714200 is 6
days behind, so order 1042 for Halden Foods misses 21 Oct by 2 days (€48,000), and 1 more after it." What's
only late because of something upstream isn't listed twice.

**Space.** Every record is a pin coloured by how it stands; shipments draw their route (dashed when late). Tap a
pin or a row for its card: where it is (the camera goes there), what it holds up and by how much, what it waits
on, what it's part of, its tracking link (container, parcel or AWB number), and **Nearby**: the lawyers,
notaries, courts, customs, freight, couriers, accountants, insurers, clinics, hotels or trade counters around it
(OpenStreetMap), each with call and website. The card's thin dashed lines on the map join it to its client, what
it waits on and what it holds up.

**In the field, the day is a round.** Today's jobs and visits, in a short loop from the depot (nearest next),
with the distance; anything that can't go ahead (blocked, or waiting on a part that isn't here) is left out and
named, so nobody drives to a job they can't do. *Show the round* draws it, numbered.

**Bringing work in.** Any CRM, job system or spreadsheet export as CSV: the usual columns are understood (name,
type, stage or status, address or lat/lon, close or due date, amount, account or parent, depends on, tracking),
and the kind and health are read from the words where they aren't given. Rows can link by id or by name.
Addresses are found on the map one by one. Everything can be exported back as CSV. Records stay on the device.

**First run.** Three cards, one per kind of worker, each with *Try it with an example* (a company shipping ovens
from Shanghai to Oslo, an engineer's day in Manchester, a lawyer in Austin), and *Bring my records*.

## The tools for your field

## First principles

**Who opens Work?** Someone with a job, a business or a project. They aren't browsing; they want the one tool
that fits what they do. Most will use one or two tools for months.

**What do they need to know first?** Two things: is there anything here for my kind of work, and which tool is
mine? Everything else (what the other 20 industries offer) is noise for them.

**What was wrong before?** The old Work map drew every industry as a metro line, with about 45 stations on one
screen. It was clever, but it asked people to read everything to find one thing, and the stations used our names
for the tools ("Field Network", "Scout") before people knew what those were. "Follow the line out to the people
who serve it" was a metaphor to learn, not a choice to make.

**So:**
1. Ask one question at a time, starting with the one people can answer without thinking: their field.
2. After that, show only that field, in the same shape every time, so the second field you look at is already
   familiar.
3. Name things by who they're for, not by what we called the code.
4. Remember the answer. Nobody should answer "what's your field?" twice.
5. Let people skip the questions: anyone can type what they do, in their own words.

## The process map

```
Open Work
  │
  ├─ Picked a field before? ──► that field's page (with "‹ All fields" to change it)
  │
  └─ First time ──► What's your field?
                      ├─ tap a tile (21 fields, 4 groups) ─────────► the field's page
                      └─ "Or describe what you do" ─► ranked tools ─► the tool itself
                                                                      (and its field is remembered)

The field's page
  hero: icon, name, one line about what's here
  Everyday ── Pro ── Services   (the three rungs; tap one to jump to it)
  Everyday   For anyone into mining        Mines and minerals
  Pro        For people who work in mining Mining Pro
  Services   For companies that serve mining  Mining equipment & services
  "Not quite it? Describe what you do"

A tool ──► its own screen, "‹ Back" returns to the field's page
```

The "Carry on" row at the top of the picker opens the last tool you used, so a returning user is one tap from
their work whichever screen they land on.

## Names

The three rungs are the same words in every field, chosen to be understood without explanation:

| Rung | Who it's for | Mining | Building | Food |
| --- | --- | --- | --- | --- |
| **Everyday** | anyone into it, or their own project | Mines and minerals | Build (your own house) | Eat & drink |
| **Pro** | people who do the work | Mining Pro | Build Pro | Restaurant site scout, Foodshed |
| **Services** | companies that serve the work | Mining equipment & services | Suppliers & plant hire | Kitchens and refrigeration |

Why not "Consumer / Professional / B2B"? Those are our words, not the user's; nobody thinks of themselves as "B2B".
"Everyday, Pro, Services" reads as a ladder from casual to specialist, and "Pro" already names the flagship
tools. Each rung carries a plain sentence ("For companies that serve mining"), so the label never has to explain
itself.

A field with no tool on a rung shows that rung faded on the chain ("None yet") rather than hiding it, so the shape
stays the same and the gap is honest. Where it was cheap, gaps were filled from what Terreno already has:
- **Mining:** Mines and minerals (the Earth theme's minerals).
- **Energy:** Power around you (Built › Energy).
- **Telecoms:** Who's connected (Built › Online).
- **Health:** Care near you.
- **Government:** Who governs.
- **Aid:** Where people live.
- **Freight:** Ships, live.
- **Hotels:** Travel.

## The fields and their groups

- **Make and build:** Architecture, Building, Mining, Farming, Energy, Telecoms.
- **Shops and hospitality:** Food, Retail, Fashion, Real estate, Hotels.
- **Money and trade:** Finance, Banking, Freight, Tech.
- **Culture and community:** Art, Gaming, Sport, Health, Aid, Government.

Four groups of four to six tiles: small enough to scan in one look, without a long alphabetical wall.

## Interface details

- Each field has its own colour and icon. The colour carries through the page: the icon tile, the rung chain,
  the tier labels and the "In use" badges.
- Screens slide forward into a field and back out of it, so you always know where you are.
- The rung chain mirrors the order of the cards below and gets darker from Everyday to Services. It shows how many
  tools sit on each rung.
- Search results say where each tool lives ("Mining · Services"), which teaches the structure while skipping it.
  Weak matches are dropped: only results scoring at least half the best are shown.
- Everything is reachable with a TV remote: the TV's focus ring moves through the tiles, rungs and rows.
