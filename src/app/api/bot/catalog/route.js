// GET /api/bot/catalog
//
// Read-only "knowledge dump" for the external bot to index and reference when
// answering product questions or writing product-related copy. Returns the full
// product catalog plus associated public content (approved reviews, published
// blogs, landing-page copy).
//
// All data returned here is already publicly visible on the website; the
// allowlist (src/lib/botAuth.js) simply keeps the firehose from being scraped
// by arbitrary clients.
//
// Query params:
//   ?format=json (default) | text     text => an LLM-ready plaintext document
//   ?include=products,reviews,blogs,landing   (comma list; default = all)
//
// Response (JSON): { meta, products, reviews, blogs, landing }

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeBot } from '@/lib/botAuth';
import { parsePrice, FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALL_SECTIONS = ['products', 'reviews', 'blogs', 'landing'];

function parseInclude(searchParams) {
  const raw = (searchParams.get('include') || '').trim();
  if (!raw) return new Set(ALL_SECTIONS);
  const requested = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = requested.filter(s => ALL_SECTIONS.includes(s));
  return new Set(valid.length ? valid : ALL_SECTIONS);
}

function shapeProduct(p, exchangeRate) {
  const priceUsd = parsePrice(p.price_usd);
  const priceCrc = Math.round(priceUsd * exchangeRate);
  return {
    id: p.id,
    name: p.product,
    category: p.category,
    status: p.status,
    priceUsd,
    priceCrc,
    originalPriceUsd: p.original_price_usd ? parsePrice(p.original_price_usd) : null,
    discount: p.discount || null,
    coa: p.coa || null,
    imageUrl: p.image_url || null,
    emoji: p.emoji || null,
    descriptionEn: p.description_en || null,
    descriptionES: p.description_es || null,
  };
}

function buildKnowledgeText({ meta, products, reviews, blogs, landing }) {
  const lines = [];
  lines.push('# Peptides Costa Rica — Product Knowledge Base');
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push(`Prices shown in USD ($) and Costa Rican Colón (₡). Approx rate: 1 USD = ${meta.exchangeRate} CRC.`);
  lines.push('');

  if (products) {
    lines.push('## Products');
    for (const p of products) {
      const price = `$${p.priceUsd} / ₡${p.priceCrc.toLocaleString('en-US')}`;
      const disc = p.discount ? `  (discount: ${p.discount})` : '';
      lines.push(`\n### ${p.name} — ${p.category} [${p.status}]`);
      lines.push(`Price: ${price}${disc}`);
      if (p.coa) lines.push(`Certificate of Analysis: ${p.coa}`);
      if (p.descriptionEn) lines.push(`EN: ${p.descriptionEn}`);
      if (p.descriptionES) lines.push(`ES: ${p.descriptionES}`);
    }
    lines.push('');
  }

  if (blogs) {
    lines.push('## Articles');
    for (const b of blogs) {
      lines.push(`\n### ${b.titleEn || b.titleES}`);
      if (b.excerptEn) lines.push(b.excerptEn);
      if (b.contentEn) lines.push(b.contentEn);
    }
    lines.push('');
  }

  if (reviews) {
    lines.push('## Customer Reviews');
    for (const r of reviews) {
      const comment = r.comment ? ` "${r.comment}"` : '';
      lines.push(`- ${r.productName}: ${r.rating}/5${comment} — ${r.customerName}`);
    }
    lines.push('');
  }

  if (landing) {
    lines.push('## Site Copy');
    for (const [k, v] of Object.entries(landing)) {
      if (typeof v === 'string' && v.trim()) lines.push(`${k}: ${v}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function GET(req) {
  const auth = authorizeBot(req);
  if (!auth.configured) {
    return NextResponse.json({ error: 'Bot endpoint is not configured' }, { status: 503 });
  }
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const include = parseInclude(searchParams);
  const format = (searchParams.get('format') || 'json').toLowerCase();

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    console.error('[bot/catalog] Supabase admin init failed:', err.message);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const exchangeRateResult = await getDatabaseBackedUsdToCrcRate();
  const exchangeRate = exchangeRateResult.rate || FALLBACK_EXCHANGE_RATE;

  // Run only the requested section queries, in parallel.
  const tasks = {};
  if (include.has('products')) {
    tasks.products = supabase
      .from('products')
      .select('id, product, category, price_usd, price_crc, original_price_usd, discount, status, coa, image_url, emoji, description_en, description_es, priority')
      .order('priority', { ascending: false })
      .order('product', { ascending: true });
  }
  if (include.has('reviews')) {
    tasks.reviews = supabase
      .from('product_reviews')
      .select('product_name, customer_name, rating, comment, created_at')
      .eq('status', 'Approved')
      .order('created_at', { ascending: false });
  }
  if (include.has('blogs')) {
    tasks.blogs = supabase
      .from('blogs')
      .select('slug, title_en, title_es, excerpt_en, excerpt_es, content_en, content_es, image_url, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });
  }
  if (include.has('landing')) {
    tasks.landing = supabase
      .from('site_settings')
      .select('value')
      .eq('id', 'landing_page')
      .maybeSingle();
  }

  const keys = Object.keys(tasks);
  const settled = await Promise.all(keys.map(k => tasks[k]));
  const results = {};
  keys.forEach((k, i) => { results[k] = settled[i]; });

  // Surface any hard DB error.
  for (const k of keys) {
    if (results[k]?.error) {
      console.error(`[bot/catalog] ${k} query failed:`, results[k].error.message);
      return NextResponse.json({ error: `Could not load ${k}` }, { status: 502 });
    }
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      exchangeRate,
      exchangeRateUpdatedAt: exchangeRateResult.updatedAt,
      sections: keys,
    },
  };

  if (include.has('products')) {
    const rows = results.products.data || [];
    let shaped = rows.map(p => shapeProduct(p, exchangeRate));
    // Exclude products the admin has hidden from the public catalog (hidden, not deleted)
    try {
      const { data: hp } = await supabase.from('site_settings').select('value').eq('id', 'hidden_products').maybeSingle();
      const hiddenNames = Array.isArray(hp?.value?.names) ? hp.value.names : [];
      if (hiddenNames.length) shaped = shaped.filter(p => !hiddenNames.includes(p.name));
    } catch (e) {
      console.warn('[bot/catalog] could not load hidden_products list:', e.message);
    }
    payload.products = shaped;
    payload.meta.productCount = payload.products.length;
  }
  if (include.has('reviews')) {
    payload.reviews = (results.reviews.data || []).map(r => ({
      productName: r.product_name,
      customerName: r.customer_name,
      rating: r.rating,
      comment: r.comment || null,
      createdAt: r.created_at,
    }));
  }
  if (include.has('blogs')) {
    payload.blogs = (results.blogs.data || []).map(b => ({
      slug: b.slug,
      titleEn: b.title_en,
      titleES: b.title_es,
      excerptEn: b.excerpt_en || null,
      excerptES: b.excerpt_es || null,
      contentEn: b.content_en || null,
      contentES: b.content_es || null,
      imageUrl: b.image_url || null,
      createdAt: b.created_at,
    }));
  }
  if (include.has('landing')) {
    payload.landing = results.landing?.data?.value || null;
  }

  if (format === 'text') {
    const text = buildKnowledgeText(payload);
    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json(payload);
}
