// tenant-config.template.js — the one file you fill per client.
// Pattern lifted from NRT functions/_lib/tenant-config.js: "who are we" lives here,
// "who can see what" lives in roster.js. Forking this file for a new client must
// never touch access. Every value comes from the intake questionnaire (Q#).
export const TENANT = {
  orgName: '',               // Q1
  orgLegalName: '',          // Q2 (or same as orgName)
  tagline: '',               // Q3, one sentence in the customer's words
  services: [                // Q4, most profitable first
    // { name: '', blurb: '' }
  ],
  serviceArea: [],           // Q5
  address: '',               // Q6, or null for service-area-only
  phoneDisplay: '', phoneTel: '', email: '',   // Q7
  hours: '',                 // Q8
  website: '',               // Q9
  gbpUrl: '',                // Q10
  idealCustomer: '',         // Q11
  differentiators: [],       // Q12
  testimonials: [],          // Q14, with permission only
  colors: { brand: '#14233c', accent: '#d4a94f' }, // Q15 overrides Rein defaults
  leadRouting: { email: true, sms: false },        // Q16
  guardrails: [],            // Q17, things we must never claim

  // Mission Control Lite protocol: targets this owner agreed to (NRT pattern).
  protocol: {
    callbackHours: 4,        // a lead unanswered longer than this goes hot
    reviewReplyDays: 3,      // an unreplied review older than this goes warm
  },

  // Package bought, so the dashboard shows only what was sold.
  plan: 'standard',          // 'basic' | 'standard' | 'premium'
};
