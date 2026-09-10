import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getLiveDeal, listDeals, getDealOperations, previewDeal, launchDeal, endDeal, replaceLiveDeal, getDealDraft, saveDealDraft } from '@/lib/dealsEngine';

export const runtime = 'nodejs';

/** Current state for the Deal of the Week screen. */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const [live, recent, draft] = await Promise.all([
      getLiveDeal(supabase),
      listDeals(supabase),
      getDealDraft(supabase),
    ]);
    const operations = live ? await getDealOperations(supabase, live) : null;
    return NextResponse.json({
      live: live && operations ? { ...live, ...operations } : live,
      recent,
      draft,
    });
  } catch (err) {
    console.error('[admin/deals GET]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * save_draft → remember the half-built setup so any device can pick it up
 * preview → what the deal would do, writing nothing
 * launch  → mark the prices down and raise the banner (does NOT send announcements)
 * replace → put the running deal's prices back, then launch this one in its place
 * end     → restore the prices and take the banner down
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'preview') {
      return NextResponse.json(await previewDeal({
        productNames: body.product_names,
        discountPct: body.discount_pct,
        titleEn: body.title_en,
        titleEs: body.title_es,
        confirmedHighDiscount: body.confirm_high_discount === true,
      }));
    }

    if (action === 'launch') {
      const result = await launchDeal({
        productNames: body.product_names,
        discountPct: body.discount_pct,
        titleEn: body.title_en,
        titleEs: body.title_es,
        createdBy: auth.user?.id || null,
        confirmedHighDiscount: body.confirm_high_discount === true,
        allowUntrackedStock: body.allow_untracked_stock === true,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    // Setup in progress. Saved on a debounce as the admin works, so it belongs
    // to the business rather than to the browser tab it was started in.
    if (action === 'save_draft') {
      const draft = await saveDealDraft(getSupabaseAdmin(), body.draft ?? null);
      return NextResponse.json({ ok: true, draft });
    }

    if (action === 'replace') {
      const result = await replaceLiveDeal({
        productNames: body.product_names,
        discountPct: body.discount_pct,
        titleEn: body.title_en,
        titleEs: body.title_es,
        createdBy: auth.user?.id || null,
        confirmedHighDiscount: body.confirm_high_discount === true,
        allowUntrackedStock: body.allow_untracked_stock === true,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'end') {
      const supabase = getSupabaseAdmin();
      // Ending is always "end whatever is live" rather than end-by-id, so the
      // button cannot restore a stale baseline over prices someone has since
      // edited by hand in the Products tab.
      const live = await getLiveDeal(supabase);
      if (!live) return NextResponse.json({ error: 'No deal is currently live.' }, { status: 400 });

      const { restored } = await endDeal(live);
      return NextResponse.json({ ok: true, restored });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    console.error('[admin/deals POST]', err);
    // These messages are written for the admin running the deal — "no product
    // matches X", "a deal is already live until Y" — so they are surfaced
    // rather than replaced with a generic failure.
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 400 });
  }
}
