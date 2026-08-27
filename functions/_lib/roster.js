// functions/_lib/roster.js
// Who can see which staff system. One file, so adding or removing a person is
// a single edit instead of a hunt through a dozen endpoints.
//
// "client" systems hold treatment-center data (residents, intake, scholarships).
// "donor" systems hold nonprofit data (in-kind codes, cash gifts). Keeping the
// two rosters distinct is what keeps the for-profit and 501(c)(3) sides of the
// house separated, so do not merge them for convenience.

export const ROSTER = {
  'funding':          ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com','rob@nextrighthing.com'],
  'housing':          ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','cateo@nextrighthing.com','rob@nextrighthing.com','bailey@nextrighthing.com'],
  'intake-queue':     ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','bailey@nextrighthing.com','cateo@nextrighthing.com'],
  'in-kind-report':   ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com'],
  'donations-report': ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com'],
  'incident':         ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','cateo@nextrighthing.com','rob@nextrighthing.com','bailey@nextrighthing.com'],
  // Case management is the clinical side. Rob is deliberately absent: he runs
  // the houses and the rent, and Cate's rule is that those two roles do not
  // see each other's data.
  'case-management':  ['elevatedlivesllc@gmail.com','gabe@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com']
};

export function allowedFor(system) {
  return ROSTER[system] || [];
}

// Who each escalated incident goes to. Level 0 is the person who filed it.
// (Moved here from incident/save.js's local CHAIN constant - same values.)
export const ESCALATION = [
  { level: 0, label: 'Filed', to: null },
  { level: 1, label: 'House / Program Manager', to: 'rob@nextrighthing.com' },
  { level: 2, label: 'Clinical & Executive', to: 'cateo@nextrighthing.com' },
  { level: 3, label: 'Licensing / External', to: 'gabe@nextrighthing.com' }
];

// Who gets each morning patrol brief. Every brief goes to Cate and Gabe only,
// on purpose - see functions/patrol/run.js for why. (Moved here from that
// file's local TEAM constant - same values.)
export const DIGESTS = {
  intake:     ['cateo@nextrighthing.com', 'gabe@nextrighthing.com'],
  donations:  ['cateo@nextrighthing.com', 'gabe@nextrighthing.com'],
  housing:    ['cateo@nextrighthing.com', 'gabe@nextrighthing.com'],
  funding:    ['cateo@nextrighthing.com', 'gabe@nextrighthing.com'],
  leadership: ['cateo@nextrighthing.com', 'gabe@nextrighthing.com']
};

// Mission Control scopes: which side(s) of the house each person can see.
// "client" = treatment-center data, "donor" = nonprofit data. (Moved here
// from mission-control/summary.js's local ROLES constant - same values.)
export const SCOPES = {
  'gabe@nextrighthing.com':   ['client', 'donor'],
  'elevatedlivesllc@gmail.com': ['client', 'donor'],   // Trudy / Rein N' Solutions
  'cateo@nextrighthing.com':  ['client', 'donor'],
  'bailey@nextrighthing.com': ['client', 'donor'],
  'rob@nextrighthing.com':    ['client'],
  'ryan@nextrighthing.com':   ['donor']
};

// Notified on every new incident/Speak Up submission, regardless of roster
// above - leadership sees everything that comes in. LEADERSHIP_PRIMARY is
// the narrower list used for lower-severity incidents (see incident/save.js).
export const LEADERSHIP_NOTIFY = ['gabe@nextrighthing.com', 'cateo@nextrighthing.com'];
export const LEADERSHIP_PRIMARY = ['gabe@nextrighthing.com'];
