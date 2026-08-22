import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { crWallToIso } from '@/lib/crTime.mjs';
import {
  DEAL_PROTECTED_DB_FIELDS,
  liveDealProductConflicts,
  preserveLiveDealFields,
} from '@/lib/dealProductProtection.mjs';

export const runtime = 'nodejs';

function isExistingProductId(id) {
  const value = String(id || '');
  return value && !value.startsWith('temp-') && !value.startsWith('local-');
}

function isMissingDealsTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (message.includes('deals') && (message.includes('does not exist') || message.includes('schema cache')));
}

function emojiForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('weight') || c.includes('peso')) return '\u2696\uFE0F';
  if (c.includes('sleep') || c.includes('sue\u00F1o')) return '\uD83C\uDF19';
  if (c.includes('sexual')) return '\uD83D\uDD25';
  if (c.includes('skin') || c.includes('piel')) return '\u2728';
  if (c.includes('immune') || c.includes('inmune')) return '\uD83D\uDEE1\uFE0F';
  if (c.includes('supply') || c.includes('suministro')) return '\uD83D\uDCA7';
  if (c.includes('brain') || c.includes('cerebro')) return '\uD83E\uDDE0';
  if (c.includes('muscle') || c.includes('m\u00FAsculo')) return '\uD83D\uDCAA';
  return '\uD83E\uDDEA';
}

function productToDbRow(product, index) {
  const row = {
    product: product.product,
    category: product.category,
    price_usd: product.priceUsd,
    price_crc: product.priceCrc,
    original_price_usd: String(product.originalPriceUsd || '').trim() || null,
    original_price_crc: String(product.originalPriceCrc || '').trim() || null,
    discount: product.discount || null,
    sale_start_time: crWallToIso(product.saleStartTime),
    sale_end_time: crWallToIso(product.saleEndTime),
    status: product.status,
    inventory_count: product.inventoryCount === '' ? null : product.inventoryCount,
    low_stock_threshold: product.lowStockThreshold === '' ? 5 : product.lowStockThreshold,
    coa: product.coa,
    image_url: product.imageUrl,
    description_en: product.descriptionEn || '',
    description_es: product.descriptionEs || '',
    emoji: product.imageUrl ? '' : emojiForCategory(product.category),
    priority: index,
  };

  if (isExistingProductId(product.id)) row.id = product.id;
  return row;
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const { products } = await request.json();
    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'products array is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let rows = products.map(productToDbRow);

    // The Products grid saves every row at once. If it was loaded before a
    // weekly deal launched, its stale copy still contains the old shelf prices
    // and would silently erase the live markdown while saving an unrelated
    // product. Refuse only that stale write; refreshing the tab makes the rows
    // match and ordinary edits remain available.
    const { data: liveDeal, error: dealError } = await supabase
      .from('deals')
      .select('id,product_names')
      .eq('status', 'live')
      .maybeSingle();
    // Product editing predates Weekly Deals. A database that has not installed
    // that feature yet must keep working; once the table exists, every other
    // query error remains real and is surfaced.
    if (dealError && !isMissingDealsTable(dealError)) throw dealError;

    if (liveDeal?.product_names?.length) {
      const { data: currentDealProducts, error: currentError } = await supabase
        .from('products')
        .select(['product', ...DEAL_PROTECTED_DB_FIELDS].join(','))
        .in('product', liveDeal.product_names);
      if (currentError) throw currentError;

      const conflicts = liveDealProductConflicts({
        submittedRows: rows,
        currentRows: currentDealProducts || [],
        productNames: liveDeal.product_names,
      });
      if (conflicts.length > 0) {
        return NextResponse.json({
          error: `Products changed after this tab loaded because a Weekly Deal is live. Refresh before saving. Protected: ${conflicts.join(', ')}`,
          errorCode: 'live_deal_product_conflict',
          products: conflicts,
        }, { status: 409 });
      }
      rows = preserveLiveDealFields(rows, currentDealProducts || [], liveDeal.product_names);
    }

    const activeIds = products.map((product) => product.id).filter(isExistingProductId);

    let deleteQuery = supabase.from('products').delete();
    if (activeIds.length > 0) {
      deleteQuery = deleteQuery.not('id', 'in', `(${activeIds.join(',')})`);
    } else {
      deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    const itemsToUpdate = rows.filter((row) => row.id);
    const itemsToInsert = rows.filter((row) => !row.id);

    if (itemsToUpdate.length > 0) {
      const { error } = await supabase.from('products').upsert(itemsToUpdate);
      if (error) throw error;
    }

    if (itemsToInsert.length > 0) {
      const { error } = await supabase.from('products').insert(itemsToInsert);
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      updated: itemsToUpdate.length,
      inserted: itemsToInsert.length,
      deletedOutsideSubmittedList: true,
    });
  } catch (err) {
    console.error('[admin/products] save failed:', err);
    return NextResponse.json({ error: err.message || 'Failed to save products' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const { hiddenNames } = await request.json();
    if (!Array.isArray(hiddenNames)) {
      return NextResponse.json({ error: 'hiddenNames array is required' }, { status: 400 });
    }

    const names = Array.from(new Set(
      hiddenNames.map((name) => String(name || '').trim()).filter(Boolean)
    ));
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: 'hidden_products', value: { names } });

    if (error) throw error;

    return NextResponse.json({ ok: true, hiddenNames: names });
  } catch (err) {
    console.error('[admin/products] hidden-products update failed:', err);
    return NextResponse.json({ error: err.message || 'Failed to update product visibility' }, { status: 500 });
  }
}
