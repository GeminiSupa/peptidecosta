import { getAbandonedCartConversion, normalizeEmail, normalizePhone, orderIsPaid } from './leadConversion.mjs';

const ORDER_MATCH_FIELDS = 'id, order_number, status, created_at, customer_email, customer_phone';

export async function findPaidOrderMatchForCart(supabase, cart, { limit = 500 } = {}) {
  if (!supabase || !cart) return { match: null, error: null };

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_MATCH_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { match: null, error };

  const conversion = getAbandonedCartConversion(cart, data || [], { ignoreTiming: true });
  return { match: conversion.order || null, error: null };
}

export async function markAbandonedCartsConverted(supabase, sessionIds) {
  const ids = Array.from(new Set((sessionIds || []).filter(Boolean)));
  if (!supabase || ids.length === 0) return { error: null };

  const patch = {
    status: 'converted',
    is_recovered: true,
    last_updated: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('abandoned_carts')
    .update(patch)
    .in('session_id', ids);

  if (!error) return { error: null };

  const fallback = await supabase
    .from('abandoned_carts')
    .update({
      status: 'converted',
      last_updated: patch.last_updated,
    })
    .in('session_id', ids);

  return { error: fallback.error || null };
}

export async function markActiveAbandonedCartsConvertedForOrder(supabase, order, { limit = 1000 } = {}) {
  if (!supabase || !order || !orderIsPaid(order)) return { matched: 0, error: null };

  const email = normalizeEmail(order?.customer_email || order?.email);
  const phone = normalizePhone(order?.customer_phone || order?.phone);
  if (!email && phone.length < 8) return { matched: 0, error: null };

  const { data, error } = await supabase
    .from('abandoned_carts')
    .select('session_id, created_at, last_updated, customer_email, customer_phone, user_email, user_phone, status')
    .eq('status', 'active')
    .limit(limit);

  if (error) return { matched: 0, error };

  const matchedSessionIds = (data || [])
    .filter((cart) => getAbandonedCartConversion(cart, [order], { ignoreTiming: true }).converted)
    .map((cart) => cart.session_id)
    .filter(Boolean);

  if (matchedSessionIds.length === 0) return { matched: 0, error: null };

  const result = await markAbandonedCartsConverted(supabase, matchedSessionIds);
  return { matched: matchedSessionIds.length, error: result.error };
}
