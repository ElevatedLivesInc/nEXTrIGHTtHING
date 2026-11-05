# Skills, tools and prompts — the repeatable kit

## Team skills (who does what)
| Skill | Why it matters here | Level needed | How to get it fast |
|---|---|---|---|
| Fiverr sales conversation | Converts messages to orders | Core | The 11 scripts in `fiverr/03` |
| 5-minute GBP audit | The single best closer | Core | Run it on 10 local businesses before launch |
| GBP policy | Avoid suspensions | Core | Google "Guidelines for representing your business on Google" — read once, fully |
| Static site + Cloudflare Pages | Delivery stack | Core | Already proven in this repo |
| Supabase basics (tables, RLS) | Leads + dashboard | Core | Already proven (`sql/`, `supabase/`) |
| Prompting Claude for copy + code | Cuts build time 60–70% | Core | Prompt library below |
| Make or Zapier scenarios | "Little participation" | Medium | Scenarios in `AUTOMATION.md` |
| Google Skillshop certs | Profile proof | Nice | Free, ~2–4 hrs each |
| Loom / screen recording | Handoff without calls | Nice | 2-min delivery walkthroughs |

## Tools (what's connected, what it does)
| Tool | Use | Status in this workspace |
|---|---|---|
| **Fiverr** | Storefront + payments + reviews | No public seller API — run by hand + email notifications |
| **Claude Code** | Builds sites from tenant config, writes SOP code | Working (this session) |
| **Claude (chat) + Projects** | Copy, audits, replies; load this folder as Project knowledge | Available |
| **GitHub** (ElevatedLivesInc) | One template repo, one repo per client | Working |
| **Cloudflare Pages + Access** | Hosting + private dashboards | Proven on NRT |
| **Supabase** | Leads table, dashboard data | Connector available |
| **Resend** | Lead alerts, morning briefs | Connector available |
| **Make / Zapier** | Order → task → reminder automations | Connectors available |
| **HubSpot (free CRM)** | Optional pipeline for direct (non-Fiverr) sales | Connector available |
| **Gmail / Google Calendar** | Fiverr notifications, follow-up reminders | Connectors available |
| **Canva** | Gig cover images, delivery PDFs | Needs authorization in claude.ai connector settings |
| **Stripe** | Direct invoices for warm clients | Needs authorization in claude.ai connector settings |

## Prompt library
Use with the client's filled `tenant-config` pasted above the prompt. Every prompt ends with the same guardrail line.

**Guardrail line (append to every prompt):**
> Use only facts from the config. If something is missing, write [NEEDS: …] instead of inventing it. No superlatives ("best", "#1"), no guarantees, no medical/legal claims. Plain words, 8th-grade reading level.

**P1 — Intake → config**
> Here are a client's Fiverr requirement answers. Fill this tenant-config.template.js. Keep their exact wording for services and business name. List every unanswered field as a TODO comment.

**P2 — Website copy (5 pages)**
> Write Home, Services, About, Reviews and Contact page copy for this business. Home: a headline under 10 words that names the service and the city, a 2-sentence subhead, 3 benefit blocks, one call to action ("Call {phone}" or "Get a quote"). Services: one H2 + 60–90 words per service. About: the owner's story from the config, first person plural. Output as HTML fragments using classes from the Rein design system (rn-btn, rn-tile).

**P3 — GBP description (≤750 chars)**
> Write a Google Business Profile description: what they do, for whom, where, and what's different. No URLs, no phone numbers, no promotions, no ALL CAPS, no keyword lists. Under 750 characters. Give 2 options.

**P4 — Review replies**
> Draft replies to these reviews in the owner's voice. Thank by first name only, mention the specific job, one sentence max on any problem plus an offer to talk offline (no phone numbers or personal details in the reply). Never confirm someone was a client if the business is health, recovery or legal related; reply generally instead.

**P5 — 5-minute audit (for sales)**
> Here is a screenshot/text of {business}'s Google listing and website on mobile, plus the top 3 competitors' listings. List the 3 highest-impact fixes, each as one sentence a non-technical owner understands, ranked by likely effect on calls. Compare to competitors only on facts visible here.

**P6 — Weekly Monday brief (Premium)**
> From these numbers (this week vs. last), write a 5-line brief: what went up, what went down, the one thing to do this week, and any lead or review that needs the owner. No jargon.

**P7 — Fiverr reply from a buyer message**
> A buyer wrote: "{message}". Using our scripts (QUALIFY, AUDIT, objections), draft a reply under 90 words. No links, emails or phone numbers (Fiverr rules). End with one question.

## Claude skills worth turning on (in this workspace's skill list)
- `small-business:seo-ai-visibility`: local SEO + AI-search visibility checks for client audits
- `small-business:review-reputation`: review-reply drafting at scale (Premium)
- `small-business:speed-to-lead`: lead-response workflow behind the "Response Time" tile
- `small-business:proposal-builder`: custom offers for direct clients
- `small-business:build-agent`: turn any step you repeat 3× into a named skill
- `anthropic-skills:skill-creator`: package this whole kit as a sellable Claude skill (see `LICENSING.md`)
