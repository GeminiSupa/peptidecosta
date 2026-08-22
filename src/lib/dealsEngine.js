/**
 * Server-side Deal of the Week operations.
 *
 * Kept out of the route handlers because launch and expiry are two halves of one
 * mechanism: expiry has to undo precisely what launch did, and the admin "End
 * deal now" button has to do exactly what the cron does. One module, one pair of
 * functions, no second copy of the restore logic to fall behind.
 *
 * All price and window arithmetic lives in src/lib/dealOfWeek.mjs, which is pure
 * and unit-tested. This file is only the database side of it.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { orderCountsAsSale, totalNetRevenue } from '@/lib/orderRevenue.mjs';
import {
  weekWindow,
  snapshotBaseline,
  buildMarkdown,
  restorePayload,
  canSafelyRestoreProduct,
  canSafelyRestoreLegacyProduct,
  dealBannerText,
  dealBroadcastDrafts,
  dealCatalogUrl,
  dealSafety,
  toPercent,
} from '@/lib/dealOfWeek.mjs';

const BANNERS_SETTING_ID = 'announcement_banners';

/** The deal currently marked live, or null. Also used to block a second one. */
export async function getLiveDeal(supabase) {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('status', 'live')
    .maybeSingle();

  if (error) throw new Error(`Could not read the live deal: ${error.message}`);
  return data || null;
}

/** Recent deals for the admin screen, newest first. */
export async function listDeals(supabase, limit = 10) {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not list deals: ${error.message}`);
  return data || [];
}

/** Operational truth for the live-deal card: storefront health, delivery and sales. */
export async function getDealOperations(supabase, deal) {
  if (!deal) return null;

  const [{ data: products, error: productsError }, banners] = await Promise.all([
    supabase
      .from('products')
      .select('id,product,price_usd,price_crc,original_price_usd,original_price_crc,discount,sale_start_time,sale_end_time,status,inventory_count')
      .in('product', deal.product_names || []),
    readBanners(supabase),
  ]);
  if (productsError) throw new Error(`Could not verify deal products: ${productsError.message}`);

  const productHealth = (products || []).map((product) => ({
    product: product.product,
    status: product.status,
    inventoryCount: product.inventory_count,
    priceUsd: product.price_usd,
    matchesDeal: deal.applied?.[product.id]
      ? canSafelyRestoreProduct(product, deal.applied[product.id])
      : String(product.discount || '').includes('Deal of the Week'),
  }));
  const banner = banners.find((item) => item?.id === deal.banner_id || item?.dealId === deal.id) || null;

  let broadcast = null;
  let broadcastId = deal.broadcast_id || null;
  let delivery = { delivered: 0, failed: 0, suppressed: 0, processing: 0 };
  // Deals launched before the process migration cannot have a durable
  // broadcast_id. Correlate only inside the deal window and only when the copy
  // names one of its products, so the live card does not invite an accidental
  // duplicate send after the migration is installed.
  if (!broadcastId && deal.product_names?.[0]) {
    const { data: legacyBroadcasts } = await supabase
      .from('scheduled_broadcasts')
      .select('id,status,scheduled_at,created_at,channels')
      .gte('created_at', deal.starts_at)
      .lte('created_at', deal.ends_at)
      .ilike('message', `%${String(deal.product_names[0]).replace(/[%_]/g, '')}%`)
      .order('created_at', { ascending: true })
      .limit(1);
    if (legacyBroadcasts?.[0]) {
      broadcast = legacyBroadcasts[0];
      broadcastId = broadcast.id;
    }
  }

  if (broadcastId) {
    const { data } = await supabase
      .from('scheduled_broadcasts')
      .select('id,status,scheduled_at,created_at,channels')
      .eq('id', broadcastId)
      .maybeSingle();
    broadcast = data || broadcast;

    const { data: events } = await supabase
      .from('marketing_delivery_events')
      .select('status')
      .eq('broadcast_id', broadcastId);
    for (const event of events || []) {
      const status = String(event.status || '').toLowerCase();
      if (status in delivery) delivery[status] += 1;
    }
  }

  let orders = [];
  let attributionReady = true;
  const orderResult = await supabase
    .from('orders')
    .select('status,items,total_usd,total_crc,refunded_amount_usd,refunded_amount_crc')
    .eq('deal_id', deal.id);
  if (orderResult.error) attributionReady = false;
  else orders = orderResult.data || [];

  const sales = orders.filter(orderCountsAsSale);
  const targetNames = new Set((deal.product_names || []).map((name) => String(name).toLowerCase()));
  const units = sales.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => (
    targetNames.has(String(item?.product || item?.name || '').toLowerCase())
      ? lineSum + Number(item?.qty || item?.quantity || 0)
      : lineSum
  ), 0), 0);

  return {
    health: {
      ok: Date.now() <= Date.parse(deal.ends_at)
        && productHealth.length === (deal.product_names || []).length
        && productHealth.every((product) => product.matchesDeal)
        && Boolean(banner?.isActive),
      bannerPresent: Boolean(banner),
      bannerActive: Boolean(banner?.isActive),
      products: productHealth,
    },
    announcement: {
      status: broadcast?.status || deal.announcement_status || 'not_sent',
      broadcast,
      delivery,
    },
    metrics: {
      attributionReady,
      orders: sales.length,
      targetUnits: units,
      revenue: totalNetRevenue(sales),
    },
    drafts: deal.announcement_drafts || dealBroadcastDrafts(deal),
  };
}

async function readBanners(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', BANNERS_SETTING_ID)
    .maybeSingle();

  // PGRST116 is "no row", which just means no banners have ever been saved.
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Could not read banners: ${error.message}`);
  }
  return Array.isArray(data?.value) ? data.value : [];
}

