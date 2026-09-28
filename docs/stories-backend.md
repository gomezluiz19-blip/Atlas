# The shared story library

Stories work without any server: a story can be shared as a link that carries the whole story, and the
library shows the featured stories plus the ones made or opened on your device. For one library that
everyone publishes to, searches and remixes (the network effect), connect a free Supabase project:

1. Create a project at [supabase.com](https://supabase.com) (the free tier is plenty to start).
2. Open **SQL Editor**, paste [`stories-backend.sql`](stories-backend.sql) and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
4. In the GitHub repository, **Settings → Secrets and variables → Actions → Variables**, add
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` with those values. (The anon key is meant to be public; the
   database only allows what the SQL's functions allow.)
5. Re-run the **Deploy to GitHub Pages** workflow (or push to `main`).

For local development, put the same values in `.env.local` as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`.

## How it's protected

- Anyone can read published stories; nobody can write to the table directly.
- Publishing goes through `publish_story`, which checks the size and shape of a story. The author's device
  keeps an edit key (stored hashed in the database) that `update_story` requires to change it later.
- Uses, remixes, likes and reports are simple counters (`bump`). Three reports hide a story until someone
  reviews it in the table editor (set `hidden` to false and `reports` to 0 to restore it).

## Before inviting schools

- **Accounts.** Anonymous publishing is fine for a pilot. Before wider use, add Supabase Auth (email magic
  links) so authors can edit from any device and moderators can act on accounts, not just stories.
- **Rate limits.** The counters can be inflated by a determined visitor. Put the functions behind an Edge
  Function with per-IP limits, or count uses per signed-in account, before the numbers matter.
- **Moderation.** Decide who reviews reported stories and how fast, and write it into the terms of use.
