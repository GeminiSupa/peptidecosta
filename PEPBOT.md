# PepBot Integration Guide
# Peptides Costa Rica — feat-pepbot

This document describes the server-side bot API layer built into this Next.js
app. It is the canonical reference for building features on the external bot.

---

## Overview

The bot layer lives entirely inside this Next.js repo as serverless API routes
under `src/app/api/bot/`. The external bot makes HTTP requests to these
endpoints. No SDK, no WebSocket, no separate service — just JSON over HTTPS.

All endpoints share a single auth model and a single place to configure it.

---

## Files Added (feat-pepbot)

```
src/
  lib/
    botAuth.js      — shared IP/origin allowlist (THE place to add your bot's IP)
    pricing.js      — authoritative server-side pricing (mirrors catalog checkout math)

  app/api/bot/
    catalog/route.js        — GET  /api/bot/catalog
```

---

## Authorization

No API keys, no tokens, no env var changes required.

The bot is authorized by an IP/origin allowlist defined in code:

  src/lib/botAuth.js
    ALLOWED_IPS     — array of your bot server's public egress IPs (IPv4 or IPv6)
    ALLOWED_ORIGINS — array of full origins for browser callers (e.g. https://bot.yourdomain.com)

Rules:
- If BOTH arrays are empty → all bot endpoints return 503 (fail-closed, never open).
- A request passes if its IP is in ALLOWED_IPS OR its Origin/Referer is in ALLOWED_ORIGINS.
- The IP is read from x-real-ip → x-forwarded-for[0], which Vercel sets to the true
  upstream peer (cannot be spoofed by the caller).
- To add your bot's IP: edit ALLOWED_IPS, commit, redeploy.
- To rotate access: remove the old IP from the array, commit, redeploy.

Current allowlist state: see src/lib/botAuth.js.

Note for serverless bots (Vercel, Lambda, etc.): egress IPs are dynamic.
Use ALLOWED_ORIGINS with the bot's domain instead of ALLOWED_IPS.

---

## Endpoint 1 — GET /api/bot/catalog

Purpose: Full knowledge dump for the bot to index. Pull this on startup or
periodically to keep the bot's product knowledge current. All data is already
public on the website.

URL:     GET https://catalog.peptidescostarica.net/api/bot/catalog
Auth:    allowlist (see above)
Caching: none (force-dynamic — always live data)

### Query Parameters

  format   json (default) | text
             json → structured JSON, good for parsing/embedding pipelines
             text → flat markdown document, drop straight into an LLM system prompt

  include  comma-separated list of sections (default = all)
           valid values: products, reviews, blogs, landing
           e.g. ?include=products,reviews

### JSON Response Shape

{
  "meta": {
    "generatedAt": "2026-06-04T18:00:00.000Z",
    "exchangeRate": 454.48,           // USD → CRC rate used (live or fallback)
    "productCount": 42,
    "sections": ["products", "reviews", "blogs", "landing"]
  },
  "products": [
    {
      "id": "uuid",
      "name": "Retatrutide 10mg",
      "category": "Weight Loss & Metabolism",
      "status": "In Stock",            // "In Stock" | "Out of Stock" | etc.
      "priceUsd": 125,                 // always a number, never a string
      "priceCrc": 56810,
      "originalPriceUsd": 150,         // null if no sale
      "discount": "17% OFF",           // null if none
      "coa": "https://...",            // Certificate of Analysis URL or null
      "imageUrl": "https://...",
      "emoji": "💉",
      "descriptionEn": "...",
      "descriptionES": "..."
    }
  ],
  "reviews": [
    {
      "productName": "Retatrutide 10mg",
      "customerName": "Ana G.",
      "rating": 5,
      "comment": "Great results.",
      "createdAt": "2026-05-01T..."
    }
  ],
  "blogs": [
    {
      "slug": "what-is-bpc-157",
      "titleEn": "What is BPC-157?",
      "titleES": "¿Qué es el BPC-157?",
      "excerptEn": "...",
      "contentEn": "...",
      "imageUrl": "https://...",
      "createdAt": "2026-04-15T..."
    }
  ],
  "landing": {
    "heroTitleEn": "Buy Peptides in Costa Rica",
    "heroSubEn": "Lab-Tested. High Purity. Fast Local Delivery.",
    ...
  }
}

### Text Response (format=text)

Returns a single markdown document with all sections. Good for:
- Injecting directly into a Gemini/GPT system prompt
- Chunking and embedding into a vector store (RAG)

### Example Calls

# Full JSON dump
curl https://catalog.peptidescostarica.net/api/bot/catalog

# LLM-ready text document
curl "https://catalog.peptidescostarica.net/api/bot/catalog?format=text"

# Only products (faster for checkout lookups)
curl "https://catalog.peptidescostarica.net/api/bot/catalog?include=products"

# Products + reviews only
curl "https://catalog.peptidescostarica.net/api/bot/catalog?include=products,reviews"

### Recommended Indexing Pattern

Small catalog (< 100 products):
  Pull ?format=text once per hour (or on demand) and inject the whole document
  into the model context as a system prompt block. Simple and effective.

Large / growing catalog:
  Pull ?format=json, chunk each product/blog into its own embedding, store in
  a vector DB on the bot side, retrieve top-k matches per user query at runtime.

---

## Pricing Library (src/lib/pricing.js)

Can be imported by any future bot route to compute totals consistently.

  parsePrice(str)                            — strips currency symbols → Number
  getUnitPrice(productRow, currency, rate)   — unit price for a DB product row
  getVolumeDiscountPct(vialCount)            — 0 | 15 | 20
  computeOrderTotals(lineItems, currency, rate)
    → { subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount }
  getUsdToCrcRate()                          — async, live rate with fallback

## Order Prefixes (admin dashboard reference)

  WPCR-  WhatsApp checkout (human, website)
  CARD-  Shield Hub Pay card checkout (human, website)

Bot orders also carry sales_agent = "pepbot" in the orders table.

---

## Adding a New Bot Endpoint

1. Create src/app/api/bot/your-feature/route.js
2. Import authorizeBot from @/lib/botAuth
3. Call authorizeBot(req) at the top — return 503 if !configured, 403 if !ok
4. Use getSupabaseAdmin() for any DB writes (bypasses RLS)
5. Use supabase (anon) for public reads if no writes needed
6. Document the new endpoint in this file

---

## What's Not Built Yet (planned)

- POST /api/bot/chat          — stateless LLM chat turn with site context injected
- POST /api/bot/lead          — upsert a contact into the nurture/CRM pipeline
- Embedded live chat widget   — floating React component on the site
- Nurture pipeline            — coupon codes, triggered email/WhatsApp sequences
- WhatsApp webhook integration — auto-detect purchase intent → hand off to checkout