async function writeBanners(supabase, banners) {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ id: BANNERS_SETTING_ID, value: banners }, { onConflict: 'id' });

  if (error) throw new Error(`Could not save banners: ${error.message}`);
}

/**
 * Put the deal's banner into the site-wide ticker.
 *
 * Written into the same announcement_banners list the Announcements panel
 * manages, so it appears in that screen and can be edited or switched off by
 * hand like any other. The `dealId` marker is what lets expiry find and remove
 * it — a deal banner outliving its deal would advertise prices that have
 * already gone back up.
 */
async function upsertDealBanner(supabase, deal) {
  const banners = await readBanners(supabase);
  const bannerId = deal.banner_id || `deal-${deal.id}`;

  const entry = {
    id: bannerId,
    dealId: deal.id,
    textEn: dealBannerText(deal, 'en'),
    textEs: dealBannerText(deal, 'es'),
    href: dealCatalogUrl(deal),
    isActive: true,
  };

  const existing = banners.findIndex((banner) => banner?.id === bannerId);
  const next = existing >= 0
    ? banners.map((banner, i) => (i === existing ? { ...banner, ...entry } : banner))
    : [...banners, entry];

  await writeBanners(supabase, next);
  return bannerId;
}

/** Drop the deal's banner out of the ticker, leaving every other banner alone. */
async function removeDealBanner(supabase, deal) {
  if (!deal?.banner_id && !deal?.id) return;
  const banners = await readBanners(supabase);
  const next = banners.filter(
    (banner) => banner?.id !== deal.banner_id && banner?.dealId !== deal.id
  );
  if (next.length !== banners.length) await writeBanners(supabase, next);
}

/**
 * Resolve the requested product names to rows, rejecting anything that does not
 * match exactly one product.
 *
 * Strict on purpose. A silently dropped name means the announcement promises a
 * discount that was never applied, which the customer discovers at checkout.
 */
