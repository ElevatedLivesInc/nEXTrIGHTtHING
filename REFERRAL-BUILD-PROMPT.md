# Build prompt — yard sale drawing referrals

Paste this whole file into a Claude Code session opened on the
`ElevatedLivesInc/nEXTrIGHTtHING` repo. It assumes nothing about what you
remember; everything it needs is stated below.

---

## What you are building

The yard sale drawing at `/yard-sale` currently takes a free entry (name +
email/phone) and writes it to Supabase. Add referral attribution so we can
answer one question: **who sent this person?**

Launch scope is deliberately small — a name typed into a box and a manual
tally. No unique links, no code generation, no attribution platform. Those
come later if the mechanic proves out.

## Hard constraints — read before writing anything

1. **Do not change the drawing's odds.** Referrals affect recognition only,
   never a person's chance of winning. The published rules say *"One entry per
   person. Duplicate entries are consolidated, not stacked"* and *"a purchase
   or donation will not improve your chance of winning."* Both must stay true.
   Utah has no charitable-raffle exemption; this drawing is lawful precisely
   because there is no consideration and three genuinely free entry methods
   carry equal weight. Nothing you build may put a thumb on that scale.

2. **`/drawing/enter` must stay outside Cloudflare Access.** It is public on
   purpose — a free method of entry cannot sit behind a login. The existing
   file says so in a comment. Do not move it, do not add auth to it.

3. **Do not touch the rules text** in `yard-sale.html` unless explicitly asked.
   The published rules describe one grand prize. If the product later
   advertises a promoter prize or a tiered prize ladder, that is a rules
   amendment reviewed by a person, not a code change.

4. **Referrer is a free-text name, not a person record.** Do not try to match
   it to `clients`, `residents`, or any staff table. It is a string someone
   typed. Treat it as untrusted input.

5. Reuse the site's existing look: navy `#1a2744` / deep `#121c33`, gold
   `#c9a96e` / `#e8d5b0`, lavender `#c9b6f0`, Cormorant Garamond + Raleway.
   No new design system, no new dependencies.

## Existing pieces you are extending

- `yard-sale.html` — the public page. The entry form is in `<section id="enter">`
  and posts JSON to `/drawing/enter`.
- `functions/drawing/enter.js` — public POST handler. Already does: input
  cleaning with length caps, a honeypot field (`website`), a SHA-256 hash of
  the IP for flood detection (the raw IP is never stored), and dedupe by
  email-or-phone scoped to `event=fall-yard-sale-2026`.
- Supabase table `drawing_entries` — columns in use: `event`, `name`, `email`,
  `phone`, `entry_method`, `consent_contact`, `ip_hash`, `created_at`.
- `functions/_lib/tenant-config.js` — `TENANT.currentEvent` holds the live
  event (`key`, `name`, `url`, `startsOn`, `endsOn`, `drawingOn`, `blurb`).
- `functions/mission-control/summary.js` — already counts entries for
  `TENANT.currentEvent.key` and returns them as `event.entries` / `event.today`.
- `mission-control.html` — the Events & Opportunities tile renders that.

## Tasks

### 1. Migration — `sql/008-drawing-referrals.sql`

Add two nullable columns to `public.drawing_entries`, `if not exists` so the
file is safe to re-run:

- `referred_by text` — the name the entrant typed, capped at 120 chars in the
  endpoint.
- `checked_in boolean not null default false` — set by hand later for people
  who actually showed up at the sale.

Add an index on `(event, referred_by)`. Include a header comment in the same
style as `sql/005` through `sql/007`: what it is for, when it was applied, and
that it is safe to re-run.

### 2. Form field — `yard-sale.html`

In the entry form, below the email field and above the consent checkbox, add
one optional input:

- Label: **Who sent you?** *(optional)*
- Helper text: *"If a friend told you about this, put their name here so we can
  thank them."*
- `id="ref"`, `maxlength="120"`, not required.

Send it as `referred_by` in the existing POST body. Do not restructure the form
or change the submit handler's shape — add one key.

### 3. Endpoint — `functions/drawing/enter.js`

Accept `referred_by`, clean it with the existing `clean()` helper at 120 chars,
and store `null` when blank. Two things to be careful about:

- The dedupe path currently returns early with `{ok:true, entered:true,
  already:true}` when someone re-enters. If a repeat entrant supplies a
  referrer and the stored row has none, **PATCH the existing row** to fill it
  in rather than silently discarding it. Do not create a second row — that
  would break "duplicate entries are consolidated, not stacked."
- The honeypot path must still return `{ok:true}` and store nothing.

### 4. Thank-you state — `yard-sale.html`

After a successful entry the page already swaps in a confirmation. Extend that
state with a share block:

- A line of copy: *"Now bring your people. Whoever moves the most gets thanked
  by name at the sale."*
- A **Copy the link** button that writes `https://nextrighthing.com/yard-sale`
  plus one line of pre-written text to the clipboard via
  `navigator.clipboard.writeText`, with a visible "Copied" confirmation. Fall
  back to selecting the text in a readonly input where the clipboard API is
  unavailable.
- Native share via `navigator.share` when it exists, since most traffic is
  mobile. Feature-detect; never assume it is there.

No tracking parameters on the copied URL. The referrer is typed by the friend,
not carried in the link — that is the whole launch design.

### 5. Staff view — extend `functions/mission-control/summary.js`

The endpoint already fetches `drawing_entries` for the current event. Also
return, inside the existing `event` object:

- `referred` — how many entries name a referrer.
- `topReferrers` — up to 5 `{name, count}`, sorted desc, grouped
  case-insensitively and trimmed, so "sarah m" and "Sarah M." count once.
- `checkedIn` — how many rows have `checked_in = true`.

Then surface it on the Events tile in `mission-control.html`: add a
**Referred** number beside the existing Entries / Added Today, and render the
top three referrers as a line of text under the tile's description. Keep it to
one line; this is a hub tile, not a report.

## Acceptance tests

Write these as a short script or run them by hand and paste the output:

1. Entering with a referrer stores the name; entering without one stores null.
2. The same email entering twice creates exactly **one** row.
3. That second entry, if it supplies a referrer the first did not, fills the
   column in on the existing row.
4. A filled honeypot returns `ok:true` and writes nothing.
5. `topReferrers` groups `" Sarah M. "`, `"sarah m."` and `"Sarah M"` as one
   person with a count of 3.
6. A 400-character referrer is truncated to 120, not rejected and not stored raw.
7. `/drawing/enter` still answers a POST with no session cookie — if it ever
   requires auth, the free entry method is broken and the drawing is too.

## Out of scope — do not build these

Unique referral links, promoter codes, automatic attribution, a leaderboard
page, a prize-tier meter, email notifications to referrers, or anything that
writes to `residents`, `clients` or any staff table.
