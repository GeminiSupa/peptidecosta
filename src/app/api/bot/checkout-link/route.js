// POST /api/bot/checkout-link
//
// Server-to-server endpoint that lets an externally hosted bot turn a cart +
// customer details into a ready-to-pay Tilopay checkout link, while persisting
// a draft order (information transfer) for the admin dashboard.
//
// Security model:
//   1. No key/token. The caller is authorized by an ALLOWLIST of egress IPs
//      and/or origins, managed centrally in src/lib/botAuth.js. Fail-closed: if
//      the allowlist is empty, the endpoint is disabled (503).
//   2. Prices are NEVER trusted from the caller. Every line item is resolved
//      from the products table and totals are computed server-side using the
//      same math as the website checkout (src/lib/pricing.js).
//   3. Writes use the service-role client (bypasses RLS) with fully validated,
//      sanitized input only.
//
// Request body:
//   {
//     "items": [{ "productId"?: uuid, "product"?: "Retatrutide 10mg", "qty": 1 }],
//     "currency": "CRC" | "USD",                 // default "CRC"
//     "paymentMethod": "tilopay" | "sinpe",      // default "tilopay" (card)
//     "customer": {
//       "name": "Jane Doe",                      // required
//       "phone": "+50688887777",                 // required for card (tilopay)
//       "email": "jane@example.com",             // optional
//       "idType": 1,                             // required for sinpe
//       "idNumber": "118450789",                 // required for sinpe
//       "address": "free-form shipping address"  // optional
//     }
//   }
//
// Response: { ok, orderNumber, paymentUrl, currency, total, breakdown }

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeBot } from '@/lib/botAuth';
import { computeOrderTotals, getUnitPrice, getUsdToCrcRate } from '@/lib/pricing';
import { createTilopayPaymentLink, isTilopayConfigured } from '@/lib/tilopay';

export const runtime = 'nodejs';

const MAX_DISTINCT_ITEMS = 50;
const MAX_QTY_PER_ITEM = 100;
const MAX_STR = 200;
const SUPPORTED_CURRENCIES = ['USD', 'CRC'];
const SUPPORTED_METHODS = ['tilopay', 'sinpe'];
const OUT_OF_STOCK_RE = /out of stock|sold out|agotado/i;

function json(body, status = 200) {
  return NextResponse.json(body, { status });
}

