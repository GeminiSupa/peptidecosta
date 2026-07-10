import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';

// Shared "read" state for the Messenger inbox so unread status is the same for
// the whole team (instead of living only in one admin's browser). Stored as a
// single JSON map { conversationId: lastSeenISO } in site_settings — no new table.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const SETTING_ID = 'messenger_seen';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  if (!supabase) return NextResponse.json({ seen: {} });
  try {
    const { data } = await supabase.from('site_settings').select('value').eq('id', SETTING_ID).single();
    return NextResponse.json({ seen: data?.value || {} });
  } catch {
    return NextResponse.json({ seen: {} });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  if (!supabase) return NextResponse.json({ success: false }, { status: 500 });
  try {
    const { conversationId, at } = await request.json();
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }
    const { data } = await supabase.from('site_settings').select('value').eq('id', SETTING_ID).single();
    const map = (data && data.value) || {};
    const stamp = at || new Date().toISOString();
    // Keep the latest seen time only.
    if (!map[conversationId] || new Date(stamp) > new Date(map[conversationId])) {
      map[conversationId] = stamp;
    }
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: SETTING_ID, value: map }, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
