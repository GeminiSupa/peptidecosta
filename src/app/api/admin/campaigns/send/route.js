import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { CampaignDeliveryError, deliverCampaign } from '@/lib/campaignDelivery';

export const maxDuration = 300;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { campaign_id, is_test_batch, send_winner, winner_variant, audience_scope, include_leads, target_tags } = await request.json();
    if (!campaign_id) return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    const result = await deliverCampaign(campaign_id, {
      isTestBatch: Boolean(is_test_batch),
      sendWinner: Boolean(send_winner),
      winnerVariant: winner_variant,
      // Marketing Studio sends the audience it just showed the user so an
      // unsaved "Subscribers + CRM leads" choice cannot be silently dropped.
      audience: audience_scope === undefined && include_leads === undefined && target_tags === undefined
        ? null
        : { scope: audience_scope, includeLeads: include_leads, targetTags: target_tags },
    });
    const counter = `${result.sentTotal}/${result.totalEligible}`;
    const nextBatch = result.nextBatchAt
      ? ` Next batch is scheduled for ${new Date(result.nextBatchAt).toLocaleString()}.`
      : '';
    const remaining = result.remaining > 0
      ? ` ${result.remaining} remaining.${nextBatch}`
      : ' Campaign complete.';
    const bounced = result.bounced > 0
      ? ` ${result.bounced} dead address${result.bounced === 1 ? '' : 'es'} were blocked and removed from future sends.`
      : '';
    return NextResponse.json({
      success: true,
      message: `Sent ${result.sent}/${result.targeted} emails in this batch. Total sent: ${counter}.${remaining}${bounced}`,
      ...result,
    });
  } catch (error) {
    console.error('[Campaign send]', error);
    return NextResponse.json({ error: error.message || 'Campaign delivery failed' }, { status: error instanceof CampaignDeliveryError ? error.status : 500 });
  }
}
