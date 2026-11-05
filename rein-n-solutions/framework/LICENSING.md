# The boilerplate as a product — license, sell, repeat

## What's actually ownable IP
1. **The Mission Control pattern**: tenant-config + roster split, StatTile/Alert dashboard, protocol targets, morning brief (Patrol). Proven on a real operation.
2. **The Rein design system** (tokens + components).
3. **The SOP + intake + prompt library** (this folder).
4. **The niche variant**: sober-living/recovery-housing Mission Control (beds, intake queue, funding cliffs) built *from* the NRT version **only with NRT's agreement** on who owns what. Get that in writing before selling it — it was built as client work.

## Ladder (from fastest cash to most leverage)
| Offer | Price idea | Buyer | Effort per sale |
|---|---|---|---|
| Done-for-you (Fiverr / direct) | $150 / $300 / $600 | Local SMB | 2–8 hrs |
| Care plan | $150–300/mo | Same SMBs after delivery | ~1 hr/mo, mostly automated |
| Done-with-you cohort | $497 per seat | Freelancers / VAs who want to sell this package | Live sessions ×4 |
| **Agency license** | $1,500 setup + $99/mo | Agencies, OaaS operators | Repo + SOP + updates + 1 onboarding call |
| Claude skill / Project pack | $49–149 one-time | Solo marketers | Zero after build |
| Niche license (sober living) | $2,500 setup + $199/mo per operator | Recovery housing operators | Requires NRT agreement |

(Prices are starting hypotheses to test, not market data.)

## How to package it
- **Template repo** `ElevatedLivesInc/rein-mission-control-template` (private): static site + `functions/` + `tenant-config.template.js` + demo data + this SOP. Licensees get read access via a GitHub team; updates ship as releases.
- **License terms (have a lawyer draft):** non-exclusive, per-seat or per-agency, no resale of the template itself, white-label allowed, licensee responsible for their clients' data and compliance.
- **Claude skill:** run `anthropic-skills:skill-creator` on this folder → a "Local Business Launch" skill that walks intake → config → copy → GBP checklist. Sell it as a Project pack (knowledge files + instructions).

## The flywheel
Fiverr orders → reviews + case studies → direct clients at the same price (no 20%) → care plans (recurring) → the same SOP licensed to other operators → Elevated Lives uses the same framework for its own launches.