async function resolveProducts(supabase, productNames) {
  const wanted = [...new Set((productNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
  if (wanted.length === 0) throw new Error('Pick at least one product for the deal.');

  const { data, error } = await supabase
    .from('products')
    .select('id, product, price_usd, price_crc, original_price_usd, original_price_crc, discount, sale_start_time, sale_end_time, status, inventory_count, low_stock_threshold')
    .in('product', wanted);

  if (error) throw new Error(`Could not read products: ${error.message}`);

  const found = data || [];
  const missing = wanted.filter(
    (name) => !found.some((row) => row.product === name)
  );
  if (missing.length > 0) {
    throw new Error(`No product matches: ${missing.join(', ')}`);
  }

  const priceless = found.filter((row) => !row.price_usd || !String(row.price_usd).trim());
  if (priceless.length > 0) {
    throw new Error(
      `These products have no USD price to discount: ${priceless.map((p) => p.product).join(', ')}`
    );
  }

  return found;
}

/**
 * Launch a deal: snapshot the current prices, mark them down, raise the banner.
 *
 * Announcements are NOT sent from here. The drafts come back for the admin to
 * review and send through the existing Announcements panel, so launching a deal
 * can never mail the whole customer list on a single click.
 */
export async function launchDeal({
  productNames,
  discountPct,
  titleEn,
  titleEs,
  createdBy,
  confirmedHighDiscount = false,
  allowUntrackedStock = false,
  now = new Date(),
}) {
  const supabase = getSupabaseAdmin();

  const pct = Number(discountPct);
  const safety = dealSafety(pct, { confirmedHighDiscount });
  if (!safety.ok) throw new Error(safety.error);

  const alreadyLive = await getLiveDeal(supabase);
  if (alreadyLive) {
    throw new Error(
      `"${alreadyLive.title_en || 'A deal'}" is already live until ${alreadyLive.ends_at}. End it before starting another.`
    );
  }

  const products = await resolveProducts(supabase, productNames);
  const unavailable = products.filter((product) => (
    product.status !== 'In Stock' || Number(product.inventory_count) === 0
  ));
  if (unavailable.length > 0) {
    throw new Error(`These products cannot be promoted because they are not available: ${unavailable.map((p) => p.product).join(', ')}`);
  }
  const untracked = products.filter((product) => product.inventory_count === null);
  if (untracked.length > 0 && !allowUntrackedStock) {
    throw new Error(`Confirm untracked stock before launch: ${untracked.map((p) => p.product).join(', ')}`);
  }
  const window = weekWindow(now);
  const { rate } = await getDatabaseBackedUsdToCrcRate();

  // Snapshot before touching anything. If the markdown loop fails partway, this
  // is the only record of what the prices were.
  const baseline = {};
  const applied = {};
  for (const product of products) {
    baseline[product.id] = snapshotBaseline(product);
    applied[product.id] = buildMarkdown(baseline[product.id], pct, window, rate);
  }

  const dealId = randomUUID();
  const draftDeal = {
    id: dealId,
    title_en: String(titleEn || '').trim() || null,
    title_es: String(titleEs || '').trim() || null,
    product_names: products.map((p) => p.product),
    discount_pct: pct,
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    status: 'live',
  };
  const drafts = dealBroadcastDrafts(draftDeal);
  const insertPayload = {
      id: dealId,
      title_en: String(titleEn || '').trim() || null,
      title_es: String(titleEs || '').trim() || null,
      product_names: products.map((p) => p.product),
      discount_pct: pct,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      status: 'live',
      baseline,
      applied,
      announcement_drafts: drafts,
      announcement_status: 'not_sent',
      created_by: createdBy || null,
  };
  const { data: deal, error: insertError, droppedColumns } = await writeDroppingMissingColumns(
    insertPayload,
    ['applied', 'announcement_drafts', 'announcement_status'],
    (row) => supabase.from('deals').insert([row]).select('*').single(),
  );

  if (insertError) {
    // The unique index on live deals is the backstop for two launches racing.
    throw new Error(`Could not create the deal: ${insertError.message}`);
  }

  // Product updates, banner creation and the durable banner pointer are one
  // recoverable saga. Every ordinary failure rolls prices and banners back;
  // the `applied` snapshot stored before touching products lets the health card
  // identify an interrupted process after a hard platform termination.
  try {
    for (const product of products) {
      const { error } = await supabase.from('products').update(applied[product.id]).eq('id', product.id);
      if (error) throw new Error(`${product.product}: ${error.message}`);
    }

    const dealWithDrafts = { ...deal, ...draftDeal, applied, announcement_drafts: drafts };
    const bannerId = await upsertDealBanner(supabase, dealWithDrafts);
    const bannerUpdate = await supabase.from('deals').update({ banner_id: bannerId }).eq('id', deal.id);
    if (bannerUpdate.error) throw new Error(`Could not save the banner link: ${bannerUpdate.error.message}`);

    return {
      deal: { ...dealWithDrafts, banner_id: bannerId, schemaReady: droppedColumns.length === 0 },
      window,
      exchangeRate: rate,
      safety,
      products: products.map((p) => ({
        product: p.product,
        was: baseline[p.id].price_usd,
        now: applied[p.id].price_usd,
        inventoryCount: p.inventory_count,
      })),
      drafts,
    };
  } catch (err) {
    await removeDealBanner(supabase, { ...deal, id: dealId });
    await restoreProducts(supabase, baseline, applied, { safe: false });
    await supabase
      .from('deals')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', deal.id);
    throw new Error(`Deal launch failed and was rolled back — ${err.message}`);
  }
}

/** Replay every baseline entry back onto its product row. */
async function restoreProducts(supabase, baseline, applied = {}, { safe = true, deal = null } = {}) {
  const restored = [];
  const failures = [];

  for (const [productId, snapshot] of Object.entries(baseline || {})) {
    if (safe) {
      const { data: current, error: readError } = await supabase
        .from('products')
        .select('price_usd,price_crc,original_price_usd,original_price_crc,discount,sale_start_time,sale_end_time')
        .eq('id', productId)
        .maybeSingle();
      if (readError) {
        failures.push(`${snapshot.product}: could not verify current price (${readError.message})`);
        continue;
      }
      const matchesLaunch = applied?.[productId]
        ? canSafelyRestoreProduct(current, applied[productId])
        : canSafelyRestoreLegacyProduct(current, snapshot, deal);
      if (!matchesLaunch) {
        failures.push(`${snapshot.product}: changed manually during the deal; review it in Products`);
        continue;
      }
    }
    const { error } = await supabase
      .from('products')
      .update(restorePayload(snapshot))
      .eq('id', productId);

    if (error) failures.push(`${snapshot.product}: ${error.message}`);
    else restored.push(snapshot.product);
  }

  return { restored, failures };
}

/**
 * End a deal and put the prices back.
 *
 * This is not housekeeping. Once sale_end_time passes, the catalog stops drawing
 * the ribbon and stops striking through the old price, but it never restores
 * price_usd — see the isSaleActive mapping in src/app/catalog/page.js. A deal
 * that is never ended therefore keeps selling at the discount forever, with
 * nothing on the page to reveal it. Both the cron and the admin button land
 * here.
 */
export async function endDeal(deal) {
  const supabase = getSupabaseAdmin();
  if (!deal) throw new Error('No deal to end.');

  const { restored, failures } = await restoreProducts(
    supabase,
    deal.baseline,
    deal.applied,
    { deal },
  );

  // The banner comes down even if a price restore failed — an advertised
  // discount that is no longer being honoured is the worse of the two states.
  await removeDealBanner(supabase, deal);

  if (failures.length > 0) {
    // Left 'live' deliberately so the next cron run retries the failures and
    // the admin screen keeps showing the deal as needing attention.
    throw new Error(`Could not restore ${failures.length} product(s): ${failures.join('; ')}`);
  }

  const { error } = await supabase
    .from('deals')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', deal.id);

  if (error) throw new Error(`Prices restored but the deal row did not close: ${error.message}`);

  return { restored };
}

/** Cron entry point: end any live deal whose Sunday has passed. */
export async function expireDueDeals(now = new Date()) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('status', 'live')
    .lte('ends_at', (now instanceof Date ? now : new Date(now)).toISOString());

  if (error) throw new Error(`Could not look for expired deals: ${error.message}`);

  const results = [];
  for (const deal of data || []) {
    try {
      const { restored } = await endDeal(deal);
      results.push({ id: deal.id, ok: true, restored });
    } catch (err) {
      // Keep going: one stuck deal must not stop the others being restored.
      console.error('[deals/expire]', deal.id, err.message);
      results.push({ id: deal.id, ok: false, error: err.message });
    }
  }

  return results;
}

/**
 * A draft for the admin screen: what a deal WOULD do, without writing anything.
 * Lets the panel show the resolved Sunday and the real before/after prices
 * before the admin commits.
 */
export async function previewDeal({ productNames, discountPct, titleEn, titleEs, confirmedHighDiscount = false, now = new Date() }) {
  const supabase = getSupabaseAdmin();

  const pct = Number(discountPct);
  const safety = dealSafety(pct, { confirmedHighDiscount });
  if (!safety.ok && !safety.needsConfirmation) throw new Error(safety.error);

  const products = await resolveProducts(supabase, productNames);
  const window = weekWindow(now);
  const { rate } = await getDatabaseBackedUsdToCrcRate();

  const draftDeal = {
    title_en: String(titleEn || '').trim() || null,
    title_es: String(titleEs || '').trim() || null,
    product_names: products.map((p) => p.product),
    discount_pct: pct,
  };

  return {
    window,
    exchangeRate: rate,
    percent: toPercent(pct),
    safety,
    liveDeal: await getLiveDeal(supabase),
    products: products.map((product) => {
      const baseline = snapshotBaseline(product);
      const markdown = buildMarkdown(baseline, pct, window, rate);
      return {
        product: product.product,
        wasUsd: baseline.price_usd,
        nowUsd: markdown.price_usd,
        wasCrc: baseline.price_crc,
        nowCrc: markdown.price_crc,
        inventoryCount: product.inventory_count,
        stockTracked: product.inventory_count !== null,
        status: product.status,
      };
    }),
    banner: { en: dealBannerText(draftDeal, 'en'), es: dealBannerText(draftDeal, 'es') },
    drafts: dealBroadcastDrafts(draftDeal),
  };
}
