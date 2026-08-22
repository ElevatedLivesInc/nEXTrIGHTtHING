#!/usr/bin/env node
// scripts/apply-tenant.mjs
// Run once, when standing up a new customer's copy of this site, on a clone
// of the `template` branch (never run this against functions-fix/production -
// there are no {{TOKENS}} there to replace, and it will refuse to run).
//
//   1. Fill in tenant.config.json with the new customer's identity.
//   2. node scripts/apply-tenant.mjs
//   3. Commit the result as that customer's own main/production branch.
//
// Colors and every piece of contact/org-identity text on the static pages
// come from tenant.config.json this way, in one pass, instead of being
// hand-edited across a couple dozen HTML files.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'index.html', 'get-help.html', 'work-signup.html', 'speak-up.html',
  'fellowship-hall-meetings.html', 'payment-options.html', 'mission-control.html',
  'housing.html', 'funding.html', 'intake-queue.html', 'in-kind-report.html',
  'donations-report.html', 'case-management.html', 'incident-log.html',
  'incident-report.html', 'rounds.html', 'admin-issue.html'
];

const config = JSON.parse(readFileSync('tenant.config.json', 'utf8'));

const licensingPhoneTel = (config.licensingPhone || '').replace(/[^0-9]/g, '');

const TOKENS = {
  '{{ORG_LEGAL_NAME}}': config.orgLegalName,
  '{{ORG_NAME}}': config.orgName,
  '{{ADDRESS}}': config.address,
  '{{PHONE_DISPLAY}}': config.phoneDisplay,
  '{{PHONE_TEL}}': config.phoneTel,
  '{{LICENSING_PHONE_TEL}}': licensingPhoneTel,
  '{{LICENSING_PHONE}}': config.licensingPhone,
  '{{LICENSING_BODY}}': config.licensingBody,
  '{{PROGRAM_WORK_CREW_NAME}}': config.programWorkCrewName,
  '{{EMAIL_DOMAIN}}': config.emailDomain,
  '{{COLOR_NAVY}}': config.colors.navy,
  '{{COLOR_NAVY_DEEP}}': config.colors.navyDeep,
  '{{COLOR_SAND}}': config.colors.sand,
  '{{COLOR_SAND_LIGHT}}': config.colors.sandLight
  // {{ORG_SECOND_ENTITY}} is handled separately below, since a customer
  // without a second entity needs that whole sentence removed, not just the
  // one word substituted.
};

let totalReplacements = 0;
let filesTouched = 0;

for (const file of FILES) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { console.log('skip (not found): ' + file); continue; }

  const hadAnyToken = /\{\{[A-Z_]+\}\}/.test(text);
  if (!hadAnyToken) { console.log(file + ': no tokens found, left as-is'); continue; }

  // The two-entity sentence in mission-control.html is wrapped in these
  // markers. Keep it (with ORG_SECOND_ENTITY substituted) only if this
  // customer actually has a second entity; otherwise the whole sentence goes.
  if (config.secondEntityName) {
    text = text.split('{{ORG_SECOND_ENTITY}}').join(config.secondEntityName);
    text = text.replace(/\s*<!-- SECOND-ENTITY-START -->/g, '').replace(/\s*<!-- SECOND-ENTITY-END -->/g, '');
  } else {
    text = text.replace(/\s*<!-- SECOND-ENTITY-START -->[\s\S]*?<!-- SECOND-ENTITY-END -->/g, '');
  }

  let count = 0;
  for (const [token, value] of Object.entries(TOKENS)) {
    const before = text;
    text = text.split(token).join(value);
    if (text !== before) count += before.split(token).length - 1;
  }

  const stillHasTokens = /\{\{[A-Z_]+\}\}/.test(text);
  if (stillHasTokens) {
    const leftover = text.match(/\{\{[A-Z_]+\}\}/g);
    console.warn(file + ': WARNING - unreplaced tokens remain: ' + [...new Set(leftover)].join(', '));
  }

  writeFileSync(file, text);
  filesTouched++;
  totalReplacements += count;
  console.log(file + ': ' + count + ' replacements');
}

if (filesTouched === 0) {
  console.error('\nNo files contained any {{TOKENS}} - refusing to continue.');
  console.error('This usually means apply-tenant.mjs was already run here, or this is not a checkout of the `template` branch.');
  process.exit(1);
}

console.log('\nDone: ' + totalReplacements + ' replacements across ' + filesTouched + ' file(s).');
