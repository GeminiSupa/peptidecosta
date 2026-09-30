import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { describeOrderBonuses } from '@/lib/accountBonuses.mjs';
import {
  CustomerSessionError,
  resolveCustomerOrderOwner,
} from '@/lib/customerOrderOwnership.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORDER_FIELDS = 'id, order_number, created_at, currency, promo_code, discount_amount_usd, discount_amount_crc, volume_discount_pct, manual_discount_reason, deal_id';

export async function GET(request) {
  const admin = getSupabaseAdmin();
  let customer;
  try {
    customer = await resolveCustomerOrderOwner(admin, request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof CustomerSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (!customer?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'es';

  const { data: orders, error } = await admin
    .from('orders')
    .select(ORDER_FIELDS)
    .eq('customer_user_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[account/bonuses] orders', error);
    return NextResponse.json({ error: 'Could not load savings' }, { status: 500 });
  }

  const dealIds = [...new Set((orders || []).map((order) => order.deal_id).filter(Boolean))];
  const titles = new Map();
  if (dealIds.length > 0) {
    const { data: deals } = await admin
      .from('deals')
      .select('id, title_en, title_es, kind')
      .in('id', dealIds);
    for (const deal of deals || []) {
      const title = lang === 'en' ? (deal.title_en || deal.title_es) : (deal.title_es || deal.title_en);
      const kind = deal.kind === 'flash'
        ? (lang === 'en' ? 'Flash sale' : 'Venta relámpago')
        : (lang === 'en' ? 'Deal' : 'Oferta');
      titles.set(deal.id, title ? `${kind}: ${title}` : kind);
    }
  }

  const listed = [];
  for (const order of orders || []) {
    const lines = describeOrderBonuses(order, { dealTitle: titles.get(order.deal_id) || '', lang });
    if (lines.length === 0) continue;
    listed.push({
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      lines,
    });
    if (listed.length >= 8) break;
  }

  return NextResponse.json({ orders: listed });
}
