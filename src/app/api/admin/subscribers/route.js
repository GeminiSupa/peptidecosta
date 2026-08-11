import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { leadSubscriberCandidates } from '@/lib/campaignAudience.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const includeLeads = new URL(request.url).searchParams.get('include_leads') === 'true';
    const { data, error } = await supabaseAdmin
      .from('email_subscribers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    let leadCandidates = [];
    if (includeLeads) {
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('catalog_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (leadsError) throw leadsError;
      leadCandidates = leadSubscriberCandidates(leads || [], data || []);
    }

    return NextResponse.json({ subscribers: data, lead_candidates: leadCandidates });
  } catch (err) {
    console.error('Error fetching subscribers:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = await request.json();

    if (body.bulk && Array.isArray(body.subscribers)) {
      // Bulk Insert
      const payload = body.subscribers.map(sub => ({
        email: sub.email,
        first_name: sub.first_name || null,
        last_name: sub.last_name || null,
        tags: sub.tags || [],
        source: sub.source || 'bulk_import',
        status: 'subscribed'
      }));

      // Supabase insert array of objects
      const { data, error } = await supabaseAdmin
        .from('email_subscribers')
        .insert(payload)
        .select();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'One or more emails already exist. Please clean your list and try again.' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ success: true, count: data?.length || 0 });
    } else {
      // Single Insert
      const { email, first_name, last_name, tags, source } = body;
      
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
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
    }
  } catch (err) {
    console.error('Error adding subscriber:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { id, email, first_name, last_name, status, tags } = await request.json();
    
    if (!id || !email) {
      return NextResponse.json({ error: 'ID and Email are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('email_subscribers')
      .update({ 
        email, 
        first_name, 
        last_name, 
        status,
        tags: tags || []
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

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('email_subscribers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting subscriber:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
