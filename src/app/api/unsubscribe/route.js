import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUnsubscribeToken } from '@/lib/marketingTokens';

export async function POST(request) {
  try {
    const { token } = await request.json();
    const subscriberId = verifyUnsubscribeToken(token);

    if (!subscriberId) {
      return NextResponse.json({ error: 'Invalid unsubscribe link' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: subscriber, error: lookupError } = await supabaseAdmin
      .from('email_subscribers')
      .select('email')
      .eq('id', subscriberId)
      .single();
    if (lookupError) throw lookupError;

    const { error } = await supabaseAdmin
      .from('email_subscribers')
      .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
      .eq('id', subscriberId);

    if (error) throw error;

    const { error: suppressionError } = await supabaseAdmin
      .from('marketing_suppressions')
      .upsert({
        identity: subscriber.email.trim().toLowerCase(),
        channel: 'email',
        reason: 'unsubscribe',
        source: 'unsubscribe_link',
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'identity,channel' });
    if (suppressionError) console.error('Could not add global email suppression:', suppressionError);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
