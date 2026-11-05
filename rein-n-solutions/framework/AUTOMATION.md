# Automation map — "little participation unless required"

**The constraint:** Fiverr has no public API for sellers, and its Terms forbid bots and scrapers on the platform. So we **don't automate inside Fiverr**. We automate everything around it, triggered by the emails Fiverr already sends.

| | Automated | Human (why) |
|---|---|---|
| New message / order alert | ✓ phone push + SMS | — |
| Replying to buyers | Drafts (P7) | **Send** — ToS + first impressions |
| Order intake → config → task list | ✓ | — |
| GBP edits | Drafts (P3, P4) | **Apply** — Google requires a person with Manager access |
| Website build | ✓ Claude Code from config | **QA on a real phone** |
| Delivery PDF | ✓ | **Deliver click** |
| Follow-ups day +3, +21 | ✓ reminders with drafted text | **Send** |
| Monday brief (Premium) | ✓ fully (NRT Patrol pattern) | — |

## Scenario 1 — Fiverr order → workspace (Make or Zapier)
1. **Trigger:** Gmail, new email from Fiverr matching "You've received an order" / "New order".
2. Parse buyer username, gig, package, order number, due date.
3. Create a row in Supabase `rein_orders` (or a HubSpot deal for direct sales).
4. Create 6 tasks with due dates from the SOP (Day 1 GBP, Day 5 preview…) in Google Calendar or Notion.
5. Send an SMS / push to both phones: "New $300 order — {buyer} — due {date}".

## Scenario 2 — Fiverr message → under-1-hour reply
1. **Trigger:** Gmail, Fiverr "new message" email.
2. Push notification to whoever is on shift (split 7am–2pm / 2pm–9pm MT).
3. Optional: Claude drafts a reply with P7 from the email snippet → posts the draft to your phone/Slack. **A human pastes and sends in Fiverr.**

## Scenario 3 — Lead alert for clients (ships in every Standard)
The site's form → Pages Function → Supabase `leads` → Resend email (+ SMS via Twilio if bought). This is NRT's `/api/intake` pattern. Zero human steps.

## Scenario 4 — Monday brief (Premium + your own business)
GitHub Actions cron → `/brief/run?key=…` → builds the summary → Resend email. This is NRT's Patrol (`.github/workflows/patrol.yml`) reused as-is.

## Scenario 5 — Rein's own Mission Control
Run the same dashboard for Rein N' Solutions: tiles for Fiverr messages today, orders in progress (days to due), deliveries late (hot), reviews, revenue this month. Fed by Scenario 1. This is the "eat your own cooking" proof for the sales video.

## Build order
1 → 2 → 3 before day one. 4 and 5 in week two.
