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
- Any build opened with `?qa` exposes `window.atlas` for automated runs (the action sweep drives every
  action in the app this way and reports errors and overlapping panels).
