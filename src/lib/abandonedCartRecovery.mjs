import { getAbandonedCartConversion } from './leadConversion.mjs';

const ORDER_MATCH_FIELDS = 'id, order_number, status, created_at, customer_email, customer_phone';

export async function findPaidOrderMatchForCart(supabase, cart, { limit = 500 } = {}) {
  if (!supabase || !cart) return { match: null, error: null };

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_MATCH_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { match: null, error };

  const conversion = getAbandonedCartConversion(cart, data || []);
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
