# Delivery SOP — Website + Google Business Profile + Mission Control Lite

Target: Standard ($300) delivered in **≤5 working hours** of team time, over 5–7 calendar days.
Legend: 🤖 automated / Claude-drafted · 👤 human required (and why)

## Day 0 — order lands (≈15 min)
1. 🤖 Order notification email → automation creates the client record + task list (`framework/AUTOMATION.md`, Scenario 1).
2. 🤖 Requirements answers → filled into a copy of `tenant-config.template.js` (Prompt P1 in `framework/SKILLS-TOOLS-PROMPTS.md`).
3. 👤 Send kickoff message (#7). *Human because it's the first impression and Fiverr chat can't be automated safely.*

## Day 1–2 — Google Business Profile (≈90 min)
👤 Accept the Manager invite (Google requires a person). Then work the checklist:

**Identity (policy-critical)**
- [ ] Business name = the real-world name on signage/legal docs. **No keywords or city added** (violates Google's guidelines; gets profiles suspended).
- [ ] Address or service area set correctly (service-area businesses hide the address).
- [ ] Phone = a local number the owner answers. Website = the new site with UTM `?utm_source=google&utm_medium=organic&utm_campaign=gbp`.

**Relevance**
- [ ] Primary category = the single most specific match for the main revenue service (check what the top 3 local competitors use).
- [ ] 2–5 secondary categories, only ones that are true.
- [ ] Services: every service from intake Q4, each with a 1–2 sentence description.
- [ ] Business description (≤750 chars): what, who, where, why you. No URLs, no promos. 🤖 drafted by Prompt P3, 👤 approved.
- [ ] Attributes (e.g., women-owned, veteran-owned, wheelchair accessible) — only true ones.
- [ ] Hours + holiday hours.

**Prominence**
- [ ] 10+ real photos (exterior, interior, team, work). No stock. Geotagging doesn't matter; real photos do.
- [ ] Review link + QR code generated (Profile → Ask for reviews) → goes in the delivery PDF.
- [ ] Reply to every existing review (🤖 drafted by Prompt P4, 👤 approved — owner's voice, no personal details).
- [ ] 1 Google post (offer or update) with a photo.
- [ ] Seed Q&A only with real questions customers ask (from intake), answered by the owner account.

Google itself says complete, accurate profiles help customers find and choose you. That's the honest promise.

## Day 3–5 — Website (≈2 hrs)
Stack: the NRT stack, minus the parts SMBs don't need — static HTML on **Cloudflare Pages**, one Pages Function for the lead form, **Supabase** table for leads, **Resend** for the alert email. $0/month at SMB volume.
1. 🤖 Generate the 5 pages from tenant config + Prompt P2 (copy) using the Rein design system tokens re-skinned to the client's colors (intake Q15).
2. 🤖 Lead form → `functions/api/lead.js` (pattern: NRT `functions/api/intake.js` — honeypot field, length caps, hashed IP, no raw IP stored) → Supabase `leads` row → Resend email/SMS to owner.
3. 🤖 LocalBusiness JSON-LD schema with NAP exactly matching the GBP.
4. 👤 QA on a real phone: every page, tap-to-call works, form submits and the alert arrives, Lighthouse mobile ≥ 90.
5. 👤 Send preview (#8).

## Day 5–6 — Mission Control Lite (≈45 min)
A stripped copy of NRT `mission-control.html` reading one `summary` function. Tiles (StatTile component):
- **Leads This Week** — new / not answered within the protocol window / booked (from `leads`)
- **Response Time** — median minutes to first reply (owner taps "Replied" on the lead row)
- **Google Profile** — views / calls / direction requests / rating. **Entered weekly by hand** (Standard: owner, 1 minute; Premium: us). The Business Profile Performance API needs Google approval per project; don't promise automatic numbers until it's approved.
- **Reviews** — total, average, unreplied
- **Needs Attention Today** alerts — any lead unanswered > 4h (hot), unreplied review (warm), "all clear" (calm)
Access: Cloudflare Access (email one-time PIN) to the owner's email, same as NRT. `noindex`, `no-store`, and a `robots.txt` disallow.

## Day 6–7 — Launch + delivery (≈30 min)
1. 👤 Apply revisions; point DNS (owner does registrar step with our guide, or grants access).
2. 🤖 Delivery PDF: links, review QR, 2-min Loom on Mission Control, "your first week" checklist.
3. 👤 Deliver with message #9. Schedule #10 (day +3) and #11 (day +21).

## Demo (for the gig gallery and sales calls)
One Cloudflare Pages project, `rein-demo`, with a fictional business ("Wasatch Gutter Co., Sandy UT"), example leads and example Google numbers, each tile marked "Example data". **Never** a real client, never NRT data.

## Portfolio
- Only work the client has approved in writing for display.
- NRT: describe the capability in words; screenshots only of demo-data rebuilds. Treatment-center data is protected by federal confidentiality rules (42 CFR Part 2) and HIPAA — no exceptions, no blurred "real" screens.

## Done = all true
- [ ] Site live on their domain, HTTPS, mobile Lighthouse ≥ 90
- [ ] Test lead submitted and alert received by the owner
- [ ] GBP checklist 100% (or "pending Google verification" noted)
- [ ] Mission Control Lite opens for the owner's email and nobody else
- [ ] Delivery PDF sent; follow-ups scheduled
