# Standing up a new customer's copy of this site

This branch (`template`) is a tokenized mirror of the production site. It is
never deployed itself - it's the starting point for a new customer's own
copy. Following this checklist turns it into that customer's real,
independently running deployment.

## 1. Start from this branch

Clone the repo and create the new customer's own branch/repo from `template`
(not from `functions-fix`, which is *this* customer's real production
branch with real values already baked in, not tokens).

## 2. Cloudflare Pages

Create a new Cloudflare Pages project connected to the customer's repo,
with their own production branch (their equivalent of `functions-fix`).

## 3. Cloudflare Access

New Zero Trust team for the customer. Add an Access application covering
their domain, including at minimum `/signin` and every path in
`functions/signin.js`'s `SAFE` list (`/mission-control`, `/housing`,
`/funding`, `/intake-queue`, `/in-kind-report`, `/donations-report`,
`/admin-issue`, `/carwash-report`, `/patrol/run`, `/incident-report`,
`/incident-log`, `/case-management`, `/rounds`), with a policy allowing
their staff emails. Set these Cloudflare Pages environment variables:
- `ACCESS_TEAM_DOMAIN` (bare team name or full `*.cloudflareaccess.com` domain - both work)
- `ACCESS_AUD` (optional - pins to one specific Access application)

No code changes needed here - `functions/_lib/auth.js` and `functions/signin.js`
already read these from `env.*`.

## 4. Supabase

New Supabase project. Run the migrations in `sql/` in order (the numbered
files - `003-case-management.sql`, `004-work-and-compliance.sql`,
`005-clients-spine.sql` - plus whatever base schema they document; the
original housing/intake/funding base tables were created directly in the
Supabase SQL editor for this deployment and aren't captured as a migration
file here, so recreate their columns from `sql/003-005-*.sql`'s `ALTER TABLE`
statements and the app code's own field references before running those).
Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Other services

- Square: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENV` (`production` or `sandbox`)
- Resend: `RESEND_API_KEY`, optionally `RESEND_FROM` (falls back to `tenant-config.js`'s default)
- Anthropic: `ANTHROPIC_API_KEY` (powers the training assistant widget on every staff page)
- Patrol: `PATROL_ENABLED=true` and `PATROL_KEY` once ready to turn on morning briefs - defaults off, on purpose, until the customer is ready

## 6. Fill in identity and run the template script

Two files hold this customer's identity - fill both in:

- **`tenant.config.json`** (repo root) - drives the static HTML pages via the script below.
- **`functions/_lib/tenant-config.js`** - the same identity, read at runtime by Functions (emails, the training assistant, checkout receipts). Keep the two in sync; there's no build step linking them.

Then, once `tenant.config.json` is filled in:

```
node scripts/apply-tenant.mjs
```

This replaces every `{{TOKEN}}` across the static pages with this customer's
real values, and removes the "two entities" sentence on Mission Control
entirely if `secondEntityName` is left `null` (most customers won't have a
sibling organization the way this one does). Commit the result as their
production branch's initial state.

## 7. Staff access

Edit `functions/_lib/roster.js` with the customer's own staff emails and
which systems each person can reach, plus the `ESCALATION` (incident
escalation chain), `DIGESTS` (morning brief recipients), `SCOPES` (Mission
Control client/donor visibility), and `LEADERSHIP_NOTIFY`/`LEADERSHIP_PRIMARY`
(who's told about new incidents/Speak Up submissions) exports - all in that
one file.

## 8. Manual content pass (not automated, do this by hand)

- `index.html`: replace the photos, stats, and program descriptions with
  this customer's own - token substitution only handles name/colors/contact/
  program-name references inside it, not the substance.
- `functions/_lib/assistant-prompts.js`, the `case-management` module: the
  sentence about who does and doesn't have access to case management (e.g.
  "Rob... does not have access to this module") describes *this*
  organization's specific role structure. Rewrite it to match the new
  customer's actual roles - it won't just be a word swap if their structure
  differs.
- Decide whether `carwash.html`, `carwash-report.html`,
  `carwash-confirmed.html`, `thank-you.html`, `verify.html`, and
  `in-kind-receipt.html` are relevant to this customer at all - they weren't
  tokenized in this pass (they read as one-off fundraiser content specific
  to this org, e.g. a specific EIN and a "Car Wash for Recovery" event name)
  and would need either a fresh rewrite or removal.

## 9. Smoke test

- `/whoami` - confirms Access + the roster are wired up correctly
- `/signin` - completes without looping
- One staff module (e.g. `/housing`) - loads data, shows the right roster access
- The public `/get-help` form - submits successfully
- One Square checkout - redirects to *this customer's own* domain, not back here
