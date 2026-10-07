import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase caps one request at 1000 rows, so a full read of product_views is
// twenty-odd round trips. Doing them from the admin's browser is what made the
// portal sit on a spinner for ~16s; doing them here costs one request from the
// browser and the trips happen server-side next to the database.
const PAGE_SIZE = 1000;

// The leads screen reads exactly these three fields off a view row
// (page.js openLeadOutreachComposer / the lead detail panel, and
// LeadsManager's kanban card and "Browsing History" column). Sending `*` also
// shipped id, session_id and product_id, which nothing reads.
const VIEW_COLUMNS = 'contact_value, product_name, created_at';

// A view with no contact_value cannot be matched to a lead, so it is weight
// with no use. It is also actively wrong to send: every consumer matches on
// `v.contact_value === lead.contact_value`, so a lead whose own contact_value
// is missing used to collect every anonymous view in the table.
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const views = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('product_views')
        .select(VIEW_COLUMNS)
        .not('contact_value', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('[Admin Lead Product Views] Fetch error:', error);
        // Partial data still beats an empty Browsing History column, so only
        // fail outright when the very first page failed.
        if (views.length === 0) {
          return NextResponse.json({ error: 'Failed to fetch product views' }, { status: 500 });
        }
        break;
      }

      if (!data || data.length === 0) break;
      views.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return NextResponse.json({ success: true, views });
  } catch (err) {
    console.error('[Admin Lead Product Views] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
