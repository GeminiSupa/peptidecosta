import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    const { name, email, subject, message } = await request.json();

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('customer_inquiries')
      .insert({
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        subject: subject?.trim() || null,
        message: message.trim(),
        status: 'New'
      })
      .select()
      .single();

    if (error) {
      console.error('[Contact Form] Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
    }

    console.log(`[Contact Form] New inquiry received from ${email} (ID: ${data.id})`);

    return NextResponse.json({
      success: true,
      message: 'Inquiry submitted successfully',
      id: data.id
    });
  } catch (err) {
    console.error('[Contact Form] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
