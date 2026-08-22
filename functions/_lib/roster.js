// functions/_lib/roster.js
// Who can see which staff system. One file, so adding or removing a person is
// a single edit instead of a hunt through a dozen endpoints.
//
// "client" systems hold treatment-center data (residents, intake, scholarships).
// "donor" systems hold nonprofit data (in-kind codes, cash gifts). Keeping the
// two rosters distinct is what keeps the for-profit and 501(c)(3) sides of the
// house separated, so do not merge them for convenience.

export const ROSTER = {
  'funding':          ['gabe@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com','rob@nextrighthing.com'],
  'housing':          ['gabe@nextrighthing.com','cateo@nextrighthing.com','rob@nextrighthing.com','bailey@nextrighthing.com'],
  'intake-queue':     ['gabe@nextrighthing.com','bailey@nextrighthing.com','cateo@nextrighthing.com'],
  'in-kind-report':   ['gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com'],
  'donations-report': ['gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com'],
  'incident':         ['gabe@nextrighthing.com','cateo@nextrighthing.com','rob@nextrighthing.com','bailey@nextrighthing.com']
};

export function allowedFor(system) {
  return ROSTER[system] || [];
}
