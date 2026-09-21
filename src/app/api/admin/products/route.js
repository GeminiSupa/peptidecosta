import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  liveDealProductConflicts,
  preserveLiveDealFields,
} from '@/lib/dealProductProtection.mjs';
import {
  checkSingleSave,
  isExistingProductId,
  planBulkSave,
  productFingerprint,
  productToDbRow,
} from '@/lib/productSaveGuard.mjs';

import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

export const runtime = 'nodejs';

const REFRESH_HINT = 'Refresh the page, then make your change again.';

function isMissingDealsTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (message.includes('deals') && (message.includes('does not exist') || message.includes('schema cache')));
}

const normalizeName = (value) => String(value || '').trim().toLowerCase();

/**
 * Reviews are stored against the product's name, so a rename leaves them on the
 * old name and they stop showing. Moved only when the person renaming asked for
 * it, and only from this product's own previous name to its new one.
 *
 * @returns {Promise<number>} how many reviews moved
 */
async function moveReviewsToNewName(supabase, fromName, toName) {
  if (!fromName || !toName || fromName === toName) return 0;
  const { data, error } = await supabase
    .from('product_reviews')
    .update({ product_name: toName })
    .eq('product_name', fromName)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * The live Weekly Deal, or null.
 *
 * Product editing predates Weekly Deals. A database that has not installed that
 * feature yet must keep working; once the table exists, every other query error
 * remains real and is surfaced.
 */
async function loadLiveDeal(supabase) {
  const { data, error } = await supabase
    .from('deals')
    .select('id,product_names')
    .eq('status', 'live')
    .maybeSingle();
  if (error && !isMissingDealsTable(error)) throw error;
  return data?.product_names?.length ? data : null;
}

function dealConflictResponse(conflicts) {
  return NextResponse.json({
    error: `Products changed after this tab loaded because a Weekly Deal is live. Refresh before saving. Protected: ${conflicts.join(', ')}`,
    errorCode: 'live_deal_product_conflict',
    products: conflicts,
  }, { status: 409 });
}

/**
 * Save Changes: the whole grid, written only where that cannot destroy someone
 * else's work. See planBulkSave in productSaveGuard.mjs for the rules.
 */
export async function PUT(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const { products, loadedIds, baseline, moveReviewsForIds } = await request.json();
    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'products array is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const submittedRows = products.map((product, index) => productToDbRow(product, index));

    const { data: currentRows, error: currentError } = await supabase.from('products').select('*');
    if (currentError) throw currentError;

    const plan = planBulkSave({ submittedRows, currentRows: currentRows || [], loadedIds, baseline });

    if (plan.refused) {
      return NextResponse.json({
        error: `This page was opened before an update to how products save. ${REFRESH_HINT}`,
        errorCode: 'stale_client',
      }, { status: 409 });
    }
    if (plan.conflicts.length > 0) {
      return NextResponse.json({
        error: `Someone else changed these products after this page loaded, so nothing was saved: ${plan.conflicts.join(', ')}. ${REFRESH_HINT}`,
        errorCode: 'changed_elsewhere',
        products: plan.conflicts,
      }, { status: 409 });
    }

    let toUpdate = plan.toUpdate;
    let toInsert = plan.toInsert;

    // A bulk save must not overwrite a price currently owned by a deal, nor
    // delete a product the deal is running on. Checked only against rows this
    // save actually writes or deletes; a skipped row is not being written.
    const liveDeal = await loadLiveDeal(supabase);
    if (liveDeal) {
      const deletedNames = new Set(
        (currentRows || []).filter((row) => plan.toDelete.includes(String(row.id))).map((row) => normalizeName(row.product)),
      );
      const deletedDealProducts = liveDeal.product_names.filter((name) => deletedNames.has(normalizeName(name)));
      if (deletedDealProducts.length > 0) return dealConflictResponse(deletedDealProducts);

      const written = [...toUpdate, ...toInsert];
      const writtenNames = new Set(written.map((row) => normalizeName(row.product)));
      const dealNames = liveDeal.product_names.filter((name) => writtenNames.has(normalizeName(name)));
      if (dealNames.length > 0) {
        const dealKeys = new Set(dealNames.map(normalizeName));
        const currentDealProducts = (currentRows || []).filter((row) => dealKeys.has(normalizeName(row.product)));
        const conflicts = liveDealProductConflicts({
          submittedRows: written,
          currentRows: currentDealProducts,
          productNames: dealNames,
        });
        if (conflicts.length > 0) return dealConflictResponse(conflicts);
        toUpdate = preserveLiveDealFields(toUpdate, currentDealProducts, dealNames);
        toInsert = preserveLiveDealFields(toInsert, currentDealProducts, dealNames);
      }
    }

    if (plan.toDelete.length > 0) {
      // A row dropped from the products sheet is a delete like any other —
      // and the easiest one to do by accident, which is exactly why it goes
      // to the Bin rather than straight out of the table.
      const binned = await moveToBin(
        { table: 'products', ids: plan.toDelete, actor: actorFrom(auth.profile), reason: 'Removed from the products sheet' },
        supabase,
      );
      if (!binned.ok) throw new Error(binned.error);
    }

    if (toUpdate.length > 0) {
      const { error } = await supabase.from('products').upsert(toUpdate);
      if (error) throw error;
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('products').insert(toInsert);
      if (error) throw error;
    }

    // Only rows this save actually wrote, and only their own old -> new name,
    // read from the database rather than from what the page claims.
    const moveIds = new Set((Array.isArray(moveReviewsForIds) ? moveReviewsForIds : []).map(String));
    const currentById = new Map((currentRows || []).map((row) => [String(row.id), row]));
    let movedReviews = 0;
    for (const row of toUpdate) {
      if (!moveIds.has(String(row.id))) continue;
      const before = currentById.get(String(row.id));
      movedReviews += await moveReviewsToNewName(supabase, before?.product, row.product);
    }

    return NextResponse.json({
      ok: true,
      updated: toUpdate.length,
      inserted: toInsert.length,
      deleted: plan.toDelete.length,
      skipped: plan.skipped,
      movedReviews,
    });
  } catch (err) {
    console.error('[admin/products] save failed:', err);
    return NextResponse.json({ error: err.message || 'Failed to save products' }, { status: 500 });
  }
}

