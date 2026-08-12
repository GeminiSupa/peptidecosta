import { NextResponse } from 'next/server';
import { deliverCampaign } from '@/lib/campaignDelivery';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const STALLED_SEND_MINUTES = 15;

export async function GET(request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();

  // A send whose serverless function was killed mid-batch leaves the campaign
  // parked in `sending`: the cron only looks for `scheduled`, and the admin UI
  // refuses to retry with "Campaign is already sending". Hand those back.
  const stalledBefore = new Date(Date.now() - STALLED_SEND_MINUTES * 60 * 1000).toISOString();
  const { data: stalled } = await supabase.from('email_campaigns')
    .select('id')
    .eq('status', 'sending')
    .lt('updated_at', stalledBefore)
    .limit(5);
  const recovered = (stalled || []).map(campaign => campaign.id);
  if (recovered.length) {
    console.warn('[Scheduled campaign] Recovering stalled sends', recovered);
    await supabase.from('email_campaigns')
      .update({ status: 'scheduled', scheduled_for: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', recovered)
      .eq('status', 'sending');
  }

  const { data: campaigns, error } = await supabase.from('email_campaigns')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: 'Unable to load scheduled campaigns' }, { status: 500 });

  const results = [];
  for (const campaign of campaigns || []) {
    try {
      results.push(await deliverCampaign(campaign.id));
    } catch (deliveryError) {
      console.error('[Scheduled campaign]', campaign.id, deliveryError);
      results.push({ campaignId: campaign.id, error: deliveryError.message });
    }
  }
  return NextResponse.json({ success: true, recovered, processed: results.length, results });
}
