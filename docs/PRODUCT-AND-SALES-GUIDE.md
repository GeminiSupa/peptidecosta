# Costa Peptides Platform — Product & Sales Guide

A complete guide to what this application does, how it works, and how to sell it to businesses in the United States (and beyond).

> **Professional PDF (with flow diagrams & charts):** [`PRODUCT-AND-SALES-GUIDE.pdf`](./PRODUCT-AND-SALES-GUIDE.pdf)  
> Regenerate anytime: `node docs/generate-sales-guide-pdf.mjs`

---

## Table of Contents

1. [What This Platform Is](#1-what-this-platform-is)
2. [How It Works — End to End](#2-how-it-works--end-to-end)
3. [Feature Breakdown](#3-feature-breakdown)
4. [Who Buys This in the USA](#4-who-buys-this-in-the-usa)
5. [Your Value Proposition (Why They Pay You)](#5-your-value-proposition-why-they-pay-you)
6. [Pricing & Packaging Models](#6-pricing--packaging-models)
7. [The Sales Process — Step by Step](#7-the-sales-process--step-by-step)
8. [How to Find Leads in the USA](#8-how-to-find-leads-in-the-usa)
9. [How to Contact Leads (Channels & Scripts)](#9-how-to-contact-leads-channels--scripts)
10. [Running Demos That Close](#10-running-demos-that-close)
11. [Implementation & Onboarding for New Clients](#11-implementation--onboarding-for-new-clients)
12. [Objection Handling](#12-objection-handling)
13. [Compliance & Legal Notes (USA)](#13-compliance--legal-notes-usa)

---

## 1. What This Platform Is

This is **not** a simple product catalog. It is a **full business operating system** for companies that sell high-touch, consultative, or regulated products online — especially when sales happen through chat, referrals, and field agents rather than only through a self-serve checkout.

**In one sentence for prospects:**

> "We build you a branded online store plus a sales dashboard — so your team can take orders, track commissions, recover abandoned carts, run email campaigns, and manage WhatsApp/Facebook leads from one place instead of five different tools."

The current deployment serves **Peptides Costa Rica** (research peptides, bilingual storefront, Costa Rica logistics). The same codebase is designed to be **white-labeled** for other businesses: swap branding, products, payment methods, and shipping rules — the core engine stays the same.

### What it replaces (typical client stack)

| Without this platform | With this platform |
|------------------------|-------------------|
| Shopify or WooCommerce | Built-in catalog + checkout |
| HubSpot or spreadsheets for leads | CRM + lead pipeline |
| Separate WhatsApp Business app | Unified sales inbox |
| Mailchimp + manual follow-ups | Marketing Studio + automations |
| Excel for agent commissions | Commission engine + payouts |
| Google Sheets for inventory | Admin product grid + CSV import |
| Calendly + manual tracking | Prospector + meeting booking |

---

## 2. How It Works — End to End

### Customer journey (what their buyers see)

```
Visitor lands on website
    → Browses catalog (search, filters, bilingual if configured)
    → Optional: lead gate asks for email/WhatsApp before full access
    → Adds to cart → Checkout (WhatsApp, card, or local payment)
    → Order confirmation (email + WhatsApp)
    → Account area: order history, tracking, reorder
    → Post-purchase: review request, reorder reminders
```

### Business journey (what your client sees in admin)

```
Lead comes in (form, chat, TikTok, Facebook, catalog gate)
    → Assigned to sales agent in CRM
    → Agent follows up via WhatsApp, email, or live chat
    → Customer places order → attributed to agent/affiliate
    → Order fulfilled → commission calculated automatically
    → Marketing: abandoned cart emails, campaigns, deal-of-the-week promos
    → Analytics: revenue, attribution, campaign performance
```

### Architecture (for technical conversations)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL) |
| Payments | Shield Hub Pay (card), configurable per client |
| Email | Elastic Email (transactional + campaigns) |
| WhatsApp | Cloud API + optional device session (Baileys) |
| Facebook | Messenger inbox + webhooks |
| AI | OpenAI / Gemini for draft replies and prospect outreach |
| Hosting | Vercel (recommended) |
| Content | CMS-driven pages (no code deploy for copy changes) |

---

## 3. Feature Breakdown

Use this as your **demo checklist** and **proposal scope**.

### Storefront (customer-facing)

- Bilingual catalog (English/Spanish — adaptable to other languages)
- Dual currency display (USD + local currency)
- Product search, categories, filters, volume discounts
- Cart drawer, promo codes, deal-of-the-week banners
- Checkout: WhatsApp order flow, card payments, local payment rails
- Customer accounts (passwordless login, order history, addresses)
- Live chat widget with business-hours logic
- Embeddable catalog widget (iframe/JS for partner sites)
- Blog, FAQ, policies, COA/content pages — all CMS-editable
- Lead capture: contact forms, exit-intent offers, catalog access gate
- Referral/affiliate link tracking through checkout

### Admin dashboard (back-office)

**Core operations**
- Orders: full lifecycle, manual orders, payment proof, card payment links, PDF/CSV export
- Products: spreadsheet-style grid, CSV/Google Sheets import, image upload
- Customers: purchase history, VIP tagging, AI recommendations, timeline
- Leads: pipeline with agent assignment and conversion tracking
- Live Chat: website inbox with customer context
- Inquiries: support ticket management with email reply

**Sales & marketing**
- Prospector: map-based B2B lead discovery, AI enrichment, outreach drafting
- Abandoned cart recovery (email + WhatsApp)
- Marketing Studio: email subscribers, drip campaigns, visual email editor
- Automations: visual workflow builder (triggers → actions)
- Affiliates & promo codes: commission rates, QR codes, scan analytics
- Share Links: UTM campaign builder
- Facebook Inbox: Messenger conversations with AI draft replies
- Sales WhatsApp: unified inbox, templates, AI-assisted replies
- One-time broadcasts to customer segments

**Team & commissions**
- Multi-level sales team (staff → sub-users with override commissions)
- Personal referral QR codes with scan tracking
- Commission calculation, payout approval, settlement reports
- Role-based admin permissions (each staff member sees only what they need)

**Analytics & content**
- Revenue dashboards, campaign attribution, agent referral stats
- CMS for landing pages and public content (draft/preview)
- Cross-domain visitor tracking

---

## 4. Who Buys This in the USA

### Primary buyer profiles

| Profile | Why they need this | Where to find them |
|---------|-------------------|-------------------|
| **Supplement / wellness retailers** | High-touch sales, affiliate networks, compliance-heavy products | Instagram, trade shows (SupplySide, Natural Products Expo), LinkedIn |
| **Medical aesthetics / med spas** | Consultative booking + product upsells, referral agents | Google Maps, RealSelf, local business directories |
| **B2B distributors with field reps** | Commission tracking, QR referral codes, mobile-first sales | LinkedIn, industry associations |
| **Specialty e-commerce (peptides, research chemicals, niche health)** | WhatsApp/chat sales, dual-language buyers, agent networks | Reddit communities, Facebook groups, industry forums |
| **Multi-location service businesses** | Centralized leads, local agent attribution | Yelp, Google Business, chamber of commerce |
| **Affiliate-heavy brands** | Promo codes, scan tracking, automated payouts | Affiliate marketing conferences, PartnerStack communities |

### Secondary profiles

- Gym owners selling supplements to members
- Functional medicine clinics with product lines
- CBD / hemp retailers (state-dependent)
- Beauty/skincare brands with influencer sales teams
- Any SMB currently juggling Shopify + spreadsheets + WhatsApp

### Red flags (bad-fit clients)

- Pure drop-shipping with no sales team (Shopify alone is enough)
- Enterprise with 500+ SKUs and complex ERP needs
- Businesses that refuse to use chat/messaging for sales
- Clients expecting instant ROI with zero marketing effort

---

## 5. Your Value Proposition (Why They Pay You)

### Pain → Solution framing

| Their pain | Your solution |
|-----------|---------------|
| "We lose leads because nobody follows up" | CRM + automated alerts + abandoned cart recovery |
| "My sales reps fight over commissions" | Automatic order attribution + transparent payout reports |
| "We use WhatsApp, email, and Facebook separately" | One dashboard for all channels |
| "Shopify doesn't do what we need" | Custom checkout, local payments, agent commissions built-in |
| "We can't track which marketing works" | UTM links, QR scans, full attribution analytics |
| "Hiring a dev team is too expensive" | Turnkey platform, you handle setup and support |

### Elevator pitch (30 seconds)

> "I build custom sales platforms for businesses like yours — not just a website, but the whole system: online catalog, order management, sales team commissions, WhatsApp and email marketing, and lead tracking. Most of my clients were paying for 4–5 separate tools and still losing leads. We replace all of that with one dashboard built around how your team actually sells."

### Elevator pitch (15 seconds — cold outreach)

> "I help [industry] businesses replace Shopify + spreadsheets + WhatsApp chaos with one sales platform — catalog, CRM, commissions, and marketing in one place. Worth a 15-minute look?"

---

## 6. Pricing & Packaging Models

Adjust based on your market and effort. These are **starting points** for US SMB clients.

### One-time project fee

| Tier | Scope | Suggested range (USD) |
|------|-------|----------------------|
| **Starter** | Storefront + catalog + basic admin (orders, products, leads) | $3,000 – $6,000 |
| **Growth** | Starter + marketing (email, abandoned carts, affiliates) | $6,000 – $12,000 |
| **Full platform** | Everything including Prospector, automations, multi-agent commissions | $12,000 – $25,000+ |

### Monthly retainer (recurring revenue for you)

| Service | Suggested range (USD/month) |
|---------|----------------------------|
| Hosting + maintenance + minor updates | $200 – $500 |
| Above + content/CMS support | $500 – $1,000 |
| Above + marketing campaign management | $1,000 – $2,500 |
| Dedicated support + feature requests | $2,500+ |

### Add-on fees

- Payment gateway setup: $500–$1,000
- WhatsApp Business API setup: $500–$1,500
- Data migration from existing store: $1,000–$3,000
- Custom integrations (ERP, accounting): quoted separately
- Training sessions: $150–$300/hour

### Pricing tip

Always anchor against **what they'd pay for separate tools**:

> "Shopify Plus is $2,300/month. HubSpot starts at $800/month. A WhatsApp API provider is $200+/month. You're looking at $3,000+/month in software alone — and they still don't talk to each other. Our platform is a one-time build plus a fraction of that in monthly support."

---

## 7. The Sales Process — Step by Step

```
1. PROSPECT  →  2. OUTREACH  →  3. DISCOVERY CALL  →  4. DEMO  →  5. PROPOSAL  →  6. CLOSE  →  7. ONBOARD
```

### Step 1: Prospect
Identify businesses matching the profiles in Section 4. Build a list of 50–100 targets before outreach.

### Step 2: Outreach
Use the channels and scripts in Sections 8–9. Goal: book a 15–20 minute discovery call.

### Step 3: Discovery call (15–20 min)
Ask these questions — take notes, they'll become your proposal:

1. What do you sell, and who buys it?
2. How do orders come in today? (website, phone, WhatsApp, in-person?)
3. Do you have sales reps, affiliates, or agents? How are they paid?
4. What tools do you use now? (Shopify, WooCommerce, spreadsheets, CRM?)
5. What's your biggest headache — lost leads, commission disputes, manual follow-up, no analytics?
6. Do you sell in more than one language or currency?
7. What's your monthly revenue / order volume? (qualifies budget)
8. What would success look like in 90 days?

**Qualification rule:** If they have no sales team, no lead volume, and just need a basic store — refer them to Shopify. Save your time for full-platform clients.

### Step 4: Demo (30–45 min)
Show only what maps to their pain (see Section 10). Never demo every module.

### Step 5: Proposal
Send within 24 hours. Include:
- Summary of their stated problems
- Recommended package (Starter / Growth / Full)
- Scope list (what's included, what's not)
- Timeline (typically 4–8 weeks)
- Price (one-time + monthly)
- Next step (sign + deposit)

### Step 6: Close
- Ask for 50% deposit to start, 50% on launch
- Use a simple contract (scope, timeline, payment terms, support terms)
- Offer a "launch guarantee": if core features aren't live in X weeks, extended support free

### Step 7: Onboard
Follow Section 11.

---

## 8. How to Find Leads in the USA

### Free / low-cost methods

| Method | How to use it | Best for |
|--------|--------------|----------|
| **Google Maps** | Search "[product type] store near me" in target cities; look for businesses with outdated websites, WhatsApp numbers in listings, or no online ordering | Local retailers, med spas, supplement shops |
| **LinkedIn Sales Navigator** | Filter by title (Owner, Founder, Operations Manager) + industry (Health, Wellness, Retail) + company size (1–50) | B2B outreach, decision-makers |
| **Instagram** | Search hashtags (#peptides, #medspa, #supplementshop, #[city]wellness); find businesses with link-in-bio but no real store | Visual brands, influencer-driven sales |
| **Facebook Groups** | Join industry groups (peptide communities, med spa owners, affiliate marketers); provide value before pitching | Niche industries with active communities |
| **Yelp / Yellow Pages** | Find businesses with high reviews but weak web presence | Local service + retail |
| **Trade show attendee lists** | Natural Products Expo, SupplySide West, AMWC (aesthetics) | Qualified industry buyers |
| **BuiltWith / Wappalyzer** | See what tech a company's website uses; target Shopify/WooCommerce sites with no CRM | Tech-qualified leads |
| **Job postings** | Companies hiring "sales reps" or "affiliate managers" likely need commission tooling | Companies scaling sales teams |
| **Google Alerts** | Set alerts for "[industry] + new store" or "peptide company launch" | Timing outreach to new businesses |

### Paid methods

| Method | Cost | Notes |
|--------|------|-------|
| **LinkedIn ads** | $500–2,000/month | Target owners in wellness/retail; offer free audit |
| **Facebook/Instagram ads** | $300–1,000/month | Lead magnet: "Free Sales Stack Audit" |
| **Cold email tools** (Instantly, Apollo) | $50–200/month | Scrape + sequence; stay CAN-SPAM compliant |
| **Industry directories** | Varies | Buy lists from trade associations |

### Using your own Prospector module

Ironically, this platform includes a **Prospector** tool (map-based business discovery, fit scoring, AI enrichment, outreach drafting). You can deploy a demo instance and use it to find your own clients:

1. Search a US city + category (e.g., "supplement store" in Miami)
2. Review fit scores and enrichment data
3. Save promising businesses to the pipeline
4. Draft first-touch emails with AI assistance
5. Track outreach → meeting → close in the same CRM you sell

This is a powerful meta-demo: *"I used this exact tool to find and contact you."*

---

## 9. How to Contact Leads (Channels & Scripts)

### Channel priority for US B2B

1. **Email** — best for cold outreach; scalable; legal if CAN-SPAM compliant
2. **LinkedIn message** — good for owners/founders; keep it short
3. **Instagram DM** — works for visual/consumer brands; less formal
4. **Phone** — high conversion but time-intensive; use after email open/click
5. **Facebook Messenger** — only if they have a business page with messaging open
6. **WhatsApp** — growing in US B2B but still secondary; better for LATAM clients

### Cold email template #1 — The Problem Hook

**Subject:** Quick question about [Company Name]'s online sales

```
Hi [First Name],

I came across [Company Name] and noticed you're selling [product type] —
great reviews on [Google/Yelp].

I'm reaching out because a lot of [industry] businesses your size are
losing orders between their website, WhatsApp, and sales reps — with
no clear way to track who sold what or follow up on abandoned carts.

I build all-in-one sales platforms for companies like yours: online catalog,
order management, team commissions, and marketing automation in one dashboard
(instead of Shopify + spreadsheets + separate chat apps).

Would a 15-minute call this week be worth it to see if this fits?

Best,
[Your Name]
[Your Website/Portfolio]
```

### Cold email template #2 — The Tool Replacement

**Subject:** Replace 4 tools with 1 dashboard?

```
Hi [First Name],

Most [industry] businesses I talk to are running:
  • Shopify or WooCommerce for the store
  • A spreadsheet for sales rep commissions
  • WhatsApp or Facebook for customer chat
  • Mailchimp for email (if they're lucky)

That's 4 logins, 4 bills, and zero connection between them.

I build custom platforms that combine all of this — catalog, CRM,
commissions, WhatsApp/email marketing — for a one-time setup plus
low monthly support.

Here's a 2-minute video walkthrough: [link]

Open to a quick call?

[Your Name]
```

### LinkedIn connection request note

```
Hi [Name] — I work with [industry] brands on custom sales platforms
(catalog + CRM + commissions). Saw [Company] and thought there might
be a fit. Would love to connect.
```

### LinkedIn follow-up (after accepted)

```
Thanks for connecting, [Name]. Quick question: does [Company] handle
sales rep commissions and lead follow-up manually, or do you have a
system for that? I ask because most businesses I work with are
outgrowing spreadsheets — happy to share what's working if useful.
```

### Instagram DM (keep very short)

```
Hey [Name] — love what you're building with [Brand]. I build custom
sales platforms for [industry] brands (catalog + team dashboard +
WhatsApp integration). Would you be open to a quick chat about it?
```

### Phone script (after email sent)

```
Hi, is this [First Name]? Hey, this is [Your Name] — I sent you an
email yesterday about simplifying your online sales setup. I know you're
busy so I'll be quick: I build custom sales platforms for [industry]
businesses — basically replacing Shopify plus spreadsheets plus separate
chat apps with one dashboard. Is that something you'd have 15 minutes
to explore this week, or should I send more info by email?
```

### Follow-up sequence (if no reply)

| Day | Action |
|-----|--------|
| Day 0 | Initial email |
| Day 3 | Follow-up #1: "Bumping this — worth a look?" |
| Day 7 | Follow-up #2: share a relevant case study or screenshot |
| Day 14 | Follow-up #3: "Last note from me — if timing's bad, no worries" |
| Day 30 | Add to nurture list; send monthly value email |

**Rule:** Never send more than 4 touches in 30 days without a reply. Move on.

---

## 10. Running Demos That Close

### Demo structure (30 minutes)

| Time | What to show |
|------|-------------|
| 0–5 min | Their problem reflected back ("You said you lose leads when reps don't follow up — here's how we fix that") |
| 5–15 min | **Storefront**: catalog, checkout, mobile view, bilingual toggle |
| 15–25 min | **Admin**: the 2–3 modules that match their pain (usually Orders + Leads + Commissions OR Marketing) |
| 25–30 min | Pricing, timeline, next steps |

### Demo rules

1. **Never show everything.** Pick 3 modules max based on discovery call notes.
2. **Use their product name.** "Here's what YOUR catalog would look like" — swap branding in the demo if possible.
3. **Show the money.** Commission reports, abandoned cart recovery stats, revenue dashboard — owners care about revenue.
4. **Show mobile.** Most of their customers and reps are on phones.
5. **Have a demo site ready.** Deploy a staging instance with sample products they can click through.

### Module → pain mapping (what to demo)

| If they said… | Demo this |
|--------------|-----------|
| "We lose leads" | Leads pipeline + Live Chat + lead alerts |
| "Commission disputes" | Orders with agent attribution + commission reports + payout settlement |
| "No follow-up on carts" | Abandoned cart dashboard + recovery email preview |
| "Marketing is manual" | Marketing Studio + campaign builder + automations |
| "We have field reps" | My QR & Scans + referral links + sub-user team hierarchy |
| "We use WhatsApp to sell" | Sales WhatsApp inbox + template messages |
| "We need to find new B2B clients" | Prospector map + outreach drafting |
| "Website is outdated" | Landing page + CMS + catalog + mobile action bar |

---

## 11. Implementation & Onboarding for New Clients

### Typical timeline: 4–8 weeks

| Week | Milestone |
|------|-----------|
| 1 | Kickoff call, collect branding assets, product data, payment credentials |
| 2 | Deploy staging environment, import products, configure branding |
| 3 | Set up payments, email, WhatsApp (if applicable), admin users |
| 4 | Client review + feedback round |
| 5 | Marketing setup (email templates, abandoned cart rules, promo codes) |
| 6 | Training session (1–2 hours with client team) |
| 7 | Soft launch (limited traffic, test orders) |
| 8 | Go live + 30-day support window |

### What you need from the client

- [ ] Logo, brand colors, favicon
- [ ] Product list (CSV/Excel or Google Sheet)
- [ ] Product images
- [ ] Payment processor credentials
- [ ] Domain name (or subdomain plan)
- [ ] Email sending domain (for SPF/DKIM setup)
- [ ] WhatsApp Business account (if using WhatsApp)
- [ ] Shipping/payment rules
- [ ] Sales team roster (names, emails, commission rates)
- [ ] Existing customer data for migration (optional)

### White-label configuration checklist

- [ ] `site_settings` in Supabase: business name, contact info, social links
- [ ] Landing page CMS content (hero, FAQs, about)
- [ ] Email templates: order confirmation, shipping, lead alerts
- [ ] Payment gateway keys (Shield Hub Pay or alternative)
- [ ] SMTP / Elastic Email credentials
- [ ] WhatsApp Cloud API tokens (if applicable)
- [ ] Admin user accounts with appropriate permissions
- [ ] Custom domain + SSL on Vercel
- [ ] Analytics tracking snippet on any external sites

### Training agenda (deliver to client)

1. Admin dashboard overview (15 min)
2. Processing orders (15 min)
3. Managing products and inventory (10 min)
4. Leads and customer follow-up (10 min)
5. Marketing campaigns and promos (10 min)
6. Commission reports and team management (10 min)
7. Q&A (10 min)

Record the session and share the recording.

---

## 12. Objection Handling

| Objection | Response |
|-----------|----------|
| "We already have Shopify" | "Shopify is great for simple stores. But does it track your sales reps' commissions, recover abandoned carts via WhatsApp, or give each agent their own referral QR code? That's what we add." |
| "Too expensive" | "What's it costing you now in lost leads and manual work? If you're paying for 3–4 tools plus hours of spreadsheet work, this typically pays for itself in 2–3 months." |
| "We need to think about it" | "Totally fair. What specific question would you need answered to feel confident? I can send a scoped proposal so you have something concrete to review." |
| "Can you just build us a website?" | "We can, but you'd miss the sales dashboard, commission tracking, and marketing automation — which is where the real ROI is. I'd recommend at least the Growth package." |
| "We're not tech-savvy" | "That's exactly why we include training and ongoing support. Your team won't need to touch code — everything is managed from a simple dashboard." |
| "What if we outgrow it?" | "The platform is built on standard tech (Next.js, Supabase). It scales with you, and we can add features as you grow." |
| "How long until we're live?" | "Typically 4–8 weeks from deposit to launch, depending on how quickly you provide product data and branding assets." |

---

## 13. Compliance & Legal Notes (USA)

### Cold email (CAN-SPAM Act)

- Include your physical mailing address in every email
- Provide a clear unsubscribe mechanism
- Honor opt-outs within 10 business days
- Don't use deceptive subject lines
- Identify the message as an advertisement if applicable

### Cold calling (TCPA)

- Do not call numbers on the National Do Not Call Registry for telemarketing
- Get consent before using autodialers or prerecorded messages
- Keep a record of consent for SMS marketing

### SMS / WhatsApp marketing

- Require explicit opt-in before sending marketing messages
- Include opt-out instructions in every message
- WhatsApp Business API requires approved message templates for outbound

### Data & payments

- Use SSL everywhere (handled by Vercel)
- Never store raw credit card numbers — payment processor handles PCI
- Client owns their customer data (include this in your contract)
- Consider a basic privacy policy and terms of service for each deployment

### Contracts

Always use a written agreement covering:
- Scope of work and deliverables
- Payment terms (deposit + milestones)
- Timeline and client responsibilities
- Intellectual property (client owns their data; you retain platform code rights unless selling full source)
- Support terms and SLA
- Termination clause

---

## Quick Reference: Your Weekly Sales Routine

| Day | Activity | Time |
|-----|----------|------|
| Monday | Build prospect list (20 new targets) | 1 hr |
| Tue–Thu | Send outreach (10–15 emails/DMs per day) | 1 hr/day |
| Wednesday | Follow up on open threads | 30 min |
| Friday | Run 1–2 demos or discovery calls | 1–2 hr |
| Ongoing | Post 1 value piece on LinkedIn (tip, screenshot, case study) | 30 min/week |

**Target metrics (starting out):**
- 50 outreach emails/week → 5–10 replies → 2–3 calls → 1 proposal → close 1 client every 4–8 weeks
- As you refine targeting and demos, conversion improves

---

## Summary

You are selling a **business operating system**, not a website. The platform combines e-commerce, CRM, commission management, multi-channel messaging, and marketing automation — purpose-built for businesses where sales happen through people, not just checkout buttons.

Your best US clients are specialty retailers, wellness brands, med spas, and B2B distributors with sales teams who are currently duct-taping Shopify, spreadsheets, and chat apps together.

Find them on Google Maps, LinkedIn, and Instagram. Contact them by email first. Book a 15-minute discovery call. Demo only what solves their stated pain. Propose a scoped package with a 50% deposit. Deliver in 4–8 weeks. Collect monthly support retainer.

The platform you built for Costa Peptides is the proof of concept. Every feature in the admin dashboard is a selling point. Use it to sell itself.

---

*Document version: 1.0 — September 2026*
*For internal sales use. Update pricing and compliance notes as you enter specific US states or industries.*
