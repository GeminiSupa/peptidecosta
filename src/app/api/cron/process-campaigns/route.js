import { NextResponse } from 'next/server';
import { deliverCampaign } from '@/lib/campaignDelivery';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
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
  return NextResponse.json({ success: true, processed: results.length, results });
}
