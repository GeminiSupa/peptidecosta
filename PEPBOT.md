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
    tilopay.js      — reusable Tilopay payment-link client

  app/api/bot/
    catalog/route.js        — GET  /api/bot/catalog
    checkout-link/route.js  — POST /api/bot/checkout-link
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

## Endpoint 2 — POST /api/bot/checkout-link

Purpose: Turn a bot-collected cart + customer details into a single-use Tilopay
hosted payment link. The link can be sent directly to the customer (WhatsApp,
chat, email). Also persists a draft order in the admin dashboard tagged
sales_agent: "pepbot".

URL:     POST https://catalog.peptidescostarica.net/api/bot/checkout-link
Auth:    allowlist (see above)
Method:  POST
Headers: Content-Type: application/json

### Security Guarantees

Prices are NEVER accepted from the bot. Only product IDs / names + quantities
are trusted from the caller. The server resolves every price from the products
table and applies the same math as the website (volume discounts, shipping).
A compromised or buggy bot cannot set its own prices.

### Request Body

{
  "items": [
    { "product": "Retatrutide 10mg", "qty": 2 },
    { "productId": "uuid-here",      "qty": 1 }
  ],
  "currency": "CRC",          // "CRC" (default) | "USD"
  "paymentMethod": "tilopay", // "tilopay" (card, default) | "sinpe" (SINPE Móvil)
  "customer": {
    "name":     "Jane Doe",           // REQUIRED
    "phone":    "+50688887777",       // required for tilopay (card)
    "email":    "jane@example.com",   // optional
    "idType":   1,                    // required for sinpe (1=cedula, 2=dimex, etc.)
    "idNumber": "118450789",          // required for sinpe
    "address":  "Desamparados, SJ..."  // optional, stored on order
  }
}

Lookup: each item can be identified by UUID (productId) or exact name (product).
Both can be used in the same request. Names are case-insensitive.

### Success Response (200)

{
  "ok": true,
  "orderNumber": "BTCR-M1ABC",      // BTCR- prefix for card, BSCR- for SINPE
  "paymentUrl": "https://app.tilopay.com/...",   // single-use hosted checkout
  "currency": "CRC",
  "total": 234500,
  "breakdown": {
    "subtotal": 231000,
    "discountPct": 0,
    "discountAmount": 0,
    "shipping": 2500,
    "vialCount": 3
  }
}

The bot should send paymentUrl directly to the customer.

### Pricing Rules (server-enforced, mirrors website)

Volume discounts (applied to subtotal):
  5–9 vials  → 15% off
  10+ vials  → 20% off

Shipping:
  Order subtotal (after discount) < $200 USD equivalent → ₡3,500 flat
  Order subtotal >= $200 USD equivalent → FREE

Exchange rate:
  Live from https://open.er-api.com/v6/latest/USD (USD→CRC)
  Falls back to 454.48 CRC/USD if the live rate is unavailable

### Error Responses

  400 — validation failure (missing name, invalid qty, etc.)
  403 — caller IP/origin not in allowlist
  404 — product not found
  409 — product out of stock, or no valid price for requested currency
  500 — database write failed
  502 — Tilopay API unreachable or did not return a URL
         (order row is still created in the DB as Pending — not silently lost)
  503 — allowlist empty (endpoint disabled) or Tilopay not configured

### Example Call

curl -X POST https://catalog.peptidescostarica.net/api/bot/checkout-link \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{ "product": "Retatrutide 10mg", "qty": 2 }],
    "currency": "CRC",
    "paymentMethod": "tilopay",
    "customer": {
      "name": "Jane Doe",
      "phone": "+50688887777",
      "email": "jane@example.com"
    }
  }'

---

## Pricing Library (src/lib/pricing.js)

Can be imported by any future bot route to compute totals consistently.

  parsePrice(str)                            — strips currency symbols → Number
  getUnitPrice(productRow, currency, rate)   — unit price for a DB product row
  getVolumeDiscountPct(vialCount)            — 0 | 15 | 20
  computeOrderTotals(lineItems, currency, rate)
    → { subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount }
  getUsdToCrcRate()                          — async, live rate with fallback

---

## Tilopay Client (src/lib/tilopay.js)

Can be imported by any future bot route that needs to generate payment links.

  isTilopayConfigured()                      — boolean config check
  createTilopayPaymentLink({ amount, currency, orderNumber, customerName,
    paymentMethod, customerIdType, customerIdNumber, description })
    → Promise<{ paymentUrl: string }>

Payment methods:
  tilopay     — hosted card payment (Visa/Mastercard)
  sinpe       — SINPE Móvil (Costa Rica mobile bank transfer)
  sinpemovil  — alias for sinpe

---

## Order Prefixes (admin dashboard reference)

  WPCR-  WhatsApp checkout (human, website)
  TPCR-  Tilopay card checkout (human, website)
  SPCR-  SINPE checkout (human, website)
  BTCR-  Bot-generated Tilopay card checkout (pepbot)
  BSCR-  Bot-generated SINPE checkout (pepbot)

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
- WhatsApp webhook integration — auto-detect purchase intent → call checkout-link
