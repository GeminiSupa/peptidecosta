import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('email_subscribers')
      .insert([{ 
        email, 
        source: 'newsletter_form',
        status: 'subscribed'
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, subscriber: data });
  } catch (err) {
    console.error('Newsletter Signup Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
