# Security overview

How {{PRODUCT}} protects the information people and organizations put into it. Written for IT, security and
procurement reviewers; ask {{SECURITY_EMAIL}} for anything not covered here.

## Architecture

- **The app** is a static web application (HTML, JavaScript, map data) served from a content delivery network.
  There is no application server holding customer data that could be misconfigured; the browser talks to the
  database through its API, as the signed-in person.
- **The database** is Postgres, hosted by Supabase (independently audited, SOC 2 Type II), in the United States.
  Every table has **row-level security**: a rule in the database itself decides which rows each person can read
  or write. Team workspaces check the person's role (owner, editor, viewer) with a database function, so a
  modified web page can't grant itself more access.
- **The edge service** (a Cloudflare Worker) holds third-party service keys so they never ship in the page, and
  caches public data requests. It stores no customer data.
- **Local-first.** Much of the Service works without an account, keeping data in the person's own browser. Data
  goes to our servers only when someone signs in and syncs or shares it.

## Identity and access

- Sign-in by a one-time code sent to the person's email; no passwords to leak or reuse.
- Sessions are short-lived tokens that refresh; signing out ends the session on the server.
- Organizations control their own workspaces: owners invite people by email, set roles, and remove access.
- Production access at {{COMPANY}} is limited to named people, each with multi-factor authentication.

## Data protection

- **In transit:** TLS everywhere (HTTPS only).
- **At rest:** encrypted by our providers.
- **Integrity:** every workspace save creates a new version; the database refuses a save made from an
  out-of-date copy, so one person's change can't silently overwrite another's; the latest 200 versions are kept
  and can be restored.
- **Backups:** daily database backups by our provider (kept 7 days on our current plan); customers can download
  any workspace as a file at any time, with or without an account.
- **Exports:** CSV exports neutralise spreadsheet formulas, so data typed by one person can't run as a formula
  on another's computer.
- **Deletion:** on request or account closure, within 30 days (backups within a further 30).

## Application security

- The page escapes everything it displays, and printable reports are generated with escaping.
- Dependencies are kept current; `npm audit` runs as part of review.
- Every change runs the automated test suite (500+ tests) and a type check before it's deployed.
- No customer data is used in development or testing; demos use invented data.

## Privacy by design

- No advertising, no cross-site tracking, no sale of data, no AI training on customer data.
- Camera analysis runs on the device.
- Requests to public data providers carry coordinates, not identities, and can be routed through our edge so the
  provider doesn't see the person's IP address.

## Incidents

We have a documented incident response process: contain, assess, notify affected customers without undue delay
(and within 72 hours for organizations under our DPA), remediate, and review.

## Reporting a vulnerability

Email {{SECURITY_EMAIL}}. Please give us reasonable time to fix an issue before disclosing it, and don't access
other people's data, degrade the Service or use social engineering while testing. We won't take legal action
against good-faith research that follows these rules. Our security.txt is at `/.well-known/security.txt`.

## Roadmap

Independent penetration test before the first government or enterprise contract; SOC 2 Type I, then Type II, as
customers require; single sign-on (SAML/OIDC) for organizations.
