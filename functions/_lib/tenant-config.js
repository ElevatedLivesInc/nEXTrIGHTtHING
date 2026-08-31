// functions/_lib/tenant-config.js
// This deployment's org identity - name, contact info, colors, licensing
// jurisdiction, named programs. One file per customer, edited once when
// standing up a new organization's copy of this site.
//
// Staff emails/access live in roster.js instead - that's "who is allowed to
// see what," this is "who are we." Keeping them separate means forking this
// file for a new customer never touches who has access to anything.
export const TENANT = {
  orgName: 'The Next Right Thing',
  orgLegalName: 'The Next Right Thing in Recovery',
  secondEntityName: 'The Right Thing in Recovery', // sibling 501(c)(3), or null if there isn't one
  emailDomain: 'nextrighthing.com',

  phoneDisplay: '(801) 816-4977',
  phoneTel: '8018164977',
  address: '8901 South 1300 West, West Jordan, UT 84088',
  website: 'nextrighthing.com',

  colors: { navy: '#1a2744', navyDeep: '#121c33', sand: '#c9a96e', sandLight: '#e8d5b0' },

  licensingBody: 'Utah Office of Licensing',
  licensingPhone: '(801) 890-2007',
  licensingPortalNote: 'the Provider Portal within one business day',

  programs: { workCrew: { key: 'rent_a_husband', label: 'Rent A Husband' } },

  defaultFromName: 'NRT Patrol',
  defaultFromAddress: 'patrol@nextrighthing.com',

  // The one live fundraiser/event Mission Control's Events tile and
  // /mission-control/summary report on. `key` must match the `event` value
  // functions/drawing/enter.js writes to drawing_entries, or every entry
  // count on the hub silently reads zero. Set to null between events.
  currentEvent: {
    key: 'fall-yard-sale-2026',
    name: '2nd Annual End-of-Summer Yard Sale',
    url: '/yard-sale',
    blurb: 'Free prize drawing, no purchase necessary.',
    startsOn: '2026-09-04',
    endsOn: '2026-09-07',
    drawingOn: '2026-09-07'
  }
};