function clean(str) {
  return typeof str === 'string' ? str.trim().slice(0, MAX_STR) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const auth = authorizeBot(req);
  if (!auth.configured) {
    return json({ error: 'Bot checkout endpoint is not configured' }, 503);
  }
  if (!auth.ok) {
    return json({ error: 'Forbidden' }, 403);
  }

  if (!isTilopayConfigured()) {
    return json({ error: 'Payment gateway is not configured' }, 503);
  }

  // ─── Parse + validate input ───────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const currency = SUPPORTED_CURRENCIES.includes(body.currency) ? body.currency : 'CRC';
  const paymentMethod = SUPPORTED_METHODS.includes(body.paymentMethod) ? body.paymentMethod : 'tilopay';

  const rawItems = Array.isArray(body.items) ? body.items : null;
  if (!rawItems || rawItems.length === 0) {
    return json({ error: 'items must be a non-empty array' }, 400);
  }
  if (rawItems.length > MAX_DISTINCT_ITEMS) {
    return json({ error: `Too many items (max ${MAX_DISTINCT_ITEMS})` }, 400);
  }

  // Normalize requested items.
  const requested = [];
  for (const it of rawItems) {
    const qty = Number(it?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      return json({ error: `Invalid qty for an item (must be 1-${MAX_QTY_PER_ITEM})` }, 400);
    }
    const productId = clean(it?.productId);
    const productName = clean(it?.product);
    if (!productId && !productName) {
      return json({ error: 'Each item needs a productId or product name' }, 400);
    }
    requested.push({ productId, productName, qty });
  }

  // ─── Customer ─────────────────────────────────────────────────────────────
  const customer = body.customer || {};
  const customerName = clean(customer.name);
  const customerPhone = clean(customer.phone);
  const customerEmail = clean(customer.email);
  const customerIdType = clean(String(customer.idType ?? ''));
  const customerIdNumber = clean(customer.idNumber);
  const shippingAddress = clean(customer.address);

  if (!customerName) {
    return json({ error: 'customer.name is required' }, 400);
  }
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return json({ error: 'customer.email is invalid' }, 400);
  }
  if (paymentMethod === 'tilopay' && !customerPhone) {
    return json({ error: 'customer.phone is required for card payments' }, 400);
  }
  if (paymentMethod === 'sinpe' && !customerIdNumber) {
    return json({ error: 'customer.idNumber is required for SINPE Móvil' }, 400);
  }

  // ─── Resolve products + prices from DB (authoritative) ────────────────────
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    console.error('[bot/checkout-link] Supabase admin init failed:', err.message);
    return json({ error: 'Server configuration error' }, 503);
  }

  const ids = [...new Set(requested.map(r => r.productId).filter(Boolean))];
  const names = [...new Set(requested.map(r => r.productName).filter(Boolean))];

  // Two safe .in() lookups (parameterized by the client) rather than a
  // hand-built or() string, so product names with commas/parens can't break
  // the filter. Results are merged into id/name indexes.
  const SELECT = 'id, product, price_usd, price_crc, status';
  const found = [];
  if (ids.length) {
    const { data, error } = await supabase.from('products').select(SELECT).in('id', ids);
    if (error) {
      console.error('[bot/checkout-link] Product lookup by id failed:', error.message);
      return json({ error: 'Could not load products' }, 502);
    }
    found.push(...(data || []));
  }
  if (names.length) {
    const { data, error } = await supabase.from('products').select(SELECT).in('product', names);
    if (error) {
      console.error('[bot/checkout-link] Product lookup by name failed:', error.message);
      return json({ error: 'Could not load products' }, 502);
    }
    found.push(...(data || []));
  }

  const byId = new Map(found.map(p => [String(p.id), p]));
  const byName = new Map(found.map(p => [p.product.toLowerCase(), p]));

  const exchangeRate = currency === 'CRC' ? await getUsdToCrcRate() : undefined;

  const lineItems = [];
  const orderItems = [];
  for (const r of requested) {
    const product = (r.productId && byId.get(r.productId)) || (r.productName && byName.get(r.productName.toLowerCase()));
    if (!product) {
      return json({ error: `Product not found: ${r.productName || r.productId}` }, 404);
    }
    if (product.status && OUT_OF_STOCK_RE.test(product.status)) {
      return json({ error: `Product is out of stock: ${product.product}` }, 409);
    }
    const unitPrice = getUnitPrice(product, currency, exchangeRate);
    if (!unitPrice || unitPrice <= 0) {
      return json({ error: `Product has no valid ${currency} price: ${product.product}` }, 409);
    }
    lineItems.push({ unitPrice, qty: r.qty });
    orderItems.push({ product: product.product, qty: r.qty, price: unitPrice });
  }

  // ─── Authoritative totals ─────────────────────────────────────────────────
  const totals = computeOrderTotals(lineItems, currency, exchangeRate);
  const rate = exchangeRate || (await getUsdToCrcRate());
  const totalUsd = currency === 'USD' ? totals.total : Math.round(totals.total / rate);
  const totalCrc = currency === 'CRC' ? totals.total : Math.round(totals.total * rate);

  // ─── Persist draft order ──────────────────────────────────────────────────
  const orderNumber = `${paymentMethod === 'sinpe' ? 'BSCR' : 'BTCR'}-${Date.now().toString(36).toUpperCase()}`;
  const statusText = paymentMethod === 'sinpe' ? 'Pending - Bot SINPE' : 'Pending - Bot Card';

  const { error: insertError } = await supabase.from('orders').insert({
    order_number: orderNumber,
    customer_name: customerName,
    customer_phone: customerPhone || 'N/A',
    customer_email: customerEmail || null,
    shipping_address: shippingAddress || null,
    customer_id_type: customerIdType || null,
    customer_id_number: customerIdNumber || null,
    items: orderItems,
    total_usd: totalUsd,
    total_crc: totalCrc,
    currency,
    payment_method: paymentMethod,
    status: statusText,
    sales_agent: 'pepbot',
  });

  if (insertError) {
    console.error('[bot/checkout-link] Order insert failed:', insertError.message);
    return json({ error: 'Could not create order' }, 500);
  }

  // ─── Generate payment link ────────────────────────────────────────────────
  // SINPE is settled in CRC; mirror catalog behaviour of converting if needed.
  const linkCurrency = paymentMethod === 'sinpe' ? 'CRC' : currency;
  const linkAmount = paymentMethod === 'sinpe' && currency === 'USD'
    ? Math.round(totals.total * rate)
    : totals.total;

  try {
    const { paymentUrl } = await createTilopayPaymentLink({
      amount: linkAmount,
      currency: linkCurrency,
      orderNumber,
      customerName,
      paymentMethod,
      customerIdType,
      customerIdNumber,
      description: `Costa Peptides Order ${orderNumber} (${paymentMethod})`,
    });

    return json({
      ok: true,
      orderNumber,
      paymentUrl,
      currency,
      total: totals.total,
      breakdown: {
        subtotal: totals.subtotal,
        discountPct: totals.discountPct,
        discountAmount: totals.discountAmount,
        shipping: totals.shipping,
        vialCount: totals.vialCount,
      },
    });
  } catch (err) {
    console.error('[bot/checkout-link] Payment link generation failed:', err.message);
    // Order row remains as Pending so it is not silently lost; surface failure.
    return json({ error: 'Could not generate payment link', orderNumber }, 502);
  }
}
