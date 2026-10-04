# Terreno: due diligence index

Where to find what an investor, a customer's IT or procurement team, or an acquirer will ask for. Items marked
**(you)** need the founder; everything else is in this repository.

## The company

| Item | Status | Where |
|---|---|---|
| Name | Terreno, at terreno.site | `docs/legal/company.json` (one place for the name, emails and address) |
| Legal entity | **(you)** form it (Delaware C-corp if raising; LLC if bootstrapping) and fill `company`, `address`, `governing_law` in company.json | |
| Trademark | **(you)** search USPTO (tmsearch.uspto.gov) for "Terreno" in classes 9 (software) and 42 (SaaS) before filing. Note there's a listed company called Terreno Realty Corporation (industrial real estate, NYSE: TRNO); different goods and services, but ask a trademark attorney whether to add a distinguishing word for real-estate-facing marketing | |
| IP ownership | All code is in this repository, written for the company; assign it to the entity when it's formed **(you)** | |
| Third-party code | All 54 shipped packages are under permissive licences (MIT, Apache-2.0, ISC, BSD); none copyleft | [third-party-licenses.md](third-party-licenses.md), regenerate with `node scripts/licenses.mjs` |
| Data and services | Every source, its licence and what to do before charging | [../data-licensing.md](../data-licensing.md) |

## Legal and trust (published at terreno.site/legal/)

| Document | File | Status |
|---|---|---|
| Terms of Service | [../legal/terms.md](../legal/terms.md) | Draft, needs counsel review |
| Privacy Policy | [../legal/privacy.md](../legal/privacy.md) | Draft, written to match how the app actually behaves |
| Acceptable Use | [../legal/acceptable-use.md](../legal/acceptable-use.md) | Draft; includes no surveillance of workers' protected activity |
| Data Processing Addendum | [../legal/dpa.md](../legal/dpa.md) | Draft; includes FERPA/student-data and government terms |
| Security overview | [../legal/security.md](../legal/security.md) | Draft |
| Subprocessors | [../legal/subprocessors.md](../legal/subprocessors.md) | Confirm the email provider once chosen |
| Accessibility statement | [../legal/accessibility.md](../legal/accessibility.md) | Automated WCAG 2.1 AA checks pass on every Pro screen |

The pages say "Draft for review" until `reviewed_by_counsel` is set to `true` in company.json, with an
`effective_date`.

## Security and engineering

- Architecture, access control (row-level security), encryption, backups, versioning, incident response:
  [../legal/security.md](../legal/security.md); database policies in [../backend.sql](../backend.sql) and
  [../workspaces.sql](../workspaces.sql).
- Content Security Policy on the built site (vite.config.ts); `security.txt` at `/.well-known/security.txt`.
- CI on every change: type check, 570+ automated tests, `npm audit` (critical vulnerabilities block a deploy),
  a download-size budget.
- No customer data in development; demos use invented data.
- **Planned:** independent penetration test before the first government or enterprise contract; SOC 2 when a
  customer requires it; single sign-on for organizations.

## Founder setup checklist

### 1. Domain (terreno.site at Namecheap → GitHub Pages)
1. GitHub › the repository › Settings › Pages › Custom domain: `terreno.site`, Save. (The repository already
   ships `public/CNAME` with this domain.)
2. Namecheap › Domain List › terreno.site › Advanced DNS, add:
   - `A` records for host `@` to each of `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for host `www` to `gomezluiz19-blip.github.io.`
   - Remove Namecheap's default parking records for `@` and `www`.
3. Back in GitHub Pages, once the DNS check passes (minutes to a few hours), tick **Enforce HTTPS**.

### 2. Email on the domain
- Free forwarding first: Namecheap › Domain › Redirect Email: forward `hello@terreno.site` and
  `security@terreno.site` to your inbox. (These two addresses are already on the legal pages and in
  security.txt.)
- For sign-in emails (needed before real users): an email provider such as Resend or Postmark; add the DNS
  records it gives you (SPF, DKIM, and a DMARC record like `v=DMARC1; p=none; rua=mailto:hello@terreno.site`), then
  Supabase › Authentication › SMTP settings with sender `Terreno <login@terreno.site>`.

### 3. Supabase
- Run `docs/backend.sql`, `docs/stories-backend.sql`, `docs/workspaces.sql`.
- Authentication › URL configuration: Site URL `https://terreno.site`; add `https://terreno.site/**` and
  `http://localhost:5173/**` to Redirect URLs.
- Email template (Magic link): `Your Terreno code is {{ .Token }}`.
- Plan: the Pro plan gives daily backups (the security page says 7-day retention); the free plan pauses
  inactive projects and has no backups. Upgrade before the first customer.
- GitHub › Settings › Secrets and variables › Actions › Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

### 4. Imagery licence (before charging anyone)
- Either an Esri Location Platform key (`ESRI_KEY` secret), or MapTiler (`IMAGERY=maptiler` variable +
  `MAPTILER_KEY` secret) or Mapbox. Restrict the key to `terreno.site` in the provider's dashboard.

### 5. Edge worker (Cloudflare)
- `ALLOWED_ORIGINS=https://terreno.site,https://www.terreno.site,http://localhost:5173`;
  `USER_AGENT=Terreno (https://terreno.site; hello@terreno.site)`.

### 6. Counsel review
- Fill company.json; have an attorney review the six documents in docs/legal; set `reviewed_by_counsel: true`
  and `effective_date`.

### 7. Accounts with multi-factor authentication
- GitHub, Supabase, Cloudflare, Namecheap, the email provider: turn on MFA for each (the security page
  commits to it).
