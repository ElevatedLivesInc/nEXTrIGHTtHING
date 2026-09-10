// Acceptance tests for the yard sale drawing referrals ("Who sent you?").
//
// Run:  node --test tests/
//
// These exercise the REAL functions/drawing/enter.js and the REAL referrer
// tally used by Mission Control. Supabase is stubbed in memory, so running
// this never touches the live drawing and never writes a row anyone could
// win with. Nothing here needs network, secrets, or a deploy.
//
// The seven cases below are the acceptance list in REFERRAL-BUILD-PROMPT.md.
// The one they all serve: referrals change recognition, never odds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { onRequestPost } from '../functions/drawing/enter.js';
import { tallyReferrers, countReferred } from '../functions/_lib/referrals.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- fake supabase

function makeSupabase() {
  const rows = [];
  let nextId = 1;
  const calls = [];

  async function fakeFetch(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    calls.push({ method, url });
    const u = new URL(url);
    const q = u.searchParams;

    if (method === 'GET') {
      const wantEmail = (q.get('email') || '').replace(/^eq\./, '');
      const wantPhone = (q.get('phone') || '').replace(/^eq\./, '');
      const wantEvent = (q.get('event') || '').replace(/^eq\./, '');
      const hit = rows.filter(r =>
        r.event === wantEvent &&
        (wantEmail ? r.email === decodeURIComponent(wantEmail) : true) &&
        (wantPhone ? r.phone === decodeURIComponent(wantPhone) : true));
      return new Response(JSON.stringify(hit.slice(0, 1)), { status: 200 });
    }

    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      rows.push({ id: nextId++, ...body });
      return new Response('', { status: 201 });
    }

    if (method === 'PATCH') {
      const id = Number((q.get('id') || '').replace(/^eq\./, ''));
      const patch = JSON.parse(opts.body);
      const row = rows.find(r => r.id === id);
      if (row) Object.assign(row, patch);
      // 204 must have a null body - a string body makes the Response constructor
      // throw, which the endpoint's try/catch would swallow into a false insert.
      return new Response(null, { status: 204 });
    }

    return new Response('', { status: 405 });
  }

  return { rows, calls, fakeFetch };
}

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' };

// Drive the endpoint the way Cloudflare Pages does: a Request, no cookies.
async function enter(db, body, headers = {}) {
  const saved = globalThis.fetch;
  globalThis.fetch = db.fakeFetch;
  try {
    const request = new Request('https://nextrighthing.com/drawing/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const res = await onRequestPost({ request, env: ENV });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = saved;
  }
}

// ------------------------------------------------------------------- the seven

test('1. a referrer is stored; a blank one stores null', async () => {
  const db = makeSupabase();

  const withRef = await enter(db, { name: 'Dana Wells', email: 'dana@example.com', referred_by: 'Sarah M.' });
  assert.equal(withRef.body.ok, true);
  assert.equal(db.rows.at(-1).referred_by, 'Sarah M.');

  const without = await enter(db, { name: 'Ivan Cruz', email: 'ivan@example.com' });
  assert.equal(without.body.ok, true);
  assert.equal(db.rows.at(-1).referred_by, null, 'blank referrer must be null, not ""');

  const whitespace = await enter(db, { name: 'Nia Park', email: 'nia@example.com', referred_by: '   ' });
  assert.equal(whitespace.body.ok, true);
  assert.equal(db.rows.at(-1).referred_by, null, 'whitespace-only referrer must be null');
});

test('2. the same email twice creates exactly one row (odds are not stacked)', async () => {
  const db = makeSupabase();
  await enter(db, { name: 'Dana Wells', email: 'dana@example.com' });
  const second = await enter(db, { name: 'Dana Wells', email: 'dana@example.com' });

  assert.equal(second.body.already, true);
  assert.equal(db.rows.length, 1, 'a second submit must never add a row');
  assert.equal(db.calls.filter(c => c.method === 'POST').length, 1);
});

test('2b. the same phone twice also creates exactly one row', async () => {
  const db = makeSupabase();
  await enter(db, { name: 'Rob Diaz', phone: '801-555-0142' });
  const second = await enter(db, { name: 'Rob Diaz', phone: '801-555-0142' });

  assert.equal(second.body.already, true);
  assert.equal(db.rows.length, 1);
});

test('3. a repeat entry fills in a referrer the first one lacked', async () => {
  const db = makeSupabase();
  await enter(db, { name: 'Dana Wells', email: 'dana@example.com' });
  assert.equal(db.rows[0].referred_by, null);

  const second = await enter(db, { name: 'Dana Wells', email: 'dana@example.com', referred_by: 'Krystal' });
  assert.equal(second.body.already, true);
  assert.equal(second.body.referrerAdded, true);
  assert.equal(db.rows.length, 1, 'filling the column must not create a row');
  assert.equal(db.rows[0].referred_by, 'Krystal');
});

test('3b. a repeat entry does not overwrite a referrer already on the row', async () => {
  const db = makeSupabase();
  await enter(db, { name: 'Dana Wells', email: 'dana@example.com', referred_by: 'Krystal' });
  const second = await enter(db, { name: 'Dana Wells', email: 'dana@example.com', referred_by: 'Somebody Else' });

  assert.equal(second.body.referrerAdded, undefined);
  assert.equal(db.rows[0].referred_by, 'Krystal', 'first credit wins');
});

test('3c. a failed referrer PATCH still consolidates - it never inserts a second row', async () => {
  const db = makeSupabase();
  await enter(db, { name: 'Dana Wells', email: 'dana@example.com' });

  // Simulate Supabase refusing the update mid-sale.
  const real = db.fakeFetch;
  const flaky = async (url, opts = {}) =>
    (opts.method || 'GET').toUpperCase() === 'PATCH'
      ? Promise.reject(new Error('network'))
      : real(url, opts);

  const saved = globalThis.fetch;
  globalThis.fetch = flaky;
  let res;
  try {
    const request = new Request('https://nextrighthing.com/drawing/enter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dana Wells', email: 'dana@example.com', referred_by: 'Krystal' })
    });
    const r = await onRequestPost({ request, env: ENV });
    res = await r.json();
  } finally { globalThis.fetch = saved; }

  assert.equal(res.already, true);
  assert.equal(res.referrerAdded, undefined, 'do not claim a credit we failed to write');
  assert.equal(db.rows.length, 1, 'a failed thank-you must never become a second entry');
});

