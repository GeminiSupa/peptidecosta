import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import { expireStaleUnpaidOrders } from '@/lib/inventoryRestoreServer';
import { STALE_ORDER_HOURS } from '@/lib/inventoryRestore.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the stock held by orders that were never paid for.
//
// Inventory is reserved the moment an order is placed. Orders that are
// cancelled or declined give it back through the admin panel, but an order
// nobody ever touches — a card checkout abandoned at the payment step, a
// transfer that never arrives — would hold its vials forever, and the catalog
// would eventually show "Out of Stock" for stock sitting on the shelf.
//
// Hourly rather than daily so an expired order frees its stock within the hour
// of crossing the window, not at some fixed time the following day.

export async function GET(request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdmin();
  const result = await expireStaleUnpaidOrders(supabase);

  return NextResponse.json({
    ok: !result.error,
    windowHours: STALE_ORDER_HOURS,
    ...result,
  }, { status: result.error ? 500 : 200 });
}
