# Terreno product audit (September 2026)

A pass over the whole product, as if preparing it for users and investors:
what a new user meets, what makes them come back, what breaks trust, and
what stands between the demo and a product. It records what was changed,
and what still needs a decision.

## The shape of the product

**Before:** one globe with nine themes, and behind three round buttons
(Saturn, briefcase, house) about fifteen tools. It was powerful but had no front door.

**Now:** three modes at the top, and nothing removed.

- **My Places** is the daily reason to open Terreno: your home, farm, site or business, with Today's brief,
  your places, and the tools to run them (Grow, Flock, Build, live occupancy).
- **Explore** is the reason to show someone Terreno: the Earth and space through themes and lenses.
- **Create** is the reason to share it: Plan, Present, Video, Teach.

## First five minutes

| Finding | Status |
|---|---|
| No explanation of what Terreno is for | ✅ First-visit welcome: three ways in, with example requests |
| Saving your place took four steps across two panels | ✅ An address box in My Places: Find → save form, one step |
| An empty My Places shows nothing of what it can do | ✅ "Try a demo farm": animals, fields and paddocks, dated from today, removable in one tap |
| The report that makes people say "how does it know?" didn't exist | ✅ About this place: slope and aspect, rock below, frost dates, growing heat and suitable crops, rain, nearest river, a sowing calendar |

## The daily loop (why they come back)

| Finding | Status |
|---|---|
| Nothing tells you what to do today | ✅ Today's brief: frost, heat, heavy rain, gales; births and vaccinations due (grouped); harvest windows and irrigation per field; projects behind; blight and flystrike weather |
| Brief items only opened the tool | ✅ Tapping one opens the exact animal, field or project |
| Recording things meant forms | ✅ Plain-words logging for Flock, Grow and Build: typed or spoken (Flock), in the search box, or in the box under the brief; shows what it will save first |
| Terreno AI didn't know about your place | ✅ Tools for the brief and for logging |
| Records could be lost with the browser | ✅ Back up everything / Restore (never includes the AI key); asks the browser to keep storage |
| No signal in the field | ✅ Works offline and installs as an app (terrain and data cached) |
| Accounts and sync across devices | ⏳ Needs a backend (see "Decisions") |
| Reminders that reach you when the app is closed | ⏳ Needs push notifications (a backend) |

## Trust and depth

| Finding | Status |
|---|---|
| Flock had species but no breeds | ✅ About 150 breeds with typical weights; weight against the breed; routine care in one tap |
| Grow suggested irrigating crops ready to harvest | ✅ Fixed: no irrigation advice once a crop is ripening |
| Nothing on what might go wrong with a crop | ✅ "Watch for": common pests and diseases for 40 crops by stage |
| Nothing to share with a vet or adviser | ✅ The place report prints or saves as a PDF, with a link back to Terreno |
| Grow had 10 crops | ✅ 42, grouped, including hay and alfalfa per cut, winter wheat, garden vegetables and orchard crops |
| Look knew little about the famous features themselves | ✅ About 270 features with key facts (rivers, lakes, falls, canyons, deserts, peaks, volcanoes, craters, deeps, forests, metros), plus a 10 m gazetteer (about 11,700 names) and detailed rivers |
| Duplicated or crowded cards | ✅ Facts collapse to one line in the place card; panels don't repeat them |
| Guidance presented as fact | ✅ Estimates are labelled ("about", "typical", "rules of thumb", "follow your vet's advice") |

## Speed and reliability

| Finding | Status |
|---|---|
| 4.9 MB single bundle | ✅ Cesium in its own cached chunk; seven tools load on first use; app code about 660 KB |
| Slow OpenStreetMap queries repeated on every visit | ✅ A week-long local cache and a third mirror; stale answers are used when offline |
| Phones: overlapping panels and a squeezed search box | ✅ One panel at a time, the mode switch on its own row, a shorter placeholder |
| Test coverage | ✅ 194 unit tests (up from 159) across the new models: brief, logging, calendar, report, risks, backup, breeds, crops, facts |

## Decisions for you

1. **Accounts and sync.** The biggest remaining gap for "trust it with my animals". A hosted backend
   (Supabase or Firebase) gives sign-in, sync across devices, sharing with a vet or farmhand, and
   push reminders. It's roughly one to two weeks of work.
2. **Data licences before charging.** See [data-licensing.md](data-licensing.md). The most urgent items
   are weather (an Open-Meteo plan) and imagery (a commercial provider).
3. **Analytics and error reporting.** You can't measure day-28 retention without them. Privacy-friendly
   options: PostHog or Plausible, plus Sentry. Each needs an account and a key.
4. **Pro.** Build's worksite tools and live occupancy are marked Pro but open to try. Decide the first
   paid feature and its price before the first users arrive, even if it's free during testing.

## Finding users (the next step you named)

**Who:** five to ten people, in three groups:

- two or three smallholders or hobby farmers with animals;
- two or three market gardeners or allotment growers;
- one or two small builders or site managers.

Local agricultural shows, smallholder Facebook groups, allotment societies, Young Farmers clubs and
vet practices are good places to find them.

**How:**

1. Sit with each person for 30 minutes on their own phone.
2. Say only "this is Terreno; save your place".
3. Watch without helping, and note where they hesitate.
4. Before leaving, ask them to log one real thing.

**What to measure over four weeks:**

- Do they open My Places without being reminded, in week 1 and in week 4?
- How many real records do they log?
- Which items in the brief do they act on?
- What do they ask for that isn't there?

A spreadsheet is enough until analytics exist.

**What would change the plan:** if they open it daily for the brief, deepen the brief and logging. If
they open it for the place report and lenses but not daily, lean into Look and Make instead.
