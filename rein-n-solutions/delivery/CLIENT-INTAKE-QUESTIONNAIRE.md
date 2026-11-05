# Client intake questionnaire

Paste each question into Fiverr's **Requirements** builder (mark all required unless noted). The same list powers the direct-billing intake form, so every client, Fiverr or not, starts the same way. Each answer maps to a field in `tenant-config.template.js`, which is what makes delivery a fill-in, not a rebuild.

| # | Question (as the buyer sees it) | Type | Maps to |
|---|---|---|---|
| 1 | Business name exactly as customers know it | Text | `orgName` |
| 2 | Legal business name (if different) | Text, optional | `orgLegalName` |
| 3 | What do you do, in one sentence a customer would say? | Text | `tagline` |
| 4 | Your top 5 services (one per line), most profitable first | Text | `services[]` |
| 5 | City + the areas you serve (towns or zip codes) | Text | `serviceArea[]` |
| 6 | Address customers visit, or "service area only" | Text | `address` |
| 7 | Business phone and email for the website | Text | `phoneDisplay`, `email` |
| 8 | Hours | Text | `hours` |
| 9 | Your website domain, or "I need one" | Text | `website` |
| 10 | Is your Google Business Profile set up? Link it or say "no" | Text | `gbpUrl` |
| 11 | Who are your best customers? (age, situation, what they need) | Text | `idealCustomer` |
| 12 | What makes you different from the 3 competitors people also call? | Text | `differentiators[]` |
| 13 | Upload: logo, 10+ real photos of work, team, location | Files | `assets/` |
| 14 | 3 customer reviews or testimonials you're proud of (copy/paste OK) | Text, optional | `testimonials[]` |
| 15 | Colors or websites you like the look of | Text, optional | design tokens |
| 16 | Where should new leads go? Email, text, or both (we'll set it up) | Multiple choice | `leadRouting` |
| 17 | Anything we must NOT say (licensing, legal, medical claims)? | Text | `guardrails[]` |

**Never ask for:** passwords (Google access is by Manager invite), customer lists with personal data, health information, payment card numbers.
