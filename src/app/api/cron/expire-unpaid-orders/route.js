import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import { reportStaleUnpaidOrders } from '@/lib/inventoryRestoreServer';
import { STALE_ORDER_HOURS } from '@/lib/inventoryRestore.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lists unpaid orders still holding stock. Changes nothing.
//
// This began as an auto-expiry that cancelled unpaid orders and returned their
// vials. It does not cancel anything any more, at Omer's instruction: an order
// sitting in "Pending" here is very often still being chased on WhatsApp, or
// was paid by transfer and never marked, and a cron closing those would destroy
// real sales.
//
// It is also NOT registered in vercel.json, so it never fires on its own — call
// it by hand when you want the list. Releasing the stock is done by cancelling
// the order in the admin panel, which restores it through the same code path.

export async function GET(request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdmin();
  const result = await reportStaleUnpaidOrders(supabase);

  return NextResponse.json({
    ok: !result.error,
    windowHours: STALE_ORDER_HOURS,
    ...result,
  }, { status: result.error ? 500 : 200 });
}
