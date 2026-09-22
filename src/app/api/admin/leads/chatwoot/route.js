import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  loadLeadChatwootConversations,
  sendLeadChatwootReply,
} from '@/lib/chatwootConversations.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

async function loadLead(leadId) {
  const { data, error } = await getSupabaseAdmin()
    .from('catalog_leads')
    .select('id, chatwoot_contact_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET /api/admin/leads/chatwoot?leadId=... — the lead's conversations with
// their full message history. Covered by the "leads" permission like the rest
// of /api/admin/leads.
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const leadId = clean(new URL(request.url).searchParams.get('leadId'));
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });

  try {
    const lead = await loadLead(leadId);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const result = await loadLeadChatwootConversations({ lead });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Chatwoot tab] Could not load conversations:', error.message);
    return NextResponse.json(
      { error: `Could not load Chatwoot conversations: ${error.message}` },
      { status: 502 },
    );
  }
}

// POST /api/admin/leads/chatwoot { leadId, conversationId, content } — sends
// an agent reply into one of the lead's conversations.
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const leadId = clean(body?.leadId);
  const conversationId = clean(body?.conversationId, 40);
  if (!leadId || !conversationId) {
    return NextResponse.json({ error: 'leadId and conversationId are required' }, { status: 400 });
  }

  try {
    const lead = await loadLead(leadId);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const message = await sendLeadChatwootReply({ lead, conversationId, content: body?.content });
    return NextResponse.json({ message });
  } catch (error) {
    const status = [400, 404, 503].includes(error.status) ? error.status : 502;
    if (status === 502) console.error('[Chatwoot tab] Could not send reply:', error.message);
    return NextResponse.json({ error: error.message || 'Could not send the reply' }, { status });
  }
}