/**
 * "Save product" in the drawer: this one product, nothing else.
 *
 * Refused when the product has changed since the page loaded, so an old tab
 * cannot put its copy back over a teammate's edit.
 */
async function saveOneProduct(supabase, { product, baseline, moveReviews }) {
  const id = product?.id;
  if (!isExistingProductId(id)) {
    return NextResponse.json({ error: 'This product has not been saved yet. Use Save Changes to add it.' }, { status: 400 });
  }

  const { data: currentRow, error: readError } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (readError) throw readError;

  const check = checkSingleSave({ currentRow, baselineFingerprint: baseline });
  if (!check.ok) {
    const error = check.reason === 'deleted'
      ? `Someone else deleted this product after this page loaded. ${REFRESH_HINT}`
      : check.reason === 'no_baseline'
        ? `This page was opened before an update to how products save. ${REFRESH_HINT}`
        : `Someone else changed this product after this page loaded, so it was not saved. ${REFRESH_HINT}`;
    return NextResponse.json({ error, errorCode: check.reason }, { status: 409 });
  }

  // Its own place in the list, not the index of a grid this request never sent.
  let row = productToDbRow(product, currentRow.priority ?? 0);
  delete row.id;

  const liveDeal = await loadLiveDeal(supabase);
  if (liveDeal) {
    const keys = new Set([normalizeName(currentRow.product), normalizeName(row.product)]);
    const dealNames = liveDeal.product_names.filter((name) => keys.has(normalizeName(name)));
    if (dealNames.length > 0) {
      const conflicts = liveDealProductConflicts({ submittedRows: [row], currentRows: [currentRow], productNames: dealNames });
      if (conflicts.length > 0) return dealConflictResponse(conflicts);
      [row] = preserveLiveDealFields([row], [currentRow], dealNames);
    }
  }

  const { data: saved, error: writeError } = await supabase
    .from('products')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (writeError) throw writeError;

  const movedReviews = moveReviews === true
    ? await moveReviewsToNewName(supabase, currentRow.product, saved.product)
    : 0;

  return NextResponse.json({ ok: true, product: saved, fingerprint: productFingerprint(saved), movedReviews });
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    if (body?.product && typeof body.product === 'object') {
      return await saveOneProduct(supabase, body);
    }

    const { hiddenNames } = body || {};
    if (!Array.isArray(hiddenNames)) {
      return NextResponse.json({ error: 'hiddenNames array is required' }, { status: 400 });
    }

    const names = Array.from(new Set(
      hiddenNames.map((name) => String(name || '').trim()).filter(Boolean)
    ));
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: 'hidden_products', value: { names } });

    if (error) throw error;

    return NextResponse.json({ ok: true, hiddenNames: names });
  } catch (err) {
    console.error('[admin/products] update failed:', err);
    return NextResponse.json({ error: err.message || 'Failed to update products' }, { status: 500 });
  }
}
