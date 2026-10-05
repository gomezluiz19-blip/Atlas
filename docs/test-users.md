# Running a test with real people

Everything below is optional; Terreno works for a visitor with none of it. Switch on what the test needs.

## 1. Accounts (Supabase, about 15 minutes)

Follow *Supabase* in [backend.md](backend.md), then:

- Run `docs/backend.sql` again: it now ends with `delete_me()`, which **Account › Delete my account** calls.
- **Authentication › Rate limits**: the defaults allow a few codes an hour per address, which is right for a
  test. Terreno waits 45 seconds before offering *Send a new code*, and says plainly when the limit is hit.
- **Google or Apple** (optional): *Authentication › Providers*, switch the provider on with its client id and
  secret, add the site's address under *URL configuration › Redirect URLs*, then set the GitHub variable
  `AUTH_PROVIDERS` to `google`, `apple` or `google,apple`. Joining shows *Continue with …* above the email field.

## 2. A closed beta (invite codes)

1. Pick codes, one per tester or one per group: `node scripts/invite-hash.mjs TERRA-ANA TERRA-LISBON`
2. Put the printed hashes in the GitHub variable `INVITE_HASHES` and redeploy.
3. Joining now asks for a code first. Only the hashes ship with the site, never the codes.

This keeps the door closed in the app. For a hard lock, also turn off *Allow new users to sign up* in
Supabase and invite people from *Authentication › Users*.

## 3. What a tester sees

1. **The opening** (under four seconds; any tap skips): the mark assembles, the name settles, a readout of
   where the sun is overhead, then the real Earth, lit by the real sun.
2. **The tour** (a minute; skippable): search, a place page, a lens, a hologram, the live planet, time, Work,
   My Place. Its last step offers *Make it yours: join*.
3. **Joining**: email → six-digit code → name, handle, colour, what brings them, the terms → home (optional).
   Home becomes a My Place, and the Earth flies there.

## 4. Hearing from them

- **Feedback** (account menu › Send feedback): a mood and a sentence, with the last few errors attached.
  Set `FEEDBACK_URL` (e.g. Formspree) to receive it; otherwise it stays on the device to read back.
- Ask testers to try one thing in each mode (Explore, Create, Work, My Place) and, on a phone, **Guide** on a
  short walk.

## 5. Checking a build before testers get it

- `npm test`: the full suite, including every stylesheet parsed the way the build parses it, and load tests.
- `npm run build`: fails on bundle budgets and broken styles.
- Any build opened with `?qa` exposes `window.atlas` for automated runs.
- The browser runs in `scripts/qa/` drive the built site in headless Chromium. They need Playwright
  installed once (`npm i -g playwright`); serve a build with `npm run build && npx vite preview`, then:
  - `node scripts/qa/sweep.mjs` fires every action and records errors and how much of the screen each one
    covers (`--phone` for a 390×844 phone; a word after it limits the run, e.g. `sweep.mjs lens`).
  - `node scripts/qa/stress.mjs` runs themes, layers, 40 places, lenses, tools and 300 pans and zooms,
    printing heap, imagery layers, data sources, primitives and DOM size after each phase.
  - `node scripts/qa/rapid.mjs` hits modes, layers, sign-in, search, tabs and the tour as fast as input
    arrives and checks nothing doubles up.

  Each exits non-zero on an error. Results and screenshots go to `qa-out/` (`QA_URL` and `QA_OUT` change
  where they look and write). Software rendering is slow, so expect a full sweep to take 10–15 minutes.

  The last runs before the test-user build: 123 actions on desktop and on a phone with no errors; the stress
  run with no errors, imagery layers levelling off at 36 and the DOM back to where it began; rapid input with
  no errors, one join card from fifteen opens and one tour from ten starts.