test('4. a filled honeypot answers ok and writes nothing', async () => {
  const db = makeSupabase();
  const res = await enter(db, {
    name: 'Bot McBotface', email: 'bot@example.com',
    referred_by: 'Bot', website: 'http://spam.example'
  });

  assert.equal(res.body.ok, true, 'bots must not learn they were caught');
  assert.equal(db.rows.length, 0);
  assert.equal(db.calls.length, 0, 'the honeypot must short-circuit before any database call');
});

test('5. topReferrers groups " Sarah M. ", "sarah m." and "Sarah M" as one person', () => {
  const top = tallyReferrers([
    { referred_by: ' Sarah M. ' },
    { referred_by: 'sarah m.' },
    { referred_by: 'Sarah M' },
    { referred_by: 'Krystal' },
    { referred_by: '' },
    { referred_by: null }
  ]);

  assert.equal(top.length, 2);
  assert.equal(top[0].count, 3);
  assert.equal(top[0].name.trim(), 'Sarah M.');
  assert.equal(top[1].name, 'Krystal');
  assert.equal(top[1].count, 1);
});

test('5b. countReferred ignores blank and whitespace-only names', () => {
  assert.equal(countReferred([
    { referred_by: 'Krystal' }, { referred_by: '  ' }, { referred_by: null }, {}
  ]), 1);
});

test('5c. topReferrers returns at most the limit, highest first', () => {
  const entries = [];
  ['a','b','c','d','e','f'].forEach((n, i) => {
    for (let k = 0; k <= i; k++) entries.push({ referred_by: n });
  });
  const top = tallyReferrers(entries, 5);
  assert.equal(top.length, 5);
  assert.deepEqual(top.map(t => t.count), [6, 5, 4, 3, 2]);
});

test('6. a 400-character referrer is truncated to 120, not rejected', async () => {
  const db = makeSupabase();
  const long = 'M'.repeat(400);
  const res = await enter(db, { name: 'Dana Wells', email: 'dana@example.com', referred_by: long });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(db.rows[0].referred_by.length, 120);
});

test('7. /drawing/enter answers a POST with no session cookie', async () => {
  const db = makeSupabase();
  // No Cookie header, no CF_Authorization, no Access JWT. This is the free
  // method of entry - if it ever needs a login, the drawing is unlawful.
  const res = await enter(db, { name: 'Dana Wells', email: 'dana@example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.entered, true);

  const src = readFileSync(join(ROOT, 'functions/drawing/enter.js'), 'utf8');
  assert.ok(!/getAuthedEmail|_lib\/auth/.test(src), 'the public entry endpoint must not import auth');
  assert.ok(!/CF_Authorization|Cf-Access/i.test(src), 'the public entry endpoint must not read Access headers');
});

// ------------------------------------------------------- guards on the rules

test('8. the published rules still promise consolidated entries and unchanged odds', () => {
  // The rules are wrapped across lines in the page; compare on flattened whitespace.
  const page = readFileSync(join(ROOT, 'yard-sale.html'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(/Duplicate entries are consolidated, not stacked/i.test(page));
  assert.ok(/will not improve your chance of winning/i.test(page));
  assert.ok(/id="ref"/.test(page), 'the who-sent-you field is on the form');
  assert.ok(/referred_by/.test(page), 'the form posts the referrer');
  // The referrer is typed by the friend, never carried in the shared link.
  const share = page.match(/nextrighthing\.com\/yard-sale[^'"`\s]*/g) || [];
  share.forEach(u => assert.ok(!/[?&](ref|utm_|r)=/.test(u), 'shared URL must carry no tracking parameter: ' + u));
});

test('9. the entry endpoint stores no raw IP and no resident data', () => {
  const src = readFileSync(join(ROOT, 'functions/drawing/enter.js'), 'utf8');
  assert.ok(/ip_hash/.test(src));
  assert.ok(!/\bip\s*:/.test(src), 'the raw IP must never be written to a column');
  assert.ok(!/residents|clients|case_notes/.test(src), 'the public endpoint must not touch staff tables');
});
