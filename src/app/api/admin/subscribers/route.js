import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await supabase
      .from('email_subscribers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ subscribers: data });
  } catch (err) {
    console.error('Error fetching subscribers:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { email, first_name, last_name, tags, source } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_subscribers')
      .insert([{ 
        email, 
        first_name, 
        last_name, 
        tags: tags || [],
        source: source || 'manual',
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

    return NextResponse.json({ subscriber: data });
  } catch (err) {
    console.error('Error adding subscriber:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { id, email, first_name, last_name, status } = await request.json();
    
    if (!id || !email) {
      return NextResponse.json({ error: 'ID and Email are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_subscribers')
      .update({ 
        email, 
        first_name, 
        last_name, 
        status
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ subscriber: data });
  } catch (err) {
    console.error('Error updating subscriber:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
