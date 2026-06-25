import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await supabase
      .from('email_campaigns')
      .select(`
        *,
        campaign_sends (count),
        campaign_opens (count),
        campaign_clicks (count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ campaigns: data });
  } catch (err) {
    console.error('Error fetching campaigns:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { title, subject_line, design_json, html_content } = await request.json();
    
    if (!title || !subject_line) {
      return NextResponse.json({ error: 'Title and Subject Line are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_campaigns')
      .insert([{ 
        title, 
        subject_line, 
        design_json, 
        html_content,
        status: 'draft'
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error('Error saving campaign:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
