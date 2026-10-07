import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { fetchAllRowsServerSide } from '@/lib/adminTablePaging.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The leads screen reads exactly these three fields off a view row
// (page.js openLeadOutreachComposer and the lead detail panel, plus
// LeadsManager's kanban card and its "Browsing History" column). Asking for
// `*` also shipped id, session_id and product_id, which nothing reads.
const VIEW_COLUMNS = 'contact_value, product_name, created_at';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // A view with no contact_value cannot be matched to a lead, so it is weight
    // with no use — about a quarter of the table. Dropping it is also safer
    // than it looks: every consumer matches on
    // `v.contact_value === lead.contact_value`, so a lead whose own
    // contact_value was missing used to collect every anonymous view there is.
    const { rows, error } = await fetchAllRowsServerSide(supabase, 'product_views', {
      columns: VIEW_COLUMNS,
      notNull: 'contact_value',
    });

    if (error) {
      console.error('[Admin Lead Product Views] Fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch product views' }, { status: 500 });
    }

    return NextResponse.json({ success: true, views: rows });
  } catch (err) {
    console.error('[Admin Lead Product Views] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
