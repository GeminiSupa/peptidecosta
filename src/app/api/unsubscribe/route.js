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
    const { error } = await supabaseAdmin
      .from('email_subscribers')
      .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
      .eq('id', subscriberId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
