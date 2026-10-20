# Tests

    node --test tests/referrals.test.mjs

No install step, no network, no secrets. Supabase is stubbed in memory, so
running the suite never writes a row to the live drawing.

`referrals.test.mjs` is the acceptance list from `REFERRAL-BUILD-PROMPT.md`,
run against the real `functions/drawing/enter.js` and the real referrer tally.
The thing every test is guarding: **referrals change recognition, never odds.**
If a change makes a second submit create a second row, or puts the entry
endpoint behind a login, these fail.

One thing the suite cannot check from here: that Cloudflare Access has no rule
covering `/drawing/*`. That lives in the Zero Trust dashboard, not the repo.
Confirm it by hand before each event — an entry form behind a login is not a
free method of entry.
