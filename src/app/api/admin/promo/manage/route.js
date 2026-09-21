import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { parseUnitLimit, validateUnitRange } from '@/lib/promoEligibility.mjs';
import { findLiveDealConflictForPromo, promoDealConflictMessage } from '@/lib/promoStackingSafety.mjs';
import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

export const runtime = 'nodejs';

const BADGE_STYLES = ['code', 'save', 'limited', 'custom'];

/**
 * Create / toggle / delete promo codes, server-side.
 *
 * These operations previously ran in the browser against the anon key, which
 * only worked because promo_codes had a write-open RLS policy - meaning any
 * visitor could create or edit codes, not just admins. Moving the writes here
 * (service role + admin session check) lets that policy be dropped without
 * breaking the panel.
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const action = String(body.action || '');
    const supabase = getSupabaseAdmin();

    if (action === 'create') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!code) return NextResponse.json({ error: 'Code is required' }, { status: 400 });

      const discountPct = Number(body.discount_pct);
      if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 1) {
        return NextResponse.json({ error: 'discount_pct must be a fraction between 0 and 1' }, { status: 400 });
      }

      const hidden = !!body.hidden;
      const minUnits = parseUnitLimit(body.min_units);
      const maxUnits = parseUnitLimit(body.max_units);
      const targetProduct = String(body.target_product || '').trim().slice(0, 500) || null;

      const rangeError = validateUnitRange(minUnits, maxUnits);
      if (rangeError) {
        return NextResponse.json({ error: rangeError }, { status: 400 });
      }

      const conflict = await findLiveDealConflictForPromo(supabase, {
        is_active: true,
        min_units: minUnits,
        target_product: targetProduct,
      });
      if (conflict) {
        return NextResponse.json({ error: promoDealConflictMessage({ code }, conflict.products) }, { status: 409 });
      }

      const { data, error } = await supabase
        .from('promo_codes')
        .insert([{
          code,
          discount_pct: discountPct,
          is_active: true,
          affiliate_id: body.affiliate_id || null,
          valid_until: body.valid_until || null,
          once_per_customer: !!body.once_per_customer,
          hidden,
          min_units: minUnits,
          max_units: maxUnits,
          // A hidden code is private, so it can never carry a public ribbon.
          show_sale_badge: !hidden && !!body.show_sale_badge,
          badge_style: BADGE_STYLES.includes(body.badge_style) ? body.badge_style : 'code',
          badge_text: body.badge_style === 'custom' ? (String(body.badge_text || '').trim() || null) : null,
          badge_text_es: body.badge_style === 'custom' ? (String(body.badge_text_es || '').trim() || null) : null,
          target_product: targetProduct,
          is_flash_sale: !!targetProduct,
        }])
        .select('*, affiliates(name)')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, promo: data });
    }

    if (action === 'toggle') {
      if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      if (body.is_active) {
        const { data: promo, error: readError } = await supabase
          .from('promo_codes')
          .select('id, code, min_units, target_product')
          .eq('id', body.id)
          .single();
        if (readError || !promo) {
          return NextResponse.json({ error: readError?.message || 'Promo code not found' }, { status: 404 });
        }
        const conflict = await findLiveDealConflictForPromo(supabase, { ...promo, is_active: true });
        if (conflict) {
          return NextResponse.json({ error: promoDealConflictMessage(promo, conflict.products) }, { status: 409 });
        }
      }
      const { data, error } = await supabase
        .from('promo_codes')
        .update({ is_active: !!body.is_active })
        .eq('id', body.id)
        .select('id, is_active')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, promo: data });
    }

    if (action === 'delete') {
      if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const binned = await moveToBin(
        { table: 'promo_codes', ids: [body.id], actor: actorFrom(auth.profile) },
        supabase,
      );

      if (!binned.ok) return NextResponse.json({ error: binned.error }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: body.id });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    console.error('[admin/promo/manage]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
