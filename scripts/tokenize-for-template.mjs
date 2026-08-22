#!/usr/bin/env node
// scripts/tokenize-for-template.mjs
// Dev tool, run manually and only on the `template` branch: replaces this
// org's real identity strings with {{TOKENS}} across the static HTML pages,
// so `template` stays a tokenized mirror of production. Re-run this after
// pulling newer changes from functions-fix into `template`, then commit the
// result - do not run this against functions-fix itself.
//
// Order matters: longer/more-specific strings must be replaced before the
// shorter strings they contain (e.g. the org's full legal name contains its
// short name as a prefix).
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'index.html', 'get-help.html', 'work-signup.html', 'speak-up.html',
  'fellowship-hall-meetings.html', 'payment-options.html', 'mission-control.html',
  'housing.html', 'funding.html', 'intake-queue.html', 'in-kind-report.html',
  'donations-report.html', 'case-management.html', 'incident-log.html',
  'incident-report.html', 'rounds.html', 'admin-issue.html'
];

// [literal text in the real site, token to replace it with] - order matters, see above.
const REPLACEMENTS = [
  ['The Next Right Thing in Recovery', '{{ORG_LEGAL_NAME}}'],
  ['The Right Thing in Recovery', '{{ORG_SECOND_ENTITY}}'],
  ['The Next Right Thing', '{{ORG_NAME}}'],
  ['8901 South 1300 West, West Jordan, UT 84088', '{{ADDRESS}}'],
  ['(801) 816-4977', '{{PHONE_DISPLAY}}'],
  ['8018164977', '{{PHONE_TEL}}'],
  ['(801) 890-2007', '{{LICENSING_PHONE}}'],
  ['8018902007', '{{LICENSING_PHONE_TEL}}'],
  ['Utah Office of Licensing', '{{LICENSING_BODY}}'],
  ['Rent A Husband', '{{PROGRAM_WORK_CREW_NAME}}'],
  ['nextrighthing.com', '{{EMAIL_DOMAIN}}'],
  ['#1a2744', '{{COLOR_NAVY}}'],
  ['#121c33', '{{COLOR_NAVY_DEEP}}'],
  ['#c9a96e', '{{COLOR_SAND}}'],
  ['#e8d5b0', '{{COLOR_SAND_LIGHT}}']
];

for (const file of FILES) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { console.log('skip (not found): ' + file); continue; }
  let count = 0;
  for (const [literal, token] of REPLACEMENTS) {
    const before = text;
    text = text.split(literal).join(token);
    if (text !== before) count += before.split(literal).length - 1;
  }
  writeFileSync(file, text);
  console.log(file + ': ' + count + ' replacements');
}
