import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { CampaignDeliveryError, deliverCampaign } from '@/lib/campaignDelivery';

export const maxDuration = 300;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { campaign_id, is_test_batch, send_winner, winner_variant } = await request.json();
    if (!campaign_id) return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    const result = await deliverCampaign(campaign_id, {
      isTestBatch: Boolean(is_test_batch),
      sendWinner: Boolean(send_winner),
      winnerVariant: winner_variant,
    });
    return NextResponse.json({ success: true, message: `Sent ${result.sent}/${result.targeted} emails`, ...result });
  } catch (error) {
    console.error('[Campaign send]', error);
    return NextResponse.json({ error: error.message || 'Campaign delivery failed' }, { status: error instanceof CampaignDeliveryError ? error.status : 500 });
  }
}
