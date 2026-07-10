import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUnsubscribeToken } from '@/lib/marketingTokens';

export async function POST(request) {
  try {
    // Token can arrive two ways:
    //  1. JSON body { token } — from our /unsubscribe page.
    //  2. ?t= query param — RFC 8058 one-click unsubscribe (Gmail/Yahoo POST a
    //     form body here directly from the "Unsubscribe" button in the mail UI).
    let token = new URL(request.url).searchParams.get('t');
    if (!token) {
      try { ({ token } = await request.json()); } catch { /* non-JSON one-click body */ }
    }
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
