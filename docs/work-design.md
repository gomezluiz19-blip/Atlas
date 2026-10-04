# Work: design notes

How Work's front door was designed, and why. Code: `src/work/workMap.ts` (the screens) and
`src/work/workLines.ts` (the fields, rungs and matching).

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
