'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCustomerSupabase } from '@/lib/customerSupabase';

// Only the columns the dashboard renders. The order row also carries agent
// attribution, commission figures and internal notes, and none of that belongs
// in a customer-facing payload even though RLS would happily return it.
const ORDER_COLUMNS = [
  'id',
  'order_number',
  'created_at',
  'status',
  'tracking_number',
  'items',
  'total_usd',
  'total_crc',
  'currency',
  'payment_method',
  'shipping_address',
  'customer_name',
  'customer_phone',
].join(',');

/**
 * The signed-in customer's orders.
 *
 * No user id is passed and none is needed: the request carries the customer's
 * own JWT, and the orders_customer_read_own policy restricts the result to
 * rows where customer_user_id = auth.uid(). There is no filter here that a
 * tampered client could widen.
 */
export function useCustomerOrders({ enabled = true, limit = null } = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const supabase = getCustomerSupabase();
    if (!supabase) {
      setLoading(false);
      setError(true);
      return;
    }

    setLoading(true);
    let query = supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .order('created_at', { ascending: false });

    if (limit) query = query.limit(limit);

    const { data, error: queryError } = await query;

    if (queryError) {
      console.error('[account] order fetch failed:', queryError.message);
      setError(true);
      setOrders([]);
    } else {
      setError(false);
      setOrders(data || []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load();
  }, [enabled, load]);

  return { orders, loading, error, reload: load };
}
